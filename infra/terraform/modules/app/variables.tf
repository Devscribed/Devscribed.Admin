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
