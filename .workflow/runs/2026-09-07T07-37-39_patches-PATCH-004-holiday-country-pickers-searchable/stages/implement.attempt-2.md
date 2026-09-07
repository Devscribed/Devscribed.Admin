# Implement — PATCH-004 — attempt 2

## What sent attempt 1 back

`pipeline/work-uncommitted`: the four files attempt 1 changed
(`apps/web/app/org/[orgId]/settings/holidays/HolidayModal.tsx`,
`apps/web/app/org/[orgId]/settings/holidays/page.tsx`, `e2e/tests/holidays.spec.ts`,
`e2e/tests/time-off-calendar.spec.ts`) were left as working-tree edits and never committed
to `fix/holiday-country-pickers-searchable`, so `git diff baseRef...HEAD` — what the review
and every other gate reads — showed nothing.

## Fix

The branch was already checked out and the working tree already held the correct content
from attempt 1 (nothing about the implementation itself was in question). Staged the four
named files by path and committed them:

```
git add "apps/web/app/org/[orgId]/settings/holidays/HolidayModal.tsx" \
        "apps/web/app/org/[orgId]/settings/holidays/page.tsx" \
        "e2e/tests/holidays.spec.ts" \
        "e2e/tests/time-off-calendar.spec.ts"
git commit -m "fix(holidays): make the three country pickers searchable"
```

Commit `a1d8a49` on `fix/holiday-country-pickers-searchable`. Confirmed the witness command
from the finding now reports the diff:

```
$ git diff --name-only e659a5baa790c54e7c1e3c3c565385a2359450c6...HEAD -- . ':(exclude).workflow'
apps/web/app/org/[orgId]/settings/holidays/HolidayModal.tsx
apps/web/app/org/[orgId]/settings/holidays/page.tsx
e2e/tests/holidays.spec.ts
e2e/tests/time-off-calendar.spec.ts
```

`git status --short` after the commit shows only `.workflow/` run bookkeeping left
uncommitted, which is the run harness's own state and not part of this patch's diff.

## Re-verification after the commit

- `npx tsc --noEmit` in `apps/web` — clean (unchanged from attempt 1; no source edits made
  in this attempt).
- `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/holidays.spec.ts
  tests/time-off-calendar.spec.ts` — run three times post-commit. One run passed 16/16
  clean. Two runs each had exactly one unrelated test fail once — `a user opens the calendar
  and sees a row per member with both band treatments` (passed alone on retry) and `a
  manager sets a member's country in the form beside their role` (failed on `ECONNRESET`
  during `POST /api/signup`, before the test ever reaches a country picker). Neither touches
  a country picker or anything this patch changed, and both are consistent with the same
  local network/IO strain that produced `ERR_NETWORK_IO_SUSPENDED` failures in the previous
  attempt's report. A third run of the same pair passed 16/16 clean, including both of the
  cases that had just failed.

No content changed from attempt 1's implementation — this attempt is the commit only.
