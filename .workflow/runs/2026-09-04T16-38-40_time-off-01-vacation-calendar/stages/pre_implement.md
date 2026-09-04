# pre_implement — time-off/01 Vacation Calendar

The spec compiles. Ten tasks, one additive migration, no blocking finding. Three notes, each
carrying a witness, are recorded at the bottom and planned around rather than halted on.

## What I read, and in what order

`run.json` → the spec bundle (`01-vacation-calendar.md`, `.contracts.md`, `.cases.md`, the mock
HTML) → `specs/time-off/README.md` (Shared Rules, Cross-Spec Side Effects, Blast Radius, Backward
Compatibility) → `CLAUDE.md` → **then the code**: `packages/validation/src/{roles,index,holidays,
holiday-messages,reports,autofill}.ts`, `apps/api/src/{holidays,members,reports,organizations,
invitations,projects}`, `apps/api/prisma/schema.prisma`, `apps/web/src/layout/Sidebar.tsx`, the
holidays settings page, the member detail screen, `packages/ds/src/components/{core/ToggleButton,
reports/ReportControls}.tsx`, `apps/web/src/reports/ReportFilters.tsx`,
`apps/web/app/org/[orgId]/time-tracking/date-utils.ts`, `apps/web/app/globals.css`,
`scripts/static-gate.mjs`, `scripts/handoff-coverage.mjs`, `infra/deploy.sh`, and the four shipped
suites that pin the rule this spec supersedes.

The dependencies (`user-management/09`, `user-management/11`, `organization/03`) were read through
this area's README — its Shared Rules table restates each rule this spec consumes, and the code
confirmed each one (see `premises` in the handoff).

## The shape of the change

Four things, in this order:

1. **Two nullable columns** — `Membership.countryCode`, `Organization.countryCode`. One migration,
   strictly additive, no backfill. Both land `null`, so the migration alone changes nothing.
2. **One country chain** — `resolveMemberHolidayCountry(membership, organization)`, adopted by the
   four shipping call sites that read `Account.phoneCountryCode` today. This is the part that moves
   money on Amounts Owed, in both directions.
3. **One new read endpoint and one new screen** — the calendar, plus a new sidebar row and a new
   capability in both unions.
4. **Two pickers on shipped screens** — the organization's country on Settings › Holidays (with a
   `GET`/`PUT` pair of its own), the member's on their About tab (riding the member update that
   already ships).

## What already exists to build on

Nothing here is a new mechanism. Every piece has a shipped precedent, named in `reuse`:

- the 404-in-the-service capability gate (`HolidaysService.requireViewCapability`), which is what
  the calendar and both halves of the organization country need, because `CapabilityGuard` answers
  403 and this spec's refusals must be byte-identical to a wrong-organization read;
- the `{ error: 'validation_error', fields: { … } }` 422 body (`ReportsService.parseQuery`);
- calendar-day comparison against UTC-midnight `@db.Date` bounds (`HolidaysService.listHolidays`),
  which is REQ-01-017's mechanism — deliberately *not* `validateReportRange`'s timezone-shifted
  `startUtc`, which is what TC-01-INT-10 is built to catch;
- `ToggleButton` (segmented control, roving tabindex, per-segment `data-testid`) and
  `ReportControls` (the `<fieldset>` + clipped legend) from `@devscribed/ds`, and `MultiFilter`
  from `apps/web/src/reports/ReportFilters.tsx` for the two pickers;
- `apps/web/app/org/[orgId]/time-tracking/date-utils.ts` for week/month arithmetic — but the
  preset computation itself goes into `packages/validation`, because TC-01-UNIT-02 is a unit case
  and `npm run test:unit` runs `packages/validation` and nothing else;
- `apps/web/app/globals.css` for what inline styles cannot express — the sticky first column, the
  horizontal scroll below the desktop breakpoint, and the DS-gap token block.

## What must be built from zero

