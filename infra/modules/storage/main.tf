# ==============================================================================
# módulo: storage
#
# S3 para uploads e relatórios GestPro:
#   - Bucket privado (sem acesso público)
#   - Encriptação SSE-S3 em repouso
#   - Versionamento activado
#   - Lifecycle: expirar tmp/ ao fim de N dias
#   - CORS configurado para uploads directos do browser (pre-signed URLs)
# ==============================================================================

locals {
  bucket_name = "${var.project}-uploads-${var.environment}"
}

resource "aws_s3_bucket" "uploads" {
  bucket = local.bucket_name

  tags = merge(var.tags, {
    Name    = local.bucket_name
    Purpose = "uploads-relatorios"
  })
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    id     = "expire-tmp-objects"
    status = "Enabled"

    filter {
      prefix = "tmp/"
    }

    expiration {
      days = var.expiration_days
    }
  }

  # Objectos órfãos (presign sem registo subsequente) — aborta multipart incompletos.
  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# CORS: só PUT/GET (upload directo + download por presigned URL), restrito às
# origens da app (ALLOWED_ORIGINS). NUNCA wildcard em produção — ver spec 01 §7.
resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_headers = ["Content-Type"]
    allowed_methods = ["GET", "PUT"]
    allowed_origins = var.allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}
