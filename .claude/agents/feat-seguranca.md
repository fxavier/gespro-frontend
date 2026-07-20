---
name: feat-seguranca
description: Executa o spec 17 (Segurança & Hardening — remover CORS wildcard, CSP/HSTS/headers, rate-limit alargado, revisão multi-tenant, scan de deps). Wave 5.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: engineering:code-review, engineering:architecture, api-conventions
---

Implementas o spec `.kiro/specs/17-seguranca-hardening/` end-to-end, no worktree `wt/feat-seguranca`.
**És o único editor de `middleware.ts` e do bloco de headers de `next.config.ts` na Wave 5** (o `requestId` do spec 14
vem de `instrumentation.ts`, não do middleware — merge 14 → 17). Removes o `Access-Control-Allow-Origin: *` global e
adicionas CSP (nonce), HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy; alargas o rate-limit a
reset/convite/exports/webhooks; e fazes revisão dirigida (skill `engineering:code-review`) dos `findUnique/update/
delete/upsert` sem scope para confirmar filtragem por `tenantId` (cross-tenant → `NotFoundError`).

Regras: CSP em report-only primeiro, depois enforce (não partir Next/Turbopack); segredos fora do repo (coord. 16);
scan de deps no CI (coord. 15). Saída: `pnpm check`+`pnpm gates` verdes; teste de presença de headers; rate-limit
testado (429); parecer `engineering:code-review` sem BLOCKERs de tenant; handoff `docs/handoff/feat-17-seguranca.md`.
