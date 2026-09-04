# 01 — Vacation Calendar · Contracts

Tables only. The rules live in [01-vacation-calendar.md](01-vacation-calendar.md) and are named
here by id.

## Routes

| Route | Guards | Success | Errors |
|---|---|---|---|
| `GET /api/organizations/{orgId}/time-off/calendar` | `SessionGuard`, `OrgScopeGuard`; `can(normalizeRole(role), 'view-time-off-calendar')` checked in the service | `200` | `404` (no capability, REQ-01-002; wrong organization, REQ-01-039) · `422` `TIME_OFF_CALENDAR_MESSAGES.rangeRequired` · `422` `TIME_OFF_CALENDAR_MESSAGES.rangeInverted` · `422` `TIME_OFF_CALENDAR_MESSAGES.rangeTooWide` · `422` `TIME_OFF_CALENDAR_MESSAGES.teamsRequired` · `422` `TIME_OFF_CALENDAR_MESSAGES.peopleRequired` · `422` `TIME_OFF_CALENDAR_MESSAGES.scopeInvalid` · `422` `TIME_OFF_CALENDAR_MESSAGES.tooManyMembers` |
| `GET /api/organizations/{orgId}/settings/country` | `SessionGuard`, `OrgScopeGuard`; `ViewHolidays` checked in the service | `200` | `404` (no `ViewHolidays`, REQ-01-046; wrong organization) |
| `PUT /api/organizations/{orgId}/settings/country` | `SessionGuard`, `OrgScopeGuard`; `ManageHolidays` checked in the service | `200` | `404` (no `ManageHolidays`, REQ-01-035; wrong organization) · `422` `HOLIDAY_MESSAGES.countryCodeInvalid` (REQ-01-036) |
| `GET /api/organizations/{orgId}/members/{memberId}` | `SessionGuard`, `OrgScopeGuard`; no capability gates this read — it answers every role (REQ-01-045) | `200` | `403` `MEMBER_MESSAGES.viewForbidden` (the caller is no longer an active member; shipped, unchanged) · `404` (wrong organization; member not found) |
| `PUT /api/organizations/{orgId}/members/{memberId}` | `SessionGuard`, `OrgScopeGuard`; `edit-detail` checked in the service | `200` | `403` `MEMBER_MESSAGES.editForbidden` (REQ-01-044) · `400` `HOLIDAY_MESSAGES.countryCodeInvalid` (REQ-01-051) · `404` (wrong organization) |
| `GET /api/organizations/{orgId}/holidays` | `SessionGuard`, `OrgScopeGuard`; `scope=mine` answers every active member, and any other scope needs `ViewHolidays`, checked in the service | `200` | `404` (no `ViewHolidays` on a scope other than `mine`; wrong organization) |

The last row is the shipped holiday list, unchanged in path, guards, body and status. It is here
because its `scope=mine` branch answers REQ-01-026's chain after this spec and a phone country
before it, and a rule that is true on the calendar and false on the holiday list beside it is the
divergence this table exists to prevent (TC-01-INT-29).

No route here carries `RequireCapability`. `CapabilityGuard` answers every refusal with `403`, and
the calendar must answer `404` when the caller lacks its capability, so the check runs in the
service instead — the shape `HolidaysService.requireViewCapability` and `requireManageCapability`
already use, each answering a bare `NotFoundException`. The calendar's check is handed the
normalized role, so a membership still storing `member` is read as `user`, is answered `200`, and
is drawn the sidebar row `hasCapability(role, 'ViewTimeOffCalendar')` gates (REQ-01-003).

**Decided:** 404 for the calendar and for both halves of the organization country. The calendar's
refusal must be byte-identical to a wrong-organization read (REQ-01-002, REQ-01-039), and
`view-holidays` and `manage-holidays` already answer 404 on the holiday list, create and edit the
country control sits beside. **The member country is the exception and keeps its route's existing 403** —
`PUT .../members/{memberId}` ships that refusal today for role and job title, and one route does
not get two refusal shapes because a field was added to it. Its field failures are `400` today —
an invalid role and an invalid job title both are — and `countryCode` joins them at `400`
(REQ-01-051) rather than at the `422` the organization country write answers (REQ-01-036).

