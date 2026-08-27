# Devscribed.Admin

Implementation of the specs in [`specs/`](specs/). Complete today: user-management spec
01 — [Organization Creation](specs/user-management/01-organization-creation.md) — and the
whole [document builder](specs/documents/) area, specs 01 through 03: contract templates,
two-party electronic signature, and autofill from the member profile.

## Stack

| Layer | Choice |
|---|---|
| API | NestJS 11, Prisma, PostgreSQL (Docker locally, Neon in production) |
| Web | Next.js 15 (App Router), React 19 |
| UI | Teammerly Meridian (`1_DS for dev/`), imported through `@ds` — no hardcoded colors or sizes |
| Unit tests | Vitest |
| Integration tests | Jest + Supertest against a disposable Postgres database |
| E2E | Playwright |

## Layout

```
packages/validation/  every rule and error message — one source shared by web and API
apps/api/             NestJS: auth, members, /document-templates, /envelopes,
                      the public /api/sign surface, and /api/internal
apps/web/             Next.js: /signup, /login, /org/{orgId}/…, and /sign/{token},
                      the one route in the app that has no session
e2e/                  Playwright specs, one file per spec area
infra/terraform/      AWS for the documents area — one root module, dev and prod
```

`packages/validation` exists so the client and the server can never disagree about a
message. The API re-runs it on every request — the client's copy is a convenience, not a gate.

## Setup from scratch

### Prerequisites

| | Version | Why |
|---|---|---|
| Node.js | 22.x | the version CI and both container images run; the repo uses npm workspaces |
| Docker | any recent | supplies Postgres 17 — nothing is installed on the host |

Nothing else is needed globally: the Prisma CLI, Nest CLI and Playwright all come from
`node_modules`.

### 1. Install dependencies

```bash
npm install
```

Run it from the repository root, not from inside `apps/api` — one install covers every
workspace. It ends by running `prisma generate` (the API's `postinstall`), which writes
the typed client into `node_modules/.prisma`. If your editor reports unknown Prisma
types later, this is the step to repeat.

### 2. Create the API's environment file

```bash
cp apps/api/.env.example apps/api/.env
```

The defaults already match the Docker database below, so nothing needs editing. `.env`
is deliberately untracked, which means every machine — and every fresh clone — needs
this step. `SESSION_SECRET` there is a development placeholder; every deployed
environment must override it.

### 3. Start Postgres

```bash
docker compose up -d
```

This brings up `postgres:17-alpine` as the container `devscribed-postgres` and creates
two databases on it:

| Database | Used by |
|---|---|
| `devscribed_dev` | the dev server — data survives restarts |
| `devscribed_test` | the integration suite — wiped at the start of every run |

They are separate so that a test run does not delete whatever you were looking at in
development.

The container listens on **5433**, not the usual 5432, so it cannot collide with a
Postgres you already have running. It restarts with Docker, so this is a one-time step.
Check on it with:

```bash
docker compose ps
```

Wait for the status to read `healthy` before continuing — an immediate `migrate` against
a still-initialising server fails with a connection error.

### 4. Build the shared validation package

```bash
npm run build --workspace @devscribed/validation
```

`packages/validation` is consumed as compiled output by both the API and the web app.
The API's `prebuild` does this automatically, but the dev server does not, so a fresh
clone needs it once.

### 5. Apply the database schema

```bash
npm run db:migrate --workspace @devscribed/api
```

Runs `prisma migrate deploy` against `devscribed_dev` — the same command CI runs against
Neon, so local and production schemas come from one source. `npm run dev` repeats it
automatically on every start, so you will rarely type it again.

### 6. Install the Playwright browsers

```bash
npx playwright install chromium
```

Only needed if you intend to run `npm run test:e2e`; skip it otherwise.

## Running

```bash
npm run dev --workspace @devscribed/api   # http://localhost:4000
npm run dev --workspace @devscribed/web   # http://localhost:3000
```

Two terminals — the API must be up before the web app can serve anything past the login
screen. Open http://localhost:3000/signup and create an organization to get a usable
account.

The web app proxies `/api/*` to the API (`next.config.mjs` rewrites), so the session
cookie is same-origin and `httpOnly`. That is also why the browser only ever addresses
port 3000; calling port 4000 directly is only useful for `curl`.

Password-reset mail has no real transport outside production. The link is printed to the
API's console and served from `GET /api/test/mail/latest`, which is how the E2E suite
reads it.

## Tests

```bash
npm run test:unit   # pure rules: validation, sanitizer, hash chain, autofill
npm run test:int    # every endpoint, against a disposable database — needs Postgres
npm run test:e2e    # browser flows, including signing (starts both dev servers)
```

Every test case in the specs has a test named after it, so `TC-02-INT-14` in
`specs/documents/02-envelopes-and-signing.md` and the `describe` that proves it are one
search apart. `.github/workflows/test.yml` runs all three tiers on every pull request.

`test:int` resets `devscribed_test` before it starts, so a failed run never poisons the
next one. `test:e2e` starts the two dev servers itself and reuses them if they are
already up — which is worth knowing, because a stale server left on port 3000 gets
adopted silently. If a whole E2E run fails at the login screen, check what is actually
answering there before looking anywhere else.

### When something is off

| Symptom | Cause |
|---|---|
| `Can't reach database server at localhost:5433` | container is down — `docker compose up -d` |
| `The table 'public.Account' does not exist` | schema never applied — step 5 |
| `@devscribed/validation` fails to resolve | package not built — step 4 |
| `Environment variable not found: DATABASE_URL` | `apps/api/.env` missing — step 2 |
| Port 5433 already allocated | another container holds it — `docker compose down`, or change the host port in `docker-compose.yml` and in `.env` |

To start over from an empty database:

```bash
docker compose down -v
docker compose up -d
npm run db:migrate --workspace @devscribed/api
```

`-v` drops the volume, which is what makes `docker/postgres-init.sql` run again and
recreate both databases.

## The app shell

Every signed-in route lives under `/org/{orgId}/` and renders inside one shell —
sidebar, top bar, page header — built in `apps/web/src/layout/`. It is documented in
[00-app-shell.design.md](specs/user-management/00-app-shell.design.md), which also
records why the shell sits in the app rather than in the design system.

The organization id in the URL is never a selector. `OrgScopeGuard`
(`apps/api/src/auth/org-scope.guard.ts`) compares it against the session cookie and
answers 404 on any disagreement; queries still scope by the session.

## Deployment

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
[`specs/documents/02-envelopes-and-signing.md`](specs/documents/02-envelopes-and-signing.md), under
*AWS Infrastructure*.

### First time, in one account

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

### Every day

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

**Migrations run after the rollout**, from the same image the API runs. That is safe because
migrations here are additive by rule (see [CLAUDE.md](CLAUDE.md)): the deploy and the migration are
independent and either order must work. They have to run inside the VPC because the database has no
route out of it, which is also why they cannot be run from a laptop or a CI runner directly.

### Pausing an environment

```bash
make stop-dev             # both services to zero tasks; alarms and the hourly sweep disarm with them
make start-dev
```

The load balancer and the database keep running and keep billing. This stops the compute half,
which for an idle dev environment is most of the bill — roughly $62/month becomes roughly $40.
Nothing is destroyed and no data is lost.

### Automatic deploys from GitHub

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) exists and is **off**, behind three
separate switches:

