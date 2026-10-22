terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
      # `aws.replica` é o fornecedor da região de réplica (ADR-0020 §2, #575).
      # Quem chama o módulo passa-o SEMPRE, mesmo sem replicação (pode ser o
      # próprio `aws`): os recursos de réplica só existem com `replica_region`.
      configuration_aliases = [aws.replica]
    }
  }
}
