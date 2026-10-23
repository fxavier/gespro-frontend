variable "project" {
  description = "Nome do projecto"
  type        = string
}

variable "environment" {
  description = "Ambiente (dev | prod)"
  type        = string
}

variable "aws_region" {
  description = "Região AWS"
  type        = string
}

variable "aws_account_id" {
  description = "ID da conta AWS"
  type        = string
}

variable "vpc_id" {
  description = "ID da VPC"
  type        = string
}

variable "private_subnet_ids" {
  description = "IDs das subnets privadas para o VPC Connector"
  type        = list(string)
}

variable "apprunner_sg_id" {
  description = "ID do Security Group do App Runner VPC Connector"
  type        = string
}

variable "image_tag" {
  description = "Tag da imagem Docker a usar (ex: sha-abc1234)"
  type        = string
  default     = "latest"
}

variable "cpu" {
  description = "CPU para o App Runner (256|512|1024|2048|4096)"
  type        = string
  default     = "512"
}

variable "memory" {
  description = "Memória para o App Runner em MB (512|1024|2048|3072|4096|6144|8192|10240|12288)"
  type        = string
  default     = "1024"
}

variable "min_size" {
  description = "Número mínimo de instâncias"
  type        = number
  default     = 1
}

variable "max_size" {
  description = "Número máximo de instâncias"
  type        = number
  default     = 5
}

variable "database_url_secret_arn" {
  description = "ARN do segredo DATABASE_URL no Secrets Manager"
  type        = string
}

variable "auth_secret_arn" {
  description = "ARN do segredo AUTH_SECRET no Secrets Manager"
  type        = string
}

variable "smtp_credentials_secret_arn" {
  description = "ARN do segredo SMTP_CREDENTIALS no Secrets Manager"
  type        = string
}

variable "otel_credentials_secret_arn" {
  description = "ARN do segredo OTEL_CREDENTIALS no Secrets Manager"
  type        = string
}

variable "otel_exporter_otlp_endpoint" {
  description = "Endpoint OTLP/HTTP do destino de telemetria de produção (ADR-0019 §1), ex.: https://otlp.fornecedor.example:4318. null = SDK OTel desligado; os registos continuam no CloudWatch Logs. Os cabeçalhos de autenticação vêm da chave `headers` do segredo OTEL_CREDENTIALS."
  type        = string
  default     = null

  validation {
    condition     = var.otel_exporter_otlp_endpoint == null || can(regex("^https://", var.otel_exporter_otlp_endpoint))
    error_message = "otel_exporter_otlp_endpoint tem de ser https:// (os cabeçalhos levam o token do fornecedor)."
  }
}

variable "otel_sample_rate" {
  description = "Fracção de traces amostrados (0–1) quando há endpoint OTLP (OTEL_SAMPLE_RATE)."
  type        = number
  default     = 1

  validation {
    condition     = var.otel_sample_rate >= 0 && var.otel_sample_rate <= 1
    error_message = "otel_sample_rate tem de estar entre 0 e 1."
  }
}

variable "s3_bucket_name" {
  description = "Nome do bucket S3 de uploads"
  type        = string
}

variable "s3_bucket_arn" {
  description = "ARN do bucket S3 de uploads"
  type        = string
}

variable "app_url" {
  description = "URL pública da aplicação (para NEXTAUTH_URL)"
  type        = string
}

variable "tags" {
  description = "Tags adicionais"
  type        = map(string)
  default     = {}
}
