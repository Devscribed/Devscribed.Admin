terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "env" {
  description = "Environment name."
  type        = string
}

variable "prefix" {
  description = "devscribed-{env}, for resource names."
  type        = string
}

variable "account_id" {
  description = "Account holding every resource these policies name."
  type        = string
}

variable "aws_region" {
  description = "Region, for the ARNs these policies build."
  type        = string
}

variable "documents_bucket_arn" {
  description = "ARN of this environment's documents bucket."
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of this environment's CMK."
  type        = string
}

variable "render_queue_arn" {
  description = "ARN of this environment's render queue."
  type        = string
}

variable "ses_domain" {
  description = "Verified sending domain, for the ses:SendEmail resource."
  type        = string
}

variable "ses_configuration_set" {
  description = "Configuration set the API is allowed to send through."
  type        = string
}

variable "sweep_function_name" {
  description = "Sweep function the scheduler role may invoke."
  type        = string
}

variable "vercel_oidc_issuer" {
  description = "OIDC issuer Vercel presents."
  type        = string
}

variable "vercel_team_slug" {
  description = "Vercel team whose deployments may assume the API role."
  type        = string
}

variable "vercel_project_name" {
  description = "Vercel project whose deployments may assume the API role."
  type        = string
}

locals {
  bucket             = var.documents_bucket_arn
  signed_prefix      = "${var.documents_bucket_arn}/signed/*"
  tmp_prefix         = "${var.documents_bucket_arn}/render-tmp/*"
  ses_identity_arn   = "arn:aws:ses:${var.aws_region}:${var.account_id}:identity/${var.ses_domain}"
  ses_config_arn     = "arn:aws:ses:${var.aws_region}:${var.account_id}:configuration-set/${var.ses_configuration_set}"
  sweep_function_arn = "arn:aws:lambda:${var.aws_region}:${var.account_id}:function:${var.sweep_function_name}"

  # Every ARN above names this environment explicitly. That is the whole isolation
  # mechanism in the single-account model the spec chose: the dev API role cannot
  # s3:GetObject from the prod bucket because the prod bucket is not in any statement it
  # holds. If a client security review ever demands a hard boundary instead, this module is
  # account-agnostic — moving prod is a new backend config and a new provider block.
}

# ---------------------------------------------------------------------------------------
# Secret containers
#
# Terraform creates the containers and the policies that grant access to them. It never
# creates a version and never reads a value, so no secret can land in the state file — an
# explicit correction to the sibling meetwave repository, which commits API keys in
# plaintext .tfvars. Values are set out of band, once, per environment:
#
#   aws secretsmanager put-secret-value --secret-id devscribed-{env}-internal-task \
#     --secret-string "$(openssl rand -base64 32)"
# ---------------------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "internal_task" {
  name        = "${var.prefix}-internal-task"
  description = "Bearer token for POST /api/internal/envelopes/sweep. Set out of band."
  kms_key_id  = var.kms_key_arn
}

resource "aws_secretsmanager_secret" "signing_pepper" {
  name        = "${var.prefix}-signing-pepper"
  description = "Pepper mixed into signing token hashes. Set out of band; rotating it invalidates outstanding links."
  kms_key_id  = var.kms_key_arn
}

# ---------------------------------------------------------------------------------------
# Vercel OIDC trust
#
# The provider is account-global, and both environments live in one account, so it cannot
# be owned by a per-environment state file without the two fighting over it. Like the state
# bucket, it is bootstrapped once, out of band, and both environments read it:
#
#   aws iam create-open-id-connect-provider --url https://oidc.vercel.com/{team} \
#     --client-id-list https://vercel.com/{team}
#
# What IS per-environment is the trust condition below: the dev role only trusts the dev
# deployment's subject claim.
# ---------------------------------------------------------------------------------------

data "aws_iam_openid_connect_provider" "vercel" {
  url = "${var.vercel_oidc_issuer}/${var.vercel_team_slug}"
}

data "aws_iam_policy_document" "api_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.vercel.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${trimprefix(var.vercel_oidc_issuer, "https://")}/${var.vercel_team_slug}:aud"
      values   = ["https://vercel.com/${var.vercel_team_slug}"]
    }

    # Scoped to one project and one environment. A preview deployment of another project
    # in the same team presents a different subject and is refused.
    condition {
      test     = "StringLike"
      variable = "${trimprefix(var.vercel_oidc_issuer, "https://")}/${var.vercel_team_slug}:sub"
      values   = ["owner:${var.vercel_team_slug}:project:${var.vercel_project_name}:environment:${var.env}"]
    }
  }
}

resource "aws_iam_role" "api" {
  name               = "${var.prefix}-api"
  description        = "Assumed by the NestJS API on Vercel via OIDC. No static keys exist anywhere."
  assume_role_policy = data.aws_iam_policy_document.api_assume.json
}

