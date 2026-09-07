# Calendar range and scope defaults — contracts

Rules live in [03-calendar-range-and-scope.md](03-calendar-range-and-scope.md) and are referenced
here by id.

## Routes

| Route | Guards | Success | Errors |
|---|---|---|---|
| `GET /api/organizations/{orgId}/time-off/calendar` | `SessionGuard`, `OrgScopeGuard`; `can(normalizeRole(role), 'view-time-off-calendar')` checked in the service | `200` | `404` (no capability; wrong organization) · `422` `TIME_OFF_CALENDAR_MESSAGES.rangeRequired` · `422` `TIME_OFF_CALENDAR_MESSAGES.rangeInverted` · `422` `TIME_OFF_CALENDAR_MESSAGES.rangeTooWide` · `422` `TIME_OFF_CALENDAR_MESSAGES.scopeInvalid` · `422` `TIME_OFF_CALENDAR_MESSAGES.tooManyMembers` |

**What changed, and what the whole route is.** Two refusals leave this row: `422 teamsRequired`
and `422 peopleRequired` (REQ-03-003). The row above is the complete contract after that removal,
written out rather than described as a difference: `SessionGuard` attaches the session and
re-reads `Account.securityStamp`, so a rotated stamp answers `401` on the next call;
`OrgScopeGuard` answers `404` when the path `orgId` disagrees with the session; the service
answers `404` when the caller's normalized role does not hold `view-time-off-calendar`; a caller
that passes all three gets `200`, or one of five `422`s. **`404`, never `403`, for both the
capability and the organization** — the two are answered identically so that neither confirms the
other's existence. The query string takes `startDate`, `endDate`, `scope`, and repeated
`projectIds` / `memberIds`. **No route is added and no response body changes shape.**

### `GET /api/organizations/{orgId}/time-off/calendar`

```json
{
  "range": { "startDate": "2026-09-07", "endDate": "2026-09-20", "today": "2026-09-07", "timezone": "Europe/Warsaw" },
  "days": [{ "date": "2026-09-07", "isWeekend": false, "isoWeek": 37 }],
  "holidays": [{ "id": "…", "date": "2026-11-11", "name": "Independence Day", "countryCode": "PL", "appliesToAllInView": true }],
  "members": [
    {
      "membershipId": "…",
      "displayName": "Alex Kaminski",
      "jobTitle": "Engineer",
      "countryCode": "PL",
      "holidayIds": ["…"],
      "absences": [
        {
          "id": "…",
          "kind": "vacation",
          "status": "approved",
          "startDate": "2026-09-10",
          "endDate": "2026-09-15",
          "workingDays": 4,
          "startsBeforeWindow": false,
          "endsAfterWindow": false
        }
      ]
    }
  ],
  "meta": { "scope": "teams", "memberCount": 12 }
}
```

`meta.scope` echoes the scope that was asked for, unchanged — an empty `teams` selection reports
`"teams"`, not `"all"`, because the reader chose the scope and the response is not the place to
second-guess it.

## Error Messages

| Export | Route | Message | New |
|---|---|---|---|
| `TIME_OFF_CALENDAR_MESSAGES.rangeRequired` | `GET /api/organizations/{orgId}/time-off/calendar` | Choose a start and an end date. | no |
| `TIME_OFF_CALENDAR_MESSAGES.rangeInverted` | `GET /api/organizations/{orgId}/time-off/calendar` | The end date must be on or after the start date. | no |
| `TIME_OFF_CALENDAR_MESSAGES.rangeTooWide` | `GET /api/organizations/{orgId}/time-off/calendar` | Choose a range of 92 days or fewer. | no |
| `TIME_OFF_CALENDAR_MESSAGES.scopeInvalid` | `GET /api/organizations/{orgId}/time-off/calendar` | Choose All, Teams, or People. | no |
| `TIME_OFF_CALENDAR_MESSAGES.tooManyMembers` | `GET /api/organizations/{orgId}/time-off/calendar` | This view covers more than 100 people. Narrow the scope to see the calendar. | no |
| `TIME_OFF_CALENDAR_MESSAGES.emptyStateTitle` | — | Nobody to show | no |
| `TIME_OFF_CALENDAR_MESSAGES.emptyStateBody` | — | No active member matches this scope. | no |

### Withdrawn