The calendar service (scope resolution, clipping, holiday resolution per member,
`appliesToAllInView`), the calendar screen and its grid, the organization-country route pair, the
`TIME_OFF_CALENDAR_MESSAGES` module, `resolveMemberHolidayCountry`, and the three e2e helpers the
Verification Plan says this spec owes.

## H-07 — what this change makes reachable, and who was already there

The two new columns and the new capability are the only new reachable values; `kind: "vacation"` is
a constant on a response nothing else reads. The rows that matter are the ones that were already
being written and read:

- **`Membership` rows** are written today by `MembersService.remove`, `MembersService.restore`,
  `InvitationsService.accept` (both the create and the same-organization restore branch),
  `SignupService` and the test fixture controller. None of them touches `countryCode`, and
  REQ-01-048 is exactly the rule that says the two restore paths must keep leaving it alone — so
  the requirement is satisfied by the shipped code and asserted by TC-01-INT-28 rather than
  implemented. That is recorded, because "no code needed" is a claim a reviewer must be able to
  check.
- **`Membership` rows are read** by `MembersService.list` (explicit projection, unchanged — the
  spec adds the field to the detail read only) and by `MembersService.getDetail` (gains it).
- **`Organization` rows** are written by `SigningSettingsService.update` and read wholesale in
  three places that use only `.name`; nothing serializes the row, so the new column leaks into no
  response.
- **The resolved country** — the value this spec re-sources — is read by four shipping paths, all
  listed in `allCallSites` on T6 with what each does with the new answer. Two of them are money:
  the Amounts Owed roster and the Time Off `organization_wide` group. Two are markers: the Time
  Tracking calendar and the vacation-request holiday hint, both of which read
  `GET /holidays?scope=mine` from the web and change without their own specs changing.

Every one of those is governed by REQ-01-026 and by the contracts' call-site table, which names
the four sites and says "No call site keeps a phone-country read." Nothing was left undecided, so
there is no `spec/incomplete-decision` here.

## The three notes

