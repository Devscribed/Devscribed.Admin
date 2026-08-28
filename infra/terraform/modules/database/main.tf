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

# PostgreSQL.
#
# This replaces Neon, which the repository used while the application ran on Vercel — see
# the note that used to head docker-compose.yml. Same wire protocol, same Prisma client,
# same migrations; only the host changed. The one behavioural difference is worth naming:
# there is no pgbouncer in front of this, so `DATABASE_URL` and `DIRECT_URL` are the same
# string. Neon needed them to differ because Prisma Migrate takes advisory locks and runs
# DDL in transactions, neither of which survives a pooler.
#
# **Why a t4g.micro and not Aurora Serverless v2.** Serverless v2 can now scale to zero
# ACUs and pause, which reads like the obvious choice for an environment nobody is using
# at 3am. It is not, here: pausing requires *no open connections*, and the API holds a
# Prisma connection pool for as long as its task runs. The cluster would never pause, and
# the 0.5-ACU floor bills $43/month against this instance's $15.

variable "env" {
  description = "Environment name."
  type        = string
}

variable "prefix" {
  description = "Name prefix shared by every resource in this environment."
  type        = string
}

variable "instance_class" {
  description = <<-EOT
    Instance size. Graviton (`t4g`) rather than `t3`: same price list, ~20% more work per
    dollar. Scaling this environment up is this one value plus `allocated_storage`.
  EOT
  type        = string
}

variable "engine_version" {
  description = "Postgres major.minor. Pinned so a plan describes the version it will actually run."
  type        = string
}

variable "allocated_storage" {
  description = "GB provisioned at rest. gp3's floor is 20."
  type        = number
}

variable "max_allocated_storage" {
  description = <<-EOT
    Ceiling for RDS storage autoscaling. Storage that grows on its own is the difference
    between a full disk at 2am and a slightly larger bill — signed documents live in S3,
    but their metadata and the append-only event log only ever grow.
  EOT
  type        = number
}

variable "multi_az" {
  description = "Standby in a second zone. Doubles the instance cost; off until the product has users who would notice."
  type        = bool
}

variable "backup_retention_days" {
  description = "Automated backup retention. Zero would disable backups, which is never right here."
  type        = number

  validation {
    condition     = var.backup_retention_days >= 1
    error_message = "This database holds the record of who signed what. Keep at least one day."
  }
}

variable "deletion_protection" {
  description = "Whether the API refuses to delete this instance. Always true in prod."
  type        = bool
}

variable "skip_final_snapshot" {
  description = "Whether a destroy may skip the final snapshot. Never true in prod."
  type        = bool
}

variable "subnet_ids" {
  description = "Private subnets, in two zones."
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security groups controlling who may connect."
  type        = list(string)
}

variable "database_name" {
  description = "Name of the database Prisma connects to."
  type        = string
  default     = "devscribed"
}

variable "master_username" {
  description = "Master user. `postgres` is reserved by RDS, so it is not this."
  type        = string
  default     = "devscribed"
}

variable "ssl_root_cert_path" {
  description = <<-EOT
    Path, inside the API image, to the RDS certificate authority bundle. RDS presents a
    certificate signed by an Amazon root that no distribution trust store carries, and
    node-postgres treats `sslmode=require` as `verify-full` — so without a trust anchor
    every query fails with "self-signed certificate in certificate chain". Downloaded by
    apps/api/Dockerfile; change one and change the other.
  EOT
  type        = string
}

locals {
  # The URL Prisma is given.
  #
  # `verify-full` rather than `require`, and a trust anchor to verify against. `rds.force_ssl`
  # below makes the server refuse a plaintext connection, so encryption is not the question —
  # authentication of the endpoint is. Without `sslrootcert` the client cannot build a chain
  # to Amazon's root and every query fails; without `verify-full` the connection would be
  # encrypted but unauthenticated, which is a weaker thing than it looks for a database
  # holding signed contracts. The certificate names the RDS endpoint, and that endpoint is
  # what this URL connects to, so the hostname check in `verify-full` holds too.
  connection_url = format(
    "postgresql://%s:%s@%s:%s/%s?sslmode=verify-full&sslrootcert=%s",
    var.master_username,
    urlencode(random_password.master.result),
    aws_db_instance.main.address,
    aws_db_instance.main.port,
    var.database_name,
    var.ssl_root_cert_path,
  )
}