| Export | Was emitted by | Why it goes |
|---|---|---|
| `TIME_OFF_CALENDAR_MESSAGES.teamsRequired` | `GET /api/organizations/{orgId}/time-off/calendar` | REQ-03-001 — an empty Teams selection is no longer a refusal |
| `TIME_OFF_CALENDAR_MESSAGES.peopleRequired` | `GET /api/organizations/{orgId}/time-off/calendar` | REQ-03-002 — an empty People selection is no longer a refusal |

Both are deleted from `packages/validation`, not left unreferenced. Any import of either stops
compiling, which is the mechanism that finds every screen that drew them.

## Data Model

**No entity is added, no column is added, and no migration is written.** The custom range is two
query parameters the route already accepts; the scope change removes two refusals from a service
method. `Holiday`, `VacationRequest`, `Membership`, `Project` and `ProjectMember` are read
exactly as `time-off/01` reads them.

## Validation Rules

| # | Field | Constraint | Message | Server-only |
|---|---|---|---|---|
| 1 | `startDate`, `endDate` | Both present, each `YYYY-MM-DD` | `rangeRequired` | no |
| 2 | `startDate`, `endDate` | `endDate >= startDate` | `rangeInverted` | no |
| 3 | `startDate`, `endDate` | Span at most `TIME_OFF_CALENDAR_MAX_RANGE_DAYS` (92) inclusive | `rangeTooWide` | no |
| 4 | `scope` | One of `all`, `teams`, `people`; absent or unrecognized is refused, never defaulted | `scopeInvalid` | no |
| 5 | rows resolved | At most 100 | `tooManyMembers` | yes |
| 6 | `projectIds` | **No constraint.** Empty means no narrowing (REQ-03-001) | — | — |
| 7 | `memberIds` | **No constraint.** Empty means no narrowing (REQ-03-002) | — | — |

Rules 6 and 7 previously required a non-empty selection under their scope; both are now the
absence of a rule, and are kept in the table as numbered rows so that a reader of the shipped
validation module finds an answer where a rule used to be rather than a gap.

The client re-runs rules 1–4 before spending a request; the server re-validates all seven,
including the two that now constrain nothing. Rule 5 is server-only — the client cannot know how
many rows a scope resolves to until it asks.

## Required data-testid Attributes

| id | Screen | Asserted |
|---|---|---|
| `calendar-window-range` | Calendar | present |
| `calendar-range-picker` | Calendar | present while the **Range** window is active, `absent` otherwise |
| `calendar-range-picker-trigger` | Calendar | present while the **Range** window is active |
| `calendar-scope-teams` | Calendar | present |
| `calendar-scope-people` | Calendar | present |
| `calendar-teams-picker` | Calendar | present while `scope=teams` |
| `calendar-people-picker` | Calendar | present while `scope=people` |
| `calendar-error-banner` | Calendar | `absent` under an empty Teams or People selection |
| `calendar-grid` | Calendar | present under an empty Teams or People selection |
| `calendar-today` | Calendar | present |
| `calendar-range-label` | Calendar | present |
| `calendar-prev` | Calendar | present |
| `calendar-next` | Calendar | present |
| `calendar-day-header-{date}` | Calendar | present per day in the window, `date` as `YYYY-MM-DD` |
| `calendar-window-week` | Calendar | present |
| `calendar-window-2weeks` | Calendar | present |
| `calendar-window-month` | Calendar | present |
| `calendar-member-row-{membershipId}` | Calendar | present per row the scope resolves to |

Every row marked `no` in the New column below already ships and is carried here because this
spec's cases assert it — an id a case touches belongs in the table of the bundle that touches it.
`calendar-scope-all`, `calendar-legend` and `calendar-empty-state` ship too, are asserted by no
case here, and keep the meanings they have.

| id | New |
|---|---|
| `calendar-window-range` | yes |
| `calendar-range-picker` | yes |
| `calendar-range-picker-trigger` | yes |
| every other row of the table above | no |

## Screens

### `/org/{orgId}/time-off/calendar`

```
Time off calendar                        ‹  [ Today ]  ›   1 Sep – 24 Oct 2026
Who is away, and when.

 Scope                Teams              Window
 [All][Teams][People] [ All          ▾]  [Week][2 weeks][Month][Range]

                      ── while Window = Range ──
 Range
 [ Sep 01, 2026 – Oct 24, 2026            ▾]

 ▭ Vacation · approved  ▨ Vacation · pending  ▭ Public holiday  ▭ Weekend
 ┌────────────┬───────────────────────────────────────────────────────┐
 │ MEMBER     │ W36                    │ W37                   │ …    │
```

