# Runbook — Alertas de produção (CloudWatch + SNS)

> **Arquivado — produção no Railway (ADR-0050); alertas em `docs/runbooks/deploy-railway.md`.**
> O código descrito abaixo vive agora em `infra/_arquivo-aws/modules/monitoring` e
> `infra/_arquivo-aws/live/prod`; os caminhos `infra/modules/monitoring` e `infra/live/*` deste
> texto são os de antes do arquivo.

**Governa:** ADR-0019 §4 (alertas, dois níveis), ADR-0026 §5 (sem fornecedor escolhido), #576.
**Código:** `infra/modules/monitoring`, ligado em `infra/live/prod` (e em `live/dev` só com `alert_email`).

> **Nunca exercido.** O IaC AWS nunca foi aplicado (`docs/status.md`). O que aqui está declarado foi
> verificado só contra um fornecedor dobrado (`terraform -chdir=infra/live/prod test`). Os passos
> marcados [HUMANO] são os que transformam isto em garantia.

## O que existe

Um canal de serviço: **o e-mail `alert_email`** (variável obrigatória em prod, sem omissão), subscrito
a dois tópicos SNS `gespro-<env>-alertas` — um na região principal, outro em `us-east-1` (o Route 53
só publica as métricas dos health checks lá, e um alarme só notifica um tópico da sua região). A
severidade vai no **nome do alarme**, que é o assunto do e-mail: `…-PAGINA-…` acorda alguém,
`…-AVISO-…` espera pelo dia útil seguinte.

| Alarme | Nível | Fonte | Dispara quando | Manual de resposta |
|---|---|---|---|---|
| `PAGINA-api-ready-a-falhar` | Página | Route 53 health check HTTPS a `/api/ready` (30 s, 3 falhas, de 3 regiões) → `AWS/Route53 HealthCheckStatus` (us-east-1) | 3 min seguidos «unhealthy» | Abaixo, §`/api/ready` |
| `PAGINA-taxa-5xx` | Página | `AWS/AppRunner` `5xxStatusResponses ÷ Requests`, só com mais de 20 pedidos/min (`volume_minimo_pedidos`) | > 1 % em cada um de 5 min | [`alerta-taxa-erro-elevada.md`](./alerta-taxa-erro-elevada.md) |
| `AVISO-budget-slo` | Aviso | idem, por hora (mesma guarda de volume) | > 0,5 % numa hora | idem |
| `AVISO-latencia-p95` | Aviso | `AWS/AppRunner RequestLatency` p95 | > 800 ms durante 30 min | consultas lentas, carga da BD |
| `AVISO-cron-falhou` | Aviso | Filtro de métrica sobre os registos (`CronFalhas`) | uma rota `/api/cron/*` responde ≥ 400 ou regista `level: error` | [`agendador.md`](./agendador.md) §Se falhar |
| `AVISO-cron-em-falta` | Aviso | Filtro de métrica (`CronSucessos`) | 24 h sem nenhuma corrida de cron com 200 | [`agendador.md`](./agendador.md) |
| `AVISO-erros-inesperados` | Aviso | Filtro de métrica (`ErrosLogger`, `level: error`) | ≥ `limiar_erros_5min` (5) linhas em 5 min | consulta «erros-por-traceid» |

Tradução das regras locais (`infra/local/observabilidade/alerts/rules.yaml`):

