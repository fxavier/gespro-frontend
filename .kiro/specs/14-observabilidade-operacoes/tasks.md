# Plano de Implementação: Observabilidade & Operações

Depende de: fundação (withApi/safe-action/AsyncLocalStorage). Worktree `wt/feat-observabilidade`.
Skills: `api-conventions`, `engineering:system-design`, `engineering:architecture`. **Não** edita `middleware.ts` (spec 17).

- [ ] 1. Decisão e dependências
  - [ ] 1.1 ADR `docs/decisions/ADR-00xx-observabilidade.md` (pino + OTel + captura de erros)
  - [ ] 1.2 Deps: `pino`(+`pino-pretty` dev), `@opentelemetry/*`, exporter OTLP, (opcional) `@sentry/nextjs`, `prom-client`

- [ ] 2. Logging e correlação
  - [ ] 2.1 `observability/logger.ts` (JSON/pretty, níveis, redacção)
  - [ ] 2.2 `observability/context.ts` (`requestId` em `AsyncLocalStorage`, compõe com tenant context)
  - [ ] 2.3 Envelopar `withApi` e `createSafeAction` (gerar/propagar `requestId`, medir, logar, `x-request-id`)

- [ ] 3. Tracing e erros
  - [ ] 3.1 `instrumentation.ts` com OTel NodeSDK + Prisma instrumentation (exporter por env, amostragem)
  - [ ] 3.2 Captura de exceções com `traceId`/tenant; cliente recebe `ActionResult`/envelope sem stack

- [ ] 4. Saúde e métricas
  - [ ] 4.1 `api/health` (liveness) e `api/ready` (DB `SELECT 1`)
  - [ ] 4.2 `api/metrics` (RED) protegido / OTel metrics; documentar recolha

- [ ] 5. Verificação
  - [ ] 5.1 `pnpm check` + `pnpm gates` verdes; logger nunca importado em Client Components
  - [ ] 5.2 Teste de redacção (sem segredos nos logs); `x-request-id` nas respostas; erro forçado capturado
  - [ ] 5.3 Handoff `docs/handoff/feat-14-observabilidade.md`
