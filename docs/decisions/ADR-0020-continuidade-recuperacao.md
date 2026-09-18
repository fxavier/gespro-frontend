# ADR-0020 — Continuidade de serviço e recuperação de desastre

- **Estado**: Proposto
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Relacionados**: [ADR-0005-b](./ADR-0005-infraestrutura-deploy.md), [ADR-0012](./ADR-0012-alojamento-keycloak.md), [ADR-0019](./ADR-0019-telemetria-slo.md), [ADR-0022](./ADR-0022-provisionamento-ambientes.md)
- **Skills**: `engineering:architecture`, `engineering:incident-response`

## Contexto
> **Revisto pelo [ADR-0026](./ADR-0026-adiamento-fornecedor-infraestrutura.md)** — a escolha de
> fornecedor de infraestrutura foi adiada. O que este ADR nomeia como serviço da AWS deve ler-se como
> **capacidade requerida**; a AWS é uma implementação candidata, não o plano. O ambiente de referência
> é local (Docker Compose).


O módulo Terraform da base de dados activa cópias de segurança automáticas. É tudo o que existe.

Não há objectivo de ponto de recuperação, não há objectivo de tempo de recuperação, não há manual de
restauro, e **nunca se restaurou uma cópia**. Uma cópia de segurança que nunca foi restaurada é uma
hipótese, não uma garantia — e a primeira tentativa de restauro não deve acontecer durante um
incidente, com um cliente a perguntar quando volta o serviço.

Um ERP é um caso particular. Não guarda conteúdo recriável: guarda **documentos fiscais com numeração
sequencial legalmente obrigatória**, lançamentos contabilísticos e folhas de remuneração. Perder uma
hora de dados não significa «alguns registos perdidos» — significa facturas emitidas que
desapareceram e uma série fiscal com lacuna, que é precisamente o que o `proximoNumeroSerie` foi
construído para nunca permitir.

A adopção do Keycloak (ADR-0010) acrescenta um segundo repositório com estado. Uma cópia da base de
dados do ERP sem a base de dados do Keycloak restaura os dados e deixa todos os utilizadores sem
poder entrar.

## Decisão

**Objectivos explícitos, restauro por recuperação a um ponto no tempo, e ensaio trimestral obrigatório.**

### 1. Objectivos

| Métrica | Objectivo | Justificação |
|---|---|---|
| **RPO** — perda máxima de dados | **5 minutos** | Recuperação a um ponto no tempo do RDS, com registos de transacções contínuos. Documentos fiscais não toleram perda material |
| **RTO** — tempo máximo de reposição | **4 horas** | Restauro de instância mais reposição da aplicação. Compatível com o SLO de 99,5 % do ADR-0019 |
| **RTO em falha de zona** | **30 minutos** | Failover automático de RDS multi-AZ mais reagendamento das tarefas ECS |

Aplicam-se **igualmente à base de dados do Keycloak**. São um sistema, não dois.

> **Estes objectivos passam a ser requisito de selecção do fornecedor** (ADR-0026 §5). Um fornecedor
> que não ofereça Postgres gerido com recuperação a um ponto no tempo obriga a auto-alojar a base de
> dados com arquivo de WAL — o que é possível, mas transfere a operação para nós e tem de entrar na
> comparação de custo total.

### 2. Mecanismos

- **Recuperação a um ponto no tempo** activa na instância RDS, com retenção de **35 dias** (o máximo)
  em `prod` e **7** em `dev`. Cobre tanto a falha de infraestrutura como o erro humano — que é o
  cenário mais provável dos dois.

  > O código actual não cumpre nenhum dos dois valores: `infra/live/dev/main.tf` tem
  > `backup_retention_days = 3` e `infra/live/prod/main.tf` tem `7`. **Ambos** têm de ser corrigidos
  > — a task de infraestrutura cobre os dois, não só `prod`.
- **Instantâneos manuais** antes de cada migração de schema e antes de cada actualização do Keycloak,
  criados pelo procedimento de *deploy* e retidos 90 dias.
- **Multi-AZ** em `prod` para a instância RDS e para o serviço ECS do Keycloak. Duplica o custo da
  base de dados e é o que separa 30 minutos de 4 horas numa falha de zona.
- **Objectos do S3** com versionamento activo e replicação para uma segunda região. O ADR-0017 já
  estabelece que a remoção passa a ser efectiva; o versionamento é o que impede que um apagamento
  indevido seja irreversível.
