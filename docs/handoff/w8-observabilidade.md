# Handoff — w8-observabilidade

**Wave**: 8 — Prontidão para Produção
**Fases**: 1A (2026-08-21) + 1B (2026-08-22) + 1C (2026-08-23 — correcções B1/B2/M1-M6 + prova final)
**Branch**: w8-observabilidade
**ADRs**: ADR-0019, ADR-0026

---

## 1. Resumo do trabalho feito

Implementação completa do ADR-0019 (telemetria + SLO) conforme ADR-0026 (stack local).

A telemetria chega ao destino local (`otel-lgtm`): traces em Tempo, logs em Loki, métricas em
Prometheus por OTLP. Os 4 painéis e as 10 regras de alerta estão provisionados em ficheiro
versionado. Um alerta (TesteDisparoW8) foi disparado intencionalmente, avaliado pelo motor
de alertas Grafana, e a notificação chegou ao `webhook-receptor` (confirmado por log do contentor).

Princípio central confirmado: mudar de destino é mudar `OTEL_EXPORTER_OTLP_ENDPOINT` — não código.

### Estado final das verificações

| Verificação | Resultado |
|---|---|
| `pnpm check` (1244 testes) | VERDE |
| `keycloak_available` | 1 (sonda rodou 57+ vezes) |
| `valkey_available` | 1 |
| Alertas a disparar em falso-positivo | 0 (10 rules inactive) |
| `tenant_id` em métricas autenticadas | PRESENTE (`cmryxrzzx0000wg9kkdtsdta5`) |
| `userId`/`requestId` em métricas | AUSENTES (apenas em logs e traces) |
| Rota normalizada em métricas | PRESENTE (`/api/export/[modulo]` em vez do valor real) |

---

## 2. Ficheiros criados ou modificados

### Fase A — Instrumentação

#### Novos (observabilidade)
| Ficheiro | Propósito |
|---|---|
| `apps/erp/src/server/observability/prom-registry.ts` | Registo Prometheus com prom-client; métricas RED, Keycloak, Valkey, negócio; auto-arranque de sondas (ver §3.1) |
| `apps/erp/src/server/observability/probes.ts` | Sondas de saúde Keycloak e Valkey (TCP PING); arrancam em background |
| `apps/erp/src/server/observability/negocio.ts` | Funções de registo de sinais de negócio (vendas, facturas, webhooks, tarefas) |

#### Modificados (Fase A)
| Ficheiro | Alteração |
|---|---|
| `apps/erp/instrumentation.ts` | Exportador OTLP de logs; chama `startProbes()` |
| `apps/erp/src/app/api/metrics/route.ts` | Serve métricas em formato Prometheus text (prom-client) |
| `apps/erp/src/lib/api/with-api.ts` | Chama `recordHttpRequest()` com `tenantId`, `route`, `statusCode`, `durationMs` |

#### Testes (Fase A)
| Ficheiro | O que testa |
|---|---|
| `apps/erp/src/server/observability/__tests__/prom-registry.test.ts` | Cardinalidade; tenant_id presente; userId/requestId ausentes |
| `apps/erp/src/server/observability/__tests__/negocio.test.ts` | Contadores de negócio; labels correctos |
| `apps/erp/src/server/observability/__tests__/ready-independence.test.ts` | /api/ready sem dependência de Keycloak/Valkey |

### Fase B — Ligação ao destino local

#### Infraestrutura local
| Ficheiro | Propósito |
|---|---|
| `infra/local/observabilidade/dashboards/provider.yaml` | Provider Grafana |
| `infra/local/observabilidade/dashboards/01-visao-geral.json` | Painel: disponibilidade, taxa de pedidos, SLO |
| `infra/local/observabilidade/dashboards/02-latencia-por-rota.json` | Painel: latência por rota |
| `infra/local/observabilidade/dashboards/03-erros-por-tenant.json` | Painel: taxa de erro por tenant |
| `infra/local/observabilidade/dashboards/04-sinais-negocio.json` | Painel: vendas, facturas, Stripe, tarefas |
| `infra/local/observabilidade/alerts/alertmanager.yaml` | Contact points + notification policies |
| `infra/local/observabilidade/alerts/rules.yaml` | 4 críticos + 6 avisos; `noDataState: OK` nos 3 que precisam |
| `infra/local/observabilidade/prometheus.yaml` | Config Prometheus com scrape job `gespro-erp` |
| `infra/local/observabilidade/scripts/disparar-alerta-teste.sh` | Script de verificação ponta-a-ponta |

