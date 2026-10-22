# infra

## O que se aplica (ADR-0050)

A produção corre no **Railway** (ADR-0050): cálculo e bases são declarados pelo IaC do Railway
(`infra/railway/`, `.railway/railway.ts` — #664, ADR-0050 §6). O Terraform AWS ficou só para o que o Railway não cobre —
**o bucket S3 dos documentos** (Object Lock, versionamento, réplica; ADR-0050 §2).

| Directório | O quê | Estado |
| --- | --- | --- |
| `bootstrap/` | Bucket do estado remoto (S3 + lock nativo), estado local | Uma vez por conta AWS, [HUMANO] |
| `storage-prod/` | Bucket dos documentos + réplica (módulo `storage`) e a credencial IAM da app | Nunca aplicado; primeiro `plan`/`apply` [HUMANO] |
| `modules/storage/` | O módulo do bucket (#575, #638, #644) | Testado com fornecedor dobrado |
| `_arquivo-aws/` | App Runner, RDS, rede, segredos, alertas, `live/{dev,prod}` | **Arquivado, ver ADR-0050** e o README de lá |
| `local/`, `keycloak/` | Pilha local (ADR-0026), realm Keycloak | — |

Verificação offline (é o que o job `terraform` do CI corre):

```bash
terraform fmt -check -recursive infra
for d in infra/modules/storage infra/storage-prod; do
  terraform -chdir=$d init -backend=false && terraform -chdir=$d test
done
```

### storage-prod: primeiro apply e variáveis do Railway

```bash
terraform -chdir=infra/bootstrap init && terraform -chdir=infra/bootstrap apply   # se ainda não existir
cp infra/storage-prod/terraform.tfvars.example infra/storage-prod/terraform.tfvars  # escolher as regiões UE
terraform -chdir=infra/storage-prod init && terraform -chdir=infra/storage-prod plan
terraform -chdir=infra/storage-prod apply
terraform -chdir=infra/storage-prod output variaveis_railway      # nomes e valores não secretos
terraform -chdir=infra/storage-prod output -raw app_secret_access_key   # directo para a variável selada
```

No serviço `erp` do Railway: `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID` e
`AWS_SECRET_ACCESS_KEY` (seladas). A chave nunca entra no repositório nem num log. Rodar a chave:
`terraform -chdir=infra/storage-prod apply -replace=aws_iam_access_key.app` e actualizar o Railway logo a
seguir (a chave antiga morre no fim do apply).

A credencial é uma chave de utilizador IAM e não federação OIDC — desvio ao ADR-0022 §3 registado no
ADR-0050 §2. A política só dá `Get`/`Put`/`DeleteObject` no prefixo `tenant/` e nega explicitamente
`BypassGovernanceRetention` e `DeleteObjectVersion`.

## Versões e locks de providers

As raízes de deploy (`infra/storage-prod`, `infra/bootstrap`) commitam o `.terraform.lock.hcl` — é ele que
fixa as versões dos providers. O lock de `storage-prod` leva hashes de várias plataformas (o CI corre em
linux_amd64); ao mudar de versão, regenera-o com
`terraform -chdir=infra/storage-prod providers lock -platform=linux_amd64 -platform=darwin_amd64 -platform=darwin_arm64`.

Os módulos (`infra/modules/*`) ignoram o lock (`.gitignore`): o que o `terraform init -backend=false` dos testes
cria lá não é usado em deploy nenhum (#642). O major do provider nos módulos é fixado pela constraint do
`versions.tf` (`~> 5.80`, igual às stacks), não por um lock.
