# pre_implement — requests/01-requests

Spec: `specs/requests/01-requests.md` (sha `5fe4c35e…`, unchanged since init)
Base: `f06c7d8` — *"docs(specs): resolve the three requests-spec blockers pre_implement found"*.
An earlier pre_implement halted this spec three times; those three resolutions are re-checked
below and all hold. Nothing in this pass re-raises them.

## The two lists

### What already exists to build on

| What | Where |
|---|---|
| The `GET …/requests` route, controller and guard chain (`SessionGuard` → `OrgScopeGuard`) | `apps/api/src/requests/requests.controller.ts:12-24` |
| The whole vacation feed — query, balance math, card mapper, `compareRequests` — to be **moved unchanged** into `VacationRequestFeedService` | `apps/api/src/requests/requests.service.ts:79-260` |
| 404-not-403 cross-org refusal | `apps/api/src/auth/org-scope.guard.ts:15-26` |
| Capability decorator + guard, which reads the role from the membership and normalizes it | `apps/api/src/auth/require-capability.decorator.ts:15`, `apps/api/src/auth/capability.guard.ts:33-58` |
| `normalizeRole()` and the `Capability` / `ROLE_CAPABILITIES` pair | `packages/validation/src/roles.ts:39-140` |
| `MemberCapability` / `CAPABILITY_MATRIX` / `can()` | `packages/validation/src/index.ts:506-692` |
| `REQUEST_MESSAGES`, already holding spec 09's 21 vacation keys — **extended in place**, never duplicated | `packages/validation/src/index.ts:1746-1770` |
| Per-org counter allocated under a row lock — the exact shape `number` needs | `apps/api/src/kanban/tasks.service.ts:157-166` (`Project.nextTaskNumber`, `schema.prisma:734`) |
| Org-row `SELECT id … FOR UPDATE` inside `$transaction` | `apps/api/src/vacation/vacation-requests.service.ts:83,206,340`, `apps/api/src/members/members.service.ts:157,379` |
| Entity-row `FOR UPDATE` re-read before a state transition | `apps/api/src/documents/envelopes.service.ts:870,1347` |
| Append-only event rows with display-name snapshots (`oldLabel`/`newLabel`) | `apps/api/src/kanban/collaboration.service.ts:42-56`, `schema.prisma:1030` (`TaskActivity`) |
| Comment/thread table shape (`@@index([taskId, createdAt])`) | `schema.prisma:997` (`TaskComment`) |
| `Account.timezone` (nullable) with the established `?? 'UTC'` fallback | `schema.prisma:37`; `apps/api/src/time-tracking/time-tracking.service.ts:759-762`, `apps/api/src/documents/envelope-completion.ts:358-360` |
| Soft-delete of a membership (`status: 'removed'`) | `apps/api/src/members/members.service.ts:193` |
| The requests page shell, its loading skeleton and vacation cards | `apps/web/app/org/[orgId]/requests/page.tsx` (`requests-loading-skeleton` at :424, `requests-card-*` throughout) |
| Sidebar row assembly and the badge provider | `apps/web/src/layout/Sidebar.tsx:79-88`, `apps/web/src/layout/requests-badge-context.tsx:30-52` |
| E2E fixtures for every precondition the spec names | `e2e/tests/helpers.ts:160` `setMembershipRole`, `:734` `signupOrg`, `:921` `inviteAndAcceptViaApi`, `:1081` `submitVacationRequestViaApi`, `:1128` `createProjectViaApi`, `:1270` `removeMember` — all six verified present at the cited lines |
| Recording mail double for TC-01-INT-21 | `apps/api/src/mail/in-memory-mail.service.ts`, wired by `.overrideProvider(MailService).useClass(InMemoryMailService)` — `apps/api/test/clients.spec.ts:134-137`, used by 26 integration specs |
| Route interception for the E2E error-banner case | `e2e/tests/members-list.spec.ts:103` (`page.route`) |

### What must be built from zero

