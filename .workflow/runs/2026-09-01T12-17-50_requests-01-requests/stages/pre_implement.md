# pre-implement — requests/01-requests

Spec: `specs/requests/01-requests.md` (sha256 `98a0441e…`, matches `run.json`)
Base: `ec97c8f`  ·  Branch: `spec/requests`

## What I read

- The spec in full, and `specs/requests/README.md` (Shared Rules, Product decisions, Blast
  Radius, Cross-Spec Side Effects, Known Gaps). There is no paired `.design.md`.
- `depends-on`: user-management 04, 10, 11 — README + the shared rules they own, not in full.
  The relevant surfaces of all three exist in the tree and I read the code instead.
- `CLAUDE.md`, `1_DS for dev/README.md` (the change is half UI).
- The code, before the plan: `apps/api/src/requests/*`, `apps/api/src/kanban/*`,
  `apps/api/src/auth/*`, `packages/validation/src/{index,roles}.ts`,
  `apps/web/app/org/[orgId]/requests/*`, `apps/web/src/layout/{Sidebar,requests-badge-context}.tsx`,
  `apps/api/test/requests-page.spec.ts`, `e2e/tests/requests-page.spec.ts`, `infra/deploy.sh`.

## What already exists to build on

| Thing | Where |
|---|---|
| The route prefix and guard chain this spec extends | `apps/api/src/requests/requests.controller.ts` (`@Controller('api/organizations/:orgId')`, `SessionGuard, OrgScopeGuard`) |
| The spec-10 vacation aggregation, to be moved unchanged | `apps/api/src/requests/requests.service.ts` (`listRequests`, `buildBalances`, `toCard`, `compareRequests`) |
| Per-parent counter allocated under a row lock — the `number` pattern verbatim | `apps/api/src/kanban/tasks.service.ts:157-166` and `:211` |
| Caller resolution, capability gate, cross-org 404 on a parent row | `apps/api/src/kanban/kanban.shared.ts` (`requireCaller`, `requireCapability`, `requireProject`) |
| Append-only audit rows with display-name snapshots (`oldLabel`/`newLabel`) | `apps/api/src/kanban/collaboration.service.ts:28` (`writeActivity`), model `TaskActivity` (`apps/api/prisma/schema.prisma:1030`) |
| Append-only thread | `apps/api/src/kanban/comments.service.ts`, model `TaskComment` (`schema.prisma:997`) |
| Org-row `FOR UPDATE` inside a transaction | `apps/api/src/vacation/vacation-requests.service.ts:83`, `apps/api/src/members/members.service.ts:157` |
| 404-not-403 for a foreign org | `apps/api/src/auth/org-scope.guard.ts:22` |
| `@RequireCapability` + normalized role | `apps/api/src/auth/capability.guard.ts`, `packages/validation/src/roles.ts` (`normalizeRole`, `ROLE_CAPABILITIES`) |
| `can()` / `CAPABILITY_MATRIX` / `MemberCapability` | `packages/validation/src/index.ts:506`, `:580`, `:691` |
| `REQUEST_MESSAGES` — **already exists**, spec 09's vacation strings | `packages/validation/src/index.ts:1746` |
| `{ error: 'validation_error', fields: {…} }` body shape | `apps/api/src/clients/clients.service.ts:383` |
| Timezone read with a UTC fallback | `apps/api/src/documents/envelope-completion.ts:358-360` (`account?.timezone \|\| 'UTC'`), `Account.timezone` is nullable (`schema.prisma:37`) |
| Vacation cards, their actions and their test ids (must survive) | `apps/web/app/org/[orgId]/requests/page.tsx`, `CancelRequestDialog.tsx`, `types.ts` |
| Sidebar row + badge | `apps/web/src/layout/Sidebar.tsx:82-91`, `apps/web/src/layout/requests-badge-context.tsx` |
| Modal + field errors + focus-first-invalid, and the raw `<textarea>` precedent | `apps/web/app/org/[orgId]/projects/[projectId]/kanban/CreateTaskModal.tsx`, `apps/web/app/org/[orgId]/members/[memberId]/RejectRequestModal.tsx` |
| Loading skeleton, per screen | `apps/web/app/org/[orgId]/members/MembersLoadingSkeleton.tsx` |
| E2E rig | `e2e/tests/helpers.ts` — `setMembershipRole:160`, `signupOrg:734`, `inviteAndAcceptViaApi:921`, `submitVacationRequestViaApi:1081`, `createProjectViaApi:1128`, `removeMember:1270` |
| Integration rig with a recording mail double | `apps/api/test/clients.spec.ts:134-138`, `InMemoryMailService.sent` (`apps/api/src/mail/in-memory-mail.service.ts:80`) |
| Additive migration style | `apps/api/prisma/migrations/20260901120000_spec_org_01_clients/migration.sql` |

