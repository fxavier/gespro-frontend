# ADR-0026 — Adiamento da escolha de fornecedor e ambiente local de referência

- **Estado**: Proposto
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Substitui parcialmente**: [ADR-0005-b](./ADR-0005-infraestrutura-deploy.md) · [ADR-0012](./ADR-0012-alojamento-keycloak.md) §Decisão(alojamento) · [ADR-0014](./ADR-0014-cache-e-rate-limit-distribuido.md) §1 · [ADR-0019](./ADR-0019-telemetria-slo.md) §1 · [ADR-0020](./ADR-0020-continuidade-recuperacao.md) §2 · [ADR-0022](./ADR-0022-provisionamento-ambientes.md), na parte que fixava AWS
- **Skills**: `engineering:architecture`, `engineering:deploy-checklist`

## Contexto

Os ADRs 0012, 0014, 0019, 0020 e 0022 nomeiam serviços concretos da AWS: ECS Fargate, ElastiCache
Serverless, RDS com recuperação a um ponto no tempo, Secrets Manager, Grafana Cloud. Foram escritos
assumindo que a AWS era o destino, porque o [ADR-0005-b](./ADR-0005-infraestrutura-deploy.md) já
tinha escrito Terraform para ela.

Duas coisas tornam essa suposição prematura:

1. **O Terraform nunca correu.** Não há um único recurso provisionado. O compromisso com a AWS é de
   papel, não de infraestrutura — e desfazê-lo hoje não custa nada.
2. **Não há dados para escolher.** Não se sabe quantos tenants cabem numa instância, qual o perfil de
   carga, nem qual o custo de servir um cliente. Escolher fornecedor sem esses números é escolher por
   familiaridade, não por adequação. Os candidatos reais vão de plataformas geridas (Railway, Fly.io,
   Render) a hiperescalares (AWS, Azure, Google Cloud) a um servidor próprio — e têm perfis de custo
   que diferem por ordens de grandeza nesta escala.

Acresce um facto que só ficou claro ao inspeccionar o código: **a aplicação quase não está presa à
AWS**. O acoplamento resume-se a duas dependências — `@aws-sdk/client-s3` e
`@aws-sdk/s3-request-presigner` — usadas num único ficheiro, `src/lib/storage/objeto/s3.ts`. E o
protocolo S3 é hoje um padrão de facto que MinIO, Cloudflare R2, Backblaze B2, Scaleway e o modo de
interoperabilidade do Google Cloud Storage falam. Todo o resto da ligação à AWS vive em `infra/`.

Ou seja: o produto é portátil e o plano é que não era.

## Decisão

**Adiar a escolha de fornecedor. Construir e validar tudo num ambiente local de referência, e
reescrever os requisitos de infraestrutura como capacidades, não como produtos.**

### 1. Requisitos expressos como capacidades

Cada ADR que nomeava um serviço passa a exigir uma **capacidade**. A implementação é escolhida depois.

| Capacidade | Requisito | Implementação local | Candidatos em produção |
|---|---|---|---|
| Base de dados relacional | PostgreSQL 17, recuperação a um ponto no tempo, cópias retidas ≥ 7 dias | `postgres:17-alpine` com arquivo de WAL | Qualquer Postgres gerido, ou auto-alojado com WAL-G |
| Fornecedor de identidade | Keycloak ≥ 26 com Organizations, base de dados própria | contentor Keycloak com realm importado | Contentor em qualquer runtime, ou Keycloak gerido |
| Cache e contadores | Protocolo Redis, expiração nativa, partilhado entre instâncias | `valkey:8-alpine` | Valkey/Redis gerido, ou contentor |
| Armazenamento de objectos | **API S3**, URLs assinadas, política de POST, versionamento | MinIO | S3, R2, B2, GCS-interop, Scaleway, MinIO próprio |
| Telemetria | Receptor **OTLP** para registos, métricas e traces | `grafana/otel-lgtm` | Grafana Cloud, LGTM próprio, ou o que o fornecedor oferecer |
| Envio de e-mail | SMTP | Mailpit | Qualquer fornecedor SMTP |
| Segredos | Injectados no ambiente em runtime | ficheiro `.env` não versionado | Gestor de segredos do fornecedor, ou ficheiro cifrado |
| Execução | Contentor OCI sem estado, escalável horizontalmente | 2 contentores atrás de proxy | Qualquer runtime de contentores |

