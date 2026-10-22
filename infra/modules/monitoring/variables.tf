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

variable "retencao_registos_dias" {
  description = "Dias de retenção do grupo de registos da app no CloudWatch Logs. Tem de ser um valor aceite pelo CloudWatch (1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, …)."
  type        = number
  default     = 90

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.retencao_registos_dias)
    error_message = "retencao_registos_dias tem de ser um dos valores aceites pelo CloudWatch Logs."
  }
}

variable "health_check_regioes" {
  description = "Regiões de onde o Route 53 sonda /api/ready (mínimo 3)."
  type        = list(string)
  default     = ["eu-west-1", "us-east-1", "ap-southeast-1"]

  validation {
    condition     = length(var.health_check_regioes) >= 3
    error_message = "O Route 53 exige pelo menos 3 regiões de sondagem."
  }
}

variable "volume_minimo_pedidos" {
  description = "Abaixo deste número de pedidos por período, a taxa de 5xx conta como 0 — com tráfego quase nulo, um único 500 seria 100 % e paginava (a falha total continua coberta pelo alarme de /api/ready)."
  type        = number
  default     = 20
}

variable "tags" {
  description = "Tags adicionais"
  type        = map(string)
  default     = {}
}
