---
id: "12"
title: Time Tracking
routes: ["/org/{orgId}/time-tracking"]
api: ["GET .../timer", "POST .../timer/start", "PUT .../timer", "POST .../timer/stop", "DELETE .../timer", "GET .../time-entries", "POST .../time-entries", "PUT .../time-entries/{id}", "DELETE .../time-entries/{id}"]
entities: [TimeEntry, RunningTimer]
tags: [time-tracking, timer, time-entry, running-timer, daily-view, weekly-view, monthly-view, calendar, time-grid, first-day-of-week, topbar-indicator, duration, manual-entry, timezone]
depends-on: ["11"]
---

# 12 — Time Tracking

## Summary

Members log time spent on projects by starting a **running timer** or adding **manual time entries**. The Time Tracking page lives in the sidebar and offers three views: a monthly **calendar grid** (default), a weekly **time grid** over the week's seven days, and a daily **time grid** for one day. The weekly and daily views are Outlook-style hour grids on which timed entries render as positioned blocks. A running timer persists server-side and shows a live indicator in the app shell's topbar on every page. There is no approval flow — entries save immediately. `admin` and `manager` can view and edit all members' entries; `user` sees only their own. `viewer` has no access.

**Depends on:** Spec 11 (Project, ProjectMember).

## Actors & Preconditions

- **Actors:** `admin`, `manager`, and `user` log time and use the timer. `admin` and `manager` additionally view/edit all members' entries. `viewer` has no access.
- **Preconditions:** the caller must be an `active` member of the organization.

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| View Time Tracking page | ✅ | ✅ | ✅ | ❌ |
| View own time entries | ✅ | ✅ | ✅ | ❌ |
| View all members' time entries | ✅ | ✅ | ❌ | ❌ |
| Create own time entry | ✅ | ✅ | ✅ | ❌ |
| Edit own time entry | ✅ | ✅ | ✅ | ❌ |
| Delete own time entry | ✅ | ✅ | ✅ | ❌ |
| Create time entry for another member | ✅ | ✅ | ❌ | ❌ |
| Edit any member's time entry | ✅ | ✅ | ❌ | ❌ |
| Delete any member's time entry | ✅ | ✅ | ❌ | ❌ |
| Start / stop / discard own timer | ✅ | ✅ | ✅ | ❌ |
| Filter by member | ✅ | ✅ | ❌ | ❌ |

## Functional Requirements

### Time Entries

1. A time entry records work done on a specific **date**. It belongs to a membership and optionally references a project.
2. Each entry has: `projectId` (nullable), `task` (free text, max 200 chars), `description` (free text, max 500 chars), `date`, `startTime` (nullable), `endTime` (nullable), `durationMinutes` (always present, integer).
3. Two input modes:
   - **Time range:** user provides `startTime` and `endTime`. `durationMinutes` is auto-computed as the difference in minutes, rounded up to the nearest minute.
   - **Duration only:** user provides `durationMinutes` directly. `startTime` and `endTime` are null.
4. `date` is required and must not be in the future. Entries can be back-dated up to **90 days** in the past.
5. `durationMinutes` must be between **1** and **1440** (24 hours).
6. When `startTime` is provided, `endTime` is also required, and `endTime` must be after `startTime`. Both are times within the same day (no overnight entries via manual input).
7. `projectId`, when provided, must reference an **active** project in the same organization. Exception: editing an existing entry that already references an archived project — the archived project reference is preserved if the user does not change it.
8. **Project visibility for `user` role:** the project selector shows only projects the user is assigned to (via `ProjectMember`, spec 11). `admin` and `manager` see all active projects.
9. A member can have multiple entries on the same date, including overlapping time ranges. No overlap validation is enforced.
10. Leading and trailing whitespace is trimmed from `task` and `description`.

### Running Timer

11. Each member can have at most **one** running timer at a time, enforced by a unique constraint on `membershipId`.
12. Starting a timer creates a `RunningTimer` record server-side with `startedAt = now()`. The timer optionally has `projectId`, `task`, and `description` set at start.
13. Starting a timer when one is already running returns **409 Conflict**. The user must stop or discard the existing timer first.
14. **Stopping** a timer:
    - Computes `durationMinutes = ceil((now − startedAt) / 60000)`. Minimum: **1 minute**. If less than 1 minute has elapsed, duration is rounded up to 1.
    - Creates a `TimeEntry` with the computed duration, `startTime = startedAt`, `endTime = now`, `date` = calendar date of `startedAt` in the caller's `Account.timezone` (spec 06), falling back to `'UTC'` when the account has no timezone set.
    - Deletes the `RunningTimer` record.
15. If the timer spans **midnight**, the resulting entry is assigned to the date when the timer was started, with the full duration. No splitting across days in v1.
16. **Discarding** a timer deletes the `RunningTimer` without creating a `TimeEntry`.
17. The timer's `projectId`, `task`, and `description` can be **updated while running** without restarting (the `startedAt` is not changed).
18. The timer persists across page refreshes, tab closures, and device switches — it is a server-side record.
19. When a member is removed from the organization (spec 04), their `RunningTimer` is cascade-deleted. No `TimeEntry` is created.

### Topbar Timer Indicator

20. The app shell's topbar shows a **timer indicator** when the current user has a running timer. It appears to the left of the account button.
21. The indicator shows: elapsed time in `HH:MM:SS` format (updating every second, computed client-side from `startedAt`), truncated project name (or "No project"), and a **stop** button.
22. Clicking the elapsed time or project name navigates to `/org/{orgId}/time-tracking`.
23. Clicking the stop button calls `POST .../timer/stop` and removes the indicator. A toast "Timer stopped — {duration} logged" is shown.
24. The timer data is fetched via `GET /api/organizations/{orgId}/timer` on app shell mount (after `/api/me` resolves). No polling — the indicator is initialized once and maintained client-side.

### Editing & Deleting Entries

25. A member can edit and delete their **own** entries.
26. An `admin` or `manager` can edit and delete **any** member's entries.
27. Editing preserves the entry ID. The `updatedAt` timestamp is refreshed.
28. Deleting an entry is a hard delete — no soft-delete for time entries.
29. A `user` attempting to edit or delete another member's entry receives **403 Forbidden**.

### Admin/Manager Features

30. The Time Tracking page shows a **member filter** dropdown for `admin` and `manager`. By default it shows the caller's own entries. Selecting a member loads that member's entries.
31. `admin` and `manager` can create entries on behalf of another member by specifying `membershipId` in the create request.

### Calendar Views & Week Start

32. The calendar week start follows the caller's **`firstDayOfWeek`** account preference (spec 06 — **"Monday"** by default, or **"Sunday"**). It governs: the **monthly** grid's first column, its weekday-header order, and which 6-week window is shown; and the **weekly** view's seven-day column order and its week-range label. `/api/me` now carries `firstDayOfWeek` so the client resolves the preference on load without an extra request. See spec 06 (Account Settings) for how the preference is set.
33. **Weekends are not visually muted.** Saturday and Sunday columns (weekly view) and cells (monthly view) render as regular available days — some members work weekends — so the weekday name (Sat/Sun) is the only weekend cue. Weekends are fully interactive, exactly like weekdays.

### Timezone

34. Entry times render in the **viewer's account timezone** (`Account.timezone`, spec 06), falling back to `'UTC'` when the account has no timezone set. `startTime`/`endTime` are stored as absolute UTC instants; the effective timezone is the viewer's, resolved from `/api/me`.
35. Manual `HH:MM` input is interpreted as **wall-clock time in the effective timezone** and converted to a UTC instant on save. The daily/weekly grids format `startTime`/`endTime`, position blocks, and draw the now-line in that timezone; the timer-stop `date` and the not-future / 90-day-past validation "today" use the timezone-local date.
36. The daily/weekly grid's gutter label shows the effective zone as a **GMT offset** (e.g. "GMT+2", or "UTC" when the offset is 0), not a hardcoded "UTC".
37. When an `admin`/`manager` creates an entry for another member, the `HH:MM` input is composed as wall-clock in the **creating caller's** effective timezone.

## Data Model

### TimeEntry

| Field | Type | Description |
|---|---|---|
| `Id` | Guid | Primary key |
| `MembershipId` | Guid (FK) | References `Membership.Id`. Cascade delete. |
| `OrganizationId` | Guid (FK) | References `Organization.Id`. Cascade delete. Denormalized for query performance. |
| `ProjectId` | Guid? (FK) | References `Project.Id`. Set null on project delete. Nullable. |
| `Task` | string(200)? | Free-text task label. |
| `Description` | string(500)? | Free-text description. |
| `Date` | DateOnly | Calendar date this entry belongs to. |
| `StartTime` | DateTime? | Start timestamp. Null for duration-only entries. |
| `EndTime` | DateTime? | End timestamp. Null for duration-only entries. |
| `DurationMinutes` | int | Duration in minutes. Always present. Min 1, max 1440. |
| `CreatedAt` | DateTime | Creation timestamp. |
| `UpdatedAt` | DateTime | Last modification timestamp. |
| `CreatedByAccountId` | Guid (FK) | Account that created the entry (may differ from membership for admin-created entries). |

**Indexes:** `(MembershipId, Date)`, `(OrganizationId, Date)`, `(ProjectId)`.

### RunningTimer

