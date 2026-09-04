# 01 — Vacation Calendar · Verification & Cases

## Verification Plan

Walked before the cases below were written, on the spec run's own ports and the E2E database.
Every cell is what happened.

### Bringing it up

| Step | Command | Observed |
|---|---|---|
| Database | `docker compose ps` | The Postgres container was up and healthy. |
| Migrate + start the pair | `CI=1 npx playwright test tests/<probe>.spec.ts --workers=1 --retries=0` from `e2e/`, which claims its own port pair | `globalSetup` migrated the E2E database it chose and reported `30 migrations found`, `No pending migrations to apply`. Nest mapped its routes and Next reported ready; both servers answered on the pair the harness claimed. |
| The address this spec claims | `GET /api/organizations/{orgId}/time-off/calendar?startDate=2026-09-01&endDate=2026-09-30` | **404** — nothing answers there today, so the route is free. |

### Reaching the states the cases need

| State a case needs | Route to it | Exists today | Proven |
|---|---|---|---|
| An organization and an admin | `signupOrg` (`e2e/tests/helpers.ts:746`) | yes | yes — org id returned |
| Four members with real names | `inviteAndAcceptViaApi` (`helpers.ts:933`) then `findMember` (`helpers.ts:965`) | yes | yes — Ivan Demchenko, Anna Kovalenko, Pavel Mishin, Marta Sokolova, ids returned |
| **The admin still signed in between invitations** | `login(request, adminEmail)` before each `inviteAndAcceptViaApi` | yes | yes — **accepting an invitation switches the cookie jar to the new member**, who holds no invite capability; without the re-login the second invitation answered `403`. Any fixture creating more than one member must do this. |
| The role a member is invited as | `inviteAndAcceptViaApi(..., 'user')` | yes | yes — **`member` is refused with `400`**; the accepted values are the four-role enum |
| Two projects with overlapping membership | `createProjectViaApi` (`helpers.ts:1140`), `assignProjectMembersViaApi` (`helpers.ts:1160`) | yes | yes — two projects, one member on both, one member on neither |
| Financials, so a request can be submitted | `configureFinancials` (`helpers.ts:989`) | yes | yes |
| A reserve balance | `seedReserveCredit` (`helpers.ts:1072`), fixture `POST /api/test/vacation/seed-credit` | yes | yes — 1400 ≈ 10 available days at the default salary |
| An **approved** vacation request | `submitVacationRequestViaApi` then `reviewVacationRequestViaApi` (`helpers.ts:1093`, `1117`) | yes | yes — 14–18 Sep 2026, `workingDays: 5` |
| A **pending** vacation request | `submitVacationRequestViaApi`, not reviewed | yes | yes — 23–25 Sep 2026 |
| A **rejected** vacation request | `reviewVacationRequestViaApi(..., { decision: 'rejected' })` | yes | yes — 28–30 Sep 2026 |
| A **cancelled** vacation request | `PUT .../vacation/requests/{id}/cancel` | yes — route ships | **not run**; the cancel route was not exercised by the probe. Known Gaps below. |
| A global holiday | `POST /api/organizations/{orgId}/holidays` with `countryCode: null` | yes | yes — `201`, `Company Day` on 2026-09-21 |
| A country-scoped holiday | the same route with `countryCode: 'PL'` | yes | yes — `201`, `Polish National Day` on 2026-09-16 |
| A **shared** holiday-seeding helper | `createHolidayViaApi` exists but is **private to `e2e/tests/reports-time-off.spec.ts:38`** | no | This spec owes its promotion to `e2e/tests/helpers.ts`; the probe called the endpoint directly. |
| **A member whose country is stated on their membership** | `PUT /api/organizations/{orgId}/members/{memberId}` with `countryCode` | no — the route ships, the field does not | **not run** — the column does not exist yet, so no probe could reach the state. This spec owes `setMemberCountryViaApi` in `e2e/tests/helpers.ts`; TC-01-INT-12, TC-01-INT-25 and TC-01-E2E-08 all reach the state through it. |
| A member with **no** country | invite and touch nothing | yes | yes |
| An organization country | `PUT /api/organizations/{orgId}/settings/country`, read back through `GET` on the same path | no — this spec adds both | This spec owes `setOrganizationCountryViaApi` in `e2e/tests/helpers.ts`. |
| A member with a phone country — **no case of this spec needs this state**; it is the route the probe used to establish what the change moves | `updateAccountSettingsViaApi` (`helpers.ts:1310`) with `phoneCountryCode` | yes | yes — **and `firstDayOfWeek` must be `'Monday'`, capitalized**; `'monday'` answered `400 {"errors":{"firstDayOfWeek":"Invalid first day of week"}}`. An invited member's `timezone` is `""` and the PUT requires a real one. TC-01-INT-12 seeds a phone country only to prove it now reaches nothing. |
| A `viewer` | `setMembershipRole` (`helpers.ts:172`) | yes | not run by the probe; the helper ships and is used by the reports suites. |

