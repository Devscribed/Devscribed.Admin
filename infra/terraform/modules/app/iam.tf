# Four roles, and the reason each one is separate.
#
# **Execution role** — used by the ECS agent, before the container starts: pull the image,
# create the log stream, read the SSM parameters that become environment secrets. It is
# not the application's identity and the application never holds it.
#
# **Infrastructure role** — assumed by ECS itself to build the load balancer, target
# groups, certificate, security groups, and scaling policies that Express Mode manages.
# Only Express Mode uses it, and only during create, update, and delete.
#
# **API task role** — the application's own identity. S3, KMS, and SES, scoped to the one
# bucket, the one key, and the one sending identity of *this* environment.
#
# **Web task role** — deliberately almost empty. The web container proxies to the API and
# talks to nothing else in AWS; giving it the API's permissions "just in case" would make
# the browser-facing container the one with the keys to the contracts.

data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------------------
# Execution role
# ---------------------------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }

    # Confused-deputy guard: without these, any account able to make ECS call
    # sts:AssumeRole could name this role.
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.prefix}-execution"
  description        = "Pulls images, writes log streams, resolves container secrets."
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# The managed policy above covers ECR and CloudWatch Logs but deliberately not secrets —
# AWS cannot know which ones. These are exactly this environment's four.
data "aws_iam_policy_document" "execution_secrets" {
  statement {
    sid     = "ReadContainerSecrets"
    actions = ["ssm:GetParameters"]
    resources = [
      var.database_url_parameter_arn,
      var.direct_url_parameter_arn,
      aws_ssm_parameter.session_secret.arn,
      aws_ssm_parameter.internal_task_secret.arn,
    ]
  }

  statement {
    sid       = "DecryptThoseSecrets"
    actions   = ["kms:Decrypt"]
    resources = ["arn:aws:kms:${var.aws_region}:${data.aws_caller_identity.current.account_id}:key/*"]

    # SecureString parameters without an explicit key use the account's `aws/ssm` key,
    # whose id is not knowable here. The condition is what keeps the wildcard honest: it
    # grants decryption of SSM parameters and of nothing else.
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "container-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

# ---------------------------------------------------------------------------------------
# Infrastructure role — Express Mode's own hands
# ---------------------------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_service_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "infrastructure" {
  name               = "${var.prefix}-ecs-infrastructure"
  description        = "Lets ECS Express Mode create and manage the load balancer, certificate, and scaling policies."
  assume_role_policy = data.aws_iam_policy_document.ecs_service_assume.json
}

resource "aws_iam_role_policy_attachment" "infrastructure_managed" {
  role = aws_iam_role.infrastructure.name
  # ~280 lines of JSON maintained by AWS, spanning ELB, ACM, EC2, and Application Auto
  # Scaling. Hand-writing an equivalent would mean re-deriving it every time Express Mode
  # gains a capability.
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRoleforExpressGatewayServices"
}

# ---------------------------------------------------------------------------------------
# Task roles
# ---------------------------------------------------------------------------------------

resource "aws_iam_role" "api_task" {
  name               = "${var.prefix}-api-task"
  description        = "The API's own identity: documents in S3, mail through SES."
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role" "web_task" {
  name               = "${var.prefix}-web-task"
  description        = "The web app's identity. It calls no AWS API; the role exists so that stays visible."
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "api_task" {
  statement {
    sid = "SignedDocuments"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:GetObjectVersion",
    ]
    # Object-level only. Bucket-level actions are a separate statement so that a policy
    # granting reads of a contract cannot also grant a listing of every contract.
    resources = ["${var.documents_bucket_arn}/*"]
  }

  statement {
    sid       = "ListForPresigning"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [var.documents_bucket_arn]
  }

  statement {
    sid = "DocumentEncryption"
    actions = [
      "kms:Decrypt",
      "kms:Encrypt",
      "kms:GenerateDataKey",
      "kms:DescribeKey",
    ]
    # This environment's key alone. The other environment's key is not named anywhere in
    # this policy, which is what makes the isolation real rather than conventional.
    resources = [var.documents_kms_key_arn]
  }

  statement {
    sid     = "SendMail"
    actions = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = [
      var.ses_identity_arn,
      "arn:aws:ses:${var.aws_region}:${data.aws_caller_identity.current.account_id}:configuration-set/${var.ses_configuration_set}",
    ]
  }

  # `aws ecs execute-command` into a running task — how you read a live connection pool or
  # run a one-off query without a bastion host. It is audited in CloudTrail and gated by
  # IAM on the caller's side; the task end just has to be able to talk to SSM.
  statement {
    sid = "ExecuteCommandChannel"
    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "api_task" {
  name   = "api"
  role   = aws_iam_role.api_task.id
  policy = data.aws_iam_policy_document.api_task.json
}
