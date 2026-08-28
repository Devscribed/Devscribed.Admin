#!/usr/bin/env bash
#
# Builds, pushes, and rolls out one or both services.
#
#   infra/deploy.sh dev api web
#   infra/deploy.sh dev api
#   infra/deploy.sh prod web
#
# Called by `make deploy-<env>`, `make deploy-<env>-api`, and `make deploy-<env>-web`.
# It is a script rather than a Makefile recipe because the logic below has branches, and a
# branch written in Make is a branch nobody will read twice.
#
# What it does, in order:
#
#   1. Makes sure the registries exist, so the very first deploy into an empty account
#      works without a separate "run this once" step.
#   2. Builds each requested service and pushes it under the current commit's short SHA.
#   3. Resolves the **digest** of what it pushed. Everything downstream refers to the
#      digest, never the tag: a tag is a pointer somebody else can move, and the image a
#      plan promises has to be the image that runs.
#   4. For a service it did NOT build, reads the digest currently deployed, so deploying
#      one service cannot silently roll the other one back or forward.
#   5. Runs the migrations, from the image it is about to deploy.
#   6. Applies. Terraform waits for both services to reach steady state, so this command
#      failing means the deploy failed — not that it was merely submitted.
#
# **Migrations run BEFORE the rollout**, and the order is the whole point.
#
# It used to be the other way round, justified by the rule that migrations here are
# additive and therefore "either order must work". That reasoning is backwards. Additive
# migrations make *old code against a new schema* safe — the old code simply ignores the
# column it does not know about. They say nothing about *new code against an old schema*,
# which is exactly what deploying first produces: the new API starts serving, and every
# query touching a table the migration has not created yet fails until it does.
#
# The user-management merge is what makes that concrete rather than theoretical. It adds
# `Invitation`, `PendingEmailChange` and `Membership.jobTitle`, and the code reading all
# three ships in the same commit; rolling out first would have meant a minute or two of
# 500s on the members list.
#
# Running them from the same image the API runs is what stops the schema and the code that
# depends on it being built from different commits.
set -euo pipefail

