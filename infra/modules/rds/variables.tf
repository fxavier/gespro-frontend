variable "project" {
  description = "Nome do projecto"
  type        = string
}

variable "environment" {
  description = "Ambiente (dev | prod)"
  type        = string
}

variable "subnet_ids" {
  description = "IDs das subnets privadas para o RDS subnet group"
  type        = list(string)
}

variable "security_group_ids" {
  description = "IDs dos Security Groups a associar ao RDS"
  type        = list(string)
}

variable "db_name" {
  description = "Nome da base de dados PostgreSQL"
  type        = string
  default     = "gespro"
}

variable "engine_version" {
  description = "Versão do PostgreSQL (major.minor)"
  type        = string
  default     = "17.2"
}

variable "instance_class" {
  description = "Classe da instância RDS"
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage" {
  description = "Armazenamento alocado em GB"
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Armazenamento máximo para auto-scaling em GB (0 = desactivado)"
  type        = number
  default     = 100
}

variable "multi_az" {
  description = "Activar Multi-AZ para alta disponibilidade (recomendado em prod)"
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "Dias de retenção de backups automáticos (0 = desactivado)"
  type        = number
  default     = 7
}

variable "deletion_protection" {
  description = "Proteger contra destruição acidental (sempre true em prod)"
  type        = bool
  default     = false
}

variable "skip_final_snapshot" {
  description = "Saltar snapshot final ao destruir (false em prod)"
  type        = bool
  default     = true
}

variable "enable_performance_insights" {
  description = "Activar Performance Insights. Apenas suportado em db.m* e db.r* (NÃO em db.t*). Activar ao subir de classe de instância."
  type        = bool
  default     = false
}

variable "db_credentials_secret_arn" {
  description = "ARN do segredo Secrets Manager com username/password do RDS"
  type        = string
}

variable "tags" {
  description = "Tags adicionais"
  type        = map(string)
  default     = {}
}
