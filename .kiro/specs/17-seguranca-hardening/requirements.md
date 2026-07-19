# Requisitos: Segurança & Hardening

## Introdução

A base de segurança é boa (Auth.js argon2, rate-limit no login, isolamento multi-tenant por contexto, RBAC de 240
permissões, auditoria), mas a **superfície HTTP** está por endurecer: `next.config.ts` faz
`Access-Control-Allow-Origin: *` em `/:path*` (CORS wildcard sobre rotas autenticadas) e **não** define
cabeçalhos de segurança (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
O rate-limiting só cobre o login. Este spec corrige estes pontos sem regressões funcionais.

Skills obrigatórias: `engineering:code-review`, `engineering:architecture`, `api-conventions`.

## Requisitos

### Requisito 1 — Cabeçalhos de segurança

1. DEVE ser removido o `Access-Control-Allow-Origin: *` global; CORS restrito a origens explícitas (allowlist por env)
   e **apenas** nas rotas que o exijam (webhooks/exports), nunca em toda a app.
2. DEVEM ser adicionados (via `middleware.ts`/`next.config.ts`): `Content-Security-Policy` (nonce para scripts,
   ajustada ao Next/Turbopack), `Strict-Transport-Security`, `X-Frame-Options: DENY` (ou CSP `frame-ancestors`),
   `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.

### Requisito 2 — Rate limiting e anti-abuso

1. O rate-limiting DEVE alargar-se para além do login: reset de password, convite, e endpoints sensíveis
   (exports, webhooks). Estratégia por IP+conta, com backend partilhável (memória em dev; Redis/loja em prod).
2. Proteção de CSRF revista para Server Actions/Route Handlers mutáveis (Next mitiga por origem; confirmar e
   documentar), e cookies de sessão com `HttpOnly`/`Secure`/`SameSite` corretos.

### Requisito 3 — Dependências e segredos

1. DEVE existir verificação de dependências (`pnpm audit`/scanner) — job no CI (coordenar com spec 15) — falhando
   em vulnerabilidades altas por resolver.
2. Confirmar que **nenhum segredo** está no repo; `.env` fora do git; política de rotação documentada (coordenar com spec 16).

### Requisito 4 — Revisão de superfície multi-tenant

1. Revisão dirigida (skill `engineering:code-review`) dos pontos onde `findUnique/update/delete/upsert` **não** são
   scoped pela extensão de tenant, confirmando filtragem explícita por `tenantId` (regressão → `NotFoundError`, nunca 403).
2. Confirmar redacção de PII/segredos nos logs (coordenar com spec 14).

## Critérios de Aceitação

1. `pnpm check`/`pnpm gates` verdes; nenhuma rota autenticada com `Access-Control-Allow-Origin: *`.
2. Teste que verifica presença de CSP/HSTS/X-Frame-Options/nosniff/Referrer-Policy nas respostas.
3. Rate-limit efetivo em reset/convite/exports (teste); cookies de sessão com flags corretas.
4. Job de scan de dependências no CI; parecer `engineering:code-review` sem BLOCKERs de tenant.

## Fontes

- Código: `next.config.ts` (CORS wildcard), `middleware.ts`, config Auth.js (rate-limit de login),
  `src/server/db/tenant-extension.ts` (`findUnique`/`update` não-scoped — ver `CLAUDE.md` §Multi-tenancy).
- Skills: `engineering:code-review`, `engineering:architecture`, `api-conventions`.