| Field | Type | Description |
|---|---|---|
| `Id` | Guid | Primary key |
| `MembershipId` | Guid (FK, unique) | References `Membership.Id`. Cascade delete. One per member. |
| `OrganizationId` | Guid (FK) | References `Organization.Id`. Cascade delete. |
| `ProjectId` | Guid? (FK) | References `Project.Id`. Set null on project delete. Nullable. |
| `Task` | string(200)? | Free-text task label. |
| `Description` | string(500)? | Free-text description. |
| `StartedAt` | DateTime | When the timer was started. |

**Indexes:** `(OrganizationId)`.

### New Capabilities (extend `Capability` enum)

- `ViewTimeTracking` — view the Time Tracking page and own entries (admin, manager, user)
- `ManageOwnTimeEntries` — create, edit, delete own time entries (admin, manager, user)
- `ManageAllTimeEntries` — view, create, edit, delete any member's time entries (admin, manager)
- `UseTimer` — start, stop, discard own timer (admin, manager, user)

## Screens

### Time Tracking Page — Monthly View (default)

```
┌──────────────┬──────────────────────────────────────────────────┐
│ PEOPLE       │  Time Tracking                                   │
│  Members     │                                                   │
│              │  [Member ▾]  (admin/manager)   [< August 2026 >] │
│ PROJECTS     │                                                   │
│  Projects    │  [ Daily ]  [ Weekly ]  [● Monthly ]             │
│              │                                                   │
│ TIME         │  ┌──────────────────────────────────────────┐    │
│  ▣ Time      │  │ Mon   Tue   Wed   Thu   Fri   Sat  Sun  │    │
│    Tracking  │  │                               1     2    │    │
│              │  │                               —     —    │    │
│              │  │  3     4     5     6     7     8     9    │    │
│              │  │ 8h 0m 7h 30m8h 0m 6h 0m 8h 0m —     —    │    │
│              │  │ 10    11    12    13    14    15    16    │    │
│              │  │ 8h 0m 8h 0m 4h 0m 8h 0m 8h 0m —     —    │    │
│              │  │ 17    18    19    20    21    22    23    │    │
│              │  │ 7h 30m8h 0m 8h 0m 6h 30m8h 0m —     —    │    │
│              │  │ 24    25    26    27    28    29    30    │    │
│              │  │ 8h 0m 8h 0m ●     —     —     —     —    │    │
│              │  │ 31                                        │    │
│              │  │ —                                         │    │
│              │  └──────────────────────────────────────────┘    │
│              │                                                   │
│              │  Total: 157h 30m                                  │
│              │                                                   │
│              │  ┌─ Timer ─────────────────────────────────┐     │
│              │  │ [ Project ▾ ]  [ Task         ]         │     │
│              │  │ [ Description                  ]         │     │
│              │  │            [ ▶ Start timer ]             │     │
│              │  └─────────────────────────────────────────┘     │
│              │                                                   │
│              │  [ + Add entry ]                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

- Calendar grid cells show day number and total hours in `Xh Ym` format (e.g. "8h 0m"). `●` marks today.
- Cells with hours use background intensity proportional to logged hours (more hours = deeper shade). Weekend cells are **not** muted — they render as regular available days.
- Click on a day cell → switches to daily view for that date.
- `<` and `>` arrows navigate months. Month/year label shown between them.
- Member filter dropdown (admin/manager only): shows all active org members. Default: "My time".

### Time Tracking Page — Weekly View

```
┌──────────────────────────────────────────────────────────────┐
│  [ Daily ]  [● Weekly ]  [ Monthly ]    [< Aug 24–30, 2026 >]│
│                                                               │
│  ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐   │
│  │ GMT+2│ Mon  │ Tue  │ Wed  │ Thu  │ Fri  │ Sat  │ Sun  │   │
│  │      │  24  │  25  │  26  │  27  │  28  │  29  │  30  │   │
│  │      │ 8h 0m│7h 30m│ 8h 0m│ 8h 0m│ 8h 0m│  —   │  —   │   │
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┤   │
│  │ 09:00│ ┌──┐ │      │ ┌──┐ │      │      │      │      │   │
│  │ 10:00│ │Al│ │ ┌──┐ │ │Al│ │ ┌──┐ │ ┌──┐ │      │      │   │
│  │ 11:00│ └──┘ │ │Be│ │ └──┘ │ │Al│ │ │Be│ │      │      │   │
│  │ 12:00│      │ └──┘ │      │ └──┘ │ └──┘ │      │      │   │
│  │  …   │      │      │──now→│      │      │      │      │   │
│  ├──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┤   │
│  │ Duration-only:  [Mon · Alpha · 1h 0m]                │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  Total this week  39h 30m                                    │
└──────────────────────────────────────────────────────────────┘
```

- An **hour gutter** on the left plus **seven day columns**, ordered from the caller's `firstDayOfWeek` (see FR-32). Weekend columns (Sat/Sun) render as regular available days — not muted (FR-33). The gutter label shows the viewer's timezone as a GMT offset (e.g. "GMT+2", or "UTC" when the offset is 0; see FR-34–36).
- Each day-column header shows the weekday, the date, and that **day's total** in `Xh Ym` format. Today's header is tinted.
- **Timed entries** (both start/end set) render as **positioned blocks** on the hour grid — top and height derived from the entry's start/end times, formatted and positioned in the viewer's account timezone (FR-34–36). Overlapping entries pack side-by-side into lanes. Each block is colour-coded per project, always paired with the project name in text.
- **Duration-only entries** (no start/end) render as chips in a **strip below the grid**, each labelled with its weekday.
- A **now-line** marks the current time in today's column.
- Clicking a block (or a duration-only chip) → switches to daily view for that date.
- `<` and `>` arrows navigate weeks. Date range label shown. The **week total** appears below the grid.

### Time Tracking Page — Daily View

```
┌──────────────────────────────────────────────────────────────┐
│  [● Daily ]  [ Weekly ]  [ Monthly ]  [< Tue, Aug 25, 2026 >]│
│                                                               │
│  ┌──────┬───────────────────────────────────────────────┐    │
│  │ GMT+2│ Tue, Aug 25, 2026 · Today    Total logged 8h30m│    │
│  ├──────┼───────────────────────────────────────────────┤    │
│  │ 09:00│ ┌───────────────────────────────────┐         │    │
│  │ 10:00│ │ 09:00 – 11:30 · 2h 30m       [✎][🗑]│         │    │
│  │ 11:00│ │ Project Alpha · API development    │         │    │
│  │      │ └───────────────────────────────────┘         │    │
│  │ 12:00│ ┌───────────────────────────────────┐         │    │
│  │ 13:00│ │ 12:00 – 15:00 · 3h 0m        [✎][🗑]│         │    │
│  │ 14:00│ │ Project Beta · Frontend work       │         │    │
│  │      │ └───────────────────────────────────┘         │    │
│  │  …   │ ─────────── now ──────────────────            │    │
│  ├──────┴───────────────────────────────────────────────┤    │
│  │ Duration-only (no time set):  [(no project) · Team… ]│    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

- A single wide day column over an **hour gutter**. Timed entries render as **positioned blocks** whose top/height derive from their start/end times, formatted and positioned in the viewer's account timezone (FR-34–36); overlapping entries pack side-by-side into lanes. The gutter label shows that timezone as a GMT offset.
- Each block shows: time range, duration in `Xh Ym`, project name (or "(no project)") · task, and a truncated description line. Blocks are colour-coded per project, always paired with the project name in text.
- **Duration-only entries** (no start/end) render as chips in a **strip below the grid**, under a "Duration-only (no time set)" label.
- A **now-line** marks the current time when viewing today. The **day total** appears in the column header.
- Edit and delete controls: revealed on a block (own entries for all roles, any entry for admin/manager). Clicking a block opens its editor.
- Day navigation: `<` and `>` arrows.

### Timer Panel (on TT page) — idle state

```
┌─ Timer ─────────────────────────────────────────┐
│  [ Project ▾ ]  [ What are you working on?   ]  │
│  [ Description                                ]  │
│                         [ ▶ Start timer ]        │
└──────────────────────────────────────────────────┘
```

### Timer Panel — running state

```
┌─ Timer ─────────────────────────────────────────┐
│                                                   │
│          ⏱  01:23:45                              │
│          Project Alpha · API development          │
│                                                   │
│  [ Project Alpha    ▾ ]  [ API development    ]   │
│  [ Working on endpoints                       ]   │
│                                                   │
│        [ Discard ]    [ ■ Stop & save ]           │
└──────────────────────────────────────────────────┘
```

- Elapsed time updates every second (computed client-side from `startedAt`).
- Project, task, and description can be edited while running (calls `PUT .../timer` on change).
- "Stop & save" creates entry + removes timer.
- "Discard" removes timer without creating entry. Confirmation: "Discard this timer? No time entry will be saved."

### Topbar Timer Indicator

```
┌──────────────┬──────────────────────────────────────────────────┐
│ Teammerly●   │                  [ ⏱ 01:23:45 · Alpha  ■ ]  PO │
├──────────────┼──────────────────────────────────────────────────┤
```

- Visible only when a `RunningTimer` exists for the current user.
- Shows: timer icon, elapsed `HH:MM:SS`, project name (truncated ~15 chars, or "No project"), stop button (square icon).
- Click time/project → navigate to `/org/{orgId}/time-tracking`.
- Click stop → `POST .../timer/stop`, indicator disappears, toast shown.

### Add/Edit Time Entry Modal

