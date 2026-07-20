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
}

variable "app_url" {
  description = "URL pública da aplicação (para NEXTAUTH_URL)"
  type        = string
}
