# ==============================================================================
# modules/storage — replicação e Object Lock nos RECURSOS (ADR-0020 §2, #575).
# Offline, fornecedor dobrado:
#
#   terraform -chdir=infra/modules/storage init -backend=false
#   terraform -chdir=infra/modules/storage test
#
# ARN/id dos buckets são desconhecidos no plano; o duplo fixa-os já no plan
# (`override_during = plan`) para se poder provar o destino da replicação.
# ==============================================================================

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

mock_provider "aws" {
  alias = "replica"
}

override_resource {
  target          = aws_s3_bucket.uploads
  override_during = plan
  values = {
    id  = "gespro-uploads-prod"
    arn = "arn:aws:s3:::gespro-uploads-prod"
  }
}

override_resource {
  target          = aws_s3_bucket.replica
  override_during = plan
  values = {
    id  = "gespro-uploads-prod-replica"
    arn = "arn:aws:s3:::gespro-uploads-prod-replica"
  }
}

# Os valores que o live/prod passa (o wiring trava-se em infra/live/prod/tests/).
variables {
  project                   = "gespro"
  environment               = "prod"
  replica_region            = "eu-west-1"
  object_lock_retencao_anos = 10
  object_lock_modo          = "GOVERNANCE"
}

run "replicacao_para_a_replica" {
  command = plan

  assert {
    condition     = aws_s3_bucket_replication_configuration.uploads[0].bucket == aws_s3_bucket.uploads.id
    error_message = "A replicação parte do bucket dos documentos."
  }

  assert {
    condition     = aws_s3_bucket_replication_configuration.uploads[0].rule[0].status == "Enabled"
    error_message = "A regra de replicação tem de estar Enabled."
  }

  assert {
    condition     = aws_s3_bucket_replication_configuration.uploads[0].rule[0].delete_marker_replication[0].status == "Enabled"
    error_message = "Os marcadores de apagamento replicam (ADR-0017: remoção efectiva nas duas regiões)."
  }

  assert {
    condition     = aws_s3_bucket_replication_configuration.uploads[0].rule[0].destination[0].bucket == aws_s3_bucket.replica[0].arn
    error_message = "O destino da replicação tem de ser o ARN do bucket réplica."
  }

  assert {
    condition     = aws_s3_bucket_versioning.replica[0].versioning_configuration[0].status == "Enabled" && aws_s3_bucket_versioning.uploads.versioning_configuration[0].status == "Enabled"
    error_message = "Versionamento nos dois buckets (pré-condição da replicação)."
  }
}

run "object_lock_nos_dois_buckets" {
  command = plan

  assert {
    condition     = aws_s3_bucket.uploads.object_lock_enabled == true && aws_s3_bucket.replica[0].object_lock_enabled == true
    error_message = "Origem e réplica com Object Lock (uma origem bloqueada só replica para um destino bloqueado)."
  }

  assert {
    condition     = aws_s3_bucket_object_lock_configuration.uploads[0].rule[0].default_retention[0].mode == "GOVERNANCE" && aws_s3_bucket_object_lock_configuration.uploads[0].rule[0].default_retention[0].years == 10
    error_message = "Retenção por omissão da origem: GOVERNANCE, 10 anos."
  }

  assert {
    condition     = aws_s3_bucket_object_lock_configuration.replica[0].rule[0].default_retention[0].mode == "GOVERNANCE" && aws_s3_bucket_object_lock_configuration.replica[0].rule[0].default_retention[0].years == 10
    error_message = "Retenção por omissão da réplica: GOVERNANCE, 10 anos."
  }
}

run "sem_replica_nem_lock_nada_e_criado" {
  command = plan

  variables {
    replica_region            = null
    object_lock_retencao_anos = 0
  }

  assert {
    condition     = length(aws_s3_bucket.replica) == 0 && length(aws_s3_bucket_replication_configuration.uploads) == 0 && length(aws_s3_bucket_object_lock_configuration.uploads) == 0 && aws_s3_bucket.uploads.object_lock_enabled == false
    error_message = "Sem replica_region nem retenção (dev), não há réplica nem bloqueio."
  }
}
