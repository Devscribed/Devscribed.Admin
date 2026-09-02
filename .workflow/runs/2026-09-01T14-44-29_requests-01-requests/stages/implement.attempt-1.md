# implement — attempt 1

Run `2026-09-01T14-44-29_requests-01-requests`, spec `specs/requests/01-requests.md`,
branch `spec/requests`, diff base `f06c7d844daeba66bc0f2545c5071600e6cb4037`.

Most of the handoff's surface is already on the branch (481a165, 6f2dbb5, ffa814d). This
attempt carries the four live defects the previous run's review found, plus the one
bookkeeping item it had already fixed. Each carried finding was re-checked against the
current tree before anything was changed.

## Carried findings

**F1 — the decline branch writes a `RequestMessage` with no `message_posted` event
(requirement 19).** Still present; **fixed**.
`apps/api/src/requests/requests.service.ts` — after `tx.requestMessage.create` in the
decline branch, the same `this.events.record(tx, { …, action: 'message_posted', newLabel:
caller.displayName })` call `postMessage` already makes. The `status_changed` record below
it is untouched, so state-machine invariant 4 (exactly one `status_changed` per
transition) still holds — the new row is an event of a different action, not a second
status change.
Witness: `apps/api/test/requests.spec.ts` TC-01-INT-11 now asserts the two events
separately — one `status_changed` (unchanged) and one `message_posted` with
`actorKind: 'member'` and the decliner's membership id. Proven able to fail: with the new
`events.record` call removed, `npm test -- test/requests.spec.ts -t "writes a decline
reason"` fails at `expect(posted).toHaveLength(1)` (`Tests: 1 failed, 22 skipped`); with
it, the file is `23 passed`.

**F2 — the inbox page reads capabilities from an un-normalized role, so a legacy `member`
loses controls the server grants.** Still present; **fixed**.
`apps/web/app/org/[orgId]/requests/page.tsx` — `const role: Role = normalizeRole(session.role)`
replaces `session.role as Role`, so `can(role, 'create-request' | 'view-all-requests' |
'list-assigned-projects')` asks the matrix a role it knows. `apps/web/src/layout/requests-badge-context.tsx`
— the same normalization on the `view-requests` read, which was harmless only by accident.
No behaviour changes for `admin`/`manager`/`user`/`viewer`; what changes is that a
`member` row now sees the New Request control, the project filter and the modal's project
picker that `POST …/requests` already grants it.
**Residual gap, stated rather than papered over:** this fix has no automated witness. The
defect is only observable for a membership whose stored role is the legacy `member`, and
nothing in the suites can produce one — `e2e/tests/helpers.ts:164` types `setMembershipRole`
to the four target values, and the handoff's own risk register says widening that type
would retire the guard the type is. A unit case over `can(normalizeRole('member'), …)`
would have passed before this change as well, so it would be a test, not coverage; I did
not add one. The gap is the one the handoff names as acceptable ("add a `member`-role case
or accept the gap knowingly").

**F3 — T9's spec-10 bookkeeping was not done.** **Already fixed**, at commit ffa814d,
before this run's tree. Verified in place: `specs/user-management/10-organization-requests-page.md:305-309`
retires TC-10-INT-03 naming TC-01-INT-18 and TC-01-E2E-08; :329 repairs the retirement
note that used to justify itself by the now-false TC-10-INT-03 and names the same two
cases; :326 amends the default-to-pending half and points at TC-01-INT-22. Nothing under
`specs/` was touched by this attempt.

**F4 — TC-01-E2E-11's closing `sidebar-requests-badge` absence cannot fail.** Still
present; **fixed**.
`e2e/tests/requests.spec.ts` — a `badgeFetch(page, orgId)` helper returns a
`page.waitForResponse` for the shell's un-parameterised `GET …/requests` (the list page's
own call carries a query string and does not match), registered before the navigation that
triggers it. Both absence assertions in the case — the opening one, which had the same
flaw and was not in the finding, and the closing one — now await that response first, and
the closing one additionally opens the list and waits for both rows to read `Granted`, so
the count response has been applied to a DOM that the badge would be in.
Proven able to fail: with the service's `waitingOnMe` counter mutated to drop
`status: { in: ['open','answered'] }` (i.e. counting the two granted requests as waiting),
the case fails at `requests.spec.ts:588` — `toHaveCount(0)` expected 0, received 1 — on
both the first run and the retry. Restored; `git diff` on the service is the F1 fix alone.

