# Requisitos: Observabilidade & Operações

## Introdução

O sistema tem `AuditLog` de **negócio**, mas **nenhuma observabilidade operacional**: sem logging
estruturado, sem tracing distribuído, sem captura de erros e sem métricas (nenhum `pino`/OpenTelemetry/Sentry
no `package.json`), e sem endpoints de `health`/`ready`. Em produção multi-tenant isto impede diagnosticar
latência, erros e fugas por tenant. Este spec introduz observabilidade sem quebrar a fronteira RSC nem os
contratos existentes.

Skills obrigatórias: `api-conventions`, `engineering:system-design`, `engineering:architecture`.

## Requisitos

### Requisito 1 — Logging estruturado

1. DEVE existir um logger estruturado (recomendado `pino`) com saída JSON em produção e pretty em dev, níveis
   configuráveis por env, e **redacção** de campos sensíveis (password, tokens, Authorization, NUIT/BI conforme política).
2. Cada log de request DEVE incluir `tenantId`, `userId` (quando existam, do `AsyncLocalStorage`/sessão),
   `requestId`/`traceId`, rota, método, duração e status. **Nunca** logar segredos nem PII desnecessária.

### Requisito 2 — Correlação de pedidos

1. DEVE existir um `requestId`/`traceId` por pedido, propagado via `AsyncLocalStorage` e incluído em logs e na
   resposta (`x-request-id`). Gerado em `instrumentation.ts` + envelopado em `withApi`/`createSafeAction` —
   **não** no `middleware.ts` (que é edge e pertence ao spec 17).

### Requisito 3 — Tracing e erros

1. DEVE ser integrado OpenTelemetry (traces das rotas e das queries Prisma) exportável por OTLP (endpoint por env),
   e captura de exceções (Sentry ou OTel logs) com contexto de tenant/rota, **sem** enviar PII.
2. Erros não tratados em Server Actions/Route Handlers DEVEM ser registados com `traceId` e devolver `ActionResult`/
   envelope sem vazar stack ao cliente (mantém o contrato `AppError`).

### Requisito 4 — Saúde e métricas

1. Route Handlers `api/health` (liveness) e `api/ready` (readiness: DB reachable) via `withApi` (público controlado).
2. Métricas básicas (RED: rate/errors/duration) expostas para scraping (ex.: `prom-client` em `api/metrics`,
   protegido) ou via OTel metrics. Documentar o que é recolhido.

## Critérios de Aceitação

1. `pnpm check`/`pnpm gates` verdes; logger não quebra a fronteira servidor↔cliente (nunca importado em CC).
2. Logs de request contêm `tenantId`/`requestId`/duração e **não** contêm segredos (teste de redacção).
3. `api/health` responde 200; `api/ready` reflete o estado da DB; `x-request-id` presente nas respostas.
4. Erro forçado numa action é capturado com `traceId` e o cliente recebe `ActionResult` sem stack.

## Fontes

- Código: `src/server/safe-action.ts`, `src/lib/api/with-api.ts`, `src/server/db/tenant-extension.ts`
  (`AsyncLocalStorage`), `next.config.ts`, ausência de `instrumentation.ts`.
- Skills: `api-conventions`, `engineering:system-design`, `engineering:architecture`.
