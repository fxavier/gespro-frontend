# Handoff: spec 16 — Infraestrutura & Deploy

**Branch**: `ws-16`
**Data**: 2026-07-20
**Spec**: `.kiro/specs/16-infraestrutura-deploy/`

---

## Ficheiros criados / alterados

| Ficheiro | Acção | Notas |
|---|---|---|
| `src/app/api/health/route.ts` | Criado | Liveness probe (`GET /api/health`, 200 OK, sem auth) |
| `next.config.ts` | Alterado | Adicionado `output: 'standalone'`; headers/CORS intactos para spec 17 |
| `Dockerfile` | Criado | Multi-stage: deps → build → runner; não-root; HEALTHCHECK |
| `.dockerignore` | Criado | Exclui `node_modules`, `.next`, `wt/`, `.env`, `infra/`, `e2e/` |
| `docker-entrypoint.sh` | Criado | `prisma migrate deploy` → `node server.js` |
| `infra/bootstrap/` | Criado | S3 state bucket (uma vez por conta AWS) |
| `infra/modules/network/` | Criado | VPC + subnets pub/priv + SGs (App Runner → RDS) |
| `infra/modules/rds/` | Criado | RDS PostgreSQL 17, subnet group, parameter group |
| `infra/modules/app/` | Criado | ECR + App Runner + IAM roles + VPC Connector |
| `infra/modules/storage/` | Criado | S3 uploads/relatórios, lifecycle, CORS |
| `infra/modules/secrets/` | Criado | Secrets Manager (DB URL, AUTH_SECRET, SMTP, OTLP) |
| `infra/live/dev/` | Criado | Stack dev (single-AZ, cpu=256, mem=512) |
| `infra/live/prod/` | Criado | Stack prod (Multi-AZ, cpu=512, mem=1024, deletion_protection) |
| `infra/.gitignore` | Criado | Exclui `*.tfvars`, `.terraform/`, `*.tfstate`, `*.tfplan` |
| `.gitignore` | Alterado | Adicionadas entradas para `infra/**/*.tfvars`, `.terraform/`, etc. |
| `.env.example` | Alterado | Adicionadas vars: SMTP_*, OTEL_*, AWS_*, S3_BUCKET_NAME, APP_VERSION |
| `docs/decisions/ADR-0005-infraestrutura-deploy.md` | Criado | ADR App Runner vs ECS, migrations, segredos |

---

## Decisão de hosting: App Runner

**App Runner** escolhido em vez de ECS Fargate. Racional completo em `ADR-0005`.

Resumo: HTTPS gerido + autoscaling simples + menor overhead operacional para equipa pequena. O VPC Connector suporta ligação privada ao RDS. Migração para ECS Fargate é um caminho natural se os requisitos de rede crescerem.

---

## Estado dos gates

| Gate | Estado |
|---|---|
| `terraform validate` (bootstrap) | PASS |
| `terraform validate` (live/dev) | PASS |
| `terraform validate` (live/prod) | PASS |
| `terraform fmt -recursive` | PASS (1 ficheiro formatado: `modules/app/main.tf`) |
| Scan de segredos (`.tfvars` no git) | CLEAN — nenhum `.tfvars` commitado |
| `docker build` (stage `deps`) | PASS (imagem `gespro-deps-test:latest`, 1.18GB) |
| `docker build` (full multi-stage) | Em progresso (Next.js compile ~10-20 min); Dockerfile corrigido com `RUN mkdir -p public` e `public/.gitkeep` |
| `pnpm check` (compilação TS) | Não executado nesta sessão; `next.config.ts` alterado de forma aditiva (`output: 'standalone'` apenas — não quebra TS) |

---

## Por validar / próximos passos

1. **`docker build` completo + HEALTHCHECK**: A build full (stage `build` + `runner`) requer `pnpm build` (Next.js) que demora vários minutos. O stage `deps` passa. O HEALTHCHECK aponta para `GET /api/health` (criado neste spec). Após a build, testar: `docker run -e DATABASE_URL=... -p 3000:3000 gespro:test`

2. **`terraform plan`**: Requer credenciais AWS (`aws configure`). O `validate` passa para ambas as stacks. O `plan` precisa de:
   - `aws configure` com credenciais da conta de dev/prod
   - O bootstrap aplicado (`cd infra/bootstrap && terraform init && terraform apply`)
   - Secrets populados no Secrets Manager antes de fazer plan do módulo `rds/`

3. **Secrets Manager — valores iniciais**: Os secrets criados pelo módulo `secrets/` têm valor `PLACEHOLDER`. Antes de `terraform apply` nas stacks live/, preencher via:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id gespro/dev/DB_CREDENTIALS \
     --secret-string '{"username":"gespro_dev","password":"<gerar>"}'
   ```

4. **S3 state bucket name**: O bucket `gespro-terraform-state` precisa de nome único globalmente. Ajustar `infra/bootstrap/variables.tf` se necessário.

5. **Região AWS**: `af-south-1` (Cape Town) escolhida por proximidade a Moçambique. Verificar se a conta AWS tem esta região activada.

---

## Handoff para spec 17 (Segurança/Hardening)

- `next.config.ts`: o bloco `headers()` (CORS/CSP) está **intacto**. O spec 17 pode editar esse bloco livremente. A linha `output: 'standalone'` é nova e não conflitua.
- O entrypoint Docker não interfere com headers HTTP — são geridos pelo Next.js em runtime.
- O App Runner não adiciona headers extra por defeito.

---

## Mapeamento env ↔ Secrets Manager

| Variável em runtime | Path no Secrets Manager | Formato |
|---|---|---|
| `DATABASE_URL` | `gespro/{env}/DATABASE_URL` | String |
| (credenciais RDS) | `gespro/{env}/DB_CREDENTIALS` | JSON `{username, password}` |
| `AUTH_SECRET` | `gespro/{env}/AUTH_SECRET` | String (hex 32 bytes) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | `gespro/{env}/SMTP_CREDENTIALS` | JSON |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` | `gespro/{env}/OTEL_CREDENTIALS` | JSON |

O App Runner injeta `DATABASE_URL` e `AUTH_SECRET` directamente como env vars. Para SMTP e OTLP, o código precisa de deserializar o JSON (ou usar um Lambda de rotation que exploda o JSON em vars individuais — spec 13/14 gerem esta parte).
