# Backend S3 remoto com native state locking (Terraform >= 1.10) — o bucket que
# infra/bootstrap cria. A região é a do bucket de ESTADO (bootstrap), não a dos
# documentos (`aws_region`): têm de bater com o `aws_region` do bootstrap.
# O estado guarda o segredo da chave da app (aws_iam_access_key): o bucket é
# cifrado, versionado e sem acesso público, e só quem aplica o lê.
terraform {
  backend "s3" {
    bucket       = "gespro-terraform-state"
    key          = "storage-prod/terraform.tfstate"
    region       = "eu-west-1"
    use_lockfile = true
    encrypt      = true
  }
}