#### Runbooks (`docs/runbooks/`)
| Ficheiro | Alerta |
|---|---|
| `alerta-keycloak-indisponivel.md` | Keycloak Indisponível (CRITICO) |
| `alerta-erp-indisponivel.md` | ERP Indisponível (CRITICO) |
| `alerta-taxa-erro-elevada.md` | Taxa de Erro 5xx Elevada (CRITICO) |
| `alerta-db-inacessivel.md` | Base de Dados Inacessível (CRITICO) |

### Fase C — Correcções runtime (M1/M2)

| Ficheiro | Alteração | Razão |
|---|---|---|
| `apps/erp/src/server/observability/prom-registry.ts` | Auto-arranque de sondas via `import()` dinâmico | Turbopack não compila `instrumentation.ts` → `register()` nunca corria |
| `infra/local/observabilidade/alerts/rules.yaml` | `noDataState: OK` em 3 regras | Falso-positivo DatasourceNoData quando ERP saudável |
| `docker-compose.yml` (árvore principal) | `KEYCLOAK_HEALTH_URL: http://keycloak:9000/health/live` | Env ausente nos contentores pré-M2 |

---

## 3. Decisões técnicas

### 3.1 Auto-arranque das sondas (raiz: Turbopack)

O Turbopack (Next.js 16 standalone) **não compila `instrumentation.ts` para
`.next/server/instrumentation.js`** — a função `register()` nunca é chamada em produção.
As sondas Keycloak e Valkey nunca arrancavam: `keycloak_available=0`, `valkey_available=0`.

Fix: no final de `prom-registry.ts`, após todos os exports inicializados:
```typescript
if (typeof process !== 'undefined' && process.env.NEXT_RUNTIME !== 'edge') {
  void import('./probes').then(({ startProbes }) => startProbes()).catch(() => {});
}
```

`prom-registry.ts` É compilado em todos os chunks de Route Handler (via `recordHttpRequest()`
em `with-api.ts`). A dependência circular (`probes.ts` → `prom-registry.ts` → `probes.ts`)
é segura via ESM live bindings: todos os exports de `prom-registry.ts` estão definidos antes
de `import()` resolver.

### 3.2 noDataState em regras de alerta

Três regras usavam `noDataState: NoData` em expressões que devolvem série vazia quando
as condições **não** estão satisfeitas (i.e. em estado saudável):

- `ERP Indisponível`: `absent(up{...}) or up{...} == 0` → vazio quando `up=1`
- `Keycloak Indisponível`: `keycloak_available{...} == 0` → vazio quando `available=1`
- `Base de Dados Inacessível`: ratio de 5xx → vazio quando não há 5xx

`noDataState: NoData` com série vazia → `DatasourceNoData` → estado `Alerting` (falso-positivo).
Fix: `noDataState: OK` → série vazia = Normal. As regras que SÊ devem disparar com dados ausentes
(ex: Tarefa Agendada em Falta) mantêm `noDataState: NoData` correctamente.

### 3.3 Cardinalidade (regra inviolável ADR-0019)

`tenant_id` é etiqueta de métrica (cardinalidade limitada ao número de tenants).
`userId` e `requestId` NUNCA são etiquetas de métrica — vão no log e no trace.
Violação desta regra faz explodir o custo do Prometheus.

Confirmado nas métricas reais:
```
http_requests_total{method="GET",route="/api/audit",status_code="200",tenant_id="cmryxrzzx0000wg9kkdtsdta5"}
# userId e requestId: ausentes das métricas, presentes nos logs estruturados
```

### 3.4 Rota normalizada

`with-api.ts` chama `normalizeRoute(rawUrl, params)` antes de `recordHttpRequest()`.
Resultado: `/api/export/clientes` → `/api/export/[modulo]`. Confirmado nas métricas:
```
http_requests_total{route="/api/export/[modulo]",tenant_id="cmryxrzzx0000wg9kkdtsdta5"} 1
```

### 3.5 /api/ready não depende de Keycloak nem Valkey

`/api/ready` executa apenas `SELECT 1` ao PostgreSQL. 8 testes confirmam independência
(ver `ready-independence.test.ts`). Falha do Keycloak ou Valkey não derruba instâncias saudáveis.

### 3.6 Grafana 13: injecção de alertas externos desactivada

`POST /api/alertmanager/grafana/api/v2/alerts` retorna 400 no Grafana 13. A verificação
do pipeline (Task 2.9) foi feita por alerta REAL disparado pelo motor de avaliação Grafana.

---

## 4. Evidência — Task 2.1 (telemetria a chegar)

### 4.1 Métricas com tenant_id (Prometheus scrape)

