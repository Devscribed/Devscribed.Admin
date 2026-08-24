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

variable "alarm_email" {
  description = "Address subscribed to the alarm topic."
  type        = string
}

variable "log_retention_days" {
  description = "Retention on every log group in this environment."
  type        = number
}

variable "function_names" {
  description = "Functions whose log groups this module owns."
  type        = list(string)
}

variable "render_function_name" {
  description = "Function the render-failure metric filter and alarm watch."
  type        = string
}

# ---------------------------------------------------------------------------------------
# Alarm topic
#
# One topic per environment, and an email subscription rather than a chat integration:
# email needs no third-party credential in this repository, and the dev topic reaching a
# dev channel is exactly the blast radius we want.
# ---------------------------------------------------------------------------------------

resource "aws_sns_topic" "alarms" {
  name = "${var.prefix}-alarms"
}

resource "aws_sns_topic_subscription" "alarm_email" {
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
  # A subscription is only live once the recipient confirms it. Terraform cannot do that,
  # so a fresh environment has an unconfirmed subscription until someone clicks the link.
}

# ---------------------------------------------------------------------------------------
# Log groups
#
# Declared here rather than left to Lambda's implicit creation, because an implicitly
# created group has no retention at all — logs accumulate forever, and in prod they are
# part of the evidentiary picture with a deliberate 365-day life, not an accidental
# infinite one.
# ---------------------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "functions" {
  for_each = toset(var.function_names)

  name              = "/aws/lambda/${each.value}"
  retention_in_days = var.log_retention_days
}

# ---------------------------------------------------------------------------------------
# Render failures
#
# A metric filter rather than the Lambda Errors metric alone: a render that fails cleanly
# and reports a batch item failure is not a Lambda error, but it is exactly the event that
# leaves an envelope `completed` with `PdfStatus = failed`.
# ---------------------------------------------------------------------------------------

resource "aws_cloudwatch_log_metric_filter" "render_failures" {
  name           = "${var.prefix}-render-failures"
  log_group_name = aws_cloudwatch_log_group.functions["${var.render_function_name}"].name
  pattern        = "?ERROR ?\"render_failed\""

  metric_transformation {
    name      = "RenderFailures"
    namespace = "Devscribed/Documents/${var.env}"
    value     = "1"
    # Absence of failures must read as zero, otherwise the alarm sits in INSUFFICIENT_DATA
    # forever and nobody trusts it.
    default_value = 0
  }
}

resource "aws_cloudwatch_metric_alarm" "render_failures" {
  alarm_name          = "${var.prefix}-render-failures"
  alarm_description   = "The PDF renderer is failing. Signatures are safe; documents are not being produced."
  namespace           = "Devscribed/Documents/${var.env}"
  metric_name         = aws_cloudwatch_log_metric_filter.render_failures.metric_transformation[0].name
  statistic           = "Sum"
  period              = 900
  evaluation_periods  = 1
  threshold           = 2
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

# ---------------------------------------------------------------------------------------
# SES bounce rate
#
# The number that decides whether we can send mail at all. AWS begins review at 5% and
# suspends sending at 10%, so the alarm sits well below both — by the time it fires there
# is still time to stop sending rather than to appeal a suspension.
# ---------------------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "ses_bounce_rate" {
  alarm_name          = "${var.prefix}-ses-bounce-rate"
  alarm_description   = "SES bounce rate above 3%. Deliverability, and therefore every signing invitation, is at risk."
  namespace           = "AWS/SES"
  metric_name         = "Reputation.BounceRate"
  statistic           = "Average"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 0.03
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

resource "aws_cloudwatch_metric_alarm" "ses_complaint_rate" {
  alarm_name          = "${var.prefix}-ses-complaint-rate"
  alarm_description   = "SES complaint rate above 0.1%. Recipients are marking signing mail as spam."
  namespace           = "AWS/SES"
  metric_name         = "Reputation.ComplaintRate"
  statistic           = "Average"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 0.001
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

output "alarm_topic_arn" {
  description = "SNS topic every alarm in this environment publishes to."
  value       = aws_sns_topic.alarms.arn
}

output "log_group_names" {
  description = "Log groups owned by this module."
  value       = [for group in aws_cloudwatch_log_group.functions : group.name]
}
