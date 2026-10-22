# ==============================================================================
# #644 — o dev desmonta-se sem editar o módulo.
#
#   terraform -chdir=infra/modules/storage init -backend=false
#   terraform -chdir=infra/modules/storage test
#
# Aplica o dev contra o fornecedor dobrado e depois planeia SUBSTITUIR os dois
# buckets (`plan_options.replace`). Um plano que destrói um recurso com
# `prevent_destroy = true` é recusado («Instance cannot be destroyed»): este
# plano só passa porque os blocos do dev não o têm — é o mesmo veredicto que o
# `terraform destroy` em infra/live/dev receberia.
#
# Porque não basta o `apply`: a desmontagem automática do `terraform test` no fim
# do ficheiro NÃO respeita `prevent_destroy` (verificado: passa com a protecção
# posta). O oráculo é o plano de substituição.
#
# Não há caso simétrico para prod: um plano recusado é um erro, não uma falha
# que `expect_failures` saiba esperar. A protecção de prod prova-se pela
# estrutura (continuidade.tftest.hcl, `prod_so_tem_os_blocos_protegidos`) e pelo
# ensaio manual descrito no PR #644 (o mesmo plano com
# `proteger_contra_destruicao = true` falha).
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

# O fornecedor valida que estes são ARN; o duplo devolveria texto aleatório.
override_resource {
  target = aws_s3_bucket.uploads
  values = {
    id  = "gespro-uploads-dev"
    arn = "arn:aws:s3:::gespro-uploads-dev"
  }
}

override_resource {
  target = aws_s3_bucket.replica
  values = {
    id  = "gespro-uploads-dev-replica"
    arn = "arn:aws:s3:::gespro-uploads-dev-replica"
  }
}

override_resource {
  target = aws_iam_role.replicacao
  values = {
    arn = "arn:aws:iam::123456789012:role/gespro-uploads-dev-replicacao"
  }
}

# Dev com réplica e bloqueio ligados: o caso mais difícil de desmontar.
variables {
  project                    = "gespro"
  environment                = "dev"
  replica_region             = "eu-west-1"
  object_lock_retencao_anos  = 1
  proteger_contra_destruicao = false
}

run "dev_aplica_os_blocos_sem_protecao" {
  command = apply

  assert {
    condition     = length(aws_s3_bucket.uploads) == 1 && length(aws_s3_bucket.replica) == 1
    error_message = "O dev aplica os blocos sem prevent_destroy."
  }
}

run "dev_planeia_destruir_os_buckets" {
  command = plan

  plan_options {
    replace = [aws_s3_bucket.uploads[0], aws_s3_bucket.replica[0]]
  }

  assert {
    condition     = length(aws_s3_bucket.uploads) == 1
    error_message = "O plano de substituição do bucket do dev é aceite."
  }
}