### Access this needs

None. Every observation above was made against this repository's own API on its own ports; the
feature calls no third-party system, needs no key, and adds no MCP server. There is nothing for a
later agent to obtain.

### What the probe established about today's behaviour

| Claim | How established | Observed |
|---|---|---|
| A member with `phoneCountryCode = 'PL'` receives the `PL` holiday and the global one | `GET /holidays?scope=mine` as that member | Both rows returned |
| A member with no country receives only the global holiday | the same call as a member who set nothing | One row returned |
| A country-scoped holiday reaches Amounts Owed only for members who resolve to that country | `GET /reports/amounts-owed?startDate=2026-09-01&endDate=2026-09-30` | Sep 16 produced **one** Holiday row (Ivan, `320.00`); Sep 21, the global day, produced **five** (`1280.00` for the group). This is the measurement behind the Blast Radius entry in [README.md](README.md): the organization-country fallback moves members from the first shape to the second. |
| The Time Off report already carries vacation rows by member with their status, and holidays in an `organization_wide` group | `GET /reports/time-off` over the same range | `groups[]` held three membership groups (`pending`, `approved`, `rejected`) plus `organization_wide` with both holidays |

### Rehearsal

One throwaway Playwright spec, `e2e/tests/zz-probe-vacation-calendar.spec.ts`, built every state
above, called the endpoints, and reached both screens the feature touches:

```
cd e2e && CI=1 npx playwright test tests/zz-probe-vacation-calendar.spec.ts --workers=1 --retries=0
```

It failed three times before it passed, and each failure is a row above: `400` on the `member`
role, `403` on the second invitation, `400` on `firstDayOfWeek`. It then passed in 12.3s (23.3s
including server start), reached `/org/{orgId}/reports/time-off` (`reports-page-title` visible) and
`/org/{orgId}/settings/holidays` (`holidays-page` visible), and screenshotted the shell that the
mock in this bundle is drawn against. **The file was deleted**; only the command and these results
are kept.

### Not proven

| What | Why it matters | What would close it |
|---|---|---|
| The membership link of the chain — the one this spec puts first | `Membership.countryCode` is a column this spec adds, so nothing the probe could call reaches it; every observation above was taken against a chain that does not have it yet | TC-01-INT-12 and TC-01-INT-25, both unrun until the code exists |
| The organization link of the chain | `Organization.countryCode` is likewise a column this spec adds | TC-01-INT-14 and TC-01-INT-15, unrun until the code exists |
| A `cancelled` request drawing nothing | The cancel route ships and was not called | TC-01-INT-09 covers it |

## Test Cases

### TC-01-UNIT-01

- **Level:** Unit
- **Covers:** REQ-01-026, REQ-01-027, REQ-01-040
- **Steps:** Call the helper with each `(membership, organization)` pair: `('US', 'BY')`;
  `(null, 'BY')`; `(null, null)`; `('US', null)`; `('XX', 'PL')` where `XX` does not normalize;
  `('', 'PL')`; `('pl', 'BY')` lowercase; `('US', 'xx')`; **`(null, 'xx')`** and **`('XX', 'YY')`**,
  where the organization's value is the last one left and does not normalize.
- **Expected Result:** `US`, `BY`, `null`, `US`, `PL`, `PL`, `PL`, `US`, `null`, `null`. The
  membership wins whenever it normalizes; an unusable membership value falls through to the
  organization rather than terminating the chain; and the last two pairs are the branch that
  matters most — with nothing usable left, the chain **rejects** rather than returning the raw
  unusable string, which is the backwards implementation of REQ-01-040 this case exists to fail.
  The result is always uppercase.

### TC-01-UNIT-02