data "aws_iam_policy_document" "api" {
  # Note what is missing: s3:DeleteObject. No application role can delete a signed
  # document. Deletion requires a separate break-glass role that the application never uses.
  statement {
    sid       = "ReadWriteDocuments"
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:GetObject"]
    resources = [local.signed_prefix, local.tmp_prefix]
  }

  statement {
    sid       = "ListOwnPrefixes"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [local.bucket]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["signed/*", "render-tmp/*"]
    }
  }

  statement {
    sid       = "UseDocumentKey"
    effect    = "Allow"
    actions   = ["kms:GenerateDataKey", "kms:Decrypt", "kms:DescribeKey"]
    resources = [var.kms_key_arn]
  }

  statement {
    sid       = "SendSigningMail"
    effect    = "Allow"
    actions   = ["ses:SendEmail"]
    resources = [local.ses_identity_arn, local.ses_config_arn]

    # Holding the identity is not enough — the From address itself is constrained, so a
    # bug that builds an address from user input cannot send as someone else.
    condition {
      test     = "StringLike"
      variable = "ses:FromAddress"
      values   = ["*@${var.ses_domain}"]
    }
  }

  statement {
    sid       = "EnqueueRenders"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [var.render_queue_arn]
  }

  statement {
    sid     = "ReadFeatureSecrets"
    effect  = "Allow"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.internal_task.arn,
      aws_secretsmanager_secret.signing_pepper.arn,
    ]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "${var.prefix}-api"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

# ---------------------------------------------------------------------------------------
# Lambda execution roles
# ---------------------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "logs" {
  statement {
    sid       = "WriteOwnLogs"
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:CreateLogGroup"]
    resources = ["arn:aws:logs:${var.aws_region}:${var.account_id}:log-group:/aws/lambda/${var.prefix}*"]
  }
}

# Render role: read render-tmp/, write signed/, use the key, write its logs. It reads the
# queue too, which the API role deliberately cannot.
resource "aws_iam_role" "render" {
  name               = "${var.prefix}-render"
  description        = "Execution role for the PDF render function."
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "render" {
  source_policy_documents = [data.aws_iam_policy_document.logs.json]

  statement {
    sid       = "ReadRenderInput"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = [local.tmp_prefix]
  }

  statement {
    sid       = "WriteSignedDocument"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = [local.signed_prefix]
  }

  statement {
    sid       = "UseDocumentKey"
    effect    = "Allow"
    actions   = ["kms:GenerateDataKey", "kms:Decrypt"]
    resources = [var.kms_key_arn]
  }

  statement {
    sid    = "ConsumeRenderQueue"
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
    ]
    resources = [var.render_queue_arn]
  }
}

resource "aws_iam_role_policy" "render" {
  name   = "${var.prefix}-render"
  role   = aws_iam_role.render.id
  policy = data.aws_iam_policy_document.render.json
}

# Sweep role: read its secret and write its logs. It reaches the application over HTTPS
# with a bearer token, so it needs no AWS permission on any envelope resource at all.
resource "aws_iam_role" "sweep" {
  name               = "${var.prefix}-sweep"
  description        = "Execution role for the envelope sweep function."
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "sweep" {
  source_policy_documents = [data.aws_iam_policy_document.logs.json]

  statement {
    sid       = "ReadInternalTaskSecret"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.internal_task.arn]
  }

  statement {
    sid       = "DecryptSecret"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = [var.kms_key_arn]
  }
}

resource "aws_iam_role_policy" "sweep" {
  name   = "${var.prefix}-sweep"
  role   = aws_iam_role.sweep.id
  policy = data.aws_iam_policy_document.sweep.json
}

# The ses-events function has the same shape as the sweep: an HTTPS call to the
# application, signed with a secret. It is a separate role so that a change to one cannot
# quietly widen the other.
resource "aws_iam_role" "ses_events" {
  name               = "${var.prefix}-ses-events"
  description        = "Execution role for the SES event forwarder."
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy" "ses_events" {
  name   = "${var.prefix}-ses-events"
  role   = aws_iam_role.ses_events.id
  policy = data.aws_iam_policy_document.sweep.json
}

# Scheduler role: invoke exactly one function, and nothing else.
data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.prefix}-scheduler"
  description        = "Assumed by EventBridge Scheduler to invoke the sweep function."
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    sid       = "InvokeSweep"
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = [local.sweep_function_arn]
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "${var.prefix}-scheduler"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}

output "api_role_arn" {
  description = "Role the API assumes from Vercel."
  value       = aws_iam_role.api.arn
}

output "render_role_arn" {
  description = "Execution role for the render function."
  value       = aws_iam_role.render.arn
}

output "sweep_role_arn" {
  description = "Execution role for the sweep function."
  value       = aws_iam_role.sweep.arn
}

output "ses_events_role_arn" {
  description = "Execution role for the SES event forwarder."
  value       = aws_iam_role.ses_events.arn
}

output "scheduler_role_arn" {
  description = "Role EventBridge Scheduler assumes."
  value       = aws_iam_role.scheduler.arn
}

output "internal_task_secret_arn" {
  description = "Secret container for INTERNAL_TASK_SECRET. The value is set out of band."
  value       = aws_secretsmanager_secret.internal_task.arn
}

output "signing_pepper_secret_arn" {
  description = "Secret container for the signing pepper. The value is set out of band."
  value       = aws_secretsmanager_secret.signing_pepper.arn
}
