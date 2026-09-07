# implement — attempt 4

Spec bundle amended again mid-run at `c837454` ("covered but empty" must not be worded as
"not covered"). Branch `spec/holiday-sourcing`, new commit `092e72b`.

## The two blockers

### S3-1 — `spec/contradiction`, `holiday-sourcing-uncovered` vs REQ-02-023

**Settled in the document while this attempt was running, and then implemented.**

The reviewer addressed it to `spec` and was right to: REQ-02-023 defines `empty` as
covered-but-empty, while the testid table and the UI Description made the banner say *"The
holiday service does not cover this country"* in exactly that state. No implementation
satisfies both. Commit `c837454` decided it, in the document:

- a new Error Messages row — `HOLIDAY_SOURCING_MESSAGES.countryNoHolidays`, *"The holiday
  service lists no public holidays for this country this year. Add any by hand."*;
- §UI Description — "one line per country, **each line carrying the message its own state
  names**: `countryNotCovered` for `unsourced`, `countryNoHolidays` for `empty`";
- Edge case 5a, new, saying the second must **never** carry the first;
- the testid row now reads "present per country in either state, carrying the message its
  own state names".

Implemented as decided:

| Change | File |
|---|---|
| `countryNoHolidays` added, verbatim | `packages/validation/src/holiday-sourcing.ts` |
| each banner line takes `uncoveredMessage(entry.state)` — `empty` → `countryNoHolidays`, otherwise `countryNotCovered` | `apps/web/app/org/[orgId]/settings/holidays/page.tsx` |
| TC-02-E2E-03 seeds a third member in `VA`, which the double covers and answers empty for, and asserts that line carries the new sentence and **not** the old one | `e2e/tests/holidays.spec.ts` |
| a unit case pins all seven messages to the table's literal text | `packages/validation/src/holiday-sourcing.test.ts` |

The E2E assertions compare **the document's literal strings**, not the constants the screen
imports — asserting the constant certifies whatever the code happens to say.

### S3-2 — sweep 8, a test cannot fail (TC-02-E2E-02's refresh half)

**Fixed, and the fix was verified by breaking the code.** The reviewer's own test: replace
`onRefresh={() => void runSync({ refresh: true })}` with a no-op and see whether the case
still passes.

Before: the half asserted only `toHaveCount(0)` on `holiday-sourcing-status`, which resolves
on the first poll when the element never appears, and `holiday-summary-country-GB` visible,
which was already true before the click.

Now, in `e2e/tests/holidays.spec.ts`:

1. the automatic sync of REQ-02-012 is allowed to finish first — otherwise both the wait and
   the status could be satisfied by a request nobody clicked for;
2. `page.waitForResponse` names the refresh **by its flag** (`postDataJSON()?.refresh === true`);
3. `holiday-sourcing-status` is asserted **visible**, and to carry `syncing`, before it is
   asserted to go — the shape TC-02-E2E-01 already uses;
4. the response is asserted `200` and its body `{ refresh: true, year }`.

Verified: with `onRefresh` a no-op the case fails at line 536 —
`expect(locator).toBeVisible() failed … element(s) not found` — on both the first run and the
retry. The no-op was reverted and the case is green again.

That first attempt at the fix also *found* something: the wait matched a `refresh: false`
sync. The server log showed why — the automatic sync issued at page open was still inside the
800 ms route delay when `page.reload()` killed it, so the reloaded page issued its own
automatic sync, and that one was in flight at the moment of the click. Hence (1) and (2)
above rather than a looser wait.

## Notes closed alongside them

Nine of the fifteen, all in files this run owns, none of them touching the neighbourhood
`c837454` was deciding:

| Note | What changed |
|---|---|
| S3-6 | `acceptProviderEntries` discards a date the month does not have — `2026-02-31` matches `YYYY-MM-DD`, rolls to 3 March through a `Date`, and would have been stored as a day nobody sent. Round-trip check, a unit case, and a fourth entry in the double's malformed shape |
| S1-N2 | `byCurrency` presence follows **financial settings** (a live row or any snapshot), not whether the accumulated map is non-empty. A member with settings whom no holiday reached now carries an empty list, which is what separates them from a member with no settings. New integration case |
| S2-N3 | the nager driver cancels the response body before throwing on a non-2xx, so the failure path — the busy one — releases its socket |
| S2-N1 | TC-02-INT-14's margin is `callBoundMs * 4` rather than a fixed +5000ms, which a service ignoring the bound entirely would have passed |
| S3-4 | the global summary row's id is keyed on the value the API sends (`null`), so it instantiates the roster's pattern instead of inventing `all` |
| S3-5 | a member with no resolved country renders a dash, not "All" — which on this screen means the opposite (a holiday that reaches everybody) |
| S3-8 | a summary whose `year` differs from the tab waits, rather than labelling last year's figures with this year's heading |
| S3-3 | a sync that was abandoned or failed removes its year from `autoSynced`, so returning to that year tries again |
| S3-7 | `HolidaySourcingSettings` is used at both call sites instead of two inline shapes |

Left alone, deliberately:

- **S1-N1** (route the *shipped* holiday gates through `normalizeRole`) — those gates are
  outside this spec, and changing them alters behaviour no requirement here asks about.
- **S1-N3** (wrap one country's writes in a transaction) — the reviewer marks it "none
  required against the document"; the uniqueness indexes are the arbiter Edge case 12 names.
- **S2-N2** (unit tests for the nager driver and its config) — new test files nobody's
  handoff task names; recorded for a person.
- **S3-9** (the country-filtered empty state) and **L1** / **S1-N4** — the first sits inside
  the empty-state/unsourced logic `c837454` was rewriting the wording of, and the other two
  are addressed to the document.

## Commands run

| Command | Result |
|---|---|
| `npm run test:unit` (root) | `Tests 1455 passed (1455)` |
| `npx tsc --noEmit` from `apps/api` and from `apps/web` | no output |
| `npm test -- test/holiday-sourcing.spec.ts test/holidays.spec.ts` from `apps/api` | `Tests: 39 passed, 39 total` |
| `npm test -- test/holidays.spec.ts test/time-off-calendar.spec.ts test/reports-amounts-owed.spec.ts test/time-tracking.spec.ts` | `Tests: 3 skipped, 156 passed, 159 total` |
| `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/holidays.spec.ts tests/regressions.spec.ts` from `e2e` | `20 passed (1.0m)` |
| the same suite with `onRefresh` a no-op | **1 failed**, at the status assertion — which is the point |
| `node scripts/static-gate.mjs --run …` | **`static-gate: pass`** |

The integration file now carries 20 cases: TC-02-INT-01 to 16 and four unnumbered ones for
rules no numbered case reaches — the year bound on both routes, the setting's default and its
refusal, the checkbox against Edge case 4, and REQ-02-018's boundary.

`.claude/skills/ship/SKILL.md` and `.workflow/runs/2026-09-07T11-38-42_…/` are modified in the
working tree by something outside this run; neither was staged.