- **Level:** Unit
- **Covers:** REQ-01-014, REQ-01-015, REQ-01-016, REQ-01-019
- **Steps:** Validate: a missing `endDate`; `2026-09-30` → `2026-09-01`; `2026-01-01` →
  `2026-04-30` (120 days); `2026-09-01` → `2026-09-30`; `2026-09-01` → `2026-09-01`; a 92-day span
  exactly. Then compute each preset for a caller whose `firstDayOfWeek` is `Monday` and again for
  `Sunday`, anchored on Thursday 2026-09-17.
- **Expected Result:** `rangeRequired`, `rangeInverted`, `rangeTooWide`, valid, valid, valid. The
  `Week` preset spans 2026-09-14…20 for Monday and 2026-09-13…19 for Sunday; `2 weeks` doubles it
  from the same anchor; `Month` is 2026-09-01…30 for both, because a month is not a week.

### TC-01-UNIT-03

- **Level:** Unit
- **Covers:** REQ-01-028, REQ-01-029
- **Steps:** Apply a `null`-country holiday to a `PL` member and to a `null` member; a `PL` holiday
  to a `PL` member, a `US` member, a `null` member, and a `"pl"` member.
- **Expected Result:** true, true, true, false, false, true. A global holiday reaches everyone; a
  country-scoped one reaches nobody without a country; matching is case-insensitive.

### TC-01-INT-01

- **Level:** Integration
- **Covers:** REQ-01-005, REQ-01-012
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** Seed an organization with five active members whose names sort out of insertion order.
  Read the calendar with `scope=all` over a month.
- **Expected Result:** Five rows, ordered by display name case-insensitively ascending. `days[]`
  holds one entry per calendar day of the range with `isWeekend` true exactly on Saturdays and
  Sundays.

### TC-01-INT-02

- **Level:** Integration
- **Covers:** REQ-01-002
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 404
- **Steps:** Demote a member to `viewer` with `setMembershipRole`, sign in as them, read the
  calendar.
- **Expected Result:** `404` with no body distinguishing it from a wrong-organization read.

### TC-01-INT-03

- **Level:** Integration
- **Covers:** REQ-01-010
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** Create a second organization with its own project and member. From the first
  organization, read the calendar with `scope=people` naming one own member and the foreign
  membership id, then with `scope=teams` naming one own project and the foreign project id.
- **Expected Result:** `200` both times, carrying only the caller's own rows. The foreign ids are
  dropped silently — never answered, never echoed, and never an error that confirms they exist.

### TC-01-INT-04

- **Level:** Integration
- **Covers:** REQ-01-007
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** Four members: two on project A, one on project B, one on no project. Read with
  `scope=teams&projectIds=none`, then with `projectIds=<A>&projectIds=none`.
- **Expected Result:** One row for the first read — the unassigned member only. Three rows for the
  second, with no duplicate row for anybody.

### TC-01-INT-05

- **Level:** Integration
- **Covers:** REQ-01-006
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** Members A and B on project 1, B and C on project 2, D on neither. Read with both
  project ids.
- **Expected Result:** Three rows — A, B, C. B appears once despite two assignments (Edge case 4).
  D is absent.

### TC-01-INT-06

- **Level:** Integration
- **Covers:** REQ-01-009
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 422
  TIME_OFF_CALENDAR_MESSAGES.teamsRequired
- **Steps:** Read with `scope=teams` and no `projectIds`.
- **Expected Result:** `422` carrying `teamsRequired`, and no `members` array in the body.

### TC-01-INT-07

- **Level:** Integration
- **Covers:** REQ-01-008
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** Seed eight members; read with `scope=people` naming exactly four of them.
- **Expected Result:** Exactly those four rows, name-ordered. The other four are absent.

### TC-01-INT-08

- **Level:** Integration
- **Covers:** REQ-01-009
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 422
  TIME_OFF_CALENDAR_MESSAGES.peopleRequired
- **Steps:** Read with `scope=people` and no `memberIds`.
- **Expected Result:** `422` carrying `peopleRequired`.

### TC-01-INT-09

- **Level:** Integration
- **Covers:** REQ-01-020, REQ-01-021, REQ-01-025
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** One member with four requests in the window: approved, pending, rejected, and one
  approved-then-cancelled; and a fifth, approved, falling wholly after the window. Read the
  calendar.
- **Expected Result:** Two bands — the approved one and the pending one — each carrying
  `kind: "vacation"` and its own status. The rejected and cancelled requests produce no band and
  their ids appear nowhere in the response, and neither does the request outside the window
  (Edge case 3).

