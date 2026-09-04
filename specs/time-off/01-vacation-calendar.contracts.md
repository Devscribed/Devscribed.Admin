# 01 — Vacation Calendar · Contracts

Tables only. The rules live in [01-vacation-calendar.md](01-vacation-calendar.md) and are named
here by id.

## Routes

| Route | Guards | Success | Errors |
|---|---|---|---|
| `GET /api/organizations/{orgId}/time-off/calendar` | `SessionGuard`, `OrgScopeGuard`, `RequireCapability('ViewTimeOffCalendar')` | `200` | `404` (no capability, REQ-01-002; wrong organization, REQ-01-039) · `422` `TIME_OFF_CALENDAR_MESSAGES.rangeRequired` · `422` `TIME_OFF_CALENDAR_MESSAGES.rangeInverted` · `422` `TIME_OFF_CALENDAR_MESSAGES.rangeTooWide` · `422` `TIME_OFF_CALENDAR_MESSAGES.teamsRequired` · `422` `TIME_OFF_CALENDAR_MESSAGES.peopleRequired` · `422` `TIME_OFF_CALENDAR_MESSAGES.scopeInvalid` · `422` `TIME_OFF_CALENDAR_MESSAGES.tooManyMembers` |
| `PUT /api/organizations/{orgId}/settings/country` | `SessionGuard`, `OrgScopeGuard`, `RequireCapability('ViewHolidays')` | `200` | `404` (no `ViewHolidays`; wrong organization) · `403` `HOLIDAY_MESSAGES.countryForbidden` (REQ-01-035) · `422` `HOLIDAY_MESSAGES.countryCodeInvalid` (REQ-01-036) |

The country write is guarded at `ViewHolidays` and refuses at `ManageOrganizationCountry` inside
the service, which is the shape `HolidaysService.remove` already uses for `DELETE /holidays/{id}`:
the view gate answers 404, the action gate answers 403 with the tabulated wording.

### `GET /api/organizations/{orgId}/time-off/calendar`

Query: `startDate` (ISO date, required) · `endDate` (ISO date, required) · `scope`
(`all` | `teams` | `people`, required) · `projectIds[]` (required when `scope=teams`; accepts the
literal `none`) · `memberIds[]` (required when `scope=people`).

```json
{
  "range": {
    "startDate": "2026-09-01",
    "endDate": "2026-09-30",
    "today": "2026-09-04",
    "timezone": "Europe/Warsaw"
  },
  "days": [
    { "date": "2026-09-01", "weekday": 2, "isWeekend": false, "isoWeek": 36 },
    { "date": "2026-09-05", "weekday": 6, "isWeekend": true, "isoWeek": 36 }
  ],
  "holidays": [
    {
      "id": "5fc81b30-bb0e-40dc-bbb2-b9814ea89566",
      "date": "2026-09-16",
      "name": "Polish National Day",
      "countryCode": "PL",
      "appliesToAllInView": false
    },
    {
      "id": "0d610054-c9a0-4638-a8d1-c6cc32169683",
      "date": "2026-09-21",
      "name": "Company Day",
      "countryCode": null,
      "appliesToAllInView": true
    }
  ],
  "members": [
    {
      "membershipId": "7e590f6e-cfe3-479d-85af-05558414df70",
      "displayName": "Ivan Demchenko",
      "jobTitle": "Senior Engineer",
      "countryCode": "PL",
      "holidayIds": ["5fc81b30-bb0e-40dc-bbb2-b9814ea89566", "0d610054-c9a0-4638-a8d1-c6cc32169683"],
      "absences": [
        {
          "id": "75ef1686-f562-42f4-8dd9-89563fbc535b",
          "kind": "vacation",
          "status": "approved",
          "startDate": "2026-09-14",
          "endDate": "2026-09-18",
          "workingDays": 5,
          "startsBeforeWindow": false,
          "endsAfterWindow": false
        }
      ]
    }
  ],
  "meta": { "scope": "all", "memberCount": 8 }
}
```

