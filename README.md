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

Then open <http://localhost:3000> — the root redirects to `/login`. New here? Follow
"Create an organization" to sign up; completing signup lands you in your organization's
Members list.

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

## Spec progress

Specs are implemented in dependency order (see the
[implementation order](specs/user-management/README.md#reading--implementation-order)). Each is
built and tested at the unit, integration, and E2E levels before moving on.

| #   | Spec                                                                           | Status         |
| --- | ------------------------------------------------------------------------------ | -------------- |
| 01  | [Organization Creation](specs/user-management/01-organization-creation.md)     | ✅ Complete    |
| 02  | [Authentication & Login](specs/user-management/02-authentication-login.md)     | ✅ Complete    |
| 03  | [Roles & Permissions](specs/user-management/03-roles-and-permissions.md)       | ⬜ Not started |
| 04  | [User Invitation](specs/user-management/04-user-invitation.md)                 | ⬜ Not started |
| 05  | [Member List & Management](specs/user-management/05-member-list-management.md) | ⬜ Not started |
| 06  | [Member Detail: About](specs/user-management/06-member-detail-about.md)        | ⬜ Not started |
| 07  | [Account Settings](specs/user-management/07-account-settings.md)               | ⬜ Not started |

**Highlights so far**

- **Spec 01** — self-serve signup: atomic account + organization + admin membership, bcrypt
  hashing, JWT session, single-org-per-account guard. Reconciled to the gold-standard revision:
  name/email/password length & format rules with exact error messages, browser-timezone capture,
  case-insensitive duplicate check, and a password show/hide toggle.
- **Spec 02** — login (enumeration-safe; removed members get a distinct deactivation message),
  forgot/reset password via a single-use 60-min token (email captured by an in-memory mail sink),
  server-side confirmation match, and session revocation via a per-account GUID security stamp.
  Screens: `/login`, `/forgot-password`, `/reset-password` (validated on load). Reconciled to the
  gold-standard revision.
