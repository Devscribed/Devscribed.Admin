# Implement — BUG-011: the organization country hint is overlapped

## What changed

**`apps/web/app/org/[orgId]/settings/holidays/page.tsx`** — the organization-country row's
`marginBottom` raised from `var(--space-6)` (16px) to `var(--space-8)` (24px), exactly as the
spec's Fix Approach prescribes. The `dropdown`-variant `Select`'s hint hangs 20px below the
control's own box and contributes no height for it (`Select.tsx:480`); 16px of row margin let
the country filter's opaque control paint over the hint's last 4px (its descender band).
24px leaves the hint's 20px plus a 4px gap. No file under `packages/ds` was touched (Acceptance
Criterion #4).

**`e2e/tests/time-off-calendar.spec.ts`** — added `TC-01-E2E-10`, the regression test the spec
specifies: sign in as an admin, open Settings › Holidays, read the bounding box of the hint text
node and of `holidays-country-filter`, and assert the hint's bottom edge sits at or above the
filter's top edge. The hint is located by its text content (`TIME_OFF_CALENDAR_MESSAGES.orgCountryHint`,
imported from `@devscribed/validation`) rather than through `aria-describedby`: the current
`Select` composition on this screen does not wire `hintId`/`aria-describedby` between the hint
and the control (neither the DS component nor this call site sets it), so that specific
mechanism named in the spec's regression-test steps does not exist in the code today — locating
the hint by its rendered text is the closest available way to observe the same geometry the
spec's acceptance criteria (1) and (2) require, and criterion (3) (the hint still carries the
message and still describes the control) is unaffected by this fix either way. Wiring
`aria-describedby` is outside the Fix Approach, which names one file and one property.

## Verification

- `npx tsc --noEmit -p apps/web/tsconfig.json` — clean.
- Confirmed the new test fails without the fix: with `marginBottom` reverted to `var(--space-6)`,
  the assertion reports `hintBox.bottom = 341` vs `filterBox.top = 337` — a 4px overlap, matching
  the bug report's own measurement exactly. Restored the fix afterward.
- `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/time-off-calendar.spec.ts
  tests/regressions.spec.ts` from `e2e` — 19 passed, including the new `TC-01-E2E-10` and the
  existing `TC-01-E2E-07/08/09` that exercise the same picker.

## Acceptance criteria

| # | Criterion | Result |
|---|---|---|
| 1 | The whole hint line is visible, descenders included | Verified by TC-01-E2E-10 |
| 2 | The hint and the country filter do not overlap at any viewport | Verified by TC-01-E2E-10 (default viewport; the row is `flexWrap: 'wrap'` at every width the screen supports, so the vertical clearance this fix adds holds regardless of wrap) |
| 3 | The hint still carries `TIME_OFF_CALENDAR_MESSAGES.orgCountryHint` and still describes `org-country-select` | Unchanged — the `hint` prop and its text are untouched; the pre-existing description relationship (or lack of one, see note above) is not touched by this diff |
| 4 | No file under `packages/ds` is changed | Confirmed — `git diff --stat` touches only `apps/web` and `e2e` |

## Known gaps (left open, per spec)

The two rows recorded in the spec's Known Gaps table — the hint's left-edge inset disagreeing
with its label's, and every other hinted `dropdown` Select being one `--space-6` gap away from
the same overlap — are left alone, as the spec instructs.
