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
apps/api/             NestJS: POST /api/signup, GET /api/me, GET /api/members
apps/web/             Next.js: /signup, /login, /members
e2e/                  Playwright specs, one per TC-01-E2E-* case
```

`packages/validation` exists so the client and the server can never disagree about a
message. The API re-runs it on every request — the client's copy is a convenience, not a gate.

## Setup

```bash
npm install
cp apps/api/.env.example apps/api/.env
docker compose up -d                        # Postgres on :5433, dev + test databases
npm run build --workspace @devscribed/validation
npm run db:migrate --workspace @devscribed/api
```

Port 5433 rather than 5432, so the container does not collide with a Postgres you may
already be running.

`SESSION_SECRET` in `.env` is a development placeholder — override it in every
deployed environment.

## Running

```bash
npm run dev --workspace @devscribed/api   # http://localhost:4000
npm run dev --workspace @devscribed/web   # http://localhost:3000
```

The web app proxies `/api/*` to the API (`next.config.mjs` rewrites), so the session
cookie is same-origin and `httpOnly`.

## Tests

```bash
npm run test:unit   # validation rules — TC-01-UNIT-01…07
npm run test:int    # signup endpoint — TC-01-INT-01…04
npm run test:e2e    # browser flows — TC-01-E2E-01…07 (starts both dev servers)
```

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

## Design-system notes

- Components come from `1_DS for dev/index.js` via the `@ds` alias
  (`experimental.externalDir`), re-exported through `apps/web/src/ds.ts` — a single
  `'use client'` boundary, since the DS uses hooks and ships no directives.
- `Input` has no way to tag its error message node, so the app passes the message as a
  node carrying `field-error-{fieldName}`. A first-class `errorId` prop belongs in the
  DS; see the "DS gaps" table in the design spec.