- Three Prisma models (`Request`, `RequestMessage`, `RequestEvent`) and `Organization.nextRequestNumber`.
- A write side for `apps/api/src/requests/` — it is a read-only projection today.
- Eight routes: `POST /requests`, `GET/PATCH /requests/{id}`, `POST …/messages`, and
  `answer` / `grant` / `decline` / `cancel` / `reassign`.
- A per-request state machine with the row-lock guard and one `RequestEvent` per transition.
- The scope/filter/counts read path and the two-section composition (`requests` + `vacation`).
- The status-vocabulary mapping onto the spec-10 feed, and a **strict** parser that 400s.
- Three capabilities in both unions and 31 new `REQUEST_MESSAGES` keys.
- A new-request modal, a request detail screen (thread + history + actions), a scope control,
  a project filter and a search field.
- Both counters, and the sidebar badge reading them for **every** role.

## Sweeps

### Premise — every claim checked against the file

Recorded in `handoff.premises`. All verified; the notable ones:

- **Deploy order.** `infra/deploy.sh:175-185` registers the migrate task definition and runs
  `infra/migrate.sh` — but only when `api` is among the services — and `infra/deploy.sh:187-192`
  `tf apply`s the services **after** it. So the new schema is live while the *previous* image
  is still serving. Three unreferenced tables and one defaulted column are invisible to it.
- **`parseRequestStatusFilter`.** The spec cites `packages/validation/src/index.ts:1878`; that
  line holds `export type RequestStatusFilter`, the function is at **:1893**. Same symbol, one
  line reference off — recorded, not a finding.
- **`REQUEST_MESSAGES` has 21 keys today** (`index.ts:1746-1770`) and none of the 31 new keys
  collides. The README says "30 new keys"; the Error Messages table has 31 rows. Counted, planned as 31.
- **`MAIL_MESSAGE_TYPES` has exactly nine entries** (`apps/api/src/mail/mail.service.ts:127-137`) — AC-13's assertion target.
- **`Account.timezone` is nullable**, and the repository already answers requirement 33's silent
  case: `?? 'UTC'`, twice, in shipped code. Planned that way rather than invented.

### Contradiction

Every absolute in the spec was taken to its call sites. Nothing was found that no implementation
can satisfy. The near misses, and why each resolves:

- *"A message may be posted in `open` and `answered` only"* (req 17) vs *a decline writes its
  reason as a `RequestMessage` in the terminal transaction* (req 25). Resolves: req 17 constrains
  the **endpoint** and the composer; the decline message is written while the row is still
  non-terminal, in the same transaction.
- *A manager is a "party"* (they hold `view-all-requests`), so requirement 23's "a party gets 403,
  a non-party gets 404" makes an unrelated manager's `/answer` a 403 — which is exactly what
  edge case 4 and TC-01-INT-08 assert for `/grant`. Consistent.
- *`overdue` in two timezones* (edge case 10) vs a single stored row — derived per reader; no
  contradiction, but see the note on TC-01-E2E-04 below.
- *AC-3 ("no role sees anything it cannot see today")* vs requirements 37-38 — the spec narrows
  AC-3 itself and README Backward Compatibility 5 names the two deliberate changes. Resolved in `f06c7d8`.

### Call sites

- `view-requests` is checked in four places today and each moves or stays deliberately:
  `apps/api/src/requests/requests.service.ts:98` (moves inward to the vacation section),
  `apps/web/app/org/[orgId]/requests/page.tsx:68` (moves to the vacation section),
  `apps/web/src/layout/requests-badge-context.tsx:30` (moves to *which counter is read*),
  `apps/web/src/layout/Sidebar.tsx:80` (removed — the row becomes unconditional).
  `packages/validation/src/requests-page.test.ts:11-19` asserts the **grants**, which are unchanged, and survives.
- `parseRequestStatusFilter` has three product call sites —
  `apps/api/src/requests/requests.service.ts:6,105` and `apps/web/app/org/[orgId]/requests/page.tsx:15,89,193` —
  plus its own unit suite at `packages/validation/src/requests-page.test.ts:24-59`. The spec
  retires the vocabulary *on this endpoint*, not the function: the export and its unit suite stay,
  the two product call sites go. Deleting the export would take a live spec-10 unit suite with it.
