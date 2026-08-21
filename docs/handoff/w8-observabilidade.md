# Handoff — w8-observabilidade

**Wave**: 8 — Prontidão para Produção
**Fase**: 1 — Ambiente local de referência
**Branch**: w8-observabilidade
**Data**: 2026-08-21
**ADRs**: ADR-0019, ADR-0026

---

## 1. Resumo do trabalho feito

Implementação do ADR-0019 revisado pelo ADR-0026: a telemetria passa a ter destino e estrutura,
os painéis e alertas estão em ficheiro versionado, e os runbooks obrigatórios foram escritos.

**Princípio central**: mudar de destino de telemetria é mudar `OTEL_EXPORTER_OTLP_ENDPOINT` —
não código. Esta propriedade foi verificada por leitura de código e por teste.

---

## 2. Ficheiros criados ou modificados

### Novos (observabilidade)
| Ficheiro | Propósito |
|---|---|
| `apps/erp/src/server/observability/prom-registry.ts` | Registo Prometheus com prom-client; métricas RED, Keycloak, Valkey, negócio; regras de cardinalidade |
| `apps/erp/src/server/observability/probes.ts` | Sondas de saúde Keycloak e Valkey (TCP PING para Valkey); arrancam em background, nunca bloqueiam |
| `apps/erp/src/server/observability/negocio.ts` | Funções de registo de sinais de negócio (vendas, facturas, webhooks, tarefas) |

### Modificados
| Ficheiro | Alteração |
|---|---|
| `apps/erp/instrumentation.ts` | Adiciona exportador OTLP de logs (`@opentelemetry/exporter-logs-otlp-http`) e chama `startProbes()` |
| `apps/erp/src/app/api/metrics/route.ts` | Serve métricas em formato Prometheus text (prom-client) em vez de JSON simples |
| `apps/erp/src/lib/api/with-api.ts` | Chama `recordHttpRequest()` com `tenantId`, `route`, `statusCode`, `durationMs` |

### Novos (testes)
| Ficheiro | O que testa |
|---|---|
| `apps/erp/src/server/observability/__tests__/prom-registry.test.ts` | Cardinalidade de etiquetas (tenant_id presente; userId/requestId ausentes); registo; recordHttpRequest |
| `apps/erp/src/server/observability/__tests__/negocio.test.ts` | Contadores de negócio; labels correctos |
| `apps/erp/src/server/observability/__tests__/ready-independence.test.ts` | /api/ready sem dependência de Keycloak/Valkey; sondas com timeout e captura de erros |

### Infraestrutura local (`infra/local/observabilidade/`)
| Ficheiro | Propósito |
|---|---|
| `dashboards/01-visao-geral.json` | Painel: disponibilidade ERP/Keycloak/Valkey, taxa de pedidos, erros, SLO de latência |
| `dashboards/02-latencia-por-rota.json` | Painel: tabela e séries temporais de latência por rota; Keycloak e Valkey separados |
| `dashboards/03-erros-por-tenant.json` | Painel: taxa de erro por tenant; variável de filtragem por tenant |
| `dashboards/04-sinais-negocio.json` | Painel: vendas/min, facturas, falhas Stripe, tarefas em falta |
| `grafana-provisioning/dashboards/provider.yaml` | Configuração de aprovisionamento de painéis Grafana |
| `grafana-provisioning/datasources/datasources.yaml` | Fontes de dados (Prometheus, Loki, Tempo) com UIDs estáveis |
| `grafana-provisioning/alerting/alertmanager.yaml` | Receptor de webhook local; routing por severidade |
| `alerts/rules.yaml` | 4 alertas críticos + 5 avisos (Grafana alerting YAML) |
| `scripts/disparar-alerta-teste.sh` | Script de verificação ponta-a-ponta (task 2.9 — aguarda pilha) |

### Runbooks (`docs/runbooks/`)
| Ficheiro | Alerta |
|---|---|
| `alerta-keycloak-indisponivel.md` | Keycloak Indisponível (CRITICO) |
| `alerta-erp-indisponivel.md` | ERP Indisponível (CRITICO) |
| `alerta-taxa-erro-elevada.md` | Taxa de Erro 5xx Elevada (CRITICO) |
| `alerta-db-inacessivel.md` | Base de Dados Inacessível (CRITICO) |

---

## 3. Decisões tomadas

### Registo de métricas Prometheus (prom-client vs OTLP metrics SDK)

Optei por usar `prom-client` (já em `package.json`) para métricas em vez do OTLP Metrics SDK,
por duas razões:
1. `prom-client` já estava na dependência — sem novos pacotes.
2. O `otel-lgtm` tem Prometheus interno que pode raspar `/api/metrics` em formato text.

