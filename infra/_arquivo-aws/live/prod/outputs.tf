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

output "alertas_sns_topic_arn" {
  description = "Tópico SNS dos alertas (região principal) — o ensaio sintético publica/observa aqui"
  value       = module.monitoring.sns_topic_arn
}

output "alertas_health_check_id" {
  description = "Health check Route 53 sobre /api/ready (docs/runbooks/alertas-producao.md)"
  value       = module.monitoring.health_check_id
}

output "app_log_group" {
  description = "Grupo de registos da app no CloudWatch Logs"
  value       = module.monitoring.log_group_name
}

output "rds_instance_id" {
  description = "Identificador da instância RDS — o que o instantâneo pré-migração usa (docs/runbooks/restauro-bd.md)"
  value       = module.rds.instance_id
}
