# Devscribed.Admin (Teammerly)

Internal admin product. **Spec-driven**: `specs/` is authoritative and code is written to match it.
When behaviour and spec disagree, the spec wins — change the spec first, deliberately.

## Layout

```
apps/api/              NestJS 11 + Prisma + PostgreSQL
apps/web/              Next.js 15 App Router + React 19
packages/validation/   validation rules and error messages, shared by web and API
e2e/                   Playwright, one file per spec area
specs/                 the specs (see specs/*/README.md for each area index)
1_DS for dev/          Teammerly Meridian design system, imported as @ds
```

npm workspaces, Node 22, TypeScript everywhere.

## Commands

```bash
npm install            # from the root only; runs prisma generate via the API's postinstall
docker compose up -d   # Postgres 17 on port 5433, databases devscribed_dev and devscribed_test
npm run dev            # API on :4000, web on :3000
npm run test:unit      # Vitest, packages/validation
npm run test:int       # Jest + Supertest against devscribed_test (wiped each run)
npm run test:e2e       # Playwright; starts both dev servers itself
```

Full first-time setup is in [README.md](README.md). `apps/api/.env` is untracked — every fresh
clone needs `cp apps/api/.env.example apps/api/.env`.

## Architecture

The web app has **no API routes and no server actions**. Pages are `'use client'` and fetch
`/api/...` with `credentials: 'same-origin'`; `apps/web/next.config.mjs` rewrites that to the
NestJS origin. All data access goes through the API.

Prisma is one injected service (`apps/api/src/prisma.service.ts`) with the node-postgres adapter.
There is no repository layer — services call `this.prisma.*` directly.

## Conventions that matter

**Auth.** JWT in an httpOnly cookie. `SessionGuard` re-reads `Account.securityStamp` from the
database on every request, so rotating the stamp revokes every session instantly. `OrgScopeGuard`
returns **404, not 403**, when the path `orgId` does not match the session — and queries always
scope by `session.organizationId`, never by the path parameter.

**Validation.** Rules and message text live in `packages/validation` and are re-run server-side on
every request. The client's copy is a convenience, never a gate. Never write a user-facing
validation message inline.

**Submit buttons are never disabled for validation.** Clicking an invalid form shows every error
and focuses the first invalid field. Disabling is only for genuine in-flight guards and deliberate
confirmations.

**Design system.** Import from `@ds` (via the barrel `apps/web/src/ds.ts`). **No hardcoded colors
or sizes** — use tokens (`var(--sp-8)`, `var(--fs-14)`, `var(--text-muted)`). Anything missing goes
*into* the design system and is recorded in that spec's "DS gaps" table, never improvised per
screen. Light theme only this release.

**Testing.** Selectors are `data-testid` only, and the ids are named in the specs. Test cases are
numbered in the specs (`TC-01-E2E-03`) and the code references those ids. E2E reads sent mail from
`GET /api/test/mail/latest?email=` — the in-memory mail sink, fenced off in production.

**Which level a case belongs at.** Unit is free, one integration case costs about half a second,
one E2E case about eight. E2E earns its place only when the assertion is out of reach of an API
test: a multi-page journey through real mail, focus and blur, layering, CSS tokens, the session
cookie, a control that must not be drawn. A server rule — a status code, a message, a token
state, an authorization decision — belongs at integration even when a screen shows it. One
mechanism gets one E2E test, on the cheapest page that exercises it; retiring a case is recorded
in its spec as `- **Retired.**` naming what covers the rule now.

**Agents run tests targeted, never whole.** `npm run test:unit` runs in full — it is under a
second. `npm run test:int` and `npm run test:e2e` are for a person and for the deploy gate; an
agent runs the files its diff touches (`npm test -- test/<file>.spec.ts` from `apps/api`,
`CI=1 npx playwright test tests/<file>.spec.ts tests/regressions.spec.ts` from `e2e`). Jest here
is 29, where the file filter is a positional path: `--testPathPatterns` is the Jest 30 spelling
and this version ignores it silently, running everything while the log says otherwise.

**Navigation.** No dead links. A nav item that the current role cannot use is not rendered.

## Watch out for

- **`main` deploys itself.** `deploy.yml` is the pipeline: push to `main` runs the whole suite
  and then deploys `dev`; a `v*` tag on `main` does the same and deploys `prod`. `test.yml` is a
  reusable workflow it calls, and the deploy job `needs` it, so a red run deploys nothing. The
  deploy half is still gated on the repository variable `DEPLOY_ENABLED`. The runbook —
  releasing, rolling back, and what to do when a deploy fails — is
  [docs/deployment.md](docs/deployment.md). Prod tags come from `npm run release`.
- **Role values are in transition.** The database holds `admin` / `member`; the specs target
  `admin | manager | user | viewer`. New authorization code must handle both — see the role-enum
  note in `specs/documents/README.md`.
- **`prisma generate` runs from `apps/api`**, which is where `postinstall` runs it. Running it
  from the repository root produces a client that cannot find `apps/api/.env`, and the app then
  starts and fails its first query with "client password must be a string".
- Migrations should be **additive**. `make deploy-<env>` rolls the services out and *then* runs
  `prisma migrate deploy`, so the new code is serving before the schema changes — which is only
  safe because migrations are additive. This is a rule, not an observation about the current
  migrations.
- If Prisma types look wrong in the editor, re-run `npm install` (or `prisma generate`) — the
  client is generated into `node_modules/.prisma`.

## Writing specs

Use the `spec` skill (`/spec`). Every spec covers edge cases, blast radius, backward compatibility,
acceptance criteria, and test cases through E2E. Specs are written in English.

Investigate a defect with the `bug` skill (`/bug`). It writes `specs/bugs/BUG-NNN-slug.md` and
ends in one of three verdicts — the code is wrong, the spec is wrong, or the spec is silent —
which is what decides whether anything may be fixed yet.

## Implementing specs

Use the `ship` skill (`/ship`) to run a spec through pre-implement → implement → static gate →
review → QA. Routing lives in `scripts/wf.mjs`, not in a prompt: every finding names where the
defect lives, only findings addressed to `code` are ever retried, and a finding the implementer
contests halts the run for a person instead of spending another attempt. The runbook is
[docs/ai-workflow.md](docs/ai-workflow.md).

The pipeline stops at a green branch. It never merges and never pushes — see the note about
`main` above.