```
┌──────────────── Add Time Entry ──────────────────┐
│                                                    │
│  Project                                           │
│  [ Select project...                    ▾ ]        │
│                                                    │
│  Task                                              │
│  [ e.g. API development                 ]          │
│                                                    │
│  Date *                                            │
│  [ 2026-08-25                           ]          │
│                                                    │
│  (●) Time range    ( ) Duration only               │
│                                                    │
│  Start time *          End time *                   │
│  [ 09:00      ]        [ 11:30      ]              │
│  Duration: 2h 30m (computed)                       │
│                                                    │
│  — OR when "Duration only" selected —              │
│                                                    │
│  Duration *                                        │
│  [ 2 ] h  [ 30 ] m                                │
│                                                    │
│  Description                                       │
│  [ Working on the new feature           ]          │
│                                                    │
│            [ Cancel ]  [ Save entry ]              │
└────────────────────────────────────────────────────┘
```

- "Time range" is the default mode.
- Date defaults to today for new entries.
- In edit mode: pre-filled with existing values. Button text: "Save changes".
- Duration auto-computes from start/end in time range mode. In duration-only mode, user enters hours and minutes manually.
- Admin/manager creating for another member: membershipId comes from the member filter selection.

## Flows

### Main Flow: User starts a timer and stops it

1. User navigates to the Time Tracking page.
2. In the Timer panel, user optionally selects a project and enters a task.
3. User clicks "Start timer".
4. System sends `POST /api/organizations/{orgId}/timer/start`.
5. On success: Timer panel switches to running state showing `00:00:00` counting up. Topbar timer indicator appears. Toast "Timer started".
6. User continues working. The timer ticks in both the panel and the topbar on every page.
7. User clicks "Stop & save" (in panel or topbar).
8. System sends `POST /api/organizations/{orgId}/timer/stop`.
9. On success: Timer panel returns to idle state. Topbar indicator disappears. Toast "Timer stopped — 2h 15m logged". The new entry appears in the current view.

### Alt Flow A: Discard timer (branches from Main Flow, step 7)

7a. User clicks "Discard" in the Timer panel.
7b. System shows confirmation: "Discard this timer? No time entry will be saved."
7c. User confirms.
7d. System sends `DELETE /api/organizations/{orgId}/timer`.
7e. On success: Timer panel returns to idle state. Topbar indicator disappears. Toast "Timer discarded".

### Alt Flow B: Edit timer metadata while running (from Main Flow, step 6)

6a. User changes the project or task in the Timer panel.
6b. System sends `PUT /api/organizations/{orgId}/timer` with updated fields.
6c. Timer continues running with unchanged `startedAt`. Topbar indicator updates to reflect new project name.

### Main Flow: User adds a manual time entry

1. User clicks "Add entry" on the Time Tracking page.
2. System opens the Add Time Entry modal with date defaulting to today, "Time range" mode selected.
3. User selects a project, enters a task, sets start time and end time. Duration auto-computes.
4. User clicks "Save entry".
5. System sends `POST /api/organizations/{orgId}/time-entries`.
6. On success: modal closes, toast "Time entry saved", the entry appears in the current view.

### Alt Flow C: Manual entry — duration only (branches from step 2)

2a. User selects "Duration only" mode.
2b. Start/end time fields hide. Duration hours and minutes fields appear.
2c. User enters duration, clicks "Save entry".

### Alt Flow D: Edit a time entry

1. User clicks the edit button on an entry in the daily view.
2. System opens the Edit Time Entry modal pre-filled with the entry's values.
3. User modifies fields and clicks "Save changes".
4. System sends `PUT /api/organizations/{orgId}/time-entries/{entryId}`.
5. On success: modal closes, toast "Time entry saved", entry updates in the view.

### Alt Flow E: Delete a time entry

1. User clicks the delete button on an entry in the daily view.
2. System shows confirmation: "Delete this time entry? This action cannot be undone."
3. User confirms.
4. System sends `DELETE /api/organizations/{orgId}/time-entries/{entryId}`.
5. On success: entry removed from the view, toast "Time entry deleted".

### Alt Flow F: Admin views another member's entries

1. Admin selects a member from the member filter dropdown.
2. System loads the selected member's entries for the current date range.
3. Edit/delete buttons appear on all entries. Admin can modify them.

### Alt Flow G: Start timer when one is already running (from Main Flow, step 4)

4a. System returns 409 "A timer is already running. Stop it before starting a new one."
4b. An error toast is shown. The existing timer continues.

### Alt Flow H: Network/server error (any mutation)

- System shows error toast "Something went wrong. Please try again."
- Modal/form retains values. Buttons re-enable.

## API Contracts

### GET /api/organizations/{orgId}/timer

**Authentication:** required. Caller must be `active` member of the organization.

**Returns the caller's running timer (if any).**

**Response `200` (timer running):**
```json
{
  "timer": {
    "id": "uuid",
    "projectId": "uuid",
    "projectName": "Project Alpha",
    "task": "API development",
    "description": "Working on endpoints",
    "startedAt": "2026-08-26T09:00:00Z"
  }
}
```

**Response `200` (no timer):**
```json
{
  "timer": null
}
```

**Errors:**
- `401 Unauthorized`: not authenticated.

### POST /api/organizations/{orgId}/timer/start

**Authentication:** required. Caller must have `UseTimer` capability.

**Request:**
```json
{
  "projectId": "uuid-or-null",
  "task": "API development",
  "description": "Working on endpoints"
}
```

All fields are optional. An empty `{}` starts a timer with no project, task, or description.

**Response `201`:**
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "projectName": "Project Alpha",
  "task": "API development",
  "description": "Working on endpoints",
  "startedAt": "2026-08-26T09:00:00Z"
}
```

**Errors:**
- `400 Bad Request`: validation errors (task too long, description too long).
- `400 Bad Request`: projectId references non-existent or archived project — `{ "error": "invalid_project", "message": "Project not found or archived" }`.
- `403 Forbidden`: `viewer` role.
- `409 Conflict`: timer already running — `{ "error": "timer_already_running", "message": "A timer is already running. Stop it before starting a new one." }`

### PUT /api/organizations/{orgId}/timer

**Authentication:** required. Caller must have a running timer.

**Request:**
```json
{
  "projectId": "uuid-or-null",
  "task": "Updated task",
  "description": "Updated description"
}
```

Updates the running timer's metadata without restarting. `startedAt` is not changed.

**Response `200`:**
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "projectName": "Project Alpha",
  "task": "Updated task",
  "description": "Updated description",
  "startedAt": "2026-08-26T09:00:00Z"
}
```

**Errors:**
- `400 Bad Request`: validation errors.
- `404 Not Found`: no timer running — `{ "error": "no_timer", "message": "No timer is currently running" }`.

### POST /api/organizations/{orgId}/timer/stop

**Authentication:** required. Caller must have a running timer.

**No request body.**

Computes `durationMinutes = ceil((now − startedAt) / 60000)`, minimum 1. Creates a `TimeEntry` and deletes the `RunningTimer`.

**Response `200`:**
```json
{
  "timeEntry": {
    "id": "uuid",
    "membershipId": "uuid",
    "projectId": "uuid",
    "projectName": "Project Alpha",
    "task": "API development",
    "description": "Working on endpoints",
    "date": "2026-08-26",
    "startTime": "2026-08-26T09:00:00Z",
    "endTime": "2026-08-26T11:15:00Z",
    "durationMinutes": 135,
    "createdAt": "2026-08-26T11:15:00Z"
  }
}
```

**Errors:**
- `404 Not Found`: no timer running — `{ "error": "no_timer", "message": "No timer is currently running" }`.

### DELETE /api/organizations/{orgId}/timer

**Authentication:** required. Caller must have `UseTimer` capability.

Discards the running timer without creating a time entry.

**Response `200`:**
```json
{ "success": true }
```

Returns `200` even if no timer is running (idempotent).

### GET /api/organizations/{orgId}/time-entries

**Authentication:** required. Caller must have `ViewTimeTracking` capability.

**Query parameters:**
- `from` (date, required): start of range, inclusive. Format: `YYYY-MM-DD`.
- `to` (date, required): end of range, inclusive. Format: `YYYY-MM-DD`.
- `membershipId` (optional): filter by member. Admin/manager only. Omitted = caller's own entries. `user` role ignores this param.

**Response `200`:**
```json
{
  "entries": [
    {
      "id": "uuid",
      "membershipId": "uuid",
      "memberName": "Alex Kaminski",
      "projectId": "uuid",
      "projectName": "Project Alpha",
      "task": "API development",
      "description": "Working on endpoints",
      "date": "2026-08-25",
      "startTime": "2026-08-25T09:00:00Z",
      "endTime": "2026-08-25T11:30:00Z",
      "durationMinutes": 150,
      "createdAt": "2026-08-25T11:30:00Z"
    }
  ],
  "totalMinutes": 480
}
```

`entries` sorted by `date` ascending, then `startTime` ascending (nulls last within a day). `totalMinutes` is the sum across all entries in the response.

**Errors:**
- `400 Bad Request`: missing `from` or `to` — `{ "errors": { "from": "From date is required" } }`.
- `400 Bad Request`: range exceeds 31 days — `{ "error": "range_too_large", "message": "Date range cannot exceed 31 days" }`.
- `400 Bad Request`: `from` after `to` — `{ "error": "invalid_range", "message": "From date must be before or equal to to date" }`.
- `403 Forbidden`: `viewer` role.

