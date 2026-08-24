# Terraform entry points for the documents area.
#
# One root module, two environments, composed through -backend-config and -var-file.
# There are no workspaces here on purpose: separate state files with separate backend
# configs make "I applied dev to prod" impossible to do silently.
#
# `-reconfigure` on every init is what stops a backend left over from the previous
# environment from being reused — without it, `make plan-prod` straight after
# `make plan-dev` would happily plan prod against dev's state.
#
# apply-prod is the one target that is not automated. In CI it runs only behind a manual
# environment approval; here it is deliberately as many keystrokes as the others so that
# nobody builds a habit that ends at the wrong environment.

.PHONY: fmt validate plan-dev apply-dev plan-prod apply-prod output-dev output-prod

TF ?= terraform

fmt:
	$(TF) fmt -recursive

# What CI checks on every pull request that touches infra/terraform/**, together with a
# plan for both environments.
validate:
	$(TF) fmt -check -recursive
	$(TF) init -backend=false -reconfigure
	$(TF) validate

init-dev:
	$(TF) init -backend-config=environments/dev.tfbackend -reconfigure

plan-dev: init-dev
	$(TF) plan -var-file=environments/dev.tfvars

apply-dev: init-dev
	$(TF) apply -var-file=environments/dev.tfvars

output-dev: init-dev
	$(TF) output

init-prod:
	$(TF) init -backend-config=environments/prod.tfbackend -reconfigure

plan-prod: init-prod
	$(TF) plan -var-file=environments/prod.tfvars

apply-prod: init-prod
	$(TF) apply -var-file=environments/prod.tfvars

output-prod: init-prod
	$(TF) output