### TC-01-INT-10

- **Level:** Integration
- **Covers:** REQ-01-017, REQ-01-022, REQ-01-024
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** An approved request spanning 2026-08-28 → 2026-09-03 with a frozen `workingDays` of
  5. Read a window of 2026-09-01 → 2026-09-30 as a caller whose `Account.timezone` is
  `Pacific/Auckland`, and again as one in `America/Los_Angeles`.
- **Expected Result:** Both reads return the band with `startDate: "2026-08-28"`,
  `endDate: "2026-09-03"`, `startsBeforeWindow: true`, `endsAfterWindow: false` and
  `workingDays: 5` — the frozen value, not a recount over the visible part. The boundary day
  2026-09-01 is included in both timezones, which a `DATE`-against-`TIMESTAMPTZ` comparison would
  drop for one of them.

### TC-01-INT-11

- **Level:** Integration
- **Covers:** REQ-01-011
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** Give a member an approved request, then remove them with `removeMember`. Read with
  `scope=all`, then with `scope=people` naming them explicitly.
- **Expected Result:** No row for them in either read, and no band for their request. Naming a
  removed member explicitly is not an error (Edge case 7).

### TC-01-INT-12

- **Level:** Integration
- **Covers:** REQ-01-026
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** Four members and three holidays on distinct dates — global, `PL`, `US`. The
  organization country is `PL`. Member A is stated `US`; B is stated `PL`; C is stated nothing;
  D is stated nothing and the organization country is then cleared. Give A a
  `phoneCountryCode` of `BY` and leave it there for the whole case.
- **Expected Result:** A carries the global and the `US` holiday — their stated country wins over
  the organization's, and their `BY` phone country reaches nothing, which is the source this spec
  drops. B and C both carry the global and the `PL` one, C by the organization fallback. D
  carries only the global one. Each member's `countryCode` in the response is `US`, `PL`, `PL`,
  `null` respectively.

### TC-01-INT-13

- **Level:** Integration
- **Covers:** REQ-01-028, REQ-01-031
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** Two members, one resolving to `PL` and one to `null`; one `PL` holiday inside the
  window and a global holiday on that same date. Read with `scope=all`.
- **Expected Result:** Both holidays appear once each in `holidays[]` — the `PL` one with
  `appliesToAllInView: false`, the global one with `true`, so one date carries both answers
  (Edge case 9). Only the `PL` member's `holidayIds` contains the `PL` one; both members carry
  the global one.

### TC-01-INT-14

- **Level:** Integration
- **Covers:** REQ-01-033
- **Asserts:** `PUT /api/organizations/{orgId}/settings/country` → 200;
  `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** With a `PL` holiday in the window and a member who has no country stated, read the
  calendar; set the organization country to `PL` as a `manager`; read it again.
- **Expected Result:** The first read gives that member no `holidayIds` entry for the `PL` day; the
  second does, with no other change to the response. Nothing was written to the membership — the
  chain is evaluated on read (Edge case 12).

### TC-01-INT-15

- **Level:** Integration
- **Covers:** REQ-01-035
- **Asserts:** `PUT /api/organizations/{orgId}/settings/country` → 200;
  `PUT /api/organizations/{orgId}/settings/country` → 404
- **Steps:** As a `manager`, submit a country. Then as a `user`, and then as a `viewer`.
- **Expected Result:** `200` for the manager — `manage-holidays` grants admin and manager alike.
  `404` for both the `user` and the `viewer`, byte-identical, so neither learns the route exists.

### TC-01-INT-24

- **Level:** Integration
- **Covers:** REQ-01-046, REQ-01-047
- **Asserts:** `GET /api/organizations/{orgId}/settings/country` → 200;
  `GET /api/organizations/{orgId}/settings/country` → 404
- **Steps:** Read the country as an `admin` before anything is stored, set it to `PL` through the
  `PUT`, and read it again. Then read it as a `manager`, as a `user` and as a `viewer`.
- **Expected Result:** `{ "countryCode": null }` on the first read and `{ "countryCode": "PL" }` on
  the second, which is the value the picker paints. `200` for the manager, and `404` for both the
  `user` and the `viewer` — the same refusal the `PUT` beside it gives them.

### TC-01-INT-25

- **Level:** Integration
- **Covers:** REQ-01-042, REQ-01-043, REQ-01-051
- **Asserts:** `PUT /api/organizations/{orgId}/members/{memberId}` → 200;
  `PUT /api/organizations/{orgId}/members/{memberId}` → 400
  HOLIDAY_MESSAGES.countryCodeInvalid;
  `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** With a `US` holiday and a `PL` holiday in the window and the organization country set
  to `PL`, state `US` on a member as a `manager`, read the calendar, then submit an empty country
  for the same member and read again. Finally submit `pl` for that member.
