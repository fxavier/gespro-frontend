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
