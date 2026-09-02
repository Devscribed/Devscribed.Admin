# implement — attempt 1 — requests/01-requests

Spec: `specs/requests/01-requests.md` (sha `5fe4c35e…`).
Base: `f06c7d8`. Branch: `spec/requests`. First attempt — no findings to answer.

## Tasks

### T1 — schema and the one additive migration
- `apps/api/prisma/schema.prisma` — `Request`, `RequestMessage`, `RequestEvent`;
  `Organization.nextRequestNumber Int @default(1)`; back-relations on `Organization`,
  `Membership`, `Account`, `Project`. No Prisma enum: every value set is a documented
  `String` column, following `Project.status` / `Client.status`.
- `apps/api/prisma/migrations/20260901140000_requests_01_requests/migration.sql` — three
  `CREATE TABLE`, one `ADD COLUMN` with a default, five indexes, nine foreign keys.
  Additive throughout: no rename, no drop, no new NOT NULL on an existing table, no
  backfill. FKs exactly as the Data Model states them (organization Cascade, project
  SetNull, requester Cascade, assignee SetNull, resolvedBy SetNull, both child tables
  Cascade on `requestId` and SetNull on their membership).
- `prisma generate` run from `apps/api`, never the repository root.

### T2 — validation
- `packages/validation/src/roles.ts` — `CreateRequest` / `ViewOwnRequests` /
  `ViewAllRequests` in `Capability` and `ROLE_CAPABILITIES` (admin and manager all three,
  `user: ['CreateRequest','ViewOwnRequests']`, `viewer: ['ViewOwnRequests']`), plus
  `canReadRequest(role, isParty)` — capability composed with identity, the shape
  `canReadProfile` established.
- `packages/validation/src/index.ts` — `create-request` / `view-own-requests` /
  `view-all-requests` in `MemberCapability` and all four rows of `CAPABILITY_MATRIX`;
  the 31 new `REQUEST_MESSAGES` keys, extended **in place** (no second export);
  `export * from './requests'`. `view-requests` untouched — same meaning, same grants.
- `packages/validation/src/requests.ts` (new) — the closed value sets, the field
  validators for rules 1–7 and 10–11, `validateNewRequest` / `validateRequestEdit`, the
  strict `parseRequestScope` / `parseRequestStatusQuery` / `parseRequestTypeQuery`
  (`null` means 400, never a fallback), `vacationStatusesFor` (requirement 42's fixed
  mapping), `todayInTimeZone` + `isRequestOverdue`, and `compareRequestRows`.
  `parseRequestStatusFilter` and its spec-10 unit suite are left alone: the vocabulary is
  retired on this endpoint, not the export.
- `packages/validation/src/requests.test.ts` (new) — TC-01-UNIT-01 … TC-01-UNIT-06 plus
  the query vocabulary, the two body validators and the message table.
- `packages/validation/src/roles.test.ts` — the seven assertions the capability additions
  invalidate. `capabilitiesFor('member')`, `(null)`, `('superadmin')` and `('self')` now
  assert **equality with the role they normalize to** rather than `[]`, so each case
  keeps its intent (an unknown role gets no more than a viewer) instead of being deleted.

### T3 — read path
- `apps/api/src/requests/vacation-request-feed.service.ts` (new) — the whole spec-10
  aggregation moved file-for-file: same query, same balance math, same card mapper, same
  `compareRequests`. The only addition is the `statuses` argument carrying requirement
  42's mapping. `pendingCount` still computed from the unfiltered set.
- `apps/api/src/requests/requests.dto.ts`, `requests.serializer.ts` (new) — the wire
  shapes and one Prisma include, so the query and the serializer cannot drift.
- `apps/api/src/requests/requests.service.ts` — `listRequests` (scope, four filters, the
  two unfiltered counters, the two-section composition) and `getRequest`.
- `apps/api/src/requests/requests.controller.ts`, `apps/api/src/app.module.ts`.

### T4 — create
- `createRequest` in `requests.service.ts`: capability → validation → the two existence
  lookups (404 across organizations, 400 for inactive/archived inside) → one transaction
  that takes `SELECT "nextRequestNumber" … FOR UPDATE` on the organization row, inserts,
  advances the counter and writes the `created` event. Nothing slow runs under that lock.

### T5 — write path
- `apps/api/src/requests/request-events.service.ts` (new) — the append-only event writer;
  it takes the caller's transaction client and never the root Prisma service.
- `transition` / `patchRequest` / `postMessage` / `reassignRequest` in
  `requests.service.ts`. Every one locks the row with `FOR UPDATE` **scoped by the
  session's organization** and evaluates its guards against that read. One fixed order on
  all five transition routes: row + party (404) → terminal (409 `alreadyTerminal`) →
  legality (409 `invalidTransition`) → actor (403 `notYoursTo*`) → body (400). A decline's
  reason is written as a `RequestMessage` in the same transaction as the status.

### T6 — the list page
- `apps/web/app/org/[orgId]/requests/page.tsx` — rewritten. The `view-requests` redirect
  is gone; the scope control and the vacation section are the two inner gates. Filter
  state in the URL, error banner keeping the last good list, both empty states, the
  vacation section preserved card-for-card including the in-place patch after an action.
- `apps/web/app/org/[orgId]/requests/RequestRow.tsx`, `NewRequestModal.tsx`, `types.ts`.

### T7 — the detail screen
- `apps/web/app/org/[orgId]/requests/[requestId]/page.tsx`, `RequestThread.tsx`,
  `RequestHistory.tsx`, `DeclineRequestModal.tsx`, `ReassignRequestModal.tsx`.
  Every control is omitted rather than disabled when the caller cannot use it.

