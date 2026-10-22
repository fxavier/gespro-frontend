# infra

## Versões e locks de providers

As raízes de deploy (`infra/live/*`, `infra/bootstrap`) commitam o `.terraform.lock.hcl` — é ele que fixa as
versões dos providers. Os locks de `infra/live/*` levam hashes de várias plataformas (o CI corre em
linux_amd64); ao mudar de versão, regenera-os com
`terraform -chdir=infra/live/<x> providers lock -platform=linux_amd64 -platform=darwin_amd64 -platform=darwin_arm64`.

Os módulos (`infra/modules/*`) ignoram o lock (`.gitignore`): o que o `terraform init -backend=false` dos testes
cria lá não é usado em deploy nenhum (#642). O major do provider nos módulos é fixado pela constraint do
`versions.tf` (`~> 5.80`, igual aos stacks), não por um lock.
