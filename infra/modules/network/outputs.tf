output "vpc_id" {
  description = "ID da VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs das subnets públicas"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs das subnets privadas (RDS + VPC Connector)"
  value       = aws_subnet.private[*].id
}

output "apprunner_sg_id" {
  description = "ID do Security Group do App Runner VPC Connector"
  value       = aws_security_group.apprunner.id
}

output "rds_sg_id" {
  description = "ID do Security Group do RDS"
  value       = aws_security_group.rds.id
}
