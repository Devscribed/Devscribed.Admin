terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.38"
    }
  }
}

# Alarms.
#
# Deliberately few. An alarm that fires without anybody acting on it trains people to
# ignore the ones that matter, so each of these answers a question someone would actually
# get out of bed for: is the product down, is the database about to be, and is it quietly
# producing worthless PDFs.

variable "env" {
  description = "Environment name."
  type        = string
}

variable "prefix" {
  description = "Name prefix shared by every resource in this environment."
  type        = string
}

variable "alarm_email" {
  description = "Address subscribed to the alarm topic. Empty subscribes nobody."
  type        = string
}

variable "cluster_name" {
  description = "ECS cluster holding both services."
  type        = string
}

variable "web_service_name" {
  description = "Web service, watched for having no running tasks."
  type        = string
}

variable "api_service_name" {
  description = "API service, watched for having no running tasks."
  type        = string
}

variable "api_log_group_name" {
  description = "Log group the PDF-fallback metric filter reads."
  type        = string
}

variable "db_instance_identifier" {
  description = "Database instance the storage and CPU alarms watch."
  type        = string
}

variable "db_free_storage_bytes_threshold" {
  description = "Free storage below which the database alarm fires."
  type        = number
}

variable "alarms_enabled" {
  description = <<-EOT
    Whether the service alarms are armed. `make stop-dev` scales both services to zero on
    purpose; an alarm that then reports the product down is noise, not signal.
  EOT
  type        = bool
  default     = true
}

resource "aws_sns_topic" "alarms" {
  name = "${var.prefix}-alarms"
}

# The subscription needs confirming once, from the inbox. Until then AWS shows it as
# `PendingConfirmation` and nothing is delivered — which is the single most common reason
# an alarm "did not fire".
resource "aws_sns_topic_subscription" "email" {
  count = var.alarm_email == "" ? 0 : 1

  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

locals {
  actions = [aws_sns_topic.alarms.arn]
}

# ---------------------------------------------------------------------------------------
# Is the product up
# ---------------------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "web_no_tasks" {
  count = var.alarms_enabled ? 1 : 0

  alarm_name        = "${var.prefix}-web-no-tasks"
  alarm_description = "The web service has no running task. Nobody can reach the product."

  namespace   = "AWS/ECS"
  metric_name = "RunningTaskCount"
  dimensions = {
    ClusterName = var.cluster_name
    ServiceName = var.web_service_name
  }

  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  # A deploy briefly reports missing data between task definitions; treating that as
  # breaching would page on every successful deploy.
  treat_missing_data = "notBreaching"

  alarm_actions = local.actions
  ok_actions    = local.actions
}

resource "aws_cloudwatch_metric_alarm" "api_no_tasks" {
  count = var.alarms_enabled ? 1 : 0

  alarm_name        = "${var.prefix}-api-no-tasks"
  alarm_description = "The API service has no running task. Every page loads and every page is empty."

  namespace   = "AWS/ECS"
  metric_name = "RunningTaskCount"
  dimensions = {
    ClusterName = var.cluster_name
    ServiceName = var.api_service_name
  }

  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = local.actions
  ok_actions    = local.actions
}

# ---------------------------------------------------------------------------------------
# Is the database about to be
# ---------------------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "db_storage" {
  alarm_name        = "${var.prefix}-db-free-storage"
  alarm_description = "Database free storage is low. Autoscaling should have handled this; check why it did not."

  namespace   = "AWS/RDS"
  metric_name = "FreeStorageSpace"
  dimensions  = { DBInstanceIdentifier = var.db_instance_identifier }

  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.db_free_storage_bytes_threshold
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  alarm_actions = local.actions
  ok_actions    = local.actions
}

resource "aws_cloudwatch_metric_alarm" "db_cpu" {
  alarm_name        = "${var.prefix}-db-cpu"
  alarm_description = "Database CPU sustained above 80%. A t4g burns credits at this rate and then throttles hard."

  namespace   = "AWS/RDS"
  metric_name = "CPUUtilization"
  dimensions  = { DBInstanceIdentifier = var.db_instance_identifier }

  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = local.actions
  ok_actions    = local.actions
}

# ---------------------------------------------------------------------------------------
# Is it quietly producing worthless PDFs
#
# The one alarm here that is about correctness rather than availability. When Chromium
# cannot be launched the renderer degrades to a Latin-1, single-page text writer rather
# than failing — which is right, because requirement 31 says a captured signature must
# never be lost to a render failure. But a Russian contract through that path is mojibake,
# and nothing else in the system would ever say so.
# ---------------------------------------------------------------------------------------

resource "aws_cloudwatch_log_metric_filter" "pdf_fallback" {
  name           = "${var.prefix}-pdf-fallback"
  log_group_name = var.api_log_group_name
  # Matches the warning text in LocalChromiumPdfRenderer.fallback().
  pattern = "\"PDF rendered by the built-in fallback writer\""

  metric_transformation {
    name          = "PdfFallbackRenders"
    namespace     = "Devscribed/${var.env}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "pdf_fallback" {
  alarm_name        = "${var.prefix}-pdf-fallback"
  alarm_description = "A signed PDF was produced without Chromium. Cyrillic in it is mojibake. Check the image."

  namespace   = aws_cloudwatch_log_metric_filter.pdf_fallback.metric_transformation[0].namespace
  metric_name = aws_cloudwatch_log_metric_filter.pdf_fallback.metric_transformation[0].name

  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = local.actions
}

output "alarm_topic_arn" {
  description = "Topic every alarm publishes to. The email subscription needs confirming once."
  value       = aws_sns_topic.alarms.arn
}
