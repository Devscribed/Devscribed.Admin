terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.38"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# The cluster, the private namespace the web app finds the API through, the log groups,
# and the two application secrets. The services themselves are in api.tf and web.tf.

resource "aws_ecs_cluster" "main" {
  name = var.prefix

  setting {
    name = "containerInsights"
    # Container Insights bills per metric per task and answers questions this product is
    # not asking yet. The task-level CloudWatch metrics ECS publishes for free are what
    # the autoscaling policies below actually read.
    value = "disabled"
  }
}

# ---------------------------------------------------------------------------------------
# Service discovery
#
# This is what makes the API reachable without ever giving it a public address. Cloud Map
# keeps an A record per running task; the web container resolves it through the Next.js
# rewrite that already exists for local development, so the browser only ever talks to one
# origin and the session cookie stays same-origin with no CORS involved.
#
# **This address is baked into the web image at build time, not read at run time.** Next
# resolves `rewrites()` during `next build` and writes the destination into
# routes-manifest.json; the standalone server serves from that manifest and never consults
# the environment again. Setting API_ORIGIN on the running task looks correct, changes
# nothing, and produces a web app that proxies to localhost and answers 500 to every API
# call. It is published as the `api_internal_origin` output, and `infra/deploy.sh` passes
# that output straight into `docker build --build-arg`, so the address the image was built
# with and the address DNS answers on come from the same place and cannot drift.
#
# The name is a static string rather than a reference to the API service, which is what
# breaks what would otherwise be a dependency cycle: the API needs the web service's
# public URL for its signing links.
# ---------------------------------------------------------------------------------------

resource "aws_service_discovery_private_dns_namespace" "internal" {
  name        = var.internal_namespace
  description = "Private DNS for ${var.env}. Resolvable only inside this VPC."
  vpc         = var.vpc_id
}

resource "aws_service_discovery_service" "api" {
  name = "api"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.internal.id

    dns_records {
      # Short, because the record set changes every time a task is replaced and a stale
      # answer sends the web app at an address that no longer exists.
      ttl  = 10
      type = "A"
    }

    # MULTIVALUE returns every healthy task's address, which is how a second API task
    # gets traffic at all — there is no load balancer in front of this service.
    routing_policy = "MULTIVALUE"
  }

  # Its presence is what tells Cloud Map that something else decides health. ECS is that
  # something else — Cloud Map's own checks cannot reach a task with no public address, and
  # a second opinion could only ever disagree.
  health_check_custom_config {
    # Deprecated by AWS, which always stores 1. Kept so the block is non-empty and reads as
    # deliberate.
    failure_threshold = 1
  }

  lifecycle {
    # The provider does not read this block back from AWS on refresh, so it is absent from
    # state after the first apply and every subsequent plan sees it as *added* — which
    # forces a replacement of this resource. That replacement then deadlocks: AWS refuses to
    # delete a Cloud Map service while the API's tasks are still registered in it, so the
    # apply fails partway with `DeleteService: ResourceInUse` and leaves the environment
    # half-updated. Ignoring it is what makes a second apply a no-op instead of an outage.
    ignore_changes = [health_check_custom_config]
  }
}

# ---------------------------------------------------------------------------------------
# Application secrets
#
# Generated here and never written down anywhere else. Terraform creates the value, the
# container reads it through the execution role, and no human ever sees either — which is
# the point: a secret a person knows is a secret that ends up in a chat message.
#
# Rotating one is `terraform taint` on the resource plus a redeploy. For SESSION_SECRET
# that invalidates every session, which is the intended effect of rotating it.
# ---------------------------------------------------------------------------------------

resource "random_password" "session_secret" {
  length  = 64
  special = false
}

resource "aws_ssm_parameter" "session_secret" {
  name        = "/${var.prefix}/SESSION_SECRET"
  description = "Signs the session cookie. Rotating it logs everyone out."
  type        = "SecureString"
  value       = random_password.session_secret.result
}

resource "random_password" "internal_task_secret" {
  length  = 64
  special = false
}

resource "aws_ssm_parameter" "internal_task_secret" {
  name        = "/${var.prefix}/INTERNAL_TASK_SECRET"
  description = "Bearer token for POST /api/internal/envelopes/sweep. Never reaches a browser."
  type        = "SecureString"
  value       = random_password.internal_task_secret.result
}

