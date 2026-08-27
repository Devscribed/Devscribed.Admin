# What a person or a Makefile needs after an apply.
#
# These are read by `make deploy-*`, `make migrate-*`, and `make url-*` rather than copied
# out of the console. A name that exists only in someone's browser history is a name
# nobody can rebuild.

output "app_url" {
  description = "The address people open. AWS-issued HTTPS; the only public entry point in the account."
  value       = module.app.app_url
}

output "cluster_name" {
  description = "ECS cluster holding both services, the migration task, and the sweep."
  value       = module.app.cluster_name
}

output "web_service_name" {
  description = "Express Mode service serving the browser."
  value       = module.app.web_service_name
}

output "api_service_name" {
  description = "API service. No load balancer, no public address."
  value       = module.app.api_service_name
}

output "api_internal_origin" {
  description = "Where the web app proxies /api/* to. Resolvable only inside the VPC."
  value       = module.app.api_internal_origin
}

output "web_repository_url" {
  description = "Push target for the web image."
  value       = module.registry.repository_urls["web"]
}

output "api_repository_url" {
  description = "Push target for the API image."
  value       = module.registry.repository_urls["api"]
}

output "web_image" {
  description = "Digest the web service is running. `make deploy-*-api` reads it to leave web alone."
  value       = module.app.web_image
}

output "api_image" {
  description = "Digest the API service, the migration task, and the sweep are running."
  value       = module.app.api_image
}

output "migrate_task_definition" {
  description = "Task definition `make migrate-<env>` runs."
  value       = module.app.migrate_task_definition
}

output "task_subnet_ids" {
  description = "Subnets a one-off task must start in to reach the database."
  value       = module.app.task_subnet_ids
}

output "task_security_group_id" {
  description = "Security group a one-off task must carry to reach the database."
  value       = module.app.api_security_group_id
}

output "database_endpoint" {
  description = "host:port. Reachable only from inside the VPC — there is no route to it from anywhere else."
  value       = module.database.endpoint
}

output "documents_bucket" {
  description = "Bucket holding signed documents."
  value       = module.storage.bucket_name
}

output "documents_kms_key_arn" {
  description = "Key every object is encrypted with, and the key every kms:Decrypt in the audit trail names."
  value       = module.storage.kms_key_arn
}

output "mail_from" {
  description = "Verified sending address. The only address this environment can send as."
  value       = module.mail.sender_email
}

output "ses_verification_pending" {
  description = <<-EOT
    Every address AWS has mailed a confirmation link to. Until each link is clicked, that
    address can neither send nor — while the account is sandboxed — receive.
  EOT
  value       = module.mail.verification_pending
}

output "ses_sandbox_expected" {
  description = <<-EOT
    Whether this environment is expected to still be sandboxed. While true, mail reaches
    only the verified addresses above. Leaving the sandbox is an AWS support request with
    lead time and must be filed before the first real contract is sent.
  EOT
  value       = module.mail.sandbox_expected
}

output "alarm_topic_arn" {
  description = "Topic every alarm publishes to. The email subscription needs confirming once."
  value       = module.observability.alarm_topic_arn
}

output "github_deploy_role_arn" {
  description = <<-EOT
    Role the GitHub workflow assumes. Set it as the repository variable named in
    .github/workflows/deploy.yml. The workflow stays disabled until DEPLOY_ENABLED is
    also set to true.
  EOT
  value       = module.cicd.deploy_role_arn
}

output "log_groups" {
  description = "Where each part of the system writes."
  value = {
    web     = module.app.web_log_group_name
    api     = module.app.api_log_group_name
    migrate = module.app.migrate_log_group_name
    sweep   = module.app.sweep_log_group_name
  }
}

output "test_mail_sink_parameter" {
  description = <<-EOT
    SSM parameter holding the token that reads `/api/test/mail`, or empty where mail is
    real. `make e2e-<env>` fetches it; nothing else should.
  EOT
  value       = module.app.test_mail_sink_parameter
}
