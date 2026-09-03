# pre_implement — requests/01 Requests

Spec `specs/requests/01-requests.md`, sha256 `803c20d8…8931e`, matching `run.json`.
Diff base `ffa814d`, which is also `HEAD` of `spec/requests`.

## The situation this run starts from

This is not a green field. The branch already carries two implement commits (`481a165`,
`6f2dbb5`) and the migration `20260901140000_requests_01_requests` is in the preflight
baseline. The previous run reached `review` and was blocked with eighteen findings; two of
them (`F6`, `F7`) were `spec` blockers, and `ffa814d` — the commit this run bases on — is the
human's answer to them. It amended requirement 36 (there is no reassignment filter) and
TC-01-INT-13 (the two reachable overdue routes), and marked seven now-false assertions in
user-management spec 10.

So the plan below is the honest delta: the spec's surface exists, four blocker-level defects
against it do not, and the spec amendment must be reflected back into one test comment that
still argues against the old text. I read the code before the plan and every path cited below
is one I opened.

## What already exists to build on

| What | Where |
|---|---|
| Three tables, one defaulted column, additive migration | `apps/api/prisma/migrations/20260901140000_requests_01_requests/migration.sql` |
| `Request` / `RequestMessage` / `RequestEvent` models and `Organization.nextRequestNumber` | `apps/api/prisma/schema.prisma:169`, `:1076`, `:1133`, `:1152` |
| Create, list, get, patch, transition, reassign, message | `apps/api/src/requests/requests.service.ts` |
| The row lock on `Organization` for the number | `apps/api/src/requests/requests.service.ts:353-361` |
| The row lock on `Request` for every transition | `apps/api/src/requests/requests.service.ts:778-792` (`lockRequest`) |
| Append-only event writer | `apps/api/src/requests/request-events.service.ts:41` |
| The spec-10 vacation feed, lifted intact plus requirement 42's mapping | `apps/api/src/requests/vacation-request-feed.service.ts` |
| Guard chain and the routes | `apps/api/src/requests/requests.controller.ts` |
| 32 `REQUEST_MESSAGES` keys, extended in place | `packages/validation/src/index.ts:1771-1834` |
| Every validator, parser, comparator and the overdue derivation | `packages/validation/src/requests.ts` |
| `normalizeRole()` and the party composition | `packages/validation/src/roles.ts` |
| The list screen, the detail screen, the modals | `apps/web/app/org/[orgId]/requests/` |
| The unconditional sidebar row and the badge | `apps/web/src/layout/Sidebar.tsx:82-90`, `apps/web/src/layout/requests-badge-context.tsx` |
| 22 integration, 6 unit and 13 E2E cases | `apps/api/test/requests.spec.ts`, `packages/validation/src/requests.test.ts`, `e2e/tests/requests.spec.ts` |
| The spec-10 tests moved onto the new envelope | `apps/api/test/requests-page.spec.ts:318-325`, `e2e/tests/requests-page.spec.ts:106-115` |
| `setMembershipRole`, `removeMember`, `submitVacationRequestViaApi`, `createProjectViaApi` | `e2e/tests/helpers.ts` |

## What must be built from zero

Nothing structural. Five things do not exist and are the whole cost of this run:

1. A `message_posted` `RequestEvent` on the decline path — the second of the two
   `RequestMessage` call sites (`requests.service.ts:522`) writes no event, where the first
   (`:438-465`) does.
2. Role normalization on the web capability checks this feature added — four call sites pass
   the raw `Membership.role` into `can()`, which does not normalize.
3. A multiline text control in `@ds`. `1_DS for dev/components/forms/` holds `Input`,
   `Select`, `Checkbox`, `Radio`, `SearchField` and no textarea; three raw `<textarea>`
   elements are hand-styled with a literal `12px`.
4. A load-error state on the detail screen — the list has a banner and a retry, the detail
   screen swallows everything that is not a 404.
5. Two E2E absence assertions that can fail, and two that follow the steps the spec names.

## Sweeps

### Contradiction

Every absolutely phrased rule was taken to its call sites.