### T8 — the shell
- `apps/web/src/layout/Sidebar.tsx` — the Requests row is unconditional; the comment at
  the top of `navigation()` says why.
- `apps/web/src/layout/requests-badge-context.tsx` — one call with no `scope`, `type` or
  `status`, for every role, reading `counts.waitingOnMe` plus `vacation.pendingCount`.

### T9 — what this spec reverses
- `apps/api/test/requests-page.spec.ts` — the whole file, not only `:301-320`: the
  envelope moved under `vacation`, the vocabulary is this spec's, and TC-10-INT-03 is
  **reversed** rather than deleted (it now asserts the 200 with no `vacation` key that
  requirement 37 produces, naming TC-01-INT-18/TC-01-E2E-08 as the owners of the full
  rule). The default-filter case follows the new `all` default.
- `e2e/tests/requests-page.spec.ts` — TC-10-E2E-01 selects the `Open` filter before
  approving, so its regression guard still guards something under an `all` default.

## Test cases written

| Case | Where |
|---|---|
| TC-01-UNIT-01 … 06 | `packages/validation/src/requests.test.ts` |
| TC-01-INT-01 … 22 | `apps/api/test/requests.spec.ts` |
| TC-01-E2E-01 … 13 | `e2e/tests/requests.spec.ts` |

Two cases beyond the spec's list, both because the code path either runs or throws and
nothing else covers it: the `projectId` + case-insensitive `q` filters
(`apps/api/test/requests.spec.ts`), and `REQUEST_MESSAGES` literal copy
(`packages/validation/src/requests.test.ts`). Every message assertion in the integration
suite compares the spec's literal text from a local `COPY` table, never the constant the
code imports.

## Commands run

| Command | Result |
|---|---|
| `npm run test:unit` (root) | `Test Files 21 passed (21)`, `Tests 1024 passed (1024)` |
| `npx tsc --noEmit -p tsconfig.json` (`apps/api`) | clean |
| `npx tsc --noEmit -p tsconfig.json` (`apps/web`) | only the eight pre-existing `TS2307`s for `@dnd-kit/*`, `dompurify` and `marked`, which are declared in `apps/web/package.json` but absent from `node_modules` on this machine. No error in any file this diff touches. |
| `npm test -- test/requests.spec.ts` (`apps/api`) | `Tests: 23 passed, 23 total` |
| `npm test -- test/requests-page.spec.ts` (`apps/api`) | `Tests: 5 passed, 5 total` |
| `npm test -- test/capability.spec.ts test/org-scope.spec.ts` (`apps/api`) | `Tests: 5 passed, 5 total` |
| `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/requests.spec.ts` (`e2e`) | `13 passed (50.2s)` |
| `… npx playwright test tests/requests-page.spec.ts tests/regressions.spec.ts` (`e2e`) | `10 passed (34.0s)` |

## Notes for the reviewer

Three things a reader should see rather than discover.

**1. TC-01-INT-13's stated precondition cannot occur; the criterion it observes can.**
The case says "create with `neededBy` = tomorrow, then read it as an account whose
timezone makes that date past". No pair of zones produces that: the widest UTC offset
spread is 26 hours, so two readers' calendar dates differ by at most one day, and a date
strictly after every reader's today cannot be strictly before any reader's today. The
case as written reaches AC-8 — "`overdue: true` with no job having run and no column
holding the flag" — by the two routes the spec itself describes instead: the boundary day
of edge case 10 (a `neededBy` of the western reader's today, read from a zone a day
ahead), and a date that has genuinely passed while the request stayed open, reached
through `PATCH` as requirement 8 permits. Requirement 33 itself is unambiguous and has
exactly one implementation, which is why this is a note and not a `spec` finding.

**2. I did not edit `specs/user-management/10-*.md`.** T9 lists it, and the handoff's
mitigation asks for a `- **Retired.**` line recording TC-10-INT-03's retirement. Editing
anything under `specs/` is closed to this stage, so the retirement is recorded in the
test file instead — the case is reversed in place, with a comment naming TC-01-INT-18 and
TC-01-E2E-08 as the owners of the rule that replaced it. The spec line still needs
writing by whoever may write it.

**3. The reassign modal's internals carry no spec-named `data-testid`.** The spec's id
list has `request-detail-reassign-btn` and nothing for the member picker or the confirm
control inside the modal it opens, and I did not add ids the spec does not name. So
TC-01-E2E-07 clicks the button the spec names, asserts the control is offered, and
completes the reassignment through the API before asserting the assignee and the two
display names in the history. The rule itself is a server rule and is fully covered by
TC-01-INT-17. If the reviewer wants the modal driven end to end, the spec's testid table
needs two more ids.

Smaller decisions worth naming:

- **The 400 body for an unknown `status`/`type`/`scope`** is
  `{"error":"validation_error","fields":{"status":"unknown_value"}}`. The spec pins the
  status code only and the handoff says to invent no new `REQUEST_MESSAGES` key; the field
  carries a code rather than copy, because an unknown value can only arrive from a
  hand-edited URL. `scope` is refused the same way rather than defaulted — an
  unrecognized value from outside is not mapped to a default.
- **`type=access` or `question` selects no vacation row**, and the section renders empty
  rather than disappearing, for the same reason `status=answered` does (requirement 42).
  The `vacation` key is still absent entirely for a caller without `view-requests`.
- **Reassignment's 403** uses `CapabilityGuard` + `@RequireCapability('ViewAllRequests')`,
  because it is the one route whose refusal message the spec's table does not name; every
  other route's capability check is in the service, where the named message lives.
- **The detail screen learns the caller's own membership id** from
  `GET …/members` (`isSelf`), since `/api/me` does not carry one and that file is outside
  this handoff. It is used to decide which controls to draw, never to authorize anything.
