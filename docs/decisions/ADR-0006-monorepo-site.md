# ADR-0006 — Monorepo (pnpm + Turborepo) para ERP + site de marketing

- **Estado**: Proposto
- **Data**: 2026-07-21
- **Contexto**: Spec 18 (Website de Marketing), Spec 19 (Onboarding)
- **Skills**: `engineering:architecture`, `engineering:system-design`, `ui-conventions`

> Stub para ratificação. Resolve a colisão de numeração em `ADR-0005-*`/`0005-*`
> começando a sequência limpa em `0006`. O orquestrador confirma o número final no merge.

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
  isolada e primeiro, com `pnpm check`/`pnpm gates`/`pnpm e2e` verdes antes de tudo o resto.
- Scripts de raiz passam a `turbo run <script> --filter=<app>`; `Dockerfile`/CI ajustam contexto.
- Deploy do `apps/site` independente do `apps/erp` (ver ADR-0008 e spec 16).
- `packages/brand` torna-se a **fonte única** de tokens de marca; gate simples contra cores
  hardcoded fora dele.
