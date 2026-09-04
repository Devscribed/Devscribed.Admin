---
id: "01"
title: Vacation Calendar
routes: ["/org/{orgId}/time-off/calendar", "/org/{orgId}/settings/holidays"]
api:
  - "GET /api/organizations/{orgId}/time-off/calendar"
  - "PUT /api/organizations/{orgId}/settings/country"
entities: [Organization]
tags: [vacation-calendar, wallchart, timeline, time-off, absence, holiday, country-resolution, scope, teams, projects, members, week, month]
depends-on:
  - "user-management/09"   # Vacation Requests — the absence rows this draws
  - "user-management/11"   # Projects — the ProjectMember set the Teams scope reads
  - "organization/03"      # Holidays — the calendar this shades days from
bundle:
  - 01-vacation-calendar.contracts.md
  - 01-vacation-calendar.cases.md
---

# 01 — Vacation Calendar

## Summary

**The request:** a vacation calendar built on holidays and vacation requests, viewable across the
whole organization, across several teams, or across a handful of named people, drawn as a
horizontal timeline where each row is a member and each column is a day.

One screen at `/org/{orgId}/time-off/calendar` and one read endpoint behind it. Rows are members,
columns are consecutive calendar days, and a vacation request is a band spanning its dates —
solid where `approved`, hatched where `pending`. Public holidays shade the days they apply to and
weekends shade the days nobody works. The visual acceptance target is
[01-vacation-calendar.mock.html](01-vacation-calendar.mock.html), rendered to
[01-vacation-calendar.png](01-vacation-calendar.png) and
[01-vacation-calendar.people.png](01-vacation-calendar.people.png).

**Teams are projects.** There is no `Team` entity in this repository and this spec does not add
one; a team is a `Project` and its `ProjectMember` rows (spec `user-management/11`), which is
already the set of people who work together.

**One structural decision shapes the payload:** every absence band carries a `kind`, and today
that field is the constant `"vacation"`. A later spec introduces the time-off policy catalogue —
absence types with their own colours — and it does so by giving `kind` more values, not by
reshaping this response or this grid.

Beyond the request, this spec adds:

- **`Organization.countryCode`, and a picker for it on the existing Holidays settings page.** The
  request asks that holidays be resolved automatically from the member's country *or the
  company's*; the company has no country today, so the second half of that rule has nothing to
  read. Nullable and additive; no new route of its own beyond the one that writes it.
- **One shared country-resolution helper, adopted by every call site that already resolves a
  member's country.** Holidays `scope=mine` and the Amounts Owed and Time Off reports each
  resolve it from `Account.phoneCountryCode` alone today. Leaving them on the old rule while this
  screen used a new one would be two answers to one question, so the new chain replaces the old
  one everywhere. This changes what Amounts Owed pays out — see Blast Radius.
- **The `ViewTimeOffCalendar` capability**, so the screen has a gate that can be narrowed later
  without touching it.

Blast radius and backward compatibility for this spec are in [README.md](README.md).

## Actors & Preconditions

- **Actors:** `admin`, `manager` and `user` open the calendar and see every member it is scoped
  to. `viewer` has no access to it and is shown no navigation row. `admin` alone sets the
  organization's country.
- **Preconditions:** the caller is an `active` member of the organization. Nothing else is
  required — an organization with no holidays, no projects and no vacation requests renders an
  empty grid rather than an error, because "nobody is away" is an answer this screen exists to
  give.

## Roles & Permission Matrix

Capability checks run against `normalizeRole()` (`packages/validation/src/roles.ts`), so they work
on today's `admin` / `member` column and survive the role-enum migration untouched.

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| `ViewTimeOffCalendar` — open the calendar, any scope | ✅ | ✅ | ✅ | ❌ |
| `ViewHolidays` — read the organization country | ✅ | ✅ | ❌ | ❌ |
| `ManageOrganizationCountry` — set the organization country | ✅ | ❌ | ❌ | ❌ |

`viewer` is refused because reports/01 already settles what a viewer may see of time off: their
own, and nothing else.

## Functional Requirements

### The screen and its gate

#### REQ-01-001 — the calendar route

WHERE the caller holds `ViewTimeOffCalendar`, THE SYSTEM SHALL render the calendar at
`/org/{orgId}/time-off/calendar`.

#### REQ-01-002 — the refusal is a 404

IF a caller without `ViewTimeOffCalendar` requests the calendar, THEN THE SYSTEM SHALL answer
`404` and draw nothing.

**Decided:** 404 rather than 403 — unknown and unauthorized are byte-identical here as everywhere.

#### REQ-01-003 — the navigation row

