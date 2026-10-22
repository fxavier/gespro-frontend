output "database_url_secret_arn" {
  description = "ARN do segredo DATABASE_URL"
  value       = aws_secretsmanager_secret.database_url.arn
}

output "db_credentials_secret_arn" {
  description = "ARN do segredo DB_CREDENTIALS (para o módulo rds)"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

output "auth_secret_arn" {
  description = "ARN do segredo AUTH_SECRET"
  value       = aws_secretsmanager_secret.auth_secret.arn
}

output "smtp_credentials_secret_arn" {
  description = "ARN do segredo SMTP_CREDENTIALS"
  value       = aws_secretsmanager_secret.smtp_credentials.arn
}

output "otel_credentials_secret_arn" {
  description = "ARN do segredo OTEL_CREDENTIALS"
  value       = aws_secretsmanager_secret.otel_credentials.arn
}
