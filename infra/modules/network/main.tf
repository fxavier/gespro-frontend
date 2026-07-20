# ==============================================================================
# módulo: network
#
# VPC para GestPro com egress seguro das subnets privadas:
#   - Subnets públicas + Internet Gateway
#   - Subnets privadas com NAT Gateway (egress para S3, SMTP, OTLP, AWS APIs)
#   - Security Groups: App Runner VPC Connector → RDS (porta 5432)
#
# Decisão (ADR-0005): NAT Gateway em vez de VPC endpoints.
#   Racional: um único NAT (~$32/mês + transfer) cobre todos os destinos
#   (S3, Secrets Manager, ECR, SMTP externo, OTLP externo) sem necessidade
#   de múltiplos VPC endpoints por serviço. VPC endpoints são mais baratos
#   para tráfego AWS-only mas exigem um endpoint por serviço e não cobrem
#   tráfego externo (SMTP, OTLP). NAT é a solução geral.
#   Para optimização de custo futura: substituir S3 por gateway endpoint
#   (gratuito) + manter NAT para o restante.
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
# Internet Gateway (para subnets públicas e para o NAT Gateway)
# ------------------------------------------------------------------------------
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-igw"
  })
}

# ------------------------------------------------------------------------------
# Subnets públicas (uma por AZ)
# Alojam o NAT Gateway; App Runner usa VPC Connector nas subnets privadas.
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
# Alojam o RDS e o VPC Connector do App Runner.
# Egress via NAT Gateway na subnet pública correspondente.
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
# NAT Gateway — permite que recursos nas subnets privadas (App Runner VPC
# Connector) alcancem a internet: S3, Secrets Manager, ECR, SMTP, OTLP.
#
# Um único NAT na primeira AZ (custo: ~$32/mês + transfer).
# Para HA multi-AZ em prod: criar um NAT por AZ (count = local.az_count).
# ------------------------------------------------------------------------------
resource "aws_eip" "nat" {
  domain = "vpc"

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-nat-eip"
  })

  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id # NAT na primeira subnet pública

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-nat"
  })

  depends_on = [aws_internet_gateway.main]
}

# ------------------------------------------------------------------------------
# Route table privada → NAT Gateway (egress para internet e AWS APIs)
# ------------------------------------------------------------------------------
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-rt-private"
  })
}

resource "aws_route_table_association" "private" {
  count = local.az_count

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ------------------------------------------------------------------------------
# Security Group: App Runner VPC Connector
# Egress: RDS (5432) + internet (443) via NAT Gateway.
# O App Runner controla o ingress externamente (HTTPS gerido).
# ------------------------------------------------------------------------------
resource "aws_security_group" "apprunner" {
  name        = "${local.name_prefix}-apprunner-sg"
  description = "App Runner VPC Connector — egress para RDS e internet via NAT"
  vpc_id      = aws_vpc.main.id

  egress {
    description = "Acesso ao RDS PostgreSQL"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "HTTPS para AWS APIs e serviços externos (via NAT GW)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "SMTP para email transaccional (via NAT GW)"
    from_port   = 587
    to_port     = 587
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-apprunner-sg"
  })
}

# ------------------------------------------------------------------------------
# Security Group: RDS PostgreSQL
# Aceita apenas tráfego do SG do App Runner (sem acesso público)
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
    description = "Egress do RDS (respostas)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-rds-sg"
  })
}
