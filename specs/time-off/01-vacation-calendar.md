---
id: "01"
title: Vacation Calendar
routes: ["/org/{orgId}/time-off/calendar", "/org/{orgId}/settings/holidays", "/org/{orgId}/members/{memberId}"]
api:
  - "GET /api/organizations/{orgId}/time-off/calendar"
  - "GET /api/organizations/{orgId}/settings/country"
  - "PUT /api/organizations/{orgId}/settings/country"
  - "GET /api/organizations/{orgId}/members/{memberId}"
  - "PUT /api/organizations/{orgId}/members/{memberId}"
  - "GET /api/organizations/{orgId}/holidays"
entities: [Organization, Membership]
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

**One structural decision shapes the payload:** every absence band carries a `kind` (REQ-01-025),
today the constant `"vacation"`.

Beyond the request, this spec adds:

- **A nullable country column on `Membership` and on `Organization`, with a picker for each.**
  Holidays are asked to follow the member's country or the company's and neither exists today.
  The member's rides the member read and write that already ship; the organization's gets a `GET`
  and a `PUT` of its own, because a picker with nothing to read has no source but an invented one.
- **One country-resolution helper, adopted by every call site that resolves a member's country.**
  Holidays `scope=mine` and both reports read `Account.phoneCountryCode` today, and this spec
  drops that source everywhere rather than ranking against it — one question needs one answer.
  **It moves what Amounts Owed pays, in both directions, and pays less than today until somebody
  states a country** — the Blast Radius measures both and names the deploy-day step.
- **The `ViewTimeOffCalendar` capability**, and neither country write adds one of its own.

Blast radius and backward compatibility for this spec are in [README.md](README.md).

## Actors & Preconditions

- **Actors:** `admin`, `manager` and `user` open the calendar and see every member it is scoped
  to. `viewer` has no access and is shown no navigation row. `admin` and `manager` state both
  countries.
- **Preconditions:** the caller is an `active` member of the organization. Nothing else — with no
  holidays, no projects and no requests the grid draws empty rather than erroring, because
  "nobody is away" is an answer this screen exists to give.

## Roles & Permission Matrix

Capability checks run against `normalizeRole()` (`packages/validation/src/roles.ts`), so they work
on today's `admin` / `member` column and survive the role-enum migration untouched. `edit-detail`
belongs only to the lowercase-dashed `MemberCapability` union that `can(role, …)` reads; the two
holiday rows are spelled in it and in `Capability`, which `RequireCapability` decorators name.

**Decided:** this spec's capability ships in both unions — `ViewTimeOffCalendar` and its twin
`view-time-off-calendar`, granted to admin, manager and user in each — and page and nav are both
gated on the **normalized** role: `can(normalizeRole(role), 'view-time-off-calendar')` behind the
route, `hasCapability(role, 'ViewTimeOffCalendar')` in the sidebar, so a membership storing
`member` is read as `user` and holds it on both. Rejected: the raw role, which would refuse that
member the page while the sidebar drew its row; and `Capability` alone, spelling this gate
differently from `view-holidays`.

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| `ViewTimeOffCalendar` — open the calendar, any scope | ✅ | ✅ | ✅ | ❌ |
| `ViewHolidays` — read the organization country | ✅ | ✅ | ❌ | ❌ |
| `ManageHolidays` — set the organization country | ✅ | ✅ | ❌ | ❌ |
| `edit-detail` — set a member's country | ✅ | ✅ | ❌ | ❌ |

`viewer` is refused because reports/01 already settles what a viewer sees of time off: their own.

## Functional Requirements

### The screen and its gate

#### REQ-01-001 — the calendar route

WHERE the caller holds `ViewTimeOffCalendar`, THE SYSTEM SHALL render the calendar at
`/org/{orgId}/time-off/calendar`.

#### REQ-01-002 — the refusal is a 404

IF a caller without `ViewTimeOffCalendar` requests the calendar, THEN THE SYSTEM SHALL answer
`404` and draw nothing.

**Decided:** unknown and unauthorized are byte-identical here as everywhere.

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

**Decided:** an empty selection is ambiguous between "nothing ticked yet" and "everyone", and an
empty grid would say the team has nobody in it. `projectIds=none` alone is a tick, and is answered.

#### REQ-01-041 — an unknown scope is refused

IF `scope` is absent or is not one of `all`, `teams` or `people`, THEN THE SYSTEM SHALL answer
`422` carrying `TIME_OFF_CALENDAR_MESSAGES.scopeInvalid`.

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

#### REQ-01-017 — days are calendar days

THE SYSTEM SHALL compare `VacationRequest.startDate`, `VacationRequest.endDate` and `Holiday.date`
against the raw ISO range, never against a timezone-shifted UTC instant.

**Decided:** all three are calendar dates; comparing one against an instant drops a boundary day.

#### REQ-01-018 — today is the caller's today

THE SYSTEM SHALL resolve the day marked as today from the caller's `Account.timezone`, and from
UTC whenever that value is absent, empty or not a timezone the server recognizes.