WHERE the caller holds `ViewTimeOffCalendar`, THE SYSTEM SHALL render a `Calendar` row in the
sidebar's `Time off` group, above `Holidays`.

#### REQ-01-004 — no dead navigation

IF the caller does not hold `ViewTimeOffCalendar`, THEN THE SYSTEM SHALL render no `Calendar` row.

### Which rows the grid draws

#### REQ-01-005 — the All scope

WHEN the calendar is requested with `scope=all`, THE SYSTEM SHALL return one row for every
`active` membership of the caller's organization.

#### REQ-01-006 — the Teams scope

WHEN the calendar is requested with `scope=teams`, THE SYSTEM SHALL return one row for each
`active` membership holding a `ProjectMember` row on at least one of the named projects.

#### REQ-01-007 — the unassigned bucket

WHERE `scope=teams` and `projectIds` contains the sentinel `none`, THE SYSTEM SHALL also return
one row for every `active` membership holding no `ProjectMember` row on any non-archived project.

#### REQ-01-008 — the People scope

WHEN the calendar is requested with `scope=people`, THE SYSTEM SHALL return one row for each named
membership that is `active` in the caller's organization.

#### REQ-01-009 — an empty selection is a refusal, not an empty grid

IF `scope` is `teams` or `people` and its selection list is empty, THEN THE SYSTEM SHALL answer
`422` carrying the message for that scope.

**Decided:** an empty selection is ambiguous between "nothing ticked yet" and "everyone", and
answering it with an empty grid teaches the reader that their team has nobody in it.

#### REQ-01-010 — a member unknown to the organization is ignored

WHEN a `projectId` or `memberId` names a row outside the caller's organization, THE SYSTEM SHALL
omit it from the result without an error.

#### REQ-01-011 — removed members are not drawn

THE SYSTEM SHALL exclude memberships whose status is `removed` from every scope.

#### REQ-01-012 — row order

THE SYSTEM SHALL order rows by display name, case-insensitively ascending.

#### REQ-01-013 — the row cap

IF a scope resolves to more rows than the row cap the contracts declare, THEN THE SYSTEM SHALL
answer `422` carrying `TIME_OFF_CALENDAR_MESSAGES.tooManyMembers`.

**Decided:** a cap rather than pagination — a wallchart paginated by member is two half-charts,
and the scope controls already narrow it.

### Which days the grid draws

#### REQ-01-014 — the range is required

IF `startDate` or `endDate` is absent or is not an ISO calendar date, THEN THE SYSTEM SHALL answer
`422` carrying `TIME_OFF_CALENDAR_MESSAGES.rangeRequired`.

#### REQ-01-015 — the range runs forwards

IF `endDate` is earlier than `startDate`, THEN THE SYSTEM SHALL answer `422` carrying
`TIME_OFF_CALENDAR_MESSAGES.rangeInverted`.

#### REQ-01-016 — the range is bounded

IF the inclusive range exceeds 92 days, THEN THE SYSTEM SHALL answer `422` carrying
`TIME_OFF_CALENDAR_MESSAGES.rangeTooWide`.

**Decided:** 92 days is a quarter, which is the widest window a per-day column can be added for
later without changing this contract. It is deliberately far tighter than the 370 days reports
allow, because this response carries a cell per member per day.

#### REQ-01-017 — days are calendar days

THE SYSTEM SHALL compare `VacationRequest.startDate`, `VacationRequest.endDate` and `Holiday.date`
against the raw ISO range, never against a timezone-shifted UTC instant.

**Decided:** all three are Postgres `DATE`. A `DATE` compared against a `TIMESTAMPTZ` is silently
truncated, which drops the boundary day for any member east or west of UTC.

#### REQ-01-018 — today is the caller's today

THE SYSTEM SHALL resolve the day marked as today from the caller's `Account.timezone`.

#### REQ-01-019 — the window presets

WHERE the screen offers the `Week`, `2 weeks` and `Month` presets, THE SYSTEM SHALL compute each
preset's range from the caller's `Account.firstDayOfWeek`, except `Month`, which runs from the
first to the last day of the displayed calendar month.

### The absence bands

#### REQ-01-020 — which requests are drawn

THE SYSTEM SHALL return an absence band for every `VacationRequest` whose status is `approved` or
`pending` and whose date range intersects the window.

#### REQ-01-021 — which requests are never drawn

THE SYSTEM SHALL return no band for a `VacationRequest` whose status is `rejected` or `cancelled`.

**Decided:** a rejected request is not an absence, and drawing it would put days on the chart that
nobody is taking.

#### REQ-01-022 — bands are clipped, not dropped

