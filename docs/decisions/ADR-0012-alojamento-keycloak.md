# ADR-0012 — Alojamento e operação do Keycloak

- **Estado**: Proposto
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Relacionados**: [ADR-0010](./ADR-0010-keycloak-fornecedor-identidade.md) (adopção), [ADR-0005-b](./ADR-0005-infraestrutura-deploy.md) (infraestrutura), [ADR-0022](./ADR-0022-provisionamento-ambientes.md) (provisionamento)
- **Skills**: `engineering:architecture`, `terraform-aws-scaffold`

## Contexto
> **Revisto pelo [ADR-0026](./ADR-0026-adiamento-fornecedor-infraestrutura.md)** — a escolha de
> fornecedor de infraestrutura foi adiada. O que este ADR nomeia como serviço da AWS deve ler-se como
> **capacidade requerida**; a AWS é uma implementação candidata, não o plano. O ambiente de referência
> é local (Docker Compose).


Adoptar o Keycloak (ADR-0010) acrescenta à infraestrutura um serviço **com estado**, em **JVM**, no
**caminho crítico do login**. Até aqui a topologia era simples: um contentor sem estado no App Runner
e uma base de dados gerida. O Keycloak quebra essa simplicidade e obriga a decidir onde corre, com que
base de dados, quem lhe fala e com que cadência é actualizado.

Três factos condicionam a decisão:

1. **A cadência de versões do Keycloak é exigente.** Cada versão menor recebe cerca de três meses de
   suporte antes de a seguinte tomar o lugar. Actualizar não é opcional — é trabalho trimestral
   planeado, e a alternativa é correr com uma versão sem correcções de segurança.
2. **A equipa nunca fez um deploy.** O item 1 da lista de bloqueadores do documento de arquitectura é
   precisamente que o `terraform apply` nunca correu. Acrescentar um serviço com estado antes de saber
   operar um serviço sem estado é acumular risco.
3. **O Keycloak em produção não deve ser exposto pela consola de administração.** A separação entre o
   endpoint público de autenticação e o endpoint de administração é a primeira coisa que uma revisão
   de segurança procura.

## Decisão

**Auto-alojar o Keycloak, como contentor, com base de dados dedicada.**

O *onde* ficou adiado pelo ADR-0026. O que se decide aqui é o que não depende de fornecedor: que o
Keycloak é **auto-alojado** e não alugado, que corre como **contentor sem estado** com base de dados
própria, que a **consola de administração não é pública**, e que a **versão é fixada** com cadência de
actualização trimestral. A descrição em ECS Fargate abaixo é a implementação candidata na AWS —
mantém-se como referência do que é preciso ao fornecedor que vier a ser escolhido.

1. **Cálculo**: serviço ECS Fargate na VPC já criada pelo módulo `network`, em sub-redes privadas,
   atrás de um Application Load Balancer interno-externo com TLS terminado no ALB. Duas tarefas em
   `prod` (duas zonas de disponibilidade), uma em `dev`. Imagem oficial `quay.io/keycloak/keycloak`,
   com **versão fixada explicitamente** — nunca `latest`.

2. **Persistência**: **base de dados própria dentro da instância RDS existente**, com utilizador e
   credenciais dedicados. Não é uma instância nova (custo) nem um schema partilhado com o ERP
   (fronteira). O Keycloak é dono do seu schema e ninguém mais lhe toca.

3. **Modo de produção**: `start --optimized`, com a imagem pré-construída na fase de *build* (o
   Keycloak suporta uma fase de aumento que fixa a configuração e evita o custo de arranque). Métricas
   e verificações de saúde activadas nas portas de gestão, nunca no endpoint público.

4. **Superfície exposta**: apenas os caminhos de OIDC e de conta do realm `gespro` são públicos. A
   consola de administração (`/admin`) **não é publicada na Internet** — o acesso é por rede privada,
   com autenticação obrigatória em MFA para o papel `plataforma-admin`. O endpoint de gestão
   (saúde e métricas) fica exclusivamente na rede interna.

5. **Segredos**: credenciais da base de dados, segredo do cliente OIDC e credenciais do administrador
   inicial vivem no AWS Secrets Manager, injectados em runtime. Mantém-se a regra de zero segredos no
   repositório.

6. **Actualizações**: **cadência trimestral obrigatória**, alinhada com o ciclo de versões menores.
   O procedimento é: aplicar em `dev`, correr a suite E2E de autenticação, aplicar em `prod` fora do
   horário de expediente moçambicano, com o plano de reversão escrito antes de começar. O ensaio em
   `dev` não é opcional — o Keycloak aplica migrações ao seu próprio schema no arranque.