A alternativa (OTLP metrics exporter) exigiria `@opentelemetry/sdk-metrics` +
`@opentelemetry/exporter-metrics-otlp-http`, o que é mais correcto arquitecturalmente mas
adiciona 2 pacotes. Se o w8-plataforma-local preferir OTLP puro para métricas, a migração
é em `prom-registry.ts` e `instrumentation.ts` — não no resto do código.

### Probe do Valkey via TCP directo

A sonda do Valkey usa `node:net` para enviar um PING RESP directo, sem dependência de cliente Redis.
O w8-cache (fase 2) introduzirá o cliente Valkey partilhado. Quando isso acontecer, a sonda pode
ser actualizada para usar o mesmo cliente, garantindo que é o mesmo caminho de ligação.

### tenantId vazio para endpoints públicos

`recordHttpRequest()` aceita `tenantId` opcional; endpoints públicos (health, ready, metrics)
passam string vazia. Isto é intencional: evita `unknown` ou `null` no Prometheus e mantém
a séria temporal consistente.

### Receptor webhook local para alertas

O destino de alertas em produção (e-mail, canal de mensagens) fica para quando houver produção
(ADR-0019 §Consequências). Localmente, os alertas vão para o `webhook-sink` que o
`w8-plataforma-local` define no compose. As regras de routing estão em
`grafana-provisioning/alerting/alertmanager.yaml`.

---

## 4. Pedidos de coordenação ao w8-plataforma-local

Para o correcto funcionamento da pilha local, o w8-plataforma-local deve:

### 4.1 Montagens no contentor `otel-lgtm`

```yaml
# No serviço otel-lgtm do docker-compose.yml:
volumes:
  # Painéis Grafana
  - ./infra/local/observabilidade/dashboards:/var/lib/grafana/dashboards/gespro:ro
  # Aprovisionamento Grafana
  - ./infra/local/observabilidade/grafana-provisioning/dashboards:/etc/grafana/provisioning/dashboards:ro
  - ./infra/local/observabilidade/grafana-provisioning/datasources:/etc/grafana/provisioning/datasources:ro
  - ./infra/local/observabilidade/grafana-provisioning/alerting:/etc/grafana/provisioning/alerting:ro
  - ./infra/local/observabilidade/alerts:/etc/grafana/provisioning/alerting/rules:ro
```

### 4.2 Serviço webhook-sink

O script `disparar-alerta-teste.sh` e o routing de alertas apontam para
`http://webhook-sink:9999`. Este serviço precisa de ser definido no `docker-compose.yml`.

Implementação mínima sugerida (qualquer servidor HTTP que aceite POST e guarde em memória):

```yaml
webhook-sink:
  image: mendhak/http-https-echo:latest
  ports:
    - "9999:8080"
  environment:
    HTTP_PORT: "8080"
```

Ou um serviço mais completo que persista e exponha `/alerts/recebidos` para consulta.

### 4.3 Scraping do Prometheus para /api/metrics

O Prometheus interno do `otel-lgtm` precisa de raspar o endpoint `/api/metrics` das instâncias ERP.
Se o `otel-lgtm` permitir configuração de scraping, acrescentar:

```yaml
# prometheus.yml (se montado no otel-lgtm)
scrape_configs:
  - job_name: gespro-erp
    static_configs:
      - targets: ['erp-1:3000', 'erp-2:3000']
    metrics_path: /api/metrics
    # Se METRICS_SECRET estiver definido:
    # authorization:
    #   credentials: <METRICS_SECRET>
```

### 4.4 Variáveis de ambiente obrigatórias nas instâncias ERP

```env
# Endpoint OTLP do otel-lgtm (porta 4318 HTTP ou 4317 gRPC)
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-lgtm:4318

# Opcional mas recomendado
OTEL_SERVICE_NAME=gespro
OTEL_SAMPLE_RATE=1

# Para probe do Keycloak
KEYCLOAK_ISSUER=http://keycloak:8080/realms/gespro

# Para probe do Valkey
VALKEY_URL=redis://valkey:6379
```

### 4.5 Porta do Grafana

O script de teste usa `GRAFANA_URL=http://localhost:3001` por omissão para evitar conflito
com o ERP em `:3000`. Confirmar a porta do Grafana no `otel-lgtm` e ajustar se necessário.

---

## 5. Estado das tasks

