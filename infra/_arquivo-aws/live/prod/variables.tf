variable "aws_region" {
  description = "Região AWS"
  type        = string
  default     = "af-south-1"
}

variable "aws_account_id" {
  description = "ID da conta AWS"
  type        = string
}

variable "image_tag" {
  description = "Tag da imagem Docker a deployar (ex: sha-abc1234)"
  type        = string
}

variable "app_url" {
  description = "URL pública da aplicação (para NEXTAUTH_URL)"
  type        = string
}

# Sem omissão de propósito (#575): a região da réplica é uma decisão (custo,
# latência, onde os dados podem estar), não um valor que se herda por descuido.
variable "replica_region" {
  description = "Região AWS da réplica do bucket de documentos (ADR-0020 §2). Tem de ser diferente de aws_region (ex.: eu-west-1)."
  type        = string

  validation {
    condition     = var.replica_region != var.aws_region
    error_message = "replica_region tem de ser diferente de aws_region — uma réplica na mesma região não protege contra a perda da região."
  }
}

variable "retencao_documentos_fiscais_anos" {
  description = "Retenção do Object Lock do bucket de documentos, em anos. 10 = prazo de conservação de documentos fiscais e contabilísticos (ADR-0015 §4; base fiscal — CIRPC art. 75 n.º 5, RCIVA art. 54 — em docs/research/mocambique-quadro-legal.md, por confirmar juridicamente). O ADR-0020 não fixa o valor; por isso é variável."
  type        = number
  default     = 10

  validation {
    condition     = var.retencao_documentos_fiscais_anos >= 10
    error_message = "Em prod a retenção não pode ser inferior aos 10 anos de conservação fiscal."
  }
}

# Sem omissão de propósito (#576): um alerta sem destinatário não chega a ninguém,
# e é exactamente essa a falha que a issue descreve.
variable "alert_email" {
  description = "E-mail do canal de serviço que recebe os alertas de produção (SNS). A subscrição tem de ser confirmada no e-mail que a AWS envia após o apply."
  type        = string
}

variable "otel_exporter_otlp_endpoint" {
  description = "Endpoint OTLP/HTTP do destino de telemetria de produção (ADR-0019 §1). null = SDK OTel desligado até haver destino (ADR-0026 §5); os registos continuam no CloudWatch Logs. Cabeçalhos de autenticação no segredo OTEL_CREDENTIALS (chave `headers`)."
  type        = string
  default     = null
}
