# 6. Operação

> **Não há produção** ([ADR-0026](../decisions/ADR-0026-adiamento-fornecedor-infraestrutura.md)).
> Tudo o que se segue é exercitado no **ambiente local de referência**; o Terraform AWS é a
> implementação candidata, nunca aplicada. Os procedimentos foram escritos para valerem igual quando
> houver fornecedor — muda a implementação da capacidade, não o procedimento.

## Ambiente local de referência

```bash
docker compose --profile full up -d --build   # segredos por .env na raiz (ver .env.example)
```

| Serviço | Imagem | Endereço | Papel |
|---|---|---|---|
| `proxy` | caddy 2.11 | http://localhost:8080 | Balanceia 2 instâncias ERP; header `X-Gespro-Instancia` |
| `erp-1`, `erp-2` | `gespro-erp:local` (Dockerfile de produção) | via proxy | App sem estado |
| `db` | postgres:17-alpine | :5432 (ou :5433 se ocupada) | Bases `gespro` e `keycloak`; `archive_mode=on` |
| `keycloak` | keycloak 26.7.0 | http://localhost:8081 | Realm `gespro` importado de `infra/keycloak/` |
| `valkey` | valkey 8 | — | Rate-limit partilhado |
| `minio` | MinIO | consola :9001 | Documentos (API S3) |
| `otel-lgtm` | grafana/otel-lgtm 0.31 | Grafana :3002, OTLP 4317/4318 | Logs, métricas, traces |
| `mailpit` | mailpit 1.30 | http://localhost:8025 | SMTP de teste |
| `cron` | alpine | — | Chama `/api/cron/*` com `CRON_SECRET` |
| `webhook-receptor` | http-https-echo | — | Alvo de webhooks de alerta |

Sem `--profile full` sobem só `db`, `db-init` e `keycloak` (desenvolvimento).

## Imagem e arranque

- `Dockerfile` multi-stage, `output: standalone`, utilizador não-root, `HEALTHCHECK` em `/api/health`.
- `docker-entrypoint.sh` corre `prisma migrate deploy` **antes** de arrancar. Publicação em duas fases
  para migrações que quebram compatibilidade ([ADR-0022 §6](../decisions/ADR-0022-provisionamento-ambientes.md)).
- Probes: `/api/health` (liveness, sem BD), `/api/ready` (`SELECT 1`), `/api/metrics` (Prometheus,
  `METRICS_SECRET`). Todos em `PUBLIC_PATHS` — um probe a receber 307 é sinal de regressão no
  `middleware.ts`.

## Configuração

Variáveis na raiz (`.env.example`): `AUTH_SECRET`, `METRICS_SECRET`, `CRON_SECRET`,
`KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_ADMIN_*`, `KEYCLOAK_DB_PASSWORD`, `KEYCLOAK_SSO_*_SECONDS`,
`AUTH_SESSION_MAX_AGE`, `MINIO_ROOT_*`. Na app (`apps/erp/.env`): `DATABASE_URL`, `ALLOWED_ORIGINS`,
`CSP_ENFORCE`, `RATE_LIMIT_DRIVER`/`VALKEY_URL`, `STORAGE_DRIVER`, `EMAIL_PROVIDER`,
`EMAIL_VERIFY_SECRET`, chaves Stripe, `NEXT_PUBLIC_APP_URL`. Regra ([ADR-0022 §4](../decisions/ADR-0022-provisionamento-ambientes.md)):
**ambientes divergem por variáveis, nunca por código**.

## Tarefas agendadas

Contrato completo (rotas, horários, `CRON_SECRET`, como testar): [`runbooks/agendador.md`](../runbooks/agendador.md).
Crontab em `infra/local/cron/crontab` (UTC):

| Hora (UTC) | Rota | Efeito |
|---|---|---|
| 02:00 | `/api/cron/abrir-exercicio` | Cria exercício + 13 períodos + séries, por tenant, no dia configurado em `ConfiguracaoFiscal`; idempotente |
| 03:00 | `/api/cron/expirar-trials` | Fim do trial → Leitura; aviso a 7 dias do fecho; fim da Leitura → Fechada |
| 03:10 | `/api/cron/expirar-registos-nao-verificados` | Expurga tenants registados há > 7 dias cujo administrador nunca confirmou o e-mail |
| 03:15 | `/api/cron/reconciliar-identidades` | Compara Identidade (Keycloak) ↔ Utilizador; **reporta, não apaga** |
| 03:30 | `/api/cron/transporte-alertas` | Recalcula estado dos documentos de viaturas/motoristas e notifica (idempotente por dia) |

Uma rota `/api/cron/*` nova entra **nos dois sítios** (código + crontab) ou não corre em lado nenhum.
(O runbook ainda diz «quatro rotas» e alguns comentários de rota têm horários diferentes do crontab —
o crontab é a verdade.)

