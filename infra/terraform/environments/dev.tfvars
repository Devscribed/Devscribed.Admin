# Non-secret dev inputs.
#
# This file holds EXACTLY the inputs the spec's "What differs between the environments"
# table lists, and nothing else. Every other input has a default in variables.tf so it
# cannot drift between the environments — a value that appears in both tfvars files is a
# value that can be edited in one of them by accident.
#
# NO SECRET IS EVER WRITTEN HERE. Terraform creates the Secrets Manager containers; the
# values are set out of band, once, per environment. This is an explicit correction to the
# sibling meetwave-serverless-lambda repository, which commits API keys in plaintext tfvars.

env = "dev"

# documents_bucket is derived as devscribed-documents-dev-{account}: the account id is not
# knowable statically, and `env` is the only part that differs. Set it here to override.

# Object Lock off. Locked dev objects cannot be cleaned up, which makes the environment
# unusable within weeks.
object_lock_years = 0

# A dev bucket may be destroyed. A prod bucket may not.
bucket_force_destroy = true

# Separate sending domain, so a dev bounce storm cannot touch prod deliverability.
ses_domain = "mail-dev.devscribed.com"

# Dev stays in the SES sandbox on purpose: it can only mail verified testers, which is
# exactly the blast radius we want from an environment people experiment in.
ses_sandbox = true

# Cost.
render_reserved_concurrency = 2

# Identical to prod on purpose, so dev timings predict prod timings.
render_memory_mb = 2048

log_retention_days = 14

alarm_email = "dev-alerts@devscribed.com"

# Identical to prod on purpose: an environment that behaves differently from prod stops
# being a test of prod.
envelope_expiry_default_days = 30
