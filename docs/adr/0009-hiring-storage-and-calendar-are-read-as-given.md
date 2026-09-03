# 0009 — Hiring's storage and calendar are read as given, in every environment

**Decided** 2026-09-03.

## The rule now

`STORAGE_PROVIDER` and `CALENDAR_PROVIDER` are the only inputs to the choice of CV storage and
calendar. `NODE_ENV` plays no part. An environment that sets `fs` keeps CVs only for as long as
the filesystem it writes to lasts, and one that sets `fake` takes bookings that create no
calendar event; setting either is the environment's statement that it accepts that. Each
Terraform environment names both values in its `.tfvars`, with no default for the two
providers, so the choice is visible in review rather than inherited.

What the resolvers still refuse, before the port opens, is a value with no implementation
behind it: `s3` in this release, an unknown provider name, and Graph with any of its three
variables missing.

The rule lives in `specs/hiring/00-integrations.md` §03.15; the resolvers are
`apps/api/src/hiring/storage/storage.config.ts` and `apps/api/src/hiring/calendar/calendar.config.ts`.

## What it replaced

Requirement 15 of the same spec said an application starting with `NODE_ENV=production` and
filesystem storage **must refuse to start**, and the calendar resolver mirrored it for the fake.
The reasoning was Vercel's: a function's filesystem is read-only except `/tmp`, and `/tmp` does
not survive the invocation, so `fs` in production meant accepting a booking and silently
discarding its CV. The spec's answer was fail-fast, and TC-H00-INT-01 asserted it.

The rule did what it was written to do. The first deploy that carried the hiring code to the
dev stand was on Fargate with `NODE_ENV=production`, no `STORAGE_PROVIDER` and no Graph tenant.
Every new API task threw the storage error at boot, the health check never saw a 200, and the
ECS deployment circuit breaker rolled the service back to the previous image. That was the
correct outcome under the old rule, and it was also an environment nobody could bring up: `s3`
is not built in this release, so no value of `STORAGE_PROVIDER` would start the API under
`NODE_ENV=production`.

## Why not keep the rule and configure around it

Two routes were considered and rejected.

**Set `NODE_ENV` to something other than `production` on the stand.** No code change, but
`NODE_ENV` also gates the test-fixture endpoints, which skip their secret check outside
production, and the session cookie's `secure` flag. A stand on a public address with open
fixture endpoints is a worse trade than the one this record makes.

**An explicit opt-in flag beside the check.** Keeps the refusal as the default and adds a
variable that names the accepted loss. This is the more cautious design, and it was declined
because the person owning the environments wants the two variables to mean what they say
with no second variable to remember. The refusal was a guard against a mistake; the `.tfvars`
comment beside the value is now where that mistake is caught.

## What it costs

- **CVs on `fs` are lost when the task is replaced** — a deploy, a crash, a scale event. On the
  dev stand, which runs one API task, that is every deploy. `s3` storage is the fix and is not
  built.
- **`fake` bookings invite nobody.** The interview exists in the database and on the board and
  in no calendar. The fake also keeps its events in memory, so after a task replacement a move
  or a cancellation of an earlier booking finds no event and does nothing.
- **Several tasks on `fs` do not share CVs.** A CV uploaded through one task is unreadable
  through another. `api_max_tasks` is 1 wherever test fixtures are on; a stand that scales
  past one task must not run `fs`.

None of these are new failure modes. They are the ones the old rule prevented, now accepted
per environment and written down where the environment is configured.

## Superseded tests

TC-H00-INT-01 is retired in its spec. TC-H00-INT-04 covers what the resolvers accept and
reject now.