**F5 — TC-01-E2E-08's `user`-half vacation-section absence cannot fail.** Still present;
**fixed**.
`e2e/tests/requests.spec.ts` — the `user` half now waits for `requests-empty-state`, which
renders only from `data !== null`, before asserting the absences. The vacation section is
drawn from `data.vacation` in that same render, so a block wrongly returned to a `user`
is on screen when the assertion runs. The `requests-scope-toggle` assertion is unchanged —
`canScopeAll` is a synchronous render from the session, as the finding itself narrowed.
Proven able to fail: with the service's vacation gate forced open (`if (true || can(...))`),
the case fails at `requests.spec.ts:497` — `requests-vacation-section` expected 0,
received 1. Restored.

## Tasks

| Task | Files touched | Note |
|---|---|---|
| T1 | — | already on the branch (481a165); unchanged and re-run green by the unit suite |
| T2 | — | already on the branch; the single migration `20260901140000_requests_01_requests` stands, no second migration added |
| T3 | — | already on the branch; exercised by the integration and E2E runs below |
| T4 | `apps/api/src/requests/requests.service.ts` | F1 |
| T5 | `apps/web/app/org/[orgId]/requests/page.tsx`, `apps/web/src/layout/requests-badge-context.tsx` | F2 |
| T6 | — | already on the branch; unchanged |
| T7 | `apps/api/test/requests.spec.ts` | TC-01-INT-11 extended (F1's witness) |
| T8 | `e2e/tests/requests.spec.ts` | TC-01-E2E-08, TC-01-E2E-11 (F4, F5). TC-10-E2E-01's `open`-filter selection in `e2e/tests/requests-page.spec.ts` was already done at 481a165/6f2dbb5 — verified at `requests-page.spec.ts:146-147` — so that file needed no edit |
| T9 | — | already done at ffa814d (F3); `specs/` untouched |

## Test cases

| TC | Where | State |
|---|---|---|
| TC-01-INT-11 | `apps/api/test/requests.spec.ts:637` | extended — now asserts one `status_changed` **and** one `message_posted` |
| TC-01-E2E-08 | `e2e/tests/requests.spec.ts:469` | re-anchored on `requests-empty-state` |
| TC-01-E2E-11 | `e2e/tests/requests.spec.ts:543` | re-anchored on the shell's count response, plus the rendered granted rows |
| TC-01-UNIT-01…06, TC-01-INT-01…22, TC-01-E2E-01…12 | as before | unchanged, all re-run |

No `data-testid` was added; every selector driven here is one the spec names. No
assertion was loosened, no case removed, no suppression added.

## Commands run

| Command | Summary |
|---|---|
| `npm run test:unit` | `Test Files 21 passed (21)`, `Tests 1024 passed (1024)` |
| `npx tsc -p packages/validation/tsconfig.json` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` (apps/web) | 8 errors, all pre-existing `TS2307 Cannot find module` for `@dnd-kit/*`, `dompurify`, `marked` — those packages are not installed in this sandbox's `node_modules`; none in a file this diff touches |
| `npx tsc --noEmit -p tsconfig.json` (apps/api) | clean |
| `npm test -- test/requests.spec.ts` (apps/api) | `Tests: 23 passed, 23 total` |
| `npm test -- test/requests-page.spec.ts` (apps/api) | `Tests: 5 passed, 5 total` |
| `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/requests.spec.ts tests/requests-page.spec.ts tests/app-shell.spec.ts tests/regressions.spec.ts` | `25 passed (50.3s)` |

Falsifiability runs (each mutation reverted immediately, and the reverted state re-run
green above): `npm test -- test/requests.spec.ts -t "writes a decline reason"` →
`1 failed`; `… npx playwright test tests/requests.spec.ts -g "the badge appears at two"` →
1 failed at :588; `… -g "an admin sees the vacation section"` → 1 failed at :497.

Integration and E2E were run targeted, never whole, on ports 3100/4100. Jest was filtered
by positional path.

## Notes for the reviewer

- The only residual is F2's missing witness, described above. It is a coverage gap, not an
  unfixed defect: the page and the badge provider both normalize now.
- The handoff's two open notes to the human (P1, the area README's claim of a reassignment
  filter requirement 36 forbids; P2, the missing DS-gaps table and the absent `@ds`
  Textarea) are unchanged by this attempt — both are spec/DS bookkeeping outside this
  attempt's file globs.