- Every new service method takes `organizationId` as a required argument and filters on
  `session.organizationId`; the path `orgId` is only ever checked by `OrgScopeGuard`.

### Writers

`Request` rows are written by exactly seven handlers (create, answer, grant, decline, cancel,
edit, reassign). Six take `SELECT id FROM "Request" … FOR UPDATE`; create takes
`SELECT "nextRequestNumber" FROM "Organization" … FOR UPDATE` instead. **The organization row is
already locked by five other services** — `members.service.ts:157,379`,
`vacation-requests.service.ts:83,206,340`, `vacation.service.ts:291`, `accrual.service.ts:74` —
so request creation serializes against member add/remove, vacation submit/review/cancel and the
accrual run. That is the accepted cost of the `nextTaskNumber` pattern; recorded as a risk, not a
change. No handler holds both locks, so no cycle exists.

### Messages

All 31 Error Messages rows are planned into `REQUEST_MESSAGES` (extended in place at
`packages/validation/src/index.ts:1746`) with their emitting route named in `handoff.messages`.
One row is **not** a reuse but a replacement: `GET …/requests` answers today with
`REQUESTS_PAGE_MESSAGES.viewForbidden` for a `user`/`viewer`
(`apps/api/src/requests/requests.service.ts:96-101`). That refusal disappears; the only 403 the
route may emit afterwards is `scopeForbidden`, and `viewForbidden` stays in the module for the
vacation section. That is T9's work, not a rename.

### Verification

The spec's Verification Plan has no `not run` row and owes no fixture — checked: every helper it
names exists at the line it cites, `apps/api/src/test-support/` needs nothing added, and the mail
double is the pattern 26 integration specs already use. One row deserves the implementer's
attention and is carried into T5/T9 rather than left implicit — see the notes.

### Sections

All 20 `##` headings answered by name in `handoff.sections`.

## Findings (notes, not blockers)

Four things are true of the tree that the spec does not say, and each would cost the implementer
a failing suite rather than a wrong design. None of them has two readings, so none halts the run.

1. **`packages/validation/src/roles.test.ts` asserts exact capability sets, including three
   "this role has none" assertions that `ViewOwnRequests` makes false.** `ROLE_CAPABILITIES.user`
   and `.viewer` are `[]` today and the spec grants `view-own-requests` to all four roles.
   Lines 111-140, 184, 188, 251 all break. Planned in T2.
2. **`apps/api/test/requests-page.spec.ts` breaks well outside the `301-320` the spec names.**
   TC-10-INT-03 (`:323-340`) asserts `GET …/requests` → 403 for `user` and `viewer` with
   `REQUESTS_PAGE_MESSAGES.viewForbidden`; requirement 37 reverses it. The default-filter case
   (`:342-368`) and the sorting case both read top-level `requests` / `pendingCount` /
   `totalCount`, which the new envelope moves to `vacation.requests` and `vacation.pendingCount`.
   Planned as T9, which also owes spec 10 a `- **Retired.**` note for the case this spec reverses.
3. **The only route to an overdue row is `PATCH`.** Requirement 8 rejects a past `neededBy` at
   creation, e2e holds no database handle (no `PrismaClient` anywhere under `e2e/`), and
   `apps/api/src/test-support/` exposes only envelope expiry and the SignWell stub. TC-01-E2E-04
   needs one. The spec permits it by omission and by the Error Messages route column, which lists
   `neededByPast` under `POST …/requests` alone while every other shared field says `POST/PATCH` —
   so the reading is pinned in T5 rather than left to the implementer, because enforcing rule 6 on
   `PATCH` makes TC-01-E2E-04 unreachable.
4. **The 400 body for an unknown `status`/`type` on `GET …/requests` names no message.**
   TC-01-INT-22 pins the status code only. Planned as `{ "error": "validation_error", "fields": { … } }`,
   the shape the same controller family already uses, with no new `REQUEST_MESSAGES` key invented.

Verdict: **pass**. The spec compiles.
