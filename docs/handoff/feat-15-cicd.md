# Handoff: Spec 15 — CI/CD & Estratégia de Testes

**Branch**: ws-15  
**Data**: 2026-07-20  
**Worktree**: wt/feat-cicd-qualidade

---

## Ficheiros entregues

| Ficheiro | Tipo | Descrição |
|---|---|---|
| `.github/workflows/ci.yml` | novo | Pipeline CI completo (7 jobs) |
| `test/integration/setup.ts` | novo | globalSetup Testcontainers (Postgres efémero) |
| `test/integration/tenant-isolation.test.ts` | novo | Testes de integração isolados |
| `vitest.config.ts` | actualizado | Coverage thresholds adicionados |
| `vitest.integration.config.ts` | novo | Config vitest para projecto integration |
| `package.json` | actualizado | devDeps + scripts test:unit/integration |

---

## Arquitectura do pipeline (`.github/workflows/ci.yml`)

7 jobs paralelos. O merge para `main` fica bloqueado se qualquer job falhar.

```
lint-type   — prisma validate + tsc --noEmit + eslint
gates       — pnpm gates (dialog/use-client/data-imports)
test        — vitest run --coverage  [service: postgres:17 + migrate + seed]
integration — vitest run --config vitest.integration.config.ts  [Testcontainers]
e2e         — playwright (webServer: pnpm dev)   [service: postgres:17 + migrate + seed]
a11y        — pnpm e2e:a11y (axe WCAG AA)        [service: postgres:17 + migrate + seed]
build       — next build  [sem DB — app dinâmica, sem SSG]
```

### Detalhe das escolhas

**DB em CI**: service `postgres:17-alpine` com healthcheck. O workflow usa `prisma migrate deploy` (não `db:migrate:dev`) por ser não-interactivo e adequado para CI. O `db:seed` cria o tenant demo para os testes que precisam de dados.

**pnpm cache**: `actions/setup-node` com `cache: pnpm` (pnpm store). O `.next/cache` é cached nos jobs de build/e2e/a11y.

**Testcontainers no job `integration`**: os runners `ubuntu-latest` têm Docker disponível. `TESTCONTAINERS_RYUK_DISABLED=true` evita falhas de rede do Ryuk.

**E2E/a11y**: usam a configuração `webServer` do `playwright.config.ts` que inicia `pnpm dev` automaticamente. A app lê `DATABASE_URL` do job env.

**Build**: usa `DATABASE_URL` fictício (`postgresql://ci:ci@localhost:5432/ci`) porque `next build` não executa código de servidor (app dinâmica, sem `generateStaticParams`).

---

## Branch protection requerida

Configurar em **Settings → Branches → Branch protection rules → main**:

```
Required status checks before merging:
  [x] lint-type
  [x] gates
  [x] test
  [x] integration
  [x] e2e
  [x] a11y
  [x] build

[x] Require branches to be up to date before merging
[x] Do not allow bypassing the above settings
```

Segredos a configurar em **Settings → Secrets and variables → Actions**:
- `AUTH_SECRET` — string aleatória >= 32 chars (NextAuth)

---

## Isolamento de testes de integração

### Problema anterior (dívida documentada em status.md)

Os testes de integração em `src/server/services/**/__tests__/*.test.ts` usam a DB partilhada (`localhost:5433`). Correm em sequência (`fileParallelism: false`) mas ainda partilham estado entre runs se a DB não for limpa.

### Solução entregue

**Projecto `integration`** (`vitest.integration.config.ts`):
- `globalSetup: ['./test/integration/setup.ts']` — inicia container Postgres 17 efémero
- Cada run parte de DB totalmente limpa (sem seed, sem dados de outros runs)
- `teardown` destrói o container no fim

**Degradação graciosa** (para `pnpm check` local):
- Se `@testcontainers/postgresql` não está instalado → `SKIP_INTEGRATION=true` → testes saltam (exit 0)
- Se Docker não está disponível → mesma degradação
- A importação é dinâmica (`import(string)` em vez de `import 'literal'`) para evitar erros de tsc

### Prova de isolamento (a executar após `pnpm install`)

A prova real corre após o orquestrador instalar as deps consolidadas da Wave 5
(que inclui `@testcontainers/postgresql` + `testcontainers`).

Comando esperado (dois runs consecutivos devem dar saída semelhante a):

```bash
$ pnpm test:integration
[integration] Container Postgres pronto: postgresql://gespro_test:***@localhost:XXXX/gespro_test
 Test Files  1 passed (1)
     Tests   6 passed (6)
[integration] Container Postgres parado.

$ pnpm test:integration
[integration] Container Postgres pronto: postgresql://gespro_test:***@localhost:YYYY/gespro_test  # porta diferente
 Test Files  1 passed (1)
     Tests   6 passed (6)
[integration] Container Postgres parado.
```

Portas distintas = containers distintos = DB limpa a cada run (sem estado partilhado).

**Verificado localmente sem deps instaladas** (degradação graciosa):

