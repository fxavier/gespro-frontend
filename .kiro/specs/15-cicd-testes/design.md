# Design: CI/CD & Estratégia de Testes

## Arquitectura do pipeline

`.github/workflows/ci.yml` com jobs paralelos onde possível e dependências mínimas:

```
setup (checkout, pnpm, cache, install)
 ├─ lint-type   : prisma validate, tsc --noEmit, eslint .
 ├─ gates       : pnpm gates (scripts/gate-*.mjs)
 ├─ test        : vitest run --coverage           [service: postgres:17 + migrate + seed]
 ├─ e2e         : playwright (app + DB)            [service: postgres:17]
 ├─ a11y        : pnpm e2e:a11y (axe)              [service: postgres:17]
 └─ build       : next build
merge-gate: requer todos verdes (branch protection)
```

- **Service Postgres**: `services: postgres:17` com healthcheck; `DATABASE_URL` apontando ao service; `pnpm
  db:migrate:dev` + `pnpm db:seed` antes dos jobs que tocam DB.
- **Cache**: `actions/setup-node` + `pnpm/action-setup`, cache do store pnpm e de `.next`/Turbopack quando estável.
- **Matriz**: Node conforme `engines` do `package.json`.

## Isolamento de integração (Testcontainers)

- `test/integration/setup.ts`: sobe um container `postgres:17` (`@testcontainers/postgresql`), corre migrations,
  expõe `DATABASE_URL` ao processo; teardown no fim. `vitest.config.ts` ganha um projeto `integration` com este setup.
- Alternativa mais leve (se Testcontainers indisponível no runner): schema/tenant efémero por ficheiro de teste com
  `TRUNCATE` determinístico — documentar o trade-off.
- Cobertura: `coverage.thresholds` com mínimo global e por código novo; job falha abaixo do limiar.

## Deploy (gancho para spec 16)

- `deploy.yml` (opcional, ativado quando a infra do spec 16 existir): build da imagem, push para registry, e
  `terraform apply`/atualização do serviço em `main` (com aprovação manual/environment protegido). Este spec
  entrega o **CI**; o **CD** liga-se à infra do spec 16 via `engineering:deploy-checklist`.

## Riscos

- Flakiness de e2e → retries limitados + `playwright-report` como artefacto. Segredos só em GitHub Secrets/OIDC,
  nunca no YAML. Tempo de pipeline → paralelizar jobs e cache agressivo.
