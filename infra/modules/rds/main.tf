# ==============================================================================
# módulo: rds
#
# RDS PostgreSQL 17 para GestPro:
#   - Subnet group em subnets privadas (sem IP público)
#   - Encriptação em repouso (storage_encrypted)
#   - Backups automáticos e manutenção gerida
#   - Multi-AZ configurável (prod: true, dev: false para custo)
#   - Credenciais lidas do Secrets Manager (não no estado Terraform)
# ==============================================================================

locals {
  name_prefix = "${var.project}-${var.environment}"
}

data "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = var.db_credentials_secret_arn
}

locals {
  db_credentials = jsondecode(data.aws_secretsmanager_secret_version.db_credentials.secret_string)
}

# ------------------------------------------------------------------------------
# Subnet Group — subnets privadas apenas
# ------------------------------------------------------------------------------
resource "aws_db_subnet_group" "main" {
  name        = "${local.name_prefix}-db-subnet-group"
  subnet_ids  = var.subnet_ids
  description = "Subnet group privado para RDS GestPro ${var.environment}"

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-db-subnet-group"
  })
}

# ------------------------------------------------------------------------------
# Parameter Group — PostgreSQL 17
# ------------------------------------------------------------------------------
resource "aws_db_parameter_group" "main" {
  name        = "${local.name_prefix}-pg17"
  family      = "postgres17"
  description = "GestPro PostgreSQL 17 — parâmetros de produção"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # log queries > 1s
  }

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-pg17-params"
  })
}

# ------------------------------------------------------------------------------
# RDS Instance — PostgreSQL 17
# ------------------------------------------------------------------------------
resource "aws_db_instance" "main" {
  identifier = "${local.name_prefix}-postgres"

  # Engine
  engine         = "postgres"
  engine_version = var.engine_version

  # Instância e armazenamento
  instance_class        = var.instance_class
  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  # Base de dados
  db_name  = var.db_name
  username = local.db_credentials.username
  password = local.db_credentials.password

  # Rede
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = var.security_group_ids
  publicly_accessible    = false

  # Alta disponibilidade (activar em prod)
  multi_az = var.multi_az

  # Backups e manutenção
  backup_retention_period = var.backup_retention_days
  backup_window           = "03:00-04:00" # UTC — madrugada em Maputo (UTC+2)
  maintenance_window      = "Mon:04:00-Mon:05:00"
  copy_tags_to_snapshot   = true

  # Parâmetros
  parameter_group_name = aws_db_parameter_group.main.name

  # Protecção contra destruição acidental
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${local.name_prefix}-final-snapshot"

  # Performance Insights — apenas disponível em db.m* e db.r* (NÃO db.t*).
  # Activar via variável enable_performance_insights ao subir de classe.
  performance_insights_enabled = var.enable_performance_insights

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-postgres"
  })

  lifecycle {
    # Ignorar alterações de password (gerida fora do TF pelo Secrets Manager rotation)
    ignore_changes = [password]
  }
}
