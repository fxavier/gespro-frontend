# ==============================================================================
# módulo: app
#
# App Runner + ECR para GestPro:
#   - ECR repository (imagens Docker)
#   - App Runner service (container, autoscaling, VPC Connector)
#   - IAM roles: instance role (S3, Secrets Manager) + access role (ECR)
#   - VPC Connector (egress privado para RDS)
#
# Decisão (ADR-0005): App Runner em vez de ECS Fargate:
#   - HTTPS gerido (sem ALB/ACM manual)
#   - Autoscaling simples (sem Target Groups)
#   - Menor overhead operacional para equipa pequena
#   - VPC Connector suporta ligação privada ao RDS
# ==============================================================================

locals {
  name_prefix = "${var.project}-${var.environment}"
  ecr_image   = "${var.aws_account_id}.dkr.ecr.${var.aws_region}.amazonaws.com/${local.name_prefix}:${var.image_tag}"
}

# ------------------------------------------------------------------------------
# ECR Repository
# ------------------------------------------------------------------------------
resource "aws_ecr_repository" "main" {
  name                 = local.name_prefix
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = merge(var.tags, {
    Name = local.name_prefix
  })
}

resource "aws_ecr_lifecycle_policy" "main" {
  repository = aws_ecr_repository.main.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Manter apenas as últimas 10 imagens tagged"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["sha-", "v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Expirar imagens untagged após 7 dias"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      }
    ]
  })
}

# ------------------------------------------------------------------------------
# IAM Role: App Runner Access Role (para puxar imagens do ECR)
# ------------------------------------------------------------------------------
data "aws_iam_policy_document" "apprunner_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["build.apprunner.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "apprunner_access" {
  name               = "${local.name_prefix}-apprunner-access-role"
  assume_role_policy = data.aws_iam_policy_document.apprunner_assume.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr" {
  role       = aws_iam_role.apprunner_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

# ------------------------------------------------------------------------------
# IAM Role: App Runner Instance Role (para o container aceder a AWS)
# ------------------------------------------------------------------------------
data "aws_iam_policy_document" "apprunner_instance_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["tasks.apprunner.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "apprunner_instance" {
  name               = "${local.name_prefix}-apprunner-instance-role"
  assume_role_policy = data.aws_iam_policy_document.apprunner_instance_assume.json

  tags = var.tags
}

# Política: acesso ao S3 de uploads
data "aws_iam_policy_document" "apprunner_s3" {
  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]
    resources = [
      var.s3_bucket_arn,
      "${var.s3_bucket_arn}/*",
    ]
  }
}

resource "aws_iam_role_policy" "apprunner_s3" {
  name   = "s3-uploads"
  role   = aws_iam_role.apprunner_instance.id
  policy = data.aws_iam_policy_document.apprunner_s3.json
}

# Política: leitura de Secrets Manager
data "aws_iam_policy_document" "apprunner_secrets" {
  statement {
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = [
      var.database_url_secret_arn,
      var.auth_secret_arn,
      var.smtp_credentials_secret_arn,
      var.otel_credentials_secret_arn,
    ]
  }
}

resource "aws_iam_role_policy" "apprunner_secrets" {
  name   = "secrets-manager-read"
  role   = aws_iam_role.apprunner_instance.id
  policy = data.aws_iam_policy_document.apprunner_secrets.json
}

# ------------------------------------------------------------------------------
# App Runner VPC Connector (egress privado para RDS)
# ------------------------------------------------------------------------------
resource "aws_apprunner_vpc_connector" "main" {
  vpc_connector_name = "${local.name_prefix}-vpc-connector"
  subnets            = var.private_subnet_ids
  security_groups    = [var.apprunner_sg_id]

  tags = var.tags
}

# ------------------------------------------------------------------------------
# App Runner Autoscaling Configuration
# ------------------------------------------------------------------------------
resource "aws_apprunner_auto_scaling_configuration_version" "main" {
  auto_scaling_configuration_name = "${local.name_prefix}-autoscaling"

  min_size        = var.min_size
  max_size        = var.max_size
  max_concurrency = 100

  tags = var.tags
}

# ------------------------------------------------------------------------------
# App Runner Service
# ------------------------------------------------------------------------------
resource "aws_apprunner_service" "main" {
  service_name = local.name_prefix

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_access.arn
    }

    image_repository {
      image_configuration {
        port = "3000"

        # Variáveis de ambiente não-sensíveis
        runtime_environment_variables = {
          NODE_ENV       = "production"
          PORT           = "3000"
          NEXTAUTH_URL   = var.app_url
          S3_BUCKET_NAME = var.s3_bucket_name
          AWS_REGION     = var.aws_region
          APP_VERSION    = var.image_tag
        }

        # Segredos injectados do Secrets Manager em runtime.
        # Formato: ARN simples → valor string directo.
        # Formato: "${arn}:json-key::" → extrai a chave json-key do segredo JSON.
        # Permite que o código leia variáveis individuais (SMTP_HOST, etc.)
        # sem deserializar JSON — compatível com specs 13 (nodemailer) e 14 (OTel).
        runtime_environment_secrets = {
          # String secrets — injectados directamente
          DATABASE_URL = var.database_url_secret_arn
          AUTH_SECRET  = var.auth_secret_arn

          # SMTP — extrair chaves individuais do segredo JSON
          # Formato Secrets Manager JSON: { host, port, user, password, from }
          SMTP_HOST     = "${var.smtp_credentials_secret_arn}:host::"
          SMTP_PORT     = "${var.smtp_credentials_secret_arn}:port::"
          SMTP_USER     = "${var.smtp_credentials_secret_arn}:user::"
          SMTP_PASSWORD = "${var.smtp_credentials_secret_arn}:password::"
          SMTP_FROM     = "${var.smtp_credentials_secret_arn}:from::"

          # OpenTelemetry — extrair chaves individuais do segredo JSON
          # Formato Secrets Manager JSON: { endpoint, headers }
          OTEL_EXPORTER_OTLP_ENDPOINT = "${var.otel_credentials_secret_arn}:endpoint::"
          OTEL_EXPORTER_OTLP_HEADERS  = "${var.otel_credentials_secret_arn}:headers::"
        }
      }

      image_identifier      = local.ecr_image
      image_repository_type = "ECR"
    }

    # Desactivar deploy automático ao push — gerir via CI/CD (spec 15)
    auto_deployments_enabled = false
  }

  instance_configuration {
    cpu               = var.cpu
    memory            = var.memory
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.main.arn
    }

    ingress_configuration {
      is_publicly_accessible = true
    }
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/api/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.main.arn

  tags = merge(var.tags, {
    Name = local.name_prefix
  })

  depends_on = [
    aws_iam_role_policy_attachment.apprunner_ecr,
    aws_iam_role_policy.apprunner_secrets,
    aws_iam_role_policy.apprunner_s3,
  ]
}
