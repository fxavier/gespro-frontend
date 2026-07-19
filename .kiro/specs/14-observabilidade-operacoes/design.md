# Design: Observabilidade & Operações

## Arquitectura

Camada transversal, **envelope** sobre os pipelines existentes (não altera contratos). O contexto de correlação
vive no mesmo `AsyncLocalStorage` já usado para o tenant, evitando threading manual. Toda a instrumentação é
**server-only**; nada é importado por Client Components (respeita a fronteira RSC do `CLAUDE.md`).

## Componentes

- `src/server/observability/logger.ts` — `pino` (JSON em prod, `pino-pretty` em dev), níveis por `LOG_LEVEL`,
  `redact` de `password`, `authorization`, `token`, `*.secret`. Child logger por request com `requestId/tenantId/userId`.
- `instrumentation.ts` (raiz) — regista o OTel `NodeSDK` (traces + Prisma instrumentation) no arranque; exporter OTLP
  por `OTEL_EXPORTER_OTLP_ENDPOINT`. `register()` do Next 16.
- `src/server/observability/context.ts` — `runWithRequestContext({requestId})` (compõe com `runWithTenantContext`)
  e `getRequestContext()`.
- Envelopes: estender `withApi` e `createSafeAction` para (1) gerar/propagar `requestId`, (2) abrir um span,
  (3) medir duração, (4) logar início/fim/erro, (5) devolver `x-request-id`. Erros passam por `AppError`→envelope.
- `src/app/api/{health,ready,metrics}/route.ts` — `withApi`; `ready` faz `SELECT 1` via `prismaBase`.

## Segurança e privacidade

- Redacção obrigatória; não logar corpos de request com PII; NUIT/BI mascarados conforme política.
- `api/metrics` e traces não expõem dados de negócio; endpoints protegidos (ou só rede interna — coordenar com 16/17).

## Decisões (ADR)

- ADR `docs/decisions/ADR-00xx-observabilidade.md`: escolha `pino` + OpenTelemetry + (Sentry|OTel logs), formato de
  correlação, e o que é recolhido (RED). Usar `engineering:architecture` para o registo.

## Riscos

- Overhead de tracing → amostragem configurável. OTel + Turbopack/Next 16: validar `instrumentation.ts` no runtime
  Node (não edge). Não introduzir `Float`/PII nos atributos de span.
