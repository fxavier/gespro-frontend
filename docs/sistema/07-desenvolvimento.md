# 7. Desenvolvimento

Fontes normativas (este capítulo resume e encaminha, não substitui):
[`CLAUDE.md`](../../CLAUDE.md) — regras invioláveis e comandos · [`Usage.md`](../../Usage.md) — como
se trabalha (cadeia ideia → ADR → tickets → código) · `.claude/skills/*` — convenções.

## Arranque em 10 minutos

```bash
pnpm install                       # em ambiente sem TTY: CI=true pnpm install
docker compose up -d               # Postgres 17 + Keycloak 26.7 (realm gespro importado)
pnpm db:migrate:dev                # só em terminal interactivo
pnpm db:seed                       # tenant demo + dados dos 7 domínios + exercício comercial
pnpm dev                           # http://localhost:3000
```

Login: `admin@demo.mz` / `demo1234` (também `gestor@`, `financeiro@`, `operador@`, `leitura@`).
Site: `pnpm dev:site` → http://localhost:3100.

## Estrutura do repositório

```
apps/erp/                 ERP (todos os caminhos src/, prisma/, e2e/ são relativos a isto)
  prisma/schema/          11 ficheiros de schema;  prisma/seed/  seeds e rbac.ts
  src/app/(dashboard)/    páginas autenticadas por módulo;  src/app/api/  route handlers
  src/server/services/    domínio;  src/server/actions/  mutações;  src/server/db/  cliente + extensões
  src/lib/                validações Zod, state-machines, format-*, api, security, storage, documents
  src/components/patterns biblioteca de UI a usar
  e2e/  scripts/gate-*.mjs
apps/site/                site de marketing
packages/brand|tsconfig|eslint-config
infra/  perf/  docs/
wt/                       worktrees (git-ignoradas; a maioria PRÉ-monorepo — não editar)
```

> `find`/`grep -r` a partir da raiz tocam em `wt/` e devolvem ficheiros fantasma. Usa `git grep`/`rg`
> ou parte de `apps/erp/`.

## Verificação antes de entregar

| Comando | Apanha | Não apanha |
|---|---|---|
| `pnpm check` | schema, tipos, lint, testes unitários (inclui golden fixture da spec 22 contra a BD local) | erros RSC em runtime, erros só do build, formulários que não submetem |
| `pnpm gates` | violações arquitecturais (ver [Arquitectura](02-arquitectura.md#gates-de-arquitectura)) | — |
| `pnpm build` | prerender, `Suspense` em falta, standalone | — |
| `pnpm e2e` / `pnpm e2e:a11y` | fluxos críticos com Keycloak real; WCAG AA | — |
| `pnpm test:integration` | concorrência/trancas contra Postgres real | nada, se o Testcontainers não arrancar (sai 0) |

Para UI, confirma sempre com um **smoke autenticado** (`pnpm dev` + login). Depois de E2E:
`git checkout -- apps/erp/playwright/.auth/admin.json`.

## Convenções

| Área | Skill normativa |
|---|---|
| Modelação Prisma (tenantId, Decimal, enums, índices, soft delete, migrações) | `prisma-conventions` |
| Server Actions, serviços, `withApi`, Zod, `AppError` | `api-conventions` |
| UI sem modais, patterns, tokens, Server Components, formulários | `ui-conventions` |
| INSS, IRPS, tabelas por vigência, payroll → contabilidade | `fiscalidade-mz` |
| Tesouraria vs caixa, projecção, DFC | `fluxo-de-caixa-conventions` |
| TDD, diagnóstico, modelação de domínio, revisão em dois eixos, tickets | `tdd`, `diagnosing-bugs`, `domain-modeling`, `revisao-dois-eixos`, `tracer-bullet-tickets` |

## Receita: nova funcionalidade num domínio

1. Termos em [`CONTEXT.md`](../../CONTEXT.md) se forem novos; decisão não-trivial → ADR (próximo
   número em [`decisions/README.md`](../decisions/README.md), actualizado no mesmo PR — há teste).
2. Modelo em `prisma/schema/<dominio>.prisma` com `tenantId`, índices, `Decimal` para dinheiro; FKs para
   outros domínios **escalares**.
3. Migração (ver abaixo). Configuração por tenant nova → omissão em `tenant-bootstrap.ts` **e**
   `INSERT … SELECT` na migração. Série de documento nova → `SERIES_INICIAIS`.
4. Serviço com `Ctx`, regras em `BusinessRuleError`, transições validadas antes de `transitar*`.
   Efeitos noutro domínio só por função de contrato dentro da mesma `$transaction`.
5. Schema Zod em `src/lib/validations/<modulo>.ts` (ids com `idEntidade()`, nunca `.cuid()`).
6. Server Action com `permission` do catálogo (`rbac.ts` + `pnpm db:seed`), `revalidate`, e
   `permiteEmLeitura: true` se for leitura.
7. Página Server Component + componentes-folha cliente; estados novos no mapa do `StatusBadge`.
8. Testes: unitários/propriedade no serviço; E2E se for fluxo crítico. `check` + `gates` + `build` + smoke.
9. Se escreves um estado que decide o que o utilizador vê: **tem de ter escritor em produção** e teste
   da transição (skill `estado-com-escritor`). Várias lacunas em [08](08-lacunas-conhecidas.md) são
   exactamente isto.

## Migrações

```bash
cd apps/erp
mig="prisma/migrations/$(date +%Y%m%d%H%M%S)_<nome>"; mkdir -p "$mig"
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema --script > "$mig/migration.sql"
npx prisma migrate deploy
```

- Renomear coluna ou valor de enum: o diff gera drop+create (perde dados). Escrever à mão
  `ALTER … RENAME …` (incluindo constraints) e `prisma migrate resolve --applied`.
- No fim, `migrate diff` tem de devolver *empty migration*.
- **Não** correr `prisma format`. Validar com `npx prisma validate`.
- Depois de `prisma generate`, reiniciar o `pnpm dev` (`touch apps/erp/next.config.ts`).

## Trabalho com agentes

Doutrina de loops e grafos: [`agentic/00-doutrina-loop-e-grafo.md`](../agentic/00-doutrina-loop-e-grafo.md).
Grafos por ADR em `.claude/grafos/`, executados com `/no <grafo> <nó>`; handoffs em
[`handoff/`](../handoff/). Issues em GitHub (`fxavier/gespro-frontend`) com as etiquetas de triagem
de `docs/agents/triage-labels.md`.