WHEN an absence starts before the window or ends after it, THE SYSTEM SHALL return the band with
its true `startDate` and `endDate` and a flag on each edge that falls outside the window.

#### REQ-01-023 — a band is one continuous run

THE SYSTEM SHALL draw a band as one unbroken run across every day from its start to its end,
including weekends and holidays inside it.

**Decided:** breaking the band at a weekend would read as two absences, which is a different
fact from the one the row states.

#### REQ-01-024 — the band's day count is the frozen one

THE SYSTEM SHALL carry `VacationRequest.workingDays` on the band exactly as it was frozen at
submission.

#### REQ-01-025 — the kind field

THE SYSTEM SHALL emit `kind: "vacation"` on every band.

**Decided:** the one field this spec adds ahead of its need. The time-off policy catalogue is a
later spec, and it lands by giving this field more values — so the grid's colour map is keyed by
type from the first commit instead of being retrofitted onto a payload that has no type in it.

### Holidays, and the country they belong to

#### REQ-01-026 — the country chain

THE SYSTEM SHALL resolve a member's holiday country as the first of `MemberProfile.country`,
`Account.phoneCountryCode`, `Organization.countryCode` that normalizes to a valid ISO 3166-1
alpha-2 value.

**Decided:** the address country leads because public holidays are a fact about where somebody
lives and works, while a phone's country is a contact detail that a foreign SIM makes wrong. This
replaces the `Account.phoneCountryCode`-only rule everywhere it is used today — the holidays
`scope=mine` read and both reports — so that one question has one answer.

#### REQ-01-040 — a member with no country at all

IF none of the three candidates normalizes to a valid alpha-2 value, THEN THE SYSTEM SHALL
resolve the member's holiday country to `null`.

#### REQ-01-027 — an unusable candidate is skipped, not fatal

WHEN a candidate in the chain is present but does not normalize to a valid alpha-2 value, THE
SYSTEM SHALL skip it and continue to the next candidate.

#### REQ-01-028 — which holidays reach a member

THE SYSTEM SHALL treat a `Holiday` as applying to a member when its `countryCode` is `null` or
equals the member's resolved country, case-insensitively.

#### REQ-01-029 — a country-scoped holiday reaches nobody without a country

IF a `Holiday` carries a `countryCode` and a member resolves to `null`, THEN THE SYSTEM SHALL
treat that holiday as not applying to that member.

#### REQ-01-030 — the whole-column holiday

WHILE a holiday applies to every member in the current view, THE SYSTEM SHALL shade the whole day
column and name the holiday in its column header.

#### REQ-01-031 — the partial holiday

WHILE a holiday applies to some but not all members in the current view, THE SYSTEM SHALL mark
only the cells of the members it applies to.

#### REQ-01-032 — weekends

THE SYSTEM SHALL shade Saturday and Sunday columns as non-working days.

**Decided:** a fixed Monday–Friday week, which is the same week `calculateWorkingDays` counts in
spec `user-management/09`. A configurable working week would put this screen and the frozen
`workingDays` on that request into disagreement.

### The organization's country

#### REQ-01-033 — setting it

WHEN an `admin` submits an ISO 3166-1 alpha-2 country, THE SYSTEM SHALL store it on
`Organization.countryCode`.

#### REQ-01-034 — clearing it

WHEN an `admin` submits an empty country, THE SYSTEM SHALL store `null` on
`Organization.countryCode`.

#### REQ-01-035 — the write is admin-only

IF a caller holding `ViewHolidays` but not `ManageOrganizationCountry` submits a country, THEN THE
SYSTEM SHALL answer `403` carrying `HOLIDAY_MESSAGES.countryForbidden`.

**Decided:** 403 rather than 404, matching the holiday delete beside it — the caller can see the
page, so pretending it does not exist is the wrong refusal. It is admin-only for the same reason
delete is: moving the organization's country moves which holidays every member without a country
of their own receives, and that moves what Amounts Owed pays.

#### REQ-01-036 — an invalid country is refused

IF the submitted country is neither empty nor a valid alpha-2 value, THEN THE SYSTEM SHALL answer
`422` carrying `HOLIDAY_MESSAGES.countryCodeInvalid`.

### States

#### REQ-01-037 — no members

WHILE a scope resolves to no rows, THE SYSTEM SHALL draw the empty state in place of the grid.

#### REQ-01-038 — no absences

WHILE the rows have no absence in the window, THE SYSTEM SHALL draw the full grid with no bands.

**Decided:** an empty month is the answer, not the absence of one. A "no data" panel here hides
the fact the reader came for.

#### REQ-01-039 — cross-organization reads

IF the path `orgId` does not match the session's organization, THEN THE SYSTEM SHALL answer `404`.

