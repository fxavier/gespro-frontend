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

# ------------------------------------------------------------------------------
# Continuidade (ADR-0020 §2, #575)
# ------------------------------------------------------------------------------

variable "replica_region" {
  description = "Região AWS do bucket réplica (replicação entre regiões, ADR-0020 §2). null = sem replicação. Tem de ser a região do fornecedor `aws.replica` e diferente da do bucket de origem."
  type        = string
  default     = null
}

variable "object_lock_retencao_anos" {
  description = "Retenção por omissão do Object Lock, em anos, aplicada a TODAS as versões novas do bucket e da réplica. 0 = sem Object Lock. Em prod: o prazo de conservação de documentos fiscais (10 anos, ADR-0015 §4; base legal em docs/research/mocambique-quadro-legal.md)."
  type        = number
  default     = 0

  validation {
    condition     = var.object_lock_retencao_anos >= 0 && floor(var.object_lock_retencao_anos) == var.object_lock_retencao_anos
    error_message = "object_lock_retencao_anos tem de ser um inteiro >= 0."
  }
}

variable "object_lock_modo" {
  description = "Modo do Object Lock: GOVERNANCE (omissão — só quem tiver s3:BypassGovernanceRetention encurta ou apaga uma versão; a role da app não o tem) ou COMPLIANCE (irreversível, nem a conta root apaga). Justificação em main.tf."
  type        = string
  default     = "GOVERNANCE"

  validation {
    condition     = contains(["GOVERNANCE", "COMPLIANCE"], var.object_lock_modo)
    error_message = "object_lock_modo tem de ser GOVERNANCE ou COMPLIANCE."
  }
}