`holidayIds` is the resolution's output, not its input: the server applies REQ-01-026 through
REQ-01-029 and emits the holidays that reached each member, so the rule has one implementation.
`appliesToAllInView` is what REQ-01-030 and REQ-01-031 branch on, computed against the rows this
response carries and no others.

`countryCode` on a member row is the *resolved* value, and it is emitted so the header tooltip can
explain why a day is marked for one person and not their neighbour. `MemberProfile.country` is
`ViewMemberProfilePii`-gated as a profile field; it is read here server-side to run the chain and
is never emitted as a profile — the two-letter resolved code is the only thing that leaves.

### `PUT /api/organizations/{orgId}/settings/country`

Body: `{ "countryCode": "PL" }`, or `{ "countryCode": null }` to clear it (REQ-01-034).

```json
{ "countryCode": "PL" }
```

## Error Messages

| Export | Route | Message | New |
|---|---|---|---|
| `TIME_OFF_CALENDAR_MESSAGES.rangeRequired` | `GET /api/organizations/{orgId}/time-off/calendar` | Choose a start and an end date. | yes |
| `TIME_OFF_CALENDAR_MESSAGES.rangeInverted` | `GET /api/organizations/{orgId}/time-off/calendar` | The end date must be on or after the start date. | yes |
| `TIME_OFF_CALENDAR_MESSAGES.rangeTooWide` | `GET /api/organizations/{orgId}/time-off/calendar` | Choose a range of 92 days or fewer. | yes |
| `TIME_OFF_CALENDAR_MESSAGES.scopeInvalid` | `GET /api/organizations/{orgId}/time-off/calendar` | Choose All, Teams, or People. | yes |
| `TIME_OFF_CALENDAR_MESSAGES.teamsRequired` | `GET /api/organizations/{orgId}/time-off/calendar` | Choose at least one team. | yes |
| `TIME_OFF_CALENDAR_MESSAGES.peopleRequired` | `GET /api/organizations/{orgId}/time-off/calendar` | Choose at least one person. | yes |
| `TIME_OFF_CALENDAR_MESSAGES.tooManyMembers` | `GET /api/organizations/{orgId}/time-off/calendar` | This view covers more than 100 people. Narrow the scope to see the calendar. | yes |
| `TIME_OFF_CALENDAR_MESSAGES.emptyStateTitle` | — | Nobody to show | yes |
| `TIME_OFF_CALENDAR_MESSAGES.emptyStateBody` | — | No active member matches this scope. | yes |
| `HOLIDAY_MESSAGES.countryForbidden` | `PUT /api/organizations/{orgId}/settings/country` | You don't have permission to change the organization country. | yes |
| `HOLIDAY_MESSAGES.countryCodeInvalid` | `PUT /api/organizations/{orgId}/settings/country` | Enter a valid 2-letter country code. | no |

`HOLIDAY_MESSAGES.countryCodeInvalid` already ships
(`packages/validation/src/holiday-messages.ts`) and is reused unchanged; the country field on this
page is the same value the holiday rows carry, so a second wording for one rule would be the drift
this table exists to prevent.

## Data Model

### Columns added to existing entities

| Entity | Field | Type | Description |
|---|---|---|---|
| `Organization` | `countryCode` | `String?  @db.Char(2)` | ISO 3166-1 alpha-2, uppercase. The last link of the holiday-country chain (REQ-01-026). Nullable with no default, so every organization that predates the migration keeps today's behaviour exactly. |

No new table. No column is altered, renamed or dropped; the migration adds one nullable column,
which is what makes the deploy order in `infra/deploy.sh` irrelevant for this spec and a code
rollback safe without a database rollback.

### Shared code

| Export | File | What it is |
|---|---|---|
| `resolveMemberHolidayCountry(candidates)` | `packages/validation/src/reports.ts` | The chain of REQ-01-026 and REQ-01-027. Takes the three candidates in order, returns the first that normalizes, else `null`. |
| `isHolidayApplicableToMember(holiday, member)` | `packages/validation/src/reports.ts` | Already ships and is unchanged. It answers REQ-01-028 and REQ-01-029 given a resolved country. |
| `TIME_OFF_CALENDAR_MESSAGES` | a new module beside `packages/validation/src/holiday-messages.ts` | New message export, matching the one-file-per-area shape that module uses. |
| `ViewTimeOffCalendar`, `ManageOrganizationCountry` | `packages/validation/src/roles.ts` | Two new members of `Capability`, and their lowercase-dashed twins `view-time-off-calendar` and `manage-organization-country` in `MemberCapability`, matching every capability that came before them. |