- **Requirement 19 ("every message writes a `message_posted` event") against requirement 25
  (a decline's reason *is* a `RequestMessage`).** Both hold together — the decline transaction
  writes a `message_posted` **and** a `status_changed`. State-machine invariant 4 constrains
  only the count of `status_changed` events ("exactly one `RequestEvent` with
  `action = 'status_changed'`"), so a second event of a different action does not breach it.
  Not a contradiction; a gap in the code, planned as **T2**. The reading is written into T2's
  description so it is not re-litigated in a comment.
- **Requirement 17 ("a message may be posted in `open` and `answered` only") against the same
  decline.** Requirement 17's own sentence scopes itself to the endpoint ("the composer is not
  rendered and *the endpoint* answers 409"), and the decline's message is written while the
  locked row is still non-terminal. No contradiction.
- **Requirement 36 against requirement 42.** This *was* the contradiction; `ffa814d` removed
  the reassignment filter from 36. Verified afterwards that no filter exists in the code
  (`grep -n reassign` in `requests.service.ts` and the list page returns only the endpoint and
  the modal). Closed.
- **AC-3 ("no role sees anything it cannot see today") against requirements 37/38.** The spec
  disarms this itself, in AC-3's own second sentence and in README Backward Compatibility 5.
  The mechanism is real in the code: `listRequests` still gates the vacation block on
  `can(caller.role, 'view-requests')` (`requests.service.ts:249`) and `scope=all` on
  `view-all-requests` (`:182`). Not a contradiction.
- **Requirement 28 ("every transition … `FOR UPDATE`") against the four transition routes.**
  All four enter `transition()`, which calls `lockRequest` first. No transition path bypasses
  it.

### Premise

| Claim | Verified at |
|---|---|
| Migrations run before the services roll out | `infra/deploy.sh:183-190` — `infra/migrate.sh` then `tf apply`; skipped when only web changed (`:175`) |
| `parseRequestStatusFilter` is the retired spec-10 parser | `packages/validation/src/index.ts:1957` (spec cites `:1878`; the line moved when the implementation landed, the symbol is there) |
| `REQUEST_MESSAGES` already holds spec 09's keys and is extended in place | `packages/validation/src/index.ts:1771` |
| The badge call sends no `scope`, `type` or `status` | `apps/web/src/layout/requests-badge-context.tsx:42-45` |
| `MAIL_MESSAGE_TYPES` is the single list to assert against | `apps/api/src/mail/mail.service.ts:127` |
| `MailService` is untouched by this feature | no import of it anywhere under `apps/api/src/requests/` |
| `Account.timezone` exists for the per-reader overdue | `apps/api/prisma/schema.prisma:37` |
| `@ds` has no multiline text control | `1_DS for dev/components/forms/` and the `apps/web/src/ds.ts` barrel |

No premise is stale.

### External claims

The spec has no External Contracts section and states it depends on no third-party system,
no API key and no MCP server, and sends no mail. Verified: nothing under
`apps/api/src/requests/` makes an outbound call, and the feature's only double is the
`MailService` recorder TC-01-INT-21 already uses. There is no `Assumed` row carrying a
requirement, so there is no `spec` finding from this sweep and no double to design beyond
the existing `overrideProvider(MailService)`.

### Call sites

- **Requirement 33, "overdue is derived on every read".** Every path that serializes a row
  goes through `toRequestRow(row, today)`: `requests.service.ts:238` (list), `:402` (create),
  `:564` (transition), `:677` (patch), `:763` (reassign) and `requests.serializer.ts:132`
  (get). Six, and no seventh. Listed on **T4**.
- **Requirement 32, "`lastActivityAt` is updated by any message, any status change and any
  reassignment".** `requests.service.ts:448` (message), `:532` (transition), `:737`
  (reassign). The patch handler does not touch it, which requirement 32 does not ask it to.
- **Writers of the `Request` row** (state-machine invariant 8): `:363` create, `:448`
  message, `:532` transition, `:656` patch, `:737` reassign. Five, matching the invariant's
  enumeration once the four transition handlers are read as the one `transition()` method.
  Recorded in each task's `concurrency`.
- **Capability checks this feature added on the web**: `requests/page.tsx:88,89,90`,
  `requests/[requestId]/page.tsx:47`, `requests-badge-context.tsx:38`, `Sidebar.tsx` (the
  Requests row is unconditional and takes none). Listed on **T5** — this is precisely the list
  that stops the fix from landing on one screen and not its sibling.

### Writers

One row shape is written by this change and one existing row is read: `Organization` is
locked but only its counter is incremented, and `VacationRequest` is read and never written
(README Backward Compatibility 3). No other writer of `Request` exists anywhere in the tree —
`grep "request\.update\|request\.create"` across `apps/api/src` returns only the five sites
above. The locks are stated per task.

### Messages

All 32 rows of the Error Messages table exist as exports on `REQUEST_MESSAGES`
(`packages/validation/src/index.ts:1803-1833`) with the exact text the table gives, and each
is emitted by the route the table names. One observation, filed as a note: the list screen's
error banner renders `REQUEST_MESSAGES.genericError`
(`apps/web/app/org/[orgId]/requests/page.tsx:385`), which is spec 09's key on the same object
— shared, in `packages/validation`, not inline, so the repository rule holds — but this
spec's table names no row for it. T6 adds the same banner to the detail screen and will reuse
the same key; the spec should carry the row.

### Verification

The spec's Verification Plan says every state its cases need is reachable and that it owes no
fixture. I checked the rows that carry a helper: `signupOrg`, `inviteAndAcceptViaApi`,
`setMembershipRole`, `createProjectViaApi`, `removeMember`, `submitVacationRequestViaApi` are
all in `e2e/tests/helpers.ts` and in use. No row is marked as not existing today, so this
sweep produces no task — correct, since the feature's own endpoints are the route to every
request state and the cases drive them.

### Sections

All 20 `##` headings are answered by name in `handoff.sections`.

## Findings

No blocker. The three that would have blocked were raised by the previous run's `review` and
answered by the human in `ffa814d`; I re-derived each against the amended text and each is
closed. Two notes go to the human at the end, both with witnesses:

- **P1** — the spec demands a DS-gaps table in its own UI Description and contains none, while
  the feature needs a multiline text control the design system does not export.
- **P2** — the error banner named in the UI Description has no row in the Error Messages
  table, and T6 adds a second banner that needs the same copy.

Both are plannable without an answer, which is why they are notes and not blockers: T7 and T6
carry the work, and the spec text should catch up.