# The password lives in Terraform state, and that is a deliberate trade rather than an
# oversight. The alternative — RDS-managed master passwords — keeps it out of state but
# puts it in a Secrets Manager secret whose JSON the application would then have to
# assemble a URL from at startup, which means a container entrypoint script standing
# between the image and `node dist/main.js`. State lives in a versioned, encrypted,
# TLS-only, block-public-access bucket (see infra/bootstrap.sh); the entrypoint script
# would be a permanent moving part. If this product ever takes real customer contracts,
# revisit — that is the point at which the trade flips.
resource "random_password" "master" {
  length = 40
  # RDS rejects '/', '@', '"', and ' ' in a master password outright, and the rest of the
  # punctuation set survives urlencode() above without surprises.
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.prefix}-db"
  subnet_ids = var.subnet_ids

  tags = { Name = "${var.prefix}-db" }
}

resource "aws_db_parameter_group" "main" {
  name = "${var.prefix}-pg"
  # Family is derived from the pinned version so the two cannot drift apart.
  family = "postgres${split(".", var.engine_version)[0]}"

  parameter {
    name = "rds.force_ssl"
    # In-VPC traffic is not automatically private traffic. The database holds password
    # hashes, session security stamps, and the hash-chained signing event log.
    value        = "1"
    apply_method = "pending-reboot"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "main" {
  identifier = "${var.prefix}-db"

  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  db_name  = var.database_name
  username = var.master_username
  password = random_password.master.result

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = var.security_group_ids
  parameter_group_name   = aws_db_parameter_group.main.name
  # It has no route to the internet gateway either way; this is the second lock on the
  # same door.
  publicly_accessible = false

  multi_az                = var.multi_az
  backup_retention_period = var.backup_retention_days
  # UTC, and chosen to sit outside working hours in every timezone this product serves.
  backup_window      = "07:00-08:00"
  maintenance_window = "Mon:08:30-Mon:09:30"

  # Minor versions carry the security fixes and are applied in the window above. Major
  # versions are a decision, never a side effect of an apply.
  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = false

  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.prefix}-db-final-${formatdate("YYYYMMDDhhmmss", timestamp())}"
  copy_tags_to_snapshot     = true

  # Both cost money and neither answers a question this product is asking yet. Turning
  # them on later is one boolean and a reboot.
  performance_insights_enabled = false
  monitoring_interval          = 0

  # Postgres logs go to CloudWatch so a failed migration or a connection storm is
  # readable next to the application logs rather than through a separate console.
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  lifecycle {
    # The snapshot identifier embeds a timestamp, which would otherwise mean every plan
    # proposes replacing the instance.
    ignore_changes = [final_snapshot_identifier]
  }

  tags = { Name = "${var.prefix}-db" }
}

# ---------------------------------------------------------------------------------------
# How the application is told where the database is
#
# SSM Parameter Store rather than Secrets Manager: SecureString parameters are free,
# Secrets Manager is $0.40 per secret per month, and ECS reads both through the same
# `secrets` block on a container definition. Rotation is what Secrets Manager buys, and
# nothing here rotates on a schedule today.
# ---------------------------------------------------------------------------------------

resource "aws_ssm_parameter" "database_url" {
  name        = "/${var.prefix}/DATABASE_URL"
  description = "Connection string the API's Prisma client uses."
  type        = "SecureString"
  value       = local.connection_url
}

# Identical to DATABASE_URL, and present anyway. Prisma Migrate reads DIRECT_URL, and the
# schema declares both; leaving it unset would make `migrate deploy` fail at the point
# where it is least convenient to discover.
resource "aws_ssm_parameter" "direct_url" {
  name        = "/${var.prefix}/DIRECT_URL"
  description = "Same endpoint as DATABASE_URL. There is no pooler in front of this instance."
  type        = "SecureString"
  value       = local.connection_url
}

output "endpoint" {
  description = "host:port of the instance."
  value       = aws_db_instance.main.endpoint
}

output "address" {
  description = "Hostname of the instance."
  value       = aws_db_instance.main.address
}

output "database_url_parameter_arn" {
  description = "ARN of the SSM parameter holding DATABASE_URL."
  value       = aws_ssm_parameter.database_url.arn
}

output "direct_url_parameter_arn" {
  description = "ARN of the SSM parameter holding DIRECT_URL."
  value       = aws_ssm_parameter.direct_url.arn
}

output "instance_identifier" {
  description = "Identifier of the instance."
  value       = aws_db_instance.main.identifier
}
