output "app_url" {
  description = "URL do serviço App Runner (prod)"
  value       = module.app.service_url
}

output "ecr_repository_url" {
  description = "URL do repositório ECR"
  value       = module.app.ecr_repository_url
}

output "rds_endpoint" {
  description = "Endpoint do RDS PostgreSQL (prod)"
  value       = module.rds.endpoint
  sensitive   = true
}

output "s3_bucket_name" {
  description = "Nome do bucket S3 de uploads (prod)"
  value       = module.storage.bucket_name
}

output "s3_replica_bucket_name" {
  description = "Nome do bucket réplica, na replica_region (prod)"
  value       = module.storage.replica_bucket_name
}

output "rds_instance_id" {
  description = "Identificador da instância RDS — o que o instantâneo pré-migração usa (docs/runbooks/restauro-bd.md)"
  value       = module.rds.instance_id
}
