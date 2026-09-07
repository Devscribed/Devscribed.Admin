# pre-implement — attempt 2 (replan)

Spec: `specs/time-off/02-holiday-sourcing.md` (bundle: `.contracts.md`, `.cases.md`)
sha256 `7aaee48d10ed3c57b2b5095973b06ac7f81c4c361ea3f023e142d9cc07be104e` — the amended text,
committed as `384d8c6`. The plan compiled at attempt 1 stands; this pass changes what the
amendment changed and nothing else.

## What sent this back

**`spec/message-not-implemented` — `HOLIDAY_MESSAGES.toastServerError`. Fixed in the spec, and
there is nothing to implement.**

The gate takes the cell under the `Message` header of the Error Messages table and greps
`packages/validation` for it (`scripts/static-gate.mjs:294-329`). That cell used to read
`(shipped, unchanged)` — a note about the export, twenty characters, just above the gate's
twelve-character skip floor — so the probe was never a message. Attempt 1 raised exactly this as
note **P1** before any code was written, and the implementer contested the finding on that
witness rather than adding the literal to `packages/validation` to satisfy a grep.

Commit `384d8c6` put the shipped text in the cell, as every other carried-over row does:

| Export | Route | Message | New |
|---|---|---|---|
| `HOLIDAY_MESSAGES.toastServerError` | every route above | Something went wrong. Please try again. | no |

Verified now, not assumed:

- `packages/validation/src/holiday-messages.ts:29` — `toastServerError: 'Something went wrong.
  Please try again.'`, re-exported from `packages/validation/src/index.ts`. The gate's message
  rule passes.
- `git grep -lF -- "Something went wrong. Please try again." -- apps` returns **nothing**, so
  the gate's second rule on that row, `spec/message-duplicated`, also stays silent. The screen
  imports the constant.
- `git diff 9ad9fd8...HEAD -- packages/validation/src/holiday-messages.ts` is empty. The row's
  New column says `no` and it is true.

No code changes for this finding. The handoff's `messages` entry for the row now records the
text and both greps.

## The other three amendments

The same commit settled the three notes attempt 1 raised beside P1. Two of them cost no code;
one reverses a reading this branch already implemented.

**P3 — `paidHours` on the list route (settled, no code).** The sample body now shows
`"paidHours": 8` with prose beneath it saying the list route sends a JSON number and the
*summary* route the two-decimal string. That is what
`apps/api/src/holidays/holidays.service.ts#toSummary` already returns and what
`apps/web/app/org/[orgId]/settings/holidays/types.ts` and
`apps/web/app/org/[orgId]/time-tracking/types.ts` already parse. Kept in `risks` so the reviewer
sees the two shapes are deliberate.

**P4 — `createdByAccountId` (settled, no code).** REQ-02-004 now names it, with the reasoning:
the column is `NOT NULL` behind a required `Account` relation
(`apps/api/prisma/schema.prisma:938`, `:952`) and the caller is the only account the import
knows. `apps/api/test/holiday-sourcing.spec.ts:305` already asserts it.

**P2 — the driver's own name (settled the other way; this one costs code).** Attempt 1 read
`{provider}` as the *service being doubled* and planned one name, `nager`, on both drivers —
the only reading under which TC-02-INT-01 could pass as it was then written. The amendment takes
the opposite reading and says so in both places:

- Boundary values: ``externalKey``, ``{provider}:{countryCode}:{date}``, where `{provider}` is
  the name of the driver that answered — `nager` in a deployed environment, `fake` under the
  local double.
- TC-02-INT-01: an `externalKey` of `{the driver's own name}:DE:{date}` — `fake:DE:{date}` under
  the double this case runs against, **never** `nager`.

The branch implements the old reading. Three lines change, and the handoff names each:

| Where | Now | Must be |
|---|---|---|
| `apps/api/src/holidays/provider/fake-holiday.provider.ts:29` | `readonly name = 'nager'` | `readonly name = 'fake'` |
| `apps/api/test/holiday-sourcing.spec.ts:303` | `` expect(holiday.externalKey).toBe(`nager:DE:${date}`) `` | `` `fake:DE:${date}` `` |
| `apps/api/test/holiday-sourcing.spec.ts:318` | `provider: 'nager'` | `provider: 'fake'` |

