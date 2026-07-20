# ==============================================================================
# módulo: secrets
#
# AWS Secrets Manager para GestPro:
#   - DATABASE_URL (URL completa de conexão PostgreSQL)
#   - DB_CREDENTIALS (username/password para RDS managed rotation)
#   - AUTH_SECRET (segredo JWT para next-auth)
#   - SMTP_CREDENTIALS (host, port, user, password, from)
#   - OTEL_CREDENTIALS (endpoint, headers OTLP)
#
# Fluxo de runtime:
#   App Runner injeta os secrets como variáveis de ambiente no container.
#   O código lê DATABASE_URL, AUTH_SECRET, etc. de process.env — sem alterações.
#
# REGRA: Os valores iniciais são PLACEHOLDERS. Preencher via console AWS ou
#        AWS CLI antes de fazer terraform apply na stack live/.
#        NUNCA colocar valores reais no código ou em .tfvars commitados.
# ==============================================================================

locals {
  name_prefix = "${var.project}/${var.environment}"
}

# ------------------------------------------------------------------------------
# DATABASE_URL — URL completa de conexão (construída pela stack live/ após RDS)
# ------------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "database_url" {
  name        = "${local.name_prefix}/DATABASE_URL"
  description = "URL de conexão PostgreSQL para GestPro (${var.environment})"

  tags = merge(var.tags, {
    Name    = "${local.name_prefix}/DATABASE_URL"
    Rotates = "false"
  })
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "PLACEHOLDER — substituir com: postgresql://user:pass@host:5432/gespro?schema=public"

  lifecycle {
    # Ignorar alterações ao valor após primeiro apply (gerido externamente)
    ignore_changes = [secret_string]
  }
}

# ------------------------------------------------------------------------------
# DB_CREDENTIALS — username/password para o RDS (lido pelo módulo rds/)
# Formato JSON: { "username": "...", "password": "..." }
# ------------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "${local.name_prefix}/DB_CREDENTIALS"
  description = "Credenciais PostgreSQL RDS para GestPro (${var.environment})"

  tags = merge(var.tags, {
    Name    = "${local.name_prefix}/DB_CREDENTIALS"
    Rotates = "true"
  })
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = "gespro_${var.environment}"
    password = "PLACEHOLDER_SUBSTITUIR_ANTES_DO_APPLY"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ------------------------------------------------------------------------------
# AUTH_SECRET — segredo JWT para next-auth (mínimo 32 bytes)
# Gerar com: openssl rand -hex 32
# ------------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "auth_secret" {
  name        = "${local.name_prefix}/AUTH_SECRET"
  description = "Segredo JWT next-auth para GestPro (${var.environment})"

  tags = merge(var.tags, {
    Name    = "${local.name_prefix}/AUTH_SECRET"
    Rotates = "false"
  })
}

resource "aws_secretsmanager_secret_version" "auth_secret" {
  secret_id     = aws_secretsmanager_secret.auth_secret.id
  secret_string = "PLACEHOLDER — substituir com: openssl rand -hex 32"

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ------------------------------------------------------------------------------
# SMTP_CREDENTIALS — credenciais de email transaccional
# Formato JSON: { "host": "...", "port": 587, "user": "...", "password": "...", "from": "..." }
# ------------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "smtp_credentials" {
  name        = "${local.name_prefix}/SMTP_CREDENTIALS"
  description = "Credenciais SMTP para GestPro (${var.environment})"

  tags = merge(var.tags, {
    Name    = "${local.name_prefix}/SMTP_CREDENTIALS"
    Rotates = "false"
  })
}

resource "aws_secretsmanager_secret_version" "smtp_credentials" {
  secret_id = aws_secretsmanager_secret.smtp_credentials.id
  secret_string = jsonencode({
    host     = "PLACEHOLDER"
    port     = 587
    user     = "PLACEHOLDER"
    password = "PLACEHOLDER"
    from     = "noreply@gespro.mz"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ------------------------------------------------------------------------------
# OTEL_CREDENTIALS — endpoint e headers para OpenTelemetry (spec 14)
# Formato JSON: { "endpoint": "...", "headers": "..." }
# ------------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "otel_credentials" {
  name        = "${local.name_prefix}/OTEL_CREDENTIALS"
  description = "Credenciais OTLP para observabilidade GestPro (${var.environment})"

  tags = merge(var.tags, {
    Name    = "${local.name_prefix}/OTEL_CREDENTIALS"
    Rotates = "false"
  })
}

resource "aws_secretsmanager_secret_version" "otel_credentials" {
  secret_id = aws_secretsmanager_secret.otel_credentials.id
  secret_string = jsonencode({
    endpoint = "PLACEHOLDER — ex: https://otel.example.com:4318"
    headers  = "PLACEHOLDER — ex: Authorization=Bearer xxx"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
