#!/usr/bin/env bash
#
# Creates the one resource Terraform cannot create for itself: the S3 bucket its own
# state lives in. Run once per AWS account, before the first `make infra-dev`.
#
#   AWS_PROFILE=Devscribed.Admin-Admins infra/bootstrap.sh
#
# It is a script and not Terraform on purpose. A Terraform root module that creates its
# own backend has to keep its first state file somewhere else — on a laptop, or committed
# — and that file then becomes the thing nobody can rebuild. One idempotent script has no
# such file.
#
# Everything here is safe to re-run: each step checks before it writes.
set -euo pipefail

REGION="${AWS_REGION:-us-west-1}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="devscribed-tfstate-${ACCOUNT}"

echo "account ${ACCOUNT}, region ${REGION}, bucket ${BUCKET}"

if aws s3api head-bucket --bucket "${BUCKET}" 2>/dev/null; then
  echo "bucket exists"
else
  # us-east-1 is the one region that rejects a LocationConstraint rather than requiring it.
  if [ "${REGION}" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}"
  else
    aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}" \
      --create-bucket-configuration "LocationConstraint=${REGION}"
  fi
  echo "bucket created"
fi

# Versioning is not a nicety here. Terraform state is the only record of what exists, and
# a corrupted or truncated write is recoverable only if the previous version survived.
aws s3api put-bucket-versioning --bucket "${BUCKET}" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption --bucket "${BUCKET}" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'

aws s3api put-public-access-block --bucket "${BUCKET}" \
  --public-access-block-configuration \
  'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'

# State holds resource attributes, including the database password. TLS-only is the
# minimum; the bucket is already private.
aws s3api put-bucket-policy --bucket "${BUCKET}" --policy "$(cat <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyInsecureTransport",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": ["arn:aws:s3:::${BUCKET}", "arn:aws:s3:::${BUCKET}/*"],
    "Condition": {"Bool": {"aws:SecureTransport": "false"}}
  }]
}
POLICY
)"

# Ninety days of old state versions, then gone. Long enough to recover from a bad apply,
# short enough that the bucket does not grow without bound.
aws s3api put-bucket-lifecycle-configuration --bucket "${BUCKET}" \
  --lifecycle-configuration \
  '{"Rules":[{"ID":"expire-old-state-versions","Status":"Enabled","Filter":{},"NoncurrentVersionExpiration":{"NoncurrentDays":90},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}}]}'

echo
echo "state bucket ready: ${BUCKET}"
echo "backends in infra/terraform/environments/*.tfbackend already point at it."
