terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.38"
    }
  }
}

# Outbound mail.
#
# The application already has the abstraction this module serves: `MailService` in
# apps/api/src/mail/mail.service.ts is an abstract class used directly as the DI token,
# with four implementations behind it — an in-memory sink for tests, a console logger, and
# `SesMailService` for production. Nothing here touches that contract. This module
# provisions the identity and the configuration set that `MAIL_TRANSPORT=ses` needs, and
# stops there.
#
# **Identities are email addresses, not a domain**, because this account owns no domain.
# That has one consequence worth stating plainly rather than discovering: SES in the
# sandbox will deliver only to addresses that are themselves verified. Every test
# recipient must be listed in `verified_emails` and must click the link AWS sends them.
# Leaving the sandbox is a support request with lead time, and it is what has to happen
# before the first real contract can be sent to a real counterparty.

variable "env" {
  description = "Environment name."
  type        = string
}

variable "prefix" {
  description = "Name prefix shared by every resource in this environment."
  type        = string
}

variable "sender_email" {
  description = <<-EOT
    Address every message is sent from. It becomes a verified SES identity, and AWS mails
    a confirmation link to it that a human has to click once, per environment.
  EOT
  type        = string
}

variable "verified_emails" {
  description = <<-EOT
    Additional addresses to verify as recipients. In the SES sandbox these are the only
    addresses that can receive anything, so a signer whose address is not here will never
    see their invitation. Each one gets a confirmation mail to click.
  EOT
  type        = list(string)
  default     = []
}

variable "sandbox_expected" {
  description = <<-EOT
    Whether this environment is expected to still be sandboxed. Terraform cannot leave the
    sandbox — that is a support request — so this provisions nothing. It is the recorded
    expectation, and flipping it to false is the checklist item that says production
    access was actually granted.
  EOT
  type        = bool
}

variable "bounce_notification_email" {
  description = "Address subscribed to bounces and complaints. Empty subscribes nobody."
  type        = string
  default     = ""
}

locals {
  # Deduplicated because the sender is frequently also a test recipient, and SES rejects
  # a second identity for an address it already knows.
  recipient_identities = toset([for e in var.verified_emails : e if e != var.sender_email])
}

# ---------------------------------------------------------------------------------------
# Identities
# ---------------------------------------------------------------------------------------

resource "aws_sesv2_email_identity" "sender" {
  email_identity         = var.sender_email
  configuration_set_name = aws_sesv2_configuration_set.main.configuration_set_name
}

resource "aws_sesv2_email_identity" "recipients" {
  for_each = local.recipient_identities

  email_identity = each.value
}

# ---------------------------------------------------------------------------------------
# Configuration set
#
# Attached to every message the application sends, not only the signing ones: a bounce on
# a password reset is the same operational signal as a bounce on an invitation.
# ---------------------------------------------------------------------------------------

resource "aws_sesv2_configuration_set" "main" {
  configuration_set_name = "${var.prefix}-documents"

  delivery_options {
    # Refuse to send unencrypted rather than silently downgrading. A signing link in
    # cleartext SMTP is a signing link anyone on the path can use.
    tls_policy = "REQUIRE"
  }

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }

  suppression_options {
    # An address that hard-bounced or complained is suppressed account-wide. Continuing to
    # mail it is how a sending reputation dies.
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }
}

# ---------------------------------------------------------------------------------------
# Events
#
# Spec 02 wants send, delivery, bounce, and complaint turned into `EnvelopeEvent` rows.
# That bridge is **not deployed**: the API now has no public address (see the API service
# in modules/app), so an SNS HTTPS subscription cannot reach it, and the in-VPC function
# that would is a separate piece of work. What exists here is the topic those events land
# on and a human subscription to the two that need an answer today.
# ---------------------------------------------------------------------------------------

resource "aws_sns_topic" "events" {
  name = "${var.prefix}-ses-events"
}

data "aws_iam_policy_document" "events" {
  statement {
    sid     = "AllowSesPublish"
    actions = ["sns:Publish"]

    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com"]
    }

    resources = [aws_sns_topic.events.arn]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

data "aws_caller_identity" "current" {}

resource "aws_sns_topic_policy" "events" {
  arn    = aws_sns_topic.events.arn
  policy = data.aws_iam_policy_document.events.json
}

resource "aws_sesv2_configuration_set_event_destination" "sns" {
  configuration_set_name = aws_sesv2_configuration_set.main.configuration_set_name
  event_destination_name = "sns"

  event_destination {
    enabled = true
    # REJECT and RENDERING_FAILURE are included because both mean the message never left,
    # and a signer waiting for a link that was never sent looks exactly like a signer who
    # is ignoring it.
    matching_event_types = ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "REJECT", "RENDERING_FAILURE"]

    sns_destination {
      topic_arn = aws_sns_topic.events.arn
    }
  }
}

resource "aws_sns_topic_subscription" "bounces" {
  count = var.bounce_notification_email == "" ? 0 : 1

  topic_arn = aws_sns_topic.events.arn
  protocol  = "email"
  endpoint  = var.bounce_notification_email
}

output "sender_email" {
  description = "MAIL_FROM. Verified, and the only address this environment can send as."
  value       = aws_sesv2_email_identity.sender.email_identity
}

output "sender_identity_arn" {
  description = "ARN of the sending identity, for the task role's ses:SendEmail statement."
  value       = aws_sesv2_email_identity.sender.arn
}

output "configuration_set_name" {
  description = "SES_CONFIGURATION_SET."
  value       = aws_sesv2_configuration_set.main.configuration_set_name
}

output "events_topic_arn" {
  description = "Topic carrying send, delivery, bounce, complaint, and reject events."
  value       = aws_sns_topic.events.arn
}

output "verification_pending" {
  description = <<-EOT
    Every identity AWS has mailed a confirmation link to. Until each one is clicked, that
    address can neither send nor — in the sandbox — receive.
  EOT
  value       = concat([var.sender_email], tolist(local.recipient_identities))
}

output "sandbox_expected" {
  description = "Whether this environment is expected to still be in the SES sandbox."
  value       = var.sandbox_expected
}
