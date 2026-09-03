# implement — attempt 1

Spec: `specs/requests/01-requests.md` · Branch `spec/requests` · Base `f06c7d8`

This run replaces `2026-09-01T14-44-29_requests-01-requests`, whose two blockers were
addressed to `specs/user-management/10-organization-requests-page.md` and were closed on the
working branch before this run started. The branch already carried the whole implementation
(`481a165`, `6f2dbb5`, `e17de7a`, `2d802e9`, `9afbcb4`), so this attempt is verification and
one hygiene repair, exactly as the handoff frames each task ("names the file that already
holds the work and what remains to be proven").

## The carried findings, verified against the current tree

**F1 — the spec-10 amendment banner promised thirteen marked statements and marked seven.**
**Already fixed; `9afbcb4` (`docs(specs): finish the spec-10 amendment, all thirteen
statements`) closed it.** Every statement the witness named is now marked in place, checked
line by line against HEAD:

| Witness line | State now |
|---|---|
| actors line (`:35`) | "every signed-in member opens this page … (**amended by requests/01 requirement 37**)" (`:43`) |
| permission matrix row | `View Requests page \| ✅ \| ✅ \| ✅ \| ✅` (`:50`) |
| default filter (`:53`, as the finding cited it) | "**Default filter:** `all` (**amended by requests/01 requirement 42**, was pending)" (`:62`) |
| query vocabulary (`:142`) | "`status` — `all` (default), `open`, `answered`, `granted`, `declined`, `cancelled`. An unknown value is a `400`" (`:151`) |
| endpoint auth line (`:139`) | "Every `active` member of the organization may call it (**amended by … 37**)" (`:148`) |
| response block (`:178`) | replaced by `{requests, vacation:{requests,pendingCount}, counts:{waitingOnMe,total}}` with the vacation card kept byte-identical (`:194-199`, with the note at `:201-203`) |
| error-messages row (`:198`) | struck through and retired, recording `REQUESTS_PAGE_MESSAGES.viewForbidden` as emitted by no route (`:221`) |
| sidebar visibility (`:207`) | "Rendered for every signed-in member (**amended by requests/01 requirement 38**)" (`:230`) |
| both badge descriptions (`:61`, `:208`) | "`counts.waitingOnMe` plus, for a holder of `view-requests`, the pending vacation count" (`:70`, `:231`) |
| status-filter control (`:214`) | "All statuses" (default), "Open", "Answered", "Granted", "Declined", "Cancelled" (`:237`) — the labels `apps/web/app/org/[orgId]/requests/page.tsx:36-41` renders |

Nothing here was edited by this stage: `specs/` is not mine to change, and the diff of this
attempt touches no file under it.

**F2 — TC-10-INT-01 was amended on its Steps and not on its Expected Result.**
**Already fixed; the same commit `9afbcb4`.** The Expected Result now reads (`:308`)
"`vacation.requests` holds the 3 rows … `vacation.pendingCount` is 3. `requests` is `[]` and
`counts` is `{ waitingOnMe: 0, total: 0 }` … (**amended by requests/01 requirements 41 and
42**; was a top-level `pendingCount: 3`)", which is the shape the case carrying that id
asserts (`apps/api/test/requests-page.spec.ts:210-236`). Spec and test now describe one
response.

Neither finding is contested; both were correct and both are closed.

## Tasks

| Task | Files at HEAD | State this attempt |
|---|---|---|
| T1 value sets, validators, parsers, comparator, capabilities | `packages/validation/src/requests.ts`, `index.ts`, `roles.ts` | verified in place; 43 + 130 unit cases green |
| T2 the one migration | `apps/api/prisma/schema.prisma`, `prisma/migrations/20260901140000_requests_01_requests/migration.sql` | **edited this attempt** (below); still exactly one migration on this branch, additive only |
| T3 `POST /requests` | `requests.service.ts:302-399`, `requests.controller.ts:57`, `request-events.service.ts`, `requests.serializer.ts`, `requests.dto.ts`, `app.module.ts` | verified: number allocated under `SELECT … FOR UPDATE` on `Organization`, `created` event in the same transaction, cross-organization membership/project → bare 404, archived in-organization project → 400 `projectUnavailable` |
| T4 the thread | `requests.service.ts:410-468`, controller `:87` | verified: no edit route, no delete route; 409 `threadClosed` in a terminal status |
| T5 the state machine | `requests.service.ts:479-780` | verified: every transition locks the row and evaluates party → terminal → legality → actor against **that** read; decline writes its reason as a `RequestMessage` plus its `message_posted` event in the same transaction; `answeredAt` / `resolvedAt` written once |
| T6 the two GETs | `requests.service.ts:153-292`, `vacation-request-feed.service.ts`, serializer, dto | verified: both counters computed before any filter; `vacation.pendingCount` from the unfiltered set (`vacation-request-feed.service.ts:106`); `type=vacation` selects the section, not a filter |
| T7 the web surface | `requests/page.tsx`, `types.ts`, `RequestRow.tsx`, `NewRequestModal.tsx`, `[requestId]/*`, `Sidebar.tsx`, `requests-badge-context.tsx` | verified: sidebar row unconditional (`Sidebar.tsx:82`), badge = `counts.waitingOnMe` + vacation pending for a `view-requests` holder, roles normalized client-side before `can()`, disabling only for in-flight guards (`saving`/`busy`/`actionsBusy`) |
| T8 the cases | the six test files below | all run, all green |
| T9 spec-10 bookkeeping | `specs/user-management/10-organization-requests-page.md` | **not this stage's edit.** The file is under `specs/`; the work it asked for is complete at HEAD (`9afbcb4`) and verified statement by statement above |

### The one edit this attempt makes

`apps/api/prisma/schema.prisma` — the committed version had been run through `prisma format`,
which realigned 31 hunks in models this spec does not touch (`datasource db`,
`DocumentTemplate`, `DocumentTemplateVersion` and others): 196 changed lines of which 122 were
this spec's. The formatting churn is now reverted, leaving the file at base plus this spec's
122 lines and nothing else — `git diff -w` against the previous HEAD is empty, so no schema
semantics moved. Verified with `npx prisma validate` ("The schema at prisma\schema.prisma is
valid"), `npx prisma generate` from `apps/api`, and a re-run of both integration suites.

## Test cases

| Case | Where |
|---|---|
| TC-01-UNIT-01 … TC-01-UNIT-06 | `packages/validation/src/requests.test.ts` (title lengths; type/accessKind pairs; addressee kinds; the comparator with the loaded terminal row; overdue in two timezones; the capability matrix) |
| TC-01-INT-01 … TC-01-INT-22 | `apps/api/test/requests.spec.ts` |
| TC-01-INT-18, TC-01-INT-22, TC-01-E2E-08 (server half) | also referenced from `apps/api/test/requests-page.spec.ts` |
| TC-10-INT-01 … TC-10-INT-03 | `apps/api/test/requests-page.spec.ts` — spec 10's own cases, on the new vocabulary |
| TC-01-E2E-01 … TC-01-E2E-13 | `e2e/tests/requests.spec.ts` |
| TC-10-E2E-01 | `e2e/tests/requests-page.spec.ts` — selects the `Open` filter before approving, per requirement 42's third bullet |

Message assertions compare the spec's literal text: `apps/api/test/requests.spec.ts:25-45`
holds a local `COPY` table transcribed from the spec's Error Messages section, and no test file
imports `REQUEST_MESSAGES`.

## Commands run

| Command | Summary line |
|---|---|
| `npm run test:unit` (root) | `Test Files 21 passed (21)` · `Tests 1024 passed (1024)` |
| `npm test -- test/requests.spec.ts test/requests-page.spec.ts` (from `apps/api`) | `Test Suites: 2 passed, 2 total` · `Tests: 28 passed, 28 total` — run twice, before and after the schema edit |
| `npx tsc --noEmit -p tsconfig.json` (from `apps/api`) | no output, exit 0 |
| `npx tsc --noEmit -p tsconfig.json` (from `apps/web`) | 8 errors, all `TS2307 Cannot find module` for `@dnd-kit/*`, `dompurify`, `marked` in `projects/**` and `tasks/**` — declared in `apps/web/package.json:14-19` but absent from `node_modules` in this worktree. Pre-existing and untouched by this diff; no error in any file this spec owns |
| `npx prisma validate` / `npx prisma generate` (from `apps/api`) | `The schema at prisma\schema.prisma is valid 🚀` / generated |
| `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/requests.spec.ts tests/requests-page.spec.ts tests/regressions.spec.ts` (from `e2e`) | `22 passed (49.9s)`, `1 flaky` — `requests.spec.ts:502` failed its first try on `apiRequestContext.post: read ECONNRESET` against `POST /api/signup` in the fixture and passed on retry; a transport reset during setup, not an assertion |

## Notes for whoever routes this

- `specs/requests/README.md:84` still says an inactive addressee's requests surface in a
  **reassignment filter**, and requirement 36 says no such filter exists and enumerates the
  filters exhaustively. Requirement 36 is the specific statement and wins, so no filter was
  built and nothing here is blocked; the README line is a person's edit, not this stage's.
- Two spec silences are implemented as the handoff's risk table decided, and neither is
  argued for in a code comment beyond naming the requirement that decides it: the vacation
  section renders **empty** under `type=access` or `type=question`
  (`requests.service.ts:245-250`, following requirement 42's "type is a choice of section"),
  and an unknown `scope` answers 400 with a field code like an unknown `status` or `type`
  (`requests.service.ts:174-180`). If a later stage reads either differently, the fix is one
  line and the spec sentence is one line — it should not be settled in a comment.
