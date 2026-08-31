# Deployment

How this product reaches an environment, and what to do when it does not.

The commands are in [`Makefile`](../Makefile), the pipeline is
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), and the infrastructure is
[`infra/terraform/`](../infra/terraform). This document is the runbook over the three; where it
disagrees with them, they are right and this is stale.

Everything runs on AWS — web, API, database, storage, mail — in two complete and independent
environments, `dev` and `prod`. Terraform describes all of it; nothing is created by hand in the
console.

```
  the internet ──HTTPS──►  ALB  ──►  web (Fargate, Next.js)
                                       │  /api/* rewritten by next.config.mjs
                                       ▼
                                     api (Fargate, NestJS + Chromium)   ← no public address
                                       ├──► RDS PostgreSQL   (private subnets, no route out)
                                       ├──► S3 documents     (SSE-KMS, versioned)
                                       └──► SES v2
```

Exactly one thing in the account is reachable from the internet: the web service. The API is not,
because it does not need to be — the browser calls relative `/api/*` and `next.config.mjs` rewrites
those to a Cloud Map name that resolves only inside the VPC. That is the same rewrite that makes
local development work, and it is what keeps the session cookie same-origin with no CORS involved.

The web service runs on **ECS Express Mode**, which creates and owns its load balancer, TLS
certificate, DNS name, and scaling policy — so the deployment has an HTTPS address without this
account owning a domain. The full topology, the trade-offs, and the per-line cost are in
[`specs/documents/02-envelopes-and-signing.md`](../specs/documents/02-envelopes-and-signing.md), under
*AWS Infrastructure*.

## First time, in one account

```bash
export AWS_PROFILE=Devscribed.Admin-Admins    # the Makefile defaults to this
make bootstrap            # creates the Terraform state bucket. Idempotent; run once per account
make deploy-dev           # builds, pushes, applies, waits for health, runs migrations
make url-dev              # the address to open
```

`make bootstrap` is the only step outside Terraform, and the only hand-made resource in the account
is the state bucket it creates. A Terraform root module that creates its own backend has to keep its
first state file somewhere else, and that file becomes the thing nobody can rebuild.

Two things need a human once, after the first apply, and neither can be automated:

- **Confirm the SES identity.** AWS mails a verification link to every address in `verified_emails`.
  Until it is clicked that address can neither send nor — while the account is in the SES sandbox,
  which it is — receive. `terraform output ses_verification_pending` lists them.
- **Confirm the alarm subscription.** SNS mails a confirmation link to `alarm_email`. Until it is
  clicked, alarms fire into nothing.

## Every day

```bash
make deploy-dev           # both services, then migrations
make deploy-dev-api       # the API alone — web keeps the digest it is already running
make deploy-dev-web       # and the reverse
make plan-dev             # what an apply would change, without changing it
make infra-dev            # apply infrastructure without rebuilding images
make migrate-dev          # prisma migrate deploy, as a one-off task inside the VPC
make url-dev              # print the address
make logs-dev-api         # tail
make stop-dev             # scale both services to zero
make start-dev            # bring them back
make destroy-dev          # tear it down
```

Every target exists for `prod`: `make deploy-prod`, `make plan-prod`, and so on. They are
deliberately the same number of keystrokes as the dev ones, so nobody builds a habit that ends at
the wrong environment — and `infra-prod` is not auto-approved.

Run these from **Git Bash** on Windows; the recipes are bash.

Images deploy **by digest, never by tag**. A tag is a pointer somebody else can move, and the image
a plan promises has to be the image that runs. Deploying one service reads the other's current
digest out of the state, so a web deploy cannot silently roll the API forward or back. Both services
are applied with `wait_for_steady_state`, so `make deploy-dev` failing means the deploy failed —
not that it was merely submitted.

**Migrations run after the rollout by default**, from the same image the API runs, and they have to
run inside the VPC because the database has no route out of it — which is also why they cannot be run
from a laptop or a CI runner directly.

