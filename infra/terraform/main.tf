# The only root module. Both environments are built from it, composed through
# `-backend-config` and `-var-file` — no workspaces, because a mistyped
# `terraform workspace select` is a one-keystroke path from a dev change to a prod bucket.

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  name       = "devscribed"
  prefix     = "${local.name}-${var.env}"

  documents_bucket = coalesce(
    var.documents_bucket,
    "${local.name}-documents-${var.env}-${local.account_id}",
  )

  app_base_url = coalesce(
    var.app_base_url,
    var.env == "prod" ? "https://admin.devscribed.com" : "https://dev.admin.devscribed.com",
  )

  render_function_name     = "${local.name}-pdf-render-${var.env}"
  sweep_function_name      = "${local.name}-envelope-sweep-${var.env}"
  ses_events_function_name = "${local.name}-ses-events-${var.env}"
  render_queue_name        = "${local.name}-pdf-render-${var.env}.fifo"

  # Built as a string rather than read from the render module, so that documents-iam can
  # be created before documents-render without a dependency cycle: the render module needs
  # the role ARN the IAM module produces, and the IAM module needs the queue this ARN
  # names. The name is deterministic, so the string is exact.
  render_queue_arn = "arn:aws:sqs:${var.aws_region}:${local.account_id}:${local.render_queue_name}"
}

# ---------------------------------------------------------------------------------------
# Storage — S3, the customer-managed key, lifecycle, Object Lock, access logs
# ---------------------------------------------------------------------------------------

module "storage" {
  source = "./modules/documents-storage"

  env               = var.env
  bucket_name       = local.documents_bucket
  object_lock_years = var.object_lock_years
  force_destroy     = var.bucket_force_destroy
  account_id        = local.account_id
}

# ---------------------------------------------------------------------------------------
# Mail — SES v2 identity, DKIM, custom MAIL FROM, configuration set, event topic
# ---------------------------------------------------------------------------------------

module "mail" {
  source = "./modules/documents-mail"

  env                 = var.env
  prefix              = local.prefix
  ses_domain          = var.ses_domain
  ses_sandbox         = var.ses_sandbox
  app_base_url        = local.app_base_url
  function_name       = local.ses_events_function_name
  artifact_path       = var.ses_events_artifact_path
  execution_role_arn  = module.iam.ses_events_role_arn
  internal_secret_arn = module.iam.internal_task_secret_arn
}

# ---------------------------------------------------------------------------------------
# Rendering — the queue that must never block a signing request, and the function
# ---------------------------------------------------------------------------------------

module "render" {
  source = "./modules/documents-render"

  env                  = var.env
  function_name        = local.render_function_name
  queue_name           = local.render_queue_name
  artifact_path        = var.render_artifact_path
  chromium_layer_path  = var.chromium_layer_path
  execution_role_arn   = module.iam.render_role_arn
  memory_mb            = var.render_memory_mb
  timeout_seconds      = var.render_timeout_seconds
  reserved_concurrency = var.render_reserved_concurrency
  documents_bucket     = module.storage.bucket_name
  kms_key_arn          = module.storage.kms_key_arn
  alarm_topic_arn      = module.observability.alarm_topic_arn
}

# ---------------------------------------------------------------------------------------
# Sweep — hourly expiry materialization and reminders. An optimization, never correctness.
# ---------------------------------------------------------------------------------------

module "sweep" {
  source = "./modules/documents-sweep"

  env                 = var.env
  prefix              = local.prefix
  function_name       = local.sweep_function_name
  artifact_path       = var.sweep_artifact_path
  execution_role_arn  = module.iam.sweep_role_arn
  scheduler_role_arn  = module.iam.scheduler_role_arn
  app_base_url        = local.app_base_url
  internal_secret_arn = module.iam.internal_task_secret_arn
  alarm_topic_arn     = module.observability.alarm_topic_arn
}

# ---------------------------------------------------------------------------------------
# IAM — three least-privilege roles, the secret containers, and the Vercel OIDC trust
# ---------------------------------------------------------------------------------------

module "iam" {
  source = "./modules/documents-iam"

  env                   = var.env
  prefix                = local.prefix
  account_id            = local.account_id
  aws_region            = var.aws_region
  documents_bucket_arn  = module.storage.bucket_arn
  kms_key_arn           = module.storage.kms_key_arn
  render_queue_arn      = local.render_queue_arn
  ses_domain            = var.ses_domain
  ses_configuration_set = "${local.prefix}-documents"
  sweep_function_name   = local.sweep_function_name
  vercel_oidc_issuer    = var.vercel_oidc_issuer
  vercel_team_slug      = var.vercel_team_slug
  vercel_project_name   = var.vercel_project_name
}

# ---------------------------------------------------------------------------------------
# Observability — log groups with retention, metric filters, alarms
# ---------------------------------------------------------------------------------------

module "observability" {
  source = "./modules/observability"

  env                = var.env
  prefix             = local.prefix
  alarm_email        = var.alarm_email
  log_retention_days = var.log_retention_days
  function_names = [
    local.render_function_name,
    local.sweep_function_name,
    local.ses_events_function_name,
  ]
  render_function_name = local.render_function_name
}
