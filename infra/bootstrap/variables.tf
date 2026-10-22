variable "aws_region" {
  description = "Região AWS do bucket de estado. Tem de ser a `region` do backend de infra/storage-prod/backend.tf. eu-west-1: na UE, como os documentos (ADR-0050 §2)."
  type        = string
  default     = "eu-west-1"
}

variable "state_bucket_name" {
  description = "Nome do bucket S3 para estado Terraform remoto (único globalmente)"
  type        = string
  default     = "gespro-terraform-state"
}
