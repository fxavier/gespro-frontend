# Design: Segurança & Hardening

## Fronteira HTTP

- **Cabeçalhos**: centralizar em `middleware.ts` (edge) a aplicação de headers de segurança a todas as respostas,
  com `Content-Security-Policy` baseada em **nonce** por request (gerado no middleware, propagado ao `app` via header
  e usado nos `<script>` do Next). `Strict-Transport-Security` (com `preload` só quando o domínio o permitir),
  `X-Frame-Options: DENY`/`frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy` restritiva.
- **CORS**: remover o bloco wildcard de `next.config.ts`. CORS explícito só nos Route Handlers que o exijam
  (webhooks/exports), com allowlist por `ALLOWED_ORIGINS` (env), métodos/headers mínimos, sem `*` quando há credenciais.
- **17 é o único editor de `middleware.ts` e do bloco de headers do `next.config.ts`** na Wave 5 (ver handoff). O
  request-id do spec 14 vem de `instrumentation.ts`/`withApi`, não do middleware — sem conflito.

## Rate limiting

- Abstração `RateLimiter` (porta) com adaptador em memória (dev) e Redis/loja (prod). Aplicar em: login (existente),
  reset, convite, exports e webhooks. Chave `ip + conta/rota`; respostas `429` com `Retry-After`.

## Sessão/CSRF

- Confirmar cookies Auth.js `HttpOnly`/`Secure`/`SameSite=Lax|Strict`. Server Actions do Next validam origem;
  documentar a garantia e adicionar verificação de `Origin`/`Sec-Fetch-*` nos Route Handlers mutáveis.

## Multi-tenant e segredos

- Revisão dirigida (grep + `engineering:code-review`) de todos os `findUnique/update/delete/upsert` para garantir
  filtragem por `tenantId` (o `CLAUDE.md` avisa que a extensão **não** os faz scope). Cross-tenant → `NotFoundError`.
- Scan de dependências no CI (spec 15). Segredos: `.env`/Secrets Manager (spec 16); nunca no repo.

## Riscos

- CSP demasiado restritiva pode partir o Next/Turbopack (inline styles, HMR em dev) → CSP em modo report-only
  primeiro, depois enforce; nonce em produção. Validar com smoke autenticado e e2e após ativar headers.
