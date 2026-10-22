# ==============================================================================
# Continuidade em prod (ADR-0020 §2, #575) — corre SEM credenciais nem backend:
#
#   terraform -chdir=infra/live/prod init -backend=false
#   terraform -chdir=infra/live/prod test
#
# O fornecedor AWS é um duplo (`mock_provider`): o teste prova o que o `plan`
# pediria (retenção, replicação, Object Lock), não que a AWS o aceita. Isso só
# o primeiro `plan`/`apply` real prova — [HUMANO], docs/runbooks/restauro-bd.md.
#
# Aqui só se trava o WIRING de prod (que valores o live/prod passa aos módulos),
# por outputs — o Terraform não deixa um teste da raiz ler recursos de um módulo
# filho. Os asserts sobre os RECURSOS (regra de replicação, destino, Object Lock,
# atributos da instância RDS) vivem nos testes dos próprios módulos:
#   infra/modules/storage/tests/  ·  infra/modules/rds/tests/
# ==============================================================================

mock_provider "aws" {
  override_data {
    target = data.aws_availability_zones.available
    values = {
      names = ["af-south-1a", "af-south-1b", "af-south-1c"]
    }
  }

  # O duplo devolveria texto aleatório; o fornecedor valida que é uma política.
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

mock_provider "aws" {
  alias = "replica"
}

mock_provider "aws" {
  alias = "us_east_1"
}

override_data {
  target = module.rds.data.aws_secretsmanager_secret_version.db_credentials
  values = {
    secret_string = "{\"username\":\"duplo\",\"password\":\"duplo\"}"
  }
}

variables {
  aws_account_id = "123456789012"
  image_tag      = "sha-teste"
  app_url        = "https://gespro.example.com"
  replica_region = "eu-west-1"
  alert_email    = "operacao@example.com"
}

run "rds_retem_35_dias_de_pitr" {
  command = plan

  assert {
    condition     = module.rds.backup_retention_period == 35
    error_message = "A retenção dos backups/PITR em prod tem de ser 35 dias (ADR-0020 §2)."
  }

  assert {
    condition     = module.rds.protecao.deletion_protection && !module.rds.protecao.skip_final_snapshot && module.rds.protecao.copy_tags_to_snapshot && !module.rds.protecao.delete_automated_backups
    error_message = "Prod: deletion_protection, snapshot final, copy_tags_to_snapshot e backups mantidos após apagar a instância."
  }
}

run "bucket_replica_noutra_regiao_com_object_lock" {
  command = plan

  assert {
    condition     = module.storage.replicacao_planeada
    error_message = "Prod tem de planear a replicação do bucket de documentos (ADR-0020 §2)."
  }

  assert {
    condition     = module.storage.object_lock.modo == "GOVERNANCE" && module.storage.object_lock.anos == 10
    error_message = "Prod: Object Lock GOVERNANCE com 10 anos de retenção por omissão."
  }

  assert {
    condition     = module.storage.object_lock.noncurrent_days > 3650
    error_message = "As versões não correntes não podem expirar antes da conservação fiscal."
  }
}

run "replica_na_mesma_regiao_e_recusada" {
  command = plan

  variables {
    replica_region = "af-south-1"
  }

  expect_failures = [var.replica_region]
}
