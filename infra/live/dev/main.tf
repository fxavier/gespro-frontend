# ==============================================================================
# Stack: live/dev
#
# Ambiente de desenvolvimento/staging.
# Diferenças face ao prod:
#   - RDS: single-AZ, db.t4g.micro, deletion_protection=false
#   - App Runner: cpu=256, memory=512, min_size=1, max_size=2
#   - Backups: 3 dias (prod: 7)
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
  environment = "dev"

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
# Módulo: secrets (criar primeiro — outros módulos dependem dos ARNs)
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
  vpc_cidr    = "10.1.0.0/16"
  azs         = slice(data.aws_availability_zones.available.names, 0, 2)
  tags        = local.default_tags
}

# ------------------------------------------------------------------------------
# Módulo: rds (PostgreSQL 17, single-AZ em dev)
# ------------------------------------------------------------------------------
module "rds" {
  source = "../../modules/rds"

  project     = local.project
  environment = local.environment

  subnet_ids         = module.network.private_subnet_ids
  security_group_ids = [module.network.rds_sg_id]

  db_name                   = "gespro"
  engine_version            = "17.2"
  instance_class            = "db.t4g.micro"
  allocated_storage         = 20
  max_allocated_storage     = 50
  multi_az                  = false
  backup_retention_days     = 3
  deletion_protection       = false
  skip_final_snapshot       = true
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
  expiration_days = 7
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

  # Dimensionamento reduzido para dev
  cpu      = "256"
  memory   = "512"
  min_size = 1
  max_size = 2

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
