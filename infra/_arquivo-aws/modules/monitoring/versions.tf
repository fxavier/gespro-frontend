terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
      # `aws.us_east_1`: as métricas dos health checks do Route 53 só existem em
      # us-east-1, e um alarme só notifica um tópico SNS da sua própria região.
      configuration_aliases = [aws.us_east_1]
    }
  }
}
