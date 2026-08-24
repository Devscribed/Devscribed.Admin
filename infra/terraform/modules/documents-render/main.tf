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

variable "function_name" {
  description = "Name of the PDF render function."
  type        = string
}

variable "queue_name" {
  description = "Name of the FIFO render queue, including the .fifo suffix."
  type        = string
}

variable "artifact_path" {
  description = "Zip for the render function."
  type        = string
}

variable "chromium_layer_path" {
  description = "Zip for the Chromium layer."
  type        = string
}

variable "execution_role_arn" {
  description = "Execution role for the render function."
  type        = string
}

variable "memory_mb" {
  description = "Function memory."
  type        = number
}

variable "timeout_seconds" {
  description = "Function timeout. The queue's visibility timeout is 1.5x this."
  type        = number
}

variable "reserved_concurrency" {
  description = "Reserved concurrency for this environment."
  type        = number
}

variable "documents_bucket" {
  description = "Bucket the function reads render-tmp/ from and writes signed/ to."
  type        = string
}

variable "kms_key_arn" {
  description = "CMK the function must be able to use."
  type        = string
}

variable "alarm_topic_arn" {
  description = "Where the DLQ alarm goes."
  type        = string
}

# ---------------------------------------------------------------------------------------
# The queue
#
# FIFO with the envelope id as the group key is what makes requirement 29 — the PDF is
# written once — hold under retries: two deliveries of the same job cannot render the same
# envelope at once. Content-based deduplication collapses an identical redelivery inside
# the 5-minute window, so the producer sends no deduplication id.
# ---------------------------------------------------------------------------------------

resource "aws_sqs_queue" "render_dlq" {
  name                        = replace(var.queue_name, ".fifo", "-dlq.fifo")
  fifo_queue                  = true
  content_based_deduplication = true
  # 14 days: a job that lands here is a bug someone has to look at, and a weekend must not
  # be enough to lose the evidence.
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "render" {
  name                        = var.queue_name
  fifo_queue                  = true
  content_based_deduplication = true
  # 1.5x the function timeout, per the spec: long enough that a slow render is not
  # redelivered while it is still running.
  visibility_timeout_seconds = ceil(var.timeout_seconds * 1.5)
  message_retention_seconds  = 345600
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.render_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue_redrive_allow_policy" "render_dlq" {
  queue_url = aws_sqs_queue.render_dlq.id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.render.arn]
  })
}

# ---------------------------------------------------------------------------------------
# The function
#
# It lives in Lambda rather than in the API process for exactly one reason: the API
# deploys to Vercel, where a Chromium binary does not fit the function bundle. That single
# constraint is why `PdfRenderer` is an abstraction at all.
# ---------------------------------------------------------------------------------------

resource "aws_lambda_layer_version" "chromium" {
  layer_name          = "devscribed-chromium-${var.env}"
  description         = "Chromium (@sparticuz/chromium) plus a font with full Cyrillic coverage."
  compatible_runtimes = ["nodejs22.x"]
  filename            = var.chromium_layer_path
  source_code_hash    = try(filebase64sha256(var.chromium_layer_path), null)
}

resource "aws_lambda_function" "render" {
  function_name = var.function_name
  role          = var.execution_role_arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  memory_size   = var.memory_mb
  timeout       = var.timeout_seconds
  layers        = [aws_lambda_layer_version.chromium.arn]
  filename      = var.artifact_path
  # `try` so validate and a plan on a machine that has not built the artifact both work.
  source_code_hash = try(filebase64sha256(var.artifact_path), null)

  # No VPC. The function needs no private resource, and a VPC attachment would only add
  # cold-start latency to the one CPU-heavy path in the product.
  reserved_concurrent_executions = var.reserved_concurrency

  environment {
    variables = {
      DOCUMENTS_BUCKET = var.documents_bucket
      KMS_KEY_ARN      = var.kms_key_arn
      ENVIRONMENT      = var.env
    }
  }
}

resource "aws_lambda_event_source_mapping" "render" {
  event_source_arn = aws_sqs_queue.render.arn
  function_name    = aws_lambda_function.render.arn
  # One message at a time. Batching would put two envelopes in one invocation and make a
  # single render failure fail the other envelope's job with it.
  batch_size                         = 1
  maximum_batching_window_in_seconds = 0
  function_response_types            = ["ReportBatchItemFailures"]
}

# ---------------------------------------------------------------------------------------
# DLQ alarm
#
# Any message at all is the alarm condition. A job in the dead-letter queue means an
# envelope is `completed` with `PdfStatus = failed` — the signatures are safe, but a
# person is waiting for a document that is not coming.
# ---------------------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "render_dlq_depth" {
  alarm_name          = "${var.function_name}-dlq-not-empty"
  alarm_description   = "A PDF render job exhausted its retries. An envelope has PdfStatus=failed."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]

  dimensions = {
    QueueName = aws_sqs_queue.render_dlq.name
  }
}

output "queue_url" {
  description = "PDF_RENDER_QUEUE_URL for the API."
  value       = aws_sqs_queue.render.url
}

output "queue_arn" {
  description = "ARN of the render queue."
  value       = aws_sqs_queue.render.arn
}

output "dlq_url" {
  description = "Dead-letter queue, for redriving a fixed render."
  value       = aws_sqs_queue.render_dlq.url
}

output "function_arn" {
  description = "PDF_RENDER_FUNCTION for the API's synchronous preview path."
  value       = aws_lambda_function.render.arn
}

output "function_name" {
  description = "Name of the render function."
  value       = aws_lambda_function.render.function_name
}
