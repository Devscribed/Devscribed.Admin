# 0005 — The E2E suite runs beside a dev environment, not instead of it

**2026-08-31.** Accepted.

## The rule

A local E2E run holds ports it is told to hold and writes to a database of its own.
`E2E_WEB_PORT` and `E2E_API_PORT` move the whole run — servers, `baseURL`, the rewrite
target, and the signing links in the mail sink. The database is `devscribed_e2e`, never
`devscribed_dev`.

Defaults are unchanged: 3000, 4000. Nobody has to learn any of this to run
`npm run test:e2e`.

## What it replaces

Both numbers were spelt into `playwright.config.ts`, and `DATABASE_URL` was not named at
all — so the API the suite started inherited `apps/api/.env` and wrote into the developer's
own database.

Two consequences, and the second is the worse one.

**The suite could not run while anyone was working.** `reuseExistingServer` is
`!process.env.CI`, and the convention for agents is `CI=1`, which is right: reuse would
silently borrow whatever server happened to be up, including one pointed at the real
signing provider with a real API key. So the suite refused to start with "port already in
use", and the honest options were to stop working or to skip the suite. The suite is what
got skipped — measurably: a regression case written that day was committed unrun, with the
reason recorded in its own bug report.

**Every run polluted the dev database.** The suite creates an organization, an account and
usually an envelope per case, and deletes none of it. At the time this was found,
`devscribed_dev` held 3,803 organizations. Nothing about a green run said which server it
had talked to.

## Why not the alternatives

**Reuse the running dev servers.** They are configured for development, not for a hermetic
run: `SIGNWELL_DRIVER=http` means real documents against the provider's quota. The
`webServer` block names `stub`, `memory`, `local` and `inline` precisely so a run cannot
depend on how someone's server happened to be started, and reuse throws all of it away.

**Point the suite at `devscribed_test`.** It is already created and migrated, but the
integration suite truncates tables in every `beforeEach`, so the two suites could not be run
at the same time and the failure would look like flake.

**Create `devscribed_e2e` in `docker/postgres-init.sql` only.** That script runs once, on an
empty data volume, so every existing machine would need `docker compose down -v` — throwing
away the dev data this ADR exists to protect. The line is there for fresh clones; what makes
it work everywhere is that `prisma migrate deploy` creates a missing database, so the E2E
global setup needs nothing else.

## What it costs

A third database on the local server, and one more file — `e2e/environment.ts` — that the
config, the global setup and the tests' API client all import. That import is the point:
the first relocated run failed on a `localhost:3000` spelt into a test file, where the page
was right and the constant was stale. There is now one place that knows.

## What it does not fix

The E2E database is never wiped. Cases isolate themselves by minting their own accounts, so
nothing needs wiping for correctness; what accumulates is leftovers in a database nobody
looks at. Drop it when it bothers you.

Nor does it make the suite safe to run twice at once — two runs on the same ports still
collide, and two runs on different ports share the one database. That is what
`E2E_DATABASE_URL` is for, and no default gives each run its own the way the integration
suite gives each worker one.