Migrations here are additive by rule (see [CLAUDE.md](../CLAUDE.md)), and it is worth being exact
about what that buys. **Additive makes the rollback safe, not the roll-out window.** Nothing is
renamed, dropped or narrowed, so the previous release's code keeps running against the new schema and
a code rollback never needs a schema rollback. It says nothing about the gap between the new tasks
going healthy and `prisma migrate deploy` finishing.

**A release that adds columns to a table the running code reads must migrate first.** Prisma's
generated client enumerates columns in its `SELECT` rather than using `SELECT *`, so from the moment
the new tasks are serving until the migration lands, every read of that table asks for a column that
does not exist yet and fails with Postgres `42703`. A column default protects a row that is written;
it does not protect a query naming a column that is absent. For that class of release the order is:

```bash
make migrate-dev          # additive, so the release currently running ignores what it adds
make deploy-dev           # then roll the services out onto the schema they expect
```

`make deploy-<env>` still runs `prisma migrate deploy` at the end; having migrated first only makes
that step a no-op. And because push to `main` deploys `dev` by itself through `infra/deploy.sh` —
rollout first, migration second — a release in this class has its migration applied **before** the
merge, not after it.

The first release that needs this order is **spec 04, signature providers**: it adds
`Organization.signatureProviderKey`, four `Envelope.provider*` columns and
`EnvelopeSigner.providerRef` to tables the documents list and detail read on every request, so
deploying first answers 500 from both screens for the length of the rollout. Releases that only add a
table nothing yet reads, or a column only the new code touches, are unaffected and keep the default
order.

## Pausing an environment

```bash
make stop-dev             # both services to zero tasks; alarms and the hourly sweep disarm with them
make start-dev
```

The load balancer and the database keep running and keep billing. This stops the compute half,
which for an idle dev environment is most of the bill — roughly $62/month becomes roughly $40.
Nothing is destroyed and no data is lost.

## Automatic deploys from GitHub

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) is the pipeline for `main`. It
deploys; it does not test:

| Trigger | Runs the suite | Then deploys |
|---|---|---|
| pull request | yes ([`test.yml`](../.github/workflows/test.yml)) | nothing |
| push to `main` | no | `dev` |
| tag `v*` pointing at a commit on `main` | no | `prod` |
| manual dispatch | no | whichever environment you pick |

**The suite runs on the pull request.** [`test.yml`](../.github/workflows/test.yml) is triggered by
`pull_request` and by nothing else, so a change is proved green before it is merged and the merge
itself re-runs nothing. That keeps the whole suite, Playwright included, to one run per change and
takes roughly three minutes off every deploy.

It also means the pull request is the only gate there is. **Turn on branch protection for `main`
requiring the three test checks** — with it off, a push straight to `main` deploys code no suite has
run, to an environment people are using.

The deploy half is gated on switches that remain deliberately:

1. The repository variable `DEPLOY_ENABLED` must be `true`. A repository with it unset deploys
   nothing, however the workflow is triggered.
2. `AWS_DEPLOY_ROLE_DEV` / `AWS_DEPLOY_ROLE_PROD` must hold the ARNs that
   `terraform output github_deploy_role_arn` prints for each environment. The job checks its own
   **before** asking AWS for anything, so an unset one fails with a sentence naming the variable
   rather than with an opaque OIDC rejection.

### How long the suite takes

The suite is what a reviewer waits on before merging. The E2E half is sharded across runners to
keep that short:

| Job | Shards | Each |
|---|---|---|
| Unit | 1 | ~40s |
| Integration | 1 | ~2m30s |
| E2E | 3 | ~3m |

Roughly three minutes end to end, down from 6m40s when the 120 browser tests ran two at a time on
one runner. Each E2E shard is a separate runner with **its own Postgres service container**, which
is what makes sharding safe rather than merely faster: the suite mints accounts in a shared
database and would not survive two shards pointed at one server. Nothing about the tests changed —
only how many machines run them.

