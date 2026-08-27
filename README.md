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
console, and exactly one thing in the account is reachable from the internet: the web service.

```bash
export AWS_PROFILE=Devscribed.Admin-Admins
make bootstrap            # once per AWS account: the Terraform state bucket
make deploy-dev           # build, push, apply, wait for health, migrate
make url-dev              # the address to open
```

`main` deploys itself. A push runs the whole suite and then rolls `dev` forward; a `v*` tag — made
by `npm run release` — does the same and rolls `prod`. Nothing reaches an environment on a red run.

**[`docs/deployment.md`](docs/deployment.md) is the runbook**: the topology, first-time setup, every
`make` target, the CI/CD pipeline, releasing, rolling back, what to do when a deploy fails, and the
Terraform layout.

## Design-system notes

- Components come from `1_DS for dev/index.js` via the `@ds` alias
  (`experimental.externalDir`), re-exported through `apps/web/src/ds.ts` — a single
  `'use client'` boundary, since the DS uses hooks and ships no directives.
- `Input` has no way to tag its error message node, so the app passes the message as a
  node carrying `field-error-{fieldName}`. A first-class `errorId` prop belongs in the
  DS; see the "DS gaps" table in the design spec.
