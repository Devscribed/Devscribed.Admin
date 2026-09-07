# Pre-implement — `specs/time-off/02-holiday-sourcing.md`

Run `2026-09-07T10-33-36_time-off-02-holiday-sourcing`, shape `strict`, base
`9ad9fd8d337d6cb82120557d5b2c91bdbe44a844`.

Verdict: **pass**, with five notes. The spec compiles: every requirement lands on a task, every
live case is claimed, and every path the new rows reach is either governed by a rule in the
bundle or by a rule in the shipped code that the bundle does not disturb.

## What I read

The bundle (`02-holiday-sourcing.md`, `.contracts.md`, `.cases.md`), the area `README.md` —
Product decisions, Shared Rules, Cross-Spec Side Effects, Blast Radius and Backward
Compatibility, all four of which carry rules this spec leans on — and, in `depends-on`, spec 01's
country-resolution rule as the README states it.

Then the code, before the plan:

- `apps/api/src/holidays/holidays.service.ts` and `holidays.controller.ts` — the four shipped
  holiday routes, the 404-not-403 gate discipline, and `toSummary`, which is the projection the
  new `source` field has to join.
- `apps/api/src/organizations/organization-country.{controller,service}.ts` — the exact shape the
  two new `settings/holiday-sourcing` halves copy: `SessionGuard` + `OrgScopeGuard` on the
  controller, both capability checks in the service because both answer 404.
- `apps/api/src/reports/reports.service.ts` — `fetchHolidays`, `resolveRateAtDate`,
  `buildHolidayRow`, and the aggregation that sums **already-rounded** per-row amounts.
  This is what TC-02-INT-09's "equal to the cent" is measured against.
- `apps/api/src/time-off/time-off-calendar.service.ts` — the second shipping reader of `Holiday`,
  and the repository's example of `can(normalizeRole(role), …)`.
- `apps/api/prisma/schema.prisma` and `migrations/20260901130000_spec_org_03_holidays` — the two
  uniqueness indexes (composite, plus the hand-written partial one for the global row) and
  `createdByAccountId`, which is `NOT NULL` behind an FK.
- The four shipped ports: `queue/queue.provider.ts`, `storage/storage.provider.ts`,
  `mail/mail.provider.ts`, `pdf/pdf.provider.ts`, plus `core.module.ts`.
- `packages/validation/src/{index,roles,holidays,holiday-messages,reports,time-off-calendar}.ts`.
- `apps/web/app/org/[orgId]/settings/holidays/**`, plus the two other `scope=mine` readers —
  `time-tracking/page.tsx` and `members/[memberId]/RequestVacationModal.tsx`.
- `packages/ds/src/index.ts`, to check the seven components the cases file says this screen is
  built from.
- `scripts/static-gate.mjs` and `scripts/handoff-coverage.mjs`, because both read this bundle and
  one of them has a false positive waiting in it (note N1).

## The shape of the plan

Eight tasks. The first three are the foundations that nothing else can start without — the pure
rules and messages, the provider port with its two drivers, and the migration — and they are
mutually disjoint. T4 (sourcing and the sync route), T5 (the summary), T6 (the sourcing setting)
are three separate services in three separate files. T7 is the screen, T8 the cases.

`shipConfig.spec.stages.implement.use` is `single` on this run, so the file overlaps that remain
(`app.module.ts` is edited by T2, T4 and T6) cost nothing; they are recorded anyway so a later
run under `orchestrated` can see them.

### Decisions the plan makes that the spec left to the code

**The call bound is enforced by the service, not only by the `nager` driver.** TC-02-INT-14 makes
the fake driver never answer and requires the request back inside the bound. A timeout that lived
in the HTTP driver alone would not bound a driver that has no HTTP in it, so the bound is a
`Promise.race` in the sourcing service around every port call, and the `nager` driver *also*
carries an `AbortSignal` so the socket is released rather than merely ignored — the
`fetchTransport` shape at `signature/signwell/signwell-http-client.ts:613`.

**The provider names itself `nager` under both drivers.** TC-02-INT-01 runs against the fake and
expects `externalKey` of `nager:DE:{date}`. The `fake` driver is a double *of Nager.Date* — the
contracts file's whole "What the double must reproduce" table is Nager's behaviour — so the name
it reports is the provider it doubles, not the driver that answered. `HOLIDAY_PROVIDER` selects
the driver; the provider identity is one value. Noted as N2 because the Data Model's prose for
`HolidayImport.provider` reads "the driver that answered".

**An imported `Holiday` carries the syncing account as `createdByAccountId`.** The column is
`NOT NULL` behind an FK to `Account` and REQ-02-004 does not name it. The only account in the
transaction is the caller who holds `manage-holidays`, and there is no system account in this
schema.

**Rounding is per holiday, then summed.** `reports.service.ts:855` sums group totals that are
themselves sums of `Number(row.amount)`, where `buildHolidayRow` already applied `toMoney`. The
summary values each holiday the same way and sums the rounded values, because TC-02-INT-09 is an
equality to the cent against exactly that arithmetic.

