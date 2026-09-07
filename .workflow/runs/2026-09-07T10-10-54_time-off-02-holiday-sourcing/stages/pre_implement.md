# pre_implement — time-off/02, holiday sourcing and what it costs

Run `2026-09-07T10-10-54_time-off-02-holiday-sourcing` · shape `strict` · spec
`specs/time-off/02-holiday-sourcing.md` (bundle: `.contracts.md`, `.cases.md`) · base
`8a7b295`.

**Verdict: blocked on one spec finding (P1).** The plan is complete and written out in
`handoff.json` — nine tasks, all 24 requirements and all 20 live cases assigned — so the run can
resume on the same plan the moment the document decides the one question it contradicts itself
about. Six further observations are notes; each is planned as written, with the choice recorded
in `risks` so no later stage has to guess what was decided here.

## What I read, and in what order

The code before the plan. `apps/api/src/holidays/*` (the shipped list, create, edit and delete,
and their 404-not-403 gates), `apps/api/src/organizations/organization-country.service.ts` (the
neighbouring settings resource, and the closest thing to the two new settings routes),
`apps/api/src/reports/reports.service.ts:690-1000` and `packages/validation/src/reports.ts` (the
Amounts Owed arithmetic this spec must equal to the cent),
`apps/api/src/time-off/time-off-calendar.service.ts` and the Time Tracking page (the other two
readers of `Holiday`), `apps/api/prisma/schema.prisma` (`Holiday`, `Organization`,
`MemberFinancials`, `MemberFinancialsSnapshot`), the four provider ports already in the tree
(`Storage`, `CalendarProvider`, `MailService`, the SignWell HTTP client) for the port shape and
the bounded call, `packages/validation/src/index.ts` for the capability matrix,
`packages/ds/src/index.ts` for the seven components the screen needs, `e2e/tests/helpers.ts` and
`e2e/playwright.config.ts` for the E2E preconditions, and `infra/deploy.sh` for the migration
order. Then the area README's Shared Rules, Cross-Spec Side Effects and Blast Radius, then
`CLAUDE.md`.

Spec 01 of this area has shipped — `Membership.countryCode` and `Organization.countryCode` both
exist, `resolveMemberHolidayCountry` is the one chain, and the member-country and
organization-country writes are live. Every precondition this bundle's cases need therefore
exists except three, and the cases file already names all three: the fake driver, a summary
method that can be driven without a session, and a role separating `view-holidays` from
`view-amounts-owed` (which is a Known Gap, not a task).

## The blocking finding

**P1 — what an import record's count means after a refresh, and therefore whether a fully
sourced country is reported as covered-but-empty.**

Three statements, and no implementation satisfies all of them:

- REQ-02-021: the record names "how many holidays **it wrote**".
- REQ-02-023: "WHILE an import record carrying a count of zero exists for a country and year,
  THE SYSTEM SHALL report that country as covered-but-empty."
- State Machine, `sourced` + `refresh`: "new dates are written, existing ones skipped; the
  record's moment and count are updated. Stays `sourced`."

Edge case 10 is the spec's own scenario where they collide: an admin edits an imported holiday's
`paidHours`, then clicks Refresh. Every entry is skipped, so the refresh writes zero rows. Under
REQ-02-021 the record's count becomes 0; under REQ-02-023 the country is then reported
covered-but-empty; under the state machine it stays `sourced`. The screen makes the divergence
visible: `holiday-sourcing-uncovered` is specified as present when a country is `unsourced` **or
`empty`**, carrying `countryNotCovered` — "The holiday service does not cover this country. Add
its holidays by hand." — so one reading paints that sentence over a country holding thirteen
sourced holidays, and the other does not. It is not an exotic path: a refresh that finds nothing
new is the ordinary outcome of the control this spec adds, and TC-02-E2E-02 ends by clicking it.

I have not resolved it. Both repairs are one sentence — either the count is what is stored for
that country and year after the import, or the state is `empty` only when no holiday is stored —
and which one is right is a product decision about what the number on the record means. Task T4
carries an explicit instruction not to settle it while writing the import.

Everything else in the plan is independent of the answer: the writer, the counting of
`written`/`skipped`/`discarded`, the records, the summary and the whole screen are unaffected.
Only the derivation of `state` from a record moves.

## The notes, and what the plan does about each

Each is planned as written; none is a blocker, because in every case the spec is plannable and
the repair is a sentence somebody may or may not want.

**P2 — do global holidays count toward a country's day count?** REQ-02-013 says "the number of
holidays stored for it" and never says whether a `countryCode: null` row counts. Planned as
*applicable to the country* (null or equal), the one applicability rule this area already has
(`isHolidayApplicableToMember`), because it is the only reading under which the country row and
the member rows on the same screen agree. TC-02-INT-08 seeds no global holiday, so both readings
pass it.

**P3 — `totals.holidayCount`.** The contracts sample totals 24, which is the country sum;
TC-02-INT-08 says the total is the sum over members, and the §Screens mock shows 37 across three
members. The sample is inconsistent with its own `countries` array, so it reads as illustrative
of shape. Planned as the sum over members.