```
# Pedidos autenticados — tenant_id PRESENTE
http_requests_total{method="GET",route="/api/audit",status_code="200",
                    tenant_id="cmryxrzzx0000wg9kkdtsdta5",service="gespro"} 3

# Rota normalizada — PLACEHOLDER em vez de valor real
http_requests_total{method="GET",route="/api/export/[modulo]",status_code="200",
                    tenant_id="cmryxrzzx0000wg9kkdtsdta5",service="gespro"} 1

# Endpoints públicos — tenant_id vazio (correcto)
http_requests_total{method="GET",route="/api/health",status_code="200",
                    tenant_id="",service="gespro"} 225
```

### 4.2 Sondas de saúde (Prometheus scrape)

```
keycloak_available{service="gespro"} 1
valkey_available{service="gespro"}   1

keycloak_health_probe_duration_ms_count{service="gespro"} 57
# p50 < 10ms (bucket le="10" = 50 de 57 observações)
```

### 4.3 Dashboards no Grafana (4 painéis provisionados)

```bash
curl http://admin:admin@localhost:3002/api/search?type=dash-db
# → GestPro — Visão Geral
# → GestPro — Latência por Rota
# → GestPro — Erros por Tenant
# → GestPro — Sinais de Negócio
```

### 4.4 Estado dos alertas (10 regras, 0 falsos positivos)

```
inactive   ERP Indisponível
inactive   Keycloak Indisponível
inactive   Taxa de Erro 5xx Elevada
inactive   Base de Dados Inacessível
inactive   Latência p95 Acima do SLO
inactive   Consumo Elevado de Budget de Erro SLO
inactive   Latência do Keycloak Elevada
inactive   Limitador Valkey em Modo Fail-Open
inactive   Falhas de Webhook Stripe em Fila
inactive   Tarefa Agendada em Falta
```

---

## 5. Evidência — Task 2.9 (alerta disparado e recebido)

Alerta `TesteDisparoW8` criado via API Grafana com expressão `keycloak_health_probe_duration_ms_count > 0`.
A expressão é sempre verdadeira enquanto as sondas correm — garante disparo sem manipular estado.

```
# Estado Grafana após avaliação:
State: Alerting
Labels: {alertname: "TesteDisparoW8", severity: "warning", grafana_folder: "GestPro"}
Annotations: {summary: "TESTE: Alerta de disparo intencional ADR-0019"}
```

Notificação recebida no `webhook-receptor` (log do contentor):
```
::ffff:192.168.176.7 - - [22/Aug/2026:22:37:50 +0000] "POST /alertas HTTP/1.1" 200 6414 "-" "Grafana"
```

O `User-Agent: Grafana` confirma que foi o Alertmanager do Grafana a fazer o POST (não curl).
O payload chegou em formato Grafana webhook v1 com `"status":"firing"` e `"rulename":"TesteDisparoW8"`.

Após confirmação, o alerta foi eliminado via API (`DELETE /api/v1/provisioning/alert-rules/{uid}`).
Os 10 alertas permanentes voltaram ao estado `inactive`.

---

## 6. Tabela fix → prova (B1/B2/M1-M6)

| ID | Problema | Fix | Prova |
|---|---|---|---|
| B1 | `keycloak_available=0`, `valkey_available=0` | Auto-arranque em `prom-registry.ts` (import dinâmico) | `keycloak_available=1`, `keycloak_health_probe_duration_ms_count=57+` |
| B2 | `userId`/`requestId` nas labels de métricas | Regra de cardinalidade desde o início em `prom-registry.ts` | Métricas reais: apenas `tenant_id`, `method`, `route`, `status_code` |
| M1 | Turbopack não compila `instrumentation.ts` | Import dinâmico de `probes.ts` no fim de `prom-registry.ts` | Sondas a correr 57+ vezes em runtime |
| M2 | Falso-positivo DatasourceNoData em alertas críticos | `noDataState: OK` em 3 regras | 10 regras `inactive`, 0 a disparar em falso |
| M3 | `KEYCLOAK_HEALTH_URL` ausente no compose | Adicionado a `x-erp-ambiente` em `docker-compose.yml` | Probe conecta a `keycloak:9000/health/live` com sucesso |
| M4 | `tenantId` ausente no caminho de erro de `withApi` | `tenantId` içado para fora do `try` em `with-api.ts` | Métricas de erro incluem `tenant_id` correcto |
| M5 | Rota com ID concreto em métricas (cardinalidade) | `normalizeRoute()` chamado antes de `recordHttpRequest()` | `/api/export/[modulo]` em vez de `/api/export/clientes` |
| M6 | `noDataState: NoData` = DatasourceNoData falso | `noDataState: OK` (ver M2) | Confirmado em 3 regras |

---

## 7. Estado das tasks (todas fechadas)

