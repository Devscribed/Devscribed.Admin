# Every input, with a type and a description.
#
# The inputs that DIFFER between dev and prod are exactly the ones listed in the spec's
# "What differs between the environments" table, and they are the only ones set in
# environments/*.tfvars. Everything else has a default here precisely so it cannot drift
# between the two environments: a value that appears in both tfvars files is a value that
# can be edited in one of them by accident.

# ---------------------------------------------------------------------------------------
# Differs between environments — the spec's table, in its order
# ---------------------------------------------------------------------------------------

variable "env" {
  description = "Environment name. Suffixes every resource name."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.env)
    error_message = "env must be dev or prod. There are two environments and no workspaces."
  }
}

variable "documents_bucket" {
  description = <<-EOT
    Name of the signed-documents bucket. Leave null to derive
    `devscribed-documents-{env}-{account}`, which is what both environments do — the
    account id is not knowable statically, and the only part that differs between the
    environments is `env`, exactly as the spec's table says.
  EOT
  type        = string
  default     = null
}

variable "object_lock_years" {
  description = <<-EOT
    Default Object Lock retention, in years, in GOVERNANCE mode. 0 disables Object Lock
    entirely — which is what dev does, because locked dev objects cannot be cleaned up and
    make the environment unusable within weeks.
  EOT
  type        = number

  validation {
    condition     = var.object_lock_years >= 0 && var.object_lock_years <= 100
    error_message = "object_lock_years must be between 0 and 100."
  }
}

variable "bucket_force_destroy" {
  description = "Whether `terraform destroy` may empty and remove the documents bucket. Never true in prod."
  type        = bool
}

variable "ses_domain" {
  description = "Sending domain for this environment. Separate domains keep dev and prod reputation apart."
  type        = string
}

variable "ses_sandbox" {
  description = <<-EOT
    Whether this environment is expected to still be in the SES sandbox. Terraform cannot
    leave the sandbox — that is an AWS support request with lead time — so this input does
    not provision anything. It is the recorded expectation: dev stays sandboxed on purpose
    so it can only mail verified testers, and flipping it to false for prod is the
    checklist item that says production access was actually granted.
  EOT
  type        = bool
}

variable "render_reserved_concurrency" {
  description = "Reserved concurrency for the PDF render function. Cost control."
  type        = number
}

variable "render_memory_mb" {
  description = <<-EOT
    Memory for the PDF render function. Held identical between the environments on
    purpose: an environment that performs differently from prod stops being a test of prod.
  EOT
  type        = number
}

variable "log_retention_days" {
  description = "CloudWatch log retention. Prod logs are part of the evidentiary picture."
  type        = number
}

variable "alarm_email" {
  description = "Address subscribed to the alarm topic — a dev channel or the on-call channel."
  type        = string
}

variable "envelope_expiry_default_days" {
  description = <<-EOT
    Default envelope expiry, in days, published to the application as an output. Identical
    in both environments on purpose — behaviour that differs from prod is not a test of prod.
  EOT
  type        = number
}

# ---------------------------------------------------------------------------------------
# Identical in both environments — defaults here, never in a tfvars file
# ---------------------------------------------------------------------------------------

variable "aws_region" {
  description = "Region for every resource in this root module."
  type        = string
  default     = "eu-central-1"
}

variable "app_base_url" {
  description = <<-EOT
    Base URL of the deployed application for this environment, used by the sweep function
    to call POST /api/internal/envelopes/sweep. Environment-specific by nature but not a
    behavioural difference, so it is derived from `env` rather than set per environment.
  EOT
  type        = string
  default     = null
}

variable "vercel_oidc_issuer" {
  description = "OIDC issuer Vercel presents when the API assumes its AWS role. No static keys exist anywhere."
  type        = string
  default     = "https://oidc.vercel.com"
}

variable "vercel_team_slug" {
  description = "Vercel team slug. Scopes the OIDC trust policy to this team's deployments."
  type        = string
  default     = "devscribed"
}

variable "vercel_project_name" {
  description = "Vercel project whose deployments may assume the API role."
  type        = string
  default     = "devscribed-admin"
}

variable "render_artifact_path" {
  description = <<-EOT
    Zip for the PDF render function, built by CI before apply. Identical path in both
    environments — the same artifact is what makes dev a rehearsal for prod.
  EOT
  type        = string
  default     = "artifacts/pdf-render.zip"
}

variable "sweep_artifact_path" {
  description = "Zip for the envelope sweep function."
  type        = string
  default     = "artifacts/envelope-sweep.zip"
}

variable "ses_events_artifact_path" {
  description = "Zip for the function that turns SES delivery notifications into EnvelopeEvent rows."
  type        = string
  default     = "artifacts/ses-events.zip"
}

variable "chromium_layer_path" {
  description = <<-EOT
    Zip for the Chromium Lambda layer (@sparticuz/chromium plus a font with full Cyrillic
    coverage — a fully Cyrillic contract must render without tofu).
  EOT
  type        = string
  default     = "artifacts/chromium-layer.zip"
}

variable "render_timeout_seconds" {
  description = "Timeout of the render function. The queue's visibility timeout is derived from it."
  type        = number
  default     = 120
}