**Currency in force is resolved by the same selection as the rate.** `resolveRateAtDate` picks
the newest snapshot with `effectiveFrom <= date`, else the live row. REQ-02-015 needs the
currency chosen by that same rule, and two copies of a selection rule drift, so the selection is
extracted into one pure helper in `packages/validation/src/reports.ts` and both functions call
it — additive, no existing export changes shape.

**New authorization uses `can(normalizeRole(role), …)`.** The shipped holiday gates cast instead;
they are not this spec's to change, and normalizing them would alter behaviour for role values
outside the union, which no requirement here asks for.

**The fake driver's country table is deterministic.** Integration overrides the port
(`overrideProvider`, the `StubCalendarProvider` pattern), but an E2E run reaches the driver only
through the running API, and TC-02-E2E-01 and TC-02-E2E-03 need a country that answers and a
country that refuses without any seeding call. So the `fake` driver ships a fixed table —
Poland's 14 all-nationwide shape, Germany's 20 of which 10 are regional, a covered-but-empty
country, and `IN`/`AE` refusing, which is also what the real provider does (Observations table).
The seeding hooks the integration cases use sit on top of that table.

## H-07, the shipping surfaces

The new reachable thing is a `Holiday` row nobody typed, plus three columns on `Holiday` and two
new tables. The tables have no shipping reader. The columns are not projected by anything shipped
— `toSummary` names its fields explicitly, and both other readers (`reports.service#fetchHolidays`,
`time-off-calendar.service`) select what they need. What *is* reachable is the row itself, and
every path is listed in `shippingSurfaces`:

- both scopes of `GET .../holidays` (the block is withheld from `scope=mine`, REQ-02-025);
- `PATCH`/`DELETE .../holidays/{id}` on an imported row — Edge cases 8, 9 and 10 govern all three
  outcomes, and none of them needs code: the edit writes only submitted fields, so `source`
  survives, and the delete is what REQ-02-007 then makes permanent;
- Amounts Owed, the Time Off report, the Time & Activity report and the vacation calendar, which
  pay and draw the imported rows as ordinary holidays — the README's Cross-Spec row "Holidays
  imported for a year" is the rule, and it names this as the intended effect;
- the Time Tracking calendar's markers and the vacation request modal's hint, both `scope=mine`.

Nothing here is a silent path: every one of them has a rule, in this bundle or in the area README
this bundle points at for blast radius.

## Notes (none blocking)

**N1 — the static gate will raise one false blocker on this bundle.** `scripts/static-gate.mjs`
takes the `Message` column of every Error Messages row and requires the text to exist somewhere
in `packages/validation`. The last row's Message cell is `(shipped, unchanged)` — a note about
`HOLIDAY_MESSAGES.toastServerError` rather than a message. I simulated the gate's own parser: it
extracts `(shipped, unchanged)` as a 20-character probe and will report
`spec/message-not-implemented`. There is nothing to implement; the export named in the row's first
cell ships at `packages/validation/src/holiday-messages.ts` and its text is present. The
implementer must **contest** that one finding rather than invent a string to satisfy a grep —
`node scripts/wf.mjs contest --finding <key> --reason …`. This is in `risks` too.

**N2 — `HolidayImport.provider` under the fake driver.** See above. Planned as `nager`, because
that is what TC-02-INT-01 pins and it is the only value that satisfies a case; the Data Model's
"the driver that answered" is then loose prose rather than a rule anything observes.

**N3 — the `paidHours` in the contracts file's `GET .../holidays` example is a string.** The route
ships it as a JSON number (`toSummary`: `row.paidHours.toNumber()`), and the web reads it as one
(`settings/holidays/types.ts`, `time-tracking/types.ts:61`). The same example omits `createdAt`
and `updatedAt`, which certainly still ship, so the example is abbreviated rather than normative —
and the prose above it says the route keeps what it ships with and gains exactly two things. The
plan keeps `paidHours` a number and adds only `source`. Changing it would silently reformat the
Time Tracking calendar and both holiday hints.

**N4 — a permanently uncovered country is re-asked on every page load.** REQ-02-009 writes no
record on failure and REQ-02-012 syncs whenever a country reads `unsourced`, so an organization
with an Indian member pays one bounded provider call per Holidays page load, forever. Invariant 5
says calls "fall to zero once all are recorded", which is true of every country that *can* be
recorded. The Known Gaps table names the coverage hole, the call is bounded, and the count is
bounded by the country set, so nothing here is unplannable — it is worth stating because it is
the one part of the design that does not converge.

**N5 — TC-02-E2E-01 asserts a transient element.** `holiday-sourcing-status` "appears, then goes"
against a driver that answers from memory. The screen must keep the status mounted for the whole
of the sync *and* the re-read that follows it, which is what the UI Description already says (the
summary shows its preloader until the re-read lands); implemented any other way the case is a
race. Recorded in `risks`.

## Checklist

Every id in `compiled` is answered in the verdict. `node scripts/handoff-coverage.mjs` comes back
clean: the coverage script reads `run.spec` alone, where the requirements are `#### REQ-02-0NN`
headings rather than a numbered list and the cases live in the bundle's third file, so its
requirement and case checks find nothing to demand — the section map is the one it does check,
and all eight `##` headings of the behaviour file are accounted for. H-01 and H-02 are therefore
answered by hand, against the spec's own ids: 25 requirements, all assigned; 22 live cases, all
claimed.