- **Configuração do realm do Keycloak** versionada em repositório (ADR-0012), o que a torna
  recuperável independentemente da base de dados.

### 3. Ensaio trimestral, obrigatório

**O primeiro ensaio é contra o ambiente local** (ADR-0026), com a base de dados carregada pelo
gerador de volume do ADR-0018. Prova que o *procedimento* funciona, apanha os passos em falta e
cronometra-o — tudo sem consequências e sem custo.

O ensaio contra produção fica para quando houver produção, e é esse que valida o **RTO real**: a
dimensão dos dados, a classe da instância e a rede são diferentes, e o tempo também será. Até lá, o
número medido localmente é uma **estimativa optimista**, e deve ser apresentado como tal.

Depois disso, uma vez por trimestre, alinhado com a janela de actualização do Keycloak:

1. Restaurar a cópia mais recente do ambiente em causa para uma instância isolada, descartável.
2. Apontar-lhe uma instância da aplicação, num ambiente separado.
3. Autenticar, emitir uma factura, correr um balancete, confirmar que a numeração de série continua
   coerente.
4. Cronometrar tudo e registar em `docs/runbooks/ensaio-restauro.md`.
5. Destruir o ambiente.

**Se o tempo medido exceder o RTO, o RTO é ajustado ou o procedimento é corrigido** — mas não se
finge que o objectivo está cumprido. Um RTO que nunca foi cronometrado é ficção.

### 4. Cenários cobertos pelo manual

| Cenário | Resposta |
|---|---|
| Instância RDS perdida | Restauro a um ponto no tempo para nova instância; reapontar aplicação |
| Zona de disponibilidade em baixa | Failover automático multi-AZ; verificar e comunicar |
| Migração destrutiva aplicada por engano | Restauro para o instante anterior ao instantâneo pré-migração |
| Base de dados do Keycloak perdida | Restauro; se irrecuperável, reimportar realm e reconciliar utilizadores por `keycloakSub` |
| Apagamento indevido de objecto no S3 | Reposição da versão anterior |
| Região inteira em baixa | **Não coberto.** Ver Consequências |

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **PITR + multi-AZ + ensaio trimestral** ✅ | RPO de minutos sem infraestrutura adicional; cobre erro humano e falha de zona; ensaio converte hipótese em garantia | Multi-AZ duplica o custo da base de dados; ensaio é trabalho recorrente |
| Só cópias diárias automáticas | Barato; é o que já existe | RPO de até 24 horas. Um dia de facturação perdido é inaceitável num ERP |
| Réplica noutra região, pronta a assumir | RTO de minutos mesmo em falha regional | Custo elevado, para um risco que não corresponde ao perfil actual: um único mercado, sem obrigação regulatória de continuidade regional |
| Exportação lógica periódica para o S3 | Independente do fornecedor; útil para migrar | Complementar, não substituto — RPO igual à periodicidade e restauro lento. Fica como evolução |
| Confiar nas cópias sem nunca ensaiar | Zero esforço | É a situação actual. O primeiro restauro seria durante um incidente, sem procedimento e sem tempo estimado |

## Consequências

- **Custo aumenta — quando houver produção.** Alta disponibilidade duplica a base de dados; a
  retenção longa e a replicação de objectos acrescentam armazenamento. É o preço de um RPO de 5
  minutos, e é um dos números que entra na comparação entre fornecedores (ADR-0026 §5).
- **O procedimento de *deploy* passa a criar um instantâneo** antes de aplicar migrações. Torna cada
  publicação ligeiramente mais lenta e torna cada migração reversível, o que é a troca certa.
- **Falha de região não está coberta**, por decisão consciente. O produto serve um mercado único e não
  tem obrigação regulatória de continuidade multi-região. Se surgir um cliente que a exija, é um ADR
  novo e um custo novo — não uma promessa que se faz agora sem infraestrutura que a sustente.
- **O ensaio trimestral é um compromisso de calendário**, não uma boa intenção. Alinhar com a janela
  de actualização do Keycloak (ADR-0012) faz com que sejam **quatro janelas por ano**, não oito.
- **`docs/runbooks/` ganha três documentos**: restauro da base de dados, restauro do Keycloak, e
  registo de ensaios. Ligam-se aos alertas de paginação do ADR-0019.
- **O primeiro ensaio é o mais valioso e o mais provável de correr mal.** Faz-se localmente, na
  fase 1, quando falhar não custa nada. O ensaio contra produção — o que valida o RTO a sério — faz
  parte da fase de provisionamento, adiada pelo ADR-0026.
