output "service_url" {
  description = "URL do serviço App Runner (HTTPS gerido)"
  value       = "https://${aws_apprunner_service.main.service_url}"
}

output "service_arn" {
  description = "ARN do serviço App Runner"
  value       = aws_apprunner_service.main.arn
}

output "ecr_repository_url" {
  description = "URL do repositório ECR"
  value       = aws_ecr_repository.main.repository_url
}

output "ecr_repository_name" {
  description = "Nome do repositório ECR"
  value       = aws_ecr_repository.main.name
}
