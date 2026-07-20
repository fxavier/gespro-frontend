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

output "instance_id" {
  description = "Identificador da instância RDS"
  value       = aws_db_instance.main.identifier
}
