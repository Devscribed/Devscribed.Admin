# 01 — Vacation Calendar · Verification & Cases

## Verification Plan

Walked before the cases below were written, on the spec run's own ports and the E2E database.
Every cell is what happened.

### Bringing it up

| Step | Command | Observed |
|---|---|---|
| Database | `docker compose ps` | The Postgres container was up and healthy. |
| Migrate + start the pair | `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/<probe>.spec.ts --workers=1 --retries=0` from `e2e/` | `globalSetup` migrated the E2E database it chose and reported `30 migrations found`, `No pending migrations to apply`. Nest mapped its routes and Next reported ready; both servers answered on the pair the harness claimed. |
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
| A member with a country | `updateAccountSettingsViaApi` (`helpers.ts:1310`) with `phoneCountryCode` | yes | yes — **and `firstDayOfWeek` must be `'Monday'`, capitalized**; `'monday'` answered `400 {"errors":{"firstDayOfWeek":"Invalid first day of week"}}`. An invited member's `timezone` is `""` and the PUT requires a real one. |
| A member with **no** country | invite and touch nothing | yes | yes |
| A member with `MemberProfile.country` | `setMemberProfile` (`helpers.ts:605`) | yes | **not run** — the probe proved the phone link and the absent link of the chain, not the profile link. Known Gaps below. |
| An organization country | `PUT /api/organizations/{orgId}/settings/country` | no — this spec adds it | This spec owes `setOrganizationCountryViaApi` in `e2e/tests/helpers.ts`. |
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
cd e2e && E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 \
  npx playwright test tests/zz-probe-vacation-calendar.spec.ts --workers=1 --retries=0
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
| The `MemberProfile.country` link of the chain | It is the link this spec puts *first*, and the probe exercised the second and third instead | An integration case seeding a profile country that disagrees with the phone country — TC-01-INT-12 is written for exactly that and is unrun until the code exists |
| A `cancelled` request drawing nothing | The cancel route ships and was not called | TC-01-INT-09 covers it |

## Test Cases

### TC-01-UNIT-01

- **Level:** Unit
- **Covers:** REQ-01-026, REQ-01-027, REQ-01-040
- **Steps:** Call the helper with each of: profile `PL` + phone `US` + org `BY`; profile `null` +
  phone `US` + org `BY`; profile `null` + phone `null` + org `BY`; all three `null`; profile `XX`
  (invalid) + phone `PL`; profile `"pl"` lowercase; profile `""` + phone `PL`.
- **Expected Result:** `PL`, `US`, `BY`, `null`, `PL`, `PL`, `PL`. An invalid or empty candidate is
  skipped rather than terminating the chain, and the result is always uppercase.

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
- **Steps:** Four members and three holidays on distinct dates — global, `PL`, `US`. Member A has
  `MemberProfile.country = 'PL'` and `phoneCountryCode = 'US'`; B has only
  `phoneCountryCode = 'US'`; C has neither and the organization country is `PL`; D has neither and
  the organization country is cleared first.
- **Expected Result:** A carries the global and the `PL` holiday — the profile wins over the phone.
  B carries the global and the `US` one. C carries the global and the `PL` one, by the
  organization fallback. D carries only the global one. Each member's `countryCode` in the response
  is `PL`, `US`, `PL`, `null` respectively.

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
- **Steps:** With a `PL` holiday in the window and a member who has no country of their own, read
  the calendar; set the organization country to `PL` as an admin; read it again.
- **Expected Result:** The first read gives that member no `holidayIds` entry for the `PL` day; the
  second does, with no other change to the response. Nothing was written to the membership — the
  chain is evaluated on read (Edge case 12).

### TC-01-INT-15

- **Level:** Integration
- **Covers:** REQ-01-035
- **Asserts:** `PUT /api/organizations/{orgId}/settings/country` → 403
  HOLIDAY_MESSAGES.countryForbidden
- **Steps:** As a `manager`, submit a country. Then as a `user`, submit one.
- **Expected Result:** `403` carrying `countryForbidden` for the manager — they can see the page,
  so the refusal names the action. `404` for the `user`, who fails the `ViewHolidays` gate first
  and must not learn the route exists.

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
- **Steps:** At an instant that is 2026-09-05 in `Pacific/Auckland` and still 2026-09-04 in
  `America/Los_Angeles`, read the calendar as a caller in each zone, and as one whose
  `Account.timezone` is unset.
- **Expected Result:** `range.today` is `2026-09-05`, `2026-09-04`, and the UTC day respectively.
  `days[]` is identical in all three — only the marker moves (Edge case 18).

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
- **Covers:** REQ-01-008, REQ-01-019
- **Steps:** Eight members. Open the calendar, click `calendar-scope-people`, pick four of them in
  `calendar-people-picker`, then click `calendar-window-2weeks`, then `calendar-next`, then
  `calendar-prev` twice, then `calendar-today`, then `calendar-window-week`.
- **Expected Result:** Exactly four rows throughout. The grid holds fourteen day-header cells
  under the fortnight preset and seven under the week preset, starting on the caller's
  `firstDayOfWeek`. `calendar-range-label` names the window at each step, `calendar-next` and
  `calendar-prev` move it by one whole window, and `calendar-today` returns it to the window
  containing today.
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
- **Covers:** REQ-01-033, REQ-01-035
- **Steps:** Seed a `PL` holiday and a member with no country of their own. As an `admin`, open
  Settings › Holidays, set the organization country to Poland, save, then open the calendar. Sign
  out and back in as a `manager`, and open Settings › Holidays again.
- **Expected Result:** The admin's save succeeds and that member's row then carries the `PL` day's
  per-cell holiday marker, which it did not before. For the manager, `org-country-select` renders
  the stored value read-only and `org-country-save` is not drawn at all — the control a role
  cannot use is not shown to them.
- **Selectors:** `org-country-select`, `org-country-save` (present for admin, absent for manager),
  `calendar-cell-holiday-{membershipId}-{date}`
