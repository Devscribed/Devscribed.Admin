# implement — attempt 3

Spec: `specs/time-off/02-holiday-sourcing.md` (+ `.contracts.md`, `.cases.md`), amended at
`384d8c6` · handoff recompiled at `0c169e3`
Branch: `spec/holiday-sourcing` · new commit `f26046a`

## The finding that sent this back

- **`spec/message-not-implemented`** — `specs/time-off/02-holiday-sourcing.md#`
  `` `HOLIDAY_MESSAGES.toastServerError` ``
  witness: `git grep -lF -- "(shipped, unchanged)" -- packages/validation` (no match)

**Already resolved, in the document, by the person the attempt-2 contest halted the run for.**
Commit `384d8c6` — *"spec(time-off/02): the four defects pre-implement predicted, including
the one that blocked"* — replaced the Message cell:

```
-| `HOLIDAY_MESSAGES.toastServerError` | every route above | (shipped, unchanged) | no |
+| `HOLIDAY_MESSAGES.toastServerError` | every route above | Something went wrong. Please try again. | no |
```

The gate's probe is now the shipped string at `packages/validation/src/holiday-messages.ts:29`,
and `node scripts/static-gate.mjs --run …` answers **`static-gate: pass`**. Nothing was
implemented for this row and no text was added to `packages/validation` — the finding was a
defect of the document, which is what the contest said and what the document change confirms.
The finding text carried into this prompt is the pre-amendment copy.

## What the amendment then required of the code

`384d8c6` settled all four notes pre-implement raised before any code was written. Three cost
nothing — `paidHours` on the list route was already a JSON number, `createdByAccountId` was
already written and already asserted, and the message row is the one above. **One reverses the
reading attempt 1 implemented**, and the recompiled handoff carries it as
`replan.codeThatMustChange`:

> §Boundary values, Identity — `{provider}` is *the name of the driver that answered* —
> `nager` in a deployed environment, `fake` under the local double.
> TC-02-INT-01 — an `externalKey` of `fake:DE:{date}` — "never `nager`, which is the deployed
> driver's name".

Attempt 1 built the opposite reading (one provider identity across both drivers), which was
the only reading under which the *previous* text of TC-02-INT-01 could pass. The spec now says
the other thing, plainly, so the branch follows it.

| Change | File |
|---|---|
| `readonly name = 'nager'` → `readonly name = 'fake'` | `apps/api/src/holidays/provider/fake-holiday.provider.ts:29` |
| The port's docstring for `name` stated the rule the amendment reverses; it now states the amended one | `apps/api/src/holidays/provider/holiday-provider.ts:25-30` |
| The fake driver's class docstring said it reports the name of the service it doubles | `apps/api/src/holidays/provider/fake-holiday.provider.ts:5-12` |
| TC-02-INT-01: `expect(holiday.externalKey).toBe(\`fake:DE:${date}\`)` | `apps/api/test/holiday-sourcing.spec.ts:303` |
| TC-02-INT-01: the `HolidayImport` row reads `provider: 'fake'` | `apps/api/test/holiday-sourcing.spec.ts:318` |
| The stub says it inherits the driver's name, `fake` | `apps/api/test/stub-holiday.provider.ts` |

Two of those six are the docstrings. They are not decoration here: each stated the *rule* the
amendment reverses, and a comment that contradicts the document is the next reader's defect.

The `nager` driver was already reporting its own name and did not change. Nothing else compares
the value: no shipping path reads `externalKey` or `HolidayImport.provider`, the unit test
passes the provider name to `holidayExternalKey` explicitly, and no E2E case observes either.
Rows written in a deployed environment keep `nager` and are not migrated — the column records
what answered at the time.

Pre-implement's two remaining notes are answered by exactly this: **P5** (the reversal, which
it recorded so the reviewer reads it as deliberate) and **P6** (nothing to implement).

## Commands run

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` from `apps/api` | no output |
| `npm test -- test/holiday-sourcing.spec.ts` from `apps/api` | `Tests: 19 passed, 19 total` |
| `npm test -- test/holidays.spec.ts test/time-off-calendar.spec.ts test/reports-amounts-owed.spec.ts` | `Tests: 2 skipped, 82 passed, 84 total` |
| `npm run test:unit` (root) | `Tests 1453 passed (1453)` |
| `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/holidays.spec.ts tests/regressions.spec.ts` from `e2e` | `20 passed (59.8s)` |
| `node scripts/static-gate.mjs --run …` | **`static-gate: pass`** |

The two changed assertions can fail: they passed against `nager` before this commit and against
`fake` after it, and the driver line is what moved between the two runs.

## Unchanged

Everything else on the branch is attempt 1's work (`2fbace6`) plus the panel's
`syncFailedSome` line (`11930bf`); attempt 3 added no behaviour and touched no other file.
`.claude/skills/ship/SKILL.md` and `.workflow/runs/2026-09-07T11-38-42_…/` are modified in the
working tree by something outside this run and were deliberately not staged.
