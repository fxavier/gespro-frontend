# Plano de Implementação: Backend Foundation

Agente responsável: `backend-foundation` (Wave 0 — sequencial, bloqueia todas as waves seguintes).
Revisão: `code-reviewer` (claude-fable-5) obrigatória nas tasks marcadas `[BLOCKING]`.

## Tarefas

- [x] 1. `[BLOCKING]` Configurar Prisma e PostgreSQL
  - Adicionar `prisma`, `@prisma/client`, `@auth/prisma-adapter`, `argon2`, `pino`, `server-only`; remover `@supabase/postgrest-js` e apagar `src/lib/postgrest.ts`
  - Criar `prisma/schema.prisma` com datasource PostgreSQL (`DATABASE_URL` + `DIRECT_URL`), generator client
  - Criar `.env.example` documentado; adicionar `docker-compose.yml` com PostgreSQL 17 para dev local
  - Scripts `package.json`: `db:migrate:dev`, `db:migrate:deploy`, `db:seed`, `db:studio`, `check` (typecheck+lint+test+prisma validate)
  - _Requisitos: 1.1, 1.2_
  - **Wave 0-alpha**: parcial — sem docker-compose nem DIRECT_URL (adicionado DIRECT_URL ao .env.example na Wave 0-beta)

- [x] 2. `[BLOCKING]` Modelar núcleo do schema (Tenant, User, Role, Permission, AuditLog, PasswordResetToken, UserInvite)
  - Seguir contratos do design.md; enums `TenantEstado`, `UserEstado`
  - Gerar migration inicial `0001_core`
  - _Requisitos: 1.4, 1.5, 2.4, 4.1_
  - **Wave 0-beta**: adicionados PasswordResetToken, UserInvite, LoginAttempt a auth.prisma

- [x] 3. `[BLOCKING]` Implementar `src/server/db/client.ts` com singleton + `tenant-extension.ts`
  - AsyncLocalStorage para contexto de tenant (`runWithTenantContext`)
  - Fail-closed: modelo tenant-scoped sem contexto → erro
  - Testes unitários: injecção em findMany/create/update/delete; tentativa cross-tenant devolve vazio/404
  - _Requisitos: 2.1, 2.2, 2.3_

- [x] 4. `[BLOCKING]` Implementar hierarquia de erros `src/server/errors.ts` e logger `src/server/logger.ts`
  - AppError + subclasses; mapeamento P2002→Conflict, P2025→NotFound
  - Pino com redacção (`password`, `passwordHash`, `token`, `authorization`) e `requestId`
  - _Requisitos: 5.5, 6.3_
  - **Nota**: pino não instalado (fora do âmbito Wave 0-beta); erros implementados em src/lib/errors.ts

- [x] 5. `[BLOCKING]` Implementar autenticação Auth.js v5
  - [x] 5.1 `src/lib/auth.ts` — Credentials provider, verificação Argon2id, JWT com claims mínimas + `permsVersion`, rate limiting integrado
  - [x] 5.2 `middleware.ts` — protecção de todas as rotas não-públicas, redirect com `callbackUrl`, verificação JWT edge-safe (getToken/jose)
  - [x] 5.3 Rate limiting de login (janela 15 min, 5 tentativas por email/IP) — memória LRU em dev, tabela LoginAttempt em produção (`src/server/auth/rate-limit.ts`)
  - [x] 5.4 Fluxos: reset de password (token uso único ≤1h), convite de utilizador (`src/server/auth/password-reset.ts`)
  - [x] 5.5 Login page ligada ao fluxo real via `signIn('credentials', ...)`, setTimeout removido, estados de erro visíveis
  - _Requisitos: 3.1–3.6, 2.5_

- [x] 6. `[BLOCKING]` Implementar RBAC
  - [x] Catálogo COMPLETO de permissões `modulo:accao` para 21 módulos (240 permissões, inclui todas as 169 finas das actions de domínio) em `prisma/seed/rbac.ts`
  - [x] Roles de sistema: ADMIN, GESTOR, FINANCEIRO, OPERADOR, LEITURA com permissões mapeadas (ADMIN=240, GESTOR=230, FINANCEIRO=~120, OPERADOR=~90, LEITURA=~40)
  - [x] `can()` e `requirePermission()` em `src/lib/auth.ts`
  - [x] Hook cliente `usePermissions()` em `src/hooks/usePermissions.ts`
  - _Requisitos: 4.1–4.4_

- [x] 7. `[BLOCKING]` Implementar `createSafeAction` e `withApi`
  - [x] Pipeline completo em `src/server/safe-action.ts`
  - [x] Route Handlers via `src/lib/api/with-api.ts`
  - [x] Regra ESLint custom `eslint-rules/use-server-needs-safe-action.js` aplicada a `*.actions.ts`
  - _Requisitos: 5.1–5.6_

- [x] 8. Implementar auditoria
  - [x] `src/server/db/audit-extension.ts` — diffs em create/update/delete; escrita transaccional para entidades críticas, assíncrona para o resto
  - [x] `GET /api/audit` paginado via withApi (`src/app/api/audit/route.ts`)
  - _Requisitos: 6.1, 6.2_

- [x] 9. Consolidar utilitários moçambicanos
  - [x] Refinements Zod `nuit()`, `biMocambicano()`, `telefoneMz()`, `emailMz()` em `src/lib/validations/mocambique.ts`
  - [x] `format-currency.ts` consolidado com `formatMZN()` canónico (Intl pt-MZ/MZN) + aliases retrocompat
  - [x] `provincias-mocambique.ts` actualizado com `ProvinciaEnum` (z.enum) e `NOMES_PROVINCIAS`
  - _Requisitos: 7.1–7.3_

- [x] 10. Seed base
  - [x] 5 utilizadores demo (um por role): admin/gestor/financeiro/operador/leitura@demo.mz — senha `demo1234`
  - [x] Roles de sistema ADMIN/GESTOR/FINANCEIRO/OPERADOR/LEITURA com permissões completas
  - [x] PGC-NIRF extraído de XLSX → `prisma/seed/data/plano-contas-pgc.json` (504 contas, classes 1–8)
  - **Pendente**: seed do modelo ContaPGC (depende do WS D — Wave 2)
  - _Requisitos: 1.3, 7.4_

- [ ] 11. Configurar Vitest + testcontainers e gate de qualidade
  - [x] Vitest configurado com 56 testes a passar
  - [ ] testcontainers e cobertura ≥80% — pendente (requer DB efémero)
  - [ ] CONTRIBUTING.md
  - _Requisitos: 8.1–8.4_