The integration suite is one runner and sharded across two until that stopped paying: `jest
--maxWorkers=4` already parallelises it inside the runner, each worker on its own database by
`TEMPLATE` copy, so a second machine bought a fraction of a suite that is not the long pole in
exchange for a whole extra `npm ci` and service container.

`AWS_DEPLOY_ROLE_PROD` is unset today because prod has never been applied — there is no role to
name yet. A `v*` tag will fail at that check until `make infra-prod` has run once.

A prod tag is verified to point at a commit on `main` before anything is built. A tag can be created
on any commit, including one that was never reviewed, and GitHub will happily run the workflow for
it.

After the rollout the workflow asks the deployed address for `/api/health` and fails the run if it
never answers 200. `deploy.sh` already waits for both services to reach steady state, so this is not
"did the rollout finish" — it is the one question a rollout cannot answer about itself.

The workflow runs `infra/deploy.sh` — the same script `make deploy-dev` runs. One code path, so what
CI does is what somebody has already done by hand, and an image deployed from CI lands in the same
Terraform state rather than drifting away from it.

Authentication is GitHub OIDC: **no AWS access key exists** in this repository, in its secrets, or
in the account. The role's trust policy matches `repo:Devscribed/Devscribed.Admin:environment:{env}`,
and because that claim only takes the `environment:` form when a job declares an environment,
GitHub's required-reviewers setting on `prod` becomes part of the credential rather than part of the
interface — and a branch cannot deploy prod by being named something clever.

`.github/workflows/migrate.yml` — which applied migrations to Neon on every merge to `main` — is
gone. The database is no longer reachable from a GitHub runner, and migrations are part of the
deploy.

## Releasing to prod