- **Expected Result:** After the first write the member carries the `US` holiday and not the `PL`
  one; after the second their `Membership.countryCode` is `null` and they carry the `PL` one, by
  the organization fallback. The member's role and job title are unchanged by every write. The
  third write is refused with `400` carrying `countryCodeInvalid` — the status this route already
  refuses an invalid role and an invalid job title with, not the `422` the organization country
  write answers — and the stored country stays `null`.

### TC-01-INT-26

- **Level:** Integration
- **Covers:** REQ-01-044
- **Asserts:** `PUT /api/organizations/{orgId}/members/{memberId}` → 403
  MEMBER_MESSAGES.editForbidden
- **Steps:** As a `user`, submit a country for another member. Then submit one for themselves.
- **Expected Result:** `403` carrying `editForbidden` both times — the route's existing refusal,
  unchanged by the new field, and a member may not state their own holiday country any more than
  they may set their own role.

### TC-01-INT-27

- **Level:** Integration
- **Covers:** REQ-01-045
- **Asserts:** `GET /api/organizations/{orgId}/members/{memberId}` → 200
- **Steps:** With the organization country set to `PL`, read a member who has `US` stated, then a
  member who has nothing stated. Read the first member again as a `user` and as a `viewer`.
- **Expected Result:** `countryCode` is `"US"` for the first and `null` for the second — the
  **stored** value, never the resolved one. A `null` here is what the picker renders as its default
  option, and a screen that received `"PL"` would show a country nobody had stated for that member.
  The `user` and the `viewer` receive the identical body, field included: the read is gated by no
  capability and the field is not conditional on one. What they do not get is the control, which is
  a rendering decision and is asserted by TC-01-E2E-08.

### TC-01-INT-28

- **Level:** Integration
- **Covers:** REQ-01-048
- **Asserts:** `GET /api/organizations/{orgId}/members/{memberId}` → 200
- **Steps:** State `US` on a member who also carries a job title, remove them, then restore them.
  Read their detail, and read the calendar over a window holding a `US` holiday.
- **Expected Result:** `countryCode` is `"US"` on the detail read and the member carries the `US`
  holiday again — the restore clears the job title beside it and leaves the country alone, so a
  returning member is paid the holidays they were paid before they left rather than the
  organization's until somebody re-states them.

### TC-01-INT-16

- **Level:** Integration
- **Covers:** REQ-01-016
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 422
  TIME_OFF_CALENDAR_MESSAGES.rangeTooWide
- **Steps:** Read a 93-day range, then a 92-day range, then a 60-day range running from December
  into the following January.
- **Expected Result:** `422` carrying `rangeTooWide` for the first; `200` for the second — the
  bound is inclusive. `200` for the third, whose `days[]` spans the year boundary and whose ISO
  week numbers restart across it (Edge case 15).

### TC-01-INT-17

- **Level:** Integration
- **Covers:** REQ-01-013
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 422
  TIME_OFF_CALENDAR_MESSAGES.tooManyMembers
- **Steps:** Seed 101 active members. Read with `scope=all`, then with `scope=people` naming 100
  of them.
- **Expected Result:** `422` carrying `tooManyMembers` for the first, and `200` with 100 rows for
  the second. The response is refused, never silently truncated.

### TC-01-INT-18

- **Level:** Integration
- **Covers:** REQ-01-039
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 404
- **Steps:** Sign in to organization A and read the calendar at organization B's `orgId`.
- **Expected Result:** `404`, byte-identical to the capability refusal of TC-01-INT-02.

### TC-01-INT-19

- **Level:** Integration
- **Covers:** REQ-01-018
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** At one instant of the run, read the same window three times: as a caller whose
  `Account.timezone` is `Pacific/Kiritimati`, as one whose timezone is `Pacific/Niue`, and as an
  invited member whose timezone is still empty. The case computes each zone's calendar date for
  that instant itself.