ENV="${1:?usage: deploy.sh <dev|prod> [api] [web]}"
shift
SERVICES=("$@")
if [ ${#SERVICES[@]} -eq 0 ]; then SERVICES=(api web); fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="${REPO_ROOT}/infra/terraform"
REGION="${AWS_REGION:-us-west-1}"

cd "${TF_DIR}"

tf() { terraform "$@"; }
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# A dirty tree deploys something that exists in no commit, which is the one image nobody
# can ever reproduce. Warn rather than refuse — it is a legitimate thing to do while
# debugging a deploy, just never silently.
GIT_SHA="$(git -C "${REPO_ROOT}" rev-parse --short HEAD)"
if ! git -C "${REPO_ROOT}" diff --quiet HEAD 2>/dev/null; then
  GIT_SHA="${GIT_SHA}-dirty"
  echo "warning: working tree has uncommitted changes; tagging images ${GIT_SHA}" >&2
fi

say "init (${ENV})"
tf init -backend-config="environments/${ENV}.tfbackend" -reconfigure -input=false

# Idempotent and quick once the repositories exist. It is what makes the first deploy into
# a fresh account a single command rather than a documented two-step.
say "registries"
tf apply -input=false -auto-approve \
  -target=module.registry \
  -var-file="environments/${ENV}.tfvars" >/dev/null

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com" >/dev/null

# `--image` gathers the -var flags for the apply at the end.
declare -A IMAGE

# Reading an output is not optional here: an empty repository URL would silently produce
# an image reference like ":latest", which Docker would then try to push to Docker Hub.
repo_url() {
  local service="$1" url
  url="$(tf output -raw "${service}_repository_url" 2>/dev/null || true)"
  if [ -z "${url}" ] || [ "${url}" = "null" ]; then
    echo "could not read ${service}_repository_url from Terraform state." >&2
    echo "Run 'make infra-${ENV}' first, or check that the registry apply above succeeded." >&2
    exit 1
  fi
  echo "${url}"
}

build_and_push() {
  local service="$1"
  local repo
  repo="$(repo_url "${service}")"

  # The web image has to be built knowing where the API answers, because Next resolves
  # `rewrites()` at build time and writes the destination into routes-manifest.json — the
  # running container never reads API_ORIGIN.
  #
  # Derived from the environment name rather than read from `terraform output`, and that is
  # the second attempt: a Terraform output survives a *failed* apply, so after one the
  # output can describe a namespace that was never created. Building an image against that
  # produces a web app that resolves nothing, with no error anywhere until the first API
  # call 500s. This string is a pure function of ENV and cannot go stale.
  #
  # It must match `internal_namespace` in infra/terraform/main.tf, which is
  # "${local.prefix}.internal" — change one and change the other.
  local build_args=()
  if [ "${service}" = "web" ]; then
    local api_origin="http://api.devscribed-${ENV}.internal:4000"
    build_args+=(--build-arg "API_ORIGIN=${api_origin}")
    echo "web will proxy /api/* to ${api_origin}"
  fi

  say "build ${service}"
  # The build context is the repository root for both services: each depends on
  # packages/validation, and the web app also on the design system above it.
  docker build \
    --file "${REPO_ROOT}/apps/${service}/Dockerfile" \
    "${build_args[@]+"${build_args[@]}"}" \
    --tag "${repo}:${GIT_SHA}" \
    --tag "${repo}:latest" \
    "${REPO_ROOT}"

  say "push ${service}"
  docker push "${repo}:${GIT_SHA}"
  docker push "${repo}:latest"

  local digest
  digest="$(aws ecr describe-images \
    --repository-name "$(basename "${repo}")" \
    --image-ids "imageTag=${GIT_SHA}" \
    --query 'imageDetails[0].imageDigest' --output text)"

  IMAGE[$service]="${repo}@${digest}"
  echo "${service} -> ${IMAGE[$service]}"
}

# What a service that is NOT being deployed should keep running: whatever it runs now.
# Falling back to `:latest` covers the first apply, when nothing is deployed yet.
current_image() {
  local service="$1"
  local existing
  existing="$(tf output -raw "${service}_image" 2>/dev/null || true)"
  if [ -n "${existing}" ] && [ "${existing}" != "null" ]; then
    echo "${existing}"
  else
    echo "$(repo_url "${service}"):latest"
  fi
}

for service in api web; do
  if printf '%s\n' "${SERVICES[@]}" | grep -qx "${service}"; then
    build_and_push "${service}"
  else
    IMAGE[$service]="$(current_image "${service}")"
    echo "${service} -> unchanged (${IMAGE[$service]})"
  fi
done

# Only when the API changed. A web-only deploy cannot have changed the schema, and running
# migrations anyway would make every deploy wait on a task that has nothing to do.
#
# The one-off task has to run the image that is about to be deployed, so its task
# definition is registered on its own first. `-target` is a documented escape hatch and
# this is what it is for: it updates the migrate task definition — and, on a first deploy,
# the network and database it depends on — without rolling any service out.
if printf '%s\n' "${SERVICES[@]}" | grep -qx api; then
  say "migrate task definition (${ENV})"
  tf apply -input=false -auto-approve \
    -target=module.app.aws_ecs_task_definition.migrate \
    -var-file="environments/${ENV}.tfvars" \
    -var "web_image=${IMAGE[web]}" \
    -var "api_image=${IMAGE[api]}"

  say "migrate (${ENV})"
  "${REPO_ROOT}/infra/migrate.sh" "${ENV}"
fi

say "apply (${ENV})"
tf apply -input=false -auto-approve \
  -var-file="environments/${ENV}.tfvars" \
  -var "web_image=${IMAGE[web]}" \
  -var "api_image=${IMAGE[api]}"

say "deployed"
tf output -raw app_url && echo
