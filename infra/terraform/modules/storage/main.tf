terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.38"
    }
  }
}

variable "env" {
  description = "Environment name."
  type        = string
}

variable "bucket_name" {
  description = "Name of the signed-documents bucket."
  type        = string
}

variable "object_lock_years" {
  description = "GOVERNANCE-mode default retention in years. 0 disables Object Lock."
  type        = number
}

variable "force_destroy" {
  description = "Whether terraform destroy may empty the bucket."
  type        = bool
}

variable "account_id" {
  description = "Account holding the bucket, used in the key policy."
  type        = string
}

locals {
  object_lock_enabled = var.object_lock_years > 0
}

# ---------------------------------------------------------------------------------------
# Customer-managed key
#
# A CMK rather than SSE-S3 for two reasons the spec names: rotation, and an auditable
# kms:Decrypt trail. Reading a signed contract is an event we want a record of, and with
# an AWS-managed key there is nothing to attach a policy to.
# ---------------------------------------------------------------------------------------

resource "aws_kms_key" "documents" {
  description             = "Devscribed signed documents (${var.env})"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

resource "aws_kms_alias" "documents" {
  name          = "alias/devscribed-documents-${var.env}"
  target_key_id = aws_kms_key.documents.key_id
}

# ---------------------------------------------------------------------------------------
# The documents bucket
# ---------------------------------------------------------------------------------------

resource "aws_s3_bucket" "documents" {
  bucket        = var.bucket_name
  force_destroy = var.force_destroy

  # Object Lock can only be turned on at creation, which is why this is not a separate
  # toggle: dev is created without it and prod with it, and neither can be converted.
  object_lock_enabled = local.object_lock_enabled
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.documents.arn
    }
    # Without this every object read is a separate KMS request. Signed documents are read
    # rarely but in bursts (both parties open the completion email at once).
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Every object arrives over TLS or not at all. The presigned URL flow is HTTPS anyway;
# this makes it impossible to be otherwise.
resource "aws_s3_bucket_policy" "documents" {
  bucket = aws_s3_bucket.documents.id
  policy = data.aws_iam_policy_document.documents.json

  depends_on = [aws_s3_bucket_public_access_block.documents]
}

data "aws_iam_policy_document" "documents" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.documents.arn,
      "${aws_s3_bucket.documents.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

# ---------------------------------------------------------------------------------------
# Object Lock
#
# GOVERNANCE, not COMPLIANCE: signed documents are records, but a mistake made under
# COMPLIANCE is permanent for everyone including the account root. GOVERNANCE lets a
# break-glass role delete after review, which is the failure mode we can actually operate.
#
# The default retention is bucket-wide because S3 has no per-prefix default — the spec's
# "on the signed/ prefix" is the intent, and this is the mechanism S3 offers. The
# consequence is that a `render-tmp/` object is also retained; the lifecycle rule below
# still expires it (in a versioned bucket, expiry writes a delete marker rather than
# deleting the locked version, which Object Lock permits), so nothing accumulates in the
# current-version view. The retained bytes are a few kilobytes of HTML per render.
# ---------------------------------------------------------------------------------------

resource "aws_s3_bucket_object_lock_configuration" "documents" {
  count  = local.object_lock_enabled ? 1 : 0
  bucket = aws_s3_bucket.documents.id

  rule {
    default_retention {
      mode  = "GOVERNANCE"
      years = var.object_lock_years
    }
  }
}

# ---------------------------------------------------------------------------------------
# Lifecycle
#
# Note what is deliberately absent: there is no expiration and no noncurrent-version
# expiration on `signed/`. The habit of aging out noncurrent versions after 90 days, seen
# in the sibling meetwave infrastructure, must not be copied here — signed contracts are
# retained, not aged out.
# ---------------------------------------------------------------------------------------

resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    id     = "signed-to-standard-ia"
    status = "Enabled"

    filter {
      prefix = "signed/"
    }

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
  }

  rule {
    id     = "expire-render-tmp"
    status = "Enabled"

    filter {
      prefix = "render-tmp/"
    }

    expiration {
      days = 1
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }
  }

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.documents]
}

# ---------------------------------------------------------------------------------------
# Server access logging — an independent record of every object read
#
# Independent is the operative word: it is a different bucket with a different lifecycle,
# so losing or tampering with the documents bucket does not take the record of who read it.
# ---------------------------------------------------------------------------------------

resource "aws_s3_bucket" "access_logs" {
  bucket        = "${var.bucket_name}-logs"
  force_destroy = var.force_destroy
}

resource "aws_s3_bucket_public_access_block" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  versioning_configuration {
    status = "Enabled"
  }
}

# SSE-S3 rather than the CMK: the log delivery service cannot write to a bucket encrypted
# with a customer-managed key without a key policy that would be broader than the logs are
# worth.
resource "aws_s3_bucket_server_side_encryption_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    id     = "expire-access-logs"
    status = "Enabled"

    filter {}

    expiration {
      days = 365
    }
  }
}

resource "aws_s3_bucket_logging" "documents" {
  bucket        = aws_s3_bucket.documents.id
  target_bucket = aws_s3_bucket.access_logs.id
  target_prefix = "documents/"
}

output "bucket_name" {
  description = "Name of the signed-documents bucket."
  value       = aws_s3_bucket.documents.id
}

output "bucket_arn" {
  description = "ARN of the signed-documents bucket."
  value       = aws_s3_bucket.documents.arn
}

output "kms_key_arn" {
  description = "ARN of the customer-managed key protecting every object."
  value       = aws_kms_key.documents.arn
}

output "access_log_bucket" {
  description = "Bucket holding the independent record of every object read."
  value       = aws_s3_bucket.access_logs.id
}
