# ==============================================================================
# storage-prod — o WIRING de prod e a política da app (ADR-0050 §2).
# Offline, fornecedor dobrado:
#
#   terraform -chdir=infra/storage-prod init -backend=false
#   terraform -chdir=infra/storage-prod test
#
# O comportamento dos recursos do bucket (replicação, Object Lock, blocos
# protegidos) prova-se em infra/modules/storage/tests/. Aqui trava-se o que esta
# stack passa ao módulo e a política IAM da credencial da app.
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

# ARN do bucket fixado já no plano, para se poder provar o Resource da política.
override_resource {
  target          = module.storage.aws_s3_bucket.uploads_protegido
  override_during = plan
  values = {
    id  = "gespro-uploads-prod"
    arn = "arn:aws:s3:::gespro-uploads-prod"
  }
}

override_resource {
  target          = module.storage.aws_s3_bucket.replica_protegido
  override_during = plan
  values = {
    id  = "gespro-uploads-prod-replica"
    arn = "arn:aws:s3:::gespro-uploads-prod-replica"
  }
}

variables {
  aws_region     = "eu-central-1"
  replica_region = "eu-west-1"
  app_origins    = ["https://app.example.com"]
}

run "object_lock_dez_anos_governance" {
  command = plan

  assert {
    condition     = module.storage.object_lock.modo == "GOVERNANCE" && module.storage.object_lock.anos == 10
    error_message = "Object Lock em GOVERNANCE a 10 anos (ADR-0050 §2)."
  }

  assert {
    condition     = output.object_lock.anos == 10
    error_message = "O output da stack expõe a retenção de 10 anos."
  }
}

run "replica_noutra_regiao" {
  command = plan

  assert {
    condition     = module.storage.replicacao_planeada
    error_message = "A replicação para a réplica tem de estar planeada."
  }

  assert {
    condition     = output.s3_replica_bucket_name == "gespro-uploads-prod-replica"
    error_message = "A réplica é o bucket gespro-uploads-prod-replica."
  }
}

run "buckets_com_prevent_destroy" {
  command = plan

  assert {
    condition     = module.storage.protegido_contra_destruicao
    error_message = "Prod usa os blocos com prevent_destroy (proteger_contra_destruicao = true, #644)."
  }
}

run "politica_da_app_minima_e_sem_bypass" {
  command = plan

  # Allow: exactamente Get/Put/DeleteObject, só no prefixo tenant/.
  assert {
    condition = (
      length([for s in jsondecode(aws_iam_user_policy.app.policy).Statement : s if s.Effect == "Allow"]) == 1 &&
      alltrue([
        for s in jsondecode(aws_iam_user_policy.app.policy).Statement :
        toset(s.Action) == toset(["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]) && s.Resource == ["arn:aws:s3:::gespro-uploads-prod/tenant/*"]
        if s.Effect == "Allow"
      ])
    )
    error_message = "A app só pode Get/Put/DeleteObject em arn:aws:s3:::gespro-uploads-prod/tenant/*."
  }

  # Nenhum Allow com bypass, versão, retenção ou wildcard de acção.
  assert {
    condition = alltrue(flatten([
      for s in jsondecode(aws_iam_user_policy.app.policy).Statement : [
        for a in s.Action : !strcontains(a, "*") && !contains(["s3:BypassGovernanceRetention", "s3:DeleteObjectVersion", "s3:PutObjectRetention", "s3:PutObjectLegalHold"], a)
      ] if s.Effect == "Allow"
    ]))
    error_message = "Nenhum Allow pode dar BypassGovernanceRetention, DeleteObjectVersion, PutObjectRetention, PutObjectLegalHold nem acções com wildcard."
  }

  # Deny explícito do bypass (defesa contra uma política anexada mais tarde).
  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_user_policy.app.policy).Statement :
      s.Effect == "Deny" && contains(s.Action, "s3:BypassGovernanceRetention") && contains(s.Action, "s3:DeleteObjectVersion") && contains(s.Resource, "arn:aws:s3:::gespro-uploads-prod/*")
    ])
    error_message = "A política tem de negar explicitamente BypassGovernanceRetention e DeleteObjectVersion nos objectos do bucket."
  }

  assert {
    condition     = aws_iam_user_policy.app.user == aws_iam_user.app.name && aws_iam_access_key.app.user == aws_iam_user.app.name
    error_message = "A política e a chave pertencem ao utilizador da app."
  }
}

run "variaveis_do_railway" {
  command = plan

  assert {
    condition     = output.variaveis_railway.S3_BUCKET == "gespro-uploads-prod" && output.variaveis_railway.S3_REGION == "eu-central-1" && output.variaveis_railway.STORAGE_DRIVER == "s3"
    error_message = "As variáveis do Railway dão o bucket, a região principal e o driver s3."
  }

  # O mapa leva o comando que dá a chave, não a chave.
  assert {
    condition     = startswith(output.variaveis_railway.AWS_SECRET_ACCESS_KEY, "terraform ") && startswith(output.variaveis_railway.AWS_ACCESS_KEY_ID, "terraform ")
    error_message = "O mapa variaveis_railway nunca contém o valor da chave."
  }
}

# ------------------------------------------------------------------------------
# Regiões: obrigatórias, na UE e distintas
# ------------------------------------------------------------------------------

run "regiao_fora_da_ue_e_recusada" {
  command = plan

  variables {
    aws_region = "af-south-1"
  }

  expect_failures = [var.aws_region]
}

run "replica_fora_da_ue_e_recusada" {
  command = plan

  variables {
    replica_region = "us-east-1"
  }

  expect_failures = [var.replica_region]
}

run "replica_na_mesma_regiao_e_recusada" {
  command = plan

  variables {
    replica_region = "eu-central-1"
  }

  expect_failures = [var.replica_region]
}

run "origem_wildcard_e_recusada" {
  command = plan

  variables {
    app_origins = ["*"]
  }

  expect_failures = [var.app_origins]
}

run "prefixo_vazio_e_recusado" {
  command = plan

  variables {
    app_prefixos = [""]
  }

  expect_failures = [var.app_prefixos]
}