**Nenhuma destas capacidades é exclusiva de um fornecedor.** Foi essa a verificação: se alguma o
fosse, seria uma decisão de arquitectura disfarçada de escolha de infraestrutura.

### 2. Ambiente local de referência

`docker-compose.yml` deixa de ser «Postgres para desenvolvimento» e passa a ser a **encarnação
executável da topologia de produção**: Postgres, Keycloak, Valkey, MinIO, `otel-lgtm`, Mailpit, e
**duas instâncias da aplicação atrás de um proxy**.

As duas instâncias não são detalhe. São o que torna verificáveis localmente três coisas que uma só
instância esconde: que o limitador de tráfego é mesmo partilhado, que a sessão sobrevive à mudança de
instância, e que a publicação em duas fases funciona. O defeito que o ADR-0014 descreve — «com duas
tarefas, um limite de cinco vale dez» — passa a ser um teste, não um receio.

### 3. Regras de portabilidade

Enquanto o fornecedor não for escolhido, e idealmente depois também:

1. **Configuração só por ambiente.** Nada de ficheiros de configuração por fornecedor no código.
2. **S3 com `endpoint` configurável.** O cliente actual não o define, o que o prende à AWS sem
   necessidade. Acrescentar `endpoint` e `forcePathStyle` é uma linha e abre MinIO, R2, B2 e o resto.
3. **Nenhum SDK de fornecedor além do S3.** Sem clientes de gestores de segredos, filas ou agendadores
   proprietários. As tarefas agendadas continuam a ser rotas HTTP protegidas, invocáveis por qualquer
   agendador — incluindo `cron`.
4. **Sem serviços exclusivos** de um fornecedor no caminho crítico.
5. **A imagem é a unidade de entrega.** O que corre localmente é a mesma imagem que correrá em produção.

### 4. O Terraform da AWS fica dormente, não é apagado

O código de `infra/` continua no repositório, marcado como **uma implementação candidata entre
várias**, não como o plano. Representa trabalho válido e revisto, e se a AWS for a escolha está meio
caminho andado. Apagá-lo seria destruir uma opção; promovê-lo a plano seria decidir sem dados.

### 5. Como e quando se decide

A escolha faz-se quando existirem **três números** — todos produzidos pelo trabalho desta wave:

- Tenants por instância, do ADR-0018.
- Perfil de carga: picos, concorrência, dimensão dos dados ao fim de um ano.
- Preço por escalão de plano, que depende dos dois anteriores.

Grelha de avaliação, para quando chegar a altura:

| Critério | Peso |
|---|---|
| Custo total aos 10, 50 e 200 tenants | Alto |
| Latência para Moçambique (região e rede) | **Alto** — é o mercado |
| Postgres gerido com recuperação a um ponto no tempo | Alto |
| Esforço operacional que exige da equipa | Alto |
| Custo de saída se a escolha correr mal | Médio |
| Conformidade e residência de dados | Médio |
| Maturidade de Terraform ou equivalente | Médio |

