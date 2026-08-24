# Non-secret prod inputs.
#
# This file holds EXACTLY the inputs the spec's "What differs between the environments"
# table lists, and nothing else. Every other input has a default in variables.tf so it
# cannot drift between the environments.
#
# NO SECRET IS EVER WRITTEN HERE. Terraform creates the Secrets Manager containers; the
# values are set out of band, once, per environment.

env = "prod"

# documents_bucket is derived as devscribed-documents-prod-{account}. Hard isolation from
# dev comes from the name plus the per-environment IAM policies that name these ARNs
# explicitly — the dev API role has no statement mentioning this bucket at all.

# Seven years, GOVERNANCE mode. Signed documents are records. GOVERNANCE lets a break-glass
# role delete after review; COMPLIANCE would make a mistake permanent for everyone.
object_lock_years = 7

# A prod bucket must never be destroyable by a `terraform destroy` typo.
bucket_force_destroy = false

ses_domain = "mail.devscribed.com"

# False asserts that AWS has granted production access. Terraform cannot leave the sandbox
# — that is a support request with lead time, and it must be filed before the first real
# contract can be sent.
ses_sandbox = false

render_reserved_concurrency = 5

# Identical to dev on purpose.
render_memory_mb = 2048

# Prod logs are part of the evidentiary picture.
log_retention_days = 365

alarm_email = "oncall@devscribed.com"

# Identical to dev on purpose.
envelope_expiry_default_days = 30
