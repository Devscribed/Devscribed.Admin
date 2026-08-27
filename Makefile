# One command per thing you might want to do to a deployed environment.
#
#   make bootstrap          create the Terraform state bucket (once per AWS account)
#   make deploy-dev         build, push, roll out, and migrate — both services
#   make deploy-dev-api     the same, for the API alone
#   make deploy-dev-web     the same, for the web app alone
#   make plan-dev           what an apply would change, without changing it
#   make infra-dev          apply infrastructure without rebuilding images
#   make migrate-dev        run prisma migrate deploy inside the VPC
#   make url-dev            print the address people open
#   make logs-dev-api       tail the API's logs
#   make stop-dev           scale both services to zero (stops the Fargate bill)
#   make start-dev          bring them back
#   make destroy-dev        tear the environment down
#
# Every target exists for prod too: swap `dev` for `prod`.
#
# Prerequisites: terraform >= 1.10, AWS CLI v2, Docker, and an AWS profile. On Windows,
# run this from Git Bash — the recipes are bash, not cmd.

ifeq ($(OS),Windows_NT)
SHELL := bash.exe
else
SHELL := /bin/bash
endif
.SHELLFLAGS := -eu -o pipefail -c

# Overridable, but these are the real values for this account.
export AWS_PROFILE ?= Devscribed.Admin-Admins
export AWS_REGION  ?= us-west-1

TF      := terraform
TF_DIR  := infra/terraform
# `-reconfigure` on every init is what stops a backend left over from the previous
# environment being reused. Without it, `make plan-prod` straight after `make plan-dev`
# would happily plan prod against dev's state.
TF_INIT  = $(TF) -chdir=$(TF_DIR) init -reconfigure -input=false -backend-config=environments/$(1).tfbackend
TF_VARS  = -var-file=environments/$(1).tfvars

.PHONY: help bootstrap fmt validate \
        plan-dev plan-prod infra-dev infra-prod \
        deploy-dev deploy-dev-api deploy-dev-web \
        deploy-prod deploy-prod-api deploy-prod-web \
        migrate-dev migrate-prod url-dev url-prod output-dev output-prod \
        logs-dev-api logs-dev-web logs-prod-api logs-prod-web \
        stop-dev start-dev stop-prod start-prod \
        destroy-dev destroy-prod

help:
	@sed -n '3,20p' $(MAKEFILE_LIST)

# ---------------------------------------------------------------------------------------
# Once per account
# ---------------------------------------------------------------------------------------

bootstrap:
	infra/bootstrap.sh

# ---------------------------------------------------------------------------------------
# Checks — what CI runs on a pull request that touches infra/
# ---------------------------------------------------------------------------------------

fmt:
	$(TF) -chdir=$(TF_DIR) fmt -recursive

validate:
	$(TF) -chdir=$(TF_DIR) fmt -check -recursive
	$(TF) -chdir=$(TF_DIR) init -backend=false -reconfigure -input=false
	$(TF) -chdir=$(TF_DIR) validate

# ---------------------------------------------------------------------------------------
# Infrastructure
#
# These do not touch images. A plain apply leaves both services on the digests they are
# already running — see the `web_image` default in variables.tf.
# ---------------------------------------------------------------------------------------

plan-dev:
	$(call TF_INIT,dev)
	$(TF) -chdir=$(TF_DIR) plan $(call TF_VARS,dev)

plan-prod:
	$(call TF_INIT,prod)
	$(TF) -chdir=$(TF_DIR) plan $(call TF_VARS,prod)

infra-dev:
	$(call TF_INIT,dev)
	$(TF) -chdir=$(TF_DIR) apply $(call TF_VARS,dev)

# Not auto-approved, and not going to be. In CI this runs behind a manual environment
# approval; here it is deliberately the same number of keystrokes as everything else, so
# nobody builds a habit that ends at the wrong environment.
infra-prod:
	$(call TF_INIT,prod)
	$(TF) -chdir=$(TF_DIR) apply $(call TF_VARS,prod)

