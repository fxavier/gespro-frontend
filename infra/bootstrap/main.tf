# ==============================================================================
# infra/bootstrap/main.tf
#
# Configuração one-time do backend de estado Terraform (S3 + native locking).
# Executar UMA vez por conta AWS, antes de qualquer stack live/.
#
# Como usar:
#   cd infra/bootstrap
#   terraform init   # usa estado LOCAL (bootstrap não tem backend remoto)
#   terraform apply  # cria o bucket S3 para estado remoto
#
# Após criar o bucket, as stacks live/dev e live/prod usam-no como backend.
# ==============================================================================

terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
  # Bootstrap usa estado LOCAL — é o único módulo sem backend remoto
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "gespro"
      ManagedBy = "terraform"
      Stack     = "bootstrap"
    }
  }
}

# ------------------------------------------------------------------------------
# S3 bucket para estado Terraform remoto
# - Versionamento obrigatório (permite rollback de estado)
# - Encriptação SSE-S3 em repouso
# - Bloqueio público (estado contém informação sensível de infra)
# - Native state locking (Terraform >= 1.10, sem necessidade de DynamoDB)
# ------------------------------------------------------------------------------
resource "aws_s3_bucket" "terraform_state" {
  bucket = var.state_bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
