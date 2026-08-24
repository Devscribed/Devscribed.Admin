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

variable "ses_domain" {
  description = "Sending domain for this environment."
  type        = string
}

variable "ses_sandbox" {
  description = "Recorded expectation of whether this environment is still sandboxed."
  type        = bool
}

variable "app_base_url" {
  description = "Where the ses-events function posts delivery notifications."
  type        = string
}

variable "function_name" {
  description = "Name of the ses-events function."
  type        = string
}

variable "artifact_path" {
  description = "Zip for the ses-events function."
  type        = string
}

variable "execution_role_arn" {
  description = "Execution role for the ses-events function."
  type        = string
}

variable "internal_secret_arn" {
  description = "Secret holding the bearer token the API webhook expects."
  type        = string
}

# Log retention is deliberately not an input here: every log group in this environment,
# this function's included, is owned by the observability module so that one retention
# decision cannot be made in two places.

# ---------------------------------------------------------------------------------------
# Identity, DKIM, and a custom MAIL FROM
#
# The MAIL FROM subdomain is not decoration: without it the bounce domain is
# amazonses.com, and DMARC alignment then depends on a domain we do not control.
# ---------------------------------------------------------------------------------------

resource "aws_sesv2_email_identity" "sending" {
  email_identity         = var.ses_domain
  configuration_set_name = aws_sesv2_configuration_set.documents.configuration_set_name

  dkim_signing_attributes {
    # Easy DKIM at 2048 bits. AWS rotates the keys; we publish three CNAMEs once.
    next_signing_key_length = "RSA_2048_BIT"
  }
}

resource "aws_sesv2_email_identity_mail_from_attributes" "sending" {
  email_identity   = aws_sesv2_email_identity.sending.email_identity
  mail_from_domain = "bounce.${var.ses_domain}"

  # If the MX record is missing, refuse to send rather than silently falling back to
  # amazonses.com — a silent fallback is how DMARC alignment breaks without anyone noticing.
  behavior_on_mx_failure = "REJECT_MESSAGE"
}

# ---------------------------------------------------------------------------------------
# Configuration set and event destination
# ---------------------------------------------------------------------------------------

resource "aws_sesv2_configuration_set" "documents" {
  configuration_set_name = "${var.prefix}-documents"

  delivery_options {
    tls_policy = "REQUIRE"
  }

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }

  suppression_options {
    # Per-configuration-set suppression. The ACCOUNT-level suppression list the spec also
    # calls for is deliberately NOT managed here: it is one setting shared by both
    # environments in this single account, so a per-environment module would fight itself.
    # Like the state bucket, it is set once, out of band.
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }
}

resource "aws_sns_topic" "ses_events" {
  name = "${var.prefix}-ses-events"
}

resource "aws_sesv2_configuration_set_event_destination" "sns" {
  configuration_set_name = aws_sesv2_configuration_set.documents.configuration_set_name
  event_destination_name = "${var.prefix}-ses-events"

  event_destination {
    enabled = true
    # A bounce on a signing invitation has to reach the envelope UI, otherwise a typo in a
    # counterparty address looks identical to a counterparty who is simply slow.
    matching_event_types = ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "REJECT"]

    sns_destination {
      topic_arn = aws_sns_topic.ses_events.arn
    }
  }
}

# ---------------------------------------------------------------------------------------
# SNS -> ses-events function -> the API webhook -> EnvelopeEvent rows
#
# The function sits in between rather than SNS calling the API directly, because the
# webhook is HMAC-signed with a secret only an IAM principal can read — an HTTPS SNS
# subscription has nowhere to get it from.
# ---------------------------------------------------------------------------------------

resource "aws_lambda_function" "ses_events" {
  function_name = var.function_name
  role          = var.execution_role_arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  memory_size   = 256
  timeout       = 30
  filename      = var.artifact_path
  # `try` so `terraform validate` and a plan on a machine that has not built the artifact
  # yet both still work; a real apply has the file.
  source_code_hash = try(filebase64sha256(var.artifact_path), null)

  environment {
    variables = {
      APP_BASE_URL        = var.app_base_url
      INTERNAL_SECRET_ARN = var.internal_secret_arn
      ENVIRONMENT         = var.env
    }
  }
}

resource "aws_sns_topic_subscription" "ses_events" {
  topic_arn = aws_sns_topic.ses_events.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.ses_events.arn
}

resource "aws_lambda_permission" "ses_events" {
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ses_events.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.ses_events.arn
}

output "configuration_set_name" {
  description = "SES configuration set — the SES_CONFIGURATION_SET the API is given."
  value       = aws_sesv2_configuration_set.documents.configuration_set_name
}

output "identity_domain" {
  description = "Verified sending domain."
  value       = aws_sesv2_email_identity.sending.email_identity
}

output "mail_from_domain" {
  description = "Custom MAIL FROM subdomain. Needs an MX and an SPF record."
  value       = aws_sesv2_email_identity_mail_from_attributes.sending.mail_from_domain
}

output "dkim_tokens" {
  description = "Publish each as {token}._domainkey.{domain} CNAME -> {token}.dkim.amazonses.com."
  value       = aws_sesv2_email_identity.sending.dkim_signing_attributes[0].tokens
}

output "events_topic_arn" {
  description = "SNS topic carrying send, delivery, bounce, complaint, and reject events."
  value       = aws_sns_topic.ses_events.arn
}

output "sandbox_expected" {
  description = <<-EOT
    Whether this environment is expected to be in the SES sandbox. Terraform cannot change
    it — leaving the sandbox is an AWS support request with lead time, and it must be filed
    before the first real contract can be sent.
  EOT
  value       = var.ses_sandbox
}
