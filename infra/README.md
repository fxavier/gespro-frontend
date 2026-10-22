# infra

## Locks de providers (`.terraform.lock.hcl`)

As raízes de deploy (`infra/live/*`, `infra/bootstrap`) commitam o lock — é ele que fixa as versões dos
providers. Os módulos (`infra/modules/*`) ignoram-no (`.gitignore`): o lock que o `terraform init
-backend=false` dos testes cria lá não é usado em deploy nenhum (#642).