#### REQ-01-019 — the window presets

WHERE the screen offers the `Week`, `2 weeks` and `Month` presets, THE SYSTEM SHALL compute each
preset's range from the caller's `Account.firstDayOfWeek`, except `Month`, which runs from the
first to the last day of the displayed calendar month.

#### REQ-01-049 — moving the window

WHEN the reader moves the range back, forward, or to today, THE SYSTEM SHALL move it to the range
that control names — under `Week` and `2 weeks` one preset length earlier or later, under `Month`
the whole calendar month before or after the displayed one, or the window holding the caller's
today — and name the new range in the range label.

**Decided:** back and forward reach only ranges the chosen preset itself produces. Rejected:
shifting by the window's day count, which under `Month` lands on a span that is no calendar month.

### The absence bands

#### REQ-01-020 — which requests are drawn

THE SYSTEM SHALL return an absence band for every `VacationRequest` whose status is `approved` or
`pending` and whose date range intersects the window.

#### REQ-01-021 — which requests are never drawn

THE SYSTEM SHALL return no band for a `VacationRequest` whose status is `rejected` or `cancelled`.

#### REQ-01-022 — bands are clipped, not dropped

WHEN an absence starts before the window or ends after it, THE SYSTEM SHALL return the band with
its true `startDate` and `endDate` and a flag on each edge that falls outside the window.

#### REQ-01-023 — a band is one continuous run

THE SYSTEM SHALL draw a band as one unbroken run across every day from its start to its end,
including weekends and holidays inside it.

#### REQ-01-024 — the band's day count is the frozen one

THE SYSTEM SHALL carry `VacationRequest.workingDays` on the band exactly as it was frozen at
submission.

#### REQ-01-025 — the kind field

THE SYSTEM SHALL emit `kind: "vacation"` on every band.

**Decided:** the one field added ahead of its need, so the policy catalogue lands by adding values.

### Holidays, and the country they belong to

#### REQ-01-026 — the country chain

THE SYSTEM SHALL resolve a member's holiday country as `Membership.countryCode` when it
normalizes to a valid ISO 3166-1 alpha-2 value, and as `Organization.countryCode` otherwise.

**Decided:** both links are stated by a person. The phone country is dropped rather than ranked — a
dial code is a contact detail a foreign SIM makes wrong — and `MemberProfile.country` is PII.

#### REQ-01-040 — a member with no country at all

IF neither `Membership.countryCode` nor `Organization.countryCode` normalizes to a valid alpha-2
value, THEN THE SYSTEM SHALL resolve the member's holiday country to `null`.

#### REQ-01-027 — an unusable candidate is skipped, not fatal

WHEN `Membership.countryCode` is present but does not normalize to a valid alpha-2 value, THE
SYSTEM SHALL skip it and read `Organization.countryCode` instead.

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

**Decided:** a fixed Monday–Friday week; a configurable one would disagree with frozen `workingDays`.

### The countries, and who states them

#### REQ-01-042 — setting a member's country

WHEN a caller holding `edit-detail` submits an ISO 3166-1 alpha-2 country for a member, THE
SYSTEM SHALL store it on `Membership.countryCode`.

**Decided:** a field on the member update that already ships — one field does not earn an endpoint,
and it rides that update's organization-row lock rather than adding one, unlike REQ-01-033.

#### REQ-01-043 — clearing a member's country

WHEN a caller holding `edit-detail` submits an empty country for a member, THE SYSTEM SHALL store
`null` on `Membership.countryCode`.

**Decided:** `null` is not a member without holidays — REQ-01-026 reads the organization's
country for exactly this row.

#### REQ-01-048 — a restored membership keeps its country

WHEN a `removed` membership becomes `active` again, THE SYSTEM SHALL leave
`Membership.countryCode` at the value stored on it.

**Decided:** kept, though the restore clears the job title beside it — a country is a fact about
the person. Rejected: clearing it, which pays a returning member global holidays only.

#### REQ-01-044 — the member write is refused to everyone else

IF a caller without `edit-detail` submits a member country, THEN THE SYSTEM SHALL answer `403`
carrying `MEMBER_MESSAGES.editForbidden`.

#### REQ-01-045 — reading a member's country

WHEN any caller the member detail read already answers opens a member's detail, THE SYSTEM SHALL
return that member's stored `Membership.countryCode` on that read.

**Decided:** unconditional — the route answers every role and gates only its edit flags, and a field
that appears with a capability is two response bodies for one route. The value is the stored one.

#### REQ-01-046 — reading the organization's country

WHEN a caller holding `ViewHolidays` reads the organization country, THE SYSTEM SHALL return the
stored `Organization.countryCode`.

**Decided:** a `GET` beside the `PUT`, the shape `api/organizations/:orgId/settings/signing` ships.
Without it the picker REQ-01-033 writes through has no value on first paint.

#### REQ-01-047 — the organization country read is refused to everyone else

IF a caller without `ViewHolidays` reads the organization country, THEN THE SYSTEM SHALL answer
`404`.

#### REQ-01-033 — setting the organization's country

