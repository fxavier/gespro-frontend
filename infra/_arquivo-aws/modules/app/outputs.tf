output "service_url" {
  description = "URL do serviço App Runner (HTTPS gerido)"
  value       = "https://${aws_apprunner_service.main.service_url}"
}

output "service_arn" {
  description = "ARN do serviço App Runner"
  value       = aws_apprunner_service.main.arn
}

output "service_name" {
  description = "Nome do serviço App Runner (dimensão ServiceName das métricas AWS/AppRunner)"
  value       = aws_apprunner_service.main.service_name
}

output "service_id" {
  description = "ID do serviço App Runner (dimensão ServiceID; faz parte do nome do grupo de registos)"
  value       = aws_apprunner_service.main.service_id
}

output "service_host" {
  description = "Host do URL por omissão do App Runner (sem esquema) — alvo do health check externo"
  value       = aws_apprunner_service.main.service_url
}

output "ecr_repository_url" {
  description = "URL do repositório ECR"
  value       = aws_ecr_repository.main.repository_url
}

output "ecr_repository_name" {
  description = "Nome do repositório ECR"
  value       = aws_ecr_repository.main.name
}
