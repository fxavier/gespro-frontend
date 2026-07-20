output "bucket_name" {
  description = "Nome do bucket S3 de uploads"
  value       = aws_s3_bucket.uploads.id
}

output "bucket_arn" {
  description = "ARN do bucket S3 de uploads"
  value       = aws_s3_bucket.uploads.arn
}

output "bucket_domain_name" {
  description = "Domain name do bucket S3"
  value       = aws_s3_bucket.uploads.bucket_domain_name
}
