# ==============================================================================
# módulo: monitoring
#
# Alertas de produção sobre o que o App Runner já expõe, sem dependência nova na
# app (ADR-0019 §4, #576):
#   - SNS (região principal + us-east-1) com subscrição de e-mail do canal de serviço
#   - Route 53 health check a /api/ready + alarme (us-east-1)    → PAGINA
#   - Taxa de 5xx > 1 % em 5 min (métricas AWS/AppRunner)          → PAGINA
#   - Budget do SLO > 0,5 % numa hora                              → AVISO
#   - Latência p95 > 800 ms durante 30 min                         → AVISO
#   - Cron a falhar / sem corrida com sucesso em 24 h (registos)   → AVISO
#   - Erros inesperados do logger acima de um limiar               → AVISO
#
# Tradução de infra/local/observabilidade/alerts/rules.yaml. O que fica de fora,
# e porquê, está em docs/runbooks/alertas-producao.md.
#
# Error tracking: sem SDK novo. Os erros já saem pelo logger estruturado, com
# redacção (logger.ts) e o `requestId` que o 500 devolve como `traceId` (#187),
# para o CloudWatch Logs pelo stdout do App Runner. A notificação leva só a
# contagem — nunca a linha, nunca dados pessoais; a triagem faz-se com as
# consultas guardadas do Logs Insights (abaixo), pelo traceId que o cliente cita.
#
# Nomes com «PAGINA»/«AVISO» porque o e-mail é um canal só: o assunto diz a
# severidade (no local, eram duas rotas do Alertmanager).
# ==============================================================================

locals {
  name_prefix = "${var.project}-${var.environment}"
  namespace   = "GestPro/${var.environment}"

  # O App Runner envia para este grupo o stdout/stderr da app.
  log_group = "/aws/apprunner/${var.apprunner_service_name}/${var.apprunner_service_id}/application"

  dimensoes_apprunner = {
    ServiceName = var.apprunner_service_name
    ServiceID   = var.apprunner_service_id
  }
}

# ------------------------------------------------------------------------------
# Grupo de registos da app — declarado para lhe fixar a retenção
#
# Se o App Runner o criar sozinho, nasce sem expiração (custo a crescer para
# sempre, e registos com dados de pedido guardados sem prazo). O nome contém o
# ServiceID, que só existe depois de o serviço ser criado, e o App Runner cria o
# grupo quando a app escreve a primeira linha — por isso no primeiro apply o
# create pode falhar com ResourceAlreadyExistsException. Nesse caso importa-se:
#   terraform import 'module.monitoring.aws_cloudwatch_log_group.app' \
#     "$(terraform output -raw app_log_group)"
# (docs/runbooks/alertas-producao.md §Depois do primeiro apply).
# ------------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "app" {
  name              = local.log_group
  retention_in_days = var.retencao_registos_dias

  tags = var.tags
}

# ------------------------------------------------------------------------------
# SNS — canal de serviço
#
# Sem cifra KMS de propósito: o CloudWatch não consegue publicar num tópico
# cifrado com a chave gerida `alias/aws/sns`, e o corpo de um alarme não leva
# dados (nome, estado, limiar).
# ------------------------------------------------------------------------------
resource "aws_sns_topic" "alertas" {
  name = "${local.name_prefix}-alertas"
  tags = var.tags
}

resource "aws_sns_topic_subscription" "alertas_email" {
  topic_arn = aws_sns_topic.alertas.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_sns_topic" "alertas_us_east_1" {
  provider = aws.us_east_1

  name = "${local.name_prefix}-alertas"
  tags = var.tags
}

resource "aws_sns_topic_subscription" "alertas_us_east_1_email" {
  provider = aws.us_east_1

  topic_arn = aws_sns_topic.alertas_us_east_1.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ------------------------------------------------------------------------------
# /api/ready — PAGINA (equivale a «ERP indisponível» + «BD inacessível»)
#
# O health check do App Runner sonda /api/health (liveness) e não publica métrica
# nenhuma; ligá-lo a /api/ready faria o App Runner reciclar instâncias saudáveis
# sempre que a BD falhasse. O mínimo que sonda /api/ready de fora é um health
# check do Route 53 (sem canary, sem código, sem bucket de artefactos).
#
# Tempo até ao alerta, para o critério da #576 (503 durante 5 min → ≤ 10 min):
#   3 falhas × 30 s ≈ 1,5 min até «unhealthy» + 3 min de alarme + entrega SNS.
# ------------------------------------------------------------------------------
resource "aws_route53_health_check" "ready" {
  fqdn              = var.health_check_fqdn
  port              = 443
  type              = "HTTPS"
  resource_path     = "/api/ready"
  enable_sni        = true
  request_interval  = 30
  failure_threshold = 3
  # Três regiões de sondagem (o mínimo do Route 53) em vez das oito por omissão:
  # menos pedidos ao /api/ready (cada um faz SELECT 1) e o mesmo veredicto.
  regions = var.health_check_regioes

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-api-ready"
  })
}