**The call sites that must adopt `resolveMemberHolidayCountry`.** Each resolves a member's country
from `Account.phoneCountryCode` alone today and must pass the full chain instead, or REQ-01-026 is
true on one screen and false on the others:

| File | Where | What it resolves today |
|---|---|---|
| `apps/api/src/holidays/holidays.service.ts` | `normalizeResolvedCountry`, called on the `scope=mine` branch of the list read | The country behind the Time Tracking calendar's holiday markers |
| `apps/api/src/reports/reports.service.ts` | the caller's own membership load, Time Off `my` | The caller's country |
| `apps/api/src/reports/reports.service.ts` | the member roster load shared by Amounts Owed and Time & Activity | Every member's country |
| `apps/api/src/reports/reports.service.ts` | the membership country union behind the Time Off `organization_wide` group | The set of countries any covered member resolves to |

Each reads `account.phoneCountryCode ?? null`; each must call `resolveMemberHolidayCountry`
instead, with the profile and organization candidates loaded alongside.

## Validation Rules

| # | Field | Constraint | Message | Server-only |
|---|---|---|---|---|
| 1 | `startDate` | Required; ISO `YYYY-MM-DD` | `TIME_OFF_CALENDAR_MESSAGES.rangeRequired` | no |
| 2 | `endDate` | Required; ISO `YYYY-MM-DD` | `TIME_OFF_CALENDAR_MESSAGES.rangeRequired` | no |
| 3 | `endDate` | `>= startDate` | `TIME_OFF_CALENDAR_MESSAGES.rangeInverted` | no |
| 4 | `startDate`,`endDate` | Inclusive span ≤ 92 days | `TIME_OFF_CALENDAR_MESSAGES.rangeTooWide` | no |
| 5 | `scope` | One of `all`, `teams`, `people` | `TIME_OFF_CALENDAR_MESSAGES.scopeInvalid` | yes |
| 6 | `projectIds` | Non-empty when `scope=teams` | `TIME_OFF_CALENDAR_MESSAGES.teamsRequired` | no |
| 7 | `memberIds` | Non-empty when `scope=people` | `TIME_OFF_CALENDAR_MESSAGES.peopleRequired` | no |
| 8 | resolved rows | ≤ 100 | `TIME_OFF_CALENDAR_MESSAGES.tooManyMembers` | yes |
| 9 | `countryCode` | Empty, or exactly 2 letters normalizing to uppercase alpha-2 | `HOLIDAY_MESSAGES.countryCodeInvalid` | no |

The client validates 1–4, 6, 7 and 9 to keep the controls honest before a request is spent; the
server re-validates all nine, and 5 and 8 exist only on the server because neither is reachable
from a control the screen draws.

## Required data-testid Attributes

| id | Screen | Asserted |
|---|---|---|
| `nav-time-off-calendar` | App shell sidebar | present for admin/manager/user, `absent` for viewer |
| `time-off-calendar-page` | Calendar | present |
| `calendar-scope-all` | Calendar | present |
| `calendar-scope-teams` | Calendar | present |
| `calendar-scope-people` | Calendar | present |
| `calendar-teams-picker` | Calendar | present while `scope=teams` |
| `calendar-people-picker` | Calendar | present while `scope=people` |
| `calendar-window-week` | Calendar | present |
| `calendar-window-2weeks` | Calendar | present |
| `calendar-window-month` | Calendar | present |
| `calendar-prev` | Calendar | present |
| `calendar-next` | Calendar | present |
| `calendar-today` | Calendar | present |
| `calendar-range-label` | Calendar | present |
| `calendar-legend` | Calendar | present |
| `calendar-grid` | Calendar | present when at least one row resolves |
| `calendar-day-header-{date}` | Calendar | present per day in the window, `date` as `YYYY-MM-DD` |
| `calendar-day-holiday-{date}` | Calendar | present only on a whole-column holiday (REQ-01-030) |
| `calendar-member-row-{membershipId}` | Calendar | present per row, `absent` for a member outside the scope |
| `calendar-cell-holiday-{membershipId}-{date}` | Calendar | present on a partial holiday's own cells (REQ-01-031) |
| `calendar-absence-{vacationRequestId}` | Calendar | present for approved and pending, `absent` for rejected and cancelled |
| `calendar-empty-state` | Calendar | present when no row resolves |
| `calendar-error-banner` | Calendar | present on any `422` |
| `org-country-select` | Settings › Holidays | present for admin/manager |
| `org-country-save` | Settings › Holidays | present for admin, `absent` for manager |

