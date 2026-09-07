# implement — attempt 4

Spec: `specs/time-off/01-vacation-calendar.md` (+ contracts, cases) — re-read at `30b415e`,
"give the organization picker the option that clears it".
Branch: `spec/time-off-vacation-calendar` · base `0d986a1`
Commits this attempt: `783471a` (F1, F2), `c60cbb1` (F3).

## The three blockers

### F1 — the organization PUT cleared on an absent key

**Fixed.** REQ-01-034's Decided (spec:359) and the PUT's contract (contracts:133-134) both settled
this run: *a body with no `countryCode` key changes nothing and answers the stored value*, the
same rule the member write beside it follows. The service read `(input ?? {}).countryCode`, which
made `undefined` normalize to `null` and wrote it — so `{}` or a mistyped `{"country":"PL"}`
dropped the country every member without one of their own depends on.

- `organization-country.service.ts` — presence decides now: `'countryCode' in body`. An absent key
  reads the row and returns it unchanged; no write happens at all. The comment that argued the
  reversed reading ("clears the column … and deliberately") is gone, replaced by the settled one.
- **TC-01-INT-20** gained the third step the amended case names: store `PL`, submit
  `{ country: 'BY' }` — the shape a mistyped key produces — and assert `200`, the body still
  `PL`, the `GET` still `PL`, and the column still `PL`. Nothing covered this before; the existing
  `{ countryCode: '' }` step stays 200/null under either reading and so could not fail.

### F2 — two exports the contracts name existed nowhere

**Fixed.** §Shared code names `timeOffCalendarToday(timezone, instant)` and
`resolveTimeOffCalendarTimezone(timezone)` as exports of `packages/validation` (contracts:212-213),
and attempt 3 deleted both — I took T7(a)'s round-2 wording as the whole rule and missed that T2's
round-3 replan had reconciled it. The zone fallback came back as `reportedTimezone`, a private
method of the API service: the screen cannot reach it and the validation suite does not run there.

- Both are exports again, beside `TIME_OFF_CALENDAR_MESSAGES`. `timeOffCalendarToday` **formats
  through** the shipped `todayInTimeZone` rather than beside it, so the en-CA formatting is stated
  once; `resolveTimeOffCalendarTimezone` answers *which zone* by constructing a formatter — which
  throws on a zone the runtime cannot read and produces no date, so it restates no formatting.
- The endpoint reads both (`range.today` and `range.timezone`); `reportedTimezone` is deleted. The
  screen reads `timeOffCalendarToday`.
- The unit block is back, including the limb the deletion silently dropped: an **unrecognized**
  zone (`Mars/Olympus`), which is edge case 18's third case and was asserted nowhere —
  `requests.test.ts` covers `null` and `''` only.

### F3 — the organization country could not be cleared

**Fixed, and the document settled it** at `30b415e`: the picker's first option is labelled from
`TIME_OFF_CALENDAR_MESSAGES.orgCountryNoneOption` ("No country — global holidays only"), submits
`null`, and is what REQ-01-034 clears through — "without it the rule would have no control behind
it". I had left the picker optionless and written the gap into the code as its own justification;
the finding was right that neither I nor the review could choose that label, and a person did.

- The message is added to the export the Error Messages table names (contracts:178).
- `settings/holidays/page.tsx` — `ORG_COUNTRY_OPTIONS` is that option followed by
  `STATED_COUNTRY_OPTIONS`. It is also what a stored `null` renders as, so the control no longer
  paints a bare placeholder for an organization that has stated nothing.
- **TC-01-E2E-07** gained the step the amended case names: save Poland, see the per-cell marker,
  return, choose the first option, save again — and the marker goes with it. That is the half no
  integration case can observe, which is why the case carries it.

## Commands run

| Command | Result |
|---|---|
| `npm run test:unit` | 35 files, **1430 passed** |
| `apps/api` · `npm test -- test/time-off-calendar.spec.ts` | **30 passed** |
| `apps/api` · `npm test -- test/holidays.spec.ts test/reports-amounts-owed.spec.ts test/reports-time-off.spec.ts test/member-detail.spec.ts` | **79 passed**, 4 pre-existing `.skip` |
| `apps/api` / `apps/web` · `npx tsc --noEmit` | clean |
| `e2e` · `… tests/time-off-calendar.spec.ts` | **8 passed** |
| `e2e` · `… tests/holidays.spec.ts tests/regressions.spec.ts` | **15 passed** |
| `node scripts/static-gate.mjs --base 0d986a1` | **pass** |

The static gate is what caught that F3 had already been settled: it blocked on
`TIME_OFF_CALENDAR_MESSAGES.orgCountryNoneOption`, a row of the Error Messages table that no
export held — the row the person had just added. I had been about to raise F3 as a `spec` finding
and halt the run; the gate's witness sent me back to the document instead, where the answer was.

## Still open, and why

**N9 from review 1** — the Teams and People pickers inherit `MultiFilter`'s `All` placeholder, so
they read "All" in exactly the state REQ-01-009 refuses. `MultiFilter` lives in
`apps/web/src/reports/ReportFilters.tsx`, outside this handoff's file set and shared by three
shipped report screens. Unchanged again this pass, and recorded rather than taken.