Fica registado num ADR próprio, que substituirá este na parte da decisão.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Adiar, com ambiente local de referência** ✅ | Desbloqueia toda a Wave 8 sem contas nem custos; a decisão passa a ser tomada com dados; a portabilidade que se ganha tem valor mesmo depois de decidir | O que só falha em nuvem real continua desconhecido; há uma fase de provisionamento por fazer no fim |
| Avançar com a AWS agora | O Terraform já está escrito; retira o desconhecido mais cedo | Escolhe-se por familiaridade, sem números; custo recorrente antes de haver receita; aprofunda um acoplamento que hoje quase não existe |
| Escolher uma plataforma gerida (Railway, Fly, Render) | Muito menos esforço operacional; barato nesta escala; sobe em minutos | Continua a ser escolher sem dados; e algumas não oferecem Postgres com recuperação a um ponto no tempo, que o ADR-0020 exige |
| Servidor próprio único | Custo mínimo e previsível; controlo total | Toda a operação passa a ser nossa: cópias, remendos, TLS, monitorização. Contradiz a lógica do ADR-0012, que já achava o Keycloak um fardo |
| Adiar sem ambiente local completo | Zero trabalho de infraestrutura agora | O Keycloak, o Valkey e a política de POST **não são verificáveis** sem eles a correr. Metade da wave ficaria por provar |

Racional: o que torna esta decisão barata é o facto de o produto já ser portátil. Se o acoplamento
fosse profundo, adiar seria acumular dívida — teríamos de escolher a arquitectura sem saber o alvo.
Como é raso, adiar custa uma configuração de Docker Compose e devolve tempo, dinheiro e opções. E o
trabalho de portabilidade não é desperdiçado quando a escolha for feita: continua a ser o que permite
mudar de ideias.

## Consequências

### O que passa a ser verificável localmente

Keycloak ponta-a-ponta, incluindo Organizations, PKCE e renovação de sessão · limitador de tráfego
partilhado entre duas instâncias · trilho de auditoria · política de POST no armazenamento, porque o
MinIO fala a API S3 · condutas de telemetria, painéis e regras de alerta · linha de base e testes de
carga (valores relativos, não absolutos) · procedimento de cópia e restauro, cronometrado · publicação
em duas fases da migração destrutiva · gates, documentação e separação de domínio, que nunca
dependeram de nuvem.

### O que continua por saber, e não se finge que se sabe

Permissões mínimas de IAM ou equivalente · topologia de rede e isolamento real · comportamento de um
Postgres gerido em falha de zona e o seu limite de ligações · terminação de TLS, certificados e DNS ·
arranque a frio e escala automática · **custo real** · latência de rede para Moçambique · tráfego de
saída.

**Isto não retira o risco identificado no documento de arquitectura — adia-o.** O primeiro
provisionamento continuará a ser o momento em que aparecem os problemas que só a nuvem revela. O que
se ganha é chegar lá com tudo o resto provado, e com liberdade de escolher o «lá».

### No plano de execução

- A fase que criava `prod` sai do caminho crítico e passa a **fase futura, sem data**, dependente de
  uma decisão que ainda não foi tomada. O plano volta a quatro fases activas.
- As tasks que só existem em produção — multi-AZ, replicação inter-região, retenção de 35 dias — vão
  com ela. As que pareciam depender de produção mas não dependem ficam: a activação da CSP em modo
  estrito valida-se contra um **build de produção local**, que é onde os problemas de *nonce*
  aparecem, e não contra uma nuvem.
- O ensaio de restauro faz-se contra o ambiente local. Prova o procedimento e cronometra-o; a
  validação do RTO real fica para quando houver produção.

### Custos e riscos

- **Custo em dinheiro: zero.** Nenhuma conta, nenhuma subscrição, nenhum cartão.
- **Custo em máquina**: a pilha completa são sete contentores. Exige memória e disco a sério na
  máquina de desenvolvimento, e o arranque deixa de ser instantâneo. Mitiga-se com perfis do Compose,
  para que o trabalho de domínio não tenha de levantar tudo.
- **Risco de divergência**: um ambiente local que se afasta do de produção dá falsa confiança. A regra
  que o trava é a 5 do ponto 3 — **a mesma imagem** corre nos dois sítios, e as diferenças vivem só em
  variáveis de ambiente.
- **Risco de adiar demais**: adiar tem um custo que cresce. Se ao fim de um trimestre os três números
  do ponto 5 existirem e a decisão continuar por tomar, o adiamento deixou de ser prudência e passou a
  ser evitamento.