## What must be built from zero

- `Request`, `RequestMessage`, `RequestEvent`; `Organization.nextRequestNumber`. One migration.
- The whole write side: create (number under `FOR UPDATE`), edit, reassign, four transitions,
  the thread. Nothing in `apps/api/src/requests/` writes anything today.
- The event writer, the party/actor guards, the overdue derivation, the default comparator.
- The new `scope` / `type` / `status` / `projectId` / `q` query vocabulary and its parsers
  (today's `parseRequestStatusFilter` is a *different* vocabulary — see finding P2).
- 30 message strings and 3 + 3 capabilities in `packages/validation`.
- `/org/{orgId}/requests/{requestId}` — no such route exists.
- The new-request modal, and a rebuilt list page composing member requests with the vacation
  section it must not regress.
- A badge that counts for every role (today's fetch is gated on `view-requests`).
- 6 unit + 21 integration + 13 E2E cases, plus a rewrite of `apps/api/test/requests-page.spec.ts`,
  whose assertions on `body.requests` and on `?status=pending|approved|rejected` are the direct
  casualties of the envelope change.

## Sweeps

**Contradiction.** Requirement 9 ("a project that … belongs to another organization is rejected
with 400 and `projectUnavailable`") against the `POST …/requests` contract ("404 for a project or
membership outside the caller's organization — never 403"). Both are unambiguous and they cannot
both hold. → **P1**.

Requirement 42's `status` vocabulary against the shipped spec-10 filter and BC 3's promise that
the vacation feed's queries are untouched. → **P2**.

Requirement 23 (only the addressee or an admin marks `answered`) against an Error Messages table
that has `notYoursToGrant`/`notYoursToDecline`/`notYoursToCancel` and no answer row, and a route
contract that lists only those three 403s. → **P3**.

AC-3 and Backward Compatibility 5 read literally forbid requirements 37 and 38 and TC-01-E2E-10.
The intent is plainly "no role sees pre-existing *data* it could not see", and E2E-10 pins the
other side, so this is recorded as a note, not a blocker.

**Premise.** Every claim I could check is in `handoff.premises` with the file that implements it.
The one that does not survive contact: the blast radius reads as though `REQUEST_MESSAGES` were a
new export; it exists at `packages/validation/src/index.ts:1746` holding spec 09's vacation
strings. No key in this spec's table collides with it, so the plan extends it in place — a rename
would touch every vacation call site and this spec forbids touching vacation.

**External claims.** The spec has no External Contracts section and depends on no system we do not
own. Its Verification Plan's "Access this needs" table is explicitly empty and that is true: no
credential, no MCP server, no outbound call. The only double is `MailService`, whose recorded-sends
accessor already exists.

**Call sites.** Requirement 28 ("every transition") → six write handlers, listed in T5's
`allCallSites`. Requirement 33 ("derived on every read") → the two read paths, listed in T3's.
Requirement 32 (`lastActivityAt` updated by any message, status change or reassignment) → the same
six handlers.

**Writers.** The `Request` row's writers are exactly the create, edit, reassign and four transition
handlers, all inside the new module (T4/T5 `concurrency`). The `Organization` row is locked by the
create handler and is already locked by four existing writers, named in T4's `concurrency` — a
create therefore serialises against member removal, vacation submission/review and accrual, which
is acceptable and is the same lock those already share.

**Messages.** All 30 rows are in `handoff.messages` with the export and the route that emits it.
Two rows (`emptyMine`, `emptyFiltered`) are emitted by the web page, not a route. One route needed
by requirement 23 has *no* row — P3.

**Verification.** Nothing in the Verification Plan is `not run`; every state the cases need is
reachable through helpers that exist at the cited lines (checked). This spec owes no fixture, so
no verification row becomes a task.

**Sections.** All 20 `##` headings are answered in `handoff.sections`.

## Plan shape

Nine tasks: schema, validation, read paths (+ the vacation-feed extraction), creation/edit/
reassign, thread + transitions, the list screen, the detail screen, sidebar and badge, tests.
The split follows the blast radius: the vacation aggregation gets its own owner first so the new
code cannot regress it, and the read path lands before the writers so every write has somewhere
to be observed.

## Verdict

Blocked on three `spec` findings. The plan is written and complete regardless — when the three
are settled the handoff stands, and only P1's error code, P2's vacation-filter rule and P3's
message row need to change in it.
