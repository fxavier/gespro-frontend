# ADR-0002 — Wave 0 enxuta entregue vs spec 01 revelado

- **Data**: 2026-07-10
- **Estado**: Proposto (aguarda decisão do owner)
- **Autor**: orchestrator

## Contexto
A Wave 0 foi executada **antes** de o `spec 01` estar visível (só existiam skills).
Entreguei uma fundação enxuta e verde (`pnpm check` exit 0). Depois os specs
`01/02/03` e os agentes foram provisionados. O `spec 01/tasks.md` é
significativamente mais amplo do que o que entreguei.

## Gap: spec 01 pede vs Wave 0 entregou

| Task spec 01 | Entregue na Wave 0 |
|---|---|
| 1. Prisma+PG, remover `@supabase/postgrest-js`+`postgrest.ts`, `docker-compose` PG17, `DIRECT_URL`, scripts | Parcial: Prisma 7+pg, scripts e `check` ✅; **sem** docker-compose/DIRECT_URL; postgrest **não** removido |
| 2. Tenant/User/Role/Permission/AuditLog **+ PasswordResetToken + UserInvite** | Parcial: núcleo ✅; **sem** PasswordResetToken/UserInvite/LoginAttempt |
| 3. client singleton + tenant-extension (fail-closed) + testes | ✅ |
| 4. Erros + **logger pino** + mapeamento P2002/P2025 | Parcial: erros ✅; **sem** pino nem mapeamento Prisma |
| 5. Auth.js: **argon2id**, rate-limit, reset password, convite, ligar página login, middleware edge-safe | Parcial: Credentials+JWT+`can`/`requirePermission` ✅; **bcrypt (não argon2)**; **sem** middleware/rate-limit/reset/convite; login page não ligada |
| 6. RBAC: seed 21 módulos + roles ADMIN/GESTOR/FINANCEIRO/OPERADOR/LEITURA + `usePermissions()` | Parcial: `can`/`requirePermission` ✅ + 10 permissões demo; **sem** roles de sistema completos nem hook cliente |
| 7. `createSafeAction`+`withApi` + **regra ESLint 'use server'→createSafeAction** | Parcial: helpers ✅; **sem** regra ESLint custom |
| 8. Auditoria: audit-extension (diffs) + `GET /api/audit` | **✗** (modelo existe, escrita/endpoint não) |
| 9. Utils MZ: refinements `nuit()`/`biMocambicano()`, `format-currency` pt-MZ, províncias | **✗** (existem `src/lib/validacao-*.ts` e `provincias-mocambique.ts` por consolidar) |
| 10. Seed: **PGC-NIRF classes 1–8**, utilizadores por role, províncias | Parcial: tenant+admin+10 perms; **sem** PGC-NIRF nem roles/províncias |
| 11. Vitest + **testcontainers** + cobertura ≥80% + CONTRIBUTING.md | Parcial: vitest+3 testes ✅; **sem** testcontainers/cobertura/CONTRIBUTING |

## Decisões pendentes (🔴 owner)
1. **argon2id vs bcrypt** — spec pede argon2id; entreguei bcrypt. Trocar?
2. **Completar a Wave 0 ao spec 01** antes da Wave 1, ou avançar com a fundação enxuta e backfill oportunista? (auditoria/rate-limit/reset são segurança — recomendo completar tasks 5,6,8,9,10 antes de produção, mas não bloqueiam a modelação da Wave 1.)
3. **PGC-NIRF**: fonte do plano oficial de contas (classes 1–8) para o seed de D.

## Recomendação
Tratar a Wave 0 actual como **"Wave 0-alpha"** (fundação suficiente para começar a
modelação de contratos da Wave 1) e abrir uma **"Wave 0-beta"** com as tasks de
segurança/seed (5,6,8,9,10 do spec 01) a correr **em paralelo** com a Wave 1 de
contratos (não há dependência de schema entre elas). Assim não se perde tempo e a
segurança fica completa antes de qualquer implementação com dados reais.
