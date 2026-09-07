# Implement — BUG-012 — attempt 1

## Change

`apps/web/app/org/[orgId]/time-off/calendar/CalendarScreen.tsx`, one file, per the spec's Fix
Approach:

1. **The grid never outlives the window it belongs to.** Both scope-refusal early returns in
   `load` (`scope === 'teams'` with no `projectIds`, `scope === 'people'` with no `memberIds`)
   now call `setData(null)` alongside `setError(...)`, so a refused scope shows the banner with
   no grid at all, rather than the banner over the previous window's grid. The comment above the
   early returns, which described the old "last good grid stays on screen" behaviour, was
   corrected to describe the new one.

2. **A window whose answer has not arrived is not drawn as though it had.** Added a derived
   `isCurrentWindow` boolean: `data !== null && data.range.startDate === range.startDate &&
   data.range.endDate === range.endDate`. The render's three-way choice between skeleton, empty
   state and grid now reads:
   - Skeleton when `!isCurrentWindow && (loading || data !== null)` — covers both first paint
     (`data === null`, `loading === true`) and a step whose answer either hasn't arrived yet or
     failed while a stale window is still held (`data !== null` but for the old range).
   - Empty state only when `data && isCurrentWindow && !hasRows`.
   - Grid only when `data && isCurrentWindow`.
   - Nothing (`null`) when a scope refusal is standing: `data === null`, `loading === false`,
     `isCurrentWindow === false` — none of the three branches fire, matching "no grid is drawn"
     under a refusal.

No other file changes; the API, the two calendar helpers (`stepTimeOffCalendarAnchor`,
`timeOffCalendarWindowRange`) and the URL/state shape are all untouched, as the spec's Blast
Radius and Backward Compatibility sections require.

## Regression test

`TC-01-E2E-11` did not exist yet in `e2e/tests/time-off-calendar.spec.ts`; added it, following
the spec's Steps/Expected Result exactly: switches to the Week preset, records the label text
and the set of day-header ids, steps once and asserts both changed with none of the old ids
still present, then switches to Teams with nothing ticked, steps again, and asserts the banner
carries `TIME_OFF_CALENDAR_MESSAGES.teamsRequired`, `calendar-grid` is absent and no day-header
id is present.

`TC-01-E2E-02` ("picking teams draws their union...") asserted the *old*, now-incorrect
behaviour by name and in its steps — a comment reading "unticking the last one refuses without
clearing" and an assertion that a member row stayed `toBeVisible()` after the refusal. Per the
spec's Blast Radius row on the refused-scope state ("this is the intended change"), updated the
test's title/comment and its post-refusal assertions to expect `calendar-grid` absent and the
member row gone instead of present. No other existing case referenced the retired behaviour.

## Verification

- `npx tsc --noEmit` in `apps/web` — clean, no errors.
- Targeted E2E, per CLAUDE.md's "agents run tests targeted, never whole":
  `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/time-off-calendar.spec.ts
  tests/regressions.spec.ts` from `e2e` — **21 passed**, including the updated TC-01-E2E-02 and
  the new TC-01-E2E-11.

## Acceptance criteria (from the bug spec)

| # | Criterion | Result |
|---|---|---|
| 1 | Clicking `‹`/`›` changes the day columns, not only the range label | Covered by TC-01-E2E-11 and the untouched TC-01-E2E-03 (window navigation) — both pass |
| 2 | While a scope refusal is standing, no grid is drawn | Covered by TC-01-E2E-11 and TC-01-E2E-02 — both pass |
| 3 | A window whose answer has not arrived draws the skeleton, not the previous window | Enforced by the `isCurrentWindow` guard on the grid/empty-state branches; not independently E2E-tested (would need a deliberately slow/failed fetch, which the spec's Known Gaps section leaves as a gap for a retry affordance, not for this fix) |
| 4 | The reproduction no longer reproduces | TC-01-E2E-11 walks the exact repro steps and passes |

## Known Gaps carried forward (unchanged, as the spec records them)

- A failed fetch shows the skeleton beneath the error banner rather than a retry control — left
  open, closed by a future retry affordance per the spec.
- The header controls shifting with the range label's width is BUG-013, untouched here.
