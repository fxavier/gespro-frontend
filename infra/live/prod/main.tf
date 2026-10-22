# ==============================================================================
# Stack: live/prod
#
# Ambiente de produção.
# Diferenças face ao dev:
#   - RDS: Multi-AZ, db.t4g.small, deletion_protection=true
#   - App Runner: cpu=512, memory=1024, min_size=2, max_size=10
#   - Backups/PITR: 35 dias (ADR-0020 §2), mantidos se a instância for apagada
#   - skip_final_snapshot=false (snapshot obrigatório antes de destruir)
#   - S3: Object Lock (conservação fiscal) + réplica em `replica_region`
#   - Alertas: CloudWatch + SNS para `alert_email` (modules/monitoring, #576)
# ==============================================================================

terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.default_tags
  }
}

# Região da réplica dos documentos (ADR-0020 §2, #575).
provider "aws" {
  alias  = "replica"
  region = var.replica_region

  default_tags {
    tags = local.default_tags
  }
}

# us-east-1: onde o Route 53 publica as métricas dos health checks (#576).
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.default_tags
  }
}

locals {
  project     = "gespro"
  environment = "prod"

  default_tags = {
    Project     = local.project
    Environment = local.environment
    ManagedBy   = "terraform"
    Owner       = "devops"
    CostCenter  = "engineering"
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

# ------------------------------------------------------------------------------
# Módulo: secrets
# ------------------------------------------------------------------------------
module "secrets" {
  source = "../../modules/secrets"

  project     = local.project
  environment = local.environment
  tags        = local.default_tags
}

# ------------------------------------------------------------------------------
# Módulo: network
# ------------------------------------------------------------------------------
module "network" {
  source = "../../modules/network"

  project     = local.project
  environment = local.environment
  vpc_cidr    = "10.2.0.0/16"
  azs         = slice(data.aws_availability_zones.available.names, 0, 2)
  tags        = local.default_tags
}

# ------------------------------------------------------------------------------
# Módulo: rds (PostgreSQL 17, Multi-AZ em prod)
# ------------------------------------------------------------------------------
module "rds" {
  source = "../../modules/rds"

  project     = local.project
  environment = local.environment

  subnet_ids         = module.network.private_subnet_ids
  security_group_ids = [module.network.rds_sg_id]

  db_name                   = "gespro"
  engine_version            = "17.2"
  instance_class            = "db.t4g.small"
  allocated_storage         = 50
  max_allocated_storage     = 500
  multi_az                  = true
  backup_retention_days     = 35 # ADR-0020 §2 — o máximo do RDS; é a janela do PITR
  retain_automated_backups  = true
  deletion_protection       = true
  skip_final_snapshot       = false
  db_credentials_secret_arn = module.secrets.db_credentials_secret_arn

  tags = local.default_tags
}

# ------------------------------------------------------------------------------
# Módulo: storage (S3)
# ------------------------------------------------------------------------------
module "storage" {
  source = "../../modules/storage"

  providers = {
    aws         = aws
    aws.replica = aws.replica
  }

  project         = local.project
  environment     = local.environment
  expiration_days = 30
  allowed_origins = [var.app_url]

  # Continuidade (ADR-0020 §2, #575)
  replica_region            = var.replica_region
  object_lock_retencao_anos = var.retencao_documentos_fiscais_anos
  object_lock_modo          = "GOVERNANCE" # porquê, em modules/storage/main.tf

  tags = local.default_tags
}

# ------------------------------------------------------------------------------
# Módulo: app (App Runner + ECR)
# ------------------------------------------------------------------------------
module "app" {
  source = "../../modules/app"

  project        = local.project
  environment    = local.environment
  aws_region     = var.aws_region
  aws_account_id = var.aws_account_id
  image_tag      = var.image_tag

  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  apprunner_sg_id    = module.network.apprunner_sg_id

  # Dimensionamento para produção
  cpu      = "512"
  memory   = "1024"
  min_size = 2
  max_size = 10

  # Secrets ARNs
  database_url_secret_arn     = module.secrets.database_url_secret_arn
  auth_secret_arn             = module.secrets.auth_secret_arn
  smtp_credentials_secret_arn = module.secrets.smtp_credentials_secret_arn
  otel_credentials_secret_arn = module.secrets.otel_credentials_secret_arn

  # Telemetria OTLP (ADR-0019 §1, #576) — null até haver destino escolhido
  otel_exporter_otlp_endpoint = var.otel_exporter_otlp_endpoint

  # Storage
  s3_bucket_name = module.storage.bucket_name
  s3_bucket_arn  = module.storage.bucket_arn

  app_url = var.app_url
  tags    = local.default_tags
}

# ------------------------------------------------------------------------------
# Módulo: monitoring (alarmes CloudWatch + SNS, #576)
# ------------------------------------------------------------------------------
module "monitoring" {
  source = "../../modules/monitoring"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  project     = local.project
  environment = local.environment
  alert_email = var.alert_email

  apprunner_service_name = module.app.service_name
  apprunner_service_id   = module.app.service_id
  health_check_fqdn      = module.app.service_host

  tags = local.default_tags
}
