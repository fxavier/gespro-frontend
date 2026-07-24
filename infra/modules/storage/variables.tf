variable "project" {
  description = "Nome do projecto"
  type        = string
}

variable "environment" {
  description = "Ambiente (dev | prod)"
  type        = string
}

variable "expiration_days" {
  description = "Dias para expirar objectos no prefixo tmp/ (lifecycle)"
  type        = number
  default     = 30
}

variable "allowed_origins" {
  description = "Origens (ALLOWED_ORIGINS) permitidas no CORS do bucket para upload/download directo. NUNCA usar wildcard em produção."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags adicionais"
  type        = map(string)
  default     = {}
}
