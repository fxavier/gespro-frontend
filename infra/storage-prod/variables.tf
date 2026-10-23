# Sem omissão de propósito: a região é onde ficam os documentos fiscais
# (ADR-0050 §2 — na UE, a mesma jurisdição que a base de dados). Escolha
# [HUMANO] no primeiro `apply`.
variable "aws_region" {
  description = "Região AWS do bucket dos documentos. Tem de ser uma região da UE (ex.: eu-west-1, eu-central-1) — ADR-0050 §2."
  type        = string

  validation {
    condition     = startswith(var.aws_region, "eu-")
    error_message = "aws_region tem de ser uma região da UE (eu-*): os documentos ficam na mesma jurisdição que a base de dados (ADR-0050 §2)."
  }
}

variable "replica_region" {
  description = "Região AWS da réplica do bucket (ADR-0020 §2). Obrigatória, na UE e diferente de aws_region."
  type        = string

  validation {
    condition     = startswith(var.replica_region, "eu-")
    error_message = "replica_region tem de ser uma região da UE (eu-*), como a principal (ADR-0050 §2)."
  }

  validation {
    condition     = var.replica_region != var.aws_region
    error_message = "replica_region tem de ser diferente de aws_region — uma réplica na mesma região não protege contra a perda da região."
  }
}

variable "retencao_documentos_fiscais_anos" {
  description = "Retenção do Object Lock (GOVERNANCE), em anos. 10 = prazo de conservação de documentos fiscais e contabilísticos (ADR-0015 §4; base em docs/research/mocambique-quadro-legal.md, por confirmar juridicamente)."
  type        = number
  default     = 10

  validation {
    condition     = var.retencao_documentos_fiscais_anos >= 10
    error_message = "Em prod a retenção não pode ser inferior aos 10 anos de conservação fiscal."
  }
}

variable "app_origins" {
  description = "Origens da app (o domínio público do serviço `erp` no Railway, ex.: https://app.gespro.mz) permitidas no CORS do bucket para o upload directo e o download. Nunca wildcard."
  type        = list(string)

  validation {
    condition     = length(var.app_origins) > 0 && alltrue([for o in var.app_origins : startswith(o, "https://") && !strcontains(o, "*")])
    error_message = "app_origins: pelo menos uma origem, todas https:// e sem wildcard."
  }
}

variable "app_prefixos" {
  description = "Prefixos de key onde a app pode ler, escrever e apagar. `tenant/` é o de derivarKey (apps/erp/src/lib/storage/objeto/key.ts)."
  type        = list(string)
  default     = ["tenant/"]

  validation {
    condition     = length(var.app_prefixos) > 0 && alltrue([for p in var.app_prefixos : length(p) > 1 && endswith(p, "/") && !strcontains(p, "*")])
    error_message = "app_prefixos: prefixos não vazios, terminados em / e sem wildcard (um prefixo vazio daria o bucket inteiro)."
  }
}
