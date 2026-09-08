# Home — contracts

Rules live in [01-home.md](01-home.md) and are referenced here by id.

## Routes

| Route | Guards | Success | Errors |
|---|---|---|---|
| `GET /api/organizations/{orgId}/portal/home` | `SessionGuard`, `OrgScopeGuard`; `hasCapability(role, 'ViewPortalHome')` in the service | `200` | `404` (a client principal; wrong organization) |
| `GET /api/organizations/{orgId}/portal/news` | `SessionGuard`, `OrgScopeGuard`; `hasCapability(role, 'ViewPortalHome')` in the service | `200` | `404` (a client principal; wrong organization) · `422` `PORTAL_MESSAGES.limitInvalid` · `422` `PORTAL_MESSAGES.cursorInvalid` |
| `GET /api/organizations/{orgId}/portal/news/{entryId}` | `SessionGuard`, `OrgScopeGuard`; `hasCapability(role, 'ViewPortalHome')` in the service | `200` | `404` (a client principal; wrong organization; an entry this caller's feed would not contain; a malformed, unknown or vanished id) |
| `GET /api/organizations/{orgId}/portal/settings` | `SessionGuard`, `OrgScopeGuard`, `CapabilityGuard('ManagePortalSettings')` | `200` | `403` `TEMPLATE_MESSAGES.generic.forbidden` (a member of this organization without the capability) · `404` (a client principal; wrong organization) |
| `PUT /api/organizations/{orgId}/portal/settings` | `SessionGuard`, `OrgScopeGuard`, `CapabilityGuard('ManagePortalSettings')` | `200` | `403` `TEMPLATE_MESSAGES.generic.forbidden` (a member of this organization without the capability) · `404` (a client principal; wrong organization) · `422` `PORTAL_MESSAGES.groupsInvalid` |
| `POST /api/test/membership/backdate-joined` | `assertFixturesOpen`; refused in production | `204` | `404` (production) |

**The refusal discipline is one rule over the caller, and `REQ-01-004` states it.** Every route
here answers **not-found, never forbidden**, to a client principal and to a wrong `orgId` — the two
are answered identically, so neither confirms the other. `OrgScopeGuard`
(`apps/api/src/auth/org-scope.guard.ts`) draws that line before any capability is read, and it
draws it on the settings pair exactly as it draws it on the reads. **Forbidden** is answered to one
caller only: a member of this organization who lacks `ManagePortalSettings`, where refusing them
leaks nothing about what is inside an organization they are already in.

**`GET .../portal/news/{entryId}` answers not-found for an entry the caller cannot see** rather
than forbidden, and answers it byte-identically to an id that names nothing: an entry id encodes a
source row, so a forbidden answer would confirm that a row with that id exists.

### `GET /api/organizations/{orgId}/portal/home`

```json
{
  "month": {
    "startDate": "2026-09-01",
    "endDate": "2026-09-30",
    "today": "2026-09-08",
    "timezone": "Europe/Warsaw",
    "totalMinutes": 5800,
    "daysWithEntry": 18,
    "byProject": [
      { "projectId": "…", "projectName": "Aurora", "minutes": 3250 },
      { "projectId": null, "projectName": "(No project)", "minutes": 840 }
    ]
  },
  "timeOff": {
    "availableDays": 17.5,
    "usedDays": 6.5,
    "pendingDays": 4,
    "totalDaysPerYear": 20
  },
  "holidays": {
    "countryCode": "PL",
    "upcoming": [{ "id": "…", "date": "2026-11-01", "name": "All Saints' Day" }]
  },
  "requests": {
    "openTotal": 5,
    "items": [
      {
        "id": "…",
        "number": 12,
        "title": "VPN profile for the Northwind staging network",
        "counterpartName": "Marta Kowalska",
        "direction": "raised",
        "neededBy": "2026-09-12",
        "overdue": true,
        "waitingOnMe": false
      }
    ]
  },
  "canManageSettings": false
}
```

`timeOff` is `null` in full when the membership has no `MemberFinancials` row (`REQ-01-016`).
`holidays` is answered whatever the reserve says, because a public holiday is a fact about where
somebody works and not about their days: `holidays.countryCode` is `null` when nobody has stated
one, and `holidays.upcoming` then carries the global rows alone (`REQ-01-019`). **No monetary field
appears anywhere in this body** (`REQ-01-015`) — `reserveBalance` is not omitted conditionally, it
is not part of the contract.

### `GET /api/organizations/{orgId}/portal/news`

Query: `limit` (1–50, default 20), `cursor` (opaque, from a previous `nextCursor`).

```json
{
  "entries": [
    {
      "id": "member-joined:57e848fc-9da9-41ed-ba6d-f69b752dafdd",
      "kind": "member-joined",
      "group": "people",
      "occurredAt": "2026-09-08T08:12:12.654Z",
      "subject": { "kind": "member", "id": "…", "name": "Anna Petrova", "initials": "AP" },
      "detail": { "jobTitle": "Frontend Engineer" }
    },
    {
      "id": "vacancy-opened:5c3c48f3-b3fd-490b-8e63-d51a2bacf575",
      "kind": "vacancy-opened",
      "group": "hiring",
      "occurredAt": "2026-09-08T06:02:41.000Z",
      "subject": { "kind": "vacancy", "id": "…", "name": "Senior React Developer", "initials": null },
      "detail": { "categories": ["React", "Senior"], "interviewerName": "Marta Kowalska" }
    },
    {
      "id": "project-started:8922f428-687e-4023-963b-b3c5ba766ddc",
      "kind": "project-started",
      "group": "work",
      "occurredAt": "2026-09-05T14:31:00.000Z",
      "subject": { "kind": "project", "id": "…", "name": "Aurora", "initials": null },
      "detail": { "clientName": null }
    },
    {
      "id": "member-anniversary:43b4ff02-947d-4a36-99cc-fa098d9c195e:2",
      "kind": "member-anniversary",
      "group": "people",
      "occurredAt": "2026-09-03T00:00:00.000Z",
      "subject": { "kind": "member", "id": "…", "name": "Ivan Demchenko", "initials": "ID" },
      "detail": { "years": 2 }
    }
  ],
  "nextCursor": "2026-09-03T00:00:00.000Z|member-anniversary:…:2"
}
```

`detail.clientName` is `null` rather than absent where `REQ-01-035` withholds it, so a reader of
the body cannot tell a project with no client from one whose client is not theirs to see.
`nextCursor` is absent when no page follows.

### `GET /api/organizations/{orgId}/portal/news/{entryId}`

```json
{
  "id": "vacancy-opened:5c3c48f3-b3fd-490b-8e63-d51a2bacf575",
  "kind": "vacancy-opened",
  "group": "hiring",
  "occurredAt": "2026-09-08T06:02:41.000Z",
  "subject": { "kind": "vacancy", "id": "…", "name": "Senior React Developer", "initials": null },
  "facts": [
    { "key": "interviewer", "label": "Interviews with", "value": "Marta Kowalska" },
    { "key": "duration", "label": "Interview length", "value": "45 minutes" }
  ],
  "categories": ["React", "Senior"],
  "body": "We are looking for an engineer to lead the front end of Aurora.",
  "shareUrl": "https://app.example.com/book/senior-react-developer-DyElNSI42zoG",
  "link": null
}
```

`facts` is ordered by the server, so the page never decides what to draw first. `body` is `null`
for every kind but `vacancy-opened`. `shareUrl` is `null` unless the vacancy is `open`
(`REQ-01-044`). `link` carries the in-app destination the reader may open — `/org/{orgId}/members/{id}`
on a person's entry, `null` where the reader may open nothing (`REQ-01-047`).

### `GET` / `PUT /api/organizations/{orgId}/portal/settings`

```json
{ "groups": { "people": true, "hiring": true, "work": false } }
```

`PUT` takes the same body and answers it back. All three keys are required; a partial body is
`422 PORTAL_MESSAGES.groupsInvalid`.

### `POST /api/test/membership/backdate-joined`

Body `{ "email": "…", "joinedAt": "2024-09-08" }`. Sets `Membership.joinedAt` for the active
membership of that account. Test-support only, behind `assertFixturesOpen` exactly as
`POST /api/test/financials/backdate` is (`apps/api/src/test-support/fixture-gate.ts`).

## Error Messages

| Export | Route | Message | New |
|---|---|---|---|
| `PORTAL_MESSAGES.noProject` | — | (No project) | yes |
| `PORTAL_MESSAGES.limitInvalid` | `GET /api/organizations/{orgId}/portal/news` | Ask for between 1 and 50 entries. | yes |
| `PORTAL_MESSAGES.cursorInvalid` | `GET /api/organizations/{orgId}/portal/news` | That page marker is not one this feed issued. | yes |
| `PORTAL_MESSAGES.groupsInvalid` | `PUT /api/organizations/{orgId}/portal/settings` | Say true or false for People, Hiring and Work. | yes |
| `TEMPLATE_MESSAGES.generic.forbidden` | `GET /api/organizations/{orgId}/portal/settings`, `PUT /api/organizations/{orgId}/portal/settings` | You do not have permission to do that. | no |
| `PORTAL_MESSAGES.feedEmptyTitle` | — | Nothing has happened yet | yes |
| `PORTAL_MESSAGES.feedEmptyBody` | — | When somebody joins, a vacancy opens or a project starts, it shows up here. | yes |
| `PORTAL_MESSAGES.monthEmpty` | — | No time tracked yet this month. | yes |
| `PORTAL_MESSAGES.requestsEmpty` | — | Nothing is waiting on you, and you have asked for nothing. | yes |
| `PORTAL_MESSAGES.noCountry` | — | Nobody has stated your country, so no holiday calendar reaches you. | yes |

`PORTAL_MESSAGES.noProject` is a **new export carrying a string the reports service already
writes inline** — `ReportsService.buildTimeAndActivity` composes it where a time entry has no
project. This spec does not change that call site; it declines to copy the literal a second time.

## Data Model

### `OrganizationPortalSettings` (new)

| Field | Type | Description |
|---|---|---|
| `id` | `String @id @default(uuid())` | |
| `organizationId` | `String @unique` | FK → `Organization.id`, `onDelete: Cascade`. Unique: one row per organization |
| `peopleEnabled` | `Boolean @default(true)` | `REQ-01-048` |
| `hiringEnabled` | `Boolean @default(true)` | `REQ-01-048` |
| `workEnabled` | `Boolean @default(true)` | `REQ-01-048` |
| `updatedAt` | `DateTime @updatedAt` | |

No row is written at signup. Absence reads as all three enabled (`REQ-01-049`), so the migration
adds a table and backfills nothing.

### Columns added to existing entities

None. Every feed source is read as it stands.

## Validation Rules

| # | Field | Constraint | Message | Server-only |
|---|---|---|---|---|
| 1 | `limit` | integer, 1–50 | `PORTAL_MESSAGES.limitInvalid` | no |
| 2 | `cursor` | `{ISO-8601}\|{entryId}`, both halves parseable | `PORTAL_MESSAGES.cursorInvalid` | yes |
| 3 | `groups.people` | boolean, required | `PORTAL_MESSAGES.groupsInvalid` | no |
| 4 | `groups.hiring` | boolean, required | `PORTAL_MESSAGES.groupsInvalid` | no |
| 5 | `groups.work` | boolean, required | `PORTAL_MESSAGES.groupsInvalid` | no |

The client validates nothing on the read routes — it never composes a cursor by hand, and the
limit is a constant it ships. The settings screen sends three booleans it owns. **The server
re-validates all five.**

## Required data-testid Attributes

| id | Screen | Asserted |
|---|---|---|
| `nav-portal` | every signed-in screen | present for a staff principal, absent for a client contact |
| `portal-greeting` | Home | present |
| `portal-month-total` | Home | present |
| `portal-month-days` | Home | present |
| `portal-month-project-row` | Home | one per project, counted |
| `portal-month-empty` | Home | present when the month is empty, absent otherwise |
| `portal-timeoff-available` | Home | present when financials exist, absent otherwise |
| `portal-timeoff-figures` | Home | absent when the membership has no financials |
| `portal-timeoff-panel` | Home | present — it carries the holidays, which no reserve gates |
| `portal-holiday-row` | Home | one per holiday, counted |
| `portal-holidays-no-country` | Home | present when no country is stated |
| `portal-request-row` | Home | one per request, counted |
| `portal-requests-empty` | Home | present when there are none |
| `portal-feed-entry` | Home | one per entry, counted |
| `portal-feed-empty` | Home | present when the feed is empty |
| `portal-feed-more` | Home | present when `nextCursor` came back, absent otherwise |
| `portal-feed-settings-link` | Home | present for `admin`, absent for `manager`, `user`, `viewer` |
| `portal-entry-title` | Entry | present |
| `portal-entry-back` | Entry | present |
| `portal-entry-body` | Entry | present on a vacancy entry, absent on the others |
| `portal-entry-share` | Entry | present while the vacancy is open, absent once closed |
| `portal-entry-fact` | Entry | one per fact, counted |
| `portal-settings-group-people` | Portal settings | present |
| `portal-settings-group-hiring` | Portal settings | present |
| `portal-settings-group-work` | Portal settings | present |
| `portal-settings-save` | Portal settings | present |

## Screens

The mock is [`01-home.mock.html`](01-home.mock.html), nine states. `## Screens` below is written
from it.

**The questions this screen asks.** Three, and they are independent:

| # | Question | The values the answer depends on |
|---|---|---|
| Q1 | *What is my month?* | the caller's membership; the calendar month of their today in `Account.timezone` |
| Q2 | *What's new?* | the organization; the caller's role and project memberships; the enabled groups; the cursor |
| Q3 | *What is this entry?* | the entry id; the caller's role and project memberships |

Q1 and Q2 are asked by the home screen and answered separately, so neither wait holds the other.
Q3 is the entry page's only question.

### Layout

Above the `lg` rung the screen is a grid — the personal half at `minmax(0, 1fr)`, the feed at a
fixed `400px`. Below `lg` they stack and the personal half leads. The feed's width is fixed rather than
fluid because an entry is a sentence and a sentence has a width at which it reads — `NavigationCard`
§84's argument, arriving on a feed.

Each panel is `Card variant="panel"` (§66): a section as wide as its own column has nothing beside
it, so a hairline would be an outline drawn around the page. Each feed entry is its own panel and
is an `<a>`, so it takes the hover §12 withholds from a static card — this card is a control.

### States

| Surface | Behaviour |
|---|---|
| Q1 loading | The three panel headings and the column frame are painted; each figure and each row is a `Preloader` block. No content from a previous answer is on screen, because Q1's only input is the caller and it does not change without a navigation. |
| Q1 answered, month empty | The figures are **not drawn at all**; `portal-month-empty` carries `PORTAL_MESSAGES.monthEmpty` and the control that starts the timer. Zero figures beside that sentence would be one message twice. |
| Q1 answered, no financials | The panel stands and `portal-timeoff-figures` is absent in full — a reserve nobody configured is not a zero reserve, and drawing it at zero would answer a question nobody asked. The holidays below it are drawn as they always are: they say where the caller works, not what they are owed. |
| Q1 answered, no country | The holidays list is replaced by `PORTAL_MESSAGES.noCountry` and a link to the profile. Whatever the figures above are doing, they are unaffected — the two are answered independently. |
| Q1 answered, no requests | The panel stands; `portal-requests-empty` carries `PORTAL_MESSAGES.requestsEmpty`. |
| Q1 failed | The three panels are replaced by one `InfoBanner` in the left column. The feed is untouched — it answers a different question. |
| Q2 loading | Three `Preloader` entries under the `What's new` heading. They are `div`s: a wait is not a link. |
| Q2 answered, empty | One panel holding `EmptyState` with `PORTAL_MESSAGES.feedEmptyTitle` / `feedEmptyBody` and, for a caller who may invite, the control that does. |
| Q2 answered, more remain | `portal-feed-more` is drawn at the foot of the column. Pressing it appends; nothing already drawn is replaced. |
| Q2 answered, a group is off | Indistinguishable from a group with no entries. Nothing on this screen says a group is off (`REQ-01-037`). |
| Q2 failed | The feed column alone shows an `InfoBanner`; the personal half stands, and it still answers Q1. |
| Q2 permission-limited | Not a state. A reader is never shown that entries were withheld. |
| Q3 loading | The entry panel's frame with `Preloader` blocks; the back control is painted immediately, because it needs no answer. |
| Q3 refused (`404`) | The app's own not-found screen. There is no "this entry is not for you" state, by `REQ-01-040`. |
| Q3 answered, trimmed | Fewer facts, no `link`, no roster. Nothing states that anything was withheld. |

### What the screen borrows

| Borrowed | What it demands of the caller | How this spec meets it |
|---|---|---|
| `Card variant="panel"` (§66) | A section as wide as its own column, with nothing beside it | Both columns are single-column stacks; no panel sits beside another |
| `Avatar` (§93) | A person to name it with; `decorative` only where the name is already beside it | Every avatar sits beside the person's name in the sentence, so each is `decorative` |
| `Badge` `neutral` (§59) | A label on an object, not a claim about how it is going | Vacancy categories and a request's `Open` state |
| `Badge` `warning` / `error` (§32) | A state that is genuinely going badly | Only `Overdue` on a request row |
| `EmptyState` (§28, §65) | `children` is a node — the way out belongs inside the state | The empty feed carries the invite control; the empty month carries the timer control |
| `Preloader` (§23) | `role="status"`, findable by a test | Each of Q1 and Q2 draws its own |
| `Sidebar` (§13, §76) | Navigation content comes from the caller; a row with no destination is not drawn | `Team overview` is the design system's own label for this row, and this spec is the screen it was waiting for |
| The member card `/org/{orgId}/members/{id}` | Reachable by every staff role | It is; `People → Members` is drawn without a capability gate |
| `GET .../requests` | Somebody raises requests. On the day nobody has, the panel is empty, not broken | The empty state is a drawn state, not a fallback |
| `Holiday` rows | An admin or a sourcing run fills the table. On the day nobody has, the holidays list is empty | Drawn as an empty list under the figures, not as a failure |

**Undrawn screens this spec changes.** The login form (`apps/web/app/login/LoginForm.tsx`) changes
its destination and nothing else; it is not redrawn. The risk that leaves open is that a reader of
the mock cannot see that the members list is no longer where a session begins.

## Geometry & motion

| Element | What varies | What holds it | What moves if it does not |
|---|---|---|---|
| `portal-month-total` | `4h 05m` to `168h 40m` — five to nine glyphs, `tabular-nums` | The figure sits first in a `flex` band with a fixed `--space-10` gap and no `justify-content`, so it grows rightwards into the band's own slack | The two figures beside it, sideways, every time a member tracks past ten or a hundred hours |
| `portal-month-project-row` name | A project name, 1–100 characters | A `minmax(0, 1fr)` first column with `text-overflow: ellipsis` and `white-space: nowrap`; the minutes are the `auto` second column | The minutes column, leftwards, so three rows' figures stop sharing a right edge |
| `portal-holiday-row` name | A holiday name, unbounded in the source | `minmax(0,1fr)` with ellipsis between a fixed `74px` date and an `auto` "in N days"; the row never wraps | The "in N days" text, sideways on every row independently |
| `portal-request-row` title | A request title, 1–200 characters | The title is the **first** column at `minmax(0,1fr)`; the due text and the badge are `auto` and sit last | Drawn the other way round — badge first — every row starts its title at a different x, because each row's first column is sized by its own content |
| `portal-request-row` badge | `Open` · `Waiting on you` · `Overdue` — three widths, and presence varies with the row | Last in the row, so its width is absorbed by the `1fr` title to its left | The title's right edge, which is fine, and the title's **left** edge, which is not, if the badge is moved first |
| `portal-feed-entry` sentence | One to three lines; a name, a job title and a vacancy title all vary | The entry is a two-column grid, `auto` for the mark and `minmax(0,1fr)` for the body; the body wraps and the panel grows downwards | The mark, which would be pushed off its top alignment, and the entries below, which is the intended growth |
| `portal-feed-settings-link` | Present for `admin`, absent for everyone else | The feed heading row is `justify-content: space-between` with the heading first, so the heading's left edge does not depend on the second child existing | Nothing. The row is drawn correctly in both cases, and the entry is here to record that it was checked |
| The day separator (`Today`, `Earlier this week`) | Present or absent depending on where a day boundary falls | It is a block in the column's flow with its own top padding; it never overlays an entry | Nothing overlaps; the column simply grows |
| `portal-entry-title` | The feed's sentence, at heading size, one to three lines | The reading column is capped at `720px`, and the title wraps inside it | The timestamp under it, downwards, which is the intended flow |
| `portal-entry-share` URL | A slug of unbounded length | A `flex: 1; min-width: 0` code box with ellipsis beside an `auto` copy button | The copy button, off the right edge of the panel, on a long slug |

## Edge Cases

| # | Situation | Exact behaviour |
|---|---|---|
| 1 | A member joined and was then removed | No entry (`REQ-01-028`). Their page answers `404` (`REQ-01-041`). |
| 2 | A member was removed and re-invited | One `member-joined` entry, at the new `joinedAt`. Anniversaries count from it. Recorded as a Known Gap. |
| 3 | A membership joined exactly 365 days before today | Its `member-joined` entry is inside the window; its first anniversary is today and is also drawn. Two entries, different ids. |
| 4 | A membership joined on 29 February | The anniversary falls on 1 March in a non-leap year — the first day on or after the nominal date. |
| 5 | A vacancy was opened and then closed | The entry stays (`REQ-01-030`). Its page draws the description and no share link (`REQ-01-044`). |
| 6 | A vacancy is deleted after the feed was rendered | Opening its entry answers `404` (`REQ-01-041`). The feed's own next read no longer contains it. |
| 7 | A project was archived | The entry stays (`REQ-01-031`). Its page draws `Archived` beside the name. |
| 8 | A `user` opens a `project-started` entry for a project they are not on | `200`. Name and date; no client, no roster (`REQ-01-035`, `REQ-01-047`). |
| 9 | Anybody opens an entry id whose kind this spec derives nothing for — a client, a candidate, an application | `404` — an unknown kind (`REQ-01-041`), answered identically to a malformed id. |
| 10 | An admin switches Work off while a member has the feed open | The member's next read omits the group. Nothing already drawn is retracted, and the screen does not poll. |
| 11 | Every group is switched off | The feed is empty and draws `PORTAL_MESSAGES.feedEmptyTitle`, exactly as an organization with no history does. An admin sees the same, and the settings screen is where the cause is. |
| 12 | The caller's `Account.timezone` is unset | The month is computed in UTC (`REQ-01-010`). |
| 13 | Today is the 1st of the month | The month range is that single day so far; `daysWithEntry` is 0 or 1. |
| 14 | A time entry crosses midnight | Its minutes fall in the day the entry's `date` names, which is what the time-tracking area already stores. No splitting. |
| 15 | A cursor from a feed whose groups have since changed | The cursor still parses and pages from that moment; entries of a now-disabled group simply are not there. |
| 16 | A cursor the feed never issued | `422 PORTAL_MESSAGES.cursorInvalid`. |
| 17 | `limit=0` or `limit=51` | `422 PORTAL_MESSAGES.limitInvalid`. |
| 18 | Two admins save the settings at once | Last write wins on a single-row upsert keyed by `organizationId`. The two do not race in ordinary use: this is one row edited by whoever administers the organization, and a lost update is one switch re-flicked. |
| 19 | A member has 40 projects in one month | Every row is answered; the panel grows. The list is short by construction — a month has a bounded number of projects a person can touch — so no paging control is specified. |
| 20 | The `orgId` in the path is another organization's | `404` from `OrgScopeGuard`, before any of this runs. |

## Security

- **Every query scopes by `session.organizationId`, never the path `orgId`.** The path parameter
  is proven equal by `OrgScopeGuard` and then not used.
- **Unknown and unauthorized are byte-identical on the entry route.** A `404` is answered for a
  malformed id, an unknown kind, a vanished row and a row this caller may not see. There is no
  timing branch: visibility is decided after the source row is loaded, in every case.
- **The feed never widens what a role can read.** Every kind it derives (`REQ-01-034`) is drawn to
  all four roles, and the one field that is not — a project's client name (`REQ-01-035`) — is
  withheld from a reader who does not already hold it elsewhere.
- **A client principal reaches nothing here, on any route.** `OrgScopeGuard` refuses it with `404`
  before a capability is read, so the settings pair refuses it exactly as the reads do
  (`REQ-01-004`).
- **The test-support fixture is fenced twice**, by `assertFixturesOpen` and by the production
  environment check, exactly as `POST /api/test/financials/backdate` is.
- **No monetary value crosses the wire** on `GET .../portal/home`, for any role.

## DS gaps

| Gap | Impact | What closes it |
|---|---|---|
| `--feed-col` — the mock declares the feed column's width as a custom property of its own | The design system names `--layout-sidebar-width` and two navbar heights but no content-column width, so the next screen that wants a bounded reading column invents its own number | A `--layout-reading-column` token, sized from this screen and the entry page, which both want the same bound |
| `@literal 32px / var(--font-weight-light)` for a headline figure — **the second place this pair is written.** `ReportSummaryBanner` §82 already declares it a literal, and this screen cannot borrow that component: it draws its own `--border-width-control` outline and a `--space-7` bottom margin, sized for standing above a report table on the page ground, which inside a `Card variant="panel"` is a border drawn inside a border | Two components now carry the same unnamed figure size, and a third will copy whichever it finds first | A `Figure` component owning the pair, or `--figure-size` / `--figure-weight` tokens that both call sites read |

**Where this section lives.** `scripts/spec-lint.mjs` reads `## DS gaps` from the contracts
file; the spec template describes it under the cases file. The script is the gate, so it is
here.

