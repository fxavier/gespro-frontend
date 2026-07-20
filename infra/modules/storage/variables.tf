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

variable "tags" {
  description = "Tags adicionais"
  type        = map(string)
  default     = {}
}
