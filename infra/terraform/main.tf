# The only root module. Both environments are built from it, composed through
# `-backend-config` and `-var-file` — no workspaces, because a mistyped
# `terraform workspace select` is a one-keystroke path from a dev change to a prod bucket.
#
# The shape, in one paragraph: a VPC with no NAT Gateway; an ECS cluster running two
# services; the web app on ECS Express Mode, which is the only public address in the
# account and carries AWS's own HTTPS certificate; the API on a plain service with no load
# balancer at all, reached only by the web app's existing Next.js rewrite through Cloud
# Map; Postgres on RDS in subnets with no route to the internet; signed documents in S3
# under a customer-managed key; mail through SES; and an hourly sweep that is a container
# task rather than a Lambda, so it runs the same image as the API it calls.

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  name       = "devscribed"
  prefix     = "${local.name}-${var.env}"

  documents_bucket = coalesce(
    var.documents_bucket,
    "${local.name}-documents-${var.env}-${local.account_id}",
  )

  # A plain `terraform apply` with no images given runs whatever `latest` points at. The
  # deploy targets in the Makefile always pass a digest instead, so a real deploy never
  # depends on where a tag happens to be pointing.
  web_image = coalesce(var.web_image, "${module.registry.repository_urls["web"]}:latest")
  api_image = coalesce(var.api_image, "${module.registry.repository_urls["api"]}:latest")

  # 15% of provisioned storage. Below that, autoscaling has either not fired or has hit
  # its own ceiling, and both are worth knowing about.
  db_free_storage_threshold = var.db_allocated_storage * 1024 * 1024 * 1024 * 0.15
}

module "network" {
  source = "./modules/network"

  env                = var.env
  prefix             = local.prefix
  cidr_block         = var.vpc_cidr
  availability_zones = var.availability_zones
  app_port           = var.web_port
  api_port           = var.api_port
}

module "registry" {
  source = "./modules/registry"

  prefix          = local.prefix
  services        = ["web", "api"]
  retained_images = var.retained_images
  force_destroy   = var.bucket_force_destroy
}

module "database" {
  source = "./modules/database"

  env                   = var.env
  prefix                = local.prefix
  instance_class        = var.db_instance_class
  engine_version        = var.db_engine_version
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  multi_az              = var.db_multi_az
  backup_retention_days = var.db_backup_retention_days
  deletion_protection   = var.db_deletion_protection
  skip_final_snapshot   = var.db_skip_final_snapshot
  subnet_ids            = module.network.private_subnet_ids
  security_group_ids    = [module.network.database_security_group_id]
  ssl_root_cert_path    = var.ssl_root_cert_path
}

module "storage" {
  source = "./modules/storage"

  env               = var.env
  bucket_name       = local.documents_bucket
  object_lock_years = var.object_lock_years
  force_destroy     = var.bucket_force_destroy
  account_id        = local.account_id
}

module "mail" {
  source = "./modules/mail"

  env                       = var.env
  prefix                    = local.prefix
  sender_email              = var.sender_email
  verified_emails           = var.verified_emails
  sandbox_expected          = var.ses_sandbox_expected
  bounce_notification_email = var.alarm_email
}

module "app" {
  source = "./modules/app"

  env        = var.env
  prefix     = local.prefix
  aws_region = var.aws_region

  vpc_id                = module.network.vpc_id
  subnet_ids            = module.network.public_subnet_ids
  web_security_group_id = module.network.web_security_group_id
  api_security_group_id = module.network.api_security_group_id

  web_image = local.web_image
  api_image = local.api_image

  web_cpu                = var.web_cpu
  web_memory             = var.web_memory
  api_cpu                = var.api_cpu
  api_memory             = var.api_memory
  web_min_tasks          = var.web_min_tasks
  web_max_tasks          = var.web_max_tasks
  api_min_tasks          = var.api_min_tasks
  api_max_tasks          = var.api_max_tasks
  scaling_target_cpu     = var.scaling_target_cpu
  desired_count_override = var.desired_count_override

  internal_namespace = "${local.prefix}.internal"
  web_port           = var.web_port
  api_port           = var.api_port
  log_retention_days = var.log_retention_days

  documents_bucket      = module.storage.bucket_name
  documents_bucket_arn  = module.storage.bucket_arn
  documents_kms_key_arn = module.storage.kms_key_arn

  mail_from             = module.mail.sender_email
  ses_configuration_set = module.mail.configuration_set_name
  ses_identity_arn      = module.mail.sender_identity_arn

  database_url_parameter_arn = module.database.database_url_parameter_arn
  direct_url_parameter_arn   = module.database.direct_url_parameter_arn

  signing_token_ttl_days = var.signing_token_ttl_days
  envelope_expiry_days   = var.envelope_expiry_days

  signwell_api_application_id  = var.signwell_api_application_id
  signwell_secrets_provisioned = var.signwell_secrets_provisioned

  test_fixtures_enabled = var.test_fixtures_enabled

  # Hiring's storage and calendar, read as given in every environment. See the
  # variables' descriptions for what fs and fake cost.
  hiring_storage_provider = var.hiring_storage_provider
  hiring_storage_fs_root  = var.hiring_storage_fs_root
  calendar_provider       = var.calendar_provider
}

module "sweep" {
  source = "./modules/sweep"

  prefix     = local.prefix
  aws_region = var.aws_region

  cluster_arn         = "arn:aws:ecs:${var.aws_region}:${local.account_id}:cluster/${module.app.cluster_name}"
  image               = local.api_image
  api_internal_origin = module.app.api_internal_origin
  subnet_ids          = module.app.task_subnet_ids
  security_group_id   = module.app.api_security_group_id

  execution_role_arn       = module.app.execution_role_arn
  task_role_arn            = module.app.api_task_role_arn
  internal_task_secret_arn = module.app.internal_task_secret_arn
  log_group_name           = module.app.sweep_log_group_name

  enabled = var.sweep_enabled && var.desired_count_override != 0
}

module "observability" {
  source = "./modules/observability"

  env         = var.env
  prefix      = local.prefix
  alarm_email = var.alarm_email

  cluster_name       = module.app.cluster_name
  web_service_name   = module.app.web_service_name
  api_service_name   = module.app.api_service_name
  api_log_group_name = module.app.api_log_group_name

  db_instance_identifier          = module.database.instance_identifier
  db_free_storage_bytes_threshold = local.db_free_storage_threshold

  # A stopped environment is not a broken one. Scaling to zero on purpose and then paging
  # about zero running tasks is how an alarm becomes something people mute.
  alarms_enabled = var.alarms_enabled && var.desired_count_override != 0
}

module "cicd" {
  source = "./modules/cicd"

  env                  = var.env
  prefix               = local.prefix
  github_repository    = var.github_repository
  allowed_refs         = var.github_allowed_refs
  create_oidc_provider = var.create_github_oidc_provider

  cluster_arn                 = "arn:aws:ecs:${var.aws_region}:${local.account_id}:cluster/${module.app.cluster_name}"
  ecr_repository_arns         = module.registry.repository_arns
  execution_role_arn          = module.app.execution_role_arn
  task_role_arn               = module.app.api_task_role_arn
  migrate_task_definition_arn = module.app.migrate_task_definition
  # Derived rather than an input: it is the bucket the backend config already names, and
  # two places holding the same bucket name is one place to get it wrong.
  state_bucket = "devscribed-tfstate-${local.account_id}"
}