7. **Ambiente de referência**: contentor Keycloak no `docker-compose.yml`, com o realm importado de um
   ficheiro versionado (`infra/keycloak/realm-gespro.json`). O CI e o desenvolvimento usam o mesmo
   ficheiro, e — enquanto não houver fornecedor — **é este o único ambiente onde o Keycloak corre**.
   **A configuração do realm é código**, não estado clicado numa consola.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **ECS Fargate + base de dados no RDS existente** ✅ | Sem servidores para gerir; escala horizontal trivial; reutiliza VPC, RDS e Secrets Manager já modelados em Terraform; custo previsível e baixo; controlo total da versão | Um serviço com estado a mais para operar; actualizações trimestrais são trabalho recorrente; arranque a frio da JVM é lento |
| App Runner (como o ERP) | Reutiliza exactamente o padrão já conhecido pela equipa | O App Runner é feito para serviços HTTP sem estado; controlo insuficiente sobre rede interna, portas de gestão separadas e ligação privada ao RDS |
| Serviço gerido (Phase Two, Cloud-IAM) | Zero fardo operacional; actualizações e SLA incluídos; acelera a fase de arranque | Subscrição mensal recorrente em moeda estrangeira; dependência externa no caminho crítico do login; dados de identidade dos clientes fora da nossa infraestrutura |
| EC2 com Docker | Barato e simples de perceber | Servidor para remendar e monitorizar; sem substituição automática de instância doente; um passo atrás face ao que já foi decidido no ADR-0005-b |
| Kubernetes com o Operator do Keycloak | O caminho oficialmente recomendado em escala; actualizações declarativas | Um cluster inteiro para operar um único serviço. Desproporcionado |

Racional: escolhemos ECS Fargate por eliminar a gestão de servidores mantendo o controlo de rede que
o App Runner não dá — e a rede é precisamente onde está a decisão de segurança que importa aqui:
separar o endpoint público do endpoint de administração. Rejeitámos o serviço gerido, apesar de
reduzir risco de execução a curto prazo, porque introduz custo recorrente em USD e coloca as
identidades de clientes moçambicanos fora da nossa infraestrutura — num produto que guarda dados
fiscais, isso é uma conversa difícil de ter com um cliente empresarial.

## Consequências

- **Novo módulo Terraform `infra/modules/keycloak`**, com serviço ECS, definição de tarefa, ALB,
  grupos de segurança, base de dados e utilizador no RDS, e entradas no Secrets Manager. Consumido
  por `infra/live/dev` e `infra/live/prod`.
- **O ERP ganha uma dependência de arranque suave**: não precisa do Keycloak para arrancar (o
  `/api/ready` continua a testar apenas a base de dados), mas precisa dele para autenticar. A sonda
  de prontidão **não** deve passar a testar o Keycloak — isso faria uma indisponibilidade de login
  derrubar instâncias saudáveis do ERP.
- **A disponibilidade do login passa a ser um SLO de primeira linha** (ADR-0019), com alerta próprio.
  Quem já tem sessão continua a trabalhar durante uma indisponibilidade; quem não tem, não entra.
- **A configuração do realm é versionada e importada**, não clicada. Alterações ao realm passam por
  *pull request* como qualquer outra mudança. É a única forma de `dev`, CI e `prod` não divergirem.
- **Custo estimado**: duas tarefas Fargate pequenas em `prod` mais uma em `dev`, ALB, e uma base de
  dados adicional na instância RDS existente. Ordem de grandeza de dezenas de dólares por mês — a
  confirmar no primeiro ciclo de facturação, e a comparar com a proposta de um serviço gerido antes de
  fixar a decisão como definitiva.
- **Compromisso operacional explícito**: quatro janelas de actualização por ano, cada uma com ensaio
  em `dev`. Se ao fim de um ano este compromisso não estiver a ser cumprido, a decisão certa é migrar
  para serviço gerido — e isso deve ser registado num ADR que substitua este, não tolerado em silêncio.
- **Reversão**: a base de dados do Keycloak é a fonte de verdade da identidade. Migrar para um serviço
  gerido mais tarde é exportar o realm e importá-lo — caminho conhecido e sem perda de dados. A
  decisão é reversível a custo moderado, o que justifica tomá-la agora em vez de a adiar.
