variable "env" {
  description = "Environment name."
  type        = string
}

variable "prefix" {
  description = "Name prefix shared by every resource in this environment."
  type        = string
}

variable "aws_region" {
  description = "Region every client in the container is configured for."
  type        = string
}

variable "vpc_id" {
  description = "VPC the tasks and the private namespace live in."
  type        = string
}

variable "subnet_ids" {
  description = "Public subnets, in two zones. See the NAT note in the network module."
  type        = list(string)
}

variable "web_security_group_id" {
  description = "Security group for the web tasks."
  type        = string
}

variable "api_security_group_id" {
  description = "Security group for the API tasks and the migration task."
  type        = string
}

# ---------------------------------------------------------------------------------------
# Images
# ---------------------------------------------------------------------------------------

variable "web_image" {
  description = <<-EOT
    Full image reference for the web service. The deploy passes a **digest**
    (`repo@sha256:...`), never a tag: a tag is a pointer someone else can move, and the
    thing a plan promises to run has to be the thing that runs.
  EOT
  type        = string
}

variable "api_image" {
  description = "Full image reference for the API service. A digest, for the same reason."
  type        = string
}

# ---------------------------------------------------------------------------------------
# Sizing — identical defaults in both environments, per the brief
# ---------------------------------------------------------------------------------------

variable "web_cpu" {
  description = "Fargate CPU units for the web task. 256 = 0.25 vCPU."
  type        = number
}

variable "web_memory" {
  description = "MiB for the web task."
  type        = number
}

variable "api_cpu" {
  description = "Fargate CPU units for the API task."
  type        = number
}

variable "api_memory" {
  description = <<-EOT
    MiB for the API task. Higher than the web app's on purpose: this container launches
    Chromium to render signed PDFs, and Chromium in 512 MiB is a container that dies
    mid-render.
  EOT
  type        = number
}

variable "web_min_tasks" {
  description = "Autoscaling floor for the web service."
  type        = number
}

variable "web_max_tasks" {
  description = "Autoscaling ceiling for the web service."
  type        = number
}

variable "api_min_tasks" {
  description = "Autoscaling floor for the API service."
  type        = number
}

variable "api_max_tasks" {
  description = "Autoscaling ceiling for the API service."
  type        = number
}

variable "scaling_target_cpu" {
  description = "Average CPU percentage both services scale to hold."
  type        = number
}

variable "desired_count_override" {
  description = <<-EOT
    Forces both services to this task count when set. `make stop-dev` sets it to 0 and
    `make start-dev` clears it — the cheap way to stop paying for compute in an
    environment nobody is using overnight, without destroying anything.
  EOT
  type        = number
  default     = null
}

# ---------------------------------------------------------------------------------------
# Ports and logging
# ---------------------------------------------------------------------------------------

variable "internal_namespace" {
  description = <<-EOT
    Cloud Map private DNS namespace, carrying the environment. The web image bakes this
    address in at build time (Next resolves rewrites during `next build`), so the two
    environments produce different web images — which costs nothing here, because each
    environment already has its own registry and `deploy.sh` always builds from the working
    tree. It is published as the `api_internal_origin` output, and deploy.sh passes that
    output to `docker build` as a build argument, so the address the image is built with
    and the address the DNS answers on cannot drift apart.
  EOT
  type        = string
}

variable "web_port" {
  description = "Port the web container listens on."
  type        = number
}

variable "api_port" {
  description = "Port the API container listens on."
  type        = number
}

variable "test_fixtures_enabled" {
  description = <<-EOT
    Whether this environment carries the `/api/test/*` fixtures — the in-memory mail sink,
    the role switch, the membership move, the envelope-expiry write — and creates the token
    that opens them. **False everywhere except the dev stand**, and false by default so
    that opening them is always an explicit act.

    They exist because the product cannot yet build an E2E run's preconditions: no mail
    provider (SES is in the sandbox with an unverified identity, and the signing link lives
    only inside the message), no invite flow, and no way to age an envelope. They retire as
    those arrive.

    Two consequences, both real. Mail genuinely stops being sent, so this environment no
    longer exercises SES at all. And anyone holding the token can read every signing link
    the environment has issued — the write fixtures additionally demand a session that
    already administers the organization, but the sink cannot, since it is read on behalf
    of signers who have no session at all.
  EOT
  type        = bool
  default     = false
}

variable "log_retention_days" {
  description = "CloudWatch retention for both services' logs."
  type        = number
}

# ---------------------------------------------------------------------------------------
# What the application is configured with
# ---------------------------------------------------------------------------------------

variable "documents_bucket" {
  description = "Bucket holding signed documents. STORAGE_DRIVER=s3 reads it."
  type        = string
}

variable "documents_bucket_arn" {
  description = "ARN of that bucket, for the task role's policy."
  type        = string
}

variable "documents_kms_key_arn" {
  description = "Key the bucket is encrypted with. The task role needs Encrypt and Decrypt on it."
  type        = string
}

variable "mail_from" {
  description = "Envelope-from address. Must be inside a verified SES identity or SendEmail is refused."
  type        = string
}

variable "ses_configuration_set" {
  description = "SES v2 configuration set attached to every message."
  type        = string
}

variable "ses_identity_arn" {
  description = "ARN of the verified SES identity the task role may send from."
  type        = string
}

variable "database_url_parameter_arn" {
  description = "SSM parameter holding DATABASE_URL."
  type        = string
}

variable "direct_url_parameter_arn" {
  description = "SSM parameter holding DIRECT_URL."
  type        = string
}

variable "signing_token_ttl_days" {
  description = "Lifetime of a signing link, in days."
  type        = number
}

variable "envelope_expiry_days" {
  description = "Default envelope expiry, in days, applied at send."
  type        = number
}

variable "signwell_api_application_id" {
  description = <<-EOT
    The SignWell API application whose branding the embedded widget wears. Not a secret —
    it names a profile — so it travels as a plain task environment value and differs
    between environments, which is the row the spec's "What differs" table gives it.

    Empty until the profile exists. The product checks all three SignWell values for
    presence, so an empty one simply keeps the provider listed and disabled with "API
    application id" among the missing items, which is the truth.
  EOT
  type        = string
  default     = ""
}

variable "signwell_secrets_provisioned" {
  description = <<-EOT
    Whether `/{prefix}/SIGNWELL_API_KEY` and `/{prefix}/SIGNWELL_WEBHOOK_SECRET` hold real
    values yet, and so whether the task is given them. **False by default**, because this
    module creates those parameters but never their values — a vendor key and a webhook
    registration id are not things Terraform can invent.

    It is a flag rather than an inference because there is nothing to infer from: a
    `SecureString` cannot hold an empty string, so a parameter awaiting its value holds a
    placeholder, and a placeholder handed to the container would read as *present*. The
    settings screen would then offer SignWell to an admin and every send through it would
    fail at the provider. Flipping this after the out-of-band write is what makes
    "configured" mean what requirement 32 says it means.
  EOT
  type        = bool
  default     = false
}
