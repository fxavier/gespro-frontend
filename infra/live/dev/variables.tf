variable "aws_region" {
  description = "Região AWS"
  type        = string
  default     = "af-south-1"
}

variable "aws_account_id" {
  description = "ID da conta AWS"
  type        = string
}

variable "image_tag" {
  description = "Tag da imagem Docker a deployar (ex: sha-abc1234)"
  type        = string
  default     = "latest"
}

variable "app_url" {
  description = "URL pública da aplicação (para NEXTAUTH_URL)"
  type        = string
}

variable "replica_region" {
  description = "Região da réplica do bucket (opcional em dev; null = sem replicação). Diferente de aws_region."
  type        = string
  default     = null

  validation {
    condition     = var.replica_region == null || var.replica_region != var.aws_region
    error_message = "replica_region tem de ser diferente de aws_region."
  }
}
