# ==============================================================================
# modules/rds — protecções da instância nos RECURSOS (ADR-0020 §2, #575).
# Offline, fornecedor dobrado:
#
#   terraform -chdir=infra/modules/rds init -backend=false
#   terraform -chdir=infra/modules/rds test
# ==============================================================================

mock_provider "aws" {}

override_data {
  target = data.aws_secretsmanager_secret_version.db_credentials
  values = {
    secret_string = "{\"username\":\"duplo\",\"password\":\"duplo\"}"
  }
}

# Os valores que o live/prod passa (o wiring trava-se em infra/live/prod/tests/).
variables {
  project                   = "gespro"
  environment               = "prod"
  subnet_ids                = ["subnet-a", "subnet-b"]
  security_group_ids        = ["sg-rds"]
  multi_az                  = true
  backup_retention_days     = 35
  retain_automated_backups  = true
  deletion_protection       = true
  skip_final_snapshot       = false
  db_credentials_secret_arn = "arn:aws:secretsmanager:af-south-1:123456789012:secret:duplo"
}

run "pitr_e_protecoes_na_instancia" {
  command = plan

  assert {
    condition     = aws_db_instance.main.backup_retention_period == 35
    error_message = "35 dias de backups automáticos = janela do PITR."
  }

  assert {
    condition     = aws_db_instance.main.delete_automated_backups == false
    error_message = "Backups automáticos mantidos após apagar a instância."
  }

  assert {
    condition     = aws_db_instance.main.deletion_protection && !aws_db_instance.main.skip_final_snapshot && aws_db_instance.main.final_snapshot_identifier == "gespro-prod-final-snapshot"
    error_message = "deletion_protection e snapshot final com nome."
  }

  assert {
    condition     = aws_db_instance.main.copy_tags_to_snapshot && aws_db_instance.main.multi_az
    error_message = "copy_tags_to_snapshot e Multi-AZ."
  }
}

run "retencao_acima_do_maximo_e_recusada" {
  command = plan

  variables {
    backup_retention_days = 36
  }

  expect_failures = [var.backup_retention_days]
}
