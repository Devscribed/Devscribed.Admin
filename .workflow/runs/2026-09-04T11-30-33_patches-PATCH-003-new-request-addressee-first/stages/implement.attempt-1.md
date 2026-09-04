# Implement — PATCH-003: The addressee is chosen first, and the project chooses the contact

Attempt 1. Document is the plan (patch track, no compiled plan).

## Files touched

- `apps/web/app/org/[orgId]/requests/NewRequestModal.tsx` — the one production file the
  document names. Reordered the form (`To` first, above `About`), added the unset starting
  state for the addressee kind, disabled `About`/`Title`/`Description`/`Project`/`For`
  while it is unset, added the `request-new-error-assignee-kind` inline error and the
  short-circuit that renders it (and only it) on a submission with no kind chosen, reversed
  the project/contact narrowing (`Project` offers projects that belong to a client;
  choosing one narrows `For`'s contacts to that project's client; changing the project
  clears the chosen contact), and seeded `Needed by` with today plus a `max` of
  `requestNeededByMax(today)` from `packages/validation` (PATCH-002).
- `e2e/tests/requests.spec.ts` — TC-01-E2E-01 extended: asserts the seeded `Needed by`
  value/min/max before touching anything, and chooses `Colleague` before filling the rest.
  TC-01-E2E-02 extended: submitting with no kind chosen now asserts
  `request-new-error-assignee-kind` and focus on `request-new-assignee-kind` first, then
  chooses a kind and re-submits to keep its original multi-error assertion.
- `e2e/tests/request-topics.spec.ts` — the three cases that drive this modal (TC-02-E2E-02,
  03, 06) each gain the one-line addressee-kind choice PATCH-003 requires before a disabled
  control is touched or the per-audience catalogue is read.
- `e2e/tests/client-participants.spec.ts` — TC-03-E2E-04 gains the same one-line addition
  and its project/contact steps are reordered (project first, then contact) to match the
  reversed dependency; its second half (the empty-catalogue switch) was already correct
  and untouched. New test **TC-03-E2E-06** added, covering the field order, the five
  disabled controls, the unset-kind submission error and focus, and the project-then-contact
  narrowing described in the spec's own case.

## `TC-*` written or extended

- `TC-03-E2E-06` — new, `e2e/tests/client-participants.spec.ts`.
- `TC-01-E2E-01` — extended, `e2e/tests/requests.spec.ts`.
- `TC-01-E2E-02` — extended (per the document's own note), `e2e/tests/requests.spec.ts`.
- `TC-02-E2E-02`, `TC-02-E2E-03`, `TC-02-E2E-06` — one-line addition each,
  `e2e/tests/request-topics.spec.ts`.
- `TC-03-E2E-04` — one-line addition plus reordered steps, `e2e/tests/client-participants.spec.ts`.

## Commands run

- `cd apps/web && npx tsc --noEmit -p tsconfig.json` — clean, no output.
- `npm run test:unit` — 23 files, 1104 tests passed.
- `cd e2e && E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/requests.spec.ts tests/request-topics.spec.ts tests/client-participants.spec.ts tests/regressions.spec.ts` — 34 passed.

No API or migration changes; `apps/api` integration suite is untouched by this diff, so it
was not run.
