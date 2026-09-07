# Implement — attempt 1

BUG-013: the calendar's `‹`, **Today** and `›` controls slide sideways because
`.time-off-calendar-range` has no width of its own and is the last child of a flex row
`PageHeader` pins to the right edge — every character the label gains or loses is taken from
the space the controls occupy.

## What was built

- `apps/web/app/globals.css` — the `.time-off-calendar` block:
  - Declared `--range-col: 26ch` as the fourth (now fifth, alongside the existing three band
    colours and `--name-col`) DS gap, sized for the widest string `rangeLabel` can return: a
    Week or 2 weeks range crossing both a month and a year boundary, e.g.
    `28 Dec 2026 – 10 Jan 2027` (25 characters), with a one-character margin.
  - Updated the block comment to record the new gap and its rationale, matching the pattern
    the other three already use.
  - `.time-off-calendar-range` now gets `display: inline-block`, `width: var(--range-col)` and
    `white-space: nowrap`, so the label's box is a constant size regardless of which of the
    three text shapes it holds. Nothing left of it moves. This is the approach the bug's Fix
    Approach section calls for and rejects `min-width` (overflows on the long strings) and
    reordering the row (moves the label instead).
  - No change to `PageHeader.tsx` or anything under `packages/ds` — satisfies Acceptance
    Criterion 4.

- `e2e/tests/time-off-calendar.spec.ts` — added **TC-01-E2E-12**, following the bug's
  Regression Test section: signs in as admin, opens the calendar, selects the Month window,
  records `calendar-today`'s bounding box, then clicks `calendar-next` eleven times recording
  the box and the `calendar-range-label` text after each click. Asserts every recorded `x` for
  `calendar-today` equals the first, and that the label text took at least four distinct
  values across the run (which crosses both the widest and narrowest month names starting
  from whatever month the suite runs in, per the file's own September-2026-agnostic
  convention).

## Files touched

| File | Change |
|---|---|
| `apps/web/app/globals.css` | `.time-off-calendar` block: new `--range-col` custom property, fixed width on `.time-off-calendar-range`, comment updated |
| `e2e/tests/time-off-calendar.spec.ts` | New test, TC-01-E2E-12 |

## Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | `calendar-prev`, `calendar-today`, `calendar-next` hold one position across every window a preset can reach | Covered by TC-01-E2E-12, passing |
| 2 | The range label still shows the same text it shows today, for all three presets | Unchanged — only the label's box width changed, not `rangeLabel()` or its markup |
| 3 | The reserved width is a declared custom property in the `.time-off-calendar` block, recorded as a DS gap in that block's comment | Done — `--range-col`, alongside the existing three |
| 4 | No file under `packages/ds` and no shared layout file changed | Confirmed — only `globals.css` and the e2e spec were touched |

The bug's Spec Verdict proposes an edge case for `time-off/01` to adopt later; per the frozen-spec
convention no spec file was edited by this fix — the proposal is left for whoever next writes a
spec or patch that touches this screen.

## Tests run

```
cd e2e
E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/time-off-calendar.spec.ts tests/regressions.spec.ts
```

Result: `9 passed (45.7s)` — all of `time-off/01`'s existing E2E cases plus the new
TC-01-E2E-12, and `regressions.spec.ts`, all green.

No unit or integration files were touched (CSS and E2E only), so `test:unit` and `test:int`
were not run for this diff.

## Findings

None — attempt 1, no prior findings to close.
