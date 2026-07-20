variable "aws_region" {
  description = "Região AWS (af-south-1 = Cape Town, mais próxima de Moçambique)"
  type        = string
  default     = "af-south-1"
}

variable "state_bucket_name" {
  description = "Nome do bucket S3 para estado Terraform remoto (único globalmente)"
  type        = string
  default     = "gespro-terraform-state"
}