| Regra local | Em produção |
|---|---|
| `gespro-erp-indisponivel` + `gespro-db-inacessivel` | `PAGINA-api-ready-a-falhar` — `/api/ready` faz `SELECT 1`: falha com o ERP em baixo **e** com a BD inacessível. O `/api/health` distingue as duas (abaixo) |
| `gespro-taxa-erro-elevada` | `PAGINA-taxa-5xx` |
| `gespro-slo-budget-burn` | `AVISO-budget-slo` |
| `gespro-latencia-p95-elevada` | `AVISO-latencia-p95` (o App Runner não separa leitura de mutação: um só limiar, o de leitura) |
| `gespro-tarefa-agendada-em-falta` | `AVISO-cron-falhou` + `AVISO-cron-em-falta` (dos registos; o gauge `negocio_tarefas_agendadas_em_falta` vive no `/api/metrics`, que nada raspa na AWS) |
| `gespro-keycloak-indisponivel`, `gespro-keycloak-latencia-elevada` | **Fora** — o Keycloak não existe no IaC (#572). Quem o acrescentar acrescenta o alarme |
| `gespro-valkey-circuit-breaker-aberto` | **Fora** — o Valkey não existe no IaC (#572) |
| `gespro-stripe-webhook-fila` | **Fora** — métrica Prometheus sem equivalente em registo confirmado; fica para quando houver destino OTLP com regras (ADR-0019 §1) |
| (ADR-0019) certificado a expirar | **Fora** — o App Runner gere o TLS do seu domínio |

**Error tracking, sem dependência nova:** os erros já saem pelo logger estruturado com redacção
(`apps/erp/src/server/observability/logger.ts`) e com o `requestId` que um 500 devolve ao cliente
como `traceId` (#187). O App Runner manda o stdout/stderr para o grupo
`/aws/apprunner/<serviço>/<id>/application`. O alarme leva só a **contagem**; a linha fica no
CloudWatch Logs. Triagem pelo traceId que o cliente cita: Logs Insights → consulta guardada
`gespro-<env>/erros-por-traceid`, ou `filter requestId = "<traceId>"`.

**Telemetria OTLP:** destino configurável por `otel_exporter_otlp_endpoint` (variável do
`modules/app`, `null` por omissão); o token vai na chave `headers` do segredo `OTEL_CREDENTIALS`.
Sem endpoint, o SDK OTel não arranca e nada se perde do que estes alarmes usam.

## Depois do primeiro apply — [HUMANO]

1. **Confirmar as duas subscrições.** A AWS envia **dois** e-mails «AWS Notification - Subscription
   Confirmation» (região principal e us-east-1). Sem clicar nos dois, os alarmes disparam e o e-mail
   não sai. Verificar: `aws sns list-subscriptions-by-topic --topic-arn <arn>` sem `PendingConfirmation`
   (nas duas regiões).
2. **Se o apply falhar no grupo de registos** com `ResourceAlreadyExistsException`: o grupo
   `/aws/apprunner/<serviço>/<id>/application` é declarado pelo `modules/monitoring` (para lhe fixar a
   retenção, `retencao_registos_dias`, 90 por omissão), mas o App Runner cria-o sozinho quando a app
   escreve a primeira linha — e o nome só se conhece depois de o serviço existir. Importar e repetir:
   ```bash
   terraform -chdir=infra/live/prod import 'module.monitoring.aws_cloudwatch_log_group.app' \
     "/aws/apprunner/gespro-prod/<service_id>/application"
   terraform -chdir=infra/live/prod apply
   ```
   (`<service_id>`: `aws apprunner list-services`, ou o output `app_log_group` de um apply parcial.)
3. **Conferir os padrões contra uma linha real** (os padrões assumem o formato do `withApi`):
   ```bash
   aws logs test-metric-filter \
     --filter-pattern '{ ($.url = "/api/cron/*") && (($.status >= 400) || ($.level = "error")) }' \
     --log-event-messages '{"time":"2026-10-22T03:00:01.000Z","level":"info","requestId":"r1","service":"gespro","method":"GET","url":"/api/cron/expirar-trials","status":500,"duration":12,"msg":"request end"}'
   ```
   Tem de devolver um `match`. Repetir com `status":200` — tem de devolver zero matches para este
   padrão e um para `CronSucessos`.
4. **`AVISO-cron-em-falta` fica em ALARM** até haver agendador no IaC (#572) — é verdade, não ruído:
   nada chama as rotas `/api/cron/*` em produção (`agendador.md`).

## Ensaio sintético do critério da #576 — [HUMANO]

**Critério:** `/api/ready` a responder 503 durante 5 minutos faz chegar um alerta ao canal de serviço
em ≤ 10 minutos. Tempo esperado pela configuração: ~1,5 min até o health check ficar «unhealthy»
(3 × 30 s) + 3 min de alarme + entrega do SNS ≈ 5–6 min.

**Onde:** num ambiente com `alert_email` — de preferência `live/dev` (o procedimento torna a BD
inacessível). Em `prod` só numa janela de manutenção anunciada.

1. Anotar **T0** e tornar a BD inacessível à app sem a matar:
   `aws rds stop-db-instance --db-instance-identifier gespro-dev-postgres`
   (em prod, preferir retirar temporariamente a regra de entrada 5432 do SG do RDS — e repô-la).
2. Confirmar o sintoma: `curl -s -o /dev/null -w '%{http_code}\n' https://<host>/api/ready` → `503`
   (ou tempo esgotado), `/api/health` → `200` (o processo está vivo; é a BD).
3. Esperar o e-mail `ALARM: "gespro-<env>-PAGINA-api-ready-a-falhar"`. Anotar **T1** (hora de chegada).
4. Repor (`aws rds start-db-instance …` ou a regra do SG). Esperar o e-mail `OK`. Anotar **T2**.
5. Registar abaixo. **T1 − T0 > 10 min → o critério falha**: encurtar `evaluation_periods` ou o
   `request_interval`, ou corrigir a entrega — nunca registar como cumprido.

Ensaio só do caminho de entrega (não prova a detecção; útil em prod sem tocar na BD):
`aws cloudwatch set-alarm-state --region us-east-1 --alarm-name gespro-prod-PAGINA-api-ready-a-falhar --state-value ALARM --state-reason "ensaio de entrega"`.

### Registo de ensaios

<!-- Uma linha por ensaio; nunca reescrever as anteriores. -->

| Data | Ambiente | Quem | T0 (503) | T1 (e-mail ALARM) | T1 − T0 | T2 (e-mail OK) | Resultado |
|---|---|---|---|---|---|---|---|
| (pendente — sem produção, ADR-0026 §5) | | | | | | | |

## `/api/ready` a falhar — resposta

> **Com a BD em baixo chegam DOIS e-mails de PAGINA quase juntos**: `api-ready-a-falhar` e
> `taxa-5xx` (os pedidos que tocam na base passam a 500). É o mesmo incidente, não dois — tratar
> pelo de `/api/ready`, que diz qual das duas peças falhou. Com pouco tráfego (≤ 20 pedidos/min) só
> chega o de `/api/ready`: a guarda de volume da taxa de 5xx é deliberada, e a falha total
> continua coberta pela sonda.

1. `curl https://<host>/api/health` — sem resposta ou ≠ 200: **o ERP está em baixo** → seguir
   [`alerta-erp-indisponivel.md`](./alerta-erp-indisponivel.md) (estado do serviço App Runner, último
   deploy, registos `…/service` e `…/application`).
2. `/api/health` = 200 e `/api/ready` = 503: **a BD está inacessível** → seguir
   [`alerta-db-inacessivel.md`](./alerta-db-inacessivel.md) (estado da instância RDS, failover
   multi-AZ em curso, SG, credenciais rodadas). A linha `[ready] base de dados inacessível` no
   Logs Insights tem a mensagem do erro.
3. Perda da instância ou dados corrompidos → [`restauro-bd.md`](./restauro-bd.md) §Produção.
4. Os dois a 200 mas o alarme em ALARM: o health check não chega ao host (domínio, TLS/SNI) —
   ver o estado no Route 53 (`aws route53 get-health-check-status --health-check-id <id>`).
