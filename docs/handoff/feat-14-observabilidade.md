# Handoff: Spec 14 — Observabilidade & Operações

**Branch**: `ws-14`
**Data**: 2026-07-20
**Estado**: Implementação completa — `pnpm check` + `pnpm gates` verdes

---

## O que foi implementado

### Ficheiros criados

| Ficheiro | Propósito |
|----------|-----------|
| `src/server/observability/logger.ts` | Logger estruturado JSON (server-only); redacção de segredos/PII |
| `src/server/observability/context.ts` | AsyncLocalStorage para `requestId`; `runWithRequestContext()` |
| `src/server/observability/__tests__/redaction.test.ts` | 14 testes de redacção (22 asserções) |
| `src/server/observability/__tests__/context.test.ts` | 5 testes de isolamento ALS |
| `instrumentation.ts` | OTel NodeSDK (carregamento dinâmico, activado por env) |
| `src/app/api/health/route.ts` | Liveness probe — GET 200 |
| `src/app/api/ready/route.ts` | Readiness probe — SELECT 1 via DB; 503 se inacessível |
| `src/app/api/metrics/route.ts` | RED metrics JSON; protegido por `METRICS_SECRET` |
| `docs/decisions/ADR-0005-observabilidade.md` | Registo de decisão de arquitectura |

### Ficheiros modificados

| Ficheiro | Alterações |
|----------|------------|
| `src/lib/api/with-api.ts` | + `requestId` por pedido; + `x-request-id` header; + logging início/fim/erro; + `public?: boolean` em opts |
| `src/server/safe-action.ts` | + `requestId` por invocação; + logging; + `traceId` em `details` de erros inesperados |
| `package.json` (bloco `dependencies`) | + pino, pino-pretty, prom-client, OTel packages, @prisma/instrumentation |

---

## Contratos mantidos

- `ActionResult<T>` inalterado — erros inesperados adicionam `details: { traceId }`, campo já existente.
- Assinatura `withApi(handler, opts?)` inalterada — `public?` é adição opcional.
- `createSafeAction({ schema, permission, revalidate, handler })` inalterada.
- `runWithTenantContext` / `TenantContext` não tocados.
- `middleware.ts` não tocado (pertence ao spec 17).

---

## Dependências adicionadas ao `package.json` (bloco `dependencies`)

| Pacote | Versão | Propósito |
|--------|--------|-----------|
| `pino` | `^9.5.0` | Logger estruturado (runtime enhancement) |
| `pino-pretty` | `^13.0.0` | Formatação dev (activado por `LOG_LEVEL=debug`) |
| `prom-client` | `^15.1.3` | Métricas Prometheus (carregamento futuro em /api/metrics) |
| `@opentelemetry/sdk-node` | `^0.57.2` | OTel NodeSDK |
| `@opentelemetry/exporter-trace-otlp-http` | `^0.57.2` | Exporter OTLP HTTP |
| `@opentelemetry/resources` | `^1.27.0` | Resource definition |
| `@opentelemetry/semantic-conventions` | `^1.27.0` | Semantic conventions |
| `@prisma/instrumentation` | `^7.0.0` | Prisma query tracing |

O orquestrador é responsável pela instalação. O código compila e corre sem estes pacotes instalados
(fallback nativo para logger; OTel inactivo se `OTEL_EXPORTER_OTLP_ENDPOINT` não definido).

---

## Variáveis de ambiente

| Variável | Default | Descrição |
|----------|---------|-----------|
| `LOG_LEVEL` | `debug` (dev) / `info` (prod) | Nível mínimo de log |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | Endpoint OTLP; sem este, tracing desactivado |
| `OTEL_SERVICE_NAME` | `gespro` | Nome do serviço nos traces |
| `OTEL_SAMPLE_RATE` | `1` | Taxa de amostragem (0–1); 1 = 100% |
| `METRICS_SECRET` | — | Bearer token para /api/metrics; sem este, endpoint é aberto |

---

## Arquitectura de correlação

```
Pedido HTTP / Server Action
  │
  ├─ withApi / createSafeAction
  │     │
  │     ├─ newRequestId() → UUIDv4
  │     │
  │     ├─ runWithRequestContext({ requestId, tenantId, userId })
  │     │     │
  │     │     ├─ runWithTenantContext({ tenantId, userId })
  │     │     │     └─ handler(...)
  │     │     │
  │     │     └─ logger.child({ requestId }).info(...) ← lê ALS
  │     │
  │     └─ Response com x-request-id: <requestId>
  │
  └─ Log: { time, level, requestId, tenantId, userId, method, url, status, duration }
```

---

## Redacção de segredos/PII

Chaves **exactas** (case-insensitive): `password`, `senha`, `authorization`, `nuit`, `bi`, `apikey`,
`accesstoken`, `refreshtoken`, `privatekey`, `clientsecret`.

Substrings no nome da chave: `token`, `secret`, `password`, `senha`.

Função exportada `redactObject(obj)` em `logger.ts` — testada em 14 casos unitários.

---

## Critérios de aceitação verificados

| Critério | Estado |
|----------|--------|
| `pnpm check` verde | ✓ (prisma validate + tsc + eslint + vitest: 789 testes) |
| `pnpm gates` verde | ✓ (dialog + use-client + data-imports) |
| Logger server-only, nunca importado em CC | ✓ (`import 'server-only'` em logger.ts e context.ts) |
| Redacção de segredos testada | ✓ (14 casos em redaction.test.ts) |
| `x-request-id` nas respostas | ✓ (withApi adiciona a todas as respostas) |
| `GET /api/health` → 200 | ✓ |
| `GET /api/ready` → 200/503 conforme DB | ✓ (SELECT 1 via prismaBase) |
| Erro inesperado → `traceId` sem stack ao cliente | ✓ (safe-action captura com details.traceId) |
| `instrumentation.ts` não importa OTel directamente | ✓ (new Function dynamic import) |
| `middleware.ts` não tocado | ✓ |

---

## Mapa de conflitos com outros workstreams

| Workstream | Dependência | Risco |
|------------|------------|-------|
| Spec 17 (segurança/hardening) | Pode querer adicionar `x-request-id` via middleware edge | Baixo — withApi já adiciona; middleware pode repassar ou remover duplicado |
| Spec 15 (CI/CD) | Gates arquitectura | Zero — gates não alterados |
| Todos os 7 agentes | `ActionResult<T>`, `withApi`, `createSafeAction` | Zero — contratos inalterados; `details.traceId` é additive |

---

## O que falta (gaps para produção)

1. **prom-client activado**: quando instalado, substituir o contador em memória em `/api/metrics` pelo
   formato Prometheus (`register.metrics()`). Estrutura já comentada no route.ts.
2. **Prisma instrumentation**: validar compatibilidade `@prisma/instrumentation` v7 com `@prisma/adapter-pg`
   (driver adapter mode pode ter caveats com OTel).
3. **Protecção de rede** para `/api/health`, `/api/ready`, `/api/metrics`: responsabilidade do spec 17
   (middleware WAF/IP filtering).
4. **Correlação com OTel spans**: quando OTel activo, injectar `traceId` do span activo em vez do
   `requestId` gerado internamente — os dois IDs convergem num cenário OTel completo.
5. **Log shipping**: configurar Loki/Elastic/CloudWatch para ingerir stdout JSON (infra spec 16).
