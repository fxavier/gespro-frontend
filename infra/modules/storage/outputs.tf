output "bucket_name" {
  description = "Nome do bucket S3 de uploads"
  value       = aws_s3_bucket.uploads.id
}

output "bucket_arn" {
  description = "ARN do bucket S3 de uploads"
  value       = aws_s3_bucket.uploads.arn
}

output "bucket_domain_name" {
  description = "Domain name do bucket S3"
  value       = aws_s3_bucket.uploads.bucket_domain_name
}

output "replica_bucket_name" {
  description = "Nome do bucket réplica (null sem replicação)"
  value       = one(aws_s3_bucket.replica[*].id)
}

output "replica_bucket_arn" {
  description = "ARN do bucket réplica (null sem replicação)"
  value       = one(aws_s3_bucket.replica[*].arn)
}

output "replicacao_planeada" {
  description = "true quando a configuração de replicação entre regiões existe"
  value       = length(aws_s3_bucket_replication_configuration.uploads) == 1
}

output "object_lock" {
  description = "Object Lock do bucket: modo, anos de retenção (0 = desligado) e dias até expirar uma versão não corrente"
  value = {
    modo            = local.object_lock ? var.object_lock_modo : null
    anos            = var.object_lock_retencao_anos
    noncurrent_days = local.noncurrent_days
  }
}

output "replication_role_arn" {
  description = "ARN da role IAM usada pelo S3 para replicar (null sem replicação)"
  value       = one(aws_iam_role.replicacao[*].arn)
}