The **Range** trigger takes `Select`'s dropdown geometry, as §85 requires of it, so it sits in
the filter row beside the pickers rather than under the header. The window control keeps all
four options in one `ToggleButton`: Range is a window, not a mode.

The label reserved by REQ-03-015 is measured against the widest string the screen can produce,
which is a custom range crossing both a month and a year — `28 Dec 2026 – 14 Mar 2027`.

## UI Description

| Surface | Behaviour |
|---|---|
| Loading | The grid skeleton in the grid's own geometry, `role="status"`. The filter row stays interactive |
| Empty | `calendar-empty-state` with `emptyStateTitle` and `emptyStateBody`, when the answer carries zero rows |
| Empty Teams / People selection | The chart, drawn from every active member. The picker reads `All`. No banner |
| Error | `calendar-error-banner` above the grid, carrying the `422`'s own field message, or the generic failure message for anything else |
| Range being picked | The first click arms the start; the panel disables every day more than 91 after it (REQ-03-009). No request is issued until the second click |
| Range wider than the viewport | The grid scrolls horizontally inside `.time-off-calendar-scroll`; the member column stays pinned |
| Read-only / permission-limited | There is no write on this screen for any role. A `viewer` never reaches it |

## Edge Cases

| # | Situation | Exact behaviour |
|---|---|---|
| 1 | Scope switched to Teams with nothing ticked, in an organization of more than 100 active members | `422` `tooManyMembers`. The banner says so; this is the refusal that replaces the one being withdrawn, and it is the true one — the view really is too wide |
| 2 | Scope switched to Teams with nothing ticked, in an organization with no active member but the caller | `200` with the caller's own row |
| 3 | A team is ticked and then unticked | The request is re-issued with no `projectIds`, and the chart widens to every member (REQ-03-001) |
| 4 | A ticked team is archived while the picker is open | The archived project leaves the option list; the id already ticked still narrows, because archiving hides a project from selectors and does not unassign anybody |
| 5 | `Unassigned` ticked alone | `200` with every active member who belongs to no project whose status is other than `archived` — a member whose only project was archived is in this bucket |
| 6 | A custom range of exactly 92 days | `200`. The bound is inclusive |
| 7 | A custom range of 93 days, submitted by a client that ignores REQ-03-009 | `422` `rangeTooWide` |
| 8 | A custom range of one day | `200`, one day column, full width up to the column maximum |
| 9 | `‹` clicked on a 10-day range | Both ends move back 10 days; the length stays 10 |
| 10 | **Today** clicked on a 10-day range that does not contain today | The range becomes today through today + 9 days |
| 11 | Window switched Range → Month while the range starts mid-month | The month containing that start |
| 12 | Window switched Month → Range | The range is that month's first and last day |
| 13 | A 92-day range on a narrow viewport | Every day column is at its minimum width and the grid scrolls; no column is narrower than the minimum (REQ-03-014) |
| 14 | `scope=teams` with `projectIds` naming only ids from another organization | `200` with no rows and `calendar-empty-state` — a foreign id resolves to nothing, and this is a narrowing selection, not an empty one |
| 15 | `scope` omitted entirely | `422` `scopeInvalid`. Rule 4 is unchanged: a scope is never defaulted |

## Security

- The organization is taken from the session, never from the path: `OrgScopeGuard` answers
  `404` — not `403` — when the path `orgId` disagrees, and every query scopes by
  `session.organizationId`.
- **Widening the default does not widen the audience.** An empty Teams selection resolves to the
  active memberships of the caller's own organization, which is the same set the `all` scope has
  always answered with for the same three roles. No row becomes reachable that was not reachable
  before by clicking `All`.
- A `viewer` holds no `view-time-off-calendar` and is answered `404` for every scope, empty
  selection included.
- The response carries no money, no reason and no note — only names, job titles, dates and a
  working-day count. Removing a refusal therefore exposes no new field.
- `projectIds` and `memberIds` are ids the caller supplies; both are filtered by the caller's own
  organization before they narrow anything, so a foreign id resolves to no row rather than to a
  refusal that would confirm it exists.
