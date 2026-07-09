# Devscribed.Admin

The user-management surface of Devscribed.Admin, built from the functional specs in
[`specs/user-management`](specs/user-management/README.md).

## Stack

| Layer    | Technology                                  |
| -------- | ------------------------------------------- |
| Frontend | Next.js (App Router) + TypeScript           |
| API      | NestJS + TypeScript                         |
| Database | PostgreSQL                                  |
| ORM      | TypeORM                                     |
| Tests    | Jest (unit + integration), Playwright (E2E) |

## Monorepo layout

```
packages/shared   # framework-agnostic enums, validators, factories (used by api + web)
apps/api          # NestJS API
apps/web          # Next.js frontend
e2e               # Playwright end-to-end tests
```

This repo uses **npm workspaces**. Install everything from the root:

```bash
npm install
```

## Prerequisites

- Node.js 20 (`.nvmrc` pins the major version)
- Docker (for local PostgreSQL)

## Getting started

1. Copy the environment template and adjust if needed:

   ```bash
   cp .env.example .env
   ```

2. Start PostgreSQL (creates the `devscribed_admin` and `devscribed_admin_test` databases).
   It is published on host port **5433** to avoid clashing with a native Postgres on 5432:

   ```bash
   npm run db:up
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Apply the database schema:

   ```bash
   npm run migration:run
   ```

## Running the app

Start the API (`http://localhost:4000/api`) and the web app (`http://localhost:3000`) together:

```bash
npm run dev
```

Then open <http://localhost:3000> — the root redirects to `/signup`. Completing signup lands
you in your new organization's Members list.

## Testing

Tests are implemented at three levels and require the database to be running (`npm run db:up`).
The E2E suite also needs the Playwright browser once: `npm run install:browsers --workspace e2e`.

```bash
npm run test:unit   # pure logic — shared validators/factory + password hashing (Jest)
npm run test:int    # API + Postgres — atomic signup, duplicate rejection (Jest, test DB)
npm run test:e2e    # full browser flow — Playwright boots API + web + test DB
npm run test:all    # all of the above, in order
npm run verify      # lint + typecheck + test:all
```

The integration and E2E suites run against the dedicated `devscribed_admin_test` database and
reset it between runs, so they never touch your dev data.

## Common scripts (root)

| Script                  | Description                                   |
| ----------------------- | --------------------------------------------- |
| `npm run db:up`         | Start the PostgreSQL container                |
| `npm run db:down`       | Stop the PostgreSQL container                 |
| `npm run migration:run` | Apply pending migrations to the dev database  |
| `npm run dev`           | Run the API and web app together (watch mode) |
| `npm run build`         | Build every workspace                         |
| `npm run lint`          | Lint all workspaces                           |
| `npm run typecheck`     | Type-check all workspaces                     |
| `npm run format`        | Format the repo with Prettier                 |
| `npm test`              | Unit + integration tests                      |
| `npm run test:unit`     | Unit tests (`packages/shared` + `apps/api`)   |
| `npm run test:int`      | API integration tests (`apps/api`)            |
| `npm run test:e2e`      | Playwright E2E tests (`e2e`)                  |
| `npm run test:all`      | Unit + integration + E2E                      |
| `npm run verify`        | Lint + typecheck + all tests                  |

## Build progress

- [x] **Step 1 — Monorepo scaffold** (workspaces, TypeScript/ESLint/Prettier config, Dockerized Postgres)
- [x] **Step 2 — `packages/shared`** (enums, validators, membership factory + unit tests)
- [x] **Step 3 — API foundation** (`apps/api`: TypeORM + Postgres, entities, initial migration)
- [x] **Step 4 — Signup module** (atomic signup, bcrypt hashing, JWT session, members endpoint + integration tests)
- [x] **Step 5 — Web app** (`apps/web`: Next.js signup page + minimal members page, API client, same-origin rewrite)
- [x] **Step 6 — E2E** (`e2e`: Playwright boots API + web + test DB, TC-01-E2E-01 in a real browser)
- [x] **Step 7 — Green build + run docs** (root `dev`/`test:all`/`verify` scripts, run instructions)

**Spec 01 (Organization Creation) is complete** — implemented and tested at the unit, integration,
and E2E levels. Next up: [spec 02 — Authentication & Login](specs/user-management/02-authentication-login.md).
