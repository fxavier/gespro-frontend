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

# #644: o bucket existe em dois blocos (protegido em prod, livre em dev); o
# duplo fixa os dois, para os asserts valerem qualquer que seja o activo.
override_resource {
  target          = aws_s3_bucket.uploads_protegido
  override_during = plan
  values = {
    id  = "gespro-uploads-prod"
    arn = "arn:aws:s3:::gespro-uploads-prod"
  }
}

override_resource {
  target          = aws_s3_bucket.replica_protegido
  override_during = plan
  values = {
    id  = "gespro-uploads-prod-replica"
    arn = "arn:aws:s3:::gespro-uploads-prod-replica"
  }
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
  project                    = "gespro"
  environment                = "prod"
  replica_region             = "eu-west-1"
  object_lock_retencao_anos  = 10
  object_lock_modo           = "GOVERNANCE"
  proteger_contra_destruicao = true
}

run "replicacao_para_a_replica" {
  command = plan

  assert {
    condition     = aws_s3_bucket_replication_configuration.uploads[0].bucket == aws_s3_bucket.uploads_protegido[0].id
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
    condition     = aws_s3_bucket_replication_configuration.uploads[0].rule[0].destination[0].bucket == aws_s3_bucket.replica_protegido[0].arn
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
    condition     = aws_s3_bucket.uploads_protegido[0].object_lock_enabled == true && aws_s3_bucket.replica_protegido[0].object_lock_enabled == true
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
    replica_region             = null
    object_lock_retencao_anos  = 0
    proteger_contra_destruicao = false
  }

  assert {
    condition     = length(aws_s3_bucket.replica) == 0 && length(aws_s3_bucket.replica_protegido) == 0 && length(aws_s3_bucket_replication_configuration.uploads) == 0 && length(aws_s3_bucket_object_lock_configuration.uploads) == 0 && aws_s3_bucket.uploads[0].object_lock_enabled == false
    error_message = "Sem replica_region nem retenção (dev), não há réplica nem bloqueio."
  }
}

# ------------------------------------------------------------------------------
# #644 — a protecção é por ambiente, e o resto segue o bucket activo
# ------------------------------------------------------------------------------

run "prod_so_tem_os_blocos_protegidos" {
  command = plan

  assert {
    condition     = length(aws_s3_bucket.uploads_protegido) == 1 && length(aws_s3_bucket.uploads) == 0
    error_message = "Com proteger_contra_destruicao = true existe só o bucket com prevent_destroy."
  }

  assert {
    condition     = length(aws_s3_bucket.replica_protegido) == 1 && length(aws_s3_bucket.replica) == 0
    error_message = "Com proteger_contra_destruicao = true existe só a réplica com prevent_destroy."
  }

  assert {
    condition     = output.protegido_contra_destruicao && output.bucket_name == "gespro-uploads-prod" && output.replica_bucket_arn == "arn:aws:s3:::gespro-uploads-prod-replica"
    error_message = "Os outputs apontam aos blocos protegidos."
  }
}

# Dev com réplica e bloqueio ligados, para provar que replicação, Object Lock e
# versionamento seguem o bloco SEM protecção.
run "dev_so_tem_os_blocos_livres_e_o_resto_segue_os" {
  command = plan

  variables {
    proteger_contra_destruicao = false
  }

  assert {
    condition     = length(aws_s3_bucket.uploads) == 1 && length(aws_s3_bucket.uploads_protegido) == 0
    error_message = "Com proteger_contra_destruicao = false existe só o bucket sem prevent_destroy."
  }

  assert {
    condition     = length(aws_s3_bucket.replica) == 1 && length(aws_s3_bucket.replica_protegido) == 0
    error_message = "Com proteger_contra_destruicao = false existe só a réplica sem prevent_destroy."
  }

  assert {
    condition     = aws_s3_bucket_replication_configuration.uploads[0].bucket == aws_s3_bucket.uploads[0].id && aws_s3_bucket_replication_configuration.uploads[0].rule[0].destination[0].bucket == aws_s3_bucket.replica[0].arn
    error_message = "A replicação parte do bucket livre e vai para a réplica livre."
  }

  assert {
    condition     = aws_s3_bucket_object_lock_configuration.uploads[0].bucket == aws_s3_bucket.uploads[0].id && aws_s3_bucket_object_lock_configuration.replica[0].bucket == aws_s3_bucket.replica[0].id
    error_message = "O Object Lock aplica-se aos buckets activos."
  }

  assert {
    condition     = aws_s3_bucket_versioning.uploads.bucket == aws_s3_bucket.uploads[0].id && aws_s3_bucket_versioning.replica[0].bucket == aws_s3_bucket.replica[0].id
    error_message = "O versionamento aplica-se aos buckets activos."
  }

  assert {
    condition     = !output.protegido_contra_destruicao
    error_message = "O output diz que o dev não está protegido."
  }
}
