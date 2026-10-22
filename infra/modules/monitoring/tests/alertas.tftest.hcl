# ==============================================================================
# modules/monitoring — asserts sobre os RECURSOS (#576). Offline, duplo:
#
#   terraform -chdir=infra/modules/monitoring init -backend=false
#   terraform -chdir=infra/modules/monitoring test
#
# O formato das linhas que os filtros lêem tranca-se do lado da app
# (apps/erp/src/lib/api/__tests__/with-api-linha-log-576.test.ts), não aqui.
# ==============================================================================

mock_provider "aws" {}

mock_provider "aws" {
  alias = "us_east_1"
}

override_resource {
  target          = aws_route53_health_check.ready
  override_during = plan
  values = {
    id = "hc-duplo"
  }
}

override_resource {
  target          = aws_sns_topic.alertas
  override_during = plan
  values = {
    arn = "arn:aws:sns:af-south-1:123456789012:gespro-prod-alertas"
  }
}

override_resource {
  target          = aws_sns_topic.alertas_us_east_1
  override_during = plan
  values = {
    arn = "arn:aws:sns:us-east-1:123456789012:gespro-prod-alertas"
  }
}

variables {
  project                = "gespro"
  environment            = "prod"
  alert_email            = "operacao@example.com"
  apprunner_service_name = "gespro-prod"
  apprunner_service_id   = "abc123"
  health_check_fqdn      = "xyz.af-south-1.awsapprunner.com"
}

run "api_ready_chega_em_menos_de_10_min" {
  command = plan

  assert {
    condition     = aws_route53_health_check.ready.resource_path == "/api/ready" && aws_route53_health_check.ready.type == "HTTPS" && aws_route53_health_check.ready.enable_sni
    error_message = "O health check sonda /api/ready por HTTPS com SNI."
  }

  assert {
    condition     = length(aws_route53_health_check.ready.regions) == 3
    error_message = "Três regiões de sondagem."
  }

  # detecção (intervalo × falhas) + janela do alarme (período × avaliações) + 1 min de entrega ≤ 10 min
  assert {
    condition = (
      aws_route53_health_check.ready.request_interval * aws_route53_health_check.ready.failure_threshold
      + aws_cloudwatch_metric_alarm.ready_indisponivel.period * aws_cloudwatch_metric_alarm.ready_indisponivel.evaluation_periods
      + 60
    ) <= 600
    error_message = "Um 503 contínuo em /api/ready tem de chegar ao e-mail em ≤ 10 min (critério da #576)."
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.ready_indisponivel.dimensions.HealthCheckId == aws_route53_health_check.ready.id && aws_cloudwatch_metric_alarm.ready_indisponivel.treat_missing_data == "breaching"
    error_message = "O alarme lê o health check certo e trata ausência de dados como falha."
  }

  assert {
    condition     = contains(aws_cloudwatch_metric_alarm.ready_indisponivel.alarm_actions, aws_sns_topic.alertas_us_east_1.arn)
    error_message = "O alarme de /api/ready (us-east-1) notifica o tópico de us-east-1."
  }
}

run "taxa_5xx_com_guarda_de_volume" {
  command = plan

  assert {
    condition     = one([for q in aws_cloudwatch_metric_alarm.taxa_5xx.metric_query : q.expression if q.id == "taxa"]) == "IF(pedidos > 20, erros / pedidos, 0)"
    error_message = "A taxa de 5xx só conta acima de 20 pedidos por minuto."
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.taxa_5xx.threshold == 0.01 && aws_cloudwatch_metric_alarm.taxa_5xx.evaluation_periods == 5
    error_message = "> 1 % durante 5 min (regra local gespro-taxa-erro-elevada)."
  }
}

run "registos_com_retencao_e_filtros_sobre_o_grupo" {
  command = plan

  assert {
    condition     = aws_cloudwatch_log_group.app.name == "/aws/apprunner/gespro-prod/abc123/application" && aws_cloudwatch_log_group.app.retention_in_days == 90
    error_message = "Grupo do App Runner declarado, com 90 dias de retenção."
  }

  assert {
    condition = alltrue([
      aws_cloudwatch_log_metric_filter.cron_falhou.log_group_name == aws_cloudwatch_log_group.app.name,
      aws_cloudwatch_log_metric_filter.cron_sucesso.log_group_name == aws_cloudwatch_log_group.app.name,
      aws_cloudwatch_log_metric_filter.erros.log_group_name == aws_cloudwatch_log_group.app.name,
    ])
    error_message = "Os filtros de métrica correm sobre o grupo da app."
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.cron_em_falta.treat_missing_data == "breaching" && aws_cloudwatch_metric_alarm.cron_em_falta.period * aws_cloudwatch_metric_alarm.cron_em_falta.evaluation_periods == 86400
    error_message = "Cron em falta: 24 h sem sucesso, ausência de dados conta como falha."
  }
}
