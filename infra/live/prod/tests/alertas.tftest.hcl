# ==============================================================================
# Alertas de prod (#576) — corre SEM credenciais nem backend:
#
#   terraform -chdir=infra/live/prod init -backend=false
#   terraform -chdir=infra/live/prod test
#
# Fornecedor dobrado: prova o que o plano pede (canal, sonda, janelas, padrões),
# não que um alerta chega. Isso é o ensaio sintético [HUMANO] de
# docs/runbooks/alertas-producao.md.
# ==============================================================================

mock_provider "aws" {
  override_data {
    target = data.aws_availability_zones.available
    values = {
      names = ["af-south-1a", "af-south-1b", "af-south-1c"]
    }
  }

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

run "sete_alarmes_com_severidade_no_nome" {
  command = plan

  assert {
    condition     = length(module.monitoring.alarmes) == 7
    error_message = "Esperados 7 alarmes (ready, 5xx, budget, latência, cron falhou, cron em falta, erros)."
  }

  assert {
    condition     = alltrue([for n in values(module.monitoring.alarmes) : can(regex("-(PAGINA|AVISO)-", n))])
    error_message = "Cada alarme diz a severidade no nome — o e-mail é um canal só."
  }

  assert {
    condition     = can(regex("-PAGINA-", module.monitoring.alarmes.ready_indisponivel)) && can(regex("-PAGINA-", module.monitoring.alarmes.taxa_5xx))
    error_message = "/api/ready e a taxa de 5xx paginam (ADR-0019 §4)."
  }
}

run "sonda_api_ready" {
  command = plan

  assert {
    condition     = module.monitoring.filtros.ready_caminho == "/api/ready"
    error_message = "O health check sonda /api/ready (readiness com SELECT 1), não /api/health."
  }
}

run "filtros_de_cron_seguem_o_formato_do_withApi" {
  command = plan

  assert {
    condition     = strcontains(module.monitoring.filtros.cron_falhou, "$.url = \"/api/cron/*\"") && strcontains(module.monitoring.filtros.cron_falhou, "$.status >= 400")
    error_message = "A falha de cron lê `url` e `status` da linha «request end» do withApi."
  }

  assert {
    condition     = strcontains(module.monitoring.filtros.cron_sucesso, "$.msg = \"request end\"") && strcontains(module.monitoring.filtros.cron_sucesso, "$.status = 200")
    error_message = "O sucesso de cron é a linha «request end» com status 200."
  }

  assert {
    condition     = module.monitoring.filtros.erros_logger == "{ $.level = \"error\" }"
    error_message = "Erros inesperados = linhas `level: error` do logger."
  }
}
