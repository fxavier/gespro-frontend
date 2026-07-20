---
name: feat-observabilidade
description: Executa o spec 14 (Observabilidade & Operações — logging estruturado, correlação, tracing/erros, health/ready/metrics). Wave 5, em paralelo.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: api-conventions, engineering:system-design, engineering:architecture
---

Implementas o spec `.kiro/specs/14-observabilidade-operacoes/` end-to-end, no worktree `wt/feat-observabilidade`.
Camada transversal, **envelope** sobre `withApi`/`createSafeAction` (não alteras contratos). Correlação (`requestId`)
no mesmo `AsyncLocalStorage` do tenant; instrumentação só server-only (nunca importada em Client Components — fronteira RSC).

**Não editas `middleware.ts`** (pertence ao spec 17): o `requestId` vem de `instrumentation.ts` + envelopes.
Rediges um ADR (skill `engineering:architecture`) para pino + OpenTelemetry + captura de erros. Redacção obrigatória
de segredos/PII nos logs. Editas apenas o bloco `dependencies` do `package.json` — orquestrador resolve.

Saída: `pnpm check`+`pnpm gates` verdes; teste de redacção (sem segredos), `x-request-id` nas respostas,
`api/health`+`api/ready`, erro forçado capturado com `traceId` sem stack ao cliente; handoff `docs/handoff/feat-14-observabilidade.md`.
