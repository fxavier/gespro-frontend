# Plano de Implementação: Infraestrutura & Deploy (Docker + Terraform AWS)

Depende de: app compilável (`next build`) e `api/health` (spec 14, para HEALTHCHECK). Worktree `wt/feat-infra-deploy`.
Skills: `terraform-aws-scaffold`, `engineering:architecture`, `engineering:deploy-checklist`. Integra por último.

- [ ] 1. Imagem de produção
  - [ ] 1.1 `output: 'standalone'` em `next.config.ts`; `Dockerfile` multi-stage (deps/build/runner) não-root + HEALTHCHECK
  - [ ] 1.2 `.dockerignore`; entrypoint com `prisma migrate deploy`
  - [ ] 1.3 `docker build` + arranque local contra a DB (compose) verde

- [ ] 2. IaC (skill `terraform-aws-scaffold`)
  - [ ] 2.1 Scaffold `infra/` com backend S3 + native locking, versões fixas, default tags, bootstrap
  - [ ] 2.2 Módulos `network`, `rds` (PG17), `app` (App Runner|ECS), `storage` (S3), `secrets` (Secrets Manager)
  - [ ] 2.3 Stacks `live/dev` e `live/prod`; `terraform validate` + `plan` sem erros

- [ ] 3. Configuração e segredos
  - [ ] 3.1 `.env.example` com todas as variáveis de runtime (DB, AUTH_SECRET, SMTP, OTLP, S3)
  - [ ] 3.2 Mapear env↔Secrets Manager; garantir zero segredos no repo (scan)

- [ ] 4. Deploy
  - [ ] 4.1 ADR `docs/decisions/ADR-00xx-deploy.md` (App Runner vs ECS, migrations, rollback)
  - [ ] 4.2 (Se spec 15 pronto) `deploy.yml` com OIDC → ECR → `terraform apply` → `migrate deploy` (prod com aprovação)

- [ ] 5. Verificação
  - [ ] 5.1 `docker build` + HEALTHCHECK verde; `terraform validate`/`plan` limpos; scan de segredos limpo
  - [ ] 5.2 `.env.example` cobre todas as variáveis (script/checklist)
  - [ ] 5.3 Handoff `docs/handoff/feat-16-infra.md`