resource "aws_cloudwatch_metric_alarm" "ready_indisponivel" {
  provider = aws.us_east_1

  alarm_name        = "${local.name_prefix}-PAGINA-api-ready-a-falhar"
  alarm_description = "PAGINA: /api/ready não responde 2xx há 3 min (ERP em baixo ou BD inacessível). Runbook: docs/runbooks/alertas-producao.md"

  namespace   = "AWS/Route53"
  metric_name = "HealthCheckStatus"
  dimensions = {
    HealthCheckId = aws_route53_health_check.ready.id
  }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  # Sem dados = o health check deixou de reportar: tratar como falha.
  treat_missing_data = "breaching"

  alarm_actions = [aws_sns_topic.alertas_us_east_1.arn]
  ok_actions    = [aws_sns_topic.alertas_us_east_1.arn]

  tags = var.tags
}

# ------------------------------------------------------------------------------
# Taxa de 5xx — PAGINA (regra local `gespro-taxa-erro-elevada`: > 1 % em 5 min)
# ------------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "taxa_5xx" {
  alarm_name        = "${local.name_prefix}-PAGINA-taxa-5xx"
  alarm_description = "PAGINA: mais de 1 % das respostas são 5xx há 5 min. Runbook: docs/runbooks/alerta-taxa-erro-elevada.md"

  evaluation_periods  = 5
  datapoints_to_alarm = 5
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0.01
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "taxa"
    expression  = "IF(pedidos > ${var.volume_minimo_pedidos}, erros / pedidos, 0)"
    label       = "Fracção de respostas 5xx"
    return_data = true
  }

  metric_query {
    id = "erros"
    metric {
      namespace   = "AWS/AppRunner"
      metric_name = "5xxStatusResponses"
      dimensions  = local.dimensoes_apprunner
      period      = 60
      stat        = "Sum"
    }
  }

  metric_query {
    id = "pedidos"
    metric {
      namespace   = "AWS/AppRunner"
      metric_name = "Requests"
      dimensions  = local.dimensoes_apprunner
      period      = 60
      stat        = "Sum"
    }
  }

  alarm_actions = [aws_sns_topic.alertas.arn]
  ok_actions    = [aws_sns_topic.alertas.arn]

  tags = var.tags
}

# ------------------------------------------------------------------------------
# Budget do SLO — AVISO (regra local `gespro-slo-budget-burn`: > 0,5 % numa hora)
# ------------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "budget_slo" {
  alarm_name        = "${local.name_prefix}-AVISO-budget-slo"
  alarm_description = "AVISO: 5xx acima de 0,5 % na última hora — mais de metade do budget do SLO de 99,5 % (ADR-0019)."

  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0.005
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "taxa"
    expression  = "IF(pedidos > ${var.volume_minimo_pedidos}, erros / pedidos, 0)"
    label       = "Fracção de respostas 5xx (1 h)"
    return_data = true
  }

  metric_query {
    id = "erros"
    metric {
      namespace   = "AWS/AppRunner"
      metric_name = "5xxStatusResponses"
      dimensions  = local.dimensoes_apprunner
      period      = 3600
      stat        = "Sum"
    }
  }

  metric_query {
    id = "pedidos"
    metric {
      namespace   = "AWS/AppRunner"
      metric_name = "Requests"
      dimensions  = local.dimensoes_apprunner
      period      = 3600
      stat        = "Sum"
    }
  }

  alarm_actions = [aws_sns_topic.alertas.arn]

  tags = var.tags
}

# ------------------------------------------------------------------------------
# Latência p95 — AVISO (regra local `gespro-latencia-p95-elevada`)
# ------------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "latencia_p95" {
  alarm_name        = "${local.name_prefix}-AVISO-latencia-p95"
  alarm_description = "AVISO: latência p95 acima de 800 ms durante 30 min (SLO de leitura, ADR-0019)."

  namespace           = "AWS/AppRunner"
  metric_name         = "RequestLatency"
  dimensions          = local.dimensoes_apprunner
  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 6
  datapoints_to_alarm = 6
  comparison_operator = "GreaterThanThreshold"
  threshold           = 800
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alertas.arn]

  tags = var.tags
}