Prod moves on a tag, and the tag is made by [`release-it`](https://github.com/release-it/release-it):

```bash
npm run release:dry       # everything it would do, doing none of it
npm run release           # pick patch/minor/major, then it does the rest
```

It runs the unit suite, asks for the bump, writes the section for this version into
`CHANGELOG.md`, commits `Release v<version>`, tags `v<version>`, pushes both, and opens a GitHub
release. The pushed tag is what starts the pipeline above, which runs the full suite again on a
clean runner before prod sees anything.

Three guards are on by default and worth leaving on: the working tree must be clean, the branch must
be `main`, and `main` must have an upstream. Releasing a dirty tree produces a version that exists
in no commit.

`GITHUB_TOKEN` has to be in the environment for the release step. With the `gh` CLI already signed
in, that is:

```bash
GITHUB_TOKEN="$(gh auth token)" npm run release
```

The changelog is generated from commit subjects by [`scripts/changelog.mjs`](../scripts/changelog.mjs)
rather than by `@release-it/conventional-changelog`. That plugin reads the bump and the headings out
of `feat:` / `fix:` prefixes, and this repository writes commit subjects as sentences — it would
file every one of them under "other", never bump anything, and produce an empty changelog. Editing a
generated section afterwards is fine; hand-adding a version is not, because the tag is what makes a
release.

## Rolling back

There is no rollback command, and that is deliberate rather than missing. Both services run a
specific image **digest**, recorded in Terraform state, so going back is the same operation as going
forward — deploy the commit you want:

```bash
git checkout <the good commit>
make deploy-dev
```

The pipeline does the same thing from `main`: revert the merge and push. A `git revert` is a commit,
so it flows to `dev` on its own and reaches `prod` on the next tag.

Two things do not come back with the code, and knowing which is which is the whole of a calm
rollback:

- **Migrations do not roll back.** They are additive by rule (see [CLAUDE.md](../CLAUDE.md)), which
  is exactly what makes redeploying older code safe: the older code ignores the newer column. What
  is not safe is writing a migration that drops or renames something, because then this paragraph
  stops being true. If one ever has to, it goes out as two releases — add and backfill, then remove
  in a later one, after the code that used it is gone from every environment.
- **Data does not roll back.** Signed documents are in S3 under versioning, and in `prod` under an
  Object Lock; a bad deploy that wrote bad rows leaves them written.

To check what is actually running before and after:

```bash
make output-dev | grep image        # the digests Terraform believes are deployed
```

## When a deploy fails

`make deploy-dev` failing means the deploy failed, not that it was submitted — both services are
applied with `wait_for_steady_state`. Work down this list; it is ordered by how often each one is
the answer.

**Read the service events first.** ECS says why it is not stabilising, in one line, and it is
usually a task that starts and immediately exits:

```bash
aws ecs describe-services --cluster devscribed-dev   --services devscribed-dev-api --query 'services[0].events[:5]' --output table
```

**Then the container's own logs.** A task that exits on boot has written its reason:

```bash
make logs-dev-api          # tails /ecs/devscribed-dev/api
make logs-dev-web
```

**A failed apply leaves outputs from the previous one.** `terraform output` answers from the last
*successful* state, so a value read after a failure can describe an environment that no longer
exists. This is not hypothetical — building the web image against a stale `api_internal_origin`
produced a web app that proxied to a namespace that had never been created, and answered 500 to
every API call. `infra/deploy.sh` derives that origin deterministically rather than reading it back
for exactly this reason.

**Migrations run after the rollout, unless the release ordered them first.** A green rollout followed
by a red migration means the new code is already serving against the old schema — so whether the
environment is broken depends on what the migration adds. If the new code reads columns the migration
was going to create, every such read is failing with `42703` right now and the screens over them are
answering 500; that is an outage, and the fix is to get `make migrate-dev` green immediately.
If the new code only writes what the migration adds, or reads nothing it creates, the environment is
serving normally and the schema is merely behind. Either way, fix forward with `make migrate-dev`
rather than rolling the services back — the migration is additive, so rolling back does not undo it
and re-running it is safe. See *Every day* above for which releases must migrate before the rollout.

**A stuck Terraform lock.** State is in S3 with native locking. An apply killed mid-run (a laptop
closing, a CI job cancelled) can leave the lock file behind; `terraform force-unlock <id>` in
`infra/terraform` clears it, and it is safe only once nothing is still applying.

**In CI, the first suspects are different.** An OIDC rejection means the environment name in the
job and the `github_allowed_refs` in the environment's `.tfvars` disagree — the role's trust policy
matches `environment:<name>` and nothing else. An unset role variable fails before AWS is contacted,
naming the variable to set.

## Watching an environment

```bash
make url-dev              # the address people open
make output-dev           # every name, ARN, and digest this environment has
make logs-dev-api         # tail, --since 10m
make logs-dev-web
```

Alarms publish to an SNS topic per environment, and the email subscription needs confirming once
(see above). `make stop-dev` disarms them along with the services, so an environment stopped on
purpose does not page anyone.

The API is not reachable from a laptop, so there is no port to curl and no bastion to hop through.
To get a shell in a running task — to read a live connection pool, or run a one-off query — use ECS
Exec, which the task role already allows and CloudTrail already records:

```bash
aws ecs execute-command --cluster devscribed-dev   --task <task-id> --container api --interactive --command /bin/sh
```

## How the application is configured

Storage, mail, PDF rendering, deferred work, and signing each sit behind a port in `apps/api/src/`
— `FileStorage`, `MailService`, `PdfRenderer`, `JobQueue`, `SigningProviderRegistry` — registered globally
in `core.module.ts`, with the driver chosen in each port's own `*.provider.ts`. The rule is the one
`MAIL_TRANSPORT` already followed: an explicit environment variable always wins, and the **local
driver is the default whenever `NODE_ENV` is not `production`**.

Nothing in the Jest or Playwright suites touches AWS, and a fresh clone needs none of these set:
documents go to the gitignored `apps/api/.local-storage`, mail goes to the in-memory sink, PDFs are
rendered by the Playwright Chromium already installed for E2E, and jobs run in-process after the
transaction commits. `apps/api/.env.example` lists every variable with its local default.

In a deployed environment those values come from Terraform, not from the console, and no person
types a secret. `SESSION_SECRET` and `INTERNAL_TASK_SECRET` are generated by Terraform and stored as
SSM `SecureString` parameters; the database URL is assembled and stored the same way; the container
resolves all three through its execution role. **No secret value is ever written to a `.tfvars`
file.**

### Turning SignWell on

Signature providers are chosen per organization on `/org/{orgId}/settings/signing`, and SignWell is
offered there only when its configuration is **present** — the API key, the API application id, and
the webhook id. Until then the row is visible, disabled, and names what is absent, which is the
state both environments ship in: every organization signs with the in-house engine, which is what
they default to anyway.

It ships that way because two of the three values are a third party's. Terraform creates the
parameters and the execution-role grant that reads them and **never the values**, exactly as it does
not create the value behind `DATABASE_URL`. So enabling it is four steps, and one of them happens
outside this repository:

```bash
# 1. Write the key. The sandbox account's for dev, the production account's for prod.
aws ssm put-parameter --type SecureString --overwrite \
  --name /devscribed-dev/SIGNWELL_API_KEY --value '<the key>'

# 2. Register a webhook against this environment's public address and write back the id it
#    returns. The id IS the secret: it is the only input to delivery hash verification.
aws ssm put-parameter --type SecureString --overwrite \
  --name /devscribed-dev/SIGNWELL_WEBHOOK_SECRET --value '<the webhook id>'
```

3. In `infra/terraform/environments/dev.tfvars`, set `signwell_secrets_provisioned = true` and
   `signwell_api_application_id` to the branding profile, then `make apply-dev`.
4. `make deploy-dev`, because a task definition change is what puts the new values in front of a
   running container.

**Why the flag, rather than injecting the parameters always.** An SSM `SecureString` cannot hold an
empty string, so a parameter waiting for its value holds a placeholder — and the application asks
whether the variable is *present*, not whether it is real. A placeholder in the container would make
the settings screen report SignWell configured, let an admin select it, and turn every send through
it into a 503. The flag is how "configured" keeps meaning what the screen says it means.

**Step 2 has a prerequisite neither stand has yet:** a public address SignWell can reach. Until one
exists the webhook is registered against a developer tunnel, or not at all. That costs timeliness
and not correctness — every envelope converges on the next read of it and on the hourly sweep
regardless of whether a notification ever arrives — so an environment with no registration works, it
is merely slower. A registration is deleted the moment its callback address stops being ours:
deliveries carry a working signing link per recipient, so a tunnel hostname that gets reassigned
hands the ability to sign as a counterparty to whoever answers there.

#### Registering a webhook against a local tunnel

Step 2's prerequisite is a public address, and on a workstation that means a tunnel. The
procedure is the same one an environment will use; only the hostname differs.

1. **Tunnel the API, not the web app.** Deliveries arrive at `POST /api/webhooks/signwell`
   (`apps/api/src/webhooks/signwell-webhook.controller.ts:49`), which is Nest on `:4000`.
   Next on `:3000` is not involved — SignWell calls the API directly.

   ```bash
   ngrok http 4000
   ```

2. **Register the callback.** In SignWell, *Settings → API → Workspace Callback URLs*, set the
   Event Callback URL to `https://<host>/api/webhooks/signwell` and save.

3. **Read back the id, because the id is the secret.** SignWell shows the URL but not the
   registration's id, and this repository's client only lists hooks
   (`signwell-http-client.ts:285`), so ask the API directly:

   ```bash
   curl -s -H "X-Api-Key: $SIGNWELL_API_KEY" https://www.signwell.com/api/v1/hooks/
   ```

   Take the `id` of the entry whose `callback_url` is yours. `verifySignWellHash`
   (`apps/api/src/webhooks/signwell-notification.ts:40`) computes
   `HMAC-SHA256(webhookId, "<type>@<time>")`, so the registration id **is** the HMAC key.
   There is no separate secret to find.

4. **Point the API at it** and restart, since the environment is read once at boot:

   ```
   SIGNWELL_WEBHOOK_SECRET="<the id>"
   SIGNWELL_DRIVER="http"
   ```

5. **Watch a delivery.** ngrok's inspector on `http://127.0.0.1:4040` shows the body. A hash
   that does not verify answers 401 and writes nothing but the fact that a notification
   arrived, which is requirement 21.

**Delete the registration when the tunnel goes away.** A free tunnel hands out a new hostname
each time it starts, and the one you abandoned goes to somebody else — together with
deliveries carrying a working `embedded_signing_url` per recipient. That is the ability to
sign as a counterparty, handed to whoever answers there. The same rule the environments follow
applies here and is easier to forget.

`SIGNWELL_API_APPLICATION_ID` is not a secret and is not the API key: it is the **Unique ID**
under *Settings → API → API Apps*, which names the branding profile the widget wears.

#### Exercising the whole journey locally, without SignWell

`SIGNWELL_DRIVER=stub` answers the provider boundary from memory and is refused outright when
`NODE_ENV` is production. With it, no account, tunnel or registration is needed: set
`SIGNWELL_WEBHOOK_SECRET` to any non-empty string — `provider-registry.ts:95` tests presence,
not validity — and the settings screen, the provider switch, the send and the signing surface
all work end to end. It is the fastest way to see the feature, and the only thing it cannot
show you is a real delivery.

`SIGNWELL_TEST_MODE` is deliberately not a variable. It is written once in `modules/app/api.tf` and
both environments read that line, because going live is a change with a legal review of the
counterparty-facing copy attached to it and not a side effect of editing a tfvars file. This release
ships `true` everywhere.

## Terraform layout

```
infra/
  bootstrap.sh          the state bucket. The only hand-run step, and it is idempotent
  deploy.sh             build → push → resolve digest → apply → migrate
  migrate.sh            prisma migrate deploy, as a one-off task inside the VPC
  terraform/
    main.tf variables.tf outputs.tf versions.tf
    modules/            network database registry app storage mail sweep observability cicd
    environments/       dev.tfbackend dev.tfvars prod.tfbackend prod.tfvars
```

One root module, two environments, composed through `-backend-config` and `-var-file`. **No
workspaces**: a mistyped `terraform workspace select` is a one-keystroke path from a dev change to a
prod bucket. State is in S3 with native locking (`use_lockfile`, so Terraform >= 1.10), and the AWS
provider is pinned `~> 6.38` because that is the release that added
`aws_ecs_express_gateway_service`.

`environments/{dev,prod}.tfvars` contain **only** what genuinely differs between the environments —
the name, the address space, and every switch that decides whether a mistake is recoverable. Task
sizes, the database class, scaling targets, and token lifetimes are defaults in `variables.tf`, on
purpose: a value present in both files is a value that can drift, and an environment that behaves
differently from prod stops being a test of prod.

```bash
make validate             # fmt -check, init -backend=false, validate
```

> **Offline provider mirror.** This machine's `terraform.rc` pins provider installation to
> `C:/terraform-mirror` with no `direct` fallback, because the registry is not reachable without a
> VPN. Adding or upgrading a provider means topping the mirror up first, with the registry
> reachable:
>
> ```bash
> TF_CLI_CONFIG_FILE=<a config with `provider_installation { direct {} }`> \
>   terraform -chdir=infra/terraform providers mirror -platform=windows_amd64 -platform=linux_amd64 C:/terraform-mirror
> terraform -chdir=infra/terraform providers lock -platform=windows_amd64 -platform=linux_amd64
> ```
>
> Both platforms, because `.terraform.lock.hcl` is committed and a GitHub runner is `linux_amd64`.