| Task | Estado | Notas |
|---|---|---|
| 2.1 Ligar exportador OTLP | Parcialmente pronto | Código feito; verificação ao vivo aguarda pilha |
| 2.2 tenantId como etiqueta; userId/requestId ausentes | Completo | 23 testes a verificar cardinalidade |
| 2.3 Métricas Keycloak | Completo | `probes.ts` implementado; verificação ao vivo aguarda pilha |
| 2.4 Métricas Valkey (prefixo `valkey_`) | Completo | Probe TCP implementada; verificação ao vivo aguarda pilha |
| 2.5 Sinais de negócio | Completo | `negocio.ts` com 4 funções; testes verdes |
| 2.6 Quatro painéis versionados | Completo | JSON em `infra/local/observabilidade/dashboards/` |
| 2.7 Alertas com receptor webhook local | Completo | `rules.yaml` + `alertmanager.yaml`; aguarda pilha para confirmar routing |
| 2.8 Runbooks por alerta que pagina | Completo | 4 runbooks em `docs/runbooks/` |
| 2.9 Alerta disparado e recebido | Aguarda pilha | Script preparado em `scripts/disparar-alerta-teste.sh` |
| 2.10 /api/ready sem dependência de Keycloak/Valkey | Completo | 8 testes confirmam independência |
| 2.11 Destino = uma variável de ambiente | Completo | `OTEL_EXPORTER_OTLP_ENDPOINT` em `instrumentation.ts` |

---

## 6. Dívida técnica

### 6.1 OTLP metrics SDK (dívida menor)

As métricas são expostas em formato Prometheus text via `prom-client`. O destino ideal
(OTLP metrics para o colector do `otel-lgtm`) requer `@opentelemetry/sdk-metrics`.
Actualmente, o Prometheus do `otel-lgtm` raspa `/api/metrics` — o que funciona mas não é
o padrão OTLP puro. Migração futura: substituir `prom-client` por OTel metrics SDK quando
a pilha estiver estável.

### 6.2 Probe do Valkey sem cliente partilhado

A sonda do Valkey usa TCP directo. Quando o w8-cache introduzir o cliente Valkey na fase 2,
`probeValkey()` em `probes.ts` deve ser actualizada para usar o mesmo cliente.

### 6.3 Alertas dependentes de `up{job="gespro-erp"}`

O alerta `ERP Indisponível` usa `up{job="gespro-erp"}`. Esta métrica requer que o Prometheus
tenha um scrape job configurado com esse nome. Se o `otel-lgtm` não suportar scraping
configurável, a métrica não existe e o alerta fica em `NoData`. Alternativa: usar
`probe_success` via blackbox exporter, ou ajustar a expressão para usar `/api/health`.

### 6.4 SimpleLogRecordProcessor vs BatchLogRecordProcessor

O exportador de logs usa `SimpleLogRecordProcessor` (síncrono) por ser mais simples em dev.
Em produção, considerar `BatchLogRecordProcessor` para não bloquear o event loop.

---

## 7. Como fechar as tasks 2.1 e 2.9 (após merge da pilha)

Quando `w8-plataforma-local` fundir e a pilha estiver a correr:

```bash
# 1. Fazer merge da integração
git -C /Users/xavier/dev/code/workspace/2026/gespro/wt/w8-observabilidade \
  merge w8/integracao

# 2. Levantar a pilha completa
docker compose --profile full up -d

# 3. Aguardar arranque (30-60 segundos)
sleep 60

# 4. Correr o script de verificação
bash infra/local/observabilidade/scripts/disparar-alerta-teste.sh

# 5. Verificar no Grafana
# http://localhost:3001 → GestPro → Visão Geral
# http://localhost:3001 → Alerting → confirmar regras provisionadas

# 6. Fechar as tasks:
#   2.1: telemetria a chegar (traces em Tempo, logs em Loki, métricas em Prometheus)
#   2.9: alerta disparado e recebido no webhook-sink
```

---

## 8. Como integrar métricas de negócio nos serviços de domínio

Após o merge, importar de `@/server/observability/negocio`:

```typescript
// Em src/server/services/comercial/venda.service.ts
import { registarVenda } from '@/server/observability/negocio';

// Após confirmar a venda:
registarVenda(ctx.tenantId);

// Em src/server/services/financas/faturacao.service.ts
import { registarFaturaEmitida } from '@/server/observability/negocio';

// Após passar a factura para estado EMITIDA:
registarFaturaEmitida(ctx.tenantId);
```

Para webhooks Stripe (já há handler em `/api/webhooks/stripe`):
```typescript
import { registarStripeWebhookFalha } from '@/server/observability/negocio';

// No catch do handler:
registarStripeWebhookFalha(tenantId, event.type);
```

Para tarefas agendadas (handlers em `/api/cron/*`):
```typescript
import { registarTarefaAgendadaEmFalta } from '@/server/observability/negocio';

// No início do cron (verificar se a execução anterior falhou):
// (implementar lógica de detecção de falta — ex: comparar timestamp)

// No fim do cron com sucesso:
registarTarefaAgendadaEmFalta(tenantId, 'expirar-trials', false);

// No fim do cron com falha:
registarTarefaAgendadaEmFalta(tenantId, 'expirar-trials', true);
```

---

*Wave 8 — Fase 1 · w8-observabilidade · 2026-08-21*
