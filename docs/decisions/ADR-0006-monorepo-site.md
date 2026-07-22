# ADR-0006 — Monorepo (pnpm + Turborepo) para ERP + site de marketing

- **Estado**: Aceite
- **Data**: 2026-07-21 (proposto) · 2026-07-22 (aceite, implementado na fase 1 do spec 18)
- **Contexto**: Spec 18 (Website de Marketing), Spec 19 (Onboarding)
- **Skills**: `engineering:architecture`, `engineering:system-design`, `ui-conventions`

Resolve a colisão de numeração em `ADR-0005-*` começando a sequência limpa em `0006`.

## Contexto

O repositório é hoje uma **única app Next.js** (o ERP autenticado na raiz). O spec 18
acrescenta um site de marketing público, com linguagem visual, orçamento de performance e
requisitos de CSP distintos do ERP, e cadência de publicação (conteúdo/blog) desacoplada do
ciclo de migrations do produto. É preciso decidir onde vive esse site.

## Decisão

Converter o repositório num **monorepo pnpm-workspaces + Turborepo**: `apps/erp` (a app
actual, movida sem alteração funcional) + `apps/site` (novo), com `packages/brand` (tokens de
marca), `packages/tsconfig` e `packages/eslint-config` partilhados.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Monorepo pnpm + Turborepo** ✅ | Isola CSP/perf/bundle do site face ao ERP; deploy independente (site publica sem `prisma migrate deploy`); partilha de marca/config sem duplicar; um só `git`/PR | Dois `package.json`, `turbo.json` a gerir; migração mecânica inicial do ERP para `apps/erp` |
| Route group `(marketing)` na app actual | Zero migração; partilha imediata de componentes | Site partilha `middleware.ts`/CSP e pipeline do ERP; deploy de conteúdo força rebuild do ERP; bundle do site arrasta Prisma/Radix |
| Nx | Orquestração rica, generators | Peso/curva de aprendizagem acima do necessário para 2 apps |
| Repositório separado | Isolamento total | Perde partilha de marca/tipos; sincronização do contrato 18⇄19 entre repos mais frágil |

Racional: o site e o ERP têm **restrições operacionais opostas** (público vs. autenticado,
estático/ISR vs. SSR com DB, deploy por conteúdo vs. deploy por migration). O monorepo dá o
isolamento sem perder a partilha de marca/tipos, e o custo (migração mecânica + `turbo.json`) é
pontual. O «route group único» perde-se no acoplamento de CSP e no deploy conjunto.

## Consequências

- Migração **mecânica e bloqueante** do ERP para `apps/erp` (fase 1 do spec 18), mergida
  isolada e primeiro, com `pnpm check`/`pnpm gates`/`pnpm build` verdes antes de tudo o resto.
- Deploy do `apps/site` independente do `apps/erp` (ver ADR-0008 e spec 16).
- `packages/brand` torna-se a **fonte única** de tokens de marca; gate simples contra cores
  hardcoded fora dele. (Ainda por criar — fase 2 do spec 18.)

### O que mudou de facto na fase 1 (2026-07-22)

