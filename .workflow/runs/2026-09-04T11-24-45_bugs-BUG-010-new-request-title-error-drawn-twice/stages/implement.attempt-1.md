# Implement — BUG-010, attempt 1

Fixed exactly the Fix Approach in `specs/bugs/BUG-010-new-request-title-error-drawn-twice.md`:
the Title field in `NewRequestModal.tsx` handed a raw string to `@ds` `Input`'s `error` prop
and then drew `FieldError` beside it, printing `REQUEST_MESSAGES.titleRequired` (and every
other title error) twice.

## Files touched

- `apps/web/src/field-error.tsx` — added `errorNodeById(id, message)`, verbatim what the
  report specifies (and what BUG-007's Fix Approach also adds — neither had landed yet, so
  this run wrote it). Existing exports (`errorNode`, `hintNode`, `focusByTestId`) untouched.
- `apps/web/app/org/[orgId]/requests/NewRequestModal.tsx` — for the Title field only:
  imported `errorNodeById` from `@/field-error`; `error={fieldErrors.title}` now becomes
  `error={fieldErrors.title ? errorNodeById('request-new-error-title', fieldErrors.title) : undefined}`;
  removed the sibling `<FieldError field="title" .../>`. `FieldError` itself is unchanged and
  stays in the file for `topicId`, `assigneeMembershipId`/`assigneeClientMembershipId`,
  `description`, `projectId`, `priority` and `neededBy` — all `Select`s or native elements,
  where it is still the only node that draws the message. `titleRef` and
  `focusFirstInvalid` are untouched, per the report's Blast Radius row.
- `e2e/tests/requests.spec.ts` — extended `TC-01-E2E-02` (`an invalid new-request form shows
  every error and focuses the first field`) with the count assertion the report specifies,
  placed immediately after the existing `request-new-error-title` visibility check:
  `getByTestId('request-new-modal').getByText('Enter a title', { exact: true })` has count 1.
  No new `TC-*` id — this is the same case, extended, as the report requires.

## Verification

- `npx tsc --noEmit` (from `apps/web`) — clean, no errors touching either changed file.
- `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/requests.spec.ts
  tests/regressions.spec.ts -g "an invalid new-request form"` — 1 passed. Confirmed failing
  against the pre-fix code per the report's own Evidence section (reproduced there, not
  re-reproduced here since the fix was applied before this run's first test execution).
- `npm run test:unit` — 1098 passed, 23 files.

## Acceptance criteria

1. Empty title draws the message once — covered by the extended `TC-01-E2E-02`, passing.
2. Same holds for every title error (short, long, server `titleRequired`) — the fix is in the
   render path keyed on `fieldErrors.title` being set at all, not on which validator set it, so
   this holds structurally; not independently re-tested per the report's own regression-test
   scope (E2E covers the one render mechanism).
3. `request-new-error-title` still on the one node, under the field, same text —
   `errorNodeById` renders `<span id="request-new-error-title"
   data-testid="request-new-error-title">{message}</span>`, in the DS's own error slot under
   the control.
4. Title control still shows error state (border/label/glow) — `error` is still non-empty
   whenever `fieldErrors.title` is set, so the DS's `error ? 'var(--error-500)' : …` branches
   are unaffected.
5. `request-new-error-topic` / `request-new-error-assignee` unchanged, still exactly once —
   not touched; `FieldError` still renders them, and the extended E2E case still asserts
   `request-new-error-topic` visible.
6. Focus still lands on Title when it's the first invalid field — `titleRef` wraps the same
   `<div>`, `focusFirstInvalid` looks up the `input` inside it, unchanged.
7. Extended `TC-01-E2E-02` passes — confirmed above.

## Findings

None. No retry — this is attempt 1.
