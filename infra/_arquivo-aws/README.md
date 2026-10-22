# infra/_arquivo-aws — Terraform AWS arquivado (ADR-0050)

**Arquivado, não apagado.** Com a produção no Railway (ADR-0050 §1, §6), o cálculo e as bases deixam de
ser AWS. Este directório guarda, tal como estava, o IaC que servia essa pilha — **nunca foi aplicado**
(`docs/status.md`) e o CI deixou de o correr.

| O quê | Era |
|---|---|
| `live/prod`, `live/dev` | Stacks por ambiente (App Runner, RDS, VPC, Secrets Manager, CloudWatch), com os testes de wiring de `live/prod/tests/` |
| `modules/app` | ECR + App Runner + roles IAM + VPC Connector |
| `modules/rds` | RDS PostgreSQL 17, PITR 35 dias (teste `tests/continuidade.tftest.hcl`) |
| `modules/network` | VPC, sub-redes, NAT, security groups |
| `modules/secrets` | Secrets Manager (DATABASE_URL, AUTH_SECRET, SMTP, OTLP) |
| `modules/monitoring` | Alarmes CloudWatch + SNS + health check Route 53 (#576; teste `tests/alertas.tftest.hcl`) |

## O que ficou fora do arquivo

- `infra/modules/storage` — o bucket dos documentos (Object Lock GOVERNANCE 10 anos, réplica, #575/#638/#644).
  Os documentos continuam na AWS: os Railway Buckets não têm versionamento nem Object Lock (ADR-0050 §2).
- `infra/storage-prod` — a única stack que se aplica: instancia o `storage` e a credencial IAM da app.
- `infra/bootstrap` — o bucket de estado remoto, usado pela `storage-prod`.

As stacks `live/*` deste arquivo apontam para `../../../modules/storage` (o módulo que ficou), para
continuarem a validar.

## Recuperar

Se o Railway deixar de servir (ADR-0026 §4, mesmo raciocínio):

```bash
git mv infra/_arquivo-aws/live infra/live
git mv infra/_arquivo-aws/modules/{app,rds,network,secrets,monitoring} infra/modules/
# repor source = "../../modules/storage" em infra/live/{dev,prod}/main.tf
terraform -chdir=infra/live/prod init -backend=false && terraform -chdir=infra/live/prod test
```

…e voltar a pôr esses directórios no job `terraform` do `.github/workflows/ci.yml`. Atenção: o bucket de
documentos passa a ser declarado em **dois** estados (`storage-prod` e `live/prod`) — antes do primeiro
`apply` de `live/prod`, remover o `module "storage"` de uma das stacks ou mover o estado
(`terraform state mv`/`import`); senão o `prevent_destroy` trava um dos planos, e com razão. Os
pressupostos do código são os de 2026-10 (ADR-0012 a 0022) e falta-lhe o que o #572 pedia (Keycloak,
Valkey, agendador).
