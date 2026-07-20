# Plano de Implementação: Segurança & Hardening

Depende de: middleware/next.config existentes; coordena com 14 (logs/PII), 15 (scan no CI), 16 (segredos).
Worktree `wt/feat-seguranca`. Skills: `engineering:code-review`, `engineering:architecture`, `api-conventions`.
**Único editor de `middleware.ts` e do bloco de headers de `next.config.ts` na Wave 5.**

- [ ] 1. Cabeçalhos de segurança
  - [ ] 1.1 Remover `Access-Control-Allow-Origin: *` global de `next.config.ts`
  - [ ] 1.2 CSP (nonce), HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy no `middleware.ts`
  - [ ] 1.3 CORS explícito por allowlist (`ALLOWED_ORIGINS`) só nos handlers que o exijam

- [ ] 2. Rate limiting e sessão
  - [ ] 2.1 Abstração `RateLimiter` (memória dev / Redis prod); aplicar a reset/convite/exports/webhooks
  - [ ] 2.2 Confirmar cookies de sessão (`HttpOnly`/`Secure`/`SameSite`) e verificação de origem em handlers mutáveis

- [ ] 3. Dependências e segredos
  - [ ] 3.1 Job de `pnpm audit`/scanner no CI (coordenar com spec 15) — falha em vulnerabilidades altas
  - [ ] 3.2 Confirmar zero segredos no repo; documentar rotação (coordenar com spec 16)

- [ ] 4. Revisão multi-tenant (skill `engineering:code-review`)
  - [ ] 4.1 Auditar `findUnique/update/delete/upsert` sem scope → confirmar filtragem `tenantId`
  - [ ] 4.2 Confirmar redacção de PII/segredos nos logs (com spec 14)

- [ ] 5. Verificação
  - [ ] 5.1 `pnpm check` + `pnpm gates` verdes; teste de presença de CSP/HSTS/nosniff/etc. nas respostas
  - [ ] 5.2 Teste de rate-limit (reset/convite/exports → 429); smoke/e2e autenticado sem regressões de CSP
  - [ ] 5.3 Parecer `engineering:code-review` sem BLOCKERs de tenant; handoff `docs/handoff/feat-17-seguranca.md`