# ------------------------------------------------------------------------------
# Rotas /api/cron/* — a partir dos registos estruturados
#
# Todas passam pelo `withCron` → `withApi`, que escreve uma linha JSON por pedido:
#   {"level":"info","service":"gespro","method":"GET","url":"/api/cron/<rota>",
#    "status":<código>,"duration":<ms>,"msg":"request end", …}
# e, num erro que escapa ao handler, uma linha `level: error` (inesperado) ou
# `level: warn` com `status` (AppError) com o mesmo `url`, sem «request end».
# Um 401 (CRON_SECRET trocado num dos lados) conta como falha — é o caso que o
# runbook do agendador manda verificar primeiro.
# ------------------------------------------------------------------------------
resource "aws_cloudwatch_log_metric_filter" "cron_falhou" {
  name           = "${local.name_prefix}-cron-falhou"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "{ ($.url = \"/api/cron/*\") && (($.status >= 400) || ($.level = \"error\")) }"

  metric_transformation {
    name      = "CronFalhas"
    namespace = local.namespace
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_log_metric_filter" "cron_sucesso" {
  name           = "${local.name_prefix}-cron-sucesso"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "{ ($.msg = \"request end\") && ($.url = \"/api/cron/*\") && ($.status = 200) }"

  metric_transformation {
    name      = "CronSucessos"
    namespace = local.namespace
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "cron_falhou" {
  alarm_name        = "${local.name_prefix}-AVISO-cron-falhou"
  alarm_description = "AVISO: uma rota /api/cron/* respondeu >= 400 ou registou erro. Consulta guardada «cron-corridas». Runbook: docs/runbooks/agendador.md §Se falhar"

  namespace           = local.namespace
  metric_name         = aws_cloudwatch_log_metric_filter.cron_falhou.metric_transformation[0].name
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alertas.arn]

  tags = var.tags
}

# Regra local `gespro-tarefa-agendada-em-falta`: um agendador parado é
# indistinguível de «nada para fazer» (docs/runbooks/agendador.md). As cinco
# rotas correm todos os dias entre as 02:00 e as 03:30 UTC; 24 h seguidas sem
# NENHUMA corrida com sucesso é o agendador parado (ou todas a falhar).
# Até a #572 pôr um agendador no IaC, este alarme está — correctamente — em ALARM.
resource "aws_cloudwatch_metric_alarm" "cron_em_falta" {
  alarm_name        = "${local.name_prefix}-AVISO-cron-em-falta"
  alarm_description = "AVISO: nenhuma rota /api/cron/* respondeu 200 nas últimas 24 h — agendador parado? Runbook: docs/runbooks/agendador.md"

  namespace           = local.namespace
  metric_name         = aws_cloudwatch_log_metric_filter.cron_sucesso.metric_transformation[0].name
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 24
  datapoints_to_alarm = 24
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  # O filtro não emite nada nas horas sem corridas: a ausência É o sinal.
  treat_missing_data = "breaching"

  alarm_actions = [aws_sns_topic.alertas.arn]
  ok_actions    = [aws_sns_topic.alertas.arn]

  tags = var.tags
}

# ------------------------------------------------------------------------------
# Erros inesperados do logger — AVISO (o «error tracking» sem dependência nova)
# ------------------------------------------------------------------------------
resource "aws_cloudwatch_log_metric_filter" "erros" {
  name           = "${local.name_prefix}-erros-logger"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "{ $.level = \"error\" }"

  metric_transformation {
    name      = "ErrosLogger"
    namespace = local.namespace
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "erros_inesperados" {
  alarm_name        = "${local.name_prefix}-AVISO-erros-inesperados"
  alarm_description = "AVISO: ${var.limiar_erros_5min}+ linhas de erro do logger em 5 min. Triagem: consulta guardada «erros-por-traceid» no Logs Insights."

  namespace           = local.namespace
  metric_name         = aws_cloudwatch_log_metric_filter.erros.metric_transformation[0].name
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = var.limiar_erros_5min
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alertas.arn]

  tags = var.tags
}

# ------------------------------------------------------------------------------
# Consultas guardadas do Logs Insights — triagem pelo traceId (#187)
# ------------------------------------------------------------------------------
resource "aws_cloudwatch_query_definition" "erros_por_traceid" {
  name            = "${local.name_prefix}/erros-por-traceid"
  log_group_names = [aws_cloudwatch_log_group.app.name]

  query_string = <<-EOT
    fields @timestamp, requestId, method, url, msg, err.message, tenantId
    | filter level = "error"
    | sort @timestamp desc
    | limit 100
  EOT
}

resource "aws_cloudwatch_query_definition" "cron_corridas" {
  name            = "${local.name_prefix}/cron-corridas"
  log_group_names = [aws_cloudwatch_log_group.app.name]

  query_string = <<-EOT
    fields @timestamp, url, status, duration, level, msg, requestId
    | filter url like "/api/cron/"
    | sort @timestamp desc
    | limit 100
  EOT
}
