# The API service — a plain ECS service, on purpose.
#
# Express Mode was the right answer for the web app because the web app needs a public
# HTTPS endpoint. The API needs the opposite: it must not have one. Every route it serves
# is either behind a session or behind a signing token, and the signing links themselves
# point at the *web* app, so there is no request in this product that has to arrive at the
# API from outside the VPC.
#
# Express Mode always builds a load balancer, and it owns that load balancer's security
# group, which means we could not have closed it. So this service has no load balancer at
# all: Cloud Map publishes an A record per task, and the web app's Next.js rewrite is the
# only thing that resolves it. That removes an internet-facing surface *and* the second
# target group's worth of load balancer capacity units.

locals {
  api_environment = {
    NODE_ENV = "production"
    PORT     = tostring(var.api_port)

    # CORS. Unused in practice — every browser request arrives through the web app's
    # same-origin rewrite — but a wrong value here would be invisible until the day
    # someone calls the API directly, so it names the real origin.
    WEB_ORIGIN = local.app_public_url

    # Signing links and download URLs are built from this. A wrong value produces mail
    # that reaches people and links that reach nobody.
    APP_PUBLIC_URL = local.app_public_url

    AWS_REGION = var.aws_region

    # Ports, each choosing its production driver. The local defaults these override are
    # documented in apps/api/.env.example.
    STORAGE_DRIVER   = "s3"
    DOCUMENTS_BUCKET = var.documents_bucket

    # `memory` on the dev stand, where mail is simulated because no provider exists yet —
    # see `test_fixtures_enabled`. Everywhere else this is the real transport.
    MAIL_TRANSPORT        = var.test_fixtures_enabled ? "memory" : "ses"
    MAIL_FROM             = var.mail_from
    SES_CONFIGURATION_SET = var.ses_configuration_set

    # In-process, not a Lambda. The spec's render function existed because a Vercel
    # function could not carry a browser; this container can and does, so the queue and
    # the function it fed are both gone. See the deviation note in specs/documents.
    PDF_RENDERER = "local-chromium"
    JOB_QUEUE    = "inline"

    # SIGNATURE_PROVIDER used to name the one adapter resolved at boot. Documents spec 04
    # removed the variable and the function that read it: which provider signs an envelope
    # is now an organization setting read at send, and which adapters exist is decided by
    # whether their configuration is present. Nothing in the image reads it any more, so
    # leaving it here would describe a decision the code no longer makes.

    SIGNING_TOKEN_TTL_DAYS = tostring(var.signing_token_ttl_days)
    ENVELOPE_EXPIRY_DAYS   = tostring(var.envelope_expiry_days)

    # ---------------------------------------------------------------------------------
    # SignWell — documents spec 04. The plain half; the two secrets are in api_secrets.
    # ---------------------------------------------------------------------------------

    # Names a branding profile so a counterparty signing our contract sees our colours and
    # logo rather than SignWell's default. Not a secret, and one of the three values the
    # product checks for presence — empty until the profile exists, which is what keeps
    # the settings screen honest about what is missing.
    SIGNWELL_API_APPLICATION_ID = var.signwell_api_application_id

    # Written here rather than taken from a tfvars, and both environments read this one
    # line. Going live is a deliberate change with a legal review of the counterparty-facing
    # copy — not a side effect of deploying — and a per-environment value would let a
    # tfvars edit spend real money. The API refuses to boot on a value that does not parse
    # as a boolean (validation rule 6), because defaulting to false would send real
    # contracts on a typo.
    SIGNWELL_TEST_MODE = "true"

    # How stale a remote envelope's last sync may be before a read re-fetches it. Behaviour
    # affecting, so it is identical in both environments: an environment that converges on a
    # different schedule from production is not a test of production.
    PROVIDER_SYNC_STALE_SECONDS = "120"
  }

  api_secrets = merge(
    {
      DATABASE_URL         = var.database_url_parameter_arn
      DIRECT_URL           = var.direct_url_parameter_arn
      SESSION_SECRET       = aws_ssm_parameter.session_secret.arn
      INTERNAL_TASK_SECRET = aws_ssm_parameter.internal_task_secret.arn
    },
    # Absent unless the fixtures are open, so the container has no token to check against
    # and every /api/test/* route stays shut on its own.
    var.test_fixtures_enabled ? {
      TEST_FIXTURE_SECRET = aws_ssm_parameter.test_fixture_secret[0].arn
    } : {},
    # Absent until someone has written the values the parameters were created to hold —
    # see the note beside the resources in main.tf. Absent is the honest state and the
    # product is built for it: the registry reads these two at call time, so the SignWell
    # row on the settings screen is listed, disabled, and names exactly what is missing
    # (requirement 32), rather than offering an option whose every send would fail.
    var.signwell_secrets_provisioned ? {
      SIGNWELL_API_KEY        = aws_ssm_parameter.signwell_api_key.arn
      SIGNWELL_WEBHOOK_SECRET = aws_ssm_parameter.signwell_webhook_secret.arn
    } : {},
  )

  api_container = {
    name      = "api"
    image     = var.api_image
    essential = true

    portMappings = [{
      containerPort = var.api_port
      protocol      = "tcp"
    }]

    environment = [for k, v in local.api_environment : { name = k, value = v }]
    secrets     = [for k, v in local.api_secrets : { name = k, valueFrom = v }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "api"
      }
    }

    # There is no load balancer to notice a wedged task, so the container checks itself.
    # This is the same shallow liveness endpoint the web service's balancer would have
    # used, and it deliberately does not touch the database — see the comment on
    # HealthController.
    healthCheck = {
      command     = ["CMD-SHELL", "node -e \"require('http').get('http://127.0.0.1:${var.api_port}/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))\""]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.prefix}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.api_cpu)
  memory                   = tostring(var.api_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.api_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    # x86_64 rather than ARM64, and this one is not a preference. The web service runs on
    # Express Mode, which exposes no architecture setting and therefore runs x86_64; two
    # architectures would mean two image builds of every service for a saving of about a
    # dollar a month.
    cpu_architecture = "X86_64"
  }

  container_definitions = jsonencode([local.api_container])
}