## Observabilidade

- Logs JSON (pino) com `requestId`, `tenantId`, `userId`, rota, estado, duração; PII e segredos redigidos.
- Métricas RED por rota e por tenant; traces OTLP. Painéis provisionados por ficheiro em
  `infra/local/observabilidade/dashboards/` (visão geral, latência por rota, erros por tenant, sinais
  de negócio); alertas em `alerts/rules.yaml` + `alertmanager.yaml`.
- SLOs ([ADR-0019](../decisions/ADR-0019-telemetria-slo.md)):

| Serviço | Objectivo | Janela |
|---|---|---|
| Disponibilidade do ERP | 99,5 % | 30 dias |
| Disponibilidade do login | 99,5 % | 30 dias |
| Latência de leitura p95 | < 800 ms | 7 dias |
| Latência de mutação p95 | < 1 200 ms | 7 dias |
| Erros 5xx | < 0,1 % | 7 dias |
| Webhook Stripe processado | 99,9 % em 5 min | 30 dias |

## Continuidade

Objectivos ([ADR-0020](../decisions/ADR-0020-continuidade-recuperacao.md)): **RPO 5 min, RTO 4 h**,
aplicados à base do ERP e à do Keycloak como um só sistema.

- Local: arquivo contínuo de WAL (`archive_timeout=60`) + cópias de base por
  `./infra/local/scripts/backup-base.sh`. Cópia antes de cada migração e de cada actualização do Keycloak.
- Ensaio cronometrado: `./infra/local/scripts/ensaio-restauro.sh` — trimestral e obrigatório.

## Runbooks

| Situação | Runbook |
|---|---|
| ERP não responde | [alerta-erp-indisponivel](../runbooks/alerta-erp-indisponivel.md) |
| Base de dados inacessível | [alerta-db-inacessivel](../runbooks/alerta-db-inacessivel.md) |
| Keycloak em baixo (ninguém entra) | [alerta-keycloak-indisponivel](../runbooks/alerta-keycloak-indisponivel.md) |
| Taxa de erro elevada | [alerta-taxa-erro-elevada](../runbooks/alerta-taxa-erro-elevada.md) |
| Restaurar a base | [restauro-bd](../runbooks/restauro-bd.md) |
| Restaurar o Keycloak | [restauro-keycloak](../runbooks/restauro-keycloak.md) |
| Ensaio de restauro | [ensaio-restauro](../runbooks/ensaio-restauro.md) |
| Tarefas agendadas | [agendador](../runbooks/agendador.md) |

## Infraestrutura como código (candidata)

`infra/` — Terraform com estado remoto em S3:

| Pasta | Conteúdo |
|---|---|
| `bootstrap/` | Bucket de estado e tranca |
| `modules/` | `network` (VPC, NAT), `rds` (Postgres, Performance Insights), `app` (App Runner), `secrets` (Secrets Manager, um segredo por valor), `storage` (bucket privado, SSE, CORS, IAM mínima) |
| `live/{dev,prod}/` | Composição por ambiente; `terraform.tfvars.example` |
| `keycloak/` | Realm, temas e script de importação |
| `local/` | Pilha de referência (cron, MinIO, observabilidade, Postgres, proxy, scripts) |

Nunca houve `terraform apply`. Antes do primeiro: `dev` primeiro, com um ciclo destroy/apply
completo ([ADR-0022 §1](../decisions/ADR-0022-provisionamento-ambientes.md)); retenção PITR ainda abaixo
do ADR-0020 no `live/dev`.

## CI

`.github/workflows/ci.yml`, jobs: `lint-type` (prisma validate, tsc, eslint) · `gates` · `test`
(migrações + seed + vitest com cobertura) · `integration` (Testcontainers; status check obrigatório —
localmente salta em silêncio se o Docker Desktop recusar o Ryuk, por isso «verde» local não prova nada)
· `e2e` · `a11y` · `site` · `build`. `perf.yml`
corre os cenários k6 ([`perf/README.md`](../../perf/README.md)).

## Antes de haver produção — bloqueantes conhecidos

1. Escolher fornecedor segundo as capacidades do ADR-0026 §1 (incluindo PITR).
2. Valkey obrigatório (rate-limit em memória não serve com várias instâncias).
3. `METRICS_SECRET` obrigatório; `CSP_ENFORCE=true` após smoke.
4. Fiscalidade moçambicana da própria subscrição validada ([ADR-0021](../decisions/ADR-0021-fiscalidade-subscricao-saas.md)).
5. `Price` USD criados no Stripe e smoke em test-mode.
6. Conformidade legal do IVA (issue #64) e fecho do exercício ([ADR-0035](../decisions/ADR-0035-encerramento-exercicio.md)) antes do primeiro fecho real.
