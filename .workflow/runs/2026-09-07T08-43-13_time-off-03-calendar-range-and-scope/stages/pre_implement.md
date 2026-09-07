# pre-implement — time-off/03, calendar range and scope defaults

Spec: `specs/time-off/03-calendar-range-and-scope.md` (+ `.contracts.md`, `.cases.md`)
Base: `c3abb8dc0a7f2bf6438dc6c569a7cea90fa04363` · branch `spec/calendar-range-and-scope`
Verdict: **pass**, six notes, no blocker.

---

## What I read, and in what order

The code before the plan. In order: the three bundle files; `specs/time-off/README.md` (Shared
Rules, Cross-Spec Side Effects, the spec-03 blast-radius section, Backward Compatibility items 11
and 12); `CLAUDE.md`; `packages/ds/README.md` for the four normative rules. Then the shipping
surface itself —

- `apps/api/src/time-off/time-off-calendar.service.ts` in full, and its controller;
- `packages/validation/src/time-off-calendar.ts` in full, and its test file around the message
  assertions;
- `apps/web/app/org/[orgId]/time-off/calendar/CalendarScreen.tsx` in full;
- `apps/web/app/globals.css`, the `.time-off-calendar` block (`:865`–`:1000`);
- `packages/ds/src/components/forms/DateRangePicker.tsx` in full, `Calendar.tsx`'s
  `availableDates` / `minDate` / `maxDate` contract, `ToggleButton.tsx`'s `options` form,
  `Select.tsx`'s placeholder branch, `apps/web/src/reports/ReportFilters.tsx#MultiFilter`;
- `apps/api/test/time-off-calendar.spec.ts` and `e2e/tests/time-off-calendar.spec.ts` around
  every assertion of the two refusals;
- `infra/deploy.sh:27`, `specs/bugs/BUG-013-*.md`, and the git history of `--range-col`.

## The shape of the change

Three moving parts, and one of them is a trap.

**The route loses two refusals.** That is the easy half to read and the dangerous half to write.
`resolveRows` uses `idFilter === null` as its existing sentinel for "no id narrowing"
(`time-off-calendar.service.ts:264`, `:309-312`), and both scoped branches assign an **array** —
`[...ids]` at `:301`, `memberIds` at `:305`. Delete the refusals and nothing else, and an empty
selection becomes `id: { in: [] }`: the route answers `200` with zero rows and the screen draws
`calendar-empty-state`. That is a green build, a green typecheck, and the exact opposite of
REQ-03-001 and REQ-03-002. It is called out at the top of T2 and both integration cases assert
three members rather than merely a 200.

**Two message exports are deleted, and the deletion is the mechanism.** `teamsRequired` and
`peopleRequired` have exactly four consumers — service `:120` and `:123`, screen `:204` and
`:210`, the e2e spec `:339`, the validation test `:137-138`. All are in this diff. One wrinkle
the bundle does not mention: `packages/validation` resolves through a **gitignored `dist/`**
(`package.json` → `main: dist/index.js`), so until the package is rebuilt the compile-time break
this spec is relying on does not happen anywhere. T1 ends with the build.

**The screen gains a fourth window.** I deliberately did *not* widen `TimeOffCalendarWindow`.
It is the parameter of `timeOffCalendarWindowRange` and `stepTimeOffCalendarAnchor`, both
anchor-driven; a custom range has no anchor, and widening the union would force both functions to
invent a branch for a case they cannot answer. `TimeOffCalendarWindowChoice = TimeOffCalendarWindow
| 'range'` sits beside it and is what the screen holds.

The three unit cases turn out to want three small pure functions and no fourth: `stepTimeOffCalendarRange`,
`timeOffCalendarRangeToday`, `timeOffCalendarAnchorFromRange`. REQ-03-017's direction — preset →
range — is already `timeOffCalendarWindowRange`, which returns `{ startDate, endDate }`; wrapping
it would be a second name for one rule, so TC-03-UNIT-13 asserts the composition instead.

## The one gap that needed a design-system change

REQ-03-009 — "while a start has been armed, no end more than 91 days after that start can be
chosen" — **cannot be expressed against `DateRangePicker` as it ships**. The armed start is the
component's private `pending` state (`DateRangePicker.tsx:87`), and `selectable` is computed from
the fixed `minDate` / `maxDate` props alone (`:124-127`). There is no prop, and no consumer-side
composition, that narrows the panel after the first click.

So it goes *into* the design system, as CLAUDE.md requires: one optional prop, `maxSpanDays`.
Two details that decide whether it is right:

- it narrows **`availableDates` only**, never the `minDate`/`maxDate` handed to `Calendar`, because
  those two gate the month arrows (`Calendar.tsx:175-176`) and a 92-day forward bound spans four
  months — narrowing them would strand the reader in the month they armed the start in;
- it is optional and undefined by default, so the three shipped consumers
  (`reports/amounts-owed:440`, `reports/time-and-activity:511`, `reports/time-off:415`) are
  unchanged.

The bound is **forward-only**, exactly as REQ-03-009 is worded. A reader who arms a start and then
clicks a much earlier day still commits a range, and if it exceeds 92 days the server refuses it —
which is Edge case 7, already written. I did not extend the bound backwards; that would be growth.

## The geometry, and what already shipped

Two claims in the bundle are about a repository that moved under it, and both resolve in the
implementation's favour rather than against it.

