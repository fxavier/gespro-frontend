# Design: Infraestrutura & Deploy (Docker + Terraform AWS)

## Imagem de produção

`Dockerfile` multi-stage:
1. `deps`: `pnpm install --frozen-lockfile` (com cache de store).
2. `build`: `pnpm prisma generate` + `pnpm build` (`next build`, `output: 'standalone'` em `next.config.ts`).
3. `runner`: base mínima (Node LTS slim/distroless), copia `.next/standalone` + `.next/static` + `public`,
   `prisma` (para `migrate deploy`), utilizador não-root, `HEALTHCHECK curl api/health`. Entrada corre
   `prisma migrate deploy` (ou init container) e depois `node server.js`.

`.dockerignore`: `node_modules`, `.next`, `wt/`, `test-results`, `playwright-report`, `.git`, `*.md` grandes.

## IaC (`infra/`) — via skill `terraform-aws-scaffold`

- **Backend**: S3 remoto + native state locking (sem DynamoDB), versões fixas, default tags, bootstrap seguro do
  próprio backend (conforme a skill).
- **Layout**: `infra/modules/{network,rds,app,storage,secrets}` + `infra/live/{dev,prod}` (stacks por ambiente).
- **Hosting**: App Runner (imagem do ECR, autoscaling simples, HTTPS gerido) — recomendado; alternativa ECS Fargate+ALB
  para controlo fino. Ligação privada ao RDS (VPC connector).
- **Dados**: RDS PostgreSQL 17 (subnet group privada, backups, encryption at rest), parâmetros mínimos.
- **Segredos**: Secrets Manager para `DATABASE_URL`, `AUTH_SECRET`, SMTP, `OTEL_EXPORTER_OTLP_*`; injectados como env no serviço.
- **Storage**: S3 para uploads/relatórios (bucket privado, políticas mínimas, lifecycle).

## Configuração

- `next.config.ts`: acrescentar `output: 'standalone'`. `.env.example` sincronizado com todas as variáveis de runtime
  (script `scripts/check-env.mjs` que compara `.env.example` com `process.env` referenciado no código — opcional).

## Deploy (gancho para spec 15)

`deploy.yml`: OIDC AWS (sem chaves longas) → `docker build/push` para ECR → `terraform apply` (env protegido) →
`prisma migrate deploy`. Rollback: reverter para a imagem/tag anterior + `terraform apply` do estado anterior;
migrações destrutivas evitadas (expand/contract). Registo em `docs/decisions/ADR-00xx-deploy.md`.

## Riscos

- Migrations em produção: usar `migrate deploy` (idempotente) e padrão expand/contract; nunca `migrate dev`.
- Custos/segurança: least-privilege IAM, buckets privados, RDS não público, tags de custo. `.tfvars` fora do git.
