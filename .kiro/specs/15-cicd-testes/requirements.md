# Requisitos: CI/CD & Estratégia de Testes

## Introdução

Os gates de qualidade (`pnpm check`, `pnpm gates`, `pnpm e2e`, `pnpm e2e:a11y`) existem mas **correm só à mão**:
não há `.github/` nem pipeline. Além disso, os testes de integração usam a **DB partilhada** (dívida documentada
em `status.md`), tornando-os frágeis. Este spec automatiza a verificação em CI e isola os testes de integração.

Skills obrigatórias: `engineering:testing-strategy`, `engineering:deploy-checklist`.

## Requisitos

### Requisito 1 — Pipeline de Integração Contínua (GitHub Actions)

1. DEVE existir `.github/workflows/ci.yml` que corre em PR e push, com jobs: **lint+type** (`tsc`, `eslint`),
   **unit/integração** (`vitest run` com cobertura), **gates** (`pnpm gates`), **e2e** (`playwright`), **a11y**
   (`pnpm e2e:a11y`) e **build** (`next build`). Cache de `pnpm`/Turbopack; matriz de Node conforme `package.json` `engines`.
2. Jobs que precisam de DB usam um **service Postgres 17** + `pnpm db:migrate:dev` + seed; variáveis por secrets do repo.
3. O merge para `main` DEVE ficar **bloqueado** se qualquer job falhar (branch protection documentada).

### Requisito 2 — Isolamento dos testes de integração

1. Os testes de integração DEVEM deixar de depender da DB partilhada. Recomendado **Testcontainers**
   (Postgres efémero por execução) ou, no mínimo, **isolamento por tenant/esquema** com limpeza determinística.
2. `vitest` configurado com projeto separado para integração (setup que sobe/derruba o container) e cobertura
   com limiar mínimo (falha abaixo do limiar no código novo).

### Requisito 3 — Qualidade e artefactos

1. Publicar relatórios (cobertura, `playwright-report`, axe) como artefactos do workflow.
2. (Opcional) job de `pnpm audit`/scan de dependências (coordenar com spec 17) e verificação de migrações
   pendentes (`prisma migrate diff` sem drift).

## Critérios de Aceitação

1. Um PR de teste dispara o pipeline e **todos os jobs passam** (verde) num ambiente limpo.
2. Os testes de integração correm contra DB efémera/isolada — sem estado partilhado entre execuções.
3. Falhar um gate (ex.: introduzir um `Dialog` proibido) faz o CI falhar e bloquear o merge.
4. Artefactos de cobertura/e2e/a11y disponíveis no run.

## Fontes

- Scripts: `package.json` (`check`, `gates`, `e2e`, `e2e:a11y`, `db:migrate:dev`, `db:seed`), `playwright.config.ts`,
  `vitest.config.ts`, `docker-compose.yml`, `scripts/gate-*.mjs`.
- Dívida: `docs/status.md` (testes na DB partilhada). Skills: `engineering:testing-strategy`, `engineering:deploy-checklist`.
