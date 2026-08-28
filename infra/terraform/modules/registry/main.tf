terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.38"
    }
  }
}

# One repository per service, per environment.
#
# Per environment, not shared: a dev push must not be one `docker tag` away from being
# what prod pulls. The images are small enough that duplicating them costs cents, and the
# isolation is worth more than that.

variable "prefix" {
  description = "Name prefix shared by every resource in this environment."
  type        = string
}

variable "services" {
  description = "Service names. One repository each."
  type        = list(string)
}

variable "retained_images" {
  description = <<-EOT
    How many images to keep per repository. Deploys are by digest, so the tag history is
    the rollback path: this number is how many deploys back you can go.
  EOT
  type        = number
}

variable "force_destroy" {
  description = "Whether `terraform destroy` may delete repositories that still hold images."
  type        = bool
}

resource "aws_ecr_repository" "service" {
  for_each = toset(var.services)

  name = "${var.prefix}-${each.key}"
  # MUTABLE because the deploy pushes both a moving `latest`-style tag and an immutable
  # commit tag; the service is always pinned to the digest, so mutability never decides
  # what actually runs.
  image_tag_mutability = "MUTABLE"
  force_delete         = var.force_destroy

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

# Untagged layers are the ones orphaned by the next push of the same tag. They are pure
# storage cost and nothing can ever run them, so they go first and fast.
resource "aws_ecr_lifecycle_policy" "service" {
  for_each = aws_ecr_repository.service

  repository = each.value.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after a day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep the last ${var.retained_images} images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.retained_images
        }
        action = { type = "expire" }
      },
    ]
  })
}

output "repository_urls" {
  description = "Push targets, keyed by service name."
  value       = { for name, repo in aws_ecr_repository.service : name => repo.repository_url }
}

output "repository_arns" {
  description = "ARNs, for the execution role's pull policy."
  value       = [for repo in aws_ecr_repository.service : repo.arn]
}