resource "aws_ecs_service" "api" {
  name            = "${var.prefix}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  launch_type     = "FARGATE"

  desired_count = var.desired_count_override != null ? var.desired_count_override : var.api_min_tasks

  network_configuration {
    subnets         = var.subnet_ids
    security_groups = [var.api_security_group_id]
    # Public subnet, public address, no NAT Gateway — the trade the network module
    # explains. The security group is what makes it unreachable from outside.
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.api.arn
  }

  # A single task must be replaceable without a window where none is running, and two
  # tasks must not both go down at once. 100/200 lets ECS start the replacement before
  # stopping the incumbent.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable = true
    # A deploy that never goes healthy rolls back to the previous task definition instead
    # of sitting half-deployed until somebody notices.
    rollback = true
  }

  wait_for_steady_state = true

  # `aws ecs execute-command` — a shell in a running task, for the times when the logs do
  # not answer the question. Audited in CloudTrail; the task role carries the SSM channel
  # permissions it needs.
  enable_execute_command = true

  # Autoscaling owns this number after the first apply. Without the exclusion, every
  # subsequent plan would propose scaling the service back down to its floor.
  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [
    aws_iam_role_policy_attachment.execution_managed,
    aws_iam_role_policy.execution_secrets,
  ]
}

# ---------------------------------------------------------------------------------------
# Autoscaling
#
# Express Mode builds this for the web service; the API is a plain service, so it is
# written out here. Same metric and same target value, so the two halves of the
# application respond to load the same way.
# ---------------------------------------------------------------------------------------

resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.desired_count_override != null ? var.desired_count_override : var.api_min_tasks

  # A ceiling of one while the fixtures are open, and this is correctness rather than
  # thrift. The mail sink lives in the API process's memory, so a second task owns a second,
  # different outbox — and a test that sends an invitation through one task and then reads
  # for it through the other finds nothing, intermittently, under load. Capping the service
  # is the only way to make that read deterministic.
  max_capacity = (
    var.desired_count_override != null ? max(var.desired_count_override, 1) :
    var.test_fixtures_enabled ? 1 : var.api_max_tasks
  )
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${var.prefix}-api-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value = var.scaling_target_cpu

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    # Scale out quickly, scale in slowly. A PDF render is a CPU spike that ends; removing
    # a task ninety seconds into one would kill it.
    scale_out_cooldown = 60
    scale_in_cooldown  = 300
  }
}

# ---------------------------------------------------------------------------------------
# Migrations
#
# The database has no route to the internet, so `prisma migrate deploy` cannot be run from
# a laptop or from a GitHub runner. It runs as a one-off task inside the VPC, from the
# same image the API runs, carrying the same secrets — which means the migration and the
# code that depends on it can never be built from different commits.
#
# It is only ever started by `make migrate-<env>`, never by a service.
# ---------------------------------------------------------------------------------------

resource "aws_ecs_task_definition" "migrate" {
  family                   = "${var.prefix}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.api_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name      = "migrate"
    image     = var.api_image
    essential = true
    # `migrate deploy` and never `migrate dev`: deploy applies the migrations that are in
    # the repository and refuses to invent one, which is the only safe verb against a
    # database that holds signed contracts.
    command = ["npx", "prisma", "migrate", "deploy"]

    environment = [
      { name = "NODE_ENV", value = "production" },
    ]

    secrets = [
      { name = "DATABASE_URL", valueFrom = var.database_url_parameter_arn },
      { name = "DIRECT_URL", valueFrom = var.direct_url_parameter_arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.migrate.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "migrate"
      }
    }
  }])
}
