# ==============================================================================
# Stack: live/prod
#
# Ambiente de produção.
# Diferenças face ao dev:
#   - RDS: Multi-AZ, db.t4g.small, deletion_protection=true
#   - App Runner: cpu=512, memory=1024, min_size=2, max_size=10
#   - Backups: 7 dias
#   - skip_final_snapshot=false (snapshot obrigatório antes de destruir)
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
  backup_retention_days     = 7
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

  project         = local.project
  environment     = local.environment
  expiration_days = 30
  allowed_origins = [var.app_url]
  tags            = local.default_tags
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

  # Storage
  s3_bucket_name = module.storage.bucket_name
  s3_bucket_arn  = module.storage.bucket_arn

  app_url = var.app_url
  tags    = local.default_tags
}