WHEN a caller holding `ManageHolidays` submits an ISO 3166-1 alpha-2 country, THE SYSTEM SHALL
store it on `Organization.countryCode`.

**Decided:** last-write-wins, with no lock and no version check: one column, no read-modify-write.

#### REQ-01-034 — clearing the organization's country

WHEN a caller holding `ManageHolidays` submits `countryCode` as `null` or empty, THE SYSTEM SHALL
store `null` on `Organization.countryCode`.

**Decided:** a body with no `countryCode` key changes nothing, as the member write beside it does:
clearing on an absent key lets a mistyped key drop the country the fallback depends on.

#### REQ-01-035 — the write is refused to everyone else

IF a caller without `ManageHolidays` submits a country, THEN THE SYSTEM SHALL answer `404`.

**Decided:** `ManageHolidays` rather than a capability of its own, a distinction no grant expresses
and no case could reach. 404 is what it answers on the holiday create and edit beside it.

#### REQ-01-036 — an invalid organization country is refused

IF the submitted country is neither empty nor two uppercase letters naming an **assigned** country,
THEN THE SYSTEM SHALL answer `422` carrying `PROFILE_MESSAGES.country.invalid`.

**Decided:** both writes test the assigned list on top of the uppercase shape, so `XX` is refused
and `pl` still is: storing `XX` stores what REQ-01-026 discards on every read.

#### REQ-01-051 — an invalid member country is refused

IF the submitted country is neither empty nor two uppercase letters naming an **assigned** country,
THEN THE SYSTEM SHALL answer `400` carrying `PROFILE_MESSAGES.country.invalid` on the member write.

**Decided:** the `400` its role and job title already answer, not a second status per field.

### States

#### REQ-01-037 — no members

WHILE a scope resolves to no rows, THE SYSTEM SHALL draw the empty state in place of the grid.

#### REQ-01-038 — no absences

WHILE the rows have no absence in the window, THE SYSTEM SHALL draw the full grid with no bands.

**Decided:** an empty month is the answer, not the absence of one — a "no data" panel would hide
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
| A holiday falling inside an approved vacation is still deducted as a working day, and the band says so | The frozen `workingDays` contract is what specs 07–09 and every issued report rest on; changing it retroactively would move money already reported | A later amendment proposed here: resolve the holiday set at submit time and store which holidays the request counted, leaving every issued report's number untouched |
| Both country columns are `null` on every row the migration touches, so on the day it lands every member resolves to `null` and receives global holidays only — including the members whose phone country reached a national set the day before | Nothing is stored wrong: the chain is evaluated on read, so stating either country repairs every reader at once. What it costs is a window, not data, and README.md measures that window in both directions | Stating the organization country on the Holidays page, in the same change window as the deploy, which returns every member nobody has stated a country for to a national set. The field is drawn with an explanatory hint rather than left blank and unexplained |
| A member with no country of their own and no organization country sees global holidays only | It is a state that ships today for anybody whose phone carries no country, and the row above says what to do about it on deploy day | Stating a country on the member, or on the organization — the two links, in that order |
| The 100-row cap is a flat number, not a measurement | No organization in this product is near it, and the refusal names the fix | A measurement against a real organization, recorded in `docs/research/` |
| A holiday row carrying `AC`, `TA` or `XK` reaches nobody | Those three are on the holiday form's own picker, which this spec does not own, and are not assigned codes, so no member and no organization can be set to them. The alternative was to accept them on both country writes, which reinstates a stored country every read discards | Those codes entering `COUNTRY_NAMES`, or the holiday create narrowing to the same list — a rule belonging to `organization/03`, not to this spec |

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
| 8 | A member's holiday country is the one stated on them, else the one stated on the organization, and is `null` when neither is usable | TC-01-UNIT-01, TC-01-INT-12 |
| 9 | A country-scoped holiday marks only the cells of the members it applies to | TC-01-INT-13, TC-01-E2E-04 |
| 10 | A holiday that applies to everyone in view shades the whole column | TC-01-E2E-04 |
| 11 | Setting the organization country gives every member nobody has stated a country for that country's holidays | TC-01-INT-14 |
| 12 | A manager sets the organization country, and a user and a viewer are refused it identically | TC-01-INT-15 |
| 13 | A range longer than 92 days is refused with the message that names the bound | TC-01-INT-16 |
| 14 | A scope resolving to more than 100 members is refused rather than truncated | TC-01-INT-17 |
| 15 | An empty team or people selection is refused rather than drawn as an empty grid | TC-01-INT-06, TC-01-INT-08 |
| 16 | A month with no absences still draws the full grid | TC-01-E2E-05 |
| 17 | A calendar read for another organization answers 404 | TC-01-INT-18 |
| 18 | A country stated on a member overrides the organization's, and clearing it returns them to the organization's | TC-01-INT-25 |
| 19 | The member detail screen shows the country stored on that member, not the one they resolve to | TC-01-INT-27 |
| 20 | The Holidays page reads back the organization country it stored, and the roles that cannot see the page cannot read it either | TC-01-INT-24 |
