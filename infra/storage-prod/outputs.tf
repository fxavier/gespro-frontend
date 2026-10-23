output "s3_bucket_name" {
  description = "Nome do bucket dos documentos — valor de S3_BUCKET no serviço `erp`"
  value       = module.storage.bucket_name
}

output "s3_replica_bucket_name" {
  description = "Nome do bucket réplica, na replica_region"
  value       = module.storage.replica_bucket_name
}

output "object_lock" {
  description = "Object Lock do bucket: modo, anos de retenção e dias até expirar uma versão não corrente"
  value       = module.storage.object_lock
}

output "app_access_key_id" {
  description = "Id da chave de acesso da app — valor de AWS_ACCESS_KEY_ID no Railway (`terraform output -raw app_access_key_id`)"
  value       = aws_iam_access_key.app.id
  sensitive   = true
}

output "app_secret_access_key" {
  description = "Segredo da chave de acesso da app — valor de AWS_SECRET_ACCESS_KEY no Railway (`terraform output -raw app_secret_access_key`). Nunca no repositório nem em logs."
  value       = aws_iam_access_key.app.secret
  sensitive   = true
}

# O que se põe no serviço `erp` do Railway (variáveis seladas para as duas
# últimas). Os valores das chaves NÃO estão aqui: só o comando que os dá.
output "variaveis_railway" {
  description = "Variáveis do serviço `erp` no Railway: nome → valor (ou o comando que o dá, para a chave)"
  value = {
    STORAGE_DRIVER        = "s3"
    S3_BUCKET             = module.storage.bucket_name
    S3_REGION             = var.aws_region
    AWS_ACCESS_KEY_ID     = "terraform -chdir=infra/storage-prod output -raw app_access_key_id"
    AWS_SECRET_ACCESS_KEY = "terraform -chdir=infra/storage-prod output -raw app_secret_access_key"
  }
}
