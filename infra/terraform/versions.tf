# Terraform 1.10 rather than 1.9: S3 native state locking (`use_lockfile`, in
# environments/*.tfbackend) landed in 1.10, and the alternative is a DynamoDB lock table
# nobody wants to own.
#
# The AWS provider is pinned to 6.38 or later because that is the release that added
# `aws_ecs_express_gateway_service`, which is the whole front half of this deployment.
terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.38"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Composed per environment: `-backend-config=environments/{env}.tfbackend`.
  # Deliberately empty here so that no environment is the default one.
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "devscribed-admin"
      Environment = var.env
      ManagedBy   = "terraform"
      Repository  = "Devscribed/Devscribed.Admin"
    }
  }
}
