# Backend S3 remoto com native state locking (Terraform >= 1.10)
terraform {
  backend "s3" {
    bucket       = "gespro-terraform-state"
    key          = "prod/terraform.tfstate"
    region       = "af-south-1"
    use_lockfile = true
    encrypt      = true
  }
}