**Estrutura.** `pnpm-workspace.yaml` (`apps/*`, `packages/*`) + `turbo.json` na raiz. Toda a app
passou para `apps/erp/` com `git mv` (histórico preservado): `src/`, `prisma/`, `e2e/`, `public/`,
`test/`, `scripts/`, `eslint-rules/`, `middleware.ts`, `instrumentation.ts`, `next.config.ts`,
`tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest*.config.ts`,
`playwright.config.ts`, `prisma.config.ts`, `components.json`, `docker-entrypoint.sh`, `.env*`.
Ficam na raiz: `docs/`, `.kiro/`, `infra/`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`,
`.github/`, `.gitignore`, `CLAUDE.md`, `README.md`, `pnpm-lock.yaml`. O `package-lock.json` órfão
foi removido (o gestor é pnpm).

**Scripts de raiz — nomes inalterados** (a documentação e o hábito do utilizador não mudam):

| Antes (raiz = app) | Agora (raiz = monorepo) |
|---|---|
| `pnpm dev` | `pnpm --filter erp dev` |
| `pnpm build` | `turbo run build` |
| `pnpm start` | `pnpm --filter erp start` |
| `pnpm lint` | `turbo run lint` |
| `pnpm test` | `turbo run test` |
| `pnpm check` | `pnpm --filter erp check` |
| `pnpm gates` | `pnpm --filter erp gates` |
| `pnpm e2e` / `pnpm e2e:a11y` | `pnpm --filter erp e2e` / `e2e:a11y` |
| `pnpm test:integration` | `pnpm --filter erp test:integration` |
| `pnpm db:generate` / `db:migrate:dev` / `db:seed` / `db:studio` | `pnpm --filter erp <mesmo>` |

Novo: `pnpm typecheck` (`turbo run typecheck`) — `apps/erp` ganhou o script `typecheck`
(`tsc --noEmit`), que `check` já corria embutido. `check`/`gates`/`e2e`/`dev`/`start` estão
declarados com `"cache": false` no `turbo.json`; `build` faz cache de `.next/**` excepto
`.next/cache/**`, com os `env` que influenciam o output declarados explicitamente (nunca
cache de env implícito).

**Config partilhada.** `packages/tsconfig` (`base.json` + `nextjs.json`) e
`packages/eslint-config` (`index.js`, flat config do `eslint-config-next` + as mesmas
severidades de hoje). `apps/erp` consome-os por `extends`/spread — **zero** alteração de regras
ou severidade: `eslint .` continua a dar 0 erros e 143 avisos, exactamente como antes.

**Build standalone.** `apps/erp/next.config.ts` ganhou `outputFileTracingRoot` e
`turbopack.root` a apontar para a raiz do monorepo (`path.join(__dirname, '../../')`) — sem isso
o standalone fica incompleto, porque as dependências vivem em `node_modules` da raiz do
workspace. O bloco de headers/CSP/`images` do spec 17 não foi tocado.

**Docker.** O contexto de build continua a ser a raiz do repo. O stage `deps` copia os manifestos
do workspace (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` + os `package.json` de
`apps/erp` e `packages/*`); o stage `build` corre `pnpm --filter erp {exec prisma generate,build}`.
O standalone em monorepo produz `apps/erp/.next/standalone/apps/erp/server.js` com os
`node_modules` na raiz do standalone, pelo que os `COPY` do runner mudaram em conformidade e o
`docker-entrypoint.sh` faz `cd /app/apps/erp` antes do `prisma migrate deploy` (é onde vivem
`prisma.config.ts` e `prisma/`) e arranca `node /app/apps/erp/server.js`.
Dois ajustes **não são de caminho** — são correcções de bugs pré-existentes que só se manifestam
sob pnpm e que a migração tornou visíveis ao forçar um teste da imagem:
1. o `COPY` de `node_modules/.prisma` foi removido — esse directório não existe em instalações
   pnpm (o cliente é gerado dentro de `@prisma/client`), pelo que o `docker build` falhava;
2. a CLI do Prisma para o `migrate deploy` do entrypoint deixa de ser copiada da árvore pnpm
   (que é toda symlinks para `.pnpm/`, que o `COPY` não segue, e cujo `@prisma/engines` não é
   dependência directa da app) e passa a vir de um `npm install` isolado no stage `build`, com
   as versões exactas resolvidas a partir do que o lockfile instalou, copiado para
   `/app/node_modules` como árvore plana.

**Verificação da imagem (2026-07-22).** `docker build` verde; `docker run` do entrypoint com uma
`DATABASE_URL` inalcançável chega a "Loaded Prisma config from prisma.config.ts / Prisma schema
loaded from prisma/schema" e falha só em `P1001` (prova que a CLI, o `prisma.config.ts` e o
schema resolvem); com a DB real, `node /app/apps/erp/server.js` arranca e `/api/health` e
`/api/ready` respondem `200`.

**CI.** `.github/workflows/ci.yml` mantém os mesmos 7 jobs; os passos que invocam binários da app
(`prisma generate/validate/migrate deploy`, `tsc`, `playwright install`, `test:unit:coverage`,
`vitest --config vitest.integration.config.ts`) ganharam `working-directory: apps/erp`. Os passos
que usam scripts de raiz (`pnpm install`, `pnpm lint`, `pnpm gates`, `pnpm db:seed`, `pnpm e2e`,
`pnpm e2e:a11y`, `pnpm build`) ficaram inalterados. Caminhos de cache e de artefactos passaram a
`apps/erp/.next/cache`, `apps/erp/coverage/`, `apps/erp/playwright-report/`.
O job `site` **não** foi adicionado nesta fase — pertence à task 10.1 do spec 18, quando
`apps/site` existir.