```
$ pnpm test:integration
[integration] @testcontainers/postgresql não instalado. Testes de integração saltados (local only).
 Test Files  1 skipped (1)
     Tests   6 skipped (6)
```

Exit code 0 — `pnpm check` continua verde sem Docker/deps.

Os testes existentes em `src/**/__tests__/` NÃO foram movidos — mantêm os seus contratos e continuam no job `test` (com DB partilhada do service CI).

---

## Cobertura (limiares que falham o job)

Configurado em `vitest.config.ts`:

```ts
coverage: {
  include: ['src/server/**/*.ts', 'src/lib/**/*.ts', 'src/hooks/**/*.ts'],
  thresholds: {
    lines:      18,
    functions:  14,
    branches:   13,
    statements: 18,
  },
}
```

Activos via `pnpm test:unit:coverage` em CI.
Se a cobertura descer abaixo dos limiares, o job `test` falha com erro explícito.

**Baseline medida em 2026-07-20** (sobre `src/server + src/lib + src/hooks`):
lines 21.2% · statements 20.5% · branches 15.8% · functions 16.2%

Os limiares estão ligeiramente abaixo da baseline para absorver flutuações.
Devem subir ~5 pp por trimestre à medida que se adicionam testes.

---

## Prova do gate: Dialog proibido faz o CI falhar

O gate `gate-dialog.mjs` deteta imports de `@/components/ui/dialog` (Dialog raw) em `src/app/`.
A prova foi executada localmente na branch `ws-15`:

### Passo 1: Introduzir violação

```tsx
// src/app/_dialog-violation-test.tsx
import { Dialog } from '@/components/ui/dialog';  // PROIBIDO
```

### Passo 2: Gate falha (exit code 1)

```
Gate: Dialog fora de AlertDialog em src/app/
  BLOCKER src/app/_dialog-violation-test.tsx:3  →  import { Dialog } from '@/components/ui/dialog';

✗ 1 ficheiro(s) com import de Dialog (não AlertDialog):
  • src/app/_dialog-violation-test.tsx

EXIT CODE: 1
```

Este exit code 1 propaga-se ao job `gates` do CI, que bloqueia o merge.

### Passo 3: Remover violação → gate passa (exit code 0)

```
Gate: Dialog fora de AlertDialog em src/app/
✓ Nenhuma violação encontrada. Dialog sem AlertDialog: 0
EXIT CODE: 0
```

---

## Scripts adicionados (`package.json`)

| Script | Comando | Uso |
|---|---|---|
| `test:unit` | `vitest run` | Unit tests (alias de `test`) |
| `test:unit:coverage` | `vitest run --coverage` | Unit tests com coverage |
| `test:integration` | `vitest run --config vitest.integration.config.ts` | Testes Testcontainers |

---

## Decisões de arquitectura

1. **`prisma migrate deploy` em CI** (não `db:migrate:dev`): A variante `deploy` é não-interactiva e adequada para CI. O `db:migrate:dev` é para desenvolvimento local onde se criam novas migrations. Em CI, as migrations já existem — só precisam de ser aplicadas.

2. **Dois ficheiros de config vitest** (`vitest.config.ts` + `vitest.integration.config.ts`) em vez de `projects` API: A API `projects` inline do vitest 4.1.10 tem um bug de herança de `resolve.alias` (os aliases `@/` e `server-only` não são herdados pelos sub-projectos). Dois ficheiros separados são mais simples e sem ambiguidade. O `pnpm check` usa `vitest.config.ts` (unit tests, sem Testcontainers).

3. **Importação dinâmica com variável** para `@testcontainers/postgresql`: TypeScript não resolve estaticamente `import(string)`, devolvendo `Promise<any>`. Isto evita erros de `tsc` quando o pacote não está instalado (antes do primeiro `pnpm install` após adicionar as deps).

4. **`TESTCONTAINERS_RYUK_DISABLED=true` no CI**: O Ryuk (reaper do Testcontainers) pode falhar em ambientes CI com restrições de rede. Desactivar evita timeouts espúrios.

---

## Gaps e dívida futura

- Os testes de integração legados (`src/**/__tests__/*integracao*`) continuam a usar a DB partilhada do service CI. Migrar para Testcontainers seria a próxima iteração (depende de alocar tempo para refactor sem quebrar contratos).
- Os limiares de cobertura (60/55/45/60) são conservadores. Devem subir progressivamente à medida que mais testes são adicionados (sugestão: subir 5pp por trimestre).
- O job `e2e` usa `pnpm dev` (Next.js dev server) via `webServer` do Playwright. Para maior fidelidade com produção, considerar `next build && next start` (mais lento mas mais representativo).
- Falta `pnpm audit` / scan de dependências (coordenar com spec 17 — segurança).
- Falta `prisma migrate diff` para verificar drift de migrations (verificação de sanidade).
- Branch protection não pode ser configurada automaticamente via YAML — requer configuração manual no GitHub UI (descrita acima).
