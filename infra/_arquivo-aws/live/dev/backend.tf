# Backend S3 remoto com native state locking (Terraform >= 1.10)
# Requer que o bootstrap/ tenha sido aplicado primeiro.
#
# REGRA: Nunca commitar o ficheiro .tfvars (contém configuração sensível).
# Usar terraform.tfvars.example como referência.
terraform {
  backend "s3" {
    bucket       = "gespro-terraform-state"
    key          = "dev/terraform.tfstate"
    region       = "af-south-1"
    use_lockfile = true # native locking, sem DynamoDB
    encrypt      = true
  }
}