**The member rows are existing routes.** The read gains `countryCode` in its projection and the
write gains it in its body; neither changes in any other way — same guards, same statuses, same
messages for everything they already carry. The read's projection is explicit
(`MembersService.getDetail` builds it field by field), which is why the field has to be added to
it rather than assumed to ride along.

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
    { "date": "2026-09-01", "isWeekend": false, "isoWeek": 36 },
    { "date": "2026-09-05", "isWeekend": true, "isoWeek": 36 }
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
  "meta": { "scope": "all", "memberCount": 1 }
}
```

`meta.memberCount` is the number of rows in `members[]` and nothing else; a refused read carries
no body to count (REQ-01-013).

`holidays[]` carries every holiday dated inside the window and no other, whatever country it
names. **Decided:** the window, not the organization's whole holiday set — a row the grid draws
no column for is a row nothing on this screen can place, and `appliesToAllInView` would have to
be answered for it anyway.

`holidayIds` is the resolution's output, not its input: the server applies REQ-01-026 through
REQ-01-029 and emits the holidays that reached each member, so the rule has one implementation.
`appliesToAllInView` is what REQ-01-030 and REQ-01-031 branch on, computed against the rows this
response carries and no others.

`countryCode` on a member row is the *resolved* value — the member's own, or the organization's
where they have none — and it is emitted so the header tooltip can explain why a day is marked
for one person and not their neighbour. It is not a profile field: `MemberProfile.country` is a
postal address behind `ViewMemberProfilePii` and this feature never reads it, so nothing here
discloses where anybody lives.

### `GET /api/organizations/{orgId}/settings/country`

The stored value and nothing else — the page needs it to paint the picker, and this is the whole
of what it needs (REQ-01-046). `null` is an organization for which nobody has stated a country.

```json
{ "countryCode": "PL" }
```

### `PUT /api/organizations/{orgId}/settings/country`

Body: `{ "countryCode": "PL" }`, or `{ "countryCode": null }` to clear it (REQ-01-034). The
response is the body of the `GET` above, carrying the value now stored.

```json
{ "countryCode": "PL" }
```

### `GET /api/organizations/{orgId}/members/{memberId}`

The shipped projection gains one field (REQ-01-045). Everything else it returns is unchanged.

```json
{
  "id": "7e590f6e-cfe3-479d-85af-05558414df70",
  "fullName": "Ivan Demchenko",
  "role": "user",
  "jobTitle": "Senior Engineer",
  "countryCode": null
}
```

`countryCode` is the **stored** value, not the resolved one — `null` means "use the
organization's" and is what the picker's default option renders.

### `PUT /api/organizations/{orgId}/members/{memberId}`

The shipped body gains `countryCode` beside the `role` and `jobTitle` it already takes
(REQ-01-042, REQ-01-043).

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
| `TIME_OFF_CALENDAR_MESSAGES.orgCountryHint` | — | Members without a country of their own get this country's holidays. | yes |
| `TIME_OFF_CALENDAR_MESSAGES.memberCountryDefaultOption` | — | Use the organization's country | yes |
| `HOLIDAY_MESSAGES.countryCodeInvalid` | `PUT /api/organizations/{orgId}/settings/country`, `PUT /api/organizations/{orgId}/members/{memberId}` | Country code must be 2 uppercase letters. | no |
| `MEMBER_MESSAGES.editForbidden` | `PUT /api/organizations/{orgId}/members/{memberId}` | You do not have permission to edit members | no |
| `MEMBER_MESSAGES.viewForbidden` | `GET /api/organizations/{orgId}/members/{memberId}` | You do not have permission to view this member | no |

`HOLIDAY_MESSAGES.countryCodeInvalid` already ships
(`packages/validation/src/holiday-messages.ts`) and is reused unchanged; the country field on this
page is the same value the holiday rows carry, so a second wording for one rule would be the drift
this table exists to prevent.

## Data Model

### Columns added to existing entities

| Entity | Field | Type | Description |
|---|---|---|---|
| `Membership` | `countryCode` | `String?  @db.Char(2)` | ISO 3166-1 alpha-2, uppercase. The first link of the holiday-country chain (REQ-01-026), set by an admin or manager on the member's screen. Nullable with no default; `null` means "use the organization's". |
| `Organization` | `countryCode` | `String?  @db.Char(2)` | ISO 3166-1 alpha-2, uppercase. The second link, and the one that covers every member nobody has stated a country for. Nullable with no default. |

No new table. No column is altered, renamed or dropped; the migration adds only the nullable
columns above,
which is what makes the deploy order in `infra/deploy.sh` irrelevant for this spec and a code
rollback safe without a database rollback.

### Shared code

| Export | File | What it is |
|---|---|---|
| `resolveMemberHolidayCountry(membershipCountry, organizationCountry)` | `packages/validation/src/reports.ts` | The chain of REQ-01-026, REQ-01-027 and REQ-01-040. Returns the membership's country when it normalizes, else the organization's when it does, else `null`. Both arguments are required and neither has a default, so a caller that forgets the organization gets `null` rather than a silently wrong country. |
| `isHolidayApplicableToMember(holiday, member)` | `packages/validation/src/reports.ts` | Already ships and is unchanged. It answers REQ-01-028 and REQ-01-029 given a resolved country. |
| `TIME_OFF_CALENDAR_MESSAGES` | a new module beside `packages/validation/src/holiday-messages.ts` | New message export, matching the one-file-per-area shape that module uses. |
| `ViewTimeOffCalendar` | `packages/validation/src/roles.ts` | One new member of `Capability`, granted to admin, manager and user in `ROLE_CAPABILITIES`. Neither country write adds a capability: `ManageHolidays` and `edit-detail` already grant exactly the admin and manager who set them. |
| `view-time-off-calendar` | `packages/validation/src/index.ts` | The lowercase-dashed twin in `MemberCapability`, and the spelling the calendar's own gate reads through `can(role, …)`. `CAPABILITY_MATRIX` is a boolean per role per capability, so the twin is written into all four role rows: `true` for admin, manager and user, `false` for viewer. |

**The call sites that must adopt `resolveMemberHolidayCountry`.** Each resolves a member's country
from `Account.phoneCountryCode` today and must read the stated columns instead, or REQ-01-026 is
true on one screen and false on the others:

| File | Where | What it resolves today |
|---|---|---|
| `apps/api/src/holidays/holidays.service.ts` | `normalizeResolvedCountry`, called on the `scope=mine` branch of the list read | The country behind the Time Tracking calendar's holiday markers |
| `apps/api/src/reports/reports.service.ts` | the caller's own membership load, Time Off `my` | The caller's country |
| `apps/api/src/reports/reports.service.ts` | the member roster load shared by Amounts Owed and Time & Activity | Every member's country |
| `apps/api/src/reports/reports.service.ts` | the membership country union behind the Time Off `organization_wide` group | The set of countries any covered member resolves to |

Each reads `account.phoneCountryCode ?? null`; each must call `resolveMemberHolidayCountry`
instead, loading `Membership.countryCode` and the organization's country alongside. **No call
site keeps a phone-country read.** The column stays on `Account` for the phone field that owns
it, and nothing about holidays consults it again.

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
| 9 | `countryCode` (either PUT body) | Empty, or exactly 2 uppercase letters | `HOLIDAY_MESSAGES.countryCodeInvalid` | no |

**Decided:** the rules are evaluated in the order this table numbers them and the **first**
failure is the whole answer, so a request that is both inverted and scoped `everyone` is refused
with `rangeInverted` and nothing else. Rejected: collecting every failure into one body, which
the calendar's banner draws one message from regardless.

The client validates 1–4, 6, 7 and 9 to keep the controls honest before a request is spent; the
server re-validates all nine, and 5 and 8 exist only on the server because neither is reachable
from a control the screen draws. Rule 9 carries one message and two statuses: `422` on the
organization country write (REQ-01-036), `400` on the member write (REQ-01-051), which is the
status that route already refuses an invalid role and an invalid job title with.

**Decided:** rule 9 refuses `pl` rather than upcasing it, which is what the holiday rows' country
validator already does and what keeps the stored value the one their uniqueness index compares.
Normalizing on the write was rejected: it would give one value two behaviours, on the holiday
form and on the country field beside it. The read is deliberately more forgiving than the write —
REQ-01-026 upcases whatever it finds in either column — because a lowercase value can still reach
a column through a migration or a direct write, and a holiday silently not applying is worse than
a value quietly accepted.

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
| `org-country-select` | Settings › Holidays | present for admin and manager |
| `org-country-save` | Settings › Holidays | present for admin and manager |
| `member-country-select` | Member detail › About | present for admin and manager |

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

`calendar-teams-picker` lists an **Unassigned** entry above the projects, which submits the
sentinel `projectIds=none` (REQ-01-007). It ticks and unticks like a project and may be the only
entry ticked — `none` alone is a selection, so REQ-01-009 does not refuse it.

The filter bar is the design system's `ReportControls`
(`packages/ds/src/components/reports/ReportControls.tsx`) in its `scope` + children shape — the
same `<fieldset>` and clipped legend every report screen carries, so the row of controls is
announced as one group rather than as loose inputs. The six segments inside it — the three
`calendar-scope-*` and the three `calendar-window-*` — are two `ToggleButton`s, the design
system's segmented control, which draws its own `--radius-pill` track, gives the chosen segment
`--shadow-toggle-active`, and takes a `data-testid` per segment. The calendar draws no segmented
control of its own. The range navigation sits in the page header's right slot, where the Holidays
page puts `+ Add holiday`.

The member column is `position: sticky; left: 0` so the names survive a horizontal scroll; it is
264px — a width no token carries, recorded in DS gaps below — and the day columns divide what is
left.

### `/org/{orgId}/settings/holidays`

Gains one control above the existing country filter: a `Select` labelled **Organization country**,
hinted from `TIME_OFF_CALENDAR_MESSAGES.orgCountryHint`. It is the country picker the holiday form
already uses. Its value on first paint is `GET .../settings/country` (REQ-01-046), called when the
page loads beside the holiday list it already fetches. Admin and manager both set it (REQ-01-033);
for a `user` or `viewer` the page itself is already a 404, so there is no read-only rendering to
draw.

### `/org/{orgId}/members/{memberId}` — About

Gains one control in the block that already holds the role picker and the job title: a `Select`
labelled **Country**, whose first option is labelled from
`TIME_OFF_CALENDAR_MESSAGES.memberCountryDefaultOption` and means *the organization's country* —
which is what `null` stores and what a member gets when nobody states one. It saves through the member
update the screen already submits — no new form, no second save button.

## UI Description

| Surface | Behaviour |
|---|---|
| Loading | The grid area holds a skeleton of the header rows plus six member rows; the filter bar stays interactive, so changing scope during a load is not blocked. No case: the skeleton lives between two paints, and an assertion on it races the fetch it is waiting for. |
| Empty (no rows) | `calendar-empty-state` replaces the grid, titled from `TIME_OFF_CALENDAR_MESSAGES.emptyStateTitle`. The filter bar stays. |
| Empty (no absences) | The full grid draws, every cell blank. No empty state — REQ-01-038. |
| Refused (422) | `calendar-error-banner` above the grid carries the message; the last good grid stays on screen underneath rather than being cleared. |
| Permission-limited | A `viewer` never reaches the calendar route and never sees the nav row. The two country pickers are refused differently, because the pages holding them are. Settings › Holidays is already a `404` for a `user` and a `viewer`, so there is nothing to draw there. Member detail is open to every role, so a caller without `edit-detail` opens the About tab and simply does not get the control — the block renders as it does today, with the role and job title read-only beside it. No role sees either country read-only: the field is in the response for everybody (REQ-01-045), and the picker is drawn only for a caller who may save it. |
| Narrow viewport | Below `--layout-breakpoint-desktop` the grid scrolls horizontally inside its own container; the member column stays pinned and the page body never scrolls sideways. No case: the scroll container and the pinned column are CSS on one element, with no behaviour and no second markup behind the breakpoint. |
| Keyboard | The scope segments and the window segments are one roving-tabindex group each, which is the `ToggleButton` they are drawn with. Each absence band is a button carrying its dates, status and working-day count as its accessible name. No case for the two groups: the tab stop and the arrow keys ship with the component. The band's accessible name is asserted in TC-01-E2E-01. |

## DS gaps

`@ds` carries none of what the rows below name. Each row says what ships in its place — a name the
mock declares in its own `:root`, or a literal marked `@literal` where there is no name to declare.
Recording them here is what the design-system rule requires; whether they enter `@ds` this release
is a product call, and until they do the calendar is the only screen that may declare them.

| Gap | Where it bites | What ships instead | What closes it |
|---|---|---|---|
| No absence-band colour | The approved band's fill and border, the pending band's hatch and dashed border, and the band label — every one of them on the calendar grid, plus the legend's two swatches | `--surface-timeoff-band`, `--border-timeoff-band` and `--text-timeoff-band`, declared once on the calendar page's own root and read through `var(…)` wherever a band, its border, its hatch or its label is drawn, so no colour on this screen is written as a literal. Violet, which none of `--status-success`, `--status-warning`, `--status-error`, `--status-info` or `--color-holiday` uses, so a band reads as a category and not as a claim about how somebody is doing | The three names entering `@ds` as time-off category tokens, and the page's local block deleted in the same change. The policy catalogue of a later spec wants a colour per absence type, and this is the first of that set |
| No sticky-column width token | The grid's member column, in the header rows and every member row | `--name-col: 264px`, declared beside the three above and referenced by every row's `grid-template-columns` | A layout token in `@ds` for a pinned first column, which the reports tables would take as well |
| No step below `--space-1` (4px) | The 3px margin on each side of a band, which is what separates two adjacent bands (Edge case 16), and the 3px stripe of the pending hatch in the legend swatch | Both stay as `3px`, each carrying `@literal` and the reason the design-system rule asks for: 4px between two adjacent bands eats the day column they must stay inside | A sub-`--space-1` step in `@ds`, or a band-gap token beside the three colours above |

**Decided:** the band's height is `--space-10`, the legend swatch's corner is `--radius-s`, and
the two segmented controls are `ToggleButton` with the track, the pill and the shadow that
component owns — none of the three is written as a number on this page. Rejected: a segmented
control drawn here, which would put a second shadow colour beside the package's and a second
keyboard beside its roving tab stop.

## Edge Cases

| # | Situation | Exact behaviour |
|---|---|---|
| 1 | A vacation starts before the window and ends inside it | The band draws from the window's first column with `startsBeforeWindow: true`, and its accessible name carries the true start date (REQ-01-022). |
| 2 | A vacation starts before the window and ends after it | One band spans every column, both edge flags true (REQ-01-022). No case of its own: TC-01-INT-10 walks the same clipping rule with one edge outside, and the second edge is that branch again. |
| 3 | A vacation is entirely outside the window | No band is returned for it (TC-01-INT-09). |
| 4 | A member is on two of the ticked projects | One row, not two — the Teams scope is a union over memberships (REQ-01-006). |
| 5 | `scope=teams` names only archived projects | Their `ProjectMember` rows still resolve, so the members draw; archiving hides a project from selectors, it does not unassign anybody. No case of its own: the named-project branch of REQ-01-006 never consults the archived flag, so this is TC-01-INT-05 again. Only the `none` bucket of REQ-01-007 reads that flag. |
| 6 | `scope=teams` ticks `none` and a project | Both sets are returned, duplicates collapsed to one row each. |
| 7 | `scope=people` names a member removed after the picker was opened | The row is dropped (REQ-01-011); the remaining rows draw and no error is raised. |
| 8 | `scope=people` names 100 members and the caller adds one more | `422` `TIME_OFF_CALENDAR_MESSAGES.tooManyMembers`; the previous grid stays on screen. |
| 9 | Two holidays fall on one date, one global and one `PL` | Both appear in `holidays[]`; a `PL` member carries both ids, everybody else carries the global one. `appliesToAllInView` is answered per holiday, not per date, so the column shades whole on the global one alone (TC-01-INT-13). |
| 10 | A member's stored `Membership.countryCode` is `"XX"` and the organization's is `"PL"` | `"XX"` does not normalize, so the chain skips it and resolves `PL` (REQ-01-027). A value that shape cannot come from the picker; it can come from a migration or a direct write. |
| 11 | A member's stored country is `"pl"` lowercase | The write refuses it (Validation Rule 9), so it can only be there from a direct write; the read upcases it and it matches the `PL` holiday (REQ-01-028 is case-insensitive). |
| 12 | The organization country is set while a calendar is open | The next fetch reflects it; nothing is pushed. The rule is evaluated on read, so no job has to have run for the answer to be right. |
| 13 | A holiday is deleted between two fetches | The second fetch omits it. Nothing on this screen is cached across a range change. No case of its own: the second fetch is an ordinary read, and the deletion is `organization/03`'s own rule. |
| 14 | `startDate` equals `endDate` | A one-column grid. Valid, and the `Week` preset is simply not what produced it. |
| 15 | The window crosses a year boundary | Allowed — the 92-day bound is the only limit, and ISO week numbers restart correctly across it (TC-01-INT-16). |
| 16 | A member has an approved and a pending request that touch but do not overlap | Two bands, adjacent, visually separated by their own 3px margins — the literal recorded in DS gaps above. No case of its own: the margin is a static style every band carries, not a rule this pair reaches, and TC-01-E2E-01 already draws the two treatments that would have to differ for it to matter. |
| 17 | Two non-cancelled requests overlap for one member | Impossible through the product — spec `user-management/09` refuses an overlapping submission. If such a pair exists in the data, both bands draw stacked and neither is hidden, so the anomaly is visible rather than silently resolved. No case: the state cannot be reached through any route the cases call. |
| 18 | The caller's `Account.timezone` is `null`, `""`, or a string the server does not recognize | Today's marker falls back to UTC in all three (REQ-01-018); every other date is a calendar day and is unaffected (REQ-01-017). The stored column is `null` until a member sets one; the account-settings read is what projects that as `""`, which is why both spellings are in this row. |
| 19 | An admin clears the organization country while members rely on it | Those members fall back to `null` on the next read and see only global holidays. No stored value changes; the chain is evaluated on read. |
| 20 | A `user` submits an organization country through the API directly | `404` — `manage-holidays` refuses it the way it refuses a holiday create, and the caller learns nothing about the route (REQ-01-035). |

## Security

- **Org scoping.** Every query filters by `session.organizationId`, never by the path `orgId`.
  `projectIds` and `memberIds` are intersected with the session's organization before they reach a
  `where` clause, so a foreign id is dropped rather than answered (REQ-01-010).
- **Unknown and unauthorized are identical.** A caller without `ViewTimeOffCalendar`, and a caller
  naming another organization, both get a bare `404` with no body distinguishing them.
- **No money leaves this endpoint.** `deductionAmount`, the reserve balance, `monthlySalary` and
  the reserve percentage appear nowhere in the response. The calendar reads
  `VacationRequest.workingDays` and nothing else from the vacation tables, which is what keeps it
  clear of the financial capabilities entirely. TC-01-INT-01 asserts the absence over a whole
  body.
- **No PII is read or emitted.** The country a member is paid holidays for is a stated field on
  their membership, not their postal address: `MemberProfile.country` sits behind
  `ViewMemberProfilePii` and this feature never touches it. The two-letter code the calendar
  emits is the holiday country and implies nothing about where anybody lives. TC-01-INT-01
  asserts that too, on the same body.
- **The write is narrower than the read.** `ViewHolidays` opens the country field, and
  `ManageHolidays` is what changes it, because the value moves what Amounts Owed pays for every
  member nobody has stated a country for. A member's own country is gated by `edit-detail`, the
  capability that already governs their role and job title.
- **No new outbound calls, no new secrets, no new AWS resources.**
