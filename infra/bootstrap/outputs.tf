output "state_bucket_name" {
  description = "Nome do bucket S3 de estado Terraform"
  value       = aws_s3_bucket.terraform_state.id
}

output "state_bucket_arn" {
  description = "ARN do bucket S3 de estado Terraform"
  value       = aws_s3_bucket.terraform_state.arn
}

output "aws_region" {
  description = "Região AWS usada"
  value       = var.aws_region
}
