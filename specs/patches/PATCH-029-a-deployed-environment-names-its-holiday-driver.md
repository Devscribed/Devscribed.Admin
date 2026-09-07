---
id: "PATCH-029"
title: A deployed environment names its holiday driver rather than inheriting it
surface: infra
supersedes: time-off/02
requirement: REQ-02-011
cases: []
files: 1
---

## Why

`infra/terraform/modules/app/api.tf` sets no `HOLIDAY_*` variable of any kind. The API still
talks to the real provider, because the same block sets `NODE_ENV = "production"` and
`resolveHolidayProviderConfig` falls through to `nager` whenever it is — so the deployed
behaviour is correct and has been since the port landed.

It is correct by omission, and that is the defect. The block it is missing from opens with
"Ports, each choosing its production driver": `STORAGE_DRIVER`, `MAIL_TRANSPORT`,
`PDF_RENDERER`, `JOB_QUEUE`, `CALENDAR_PROVIDER` are all written out, and two of them —
`SIGNWELL_TEST_MODE` and `PROVIDER_SYNC_STALE_SECONDS` — are written out *with their values
inline* rather than taken from a tfvars, each with the reason beside it. The holiday port is
the only one in the product deployed by default rather than by decision.

Three things follow, and the second is not cosmetic:

1. A reader of the deployed configuration cannot say which driver the API is on without
   opening a TypeScript file in another directory.
2. **REQ-02-011's call bound is unstated in every deployed environment.** It is a
   behaviour-affecting number — a country whose call has not answered inside it is reported
   unsourced — and it agrees with `.env.example` today only because the constant in the code
   happens to equal the number in the example. Nothing holds them equal. That is exactly the
   condition `PROVIDER_SYNC_STALE_SECONDS` is written out to prevent.
3. Nothing can point a stand off the public service without changing code.

## The rule

THE SYSTEM SHALL state the holiday provider's driver, its base URL and its call bound in the
deployed environment's own configuration, so that the driver a deployed API talks to and the
bound REQ-02-011 gives it are read from the environment that runs it rather than inferred
from `NODE_ENV`.

**What it looks like when it is wrong.** The question "which holiday service is prod calling,
and how long does it wait?" is answered by reading application source.

## Contracts

No route, no message, no `data-testid`, no schema. Three environment entries join
`local.api_environment`; every name and every value already existed and is documented in
`apps/api/.env.example`. `resolveHolidayProviderConfig` is unchanged — the values written are
the ones it already resolves to, which is what makes this a statement and not a change of
behaviour.

**Written inline, not threaded through a tfvars variable.** The same reasoning `api.tf` gives
for `SIGNWELL_TEST_MODE`: a per-environment value would let a tfvars edit move a stand off the
real provider silently. And the dev stand *should* use the real one. It is faked there for
every other external dependency — `MAIL_TRANSPORT = memory`, `calendar_provider = "fake"` —
because those send real mail to real people and need a tenant nobody has. This provider needs
no credential, costs nothing, and sends nothing to anybody: it is the only third party in the
product a stand can exercise for real, and a stand that fakes it is not a rehearsal of prod.

## Cases

**None written, at the user's direction** — asked for as a patch, code, commit, with the
regression waived.

`terraform plan` is the check: the API task definition gains three environment entries and
nothing else changes. The case this would carry is a config assertion that every key
`.env.example` documents as read in a deployed environment appears in `api_environment` or
`api_secrets` — which is the assertion that would have caught this, and which no amount of
reading either file separately does.

## Blast radius

- **Nothing about the running product changes.** Every value written is the one already
  resolved. A `terraform apply` replaces the task definition and rolls the service, which is
  what any change to this file does.
- **Deploys.** `infra/` is not in `deploy.yml`'s ignored set, so this push runs `infra/deploy.sh`
  and rolls the API on dev.
- **`HOLIDAY_PROVIDER_BASE_URL` is now pinned in the environment.** If the public service ever
  moves, this file is the place that has to know, rather than a default in application source.

## Not in this patch

- **A `holiday_provider` tfvars variable.** Above: the value is the same in both environments
  on purpose, and a knob per environment is the thing that lets them differ by accident.
- **A credential, a secret or an SSM parameter.** The provider has none; nothing here can rotate.
- **Egress.** Already correct and worth recording as checked: the API's tasks run in public
  subnets with `assign_public_ip = true` and an allow-all egress rule, so the public service is
  reachable. This is the part that would actually have broken sourcing in a deployed
  environment, and it never was broken.