# ---------------------------------------------------------------------------------------
# Deploys
# ---------------------------------------------------------------------------------------

deploy-dev:
	infra/deploy.sh dev api web

deploy-dev-api:
	infra/deploy.sh dev api

deploy-dev-web:
	infra/deploy.sh dev web

deploy-prod:
	infra/deploy.sh prod api web

deploy-prod-api:
	infra/deploy.sh prod api

deploy-prod-web:
	infra/deploy.sh prod web

migrate-dev:
	$(call TF_INIT,dev)
	infra/migrate.sh dev

migrate-prod:
	$(call TF_INIT,prod)
	infra/migrate.sh prod

# ---------------------------------------------------------------------------------------
# Looking at it
# ---------------------------------------------------------------------------------------

# Each of these re-inits first, and that is worth the few seconds. `terraform output` reads
# whichever backend the working directory was last pointed at, so without it `make url-prod`
# straight after `make plan-dev` would confidently print dev's address.
url-dev:
	@$(call TF_INIT,dev) >/dev/null
	@$(TF) -chdir=$(TF_DIR) output -raw app_url && echo

url-prod:
	@$(call TF_INIT,prod) >/dev/null
	@$(TF) -chdir=$(TF_DIR) output -raw app_url && echo

output-dev:
	$(call TF_INIT,dev)
	@$(TF) -chdir=$(TF_DIR) output

output-prod:
	$(call TF_INIT,prod)
	@$(TF) -chdir=$(TF_DIR) output

# `MSYS_NO_PATHCONV` on each of these four and nowhere else. Git Bash on Windows rewrites
# any argument that looks like a Unix path, so /ecs/devscribed-dev/api would reach the AWS
# CLI as C:/Program Files/Git/ecs/... and be rejected. Setting it globally is worse: it also
# stops /d/repo becoming D:/repo, which the native git.exe and docker.exe need.
logs-dev-api:
	MSYS_NO_PATHCONV=1 aws logs tail /ecs/devscribed-dev/api --follow --since 10m

logs-dev-web:
	MSYS_NO_PATHCONV=1 aws logs tail /ecs/devscribed-dev/web --follow --since 10m

logs-prod-api:
	MSYS_NO_PATHCONV=1 aws logs tail /ecs/devscribed-prod/api --follow --since 10m

logs-prod-web:
	MSYS_NO_PATHCONV=1 aws logs tail /ecs/devscribed-prod/web --follow --since 10m

# ---------------------------------------------------------------------------------------
# Pausing
#
# Scales both services to zero and disarms the alarms and the hourly sweep with them — an
# environment stopped on purpose must not page anyone. The load balancer and the database
# keep running and keep billing; this is the compute half of the bill, which for dev is
# most of it. Nothing is destroyed and nothing is lost.
# ---------------------------------------------------------------------------------------

stop-dev:
	$(call TF_INIT,dev)
	$(TF) -chdir=$(TF_DIR) apply -auto-approve $(call TF_VARS,dev) -var desired_count_override=0

start-dev:
	$(call TF_INIT,dev)
	$(TF) -chdir=$(TF_DIR) apply -auto-approve $(call TF_VARS,dev)

stop-prod:
	$(call TF_INIT,prod)
	$(TF) -chdir=$(TF_DIR) apply $(call TF_VARS,prod) -var desired_count_override=0

start-prod:
	$(call TF_INIT,prod)
	$(TF) -chdir=$(TF_DIR) apply $(call TF_VARS,prod)

# ---------------------------------------------------------------------------------------
# Teardown
# ---------------------------------------------------------------------------------------

destroy-dev:
	$(call TF_INIT,dev)
	$(TF) -chdir=$(TF_DIR) destroy $(call TF_VARS,dev)

# Will refuse partway through, by design: prod's bucket has force_destroy false, its
# database has deletion protection on, and its objects are under a seven-year Object Lock.
# Removing an environment that holds signed contracts is a deliberate, manual act.
destroy-prod:
	$(call TF_INIT,prod)
	$(TF) -chdir=$(TF_DIR) destroy $(call TF_VARS,prod)