# The token that opens the `/api/test/*` fixtures — the mail sink an E2E run reads a
# signing link from, the role switch, the membership move, and the envelope-expiry write.
# Created only where the fixtures are open. Its own secret rather than a reuse of
# INTERNAL_TASK_SECRET: the two protect different things, and a token that leaks through a
# test path must not also hand over the sweep endpoint.
resource "random_password" "test_fixture_secret" {
  count   = var.test_fixtures_enabled ? 1 : 0
  length  = 64
  special = false
}

resource "aws_ssm_parameter" "test_fixture_secret" {
  count       = var.test_fixtures_enabled ? 1 : 0
  name        = "/${var.prefix}/TEST_FIXTURE_SECRET"
  description = "Opens /api/test/* on this environment. Holding it means reading every signing link."
  type        = "SecureString"
  value       = random_password.test_fixture_secret[0].result
}

# ---------------------------------------------------------------------------------------
# SignWell — documents spec 04
#
# Two parameters this module creates and whose values it never holds. Everything above is
# generated by Terraform because the product owns the secret; these two belong to a third
# party, so the shape is the other one the spec names: **Terraform creates the parameter
# and the policy that reads it, never the value**, and no vendor credential reaches the
# state file or a .tfvars. Writing one is an out-of-band act:
#
#   aws ssm put-parameter --type SecureString --overwrite --name /devscribed-dev/SIGNWELL_API_KEY --value '<the key>'
#
# followed by `signwell_secrets_provisioned = true` in this environment's tfvars and a
# redeploy. `ignore_changes` is what makes that write durable: without it the next apply
# would put the placeholder back and silently revoke the integration.
#
# The placeholder is why the parameters are created here but injected into the task only
# once the flag says the values are real. `SigningProviderRegistry.missingConfiguration`
# asks whether the variable is *present*, so handing the container a placeholder would
# make the settings screen report SignWell configured when it is not — turning requirement
# 32's gate into a lie and a missing key into a 503 at send instead of a disabled radio
# that names what is absent (edge case 16).
# ---------------------------------------------------------------------------------------

resource "aws_ssm_parameter" "signwell_api_key" {
  name        = "/${var.prefix}/SIGNWELL_API_KEY"
  description = "SignWell API key. It can create and destroy real contracts. Written out of band."
  type        = "SecureString"
  value       = "placeholder-write-me-out-of-band"

  lifecycle {
    ignore_changes = [value]
  }
}

# The webhook id, which *is* the only input to hash verification — a secret because of what
# it gates, while being an identifier `GET /api/v1/hooks` hands to any holder of the API
# key. Its value follows the registration, which is made by hand against a reachable
# address (see the Infrastructure section of the spec), so Terraform cannot know it either.
resource "aws_ssm_parameter" "signwell_webhook_secret" {
  name        = "/${var.prefix}/SIGNWELL_WEBHOOK_SECRET"
  description = "The registered SignWell webhook id. The only input to delivery hash verification."
  type        = "SecureString"
  value       = "placeholder-write-me-out-of-band"

  lifecycle {
    ignore_changes = [value]
  }
}

# ---------------------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${var.prefix}/web"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.prefix}/api"
  retention_in_days = var.log_retention_days
}

# Migrations get their own group rather than sharing the API's. A failed `migrate deploy`
# is looked for by date, not by grepping a stream that also carries every request the API
# served that day.
resource "aws_cloudwatch_log_group" "migrate" {
  name              = "/ecs/${var.prefix}/migrate"
  retention_in_days = var.log_retention_days
}

# The sweep runs hourly from the API's image; its output is a status line, and mixing it
# into the API's own stream would bury it.
resource "aws_cloudwatch_log_group" "sweep" {
  name              = "/ecs/${var.prefix}/sweep"
  retention_in_days = var.log_retention_days
}

locals {
  # Where the web container proxies /api/* to. Built from the namespace name, not from the
  # API service resource — see the cycle note above.
  api_internal_origin = "http://api.${aws_service_discovery_private_dns_namespace.internal.name}:${var.api_port}"

  # Express Mode reports its endpoint as a hostname in some paths and as a full URL in
  # others, and the application needs an absolute URL to build signing links from. Rather
  # than guess which, normalise.
  web_endpoint_raw = try(aws_ecs_express_gateway_service.web.ingress_paths[0].endpoint, "")
  app_public_url = local.web_endpoint_raw == "" ? "" : (
    startswith(local.web_endpoint_raw, "http") ? local.web_endpoint_raw : "https://${local.web_endpoint_raw}"
  )
}
