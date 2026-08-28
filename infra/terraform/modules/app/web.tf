# The web service — the only thing in this account with a public address.
#
# It is an ECS Express Mode service, which means AWS creates and owns the Application Load
# Balancer, its target group, its listener, the TLS certificate, the DNS name, and the
# scaling policy. What that buys is not convenience: it is the ~700 lines of Terraform
# those resources would otherwise be, and a public HTTPS endpoint on a domain we do not
# have to own. What it costs is named honestly in the two limits below.

locals {
  # Express Mode exposes no capacity provider strategy, so there is no Fargate Spot here
  # and no Graviton either — both are roughly a fifth off the compute bill, and both are
  # unavailable. That is the price of the paragraph above.
  #
  # **`API_ORIGIN` is deliberately NOT here**, and its absence cost an afternoon to find.
  # Next.js resolves `rewrites()` when it builds and writes the destination into
  # routes-manifest.json; the standalone server serves from that manifest and never reads
  # the environment variable again. Setting it on the task looks right, changes nothing,
  # and produces a web app that answers 500 to every /api/* call while proxying to
  # localhost. The address is baked by apps/web/Dockerfile instead, which is why the
  # namespace name carries no environment.
  web_environment = {
    NODE_ENV = "production"
    PORT     = tostring(var.web_port)
  }
}

resource "aws_ecs_express_gateway_service" "web" {
  service_name = "${var.prefix}-web"
  cluster      = aws_ecs_cluster.main.name

  execution_role_arn      = aws_iam_role.execution.arn
  infrastructure_role_arn = aws_iam_role.infrastructure.arn
  task_role_arn           = aws_iam_role.web_task.arn

  cpu    = tostring(var.web_cpu)
  memory = tostring(var.web_memory)

  # `/login` rather than a dedicated endpoint: the web app has no API routes and no server
  # actions by convention (see CLAUDE.md), and inventing one for a health check would be
  # the first exception to that rule. `/login` is a real page that renders without a
  # session and answers 200; `/` would not, because it redirects.
  health_check_path = "/login"

  primary_container {
    image          = var.web_image
    container_port = var.web_port

    aws_logs_configuration {
      log_group         = aws_cloudwatch_log_group.web.name
      log_stream_prefix = "web"
    }

    dynamic "environment" {
      for_each = local.web_environment
      content {
        name  = environment.key
        value = environment.value
      }
    }
  }

  network_configuration {
    subnets         = var.subnet_ids
    security_groups = [var.web_security_group_id]
  }

  scaling_target {
    min_task_count = var.desired_count_override != null ? var.desired_count_override : var.web_min_tasks
    # A ceiling of zero is not a valid scaling target, so a paused environment keeps a
    # ceiling of one and a floor of zero — which holds it at zero, since nothing scales up
    # without CPU to measure.
    max_task_count            = var.desired_count_override != null ? max(var.desired_count_override, 1) : var.web_max_tasks
    auto_scaling_metric       = "AVERAGE_CPU"
    auto_scaling_target_value = var.scaling_target_cpu
  }

  # An apply that returns before the service is healthy is an apply that reports success
  # for a broken deploy. This is what makes `make deploy-dev` a gate rather than a
  # suggestion — and what makes a bad image fail the pipeline instead of the pager.
  wait_for_steady_state = true

  # Not cosmetic. Deleting an Express service drains it, and if the execution role's
  # policies are destroyed first the service cannot pull or log during the drain and gets
  # stuck in DRAINING — a state that has to be cleared by hand.
  depends_on = [
    aws_iam_role_policy_attachment.execution_managed,
    aws_iam_role_policy_attachment.infrastructure_managed,
    aws_iam_role_policy.execution_secrets,
  ]
}