**The label reservation already exists.** BUG-013 shipped `--range-col: 26ch` on the
`.time-off-calendar` block and `width: var(--range-col)` on the label (`globals.css:877`, `:886`,
commit `595fcf6`, which landed after the bundle was written in `e659a5b`). The cases file's DS-gaps
table asks for a new `--range-label-col` for the same reservation. Declaring a second property for
one width is precisely the drift the DS-gaps table exists to prevent, so T5 widens the existing one
if the Range label needs it — and the widest string the contracts file names,
`28 Dec 2026 – 14 Mar 2027`, is the same 25 characters as the widest preset label BUG-013 measured,
so it very likely already fits. Noted below rather than silently done.

**The grid does not scroll above 1200px today.** `min-width: max-content` on the grid lives inside
`@media (max-width: 1199px)` (`globals.css:978-983`). TC-03-E2E-13 measures the scroll at a
**1280px** viewport, above that breakpoint. REQ-03-018 therefore needs the rule unconditional, not
merely a new `--day-col-min`. And the floor's value carries an arithmetic constraint the spec does
not state: with `--name-col: 264px`, 92 columns only overflow 1280px if the floor exceeds roughly
11px. ~32px is what the two-line day header wants anyway; T5 records the reasoning so a later
edit cannot shrink it into passing vacuously.

## Concurrency, migration, authorization

**Concurrency: none, and that is a fact about the route rather than an omission.** `GET
.../time-off/calendar` writes nothing — time-off/01's own invariant — so no row is contended and
no lock is taken. The only writer this change adds is a test fixture, into an organization the
test just created, in a database wiped per run.

**Migration: none.** No entity, no column, no default; `startDate` and `endDate` are query
parameters the route already takes and the 92-day bound already ships. The deploy-order premise is
recorded anyway (`infra/deploy.sh:27`), because the migration step is simply skipped on a
change like this and the reader should not have to infer that from silence.

**Authorization: untouched, and re-verified.** `requireViewCapability` reads
`can(normalizeRole(caller.role), 'view-time-off-calendar')` at `:241`, so a membership still
storing the legacy `member` is read as `user` and answered `200`; a caller without the capability
gets a bare `404`, byte-identical to the wrong-organization refusal, and every query scopes by
`session.organizationId`. Widening the default widens no audience: an empty Teams selection
resolves to the same active memberships the `all` scope has always returned for the same three
roles.

## Three shipped tests assert a rule this spec withdraws

Not mentioned anywhere in the bundle, and they fail the moment T1 lands:

| Case | Where | What it asserts today |
|---|---|---|
| TC-01-INT-06 | `apps/api/test/time-off-calendar.spec.ts:427` | `scope=teams` with nothing ticked → 422 `teamsRequired` |
| TC-01-INT-08 | `apps/api/test/time-off-calendar.spec.ts:466` | `scope=people` with nobody picked → 422 `peopleRequired` |
| TC-01-E2E-03 (tail) | `e2e/tests/time-off-calendar.spec.ts:335-342` | the banner carries `teamsRequired`, `calendar-grid` absent |

The newest spec governs the behaviour, so all three are rewritten in place to assert the new rule,
keeping their case markers so the ids stay traceable. **`specs/time-off/01-*.md` is not edited** —
an older spec records what was decided then, and the static gate would block the edit regardless.

## Edge case 1, and the fixture nothing consumes

The cases file marks "more than 100 active memberships" as a state that does not exist today and
calls the fixture "a task this spec owes"; the Known Gaps table calls Edge case 1 unreachable and
names the same fixture as what closes it. No numbered case consumes it, which would leave the plan
building a file with no reader — and a file no requirement asks for is what the review stage is
built to block on.

So T3 builds it *and* uses it, in one assertion marked `// Edge case 1` (the integration suites
already carry unnumbered edge-case assertions; `requests.spec.ts` has eight). And it is a
**module, not a controller**: the contracts file says no route is added, every existing file under
`apps/api/src/test-support/` is a route only because a browser needed one, and an integration test
holds the `PrismaService` already. Nothing registers it in `app.module.ts`, so it reaches no
deployed surface.

## Task shape

Six tasks, file globs disjoint, ordered `T1 → T2 → T3` and `T1,T4 → T5 → T6`. The two halves are
independent until the screen, so an orchestrated shape would split cleanly — but the diff is small
and tangled through one deleted export, and the run is configured `single` anyway.

`node scripts/handoff-coverage.mjs` comes back clean: 18 requirements assigned, 10 live cases
claimed, all 9 `##` sections accounted for.

## Notes, in order of how much they cost

1. **The DS-gaps table is missing its most important row.** REQ-03-009 needs a capability the
   design system does not have, and the table records only three custom properties while asserting
   that "every new number is one of the three custom properties above". Planned as T4 and recorded
   in `dsGaps`.
2. **`--range-label-col` names a reservation that already ships as `--range-col`.** The bundle and
   BUG-013's fix were written in the same week and the fix landed second.
3. **Edge case 1's fixture is owed by one file of the bundle and written off as a gap by another.**
   Planned as owed, with a consumer so it is not dead code.
4. **The bundle says nothing about the three shipped cases it invalidates.** Planned as rewrites.
5. **`signInAsAdmin` does not exist.** The Verification Plan names it as the helper
   `time-off-calendar.spec.ts` opens with; that suite uses `signupOrg` + `signInUi` from
   `e2e/tests/helpers.ts`, and `signInAsAdmin` appears nowhere in `e2e/`.
6. **My own definition points at a path that is gone.** `pre-implementer-strict.md` says to read
   `1_DS for dev/README.md` when the task touches UI. That directory does not exist; the four
   normative rules are in `packages/ds/README.md`, which is what CLAUDE.md names and what I read.
