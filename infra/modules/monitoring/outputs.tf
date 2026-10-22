output "sns_topic_arn" {
  description = "Tópico SNS dos alertas (região principal)"
  value       = aws_sns_topic.alertas.arn
}

output "sns_topic_us_east_1_arn" {
  description = "Tópico SNS dos alertas do health check (us-east-1)"
  value       = aws_sns_topic.alertas_us_east_1.arn
}

output "health_check_id" {
  description = "ID do health check Route 53 sobre /api/ready"
  value       = aws_route53_health_check.ready.id
}

output "log_group_name" {
  description = "Grupo de registos da aplicação no CloudWatch Logs (criado pelo App Runner)"
  value       = local.log_group
}

output "alarmes" {
  description = "Nomes dos alarmes CloudWatch, por chave"
  value = {
    ready_indisponivel = aws_cloudwatch_metric_alarm.ready_indisponivel.alarm_name
    taxa_5xx           = aws_cloudwatch_metric_alarm.taxa_5xx.alarm_name
    budget_slo         = aws_cloudwatch_metric_alarm.budget_slo.alarm_name
    latencia_p95       = aws_cloudwatch_metric_alarm.latencia_p95.alarm_name
    cron_falhou        = aws_cloudwatch_metric_alarm.cron_falhou.alarm_name
    cron_em_falta      = aws_cloudwatch_metric_alarm.cron_em_falta.alarm_name
    erros_inesperados  = aws_cloudwatch_metric_alarm.erros_inesperados.alarm_name
  }
}

output "filtros" {
  description = "Padrões dos filtros de métrica sobre os registos (o teste confere-os contra o formato do logger)"
  value = {
    cron_falhou   = aws_cloudwatch_log_metric_filter.cron_falhou.pattern
    cron_sucesso  = aws_cloudwatch_log_metric_filter.cron_sucesso.pattern
    erros_logger  = aws_cloudwatch_log_metric_filter.erros.pattern
    ready_caminho = aws_route53_health_check.ready.resource_path
  }
}