- **Expected Result:** `range.today` is the caller's own calendar date for that instant in the
  first two reads and the UTC date in the third. No date is written into the case as a literal —
  the suite runs on whatever day it runs. The two zones are 25 hours apart, so their answers
  never agree, whichever hour the run starts, and a server that ignored the caller's timezone
  would fail on at least one of the three. `days[]` is identical in all three — only the marker
  moves (Edge case 18).

### TC-01-INT-20

- **Level:** Integration
- **Covers:** REQ-01-034
- **Asserts:** `PUT /api/organizations/{orgId}/settings/country` → 200
- **Steps:** Set the organization country to `PL`, then submit an empty value.
- **Expected Result:** `200` and `countryCode: null`. A member relying on it falls back to `null`
  on the next calendar read and keeps only global holidays (Edge case 19).

### TC-01-INT-21

- **Level:** Integration
- **Covers:** REQ-01-036
- **Asserts:** `PUT /api/organizations/{orgId}/settings/country` → 422
  HOLIDAY_MESSAGES.countryCodeInvalid
- **Steps:** Submit `POL`, then `1`, then `pl`, then `PL`.
- **Expected Result:** `422` carrying `countryCodeInvalid` for the first three — lowercase is
  refused rather than upcased, so the stored value is the one the holiday rows compare. `200` for
  `PL`, stored as `PL`.

### TC-01-INT-22

- **Level:** Integration
- **Covers:** REQ-01-037
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** Read with `scope=teams` naming a project that has no members assigned.
- **Expected Result:** `200` with `members: []` and a populated `days[]`. An empty scope is a
  successful read of nothing, not a refusal — the refusal case is the *unselected* one
  (TC-01-INT-06).

### TC-01-INT-23

- **Level:** Integration
- **Covers:** REQ-01-041
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 422
  TIME_OFF_CALENDAR_MESSAGES.scopeInvalid
- **Steps:** Read with `scope=everyone`, then with no `scope` parameter at all.
- **Expected Result:** `422` carrying `scopeInvalid` both times, and no `members` array in either
  body. An unrecognized scope is refused, never defaulted to `all`.

### TC-01-E2E-01

- **Level:** E2E
- **Covers:** REQ-01-001, REQ-01-003, REQ-01-023, REQ-01-032
- **Steps:** Seed an organization with four members, an approved request spanning a weekend
  (2026-09-11 → 2026-09-15) and a pending one (2026-09-23 → 2026-09-25). Sign in as a `user`, open
  the `Time off` nav group, click `nav-time-off-calendar`, and choose the `Month` window over
  September 2026.
- **Expected Result:** The page renders; a row exists for each of the four members. The approved
  band is **one element** spanning all five columns 11–15 including the Saturday and Sunday, drawn
  solid; the pending band is drawn with the hatched treatment. Both carry their working-day counts
  in their accessible names. `calendar-day-header-2026-09-12` and `-2026-09-13` carry the weekend
  styling and 2026-09-14 does not.
- **Selectors:** `nav-time-off-calendar`, `time-off-calendar-page`, `calendar-grid`,
  `calendar-scope-all`, `calendar-window-month`, `calendar-member-row-{membershipId}` ×4,
  `calendar-absence-{vacationRequestId}` ×2, `calendar-day-header-{date}`, `calendar-legend`

### TC-01-E2E-02

- **Level:** E2E
- **Covers:** REQ-01-006, REQ-01-009
- **Steps:** Four members and two projects as in TC-01-INT-05. Open the calendar, click
  `calendar-scope-teams`, tick both projects in `calendar-teams-picker`, close it. Then untick
  the second project, and finally untick the first as well.
- **Expected Result:** Rows appear for the three assigned members and the row for the unassigned
  member is absent. Unticking the second project drops the member who was only on it. Unticking
  the last one draws `calendar-error-banner` carrying `TIME_OFF_CALENDAR_MESSAGES.teamsRequired`,
  and the grid underneath keeps its last good rows rather than clearing.
- **Selectors:** `calendar-scope-teams`, `calendar-teams-picker`, `calendar-member-row-{membershipId}` (present for the three assigned, absent for the unassigned),
  `calendar-error-banner`

### TC-01-E2E-03