### POST /api/organizations/{orgId}/time-entries

**Authentication:** required. Caller must have `ManageOwnTimeEntries` capability.

**Request:**
```json
{
  "membershipId": "uuid",
  "projectId": "uuid-or-null",
  "task": "API development",
  "description": "Working on endpoints",
  "date": "2026-08-25",
  "startTime": "09:00",
  "endTime": "11:30",
  "durationMinutes": null
}
```

- `membershipId` is optional. Omitted = caller's own membership. Providing another member's ID requires `ManageAllTimeEntries` (admin/manager).
- If `startTime` and `endTime` are provided, `durationMinutes` is auto-computed (request value ignored).
- If `startTime` and `endTime` are both null, `durationMinutes` is required.

**Response `201`:**
```json
{
  "id": "uuid",
  "membershipId": "uuid",
  "projectId": "uuid",
  "projectName": "Project Alpha",
  "task": "API development",
  "description": "Working on endpoints",
  "date": "2026-08-25",
  "startTime": "2026-08-25T09:00:00Z",
  "endTime": "2026-08-25T11:30:00Z",
  "durationMinutes": 150,
  "createdAt": "2026-08-25T11:30:00Z"
}
```

**Errors:**
- `400 Bad Request`: validation errors — `{ "errors": { "date": "Date is required", ... } }`.
- `403 Forbidden`: `viewer` role, or `user` creating for another member.
- `404 Not Found`: project not found.

### PUT /api/organizations/{orgId}/time-entries/{entryId}

**Authentication:** required.

**Authorization:** entry owner, or `admin`/`manager` for any entry.

**Request:** same shape as POST (excluding `membershipId` — cannot reassign entries).

**Response `200`:** full entry object.

**Errors:**
- `400 Bad Request`: validation errors.
- `403 Forbidden`: `user` editing another member's entry — `{ "error": "forbidden", "message": "You do not have permission to edit this time entry" }`.
- `404 Not Found`: entry not found.

### DELETE /api/organizations/{orgId}/time-entries/{entryId}

**Authentication:** required.

**Authorization:** entry owner, or `admin`/`manager` for any entry.

**Response `200`:**
```json
{ "success": true }
```

**Errors:**
- `403 Forbidden`: `user` deleting another member's entry — `{ "error": "forbidden", "message": "You do not have permission to delete this time entry" }`.
- `404 Not Found`: entry not found.

## Validation Rules

1. **date**: required, valid date. Error: "Date is required", "Invalid date".
2. **date**: not in the future. Error: "Date cannot be in the future".
3. **date**: not more than 90 days in the past. Error: "Date cannot be more than 90 days in the past".
4. **durationMinutes** (when no start/end): required, integer, min 1. Error: "Duration is required", "Duration must be at least 1 minute".
5. **durationMinutes**: max 1440 (24h). Error: "Duration cannot exceed 24 hours".
6. **startTime**: if provided, `endTime` is required. Error: "End time is required when start time is provided".
7. **endTime**: must be after `startTime`. Error: "End time must be after start time".
8. **task**: max 200 characters. Error: "Task must be at most 200 characters".
9. **description**: max 500 characters. Error: "Description must be at most 500 characters".
10. **projectId**: if provided, must reference an existing active project in the same org (exception: editing an entry that already references an archived project and the project is not being changed). Error: "Project not found or archived".
11. **from/to query range**: max 31 days. Error: "Date range cannot exceed 31 days".
12. **Timer task**: max 200 characters. Error: "Task must be at most 200 characters".
13. **Timer description**: max 500 characters. Error: "Description must be at most 500 characters".

Client-side validation: field-level on blur/submit. Duration auto-computes in time range mode.

Server-side validation: all rules enforced regardless of UI state.

## Error Messages

| Context | Message |
|---|---|
| Entry — date required | "Date is required" |
| Entry — date invalid | "Invalid date" |
| Entry — date future | "Date cannot be in the future" |
| Entry — date too old | "Date cannot be more than 90 days in the past" |
| Entry — duration required | "Duration is required" |
| Entry — duration min | "Duration must be at least 1 minute" |
| Entry — duration max | "Duration cannot exceed 24 hours" |
| Entry — end time required | "End time is required when start time is provided" |
| Entry — end before start | "End time must be after start time" |
| Entry — task too long | "Task must be at most 200 characters" |
| Entry — description too long | "Description must be at most 500 characters" |
| Entry — project invalid | "Project not found or archived" |
| Entry — forbidden edit | "You do not have permission to edit this time entry" |
| Entry — forbidden delete | "You do not have permission to delete this time entry" |
| Timer — already running | "A timer is already running. Stop it before starting a new one." |
| Timer — not running | "No timer is currently running" |
| Timer — project invalid | "Project not found or archived" |
| Query — from required | "From date is required" |
| Query — to required | "To date is required" |
| Query — range too large | "Date range cannot exceed 31 days" |
| Query — invalid range | "From date must be before or equal to to date" |
| Page — forbidden (viewer) | "You do not have access to time tracking" |
| Toast — entry saved | "Time entry saved" |
| Toast — entry deleted | "Time entry deleted" |
| Toast — timer started | "Timer started" |
| Toast — timer stopped | "Timer stopped — {duration} logged" |
| Toast — timer discarded | "Timer discarded" |
| Delete confirmation | "Delete this time entry? This action cannot be undone." |
| Discard confirmation | "Discard this timer? No time entry will be saved." |
| Network/server error | "Something went wrong. Please try again." |
| Empty state — no entries | "No time entries for this period." |
| Empty state — no entries (today) | "No time logged today. Start a timer or add an entry." |

## UI Description

### Time Tracking Page Layout

- Route: `/org/{orgId}/time-tracking`.
- Sidebar section: **TIME**, row: **Time Tracking**. Visible to `admin`, `manager`, `user`. The **TIME** group **leads the sidebar nav** (above PEOPLE and PROJECTS), as the daily-driver surface; it stays gated on `view-time-tracking`, so a `viewer` never sees it and lands on PEOPLE first.
- Page header: "Time Tracking" (no action button — timer and add entry are in the content area).
- Below the header: member filter (admin/manager only) and period navigation on the same row.
- View toggle: Daily / Weekly / Monthly tabs.
- Content area: the active view.
- Timer panel: always visible at the bottom of the content area (above the "Add entry" button).
- "Add entry" button: opens the Add Time Entry modal.

### Member Filter (admin/manager)

- Dropdown (`tt-member-filter`) showing all `active` members of the organization.
- Default selection: "My time" (the caller).
- Selecting a member reloads entries for that member.
- Not visible to `user` role.

### View Toggle

- Three segment buttons: Daily, Weekly, Monthly.
- Monthly is the default on first visit.
- Switching views preserves the selected date/period context (e.g. switching from a specific day to weekly shows the week containing that day).

### Monthly View Details

- Standard calendar grid: 7 columns, rows for weeks. The **first column and weekday-header order follow the caller's `firstDayOfWeek`** (Mon–Sun by default, or Sun–Sat when set to "Sunday"); see FR-32.
- Each cell: day number (top-left), total hours (bottom-right, in `Xh Ym` format, e.g. "8h 0m"). Empty days show "—".
- Today's cell has a distinct visual indicator (outline). Cell backgrounds use a heat tint proportional to logged hours; the numeric hours always accompany the tint (colour is never the sole signal).
- Weekend (Sat/Sun) cells are **not** muted — they render as regular available days (some members work weekends).
- Month total displayed below the grid.
- Clicking a day cell switches to daily view for that date.

### Weekly View Details