**P4 — `source` on the list rows.** The contracts prose says the `holidays` array is unchanged in
shape and the response "gains one field, `sourcing`", while the same file's sample row carries
`source` and the testid roster requires `holidays-row-{id}-source` per row. No other route can
tell the screen where a row came from. Planned as: the array gains `source` and loses nothing —
`paidHours` stays a JSON number and `createdAt`/`updatedAt` stay, because the shipped screen and
the Time Tracking calendar read them.

**P5 — `scope=mine` and the `sourcing` block.** That read needs no capability at all; it is what
the Time Tracking calendar and the vacation hint call, for a `user` and a `viewer` too. Handing
it the organization's country set and import state would put a fact behind no capability on a
screen this spec was told to gate per question. Planned as: `sourcing` is present only on a read
that passed the `view-holidays` gate. The page always reads `scope=all`, so no case changes.

**P6 — a global manual holiday and an imported national one on the same date.** REQ-02-006 keys
the skip on date **and** country, and the unique index treats a null `countryCode` as distinct, so
both rows can stand and Amounts Owed pays both. The rule is unambiguous, so the plan implements
it as written; the consequence is recorded for a human, and T4 is told not to invent a wider skip
rule, which would contradict what the decision table says about a manual row.

**P7 — currency when a member's currency changed mid-year.** Rates are resolved per date from the
snapshot history, but a row carries one `currency`. Planned as the live `MemberFinancials.currency`
— which is also what makes REQ-02-018's "no financial settings" the same test in both places.

## The two things the plan is most likely to be got wrong on

**The money must be reused, not reproduced.** REQ-02-015 says the rate resolution is the Amounts
Owed report's, and TC-02-INT-09 demands equality to the cent. The report rounds *each holiday row*
to the cent — `buildHolidayRow` returns `toMoney` strings, which `reports.service.ts:812`
re-parses with `Number` — and sums afterwards. An implementation that sums unrounded products and
rounds once diverges on any fixture with an odd rate. T5 therefore calls `resolveRateAtDate` and
`buildHolidayRow` from `packages/validation` and sums `Number(row.amount)`.

**REQ-02-017 is unobservable through a session, and that shapes the code.** No shipped role holds
`view-holidays` without `view-amounts-owed` (verified in the capability matrix), which the Known
Gaps table records. TC-02-INT-11 therefore drives the service directly, so the summary must be
split: a route method that resolves the two capabilities, and a method taking the organization,
the year and an explicit `canViewAmounts`. Without that split the case cannot be written at all,
and the rule ships untested.

## The provider port

The area's first outbound HTTP dependency. Modelled on what is already here: an abstract class as
its own DI token (`Storage`, `CalendarProvider` at `app.module.ts:132-159`), the driver chosen in
a factory at module construction and logged at boot, an unknown name throwing at boot rather than
defaulting (`calendar.config.ts:44-52`), the local driver whenever `NODE_ENV` is not production
(`mail.provider.ts:19-28`), and the call bounded with an `AbortController` and a cleared timer
because Node's global `fetch` has no timeout of its own
(`signwell-http-client.ts:608-620`).

The port's contract carries one distinction the rest of the spec rests on and which the plan
states in the docstring: the method **throws** on a refusal, a non-conforming answer, an
unparseable body or a timeout, and **resolves with `[]`** for a covered country with no holidays.
That is the whole of REQ-02-009 against REQ-02-010, and a driver that collapses the two makes the
service re-ask a third party the same unanswerable question on every page load forever.

Entry filtering — nationwide, type `Public`, the date inside the requested year, the country
equal to the one requested, the English name passing `validateHolidayName` — lives in the driver,
which is where the contracts file's Boundary values table puts every conversion. The driver
returns both the survivors and how many it refused, because `discarded` (REQ-02-022) is otherwise
uncountable.

## Concurrency

No lock is added anywhere, and that is deliberate rather than an omission. Every existing writer
of `Holiday` takes none and relies on `@@unique([organizationId, date, countryCode])` plus the
hand-written partial index for global rows, mapping P2002 to a domain outcome. The importer does
the same, mapping P2002 to `skipped` — which is exactly what Edge case 12 says two simultaneous
syncs produce. `HolidayImport` is serialized by its own unique index, so the loser of a race
becomes an update and one record survives (invariant 3). The sourcing setting is one column
written whole with no read-modify-write, the reasoning its neighbour already states.

## Coverage

`node scripts/handoff-coverage.mjs` passes. It checks sections here and little else: this spec
numbers its requirements as `#### REQ-02-0NN` headings rather than as an ordered list, and its
cases live in the bundle's `.cases.md`, so the script's requirement and case regexes find nothing
to count. I checked both by hand instead — all 24 requirement headings are assigned to a task,
all 20 cases are claimed and none is retired, and every `##` section has an entry. The section
entries say which task carries them or why nothing is planned.

## Paths

Every path cited in `reuse`, `premises`, `allCallSites` and `shippingSurfaces` exists today and
was opened. Paths that do not exist yet appear only in a task's `files` and in `buildFromZero`,
and a new call site inside an existing plan entry is marked `(new in T4)` so a reader is never
told an invented file is already there.
