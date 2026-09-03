# implement — attempt 1

Spec: `specs/requests/01-requests.md` · branch `spec/requests` · base `f06c7d8`

The handoff marks T4–T10 `PRESENT at HEAD` and only T1, T2, T3 `OPEN`. I verified each open
item against the working tree before touching it and left every `PRESENT` task alone, so the
diff is four files, 20 insertions, 11 deletions.

## Tasks

### T1 — normalize the caller's role on the request detail screen (req 35, 40)

`apps/web/app/org/[orgId]/requests/[requestId]/page.tsx`

- Verified present: line 46 read `const role = session.role as Role`.
- `normalizeRole` added to the `@devscribed/validation` import; the read is now
  `const role: Role = normalizeRole(session.role)`, matching
  `apps/web/app/org/[orgId]/requests/page.tsx:93` and
  `apps/web/src/layout/requests-badge-context.tsx:41`.
- Both downstream reads are unchanged and now ask the same question the server asks:
  `can(role, 'view-all-requests')` and `role === 'admin'`.
- I did not sweep the other `session.role as Role` casts elsewhere in `apps/web`; the handoff
  puts them outside this change's blast radius.

### T2 — `request-detail-decline-error`, and TC-01-E2E-05 asserting it (req 25)

`apps/web/app/org/[orgId]/requests/[requestId]/DeclineRequestModal.tsx`,
`e2e/tests/requests.spec.ts`

- Verified present: the id existed nowhere under `apps/web`; the error `<div>` carried no
  `data-testid`, and TC-01-E2E-05 asserted only that the reason field was still visible after
  the empty submit — which the corrected spec calls out as passing for a modal rendering no
  error at all.
- (a) `data-testid="request-detail-decline-error"` on the conditional error `<div>`. It is
  rendered only when `error` is set, so it covers both the client-side `validateDeclineReason`
  path (:44) and the server's 400 body re-populating the same state (:69).
- (b) TC-01-E2E-05 now asserts `request-detail-decline-error` is visible and
  `request-detail-status` still reads `Open` after the empty submit. The assertion could fail
  before this change (the id resolved to nothing) and would fail today if the modal rendered no
  error. Nothing about the status code or the message text is asserted here — the 400
  `declineReasonRequired`, the absent status write and the absent message row are
  TC-01-INT-12's, which exists and passes. The message text is not restated in the test; it
  comes from `REQUEST_MESSAGES.declineReasonRequired` through `validateDeclineReason`.
- Every `data-testid` in the diff is named in the spec's Required list (line 748).

### T3 — the two DS-gap controls carry tokens, not literals (req 4, 16)

`apps/web/app/org/[orgId]/requests/NewRequestModal.tsx`,
`apps/web/app/org/[orgId]/requests/[requestId]/DeclineRequestModal.tsx`,
`apps/web/app/org/[orgId]/requests/[requestId]/page.tsx`

Eight literals replaced with the tokens that already hold those exact values, so no pixel
changes: `1.5px` → `var(--border-crisp)` (`1_DS for dev/tokens/radii.css:14`, 1.5px) and `12px`
→ `var(--sp-6)` (`1_DS for dev/tokens/spacing.css:8`, 12px). Both files are imported into the
web app through `@ds/styles.css` at `apps/web/app/layout.tsx:4`, so both tokens are served.

- NewRequestModal description textarea: border + padding.
- NewRequestModal `neededBy` date input: border + padding.
- DeclineRequestModal reason textarea: border + padding.
- Detail-screen message composer: border + padding.

No new `@ds` component; the two gaps stay recorded as gaps in the spec's DS gaps table.
`apps/web/app/org/[orgId]/members/[memberId]/RejectRequestModal.tsx` carries the same literal
and belongs to spec 09 — untouched, as the handoff requires.

### T4–T10

No change. Verified `PRESENT at HEAD` by the spot checks the handoff names: all 41 case ids are
in the suites and the integration suite is green (below); every id in the spec's Required
`data-testid` list except `request-detail-decline-error` was already under `apps/web`, which is
what T2 closed.

## Carried findings from `2026-09-01T15-33-10_requests-01-requests#review`

- **F1** (`CLAUDE.md` role transition · `[requestId]/page.tsx#RequestDetailPage`) — **still
  present, fixed.** The cast was at line 46 exactly as the witness said. Fixed by T1: the read
  now normalizes before every capability check, so `member` maps to `user` instead of missing
  the matrix and reading `false` through `can()`'s `?? false`. The `as Role` assertion of a
  falsehood is gone with it.
- **F6** (`--no-carry` documented in `scripts/ship.mjs` but never forwarded · `ship.mjs#main`)
  — **already fixed at HEAD; nothing to do.** `scripts/ship.mjs:393` now reads
  `...(flag('no-carry') ? ['--no-carry'] : [])` inside the `wf('init', …)` call, so `wf.mjs:393`
  sees the flag and takes the `{ from: null, findings: [] }` branch. `git log -S"no-carry" --
  scripts/ship.mjs` names commit `3d46cb3` as what fixed it — the person's spec-correction
  commit, which is newer than the review that raised the finding. `node --check scripts/ship.mjs`
  passes. This file is in no task's globs and I made no edit to it.

## Note for the reviewer on the plan

The handoff has no task for F6, though F6 is a carried `code` blocker. That gap turned out to be
harmless — the finding was already closed at HEAD — but it is worth naming, since a carried
blocker outside every task's globs would otherwise have no owner.

## Commands run

- `npm run test:unit` (root) — `Test Files 21 passed (21) · Tests 1024 passed (1024)`.
- `npx tsc --noEmit` (from `apps/web`) — no error in any file this diff touches. Eight
  pre-existing `TS2307 Cannot find module` errors remain in `projects/**` for `@dnd-kit/*`,
  `dompurify` and `marked`: those packages are declared in the root `package.json` but absent
  from `node_modules`, so this is an uninstalled dependency in the environment, unrelated to
  this diff and to this spec's files.
- `npm test -- test/requests.spec.ts` (from `apps/api`) — `Test Suites: 1 passed · Tests: 23
  passed, 23 total` (11.0 s). Run although this diff touches no `apps/api` file, because T2
  leans on TC-01-INT-12 carrying the server half.
- `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/requests.spec.ts
  tests/regressions.spec.ts` (from `e2e`) — `22 passed (56.3s)`.

No suite was run in full at the integration or E2E level, and ports 3000/4000 were not used.

## Verdict

`pass`. No `spec` finding: every requirement in T1, T2 and T3 has one reading, and the two
tokens the DS gaps table names exist with the exact values the literals held.
