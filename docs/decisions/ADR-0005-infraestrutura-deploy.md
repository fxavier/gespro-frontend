# ADR-0005: Infraestrutura & Deploy — Docker + Terraform AWS

**Data**: 2026-07-20
**Estado**: Aceite
**Decisores**: Equipa de Engenharia GestPro

---

## Contexto

O GestPro não tinha imagem de produção nem IaC: o deploy era manual. É necessário:
1. Uma imagem Docker reproduzível para o ERP multi-tenant Next.js 16.
2. IaC em AWS com estado remoto e segredos fora do repositório.
3. Gestão segura de migrations em produção.

---

## Decisões

### D1: Hosting — AWS App Runner (vs ECS Fargate)

**Decisão**: App Runner.

**Alternativas consideradas**:

| Critério | App Runner | ECS Fargate + ALB |
|---|---|---|
| HTTPS gerido | Sim (automático) | Não (requer ACM + ALB) |
| Autoscaling | Simples (min/max) | Complexo (Target Groups) |
| Overhead operacional | Baixo | Alto |
| VPC privado (RDS) | Sim (VPC Connector) | Sim (nativo) |
| Custo base (0 tráfego) | ~$5/mês | ~$20/mês (ALB) |
| Controlo de rede | Limitado | Total |
| Adequação à equipa | Alta (pequena) | Média |

**Racional**: Para uma equipa pequena, a simplicidade do App Runner (HTTPS gerido, autoscaling automático, sem ALB/Target Groups) supera a flexibilidade adicional do ECS. O VPC Connector do App Runner permite ligação privada ao RDS. Se os requisitos de rede crescerem (múltiplos serviços, service mesh), migrar para ECS Fargate é um caminho natural.

**Riscos**: App Runner tem menos features de rede (sem acesso a portas arbitrárias, sem ligação a ElastiCache directamente). Mitigação: S3 para uploads, RDS via VPC Connector, Secrets Manager para segredos.

---

### D2: Backend Terraform — S3 + Native Locking (vs S3 + DynamoDB)

**Decisão**: S3 com native state locking (Terraform >= 1.10).

**Racional**: A partir do Terraform 1.10, o backend S3 suporta locking nativo sem DynamoDB (usando condicional writes S3). Elimina um serviço adicional (DynamoDB) e simplifica o bootstrap. A versão usada (1.15.x) suporta esta feature.

---

### D3: Migrations em Produção — `prisma migrate deploy`

**Decisão**: Usar **exclusivamente** `prisma migrate deploy` em produção.

**Regras**:
1. NUNCA usar `prisma migrate dev` fora do ambiente local — cria migrations interactivas e pode alterar o schema de forma não controlada.
2. `prisma migrate deploy` é idempotente: aplica apenas as migrations pendentes (em ordem), sem regenerar.
3. **Padrão expand/contract** para alterações destrutivas:
   - *Expand*: adicionar nova coluna/tabela (migration 1, deploy em prod, código usa nova estrutura).
   - *Contract*: remover estrutura antiga (migration 2, só após garantir que nenhum código a referencia).
4. Migrations correm no entrypoint Docker antes do `node server.js`. Em ambientes com múltiplas réplicas, o locking do PostgreSQL garante que apenas uma instância aplica em simultâneo.

---

### D4: Gestão de Segredos — AWS Secrets Manager

**Decisão**: Todos os segredos em AWS Secrets Manager. Zero segredos no repositório ou na imagem Docker.

**Mapeamento**:

| Variável de ambiente | Segredo SM (path) | Tipo |
|---|---|---|
| `DATABASE_URL` | `gespro/{env}/DATABASE_URL` | String |
| Credenciais RDS | `gespro/{env}/DB_CREDENTIALS` | JSON `{username, password}` |
| `AUTH_SECRET` | `gespro/{env}/AUTH_SECRET` | String |
| SMTP | `gespro/{env}/SMTP_CREDENTIALS` | JSON `{host,port,user,password,from}` |
| OTLP | `gespro/{env}/OTEL_CREDENTIALS` | JSON `{endpoint,headers}` |

O App Runner resolve os ARNs e injeta os valores como variáveis de ambiente no container em runtime. O código lê `process.env.*` sem alterações.

**Build args**: Nenhum segredo é passado como `ARG` Docker. Apenas variáveis não-sensíveis (NODE_ENV, PORT, NEXT_TELEMETRY_DISABLED) são definidas no Dockerfile.

---

### D5: Estrutura do Dockerfile — Multi-stage

**Decisão**: 3 stages: `deps` → `build` → `runner`.

- `deps`: `pnpm install --frozen-lockfile` (reproduzível, cache de layer).
- `build`: `prisma generate` + `next build` (output: standalone).
- `runner`: Node 20 alpine, utilizador não-root (uid 1001), copia apenas standalone + static + public + prisma CLI.

**HEALTHCHECK**: `GET /api/health` (liveness, sem auth, 200 OK). Start period de 60s para acomodar migrations.

---

## Rollback

1. **Rollback de código**: Reimplantar a imagem anterior no App Runner (`aws apprunner update-service --image-identifier <ecr-uri>:<tag-anterior>`).
2. **Rollback de migration**: Não há rollback automático de migrations Prisma. Usar padrão expand/contract para garantir que migrations são aditivas e reversíveis. Para remoção de colunas, usar uma migration de contract separada após validar que o código não as usa.
3. **Rollback de IaC**: `terraform apply` do estado anterior (estado guardado no S3 com versionamento).

---

## Consequências

- Positivas: Deploy reproduzível, segredos centralizados, custo operacional baixo.
- Negativas: Dependência do App Runner (vendor lock-in moderado); migrations em entrypoint podem atrasar o arranque se houver muitas alterações.
- Futuras: Quando o tráfego crescer, avaliar ECS Fargate + ALB para controlo fino de rede e suporte a WebSockets.
