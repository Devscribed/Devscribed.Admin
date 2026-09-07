# implement — attempt 2

Spec: `specs/time-off/02-holiday-sourcing.md` (+ `.contracts.md`, `.cases.md`)
Branch: `spec/holiday-sourcing` · HEAD `11930bf` — **no new commit; nothing was changed**

The implementation is the one attempt 1 delivered (`2fbace6`, `11930bf`). Attempt 2 exists
only to answer the single finding the static gate raised, and that finding is **contested**.

## The finding

- **`spec/message-not-implemented`** — `specs/time-off/02-holiday-sourcing.md#`
  `` `HOLIDAY_MESSAGES.toastServerError` ``
  *the Error Messages row names a string that exists nowhere in `packages/validation`*
  witness: `git grep -lF -- "(shipped, unchanged)" -- packages/validation` (no match)

**Contested**, with the counter-witness below. Recorded:

```
node scripts/wf.mjs contest \
  --finding 'spec/message-not-implemented@specs/time-off/02-holiday-sourcing.md#`HOLIDAY_MESSAGES.toastServerError`' \
  --reason '…'
→ contested spec/message-not-implemented@specs/time-off/02-holiday-sourcing.md#`HOLIDAY_MESSAGES.toastServerError`
```

### The counter-witness — the probe is a note, not a message

1. **What the gate searched for is not a message.** `scripts/static-gate.mjs:295-311` takes
   the cell under the `Message` header of each Error Messages row and searches
   `packages/validation` for it. For this row that cell is a parenthetical *about* the row:

   ```
   specs/time-off/02-holiday-sourcing.contracts.md:142
   | `HOLIDAY_MESSAGES.toastServerError` | every route above | (shipped, unchanged) | no |
   ```

   `(shipped, unchanged)` is 20 characters, just over the 12-character floor at
   `static-gate.mjs:311` under which the gate skips a probe — which is the whole reason this
   row is reported and no other carried-over row is.

2. **The string the row names ships, and this diff does not touch it.**

   ```
   packages/validation/src/holiday-messages.ts:29:  toastServerError: 'Something went wrong. Please try again.',
   packages/validation/src/index.ts:2340:           toastServerError: 'Something went wrong. Please try again.',
   git diff 9ad9fd8d...HEAD --name-only -- packages/validation/src/holiday-messages.ts  → (empty)
   ```

   It is emitted eight times from `apps/web/app/org/[orgId]/settings/holidays/page.tsx`
   (`git grep -c "HOLIDAY_MESSAGES.toastServerError"` on that file → `8`), including from the
   two handlers this spec added. The row's own `New` column says `no`.

3. **There is therefore nothing to implement, and the two available "fixes" are both
   forbidden.** Adding the literal `(shipped, unchanged)` to `packages/validation` would be
   writing text to satisfy a grep — the exact failure pre-implement note **P1** raised this
   row to prevent, and the handoff's `risks` records the same instruction. Editing the
   Message cell is a spec edit, which the implementer may not make.

4. **What would close it, for the person this halts for.** Put the shipped text in the
   Message cell and keep `no` in the `New` column, which is what every other carried-over row
   in this table does (`HOLIDAY_MESSAGES.deleteForbidden` on line 141 is the example one line
   above). That is a one-cell document change and the gate then passes unaided.

This was foreseen before any code was written: `pre_implement.verdict.json` → finding **P1**,
severity `note`, target `spec`, with the same witness and the same instruction.

## What changed in the code this attempt

Nothing. `git status` carries no modification outside `.workflow/`, and `HEAD` is still
`11930bf`.

## Commands run

Re-run to confirm the branch is still green while the finding is contested:

| Command | Result |
|---|---|
| `npm run test:unit` (root) | `Tests 1453 passed (1453)` |
| `npm test -- test/holiday-sourcing.spec.ts test/holidays.spec.ts` from `apps/api` | `Tests: 38 passed, 38 total` |
| `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/holidays.spec.ts tests/regressions.spec.ts` from `e2e` | `20 passed (1.0m)` |
| `node scripts/static-gate.mjs --run …` | `blocked` — the one finding above, and no other |

Attempt 1's report lists the full task-by-task diff, every `TC-*` and where it lives, and the
two defects the E2E run found and how they were fixed; none of that changed.
