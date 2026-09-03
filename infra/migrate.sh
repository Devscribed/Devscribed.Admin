#!/usr/bin/env bash
#
# Runs `prisma migrate deploy` against an environment's database.
#
#   infra/migrate.sh dev
#
# The database has no route to the internet — that is the point of the private subnets —
# so this cannot be run from a laptop or from a GitHub runner directly. It starts a one-off
# Fargate task inside the VPC, from the same image the API runs, waits for it, and prints
# what it said.
#
# Exit code is the container's, so a failed migration fails the deploy that called it.
set -euo pipefail

ENV="${1:?usage: migrate.sh <dev|prod>}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="${REPO_ROOT}/infra/terraform"
REGION="${AWS_REGION:-us-west-1}"

cd "${TF_DIR}"

CLUSTER="$(terraform output -raw cluster_name)"
TASK_DEF="$(terraform output -raw migrate_task_definition)"
SUBNETS="$(terraform output -json task_subnet_ids | tr -d '[]" ' | tr '\n' ' ' | tr -d ' ')"
SG="$(terraform output -raw task_security_group_id)"
LOG_GROUP="$(terraform output -json log_groups | python -c 'import sys,json;print(json.load(sys.stdin)["migrate"])')"

echo "starting migration task on ${CLUSTER}"

TASK_ARN="$(aws ecs run-task \
  --cluster "${CLUSTER}" \
  --task-definition "${TASK_DEF}" \
  --launch-type FARGATE \
  --region "${REGION}" \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SG}],assignPublicIp=ENABLED}" \
  --query 'tasks[0].taskArn' --output text)"

if [ -z "${TASK_ARN}" ] || [ "${TASK_ARN}" = "None" ]; then
  echo "run-task returned no task" >&2
  exit 1
fi

TASK_ID="${TASK_ARN##*/}"
echo "task ${TASK_ID}"

aws ecs wait tasks-stopped --cluster "${CLUSTER}" --tasks "${TASK_ARN}" --region "${REGION}"

# The log stream name is fixed by the awslogs driver: <prefix>/<container>/<task id>.
STREAM="migrate/migrate/${TASK_ID}"
# `MSYS_NO_PATHCONV` on this one command and not on the script: Git Bash on Windows
# rewrites any argument that looks like a Unix path, so `/ecs/devscribed-dev/migrate` would
# reach the AWS CLI as `C:/Program Files/Git/ecs/...` and be rejected. Exporting it for the
# whole script breaks the *opposite* conversion — `/d/repo` to `D:/repo` — that the native
# git.exe and docker.exe need.
echo "--- output ---"
MSYS_NO_PATHCONV=1 aws logs get-log-events \
  --log-group-name "${LOG_GROUP}" \
  --log-stream-name "${STREAM}" \
  --region "${REGION}" \
  --start-from-head \
  --query 'events[].message' --output text 2>/dev/null | sed 's/^/  /' || echo "  (no log stream; the task may have failed before starting)"
echo "--------------"

EXIT_CODE="$(aws ecs describe-tasks --cluster "${CLUSTER}" --tasks "${TASK_ARN}" --region "${REGION}" \
  --query 'tasks[0].containers[0].exitCode' --output text)"
REASON="$(aws ecs describe-tasks --cluster "${CLUSTER}" --tasks "${TASK_ARN}" --region "${REGION}" \
  --query 'tasks[0].stoppedReason' --output text)"

if [ "${EXIT_CODE}" != "0" ]; then
  echo "migration failed (exit ${EXIT_CODE}): ${REASON}" >&2
  exit 1
fi

echo "migrations applied"