- **Level:** E2E
- **Covers:** REQ-01-008, REQ-01-019, REQ-01-049
- **Steps:** Eight members. Open the calendar, click `calendar-scope-people`, pick four of them in
  `calendar-people-picker`, then click `calendar-window-2weeks`, then `calendar-next`, then
  `calendar-prev` twice, then `calendar-today`, then `calendar-window-week`.
- **Expected Result:** Exactly four rows throughout. The grid holds fourteen day-header cells
  under the fortnight preset and seven under the week preset, starting on the caller's
  `firstDayOfWeek`. `calendar-range-label` names the window at each step; the range after
  `calendar-next` is the fortnight after the one before it and the range after each
  `calendar-prev` the fortnight before, and `calendar-today` lands on the window holding today
  (REQ-01-049).
- **Selectors:** `calendar-scope-people`, `calendar-people-picker`, `calendar-window-2weeks`,
  `calendar-window-week`, `calendar-next`, `calendar-prev`, `calendar-today`,
  `calendar-range-label`, `calendar-member-row-{membershipId}` ×4

### TC-01-E2E-04

- **Level:** E2E
- **Covers:** REQ-01-030, REQ-01-031
- **Steps:** Two members, one resolving to `PL` and one to nothing. Seed a global holiday on
  2026-09-21 and a `PL` holiday on 2026-09-16. Open the calendar with `scope=all` over September.
- **Expected Result:** The global day carries a whole-column holiday marker whose ground reaches
  both rows, and its column header names the holiday — the text `Company Day` is readable in
  `calendar-day-header-2026-09-21`. The `PL` day carries **no** column marker and names nothing in
  its header, and its per-cell marker is present on the `PL` member's row and absent on the
  other's.
- **Selectors:** `calendar-day-holiday-{date}` (present for the global day, absent for the PL day),
  `calendar-day-header-{date}` (carrying the holiday's name on the global day),
  `calendar-cell-holiday-{membershipId}-{date}` (present for the PL member, absent for the other)

### TC-01-E2E-05

- **Level:** E2E
- **Covers:** REQ-01-037, REQ-01-038
- **Steps:** An organization with three members and no vacation requests at all. Open the calendar
  over a month. Then switch to `scope=teams` and tick a project nobody is assigned to.
- **Expected Result:** The first view draws the full grid with three rows and no band, and
  `calendar-empty-state` is absent — an empty month is the answer, not the lack of one. The second
  draws `calendar-empty-state` and no `calendar-grid`.
- **Selectors:** `calendar-grid`, `calendar-empty-state` (absent, then present),
  `calendar-scope-teams`, `calendar-teams-picker`

### TC-01-E2E-06

- **Level:** E2E
- **Covers:** REQ-01-004
- **Steps:** Demote a member to `viewer`, sign in as them, open the sidebar's `Time off` group.
- **Expected Result:** `nav-time-off-calendar` is absent while `Holidays` and `Requests` follow
  their own existing gates. Navigating to the route directly lands on the app's not-found handling
  rather than the grid.
- **Selectors:** `nav-time-off-calendar` (absent), `time-off-calendar-page` (absent)

### TC-01-E2E-07

- **Level:** E2E
- **Covers:** REQ-01-033
- **Steps:** Seed a `PL` holiday and a member with no country stated. As a `manager`, open
  Settings › Holidays, set the organization country to Poland, save, then open the calendar.
- **Expected Result:** The manager's save succeeds — the control is theirs, not drawn read-only —
  and that member's row then carries the `PL` day's per-cell holiday marker, which it did not
  before. The holiday list on the page is unchanged by the save.
- **Selectors:** `org-country-select`, `org-country-save`,
  `calendar-cell-holiday-{membershipId}-{date}`

### TC-01-E2E-08

- **Level:** E2E
- **Covers:** REQ-01-042
- **Steps:** As a `manager`, open a member's About tab, set **Country** to Poland, and save. Open
  the calendar over a month holding a `PL` holiday. Then open the same About tab as a `user`.
- **Expected Result:** The country control saves through the form that already carries the role
  and the job title — one save, one toast. That member's row then carries the `PL` day's per-cell
  holiday marker, and a member left on the organization's country carries it only if the
  organization's country is `PL` too. The `user` reaches the tab — the page is refused to nobody —
  and `member-country-select` is `absent` for them: no control, and none drawn read-only.
- **Selectors:** `member-country-select`, `calendar-cell-holiday-{membershipId}-{date}`
