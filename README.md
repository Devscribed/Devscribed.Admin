# Devscribed.Admin

Implementation of the user-management specs in [`specs/`](specs/). Spec 01 —
[Organization Creation](specs/user-management/01-organization-creation.md) — is complete.

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
packages/validation/  every signup rule and error message — one source shared by web and API
apps/api/             NestJS: POST /api/signup, /api/login, /api/logout,
                      GET /api/me, GET /api/organizations/{orgId}/members
apps/web/             Next.js: /signup, /login, /org/{orgId}/members
e2e/                  Playwright specs, one per TC-01-E2E-* case
infra/terraform/      AWS for the documents area — one root module, dev and prod
```

`packages/validation` exists so the client and the server can never disagree about a
message. The API re-runs it on every request — the client's copy is a convenience, not a gate.

## Setup from scratch

### Prerequisites

| | Version | Why |
|---|---|---|
| Node.js | 22.x | the version CI and Vercel run; the repo uses npm workspaces |
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
npm run test:unit   # validation rules — TC-01-UNIT-01…07
npm run test:int    # signup endpoint — TC-01-INT-01…04, needs Postgres running
npm run test:e2e    # browser flows — TC-01-E2E-01…07 (starts both dev servers)
```

`test:int` resets `devscribed_test` before it starts, so a failed run never poisons the
next one. `test:e2e` starts the two dev servers itself and reuses them if they are
already up.

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

Two Vercel projects from this one repository, plus a Neon database.

| | Root directory | Framework preset | Notes |
|---|---|---|---|
| web | `apps/web` | Next.js | needs `API_ORIGIN` pointing at the api project's URL |
| api | `apps/api` | NestJS | zero-config; no `vercel.json` |

The api project needs no deployment scaffolding of its own. Vercel detects `src/main.ts`
by name, builds the whole application into a single function and runs it on Fluid
compute, so `app.listen()` behaves the same there as it does locally.

The browser only ever talks to the web domain: the front end calls relative `/api/*` and
`next.config.mjs` rewrites those to `API_ORIGIN`. That keeps the session cookie
same-origin, which is why `sameSite: 'lax'` works and no CORS configuration is involved.

API environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** endpoint (`-pooler` host), `?sslmode=require&connection_limit=1&pgbouncer=true` |
| `DIRECT_URL` | Neon direct endpoint — migrations only |
| `SESSION_SECRET` | required; without it the app silently falls back to the development key |
| `WEB_ORIGIN` | the web project's URL, used to build password-reset links |

Migrations do not run at deploy time. `.github/workflows/migrate.yml` applies them with
`prisma migrate deploy` on every merge to `main`, using the `DIRECT_DATABASE_URL` secret.

### Documents area infrastructure

The documents area (`specs/documents/`) needs storage, mail, PDF rendering, and deferred
work. Each of those sits behind a port in `apps/api/src/` — `FileStorage`, `MailService`,
`PdfRenderer`, `JobQueue`, `SignatureProvider` — registered globally in `core.module.ts`,
with the driver chosen in each port's own `*.provider.ts`. The rule is the one
`MAIL_TRANSPORT` already followed: an explicit environment variable always wins, and the
**local driver is the default whenever `NODE_ENV` is not `production`**. Nothing in the
Jest or Playwright suites touches AWS, and a fresh clone needs none of these set —
documents go to the gitignored `apps/api/.local-storage`, mail goes to the in-memory sink,
PDFs are rendered by the Playwright Chromium already installed for E2E (falling back to a
built-in single-page PDF writer, with a warning, when no browser is present), and jobs run
in-process after the transaction commits.

`apps/api/.env.example` lists every variable with its local default. The production values
come from Terraform outputs, not from the AWS console.

Terraform lives in `infra/terraform/` — one root module, two complete and independent
environments (`dev`, `prod`), composed through `-backend-config` and `-var-file`. There are
no workspaces. State is in S3 with native locking (`use_lockfile`, so Terraform >= 1.10).

```bash
cd infra/terraform
make validate     # fmt -check, init -backend=false, validate — what CI runs on a PR
make plan-dev
make apply-dev
make plan-prod
make apply-prod   # gated on a manual environment approval in CI
```

Three things are bootstrapped once, out of band, and are the only hand-made resources: the
`devscribed-tfstate-{account}` state bucket, the Vercel OIDC provider (account-global, so no
per-environment state file can own it), and the account-level SES suppression list. **No
secret value is ever written to a `.tfvars` file** — Terraform creates the Secrets Manager
containers and the IAM policies; the values are set out of band, so nothing secret can land
in the state file.

`environments/{dev,prod}.tfvars` contain exactly the inputs that the spec's "What differs
between the environments" table says differ. Everything else is defaulted in
`variables.tf` on purpose: a value present in both files is a value that can drift.

## Design-system notes

- Components come from `1_DS for dev/index.js` via the `@ds` alias
  (`experimental.externalDir`), re-exported through `apps/web/src/ds.ts` — a single
  `'use client'` boundary, since the DS uses hooks and ships no directives.
- `Input` has no way to tag its error message node, so the app passes the message as a
  node carrying `field-error-{fieldName}`. A first-class `errorId` prop belongs in the
  DS; see the "DS gaps" table in the design spec.
