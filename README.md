# Devscribed.Admin

Implementation of the user-management specs in [`specs/`](specs/). Spec 01 —
[Organization Creation](specs/user-management/01-organization-creation.md) — is complete.

## Stack

| Layer | Choice |
|---|---|
| API | NestJS 11, Prisma, SQLite |
| Web | Next.js 15 (App Router), React 19 |
| UI | Teammerly Meridian (`1_DS for dev/`), imported through `@ds` — no hardcoded colors or sizes |
| Unit tests | Vitest |
| Integration tests | Jest + Supertest against a throwaway SQLite file |
| E2E | Playwright |

## Layout

```
packages/validation/  every signup rule and error message — one source shared by web and API
apps/api/             NestJS: POST /api/signup, /api/login, /api/logout,
                      GET /api/me, GET /api/organizations/{orgId}/members
apps/web/             Next.js: /signup, /login, /org/{orgId}/members
e2e/                  Playwright specs, one per TC-01-E2E-* case
```

`packages/validation` exists so the client and the server can never disagree about a
message. The API re-runs it on every request — the client's copy is a convenience, not a gate.

## Setup

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run build --workspace @devscribed/validation
npm run prisma:generate --workspace @devscribed/api
npm run db:push --workspace @devscribed/api
```

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

## The app shell

Every signed-in route lives under `/org/{orgId}/` and renders inside one shell —
sidebar, top bar, page header — built in `apps/web/src/layout/`. It is documented in
[00-app-shell.design.md](specs/user-management/00-app-shell.design.md), which also
records why the shell sits in the app rather than in the design system.

The organization id in the URL is never a selector. `OrgScopeGuard`
(`apps/api/src/auth/org-scope.guard.ts`) compares it against the session cookie and
answers 404 on any disagreement; queries still scope by the session.

## Design-system notes

- Components come from `1_DS for dev/index.js` via the `@ds` alias
  (`experimental.externalDir`), re-exported through `apps/web/src/ds.ts` — a single
  `'use client'` boundary, since the DS uses hooks and ships no directives.
- `Input` has no way to tag its error message node, so the app passes the message as a
  node carrying `field-error-{fieldName}`. A first-class `errorId` prop belongs in the
  DS; see the "DS gaps" table in the design spec.
