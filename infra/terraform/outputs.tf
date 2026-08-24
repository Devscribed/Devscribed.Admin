# What the application is configured from.
#
# These are the values that become environment variables in Vercel — the deploy step is
# reading them out of `terraform output`, not copying them from the console. A name that
# exists only in someone's browser history is a name nobody can rebuild.

output "documents_bucket" {
  description = "DOCUMENTS_BUCKET"
  value       = module.storage.bucket_name
}

output "aws_region" {
  description = "AWS_REGION"
  value       = var.aws_region
}

output "documents_kms_key_arn" {
  description = "DOCUMENTS_KMS_KEY_ID. Also the key every kms:Decrypt in the audit trail names."
  value       = module.storage.kms_key_arn
}

output "access_log_bucket" {
  description = "Independent record of every object read."
  value       = module.storage.access_log_bucket
}

output "ses_configuration_set" {
  description = "SES_CONFIGURATION_SET"
  value       = module.mail.configuration_set_name
}

output "ses_identity_domain" {
  description = "Verified sending domain. MAIL_FROM must be an address inside it."
  value       = module.mail.identity_domain
}

output "ses_mail_from_domain" {
  description = "Custom MAIL FROM subdomain. Needs MX and SPF records before sending works."
  value       = module.mail.mail_from_domain
}

output "ses_dkim_tokens" {
  description = "DNS records to publish: {token}._domainkey.{domain} CNAME {token}.dkim.amazonses.com"
  value       = module.mail.dkim_tokens
}

output "ses_events_topic_arn" {
  description = "SNS topic carrying send, delivery, bounce, complaint, and reject events."
  value       = module.mail.events_topic_arn
}

output "ses_sandbox_expected" {
  description = <<-EOT
    Whether this environment is expected to still be in the SES sandbox. False for prod
    only once AWS has granted production access — a support request with lead time, which
    must be filed before the first real contract can be sent.
  EOT
  value       = module.mail.sandbox_expected
}

output "pdf_render_queue_url" {
  description = "PDF_RENDER_QUEUE_URL"
  value       = module.render.queue_url
}

output "pdf_render_dlq_url" {
  description = "Dead-letter queue. A message here means an envelope has PdfStatus=failed."
  value       = module.render.dlq_url
}

output "pdf_render_function" {
  description = "PDF_RENDER_FUNCTION"
  value       = module.render.function_arn
}

output "envelope_sweep_function" {
  description = "Function EventBridge invokes hourly."
  value       = module.sweep.function_arn
}

output "envelope_sweep_schedule" {
  description = "Name of the hourly schedule."
  value       = module.sweep.schedule_name
}

output "envelope_expiry_default_days" {
  description = "ENVELOPE_EXPIRY_DAYS"
  value       = var.envelope_expiry_default_days
}

output "api_role_arn" {
  description = "Role the API assumes from Vercel via OIDC. No static keys are issued."
  value       = module.iam.api_role_arn
}

output "render_role_arn" {
  description = "Execution role of the render function."
  value       = module.iam.render_role_arn
}

output "sweep_role_arn" {
  description = "Execution role of the sweep function."
  value       = module.iam.sweep_role_arn
}

output "internal_task_secret_arn" {
  description = <<-EOT
    Secret container for INTERNAL_TASK_SECRET. Terraform creates the container and the
    policies, never a value — so no secret can land in the state file. Set it out of band.
  EOT
  value       = module.iam.internal_task_secret_arn
}

output "signing_pepper_secret_arn" {
  description = "Secret container for the signing pepper. Value set out of band."
  value       = module.iam.signing_pepper_secret_arn
}

output "alarm_topic_arn" {
  description = "SNS topic every alarm publishes to. The email subscription needs confirming once."
  value       = module.observability.alarm_topic_arn
}
