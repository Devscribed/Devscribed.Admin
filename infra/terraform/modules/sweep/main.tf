terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.38"
    }
  }
}

# The hourly sweep: materialises envelope expiry and sends the halfway reminders.
#
# Spec 02 is explicit that this is an optimisation and never correctness — expiry is
# lazily authoritative, so an envelope past its date is treated as expired the moment
# anyone looks at it, whether or not this ever runs. That is why a missed hour is not an
# incident.
#
# **It is a container task, not a Lambda.** The spec assumed a Lambda because the
# application was going to Vercel; here the API has no public address, so anything calling
# it must live inside the VPC. A VPC Lambda would mean a zip artifact to build, version,
# and keep in step with the API it calls. An ECS task started from the API's *own image*
# has none of that: same image, same secrets, nothing extra to keep in step. It costs
# roughly three cents a month.

variable "prefix" {
  description = "Name prefix shared by every resource in this environment."
  type        = string
}

variable "aws_region" {
  description = "Region the task runs in."
  type        = string
}

variable "cluster_arn" {
  description = "Cluster the task runs on."
  type        = string
}

variable "image" {
  description = "The API image. The sweep runs from it so the two can never diverge."
  type        = string
}

variable "api_internal_origin" {
  description = "Where the API answers inside the VPC."
  type        = string
}

variable "subnet_ids" {
  description = "Subnets the task runs in. Must reach the API's Cloud Map records."
  type        = list(string)
}

variable "security_group_id" {
  description = "The API's security group — which is what the API's own ingress rule admits."
  type        = string
}

variable "execution_role_arn" {
  description = "Execution role: pulls the image, resolves the bearer token."
  type        = string
}

variable "task_role_arn" {
  description = "Task role. The sweep calls no AWS API, but a task definition needs one to be auditable."
  type        = string
}

variable "internal_task_secret_arn" {
  description = "SSM parameter holding the bearer token the API's internal guard checks."
  type        = string
}

variable "log_group_name" {
  description = "CloudWatch group the task writes to."
  type        = string
}

variable "schedule_expression" {
  description = "How often the sweep runs."
  type        = string
  default     = "rate(1 hour)"
}

variable "enabled" {
  description = "Whether the schedule is armed. A paused environment does not need it."
  type        = bool
  default     = true
}

locals {
  # Node 22 has fetch built in, so this needs nothing from node_modules — which is what
  # lets the sweep reuse the API image without caring what is installed in it.
  sweep_script = join("", [
    "const url=process.env.SWEEP_URL;",
    "fetch(url,{method:'POST',headers:{authorization:'Bearer '+process.env.INTERNAL_TASK_SECRET}})",
    ".then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})",
    ".catch(e=>{console.error(e);process.exit(1)});",
  ])
}

resource "aws_ecs_task_definition" "sweep" {
  family                   = "${var.prefix}-sweep"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name      = "sweep"
    image     = var.image
    essential = true
    command   = ["node", "-e", local.sweep_script]

    environment = [
      { name = "SWEEP_URL", value = "${var.api_internal_origin}/api/internal/envelopes/sweep" },
    ]

    secrets = [
      { name = "INTERNAL_TASK_SECRET", valueFrom = var.internal_task_secret_arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = var.log_group_name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "sweep"
      }
    }
  }])
}

# ---------------------------------------------------------------------------------------
# The schedule
# ---------------------------------------------------------------------------------------

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

data "aws_caller_identity" "current" {}

resource "aws_iam_role" "scheduler" {
  name               = "${var.prefix}-sweep-scheduler"
  description        = "Lets EventBridge Scheduler start the sweep task, and nothing else."
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    sid     = "RunTheSweepTask"
    actions = ["ecs:RunTask"]
    # Every revision of this one family, and no other. `:*` is the revision wildcard —
    # without it the policy would have to be rewritten on every task definition change.
    resources = ["${replace(aws_ecs_task_definition.sweep.arn, "/:\\d+$/", "")}:*"]

    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [var.cluster_arn]
    }
  }

  # RunTask hands the task its execution and task roles, which IAM treats as a privilege
  # escalation unless it is granted explicitly. Only these two roles.
  statement {
    sid       = "PassTheTaskRoles"
    actions   = ["iam:PassRole"]
    resources = [var.execution_role_arn, var.task_role_arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "run-sweep"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}

resource "aws_scheduler_schedule" "sweep" {
  name       = "${var.prefix}-sweep"
  state      = var.enabled ? "ENABLED" : "DISABLED"
  group_name = "default"

  flexible_time_window {
    # Fifteen minutes of slack. Nothing here is time-critical to the minute, and a flexible
    # window lets AWS spread the invocation rather than joining the top-of-the-hour rush.
    mode                      = "FLEXIBLE"
    maximum_window_in_minutes = 15
  }

  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = "UTC"

  target {
    arn      = var.cluster_arn
    role_arn = aws_iam_role.scheduler.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.sweep.arn
      launch_type         = "FARGATE"
      task_count          = 1

      network_configuration {
        subnets          = var.subnet_ids
        security_groups  = [var.security_group_id]
        assign_public_ip = true
      }
    }

    retry_policy {
      # Two attempts, then let it go. The next hour's run does the same work, and expiry
      # is authoritative on read regardless — retrying harder would only pile up tasks.
      maximum_retry_attempts       = 2
      maximum_event_age_in_seconds = 3600
    }
  }
}

output "task_definition_arn" {
  description = "The sweep task definition."
  value       = aws_ecs_task_definition.sweep.arn
}

output "schedule_name" {
  description = "Name of the hourly schedule."
  value       = aws_scheduler_schedule.sweep.name
}