## Screens

### `/org/{orgId}/time-off/calendar`

The visual acceptance target is [01-vacation-calendar.mock.html](01-vacation-calendar.mock.html),
whose three states are the three scopes. Structure, top to bottom:

```
┌ Page header ─────────────────────────────────────────────────────────────────┐
│ Time off calendar                              ‹  [Today]  ›  September 2026 │
│ Who is away, and when.                                                       │
├ Filter bar (ReportControls) ─────────────────────────────────────────────────┤
│ Scope [ All | Teams | People ]   Teams ▾   Window [ Week | 2 weeks | Month ] │
├ Legend ──────────────────────────────────────────────────────────────────────┤
│ ▨ approved   ▨ pending   ▨ public holiday   ▨ weekend   │ today             │
├ Grid ────────────────────────────────────────────────────────────────────────┤
│ MEMBER          │ W36              │ W37              │ W38            …     │
│                 │ Tu We Th Fr Sa Su│ Mo Tu We Th Fr Sa│ …                    │
│ ○ Ivan D.       │          ▓▓▓▓▓▓▓▓│                  │                      │
│   Senior Eng.   │                  │                  │                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

The filter bar is the design system's `ReportControls`
(`packages/ds/src/components/reports/ReportControls.tsx`) in its `scope` + children shape — the
same `<fieldset>` and clipped legend every report screen carries, so the row of controls is
announced as one group rather than as loose inputs. The range navigation sits in the page header's
right slot, where the Holidays page puts `+ Add holiday`.

The member column is `position: sticky; left: 0` so the names survive a horizontal scroll; it is
264px, and the day columns divide what is left.

### `/org/{orgId}/settings/holidays`

Gains one control above the existing country filter: a `Select` labelled **Organization country**,
with the hint *"Members without a country of their own get this country's holidays."* It is the
country picker the holiday form already uses. For a `manager` it renders read-only with no save
control (REQ-01-035); for a `user` or `viewer` the page itself is already a 404.

## UI Description

| Surface | Behaviour |
|---|---|
| Loading | The grid area holds a skeleton of the header rows plus six member rows; the filter bar stays interactive, so changing scope during a load is not blocked. |
| Empty (no rows) | `calendar-empty-state` replaces the grid, titled from `TIME_OFF_CALENDAR_MESSAGES.emptyStateTitle`. The filter bar stays. |
| Empty (no absences) | The full grid draws, every cell blank. No empty state — REQ-01-038. |
| Refused (422) | `calendar-error-banner` above the grid carries the message; the last good grid stays on screen underneath rather than being cleared. |
| Permission-limited | A `viewer` never reaches the route and never sees the nav row; a `manager` sees the organization country and cannot save it. |
| Narrow viewport | Below `--layout-breakpoint-desktop` the grid scrolls horizontally inside its own container; the member column stays pinned and the page body never scrolls sideways. |
| Keyboard | The three scope buttons and the three window buttons are one roving-tabindex group each. Each absence band is a button carrying its dates, status and working-day count as its accessible name. |

## Edge Cases

| # | Situation | Exact behaviour |
|---|---|---|
| 1 | A vacation starts before the window and ends inside it | The band draws from the window's first column with `startsBeforeWindow: true`, and its accessible name carries the true start date (REQ-01-022). |
| 2 | A vacation covers the whole window | One band spans every column, both edge flags true. |
| 3 | A vacation is entirely outside the window | No band is returned for it. |
| 4 | A member is on two of the ticked projects | One row, not two — the Teams scope is a union over memberships (REQ-01-006). |
| 5 | `scope=teams` names only archived projects | Their `ProjectMember` rows still resolve, so the members draw; archiving hides a project from selectors, it does not unassign anybody. |
| 6 | `scope=teams` ticks `none` and a project | Both sets are returned, duplicates collapsed to one row each. |
| 7 | `scope=people` names a member removed after the picker was opened | The row is dropped (REQ-01-011); the remaining rows draw and no error is raised. |
| 8 | `scope=people` names 100 members and the caller adds one more | `422` `TIME_OFF_CALENDAR_MESSAGES.tooManyMembers`; the previous grid stays on screen. |
| 9 | Two holidays fall on one date, one global and one `PL` | Both appear in `holidays[]`; a `PL` member carries both ids, everybody else carries the global one. The column shades whole only if the union reaches every row. |
| 10 | A member's `MemberProfile.country` is `"XX"` and their phone country is `"PL"` | `"XX"` does not normalize, so the chain skips it and resolves `PL` (REQ-01-027). |
| 11 | A member's profile country is `"pl"` lowercase | Normalizes to `PL` and matches the `PL` holiday (REQ-01-028 is case-insensitive). |
| 12 | The organization country is set while a calendar is open | The next fetch reflects it; nothing is pushed. The rule is evaluated on read, so no job has to have run for the answer to be right. |
| 13 | A holiday is deleted between two fetches | The second fetch omits it. Nothing on this screen is cached across a range change. |
| 14 | `startDate` equals `endDate` | A one-column grid. Valid, and the `Week` preset is simply not what produced it. |
| 15 | The window crosses a year boundary | Allowed — the 92-day bound is the only limit, and ISO week numbers restart correctly across it. |
| 16 | A member has an approved and a pending request that touch but do not overlap | Two bands, adjacent, visually separated by their own 3px margins. |
| 17 | Two non-cancelled requests overlap for one member | Impossible through the product — spec `user-management/09` refuses an overlapping submission. If such a pair exists in the data, both bands draw stacked and neither is hidden, so the anomaly is visible rather than silently resolved. |
| 18 | The caller has no `Account.timezone` | Today's marker falls back to UTC; every other date is a calendar day and is unaffected (REQ-01-017). |
| 19 | An admin clears the organization country while members rely on it | Those members fall back to `null` on the next read and see only global holidays. No stored value changes; the chain is evaluated on read. |
| 20 | A `manager` submits a country through the API directly | `403` `HOLIDAY_MESSAGES.countryForbidden` — the read-only rendering is a convenience, the refusal is the gate (REQ-01-035). |

## Security

- **Org scoping.** Every query filters by `session.organizationId`, never by the path `orgId`.
  `projectIds` and `memberIds` are intersected with the session's organization before they reach a
  `where` clause, so a foreign id is dropped rather than answered (REQ-01-010).
- **Unknown and unauthorized are identical.** A caller without `ViewTimeOffCalendar`, and a caller
  naming another organization, both get a bare `404` with no body distinguishing them.
- **No money leaves this endpoint.** `deductionAmount`, the reserve balance, `monthlySalary` and
  the reserve percentage appear nowhere in the response. The calendar reads
  `VacationRequest.workingDays` and nothing else from the vacation tables, which is what keeps it
  clear of the financial capabilities entirely.
- **PII stays server-side.** `MemberProfile.country` is read to run the country chain and is never
  emitted; the two-letter resolved code that is emitted is not the profile field and does not
  imply an address.
- **The write is narrower than the read.** `ViewHolidays` opens the country field, and
  `ManageOrganizationCountry` — admin only — is what changes it, because the value moves what
  Amounts Owed pays for every member without a country of their own.
- **No new outbound calls, no new secrets, no new AWS resources.**
