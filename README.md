# Devscribed.Admin

Implementation of the specs in [`specs/`](specs/). User-management specs 01
([Organization Creation](specs/user-management/01-organization-creation.md)) and 02
([Authentication & Login](specs/user-management/02-authentication-login.md)) are complete.
The [hiring specs](specs/hiring/README.md) are at their first phase: a vacancy can be created
and a candidate can book an interview against it end to end. See [Hiring](#hiring) for what is
deliberately a stand-in until the Microsoft 365 integration lands.

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
apps/api/             NestJS: POST /api/signup, /api/login, /api/logout,
                      GET /api/me, GET /api/organizations/{orgId}/members,
                      …/hiring/vacancies, …/hiring/interviewers,
                      …/hiring/applications/{id}/cv, and the public /api/book/{slug}
apps/web/             Next.js: /signup, /login, /org/{orgId}/members,
                      /org/{orgId}/hiring/vacancies, and the public /book/{slug}
e2e/                  Playwright specs, one per TC-*-E2E-* case
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

`STORAGE_PROVIDER=fs` keeps uploaded CVs in `apps/api/.storage`, which is git-ignored.
That combination is refused outright when `NODE_ENV=production` — see
[Hiring](#hiring).

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

The same command also brings up **pgAdmin** on <http://localhost:5050> if you want to
browse the data. It opens straight into the UI with no login, and the local server is
already registered as *Devscribed (local)* — the first connect asks for the password,
which is `devscribed`. Nothing else depends on it, so it is safe to ignore or to stop on
its own with `docker compose stop pgadmin`.

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
npm run test:unit   # validation rules — TC-01-UNIT-*, TC-H01-UNIT-*, TC-H02-UNIT-07
npm run test:int    # API endpoints — TC-01-INT-*, TC-H00/H01/H02-INT-*, needs Postgres running
npm run test:e2e    # browser flows — TC-01-E2E-*, TC-H01-E2E-01, TC-H02-E2E-01
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
| Port 5050 already allocated | something else holds the pgAdmin port — change the host port in `docker-compose.yml`, or drop the service |

To start over from an empty database:

```bash
docker compose down -v
docker compose up -d
npm run db:migrate --workspace @devscribed/api
```

`-v` drops the volume, which is what makes `docker/postgres-init.sql` run again and
recreate both databases. It also clears pgAdmin's own volume, so
`docker/pgadmin-servers.json` is re-imported on the next start.

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

## Hiring

Three things hiring depends on and does not own are expressed as capabilities, each with one
implementation behind it ([`specs/hiring/00-integrations.md`](specs/hiring/00-integrations.md)).
No vendor name appears outside its own module, and no screen names one at all.

| Capability | Ships today | Where |
|---|---|---|
| `CalendarProvider` | `FakeCalendarProvider` | `apps/api/src/hiring/calendar/` |
| `Storage` | `LocalFsStorage` | `apps/api/src/hiring/storage/` |
| `MailService` | nothing — Outlook delivers the invite | — |

**The calendar is a fake, on purpose.** It resolves every address to a mailbox, reports flat
09:00–17:00 UTC weekdays, and records the events a booking creates in memory. That is enough to
run the whole booking path — the public route, the CV upload, the atomic write and its
compensation — before an Azure app registration exists, and it is what the test suites keep
running against afterwards, since neither can hold a real tenant mailbox. Set
`FAKE_CALENDAR_NO_MAILBOX` to a comma-separated list to see an ineligible interviewer in the
picker. `TenantAppOnlyProvider` arrives behind the same token; nothing that calls it changes.

Consequently, on the booking page **every time is UTC**, and the page says so. The calendar
grid, the time-zone selector, and the 12-hour toggle belong to the real availability engine and
arrive with it. The flat list of start times is the stand-in it replaces.

**Storage fails fast.** An application configured with `NODE_ENV=production` and
`STORAGE_PROVIDER=fs` refuses to start, naming the variable, and opens no listener. A Vercel
function's filesystem is read-only except `/tmp`, and `/tmp` does not survive the invocation —
so the alternative is accepting bookings and silently discarding every CV. This is deliberately
stricter than `SESSION_SECRET`, which falls back to a development key without complaint: a
missing signing key breaks loudly on the next request, where a discarded CV breaks silently and
cannot be recovered.

CVs are streamed through `GET /api/organizations/{orgId}/hiring/applications/{id}/cv`, never
linked to. Storage keys are `{applicationId}{extension}` — application-generated, never derived
from the uploaded filename, and never present in any response.

`/book/{slug}` is the product's only public route. The slug carries 72 bits of entropy, which is
why it needs no organization segment, and it is frozen at creation so a link already sent keeps
working. There is **no rate limiting on the booking POST** — see
[02 §11](specs/hiring/02-booking-page.md), which records the exposure that leaves open rather
than implying the endpoint is protected.

## Design-system notes

- Components come from `1_DS for dev/index.js` via the `@ds` alias
  (`experimental.externalDir`), re-exported through `apps/web/src/ds.ts` — a single
  `'use client'` boundary, since the DS uses hooks and ships no directives.
- `Input` has no way to tag its error message node, so the app passes the message as a
  node carrying `field-error-{fieldName}`. A first-class `errorId` prop belongs in the
  DS; see the "DS gaps" table in the design spec.
- Hiring closed several gaps the design specs had already recorded, in the design system
  rather than in the screens: `BookingLayout`, `Textarea`, `FileInput`, `Toast` and
  `Skeleton` are new components; `SelectOption` gained `disabled`, `hint` and `testId` so
  an ineligible interviewer can be shown-but-disabled with its reason; `Table` gained
  `rowHref`/`rowTestId`; `Modal` now forwards unknown props to its panel, matching `Card`
  and `AuthLayout`. `Button`'s disabled state drops to a sunken field with faint ink
  instead of fading the violet fill — a 55%-opacity primary still reads as the primary
  action, which is the one thing a disabled CTA must not do.
- Still outstanding for later hiring phases: `Calendar`, `Combobox`, `Menu`, `Tooltip`,
  and promoting the template's `P` glyph dictionary to real icon exports.