1. The repository variable `DEPLOY_ENABLED` must be `true`.
2. `AWS_DEPLOY_ROLE_DEV` / `AWS_DEPLOY_ROLE_PROD` must hold the ARNs that
   `terraform output github_deploy_role_arn` prints for each environment.
3. The automatic `push` trigger is commented out. Until it is uncommented, even a fully configured
   repository only deploys when somebody presses the button.

The workflow runs `infra/deploy.sh` — the same script `make deploy-dev` runs. One code path, so what
CI does is what somebody has already done by hand, and an image deployed from CI lands in the same
Terraform state rather than drifting away from it.

Authentication is GitHub OIDC: **no AWS access key exists** in this repository, in its secrets, or
in the account. The role's trust policy matches `repo:Devscribed/Devscribed.Admin:environment:{env}`,
and because that claim only takes the `environment:` form when a job declares an environment,
GitHub's required-reviewers setting on `prod` becomes part of the credential rather than part of the
interface.

`.github/workflows/migrate.yml` — which applied migrations to Neon on every merge to `main` — is
gone. The database is no longer reachable from a GitHub runner, and migrations are part of the
deploy.

### How the application is configured

Storage, mail, PDF rendering, deferred work, and signing each sit behind a port in `apps/api/src/`
— `FileStorage`, `MailService`, `PdfRenderer`, `JobQueue`, `SignatureProvider` — registered globally
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

### Terraform layout

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

## Design-system notes

- Components come from `1_DS for dev/index.js` via the `@ds` alias
  (`experimental.externalDir`), re-exported through `apps/web/src/ds.ts` — a single
  `'use client'` boundary, since the DS uses hooks and ships no directives.
- `Input` has no way to tag its error message node, so the app passes the message as a
  node carrying `field-error-{fieldName}`. A first-class `errorId` prop belongs in the
  DS; see the "DS gaps" table in the design spec.
