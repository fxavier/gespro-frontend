output "endpoint" {
  description = "Endpoint do RDS (host:port)"
  value       = aws_db_instance.main.endpoint
}

output "host" {
  description = "Host do RDS (sem porta)"
  value       = aws_db_instance.main.address
}

output "port" {
  description = "Porta do RDS"
  value       = aws_db_instance.main.port
}

output "db_name" {
  description = "Nome da base de dados"
  value       = aws_db_instance.main.db_name
}

output "backup_retention_period" {
  description = "Dias de retenção dos backups automáticos — a janela do PITR"
  value       = aws_db_instance.main.backup_retention_period
}

output "protecao" {
  description = "Protecções da instância contra perda (verificadas pelo teste de continuidade de live/prod)"
  value = {
    deletion_protection      = aws_db_instance.main.deletion_protection
    skip_final_snapshot      = aws_db_instance.main.skip_final_snapshot
    copy_tags_to_snapshot    = aws_db_instance.main.copy_tags_to_snapshot
    delete_automated_backups = aws_db_instance.main.delete_automated_backups
  }
}

output "instance_id" {
  description = "Identificador da instância RDS"
  value       = aws_db_instance.main.identifier
}
