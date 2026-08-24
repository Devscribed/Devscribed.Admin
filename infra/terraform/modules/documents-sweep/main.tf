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

variable "function_name" {
  description = "Name of the sweep function."
  type        = string
}

variable "artifact_path" {
  description = "Zip for the sweep function."
  type        = string
}

variable "execution_role_arn" {
  description = "Execution role for the sweep function."
  type        = string
}

variable "scheduler_role_arn" {
  description = "Role EventBridge Scheduler assumes to invoke the function."
  type        = string
}

variable "app_base_url" {
  description = "Base URL the sweep calls POST /api/internal/envelopes/sweep on."
  type        = string
}

variable "internal_secret_arn" {
  description = "Secret holding INTERNAL_TASK_SECRET. The value is set out of band."
  type        = string
}

variable "alarm_topic_arn" {
  description = "Where the sweep-failure alarm goes."
  type        = string
}

# ---------------------------------------------------------------------------------------
# The sweep function
#
# It materializes expired statuses and sends reminders, and it is an optimization rather
# than a correctness mechanism: expiry is evaluated lazily on every read, so a sweep that
# has not run for a day degrades notification timeliness and nothing else. That is why the
# alarm below is a warning and not a page.
# ---------------------------------------------------------------------------------------

resource "aws_lambda_function" "sweep" {
  function_name = var.function_name
  role          = var.execution_role_arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  memory_size   = 256
  # Comfortably more than one HTTP call, and far less than the hourly cadence.
  timeout          = 60
  filename         = var.artifact_path
  source_code_hash = try(filebase64sha256(var.artifact_path), null)

  environment {
    variables = {
      APP_BASE_URL        = var.app_base_url
      INTERNAL_SECRET_ARN = var.internal_secret_arn
      ENVIRONMENT         = var.env
    }
  }
}

resource "aws_scheduler_schedule" "sweep" {
  name       = "${var.prefix}-envelope-sweep"
  group_name = "default"

  flexible_time_window {
    # No flexibility: reminders and expiry are hour-granular, and a flexible window would
    # only make "did it run?" harder to answer.
    mode = "OFF"
  }

  schedule_expression          = "cron(0 * * * ? *)"
  schedule_expression_timezone = "UTC"

  target {
    arn      = aws_lambda_function.sweep.arn
    role_arn = var.scheduler_role_arn

    retry_policy {
      maximum_retry_attempts       = 2
      maximum_event_age_in_seconds = 3600
    }
  }
}

# ---------------------------------------------------------------------------------------
# Sweep failure alarm
#
# Two consecutive failures, not one: a single failed invocation is a transient API blip
# that the next hour's run makes irrelevant, and paging on it would train everyone to
# ignore this alarm.
# ---------------------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "sweep_failures" {
  alarm_name          = "${var.function_name}-failing"
  alarm_description   = "The envelope sweep failed twice in a row. Reminders and expiry notices are late; envelope correctness is unaffected."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]

  dimensions = {
    FunctionName = aws_lambda_function.sweep.function_name
  }
}

output "function_arn" {
  description = "ARN of the sweep function."
  value       = aws_lambda_function.sweep.arn
}

output "function_name" {
  description = "Name of the sweep function."
  value       = aws_lambda_function.sweep.function_name
}

output "schedule_name" {
  description = "EventBridge schedule driving the sweep."
  value       = aws_scheduler_schedule.sweep.name
}
