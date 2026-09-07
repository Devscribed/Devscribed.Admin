# Implement — PATCH-002 — a needed-by date more than five years out is refused

## What changed

- `packages/validation/src/requests.ts`
  - Added `REQUEST_NEEDED_BY_MAX_YEARS = 5`.
  - Added `requestNeededByMax(today: string): string`, pure, adding the constant to
    `today`'s year and keeping month/day (a 29 Feb ceiling lands on 1 March of a
    non-leap year, the ordinary consequence of adding a year — no special-casing).
  - `validateRequestNeededBy` now checks the ceiling after the shape check and after
    the (creation-only) lower bound, so a six-digit year is always `neededByInvalid`
    and never `neededByTooFar`, and the ceiling applies whether or not
    `enforceNotPast` is set — i.e. on creation and on edit alike.

- `packages/validation/src/index.ts`
  - Added `neededByTooFar: 'The date needed cannot be more than five years away'` to
    `REQUEST_MESSAGES`, extended in place per the module's existing convention.

- `packages/validation/src/requests.test.ts` — TC-01-UNIT-07: the ceiling itself
  (valid), one day past it (`neededByTooFar`), today (valid), the six-digit year
  (`neededByInvalid`, proving shape runs before the ceiling), yesterday
  (`neededByPast`), and the ceiling/no-lower-bound pair on edit
  (`enforceNotPast: false`).

- `apps/api/test/requests.spec.ts` — TC-01-INT-23: `POST` and `PATCH` with a date six
  years out both answer `400` with `fields.neededBy` equal to `neededByTooFar`, and the
  request row is left with `neededBy: null`. Added `COPY.neededByTooFar` (asserted
  literally, matching the file's existing convention) and a small
  `ymdUtcYearsFromNow` helper alongside the existing `ymdUtc`.

## Not changed, per the spec's blast radius

- `validateNewRequest`, `validateRequestEdit`, `requests.service.ts`,
  `NewRequestModal.tsx`, and `isRequestOverdue` — each reaches or is unaffected by the
  rule through `validateRequestNeededBy` alone, with no call-site edit required, as the
  spec states. Confirmed by re-reading each and by `grep -rn
  "validateRequestNeededBy" apps packages`, which still returns exactly the three call
  sites the spec names.
- No `data-testid`, no `max` attribute on the control (PATCH-003), no backfill.

## Verification

- `npm run test:unit` (packages/validation, full suite): 23 files, 1104 tests, all
  passing, including the 6 new TC-01-UNIT-07 cases.
- `apps/api`: `npm test -- test/requests.spec.ts`: 24 tests, all passing, including
  the new TC-01-INT-23 case.
- No E2E case in this patch's `cases` list — none run.