## State Machine

The calendar writes nothing and holds no state of its own. What it draws is a projection of
`VacationRequest.status`, whose machine belongs to spec `user-management/09`:

`decision-table: keys=(status) domains=(status: pending|approved|rejected|cancelled)`

| status | Outcome |
|---|---|
| pending | A band is returned and drawn hatched, with a dashed border (REQ-01-020). |
| approved | A band is returned and drawn solid (REQ-01-020). |
| rejected | No band is returned (REQ-01-021). |
| cancelled | No band is returned (REQ-01-021). |

Invariants:

1. The calendar never writes a `VacationRequest`, a `VacationReserveTransaction` or a `Holiday`.
2. A band's `workingDays` is the frozen value; nothing on this screen recomputes vacation math.
3. Every day the grid shows is a calendar day in the range; the grid never shows a partial day.

## Out of Scope

- **Time-off policies and absence types.** Sick leave, unpaid leave and remote days are a later
  spec in this area, which lands by giving REQ-01-025's `kind` more values.
- **A remaining-balance column on the row header.** It would drag `MemberFinancials`, the reserve
  ledger and their money-grade permissions onto a screen that otherwise reads nothing financial.
  The balance stays where its rules already live, on the member's Vacation tab.
- **Requesting or approving from the calendar.** It is a read surface; the request form and the
  review controls stay on the Vacation tab and the Requests page.
- **A Quarter preset.** The endpoint's 92-day bound leaves room for it; the second cell renderer
  a 90-column grid needs is not built here.
- **Excluding holidays from `workingDays`.** Spec `organization/03` deferred it deliberately and
  this spec does not reopen it — a holiday inside a vacation range is still deducted.
- **Exporting the calendar** to PDF or iCal.

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| A holiday falling inside an approved vacation is still deducted as a working day, and the band says so | The frozen `workingDays` contract is what specs 07–09 and every issued report rest on; changing it retroactively would move money already reported | The amendment `organization/03` already names: resolve the holiday set at submit time and store which holidays the request counted |
| `Organization.countryCode` is `null` for every organization that predates this spec, so the third link of the chain does nothing until an admin sets it | The first two links behave exactly as they do today, so nothing regresses on the day the migration lands | An admin setting the country on the Holidays page; the field is drawn with an explanatory hint rather than left blank and unexplained |
| A member with no country of their own and no organization country still sees only global holidays | It is the behaviour that ships today, and the new chain can only widen it | Setting the organization country, which is the whole point of the third link |
| The 100-row cap is a flat number, not a measurement | No organization in this product is near it, and the refusal names the fix | A measurement against a real organization, recorded in `docs/research/` |

## Acceptance Criteria

| # | Criterion | Observed by |
|---|---|---|
| 1 | A `user` opens the calendar and sees a row for every active member of the organization | TC-01-E2E-01 |
| 2 | A `viewer` is refused the calendar and is shown no navigation row for it | TC-01-INT-02, TC-01-E2E-06 |
| 3 | Picking two teams draws exactly the union of their members, and nobody else | TC-01-INT-05, TC-01-E2E-02 |
| 4 | Picking four people by hand draws exactly those four rows | TC-01-INT-07, TC-01-E2E-03 |
| 5 | An approved request draws a solid band across its days; a pending one draws a hatched band | TC-01-E2E-01 |
| 6 | A rejected request and a cancelled one draw nothing | TC-01-INT-09 |
| 7 | A band spanning a weekend is one continuous run and reports its frozen working-day count | TC-01-INT-10, TC-01-E2E-01 |
| 8 | A member's holiday country resolves from their profile, then their phone, then the organization, and is `null` when none of the three is usable | TC-01-UNIT-01, TC-01-INT-12 |
| 9 | A country-scoped holiday marks only the cells of the members it applies to | TC-01-INT-13, TC-01-E2E-04 |
| 10 | A holiday that applies to everyone in view shades the whole column | TC-01-E2E-04 |
| 11 | Setting the organization country gives members without a country of their own that country's holidays | TC-01-INT-14 |
| 12 | A manager cannot set the organization country and is told so | TC-01-INT-15 |
| 13 | A range longer than 92 days is refused with the message that names the bound | TC-01-INT-16 |
| 14 | A scope resolving to more than 100 members is refused rather than truncated | TC-01-INT-17 |
| 15 | An empty team or people selection is refused rather than drawn as an empty grid | TC-01-INT-06, TC-01-INT-08 |
| 16 | A month with no absences still draws the full grid | TC-01-E2E-05 |
| 17 | A calendar read for another organization answers 404 | TC-01-INT-18 |
