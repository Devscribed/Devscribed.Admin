# Non-secret prod inputs.
#
# Deliberately almost identical to dev.tfvars, and that is the point: the brief asks for
# the same configuration in both environments, scalable by changing numbers. The numbers
# live in variables.tf, once, so dev is a genuine rehearsal for prod. What differs here is
# only what *must*: the address space, and every switch that decides whether a mistake is
# recoverable.
#
# NO SECRET IS EVER WRITTEN HERE.

env = "prod"

vpc_cidr = "10.20.0.0/16"

# Seven years, GOVERNANCE mode. Signed documents are records. GOVERNANCE lets a
# break-glass role delete after review; COMPLIANCE would make one mistake permanent for
# everyone, including the account root.
object_lock_years = 7

# None of these may be true here. A `terraform destroy` typed in the wrong terminal must
# hit a wall, not a bucket full of contracts.
bucket_force_destroy   = false
db_deletion_protection = true
db_skip_final_snapshot = false

# ---------------------------------------------------------------------------------------
# Mail
#
# Still an address and still sandboxed, for the same reason as dev: this account owns no
# domain and AWS has not granted production access. Both are prerequisites for sending a
# real contract to a real counterparty, and both are lead-time items:
#
#   1. Register a domain and verify it as a SES *domain* identity, with DKIM and a custom
#      MAIL FROM. Sending contracts from a gmail.com address fails DMARC at the recipient.
#   2. File the SES production-access request, which lifts the verified-recipients-only
#      restriction below.
#
# Until then this environment can be deployed and exercised, but only among the addresses
# listed here.
# ---------------------------------------------------------------------------------------

sender_email = "ivan.demchenko.dev@gmail.com"

verified_emails = [
  "ivan.demchenko.dev@gmail.com",
]

# Flip to false only once AWS has actually granted production access. It provisions
# nothing; it is the recorded assertion that the request was filed and answered.
ses_sandbox_expected = true

# ---------------------------------------------------------------------------------------
# Operations
# ---------------------------------------------------------------------------------------

alarm_email = "ivan.demchenko.dev@gmail.com"

# A year. Prod logs are part of the evidentiary picture around a disputed signature.
log_retention_days = 365

# Never here, and written out rather than left to the default so that the choice is visible
# in the file a reader opens. With it false no token is created, so every /api/test/* route
# answers 404 no matter what else is set.
test_fixtures_enabled = false

# ---------------------------------------------------------------------------------------
# SignWell — documents spec 04
# ---------------------------------------------------------------------------------------

# The production branding profile, so a counterparty signing our contract sees our colours and
# logo rather than SignWell's default. Empty until one is created in the production SignWell
# account; while it is empty the provider stays listed and disabled with "API application
# id" among the missing items.
signwell_api_application_id = ""

# The two secrets the app module creates parameters for and never values. Flip this to true
# only after both have been written out of band, against the production account:
#
#   aws ssm put-parameter --type SecureString --overwrite --value '<the key>' --name /devscribed-prod/SIGNWELL_API_KEY
#   aws ssm put-parameter --type SecureString --overwrite --value '<the webhook id>' --name /devscribed-prod/SIGNWELL_WEBHOOK_SECRET
#
# Until then the API is handed neither, which is the honest state and one the product is
# built for: the SignWell row on the settings screen is visible, disabled, and names what
# is absent. Nothing else about the environment depends on it — every organization keeps
# signing with the in-house engine, which is what they default to anyway.
#
# The webhook id comes from a registration made by hand, and there is a real obstacle in
# front of it: neither stand has a public address SignWell can reach yet. That costs
# timeliness and not correctness — reads and the hourly sweep converge the same rows — but
# it is why this cannot be provisioned from here.
signwell_secrets_provisioned = false

# ---------------------------------------------------------------------------------------
# CI/CD
# ---------------------------------------------------------------------------------------

# Dev created the account's OIDC provider; there is only one.
create_github_oidc_provider = false

# `environment:prod` rather than a branch: it matches only a workflow job that declares
# `environment: prod`, which is where GitHub applies required reviewers. That makes a
# human approval part of the credential, not just part of the UI.
github_allowed_refs = [
  "environment:prod",
]

# Hiring keeps CVs on the task's own filesystem and books interviews against the fake
# calendar: CVs survive only until the task is replaced, and bookings invite nobody. Accepted
# on this stand until S3 storage and a Graph tenant exist.
hiring_storage_provider = "fs"
hiring_storage_fs_root  = "/tmp/cv-storage"
calendar_provider       = "fake"
