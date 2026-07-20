# ==============================================================================
# módulo: network
#
# Cria a VPC mínima para GestPro:
#   - Subnets públicas (App Runner VPC Connector egress / NAT GW futuro)
#   - Subnets privadas (RDS PostgreSQL, recursos internos)
#   - Security Groups: app (App Runner) → rds (PostgreSQL 5432)
#   - Internet Gateway para subnets públicas
#
# App Runner liga-se ao RDS via VPC Connector (egress → subnet privada).
# RDS não tem IP público — acessível apenas dentro da VPC.
# ==============================================================================

locals {
  name_prefix = "${var.project}-${var.environment}"
  az_count    = length(var.azs)
}

# ------------------------------------------------------------------------------
# VPC
# ------------------------------------------------------------------------------
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-vpc"
  })
}

# ------------------------------------------------------------------------------
# Internet Gateway (para subnets públicas)
# ------------------------------------------------------------------------------
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-igw"
  })
}

# ------------------------------------------------------------------------------
# Subnets públicas (uma por AZ)
# Usadas pelo App Runner VPC Connector para acesso à internet
# ------------------------------------------------------------------------------
resource "aws_subnet" "public" {
  count = local.az_count

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = false

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-public-${count.index + 1}"
    Tier = "public"
  })
}

# ------------------------------------------------------------------------------
# Subnets privadas (uma por AZ)
# Usadas pelo RDS e pelo VPC Connector do App Runner
# ------------------------------------------------------------------------------
resource "aws_subnet" "private" {
  count = local.az_count

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = var.azs[count.index]

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-private-${count.index + 1}"
    Tier = "private"
  })
}

# ------------------------------------------------------------------------------
# Route table pública → Internet Gateway
# ------------------------------------------------------------------------------
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-rt-public"
  })
}

resource "aws_route_table_association" "public" {
  count = local.az_count

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ------------------------------------------------------------------------------
# Security Group: App Runner VPC Connector
# Egress apenas — App Runner controla o ingress externamente (HTTPS gerido)
# ------------------------------------------------------------------------------
resource "aws_security_group" "apprunner" {
  name        = "${local.name_prefix}-apprunner-sg"
  description = "App Runner VPC Connector — egress para RDS e internet"
  vpc_id      = aws_vpc.main.id

  egress {
    description = "Acesso ao RDS PostgreSQL"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "HTTPS para AWS APIs (Secrets Manager, ECR, etc.)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-apprunner-sg"
  })
}

# ------------------------------------------------------------------------------
# Security Group: RDS PostgreSQL
# Aceita apenas tráfego do SG do App Runner
# ------------------------------------------------------------------------------
resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds-sg"
  description = "RDS PostgreSQL — aceita apenas tráfego do App Runner"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL do App Runner"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.apprunner.id]
  }

  egress {
    description = "Sem egress do RDS"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-rds-sg"
  })
}
