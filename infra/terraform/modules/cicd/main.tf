terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.38"
    }
  }
}

# The role GitHub Actions assumes to deploy.
#
# **No access keys exist.** GitHub presents an OIDC token that names the repository, the
# branch, and the workflow; the trust policy below decides whether that is enough. There
# is nothing to leak, nothing to rotate, and nothing that keeps working after somebody
# leaves.
#
# **It runs the same script a developer runs**, `infra/deploy.sh`, which means it runs
# `terraform apply`. That is a deliberate choice with a real cost, so both halves are worth
# stating.
#
# The alternative — a workflow that only pushes an image and calls `aws ecs update-service`
# — needs a much smaller role. It was rejected because this deployment pins each service to
# an image **digest held in Terraform state**: an image swapped in behind Terraform's back
# is permanent drift, and the next `make deploy` would silently roll the service back to
# whatever the state still believed. Two code paths would also mean CI does something
# nobody has ever done by hand.
#
# So the role below is powerful, and what keeps it safe is not its policy but its trust
# policy. It can only be assumed by a workflow run in this repository, in a job that
# declares this environment — which for prod is where GitHub's required reviewers attach,
# making a human approval part of the credential rather than part of the interface. The
# workflow itself is off behind three separate switches. Even so, the policy is scoped to
# the services this stack is built from, and its IAM statement is scoped by role name, so a
# compromised run cannot grant itself anything wider.

variable "env" {
  description = "Environment name."
  type        = string
}

variable "prefix" {
  description = "Name prefix shared by every resource in this environment."
  type        = string
}

variable "github_repository" {
  description = "owner/repo allowed to assume the role."
  type        = string
}

variable "allowed_refs" {
  description = <<-EOT
    Git refs whose workflow runs may assume this role, as OIDC `sub` suffixes — for
    example `ref:refs/heads/main`. Deliberately narrow: any branch anyone can push is a
    branch that can deploy.
  EOT
  type        = list(string)
}

variable "create_oidc_provider" {
  description = <<-EOT
    Whether to create the account's GitHub OIDC provider. There can be exactly one per
    account, so the first environment creates it and every later one sets this false.
  EOT
  type        = bool
}

variable "cluster_arn" {
  description = "Cluster whose services may be updated."
  type        = string
}

variable "ecr_repository_arns" {
  description = "Repositories the workflow may push to."
  type        = list(string)
}

variable "execution_role_arn" {
  description = "Execution role the migration task uses. The workflow must be able to pass it."
  type        = string
}

variable "task_role_arn" {
  description = "Task role the migration task uses. Same reason."
  type        = string
}

variable "migrate_task_definition_arn" {
  description = "Task definition the workflow may run."
  type        = string
}

variable "state_bucket" {
  description = "Terraform state bucket. The workflow reads and writes this environment's key, and no other."
  type        = string
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # AWS stopped verifying this thumbprint for the GitHub issuer in 2023 and now validates
  # the certificate chain itself. It is still a required field, so it holds GitHub's
  # long-standing value rather than a placeholder that would confuse the next reader.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

locals {
  provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.provider_arn]
    }

    # Without this, a token minted for *any* GitHub repository would satisfy the issuer
    # check. This is the audience half.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # And this is the subject half: this repository, these refs, and nothing else.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [for ref in var.allowed_refs : "repo:${var.github_repository}:${ref}"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "${var.prefix}-github-deploy"
  description        = "Assumed by GitHub Actions to push images and roll the services."
  assume_role_policy = data.aws_iam_policy_document.assume.json
  # A deploy that takes longer than this has gone wrong in a way a longer session would
  # not fix.
  max_session_duration = 3600
}

data "aws_iam_policy_document" "deploy" {
  # Everything the stack is built from, and nothing else. Explicit rather than the
  # `PowerUserAccess` managed policy: PowerUser would also grant Bedrock, SageMaker, and
  # every other service this account will never run, and a reader could not tell from it
  # what this stack actually touches. This list can.
  statement {
    sid = "TheServicesThisStackIsBuiltFrom"
    actions = [
      "acm:*",
      "application-autoscaling:*",
      "cloudwatch:*",
      "ec2:*",
      "ecr:*",
      "ecs:*",
      "elasticloadbalancing:*",
      "kms:*",
      "logs:*",
      "rds:*",
      "s3:*",
      "scheduler:*",
      "servicediscovery:*",
      "ses:*",
      "sns:*",
      "ssm:*",
      "sts:GetCallerIdentity",
    ]
    resources = ["*"]
  }

  # IAM is separate, and scoped by name. Terraform creates and updates this project's roles
  # and nothing else in IAM — and a role that could write arbitrary IAM policy is a role
  # that could grant itself everything the statement above deliberately leaves out.
  statement {
    sid = "OnlyThisProjectsRoles"
    actions = [
      "iam:AttachRolePolicy",
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:DeleteRolePolicy",
      "iam:DetachRolePolicy",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:ListRolePolicies",
      "iam:ListRoleTags",
      "iam:PutRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:UpdateAssumeRolePolicy",
      "iam:UpdateRole",
    ]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/devscribed-*"]
  }

  statement {
    sid       = "ReadTheOidcProviderItAlreadyUses"
    actions   = ["iam:GetOpenIDConnectProvider", "iam:TagOpenIDConnectProvider"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"]
  }

  # A service-linked role is a one-time side effect of first use; ECS, RDS, and Application
  # Auto Scaling each want one. Constrained to exactly those three.
  statement {
    sid       = "ServiceLinkedRolesForTheseThreeServices"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "iam:AWSServiceName"
      values = [
        "ecs.amazonaws.com",
        "rds.amazonaws.com",
        "ecs.application-autoscaling.amazonaws.com",
      ]
    }
  }

  statement {
    sid       = "PassTheRolesItManages"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/devscribed-*"]
  }

  # This environment's state key only. The dev workflow cannot read, lock, or corrupt prod's
  # state file, which is the same isolation the two backend configs give a human.
  statement {
    sid       = "ThisEnvironmentsTerraformState"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::${var.state_bucket}/app/${var.env}/*"]
  }

  statement {
    sid       = "ListTheStateBucket"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = ["arn:aws:s3:::${var.state_bucket}"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

output "deploy_role_arn" {
  description = "Set this as the AWS_DEPLOY_ROLE_<ENV> variable in the GitHub repository."
  value       = aws_iam_role.deploy.arn
}