Blast radius of that change, checked rather than assumed: `git grep "'nager'"` over
`apps/api/src`, `packages` and `e2e` returns the two drivers, the config's driver union and its
two guards, and one unit assertion —
`packages/validation/src/holiday-sourcing.test.ts:197` — which passes the provider name in as an
argument and is therefore unaffected. `HolidayImport.provider` and `Holiday.externalKey` have no
shipping reader: `toSummary` names its fields one by one, `reports.service.ts#fetchHolidays` and
`time-off-calendar.service.ts` select what they need, and no E2E case observes either. Rows
already written in a deployed environment keep `nager` and are not migrated — the column records
what answered at the time.

## Compile checklist

| id | Answer |
|---|---|
| H-01 | ok — 25 REQ ids in the spec, 25 across the tasks' `requirements` |
| H-02 | ok — 22 live cases (2 unit, 16 int, 4 E2E) in `testCases`; none is `- **Retired.**` |
| H-03 | ok — all 8 `##` headings of the spec, plus every heading of the two bundle members, have an entry in `sections` |
| H-04 | ok — every path cited in the handoff exists on disk, checked by extracting the path-shaped tokens from the file and stat-ing each |
| H-05 | ok — `reuse` (15 rows, each with a file) and `buildFromZero` (12 rows) |
| H-06 | ok — REQ-02-025's "any read" is answered by T4's `allCallSites`: both scopes of `listHolidays` and the four readers of the route |
| H-07 | ok — 13 `shippingSurfaces` rows. This pass adds no new reachable value: the driver-name change alters the *content* of two columns this spec creates, and neither has a shipping reader |
| H-08 | ok — `concurrency` on T3, T4 and T6; the uniqueness indexes are the arbiter and no lock is taken, matching the shipped holiday writers |
| H-09 | ok — 8 message rows, each with its `packages/validation` module and the route or screen that emits it. The two carried-over rows ship and are unchanged |
| H-10 | ok — the three Verification Plan rows marked `no` are the fake driver (T2), its empty/failing/never-answering behaviours (T2) and a caller holding `view-holidays` without `view-amounts-owed` (T5's capability-explicit entry point); TC-02-INT-01..16 depend on T2, TC-02-INT-11 on T5 |
| H-11 | ok — one migration, `20260907120000_time_off_02_holiday_sourcing`: two new tables, three new columns on `Holiday`, no rename, no drop, no new `NOT NULL`. T3's note states the order read from `infra/deploy.sh:27` |
| H-12 | ok — T4, T5, T6 and T7 each name `normalizeRole()` and say what it does with the stored `admin`/`member` and the four-value target set |
| H-13 | ok — four `Assumed` rows, and the spec states that no requirement rests on one: REQ-02-009 treats every non-conforming answer alike, REQ-02-006 covers the duplicate-date assumption. Nothing to raise |
| H-14 | ok — `doubleBehaviours` is the contracts file's "What the double must reproduce" table, row for row |
| H-15 | ok — `dsGaps` is empty and the DS gaps table says None; `Card`, `ReportTableHead`, `ReportGroupBody`, `Checkbox`, `InfoBanner`, `Preloader` and `Button` are all exported from `packages/ds/src/index.ts` |
| H-16 | ok — 8 tasks, each with `files`, `requirements` and `dependsOn` |
| H-17 | ok — `node scripts/handoff-coverage.mjs` → pass, sections 8/8 |

## Premises re-anchored

The branch's own diff moved five of the line numbers attempt 1 recorded. Each was re-read and
the citation updated rather than dropped: `schema.prisma:932-935` → `:938` and `:952`;
`schema.prisma:684, :704` → `:690`, `:710`; `index.ts:855-857` → `:856`;
`reports.ts#buildHolidayRow:554-571` → `:602`; `core.module.ts:53-80` → `:7` and `:84`; and the
`reports.ts` helper offsets. Two premises were added — the message text and both its greps, and
the driver-name chain from the abstract `readonly name` through `holiday-sourcing.service.ts:365`.

## Verdict

`pass`. The blocking finding is repaired in the document and needs no code; the plan changes in
three lines, all named in `handoff.replan.codeThatMustChange`.