- An **Outlook-style time grid** over the week's seven days — an hour gutter plus one column per day. The **column order follows the caller's `firstDayOfWeek`** (see FR-32).
- **Timed entries** render as positioned blocks (top/height from start/end times, formatted and positioned in the viewer's account timezone — see §Timezone / FR-34–36); overlapping entries pack side-by-side. **Duration-only entries** render as chips in a strip below the grid.
- Blocks are **colour-coded per project**, with the project name always shown as text alongside the colour (accessibility — colour is never the sole signal).
- Each day-column header carries that day's total (`Xh Ym`); the week total appears below the grid. The daily, weekly, and monthly totals all use the same `Xh Ym` format. A now-line marks the current time in today's column.
- Clicking a block (or duration-only chip) switches to daily view for that day.

### Daily View Details

- An **Outlook-style time grid** for one day — an hour gutter plus a single wide day column. Timed entries render as positioned blocks; **duration-only** entries render as chips in a strip below the grid.
- Each block shows: time range, duration (`Xh Ym`), project name or "(no project)" · task, description (first line, truncated). Blocks are **colour-coded per project** with the project name always shown as text (colour is never the sole signal).
- Edit (pencil) and delete (trash) controls revealed on each block. For `user`: only on own entries. For admin/manager: on all entries. Clicking a block opens its editor.
- Day total shown in the column header. A now-line marks the current time when viewing today.

### Timer Panel

- Always visible on the TT page, positioned between the view content and the "Add entry" button.
- **Idle state:** project selector, task input, description input, "Start timer" button.
- **Running state:** elapsed time display (HH:MM:SS, updating every second), project/task/description fields (editable — saves on blur via `PUT .../timer`), "Discard" and "Stop & save" buttons.

### Add/Edit Time Entry Modal

- Mode toggle: "Time range" (default) / "Duration only".
- In time range mode: start time and end time inputs, computed duration shown below.
- In duration only mode: hours and minutes inputs.
- Project selector: shows active projects the user can access (filtered by assignment for `user` role).
- Date picker: defaults to today for new entries, defaults to the currently viewed day if in daily view.

### States

| State | Behavior |
|---|---|
| **Loading** | Skeleton matching the active view layout. |
| **Empty (no entries)** | The active view still renders — the monthly calendar / weekly grid / daily grid is shown with empty days and "0h 0m" totals (not a full-view replacement). A modest `tt-empty-state` note appears beneath it: "No time entries for this period." (or, on today's daily view, "No time logged today. Start a timer or add an entry."). |
| **Default** | Active view with entries. |
| **Timer running** | Timer panel in running state. Topbar indicator visible. |
| **Saving (modal/timer)** | Save/Start/Stop button disabled with loading indicator. |
| **Success** | Toast notification. Modal closes (if applicable). View refreshes. |
| **Error** | Error toast or inline error. Modal stays open. Buttons re-enable. |

### Responsive Behavior

Breakpoints follow the app shell (spec 00). The Time Tracking page has three layouts:

**Desktop (≥ 1024px):**
- Full sidebar with section labels.
- Quick actions bar on one row: project select + task input + Add entry + Start timer.
- Weekly view shows all 7 columns at natural width; time gutter 64px on the left.
- Daily view spans the full content width; entries are large enough to show task + description on two lines.
- Monthly calendar cells are square-ish with day number and hours side-by-side.
- Modals centered, 480–520px wide.

**Tablet (768–1023px):**
- Sidebar collapses to icon-only rail per app shell rule.
- Quick actions bar wraps: project + task on top row, action buttons on the second row.
- Weekly view: 7 columns still fit but columns are narrower; entry blocks show project name only (task hidden, revealed on hover/tap).
- Daily view: entry blocks show task + one line of description.
- Monthly cells slightly smaller; day number smaller, hours prominent.
- Modals stay centered at 480px.

**Mobile (< 768px):**
- This is a **responsive web app viewed in a mobile browser** — no native-app chrome, no iOS-style bottom sheets, no sticky bottom action bars (the mobile browser's own URL bar and gesture area sit there and would collide with them).
- Sidebar hidden; hamburger toggle in the topbar opens an overlay drawer sliding in from the left. Closes on scrim tap or Escape.
- **Quick actions bar** stays at the **top of the page content, right below the title** — it does not become sticky. It collapses vertically:
  1. Project select (full width, 40px height)
  2. Task input (full width, 40px height)
  3. Row of two buttons: `+ Add entry` (ghost) and `Start` (amber primary, 44px each)
  As the user scrolls the time grid, the quick-actions card scrolls out — the running timer is still reachable via the topbar timer indicator, so nothing critical is hidden.
- **Weekly view** collapses to a **single-day column** with a horizontally-scrollable day-strip at the top (7 tiles: day + date + hours). Tapping a tile switches days. Weekly-total is shown on the day-strip container.
- **Daily view** stays as a time grid but entry blocks shrink to show time + project + task on one line (description hidden — revealed on tap into edit).
- **Monthly view** shrinks cells to fit 7 across; each cell shows the day number and a thin colored bar proportional to hours (no numeric hours text unless the cell is tapped or the viewport is wide enough).
- **Topbar timer indicator** collapses to a compact pill: colored dot + elapsed time only, no project name. Tapping navigates to the Time Tracking page where the full running-timer card is visible.
- **Modals** stay as **standard centered web dialogs** — full width minus 12px page margins, top-anchored 56px from viewport top (so mobile keyboard doesn't push them off-screen), scrim covers the rest. No drag handle, no swipe-to-dismiss. Close on scrim tap, Escape, or Cancel.
- **Add Entry modal** on mobile stacks fields vertically at full width; the time-range / duration-only radio group becomes a segmented control (44px touch targets); Save/Cancel are equal-width 44px buttons at the bottom of the modal content.
- **Member filter** (admin/manager) becomes a full-width selector on its own row above the view toggle.
- **Timer running state** turns the quick-actions card into a highlighted amber card with the elapsed time chip (large, monospace) at the top, editable project/task below, and `Discard` / `Stop & save` as two equal-width buttons. Still not sticky — but the topbar pill guarantees the timer is always visible while browsing other pages.
- **Touch targets**: minimum 44 × 44 px hit area on every interactive element (icon buttons pad from 32px to 44px transparent hit box; segmented control buttons grow taller on touch devices).

**Timer behavior across devices:**
- The server-side `RunningTimer` is the single source of truth. Switching devices mid-timer (start on desktop, view on mobile) shows the same elapsed time everywhere.
- Client computes elapsed time from `startedAt` on load and every second thereafter. Time zone changes (traveling) do not affect elapsed calculation — it is a duration, not a wall-clock display.

**Accessibility (all breakpoints):**
- Time grid: entries are `<button>` elements with `aria-label` describing time range, project, task, and duration ("09:00 to 11:30, Project Alpha, API development, 2 hours 30 minutes").
- The now-line indicator has `role="separator"` with `aria-label="Current time, 14:30"`.
- Keyboard: `←/→` navigate periods; `1/2/3` switch views (daily/weekly/monthly); `Enter` on a slot opens Add Entry pre-filled; `Enter` on an entry opens edit.
- Timer indicator in topbar carries `aria-live="polite"` on the elapsed time (updates every minute, not every second, to avoid screen-reader spam).
- All colors used to distinguish projects are paired with a text label — color is never the sole signal.
- Modals trap focus; escape closes; focus returns to the trigger.
- Contrast ratios pass WCAG 2.1 AA.

## Required `data-testid` Attributes

**Sidebar:**
- `nav-time-tracking`

**Page:**
- `tt-page`, `tt-page-title`

**View toggle:**
- `tt-view-daily`, `tt-view-weekly`, `tt-view-monthly`

**Period navigation:**
- `tt-period-prev`, `tt-period-next`, `tt-period-label`

**Member filter:**
- `tt-member-filter`

**Monthly view:**
- `tt-calendar-grid`, `tt-calendar-cell-{YYYY-MM-DD}`, `tt-calendar-hours-{YYYY-MM-DD}`
- `tt-month-total`

**Weekly view:**
- `tt-weekly-grid`
- `tt-weekly-entry-{id}` (on each entry block and duration-only chip)
- `tt-weekly-day-total-{YYYY-MM-DD}`
- `tt-week-total`

**Daily view:**
- `tt-daily-list`
- `tt-entry-row-{id}`
- `tt-entry-edit-{id}`, `tt-entry-delete-{id}`
- `tt-day-total`

**Timer panel:**
- `tt-timer-panel`
- `tt-timer-project-select`, `tt-timer-task-input`, `tt-timer-description-input`
- `tt-timer-start-btn`, `tt-timer-stop-btn`, `tt-timer-discard-btn`
- `tt-timer-elapsed`

**Topbar timer indicator:**
- `topbar-timer-indicator`
- `topbar-timer-elapsed`, `topbar-timer-project`
- `topbar-timer-stop-btn`

**Add/Edit entry modal:**
- `tt-entry-modal`
- `tt-entry-project-select`, `tt-entry-task-input`, `tt-entry-date-input`
- `tt-entry-mode-timerange`, `tt-entry-mode-duration`
- `tt-entry-start-time`, `tt-entry-end-time`
- `tt-entry-duration-hours`, `tt-entry-duration-minutes`
- `tt-entry-duration-computed`
- `tt-entry-description-input`
- `tt-entry-save-btn`, `tt-entry-cancel-btn`
- `field-error-date`, `field-error-durationMinutes`, `field-error-startTime`, `field-error-endTime`, `field-error-task`, `field-error-description`, `field-error-projectId`

**Add entry button:**
- `tt-add-entry-btn`

**Loading / empty:**
- `tt-loading-skeleton`, `tt-empty-state`

**Toasts:**
- `toast-entry-saved`, `toast-entry-deleted`
- `toast-timer-started`, `toast-timer-stopped`, `toast-timer-discarded`

## Security

The API is the security boundary. The UI hides what a caller cannot do; the server enforces every rule again independently. Time tracking has additional attack surfaces (timer tampering, cross-member data leaks, time-range exfiltration) that require care beyond ordinary CRUD.

### Authentication & Authorization

1. **Every endpoint requires an authenticated session.** `SessionGuard` (spec 02) validates the JWT and re-reads the account's `securityStamp` on every request. A stamp rotation invalidates every session including any running timer's owner immediately on the next call.
2. **Every endpoint runs `OrgScopeGuard` after `SessionGuard`.** The `:orgId` path parameter must match `session.organizationId`; mismatch → `404`. Org enumeration is not possible via URL guessing.
3. **Capability check happens after guards.** `ViewTimeTracking`, `ManageOwnTimeEntries`, `ManageAllTimeEntries`, and `UseTimer` are checked per endpoint. Insufficient capability → `403`.
4. **The client role is never trusted.** Caller role is resolved from `Membership` in the database per request.

### Cross-organization protection (IDOR)

5. Every `timeEntryId`, `projectId`, `membershipId`, and `runningTimerId` is validated to belong to the caller's organization within the same transaction that reads or mutates it. Foreign resources return `404`, byte-for-byte identical to "does not exist".
6. `POST /time-entries` with a body `membershipId` (admin creating for another member) validates the target membership is `active` in the caller's org. Otherwise `404`.
7. `PUT/DELETE /time-entries/{id}`: the entry's `membershipId` is compared with `session.membershipId`. If different and the caller lacks `ManageAllTimeEntries` → `403`. This check happens **after** the org-scope validation, so cross-org attempts still return `404`.
8. `GET /time-entries?membershipId=...` for a `user` caller: the query param is silently ignored and always resolves to `session.membershipId`. No `403` — the value is treated as if omitted — to avoid confirming that another membership exists.

### Timer integrity

9. `RunningTimer.startedAt` is **always** set by the server from `NOW()` — the client cannot supply it. A body field `startedAt` is rejected as unknown.
10. Timer duration on stop is computed server-side: `durationMinutes = ceil((NOW() - startedAt) / 60000)`, minimum 1. The client's displayed elapsed time is decorative — the server never reads it back.
11. **One timer per member is enforced by a DB unique constraint** on `RunningTimer.membershipId`. Two concurrent `POST /timer/start` requests: one wins with 201, the other fails with 409 from the constraint, never both succeed. No application-level race window.
12. A timer belongs to exactly one membership. There is no code path where `RunningTimer.membershipId` is set from the request body — it always comes from `session.membershipId`. An admin cannot start a timer on behalf of another member (out of scope, and enforced by omitting the code path).
13. Modifying a running timer's metadata (`PUT /timer`) validates the timer belongs to the caller. Cross-user timer manipulation is impossible via API design.

### Input handling

14. `task` (max 200) and `description` (max 500) are validated server-side. Both are trimmed. Length is measured in Unicode codepoints, not bytes, so multi-byte characters can't be used to bypass limits.
15. All text output is rendered as React text nodes — no `dangerouslySetInnerHTML`. Stored XSS via task/description is not possible on the web client.
16. `projectId` in create/edit is validated: exists, belongs to the same org, is `active`. Exception: when editing an existing entry, the entry's existing archived project is allowed to remain (see FR-7). Attempting to **switch to** an archived project is rejected.
17. `date` is parsed strictly as `YYYY-MM-DD`. Out-of-range or malformed values are rejected before hitting the DB.
18. `startTime` / `endTime` are parsed as `HH:MM` wall-clock within the entry's `date` and converted to absolute UTC instants on save (`zonedWallClockToUtc`), interpreting the wall-clock in the creating caller's `Account.timezone` (spec 06), falling back to `'UTC'` when unset. Stored values are always absolute UTC instants; display re-projects them into the viewer's effective timezone (see §Timezone / FR-34–36).
19. Query enums (`?status=...`, view mode) are whitelisted server-side.

### Range query bounding

20. `GET /time-entries` requires `from` and `to`. The server rejects ranges > 31 days with `400 range_too_large`. This bounds:
    - **DB query cost** — no unbounded scans.
    - **Data exfiltration** — an attacker with a valid session cannot dump a year of entries in one call.
21. The `from` and `to` values are also validated as dates (not arbitrary strings). Reversed range (`from > to`) → `400`.

### CSRF & session

22. The `ds_session` cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production. `SameSite=Lax` blocks cross-origin form submits. All mutations require JSON body over `POST/PUT/PATCH/DELETE` — no cross-origin "simple" request can trigger them.
23. Password change/reset rotates `securityStamp` (spec 02). On the next timer request the guard fails, the session is invalid, and the running timer becomes inaccessible via that browser. The DB row survives — the account holder can log in again and either stop or discard it.

### Concurrency & audit

24. `CreatedByAccountId` on `TimeEntry` is set from `session.accountId`, never from the body. When an admin creates an entry for another member, `MembershipId = target.id` but `CreatedByAccountId = admin.accountId` — a clean audit trail of who acted for whom.
25. Deleting a member (spec 04) cascades to `TimeEntry`, `RunningTimer`, and `ProjectMember` via `ON DELETE CASCADE`. No dangling references.
26. Concurrent edits to the same time entry: last write wins on `UpdatedAt`. No entry versioning in v1 — the audit trail lives in application logs (below).

### Rate limiting

27. **Timer start** is rate-limited per session: **10 requests / minute**. Repeated 409s from timer-already-running or repeated start/stop cycling is bounded. Exceeded → `429`.
28. **Mutation endpoints** (time-entries POST/PUT/DELETE, timer PUT/DELETE): **60 requests / minute** per session.
29. **List endpoint** (`GET /time-entries`): **120 requests / minute** per session.

### Logging

30. Every mutation logs: caller `accountId`, `organizationId`, action, target ID (entry or timer), and outcome. No `task`, `description`, or project name text in logs.
31. Failed authorization (403 on ownership, 404 on scope) is logged at `warn` with the caller `accountId` and target ID for anomaly detection.
32. Timer-related events (start / stop / discard / auto-cancel on membership removal) are logged at `info` with duration on stop. These form an event trail that is queryable for compliance without exposing content.

### Privacy

33. `GET /timer` returns only the caller's timer. There is no endpoint that returns other members' running timers (admins/managers see other members' **completed** entries only).
34. Member filter (admin/manager) does not leak PII in error paths: a `membershipId` for a removed member returns the same shape as a valid member with zero entries — the fact of removal is not disclosed via this endpoint.
35. Time entry responses include `memberName` (first + last) only when the caller has `ManageAllTimeEntries`. A `user` never sees another member's name in a time entry payload — because they can never fetch another member's entries in the first place.

## Out of Scope

- Approval / submission flow for timesheets.
- Billable vs non-billable hours.
- Overtime rules or hour caps per day/week.
- Splitting timer entries that span midnight across two dates.
- Multiple concurrent timers per member.
- WebSocket or polling for timer updates (client computes elapsed from `startedAt`).
- Time entry overlap validation (multiple entries can overlap).
- Detailed reporting / analytics / export (future spec).
- Offline timer support.
- Public holiday awareness for working day calculations.
- Entry-level comments or notes from reviewers.
- `viewer` access to any time tracking feature.
- Timer for another member (admin/manager start timer on behalf of someone else).

## Test Cases

### TC-12-UNIT-01: Duration computation from start/end times

- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Compute duration for start=09:00, end=11:30.
  2. Compute duration for start=09:00, end=09:01.
  3. Compute duration for start=00:00, end=23:59.
- **Expected Result:**
  1. 150 minutes.
  2. 1 minute.
  3. 1439 minutes.

### TC-12-UNIT-02: Timer elapsed time formatting

- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Format 0 seconds elapsed → "00:00:00".
  2. Format 3661 seconds elapsed → "01:01:01".
  3. Format 86399 seconds elapsed → "23:59:59".
- **Expected Result:**
  1–3. Correct `HH:MM:SS` strings.

### TC-12-UNIT-03: Timer duration computation (stop)

- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Compute for 30 seconds elapsed → 1 minute (ceil).
  2. Compute for 61 seconds → 2 minutes.
  3. Compute for 7200 seconds → 120 minutes.
- **Expected Result:**
  1. 1 minute (minimum).
  2. 2 minutes.
  3. 120 minutes.

### TC-12-INT-01: Start timer — happy path

- **Level:** Integration
- **Preconditions:** org with user U, active project P (U assigned).
- **Steps:**
  1. As U, `POST /api/organizations/{orgId}/timer/start` with `{ "projectId": "{P.id}", "task": "Coding" }`.
  2. As U, `GET /api/organizations/{orgId}/timer`.
- **Expected Result:**
  1. HTTP 201 with `{ id, projectId, projectName, task: "Coding", startedAt }`.
  2. HTTP 200 with `timer` matching the started timer.

### TC-12-INT-02: Start timer — already running returns 409

- **Level:** Integration
- **Preconditions:** user U with a running timer.
- **Steps:**
  1. As U, `POST .../timer/start` with `{}`.
- **Expected Result:**
  1. HTTP 409 with `{ "error": "timer_already_running" }`.

### TC-12-INT-03: Stop timer — creates time entry

- **Level:** Integration
- **Preconditions:** user U with a running timer started ~5 minutes ago on project P.
- **Steps:**
  1. As U, `POST .../timer/stop`.
  2. As U, `GET .../timer`.
  3. As U, `GET .../time-entries?from={today}&to={today}`.
- **Expected Result:**
  1. HTTP 200 with `timeEntry` containing `durationMinutes >= 5`, `projectId: P.id`, `date: today`.
  2. `timer: null`.
  3. Entries include the newly created entry.

### TC-12-INT-04: Stop timer — no timer running returns 404

- **Level:** Integration
- **Preconditions:** user U with no running timer.
- **Steps:**
  1. As U, `POST .../timer/stop`.
- **Expected Result:**
  1. HTTP 404 with `{ "error": "no_timer" }`.

### TC-12-INT-05: Discard timer — no entry created

- **Level:** Integration
- **Preconditions:** user U with a running timer.
- **Steps:**
  1. As U, `DELETE .../timer`.
  2. As U, `GET .../timer`.
  3. As U, `GET .../time-entries?from={today}&to={today}`.
- **Expected Result:**
  1. HTTP 200 `{ success: true }`.
  2. `timer: null`.
  3. No new entry from the discarded timer.

### TC-12-INT-06: Update running timer metadata

- **Level:** Integration
- **Preconditions:** user U with running timer (project P1, task "Old").
- **Steps:**
  1. As U, `PUT .../timer` with `{ "projectId": "{P2.id}", "task": "New" }`.
  2. As U, `GET .../timer`.
- **Expected Result:**
  1. HTTP 200 with updated projectId and task. `startedAt` unchanged.
  2. Timer reflects P2 and "New".

### TC-12-INT-07: Create manual entry — duration only

- **Level:** Integration
- **Preconditions:** user U, active project P (U assigned).
- **Steps:**
  1. As U, `POST .../time-entries` with `{ "projectId": "{P.id}", "task": "Meeting", "date": "{today}", "durationMinutes": 60 }`.
- **Expected Result:**
  1. HTTP 201 with `durationMinutes: 60`, `startTime: null`, `endTime: null`.

### TC-12-INT-08: Create manual entry — time range

- **Level:** Integration
- **Preconditions:** user U, active project P (U assigned).
- **Steps:**
  1. As U, `POST .../time-entries` with `{ "projectId": "{P.id}", "date": "{today}", "startTime": "09:00", "endTime": "11:30" }`.
- **Expected Result:**
  1. HTTP 201 with `durationMinutes: 150`, `startTime` and `endTime` set.

### TC-12-INT-09: Create entry — validation errors

- **Level:** Integration
- **Preconditions:** user U.
- **Steps:**
  1. No date → 400.
  2. Date tomorrow → 400 "Date cannot be in the future".
  3. Date 91 days ago → 400 "Date cannot be more than 90 days in the past".
  4. durationMinutes: 0 → 400.
  5. durationMinutes: 1441 → 400.
  6. startTime "09:00" with no endTime → 400.
  7. startTime "11:00", endTime "09:00" → 400 "End time must be after start time".
  8. task: 201 chars → 400.
- **Expected Result:**
  1–8. HTTP 400 with relevant error messages.

### TC-12-INT-10: Edit entry — owner can edit

- **Level:** Integration
- **Preconditions:** user U with entry E.
- **Steps:**
  1. As U, `PUT .../time-entries/{E.id}` with `{ "task": "Updated", "date": "{E.date}", "durationMinutes": 90 }`.
- **Expected Result:**
  1. HTTP 200 with `task: "Updated"`, `durationMinutes: 90`.

### TC-12-INT-11: Edit entry — admin can edit anyone's

- **Level:** Integration
- **Preconditions:** admin A, user U with entry E.
- **Steps:**
  1. As A, `PUT .../time-entries/{E.id}` with updated task.
- **Expected Result:**
  1. HTTP 200 with updated values.

### TC-12-INT-12: Edit entry — user cannot edit another's

- **Level:** Integration
- **Preconditions:** users U1 and U2 in same org. U2 has entry E.
- **Steps:**
  1. As U1, `PUT .../time-entries/{E.id}` with updated task.
- **Expected Result:**
  1. HTTP 403 with `{ "error": "forbidden" }`.

### TC-12-INT-13: Delete entry — owner can delete

- **Level:** Integration
- **Preconditions:** user U with entry E.
- **Steps:**
  1. As U, `DELETE .../time-entries/{E.id}`.
  2. As U, `GET .../time-entries?from={E.date}&to={E.date}`.
- **Expected Result:**
  1. HTTP 200 `{ success: true }`.
  2. Entry E not in the response.

### TC-12-INT-14: Delete entry — user cannot delete another's

- **Level:** Integration
- **Preconditions:** users U1 and U2. U2 has entry E.
- **Steps:**
  1. As U1, `DELETE .../time-entries/{E.id}`.
- **Expected Result:**
  1. HTTP 403.

### TC-12-INT-15: List entries — user sees own, admin sees filtered

- **Level:** Integration
- **Preconditions:** admin A and user U both have entries today.
- **Steps:**
  1. As U, `GET .../time-entries?from={today}&to={today}` → only U's entries.
  2. As U, `GET .../time-entries?from={today}&to={today}&membershipId={A.id}` → still only U's entries (param ignored).
  3. As A, `GET .../time-entries?from={today}&to={today}` → only A's entries (default to own).
  4. As A, `GET .../time-entries?from={today}&to={today}&membershipId={U.id}` → U's entries.
- **Expected Result:**
  1–4. Correct entry sets as described.

### TC-12-INT-16: List entries — viewer gets 403

- **Level:** Integration
- **Preconditions:** viewer V.
- **Steps:**
  1. As V, `GET .../time-entries?from={today}&to={today}`.
- **Expected Result:**
  1. HTTP 403.

### TC-12-INT-17: List entries — range exceeding 31 days returns 400

- **Level:** Integration
- **Preconditions:** user U.
- **Steps:**
  1. As U, `GET .../time-entries?from=2026-08-01&to=2026-09-02` (32 days).
- **Expected Result:**
  1. HTTP 400 with `{ "error": "range_too_large" }`.

### TC-12-INT-18: Timer survives across requests

- **Level:** Integration
- **Preconditions:** user U starts a timer.
- **Steps:**
  1. As U, `POST .../timer/start`.
  2. Wait a few seconds.
  3. As U (new HTTP request), `GET .../timer`.
- **Expected Result:**
  3. Returns the running timer with the original `startedAt`.

### TC-12-INT-19: Create entry for another member (admin)

- **Level:** Integration
- **Preconditions:** admin A, user U, active project P.
- **Steps:**
  1. As A, `POST .../time-entries` with `{ "membershipId": "{U.id}", "projectId": "{P.id}", "date": "{today}", "durationMinutes": 60 }`.
  2. As U, `GET .../time-entries?from={today}&to={today}`.
- **Expected Result:**
  1. HTTP 201 with `membershipId: U.id`.
  2. Entry appears in U's list.

### TC-12-INT-20: User cannot create entry for another member

- **Level:** Integration
- **Preconditions:** users U1 and U2.
- **Steps:**
  1. As U1, `POST .../time-entries` with `{ "membershipId": "{U2.id}", "date": "{today}", "durationMinutes": 60 }`.
- **Expected Result:**
  1. HTTP 403.

### TC-12-INT-21: Start timer with archived project — rejected

- **Level:** Integration
- **Preconditions:** user U, archived project P.
- **Steps:**
  1. As U, `POST .../timer/start` with `{ "projectId": "{P.id}" }`.
- **Expected Result:**
  1. HTTP 400 with `{ "error": "invalid_project" }`.

### TC-12-INT-22: Cross-org time entry access returns 404 (not 403)

- **Level:** Integration
- **Preconditions:** two orgs A and B. Admin in A. Entry E exists in B.
- **Steps:**
  1. As admin of A, `GET /api/organizations/{A.id}/time-entries?from={E.date}&to={E.date}` — returns admin's own entries.
  2. As admin of A, `PUT /api/organizations/{A.id}/time-entries/{E.id}` with valid body.
  3. As admin of A, `DELETE /api/organizations/{A.id}/time-entries/{E.id}`.
- **Expected Result:**
  1. HTTP 200 with A's entries, E not included.
  2–3. HTTP 404, identical to a nonexistent ID.

### TC-12-INT-23: Concurrent timer starts — DB constraint wins the race

- **Level:** Integration
- **Preconditions:** user U with no running timer.
- **Steps:**
  1. Fire two concurrent `POST .../timer/start` requests from U's session.
- **Expected Result:**
  1. Exactly one HTTP 201, the other HTTP 409 timer_already_running (from unique constraint violation on `RunningTimer.membershipId`). Never both 201.

### TC-12-INT-24: Timer startedAt cannot be forged by the client

- **Level:** Integration
- **Preconditions:** user U with no running timer.
- **Steps:**
  1. As U, `POST .../timer/start` with body `{ "startedAt": "2020-01-01T00:00:00Z", "task": "Backdated" }`.
- **Expected Result:**
  1. HTTP 201. Server sets `startedAt = NOW()`. The unknown `startedAt` field in the body is silently ignored (or rejected with 400 depending on strict-schema policy). `GET .../timer` returns `startedAt` within a few seconds of the current time.

### TC-12-INT-25: User's membershipId filter is silently ignored (no info leak)

- **Level:** Integration
- **Preconditions:** users U1 and U2, both with entries today.
- **Steps:**
  1. As U1, `GET .../time-entries?from={today}&to={today}&membershipId={U2.id}`.
- **Expected Result:**
  1. HTTP 200 with U1's entries only. No 403, no error mentioning U2. The response is identical to a query without the param.

### TC-12-INT-26: Date range > 31 days rejected (exfiltration bound)

- **Level:** Integration
- **Preconditions:** user U.
- **Steps:**
  1. `GET .../time-entries?from=2026-01-01&to=2026-12-31`.
- **Expected Result:**
  1. HTTP 400 with `{ "error": "range_too_large" }`. No entries returned.

### TC-12-INT-27: Duration computation is server-side on stop (client cannot inflate)

- **Level:** Integration
- **Preconditions:** user U starts a timer. Real elapsed time: ~30 seconds.
- **Steps:**
  1. As U, `POST .../timer/stop` — no body.
  2. Attempt: as U, `POST .../timer/stop` with body `{ "durationMinutes": 480 }`.
- **Expected Result:**
  1. HTTP 200 with `durationMinutes: 1` (30s ceils to 1min).
  2. Body is ignored — server always computes from `startedAt`. Result identical to step 1.

### TC-12-INT-28: Task input length is measured in codepoints, not bytes

- **Level:** Integration
- **Preconditions:** user U.
- **Steps:**
  1. As U, `POST .../time-entries` with `task` = 200 emoji characters (each is 4 UTF-8 bytes).
  2. As U, `POST .../time-entries` with `task` = 201 emoji characters.
- **Expected Result:**
  1. HTTP 201 (200 codepoints is at the limit, exactly).
  2. HTTP 400 with `task` length error.

### TC-12-INT-29: Timer start rate limit — 11th request in a minute is throttled

- **Level:** Integration
- **Preconditions:** user U with clean rate-limit bucket.
- **Steps:**
  1. Cycle start/stop 10 times within 30 seconds.
  2. Attempt an 11th start.
- **Expected Result:**
  1. 10 × 201 on start, 10 × 200 on stop.
  2. HTTP 429 with `Retry-After` header.

### TC-12-INT-30: Membership removal cascades to running timer

- **Level:** Integration
- **Preconditions:** user U with a running timer.
- **Steps:**
  1. As admin, remove U from the org (spec 04).
  2. As admin, `GET .../timer` for U — not directly possible via API; verify via DB inspection or via U's session after re-login attempt.
- **Expected Result:**
  1. `RunningTimer` row for U is deleted by `ON DELETE CASCADE`. `TimeEntry` rows survive.
  2. If U somehow reconnects (should fail due to membership status), no dangling timer state exists.

### TC-12-INT-31: Archived project cannot be selected on new entry

- **Level:** Integration
- **Preconditions:** user U, archived project P (U was assigned before archive).
- **Steps:**
  1. As U, `POST .../time-entries` with `{ "projectId": "{P.id}", "date": "{today}", "durationMinutes": 60 }`.
- **Expected Result:**
  1. HTTP 400 with `{ "error": "invalid_project" }`. Existing entries on P are preserved unchanged.

### TC-12-E2E-01: Start timer, see topbar indicator, stop and verify entry

- **Level:** E2E
- **Preconditions:** logged in as user. Assigned to "Project Alpha".
- **Steps:**
  1. Navigate to Time Tracking page.
  2. In Timer panel, select "Project Alpha", enter task "Coding".
  3. Click "Start timer".
  4. Verify timer panel shows elapsed time counting up.
  5. Verify topbar timer indicator appears with "Project Alpha".
  6. Navigate to Members page. Verify topbar indicator still visible.
  7. Click stop button in topbar.
  8. Verify toast "Timer stopped — {duration} logged". Indicator disappears.
  9. Navigate back to Time Tracking. Switch to daily view for today.
  10. Verify new entry with "Project Alpha", task "Coding", duration matching elapsed time.
- **Selectors:** `nav-time-tracking`, `tt-timer-panel`, `tt-timer-project-select`, `tt-timer-task-input`, `tt-timer-start-btn`, `tt-timer-elapsed`, `topbar-timer-indicator`, `topbar-timer-project`, `topbar-timer-stop-btn`, `toast-timer-stopped`, `tt-view-daily`, `tt-entry-row-{id}`.

### TC-12-E2E-02: Create manual time entry via modal

- **Level:** E2E
- **Preconditions:** logged in as user. Assigned to "Project Alpha".
- **Steps:**
  1. Navigate to Time Tracking, switch to daily view.
  2. Click "Add entry".
  3. Select "Project Alpha", enter task "Meeting", switch to "Duration only", enter 1h 30m.
  4. Click "Save entry".
  5. Verify toast "Time entry saved". Verify entry appears in daily list.
  6. Click edit on the entry. Change task to "Standup". Click "Save changes".
  7. Verify toast "Time entry saved". Verify entry updated.
- **Selectors:** `tt-view-daily`, `tt-add-entry-btn`, `tt-entry-modal`, `tt-entry-project-select`, `tt-entry-task-input`, `tt-entry-mode-duration`, `tt-entry-duration-hours`, `tt-entry-duration-minutes`, `tt-entry-save-btn`, `toast-entry-saved`, `tt-entry-row-{id}`, `tt-entry-edit-{id}`.

### TC-12-E2E-03: Monthly view — navigate months, click day opens daily

- **Level:** E2E
- **Preconditions:** logged in as user with entries in August 2026.
- **Steps:**
  1. Navigate to Time Tracking. Verify monthly view is default.
  2. Verify calendar grid shows hours on days with entries.
  3. Click "next month" arrow. Verify September 2026 shown.
  4. Click "previous month" twice. Verify July 2026 shown.
  5. Navigate back to August. Click a day cell with hours.
  6. Verify switches to daily view for that date. Verify entries shown.
- **Selectors:** `tt-view-monthly`, `tt-calendar-grid`, `tt-calendar-cell-{date}`, `tt-calendar-hours-{date}`, `tt-period-prev`, `tt-period-next`, `tt-period-label`, `tt-view-daily`, `tt-daily-list`.

### TC-12-E2E-04: Weekly view — time grid with entry blocks

- **Level:** E2E
- **Preconditions:** logged in as user with timed entries on multiple projects this week.
- **Steps:**
  1. Switch to weekly view.
  2. Verify the time grid renders (`tt-weekly-grid`) with the week's day columns.
  3. Verify each timed entry renders as a block (`tt-weekly-entry-{id}`).
  4. Verify per-day totals in the day-column headers (`tt-weekly-day-total-{date}`).
  5. Verify the week total is shown (`tt-week-total`).
- **Selectors:** `tt-view-weekly`, `tt-weekly-grid`, `tt-weekly-entry-{id}`, `tt-weekly-day-total-{date}`, `tt-week-total`.

### TC-12-E2E-05: Daily view — edit and delete entries

- **Level:** E2E
- **Preconditions:** logged in as user with two entries today.
- **Steps:**
  1. Switch to daily view for today.
  2. Click delete on one entry. Confirm.
  3. Verify toast "Time entry deleted". Verify entry removed.
  4. Verify day total updated.
- **Selectors:** `tt-view-daily`, `tt-entry-delete-{id}`, `toast-entry-deleted`, `tt-day-total`.

### TC-12-E2E-06: Admin filters by member

- **Level:** E2E
- **Preconditions:** logged in as admin. User "Alex" has entries today.
- **Steps:**
  1. Navigate to Time Tracking. Verify own entries shown.
  2. Open member filter. Select "Alex Kaminski".
  3. Verify Alex's entries shown. Verify edit/delete buttons visible.
  4. Edit one of Alex's entries. Change task. Save.
  5. Verify toast "Time entry saved". Verify entry updated.
- **Selectors:** `tt-member-filter`, `tt-daily-list`, `tt-entry-edit-{id}`, `tt-entry-modal`, `tt-entry-save-btn`, `toast-entry-saved`.

### TC-12-E2E-07: Timer persists after page reload

- **Level:** E2E
- **Preconditions:** logged in as user.
- **Steps:**
  1. Start a timer with project "Alpha", task "Coding".
  2. Reload the page.
  3. Verify timer panel shows running state with elapsed time > 0.
  4. Verify topbar indicator visible.
  5. Stop the timer. Verify entry created.
- **Selectors:** `tt-timer-start-btn`, `tt-timer-elapsed`, `topbar-timer-indicator`, `tt-timer-stop-btn`, `toast-timer-stopped`.

### TC-12-E2E-08: Admin edits another member's entry

- **Level:** E2E
- **Preconditions:** logged in as admin. User "Alex" has an entry.
- **Steps:**
  1. Filter to Alex's entries.
  2. Click edit on Alex's entry.
  3. Change the duration. Save.
  4. Verify updated entry.
- **Selectors:** `tt-member-filter`, `tt-entry-edit-{id}`, `tt-entry-modal`, `tt-entry-save-btn`, `toast-entry-saved`.

### TC-12-E2E-09: Viewer cannot access TT page

- **Level:** E2E
- **Preconditions:** logged in as viewer.
- **Steps:**
  1. Observe sidebar. Verify "Time Tracking" row is not present.
  2. Navigate directly to `/org/{orgId}/time-tracking`.
- **Expected Result:**
  1. No "Time Tracking" nav item in sidebar.
  2. Redirected or shown 404/forbidden page.
- **Selectors:** `app-sidebar`.

### TC-12-E2E-10: Discard timer — no entry saved

- **Level:** E2E
- **Preconditions:** logged in as user with a running timer.
- **Steps:**
  1. Click "Discard" in the Timer panel.
  2. Confirm in the dialog.
  3. Verify toast "Timer discarded". Timer panel returns to idle.
  4. Verify topbar indicator gone.
  5. Verify no new entry in daily view.
- **Selectors:** `tt-timer-discard-btn`, `toast-timer-discarded`, `tt-timer-panel`, `topbar-timer-indicator`, `tt-daily-list`.

### TC-12-E2E-11: Validation errors in Add Entry modal

- **Level:** E2E
- **Preconditions:** logged in as user.
- **Steps:**
  1. Click "Add entry". Leave all fields empty. Click "Save entry".
  2. Verify inline error on date field.
  3. Enter a date in the future. Verify error "Date cannot be in the future".
  4. Enter valid date. Select "Duration only". Enter 0 hours 0 minutes. Click save.
  5. Verify error "Duration must be at least 1 minute".
  6. Enter valid duration. Click save. Verify success.
- **Selectors:** `tt-add-entry-btn`, `tt-entry-modal`, `tt-entry-save-btn`, `field-error-date`, `field-error-durationMinutes`, `toast-entry-saved`.