**N1 — four shipped suites pin the rule this spec drops.** The README's Backward Compatibility 3
says the reports and holidays E2E suites are "which this area does not touch and which must stay
green". `e2e/tests/holidays.spec.ts:296-338` (TC-03-E2E-04) seeds a `BY` holiday, sets the
member's `phoneCountryCode` to `BY` through `setOwnCountryViaApi`, and asserts the weekly
calendar's marker is visible. Under REQ-01-026 that member resolves to `null` and the marker is
gone, so the suite cannot stay green untouched. Three integration cases are in the same position:
`apps/api/test/holidays.spec.ts:398` (TC-03-INT-14), `apps/api/test/reports-amounts-owed.spec.ts:
575-660` (its TC-01-INT-12 and TC-01-INT-13), and `apps/api/test/reports-time-off.spec.ts:409-430`
(the viewer's own-country case). This is a stale claim about the repository, not an undecided
rule: what the product must do is stated completely, and the repair is mechanical — restate each
fixture's country on the membership instead of the phone and leave every assertion standing. It is
T10, and it is a task of its own so the reviewer sees the edits as planned rather than as a suite
being bent to fit. Blocking on it would halt a run over a sentence in an index while every rule
the implementer needs is in place.

**N2 — `"XX"` on the write.** REQ-01-036 refuses anything that is "neither empty nor a valid
alpha-2 value", and Edge case 10 defines `"XX"` as a value that does *not* normalize to a valid
alpha-2 value; Validation Rule 9 states the constraint as "Empty, or exactly 2 uppercase letters"
and the section under it says the rule "refuses `pl` rather than upcasing it, which is what the
holiday rows' country validator already does" — that validator is
`validateHolidayCountryCode` (`packages/validation/src/holidays.ts:93`), whose test is
`/^[A-Z]{2}$/` and which therefore accepts `XX`. So `PUT .../settings/country` with `"XX"` is a
`200` under the Validation Rules table and a `422` under REQ-01-036 read through Edge case 10. No
case exercises it, the product consequence is nil (REQ-01-027 skips a stored `XX` on the read, and
Edge case 10 says a value of that shape reaches the column by migration or direct write), and the
Validation Rules table is the normative statement of what each write refuses. Planned as
`validateHolidayCountryCode` on both writes, which is also what makes the stored value the one the
holiday rows' uniqueness index compares.

**N3 — TC-01-INT-27's "identical body".** The case says a `user` and a `viewer` reading a member
detail "receive the identical body, field included". The shipped projection
(`MembersService.getDetail`, `apps/api/src/members/members.service.ts:352-374`) carries
`callerRole`, `canEditRole` and `availableRoles`, which are properties of the caller — a literal
deep-equality assertion between the two bodies fails on `callerRole` alone. The sentence's own
continuation says what it is about ("the read is gated by no capability and the field is not
conditional on one"), so the case is planned as: `countryCode` present and equal for both callers,
alongside the target-derived fields. No product code differs between the two readings.

## Decisions the plan makes where the spec left an implementation choice

Each of these is a choice between implementations that all satisfy the spec; they are written into
the handoff so the implementer, the reviewer and QA read the same one.

1. **422 body shape** — `{ error: 'validation_error', fields: { <field>: <message> } }`, the shape
   `ReportsService.parseQuery` already emits, with `startDate`/`endDate` for `rangeRequired`,
   `range` for `rangeInverted` and `rangeTooWide`, `scope` for `scopeInvalid` and `tooManyMembers`,
   `projectIds` for `teamsRequired`, `memberIds` for `peopleRequired`. The banner draws the first
   field's message.
2. **400 body on the member write** — `{ errors: { countryCode: … } }`, the shape the same route
   already uses for `jobTitle`, so the screen can put it under `field-error-countryCode`.
3. **An absent `countryCode` key on the member `PUT` leaves the column alone**; an explicit `null`
   or `""` clears it. That is the `'countryCode' in body` idiom `HolidaysService.parseInput` uses,
   and it is what Backward Compatibility 3's "a caller that ignores the new field is a caller
   nothing changed for" requires.
4. **The screen opens on `scope=all` and the `Month` window over the caller's current month** —
   the mock's own state (`calendar-scope-all` and `calendar-window-month` carry `on`) and what
   TC-01-E2E-05's "open the calendar over a month" assumes. The range is in-page state, not the
   URL, as the reports' scope toggle already is.
5. **E2E reaches September 2026** by stepping `calendar-prev`/`calendar-next` from the default
   month, computed from the run's own date — zero clicks today. The cases name literal 2026-09
   dates and the suite runs on whatever day it runs.
6. **The band's accessible name** is built by a helper in the new validation module, in the mock's
   own order (`Vacation · approved · 2026-09-14 – 2026-09-18 · 5 working days`), so the string the
   E2E asserts is not written inline on a screen.
7. **The member picker is drawn on `detail.canEditJobTitle`** — the shipped flag that already means
   "active target, caller holds `edit-detail`" — rather than a second server flag the contracts do
   not add.

## The migration

One migration, `20260904120000_time_off_01_vacation_calendar`, two `ALTER TABLE … ADD COLUMN
"countryCode" CHAR(2)` statements, nullable, no default, no backfill, no index. The deploy order
was read from the file rather than restated: `infra/deploy.sh:175-185` runs `infra/migrate.sh` as a
one-off task on the **new** image, guarded on `api` being among the services deployed, and only
then `tf apply`s the services at `:187-192` — schema first, then the code. The header at `:27`
explains why that direction and not the other. Both columns being nullable is what makes the
reverse safe as well, so a code rollback needs no database rollback.

## Coverage

50 numbered requirements, all assigned. 41 live cases (4 unit, 29 integration, 8 E2E), all
claimed. All 8 `##` sections of the behaviour file accounted for.
`node scripts/handoff-coverage.mjs` comes back clean.
