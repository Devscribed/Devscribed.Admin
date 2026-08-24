# Terraform 1.10 rather than the 1.9 the spec names: S3 native state locking
# (`use_lockfile`, in environments/*.tfbackend) landed in 1.10, and the alternative is a
# DynamoDB lock table nobody wants to own. Nothing else here needs the newer version.
terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Composed per environment: `-backend-config=environments/{env}.tfbackend`.
  # Deliberately empty here so no environment is the default one.
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "devscribed-admin"
      Area        = "documents"
      Environment = var.env
      ManagedBy   = "terraform"
      Spec        = "specs/documents/02-envelopes-and-signing.md"
    }
  }
}