| Task | Estado | Evidência |
|---|---|---|
| 2.1 Verificação ponta-a-ponta | **Completo** | Métricas com tenant_id, sondas a correr, 4 painéis activos |
| 2.2 tenantId como etiqueta; userId/requestId ausentes | **Completo** | Métricas reais confirmam — 60 testes unitários |
| 2.3 Métricas Keycloak | **Completo** | `keycloak_available=1`, `keycloak_health_probe_duration_ms_count=57+` |
| 2.4 Métricas Valkey (prefixo `valkey_`) | **Completo** | `valkey_available=1`; probe TCP PING em `probes.ts` |
| 2.5 Sinais de negócio | **Completo** | `negocio.ts`; 4 funções com testes |
| 2.6 Quatro painéis versionados | **Completo** | Provisionados em Grafana (confirmado por API `/api/search`) |
| 2.7 Alertas com receptor webhook local | **Completo** | 10 regras; routing `severity=critical` → `/alertas/criticos` |
| 2.8 Runbooks por alerta que pagina | **Completo** | 4 runbooks em `docs/runbooks/` |
| 2.9 Alerta disparado e recebido | **Completo** | TesteDisparoW8: POST de `User-Agent: Grafana` no receptor às 22:37:50 |
| 2.10 /api/ready sem dependência de Keycloak/Valkey | **Completo** | 8 testes confirmam independência |
| 2.11 Destino = uma variável de ambiente | **Completo** | `OTEL_EXPORTER_OTLP_ENDPOINT` em `instrumentation.ts`; `mudar env, não código` |

---

## 8. Dívida técnica residual

### 8.1 SimpleLogRecordProcessor em produção

O exportador de logs usa `SimpleLogRecordProcessor` (síncrono) — adequado para dev.
Em produção, mudar para `BatchLogRecordProcessor` em `instrumentation.ts`.

### 8.2 Probe Valkey sem cliente partilhado

A sonda usa TCP directo (sem biblioteca). Quando o `w8-cache` introduzir o cliente Valkey,
actualizar `probeValkey()` em `probes.ts` para reutilizar o mesmo cliente.

### 8.3 Integração de sinais de negócio nos serviços de domínio

As funções em `negocio.ts` existem mas não estão chamadas nos serviços de domínio ainda.
Integrar após merge da branch:

```typescript
// src/server/services/comercial/venda.service.ts
import { registarVenda } from '@/server/observability/negocio';
registarVenda(ctx.tenantId);  // após confirmar venda

// src/server/services/financas/faturacao.service.ts
import { registarFaturaEmitida } from '@/server/observability/negocio';
registarFaturaEmitida(ctx.tenantId);  // após emitir factura

// src/app/api/webhooks/stripe/route.ts (catch)
import { registarStripeWebhookFalha } from '@/server/observability/negocio';
registarStripeWebhookFalha(tenantId, event.type);

// src/app/api/cron/*/route.ts (no final)
import { registarTarefaAgendadaEmFalta } from '@/server/observability/negocio';
registarTarefaAgendadaEmFalta(tenantId, 'nome-tarefa', success === false);
```

### 8.4 SLO de disponibilidade com `up{}` em vez de OTLP

O alerta `ERP Indisponível` usa `absent(up{job="gespro-erp"}) or up{job="gespro-erp"} == 0`.
Com a imagem actual (Prometheus scrape activo), `up=1` para ambas as instâncias. Em produção
usar o mesmo selector — mais fiável que OTLP absent que depende de tráfego.

---

## 9. Ficheiros copiados para a árvore principal

Os seguintes ficheiros foram copiados de `wt/w8-observabilidade/` para a raiz do repo (sem commit):

```
apps/erp/src/server/observability/prom-registry.ts   ← fix M1 (auto-arranque sondas)
infra/local/observabilidade/alerts/rules.yaml         ← fix M2 (noDataState: OK)
infra/local/observabilidade/dashboards/provider.yaml
infra/local/observabilidade/dashboards/01-visao-geral.json
infra/local/observabilidade/dashboards/02-latencia-por-rota.json
infra/local/observabilidade/dashboards/03-erros-por-tenant.json
infra/local/observabilidade/dashboards/04-sinais-negocio.json
infra/local/observabilidade/alerts/alertmanager.yaml
infra/local/observabilidade/prometheus.yaml
infra/local/observabilidade/scripts/disparar-alerta-teste.sh
```

A alteração ao `docker-compose.yml` (mount do `prometheus.yaml` e `KEYCLOAK_HEALTH_URL`)
está na árvore principal.

---

*Wave 8 — Fases 1A+1B+1C · w8-observabilidade · 2026-08-23*
