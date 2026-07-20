# Requisitos: Infraestrutura & Deploy (Docker + Terraform AWS)

## Introdução

Só existe `docker-compose.yml` com **Postgres de desenvolvimento**. Não há imagem de produção nem
infraestrutura-como-código: o deploy é manual/indefinido. Este spec entrega uma imagem de produção reproduzível
e IaC em AWS, com estado remoto e segredos fora do repositório.

Skills obrigatórias: `terraform-aws-scaffold`, `engineering:architecture`.

## Requisitos

### Requisito 1 — Imagem de produção

1. DEVE existir um `Dockerfile` **multi-stage** (deps → build `next build` → runtime `output: 'standalone'`),
   imagem mínima (distroless/alpine + Node LTS), utilizador não-root, `HEALTHCHECK` a bater em `api/health` (spec 14).
2. Migrations aplicadas no arranque/deploy de forma controlada (`prisma migrate deploy`), nunca `migrate dev` em produção.
3. `.dockerignore` adequado; build reproduzível e parametrizável por env; **sem segredos na imagem**.

### Requisito 2 — IaC em AWS (Terraform)

1. DEVE existir `infra/` em Terraform (skill `terraform-aws-scaffold`) com **backend S3 remoto + native state locking**,
   versões fixas (Terraform + providers) e default tags.
2. Recursos: hosting do container (recomendado **AWS App Runner** pela simplicidade; alternativa **ECS Fargate**
   atrás de ALB), **RDS PostgreSQL 17** (Multi-AZ opcional, backups), **S3** (uploads/relatórios), **Secrets Manager**
   (DB URL, `AUTH_SECRET`, SMTP, OTLP), VPC/subnets/security groups mínimos, e (opcional) CloudFront.
3. Módulos reutilizáveis + stacks por ambiente (`dev`/`prod`); **nenhum segredo** commitado (`.tfvars` fora do git).

### Requisito 3 — Configuração e segredos

1. `.env.example` DEVE listar **todas** as variáveis de runtime (DB, `AUTH_SECRET`, email, OTLP, S3) sem valores reais.
2. Segredos injectados em runtime a partir do Secrets Manager (não build args). Documentar mapeamento env↔secret.

### Requisito 4 — Deploy

1. Documentar (e, se o spec 15 estiver pronto, automatizar em `deploy.yml`) o fluxo: build → push para ECR →
   `terraform apply`/atualização do serviço → `prisma migrate deploy`, com aprovação manual para `prod`.
2. Estratégia de rollback documentada (skill `engineering:deploy-checklist`, partilhada com spec 15).

## Critérios de Aceitação

1. `docker build` produz imagem que arranca localmente contra a DB (compose) e passa `HEALTHCHECK`.
2. `terraform validate` + `terraform plan` sem erros; state remoto configurado; **zero segredos** no repo (scan).
3. `.env.example` cobre todas as variáveis usadas pelo código (verificável por script).
4. ADR de arquitectura de deploy aprovado.

## Fontes

- Código: `docker-compose.yml`, `.env.example`, `next.config.ts` (necessita `output: 'standalone'`), `prisma.config.ts`.
- Skills: `terraform-aws-scaffold` (backend S3, locking, versões, tags, bootstrap), `engineering:architecture`,
  `engineering:deploy-checklist`.
