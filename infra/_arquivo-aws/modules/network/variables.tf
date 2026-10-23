variable "project" {
  description = "Nome do projecto (usado em nomes de recursos)"
  type        = string
}

variable "environment" {
  description = "Ambiente de deployment (dev | prod)"
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "O ambiente deve ser 'dev' ou 'prod'."
  }
}

variable "vpc_cidr" {
  description = "CIDR block para a VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "azs" {
  description = "Lista de Availability Zones a usar (mínimo 2 para RDS Multi-AZ)"
  type        = list(string)
}

variable "tags" {
  description = "Tags adicionais a aplicar a todos os recursos"
  type        = map(string)
  default     = {}
}
