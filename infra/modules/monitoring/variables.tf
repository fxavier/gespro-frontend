variable "project" {
  description = "Nome do projecto"
  type        = string
}

variable "environment" {
  description = "Ambiente (dev | prod)"
  type        = string
}

variable "alert_email" {
  description = "Endereço do canal de serviço que recebe os alertas (subscrição SNS por e-mail; a AWS envia um pedido de confirmação que alguém tem de aceitar)."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email tem de ser um endereço de e-mail."
  }
}

variable "apprunner_service_name" {
  description = "Nome do serviço App Runner (dimensão ServiceName)"
  type        = string
}

variable "apprunner_service_id" {
  description = "ID do serviço App Runner (dimensão ServiceID e parte do grupo de registos)"
  type        = string
}

variable "health_check_fqdn" {
  description = "Host público onde o Route 53 sonda /api/ready por HTTPS (o URL por omissão do App Runner ou o domínio próprio)"
  type        = string
}

variable "limiar_erros_5min" {
  description = "Linhas `level: error` do logger em 5 minutos a partir das quais avisa (erros inesperados: sem stack trace na notificação, só a contagem)"
  type        = number
  default     = 5
}

variable "tags" {
  description = "Tags adicionais"
  type        = map(string)
  default     = {}
}
