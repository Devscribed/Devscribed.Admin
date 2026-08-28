---
id: "15"
title: Time Tracking ↔ Tasks Integration
routes: ["/org/{orgId}/time-tracking", "/org/{orgId}/projects/{projectId}/tasks/{taskId}"]
api:
  - "POST   .../timer/start"
  - "PUT    .../timer"
  - "POST   .../time-entries"
  - "PUT    .../time-entries/{id}"
  - "GET    .../projects/{projectId}/tasks/{taskId}"
  - "GET    .../projects/{projectId}/tasks/search"
entities: [TimeEntry, RunningTimer]
tags: [time-tracking, tasks, kanban, task-selector, time-logged]
depends-on: ["12", "13"]
---

# 15 — Time Tracking ↔ Tasks Integration

## Summary

Time tracking (spec 12) and task management (spec 13) are connected: instead of typing free text into the `task` field, a member can select an actual task from a project's board. Selecting a task links the time entry or running timer to that task via a new `taskId` field and auto-fills the free-text `task` label from the task's key and title. The task detail page gains a "Time Logged" section that aggregates and lists time entries recorded against it, and a "Start Timer" shortcut that pre-fills the timer with the task's project and task.

This is a pure extension — no new entities, no new tables. It modifies `TimeEntry` and `RunningTimer` (spec 12) and the task detail endpoint (spec 13).

**Depends on:** Spec 12 (Time Tracking), Spec 13 (Kanban Board & Tasks).

## Actors & Preconditions

- **Actors:** Same actors as spec 12 — `admin`, `manager`, and `user` log time and use the timer; `admin`/`manager` additionally view/edit all members' entries. `viewer` has no access.
- **Preconditions:**
  - Organization has at least one project with a `key` set (spec 13) and at least one task, for the task selector to be usable.
  - Projects without a key have no board/tasks (spec 13, FR-2); their time entries and timers can never carry a `taskId` — the task selector never appears for them.
  - Caller must be an `active` member of the organization.

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| Select a task on own time entry/timer | ✅ | ✅ | ✅¹ | ❌ |
| Select a task on another member's time entry (admin/manager editing) | ✅ | ✅ | ❌ | ❌ |
| Search tasks within a project | ✅ | ✅ | ✅¹ | ❌ |
| View time logged on a task (own entries only) | ✅ | ✅ | ✅ | ❌ |
| View time logged on a task (all members' entries) | ✅ | ✅ | ❌ | ❌ |
| Start a timer from a task's detail page | ✅ | ✅ | ✅¹ | ❌ |

¹ `user` role is scoped to projects they are assigned to via `ProjectMember` (spec 11/13) — identical to the existing project-visibility rule from spec 12 FR-8 and the board-access rule from spec 13.

## Functional Requirements

### Task Linking

- **FR-1.** `TimeEntry` and `RunningTimer` each gain an optional `taskId` referencing `Task` (spec 13). Both remain valid without a `taskId` — nothing here is required.
- **FR-2.** `taskId` and the free-text `task` field are not independently free-form when `taskId` is set: providing `taskId` causes the server to **compute and overwrite** `task` from the referenced task as `"{Project.key}-{Task.taskNumber}: {Task.title}"` (e.g., `"MOB-5: Fix login bug"`), regardless of any `task` value sent in the same request. Client-supplied `task` text is ignored whenever `taskId` is present in the request body.
- **FR-3.** The computed `task` label is a **snapshot taken at write time** — it is not live-synced. If the underlying task is later renamed, previously written `task` text on time entries/timer does not change until that entry or the timer is saved again (which recomputes it from the then-current task).
- **FR-4.** `taskId` requires `projectId` to be set in the same request. If `projectId` is null/omitted while `taskId` is provided, the request is rejected with 400.
- **FR-5.** `taskId`, when provided, must reference a `Task` (spec 13) whose `projectId` equals the request's `projectId`. A task from a different project is rejected with 400.
- **FR-6.** Clearing `taskId` (explicitly sending `taskId: null` on an update) unlinks the entry/timer from the task. The existing `task` free-text value is **preserved as-is** and becomes editable again — it is not cleared.
- **FR-7.** `user` role: `taskId` must reference a task in a project the caller is assigned to via `ProjectMember` (same rule as spec 12 FR-8 for `projectId`, and spec 13's project-membership rule for board/task access). Selecting a task from an unassigned project is rejected with 400/403 per the existing project-visibility boundary.
- **FR-8.** When the referenced `Task` is hard-deleted (spec 13 FR-21), `taskId` on every `TimeEntry` and `RunningTimer` that referenced it is set to `null` (`onDelete: SetNull`). The `task` free-text label — already a snapshot per FR-3 — is **not** cleared or altered by the deletion.
- **FR-9.** Starting, updating, or stopping a timer with `taskId` behaves identically to time entries: FR-2 through FR-8 apply equally to `RunningTimer`. When a timer with `taskId` set is stopped (spec 12 FR-14), the resulting `TimeEntry` carries the same `taskId` and the same computed `task` snapshot (recomputed at stop time from the then-current task, in case the task changed while the timer was running).

### Task Selector UI

- **FR-10.** In the Timer panel (idle or running state) and in the Add/Edit Time Entry modal, once a project with a `key` (board-enabled, spec 13) is selected, a **task selector** field appears below the project selector.
- **FR-11.** The task selector is a searchable dropdown. Typing filters tasks in the selected project by key or title (case-insensitive substring match), server-side, via the task search endpoint (see API Contracts). It shows up to 20 matches, each with a type icon (spec 13 iconography), key, and title.
- **FR-12.** Selecting a task sets `taskId` and immediately auto-fills the `task` text field with the computed label (FR-2); the `task` text input becomes **read-only** while a task is selected — it can no longer be typed into directly.
- **FR-13.** A "clear" affordance (✕) on the task selector removes the selection, clears `taskId`, and makes the `task` text field editable again, retaining its current (previously auto-filled) text per FR-6.
- **FR-14.** Changing the project after a task was selected clears the task selection (a task belongs to exactly one project, so a stale selection would violate FR-5). The `task` free-text field retains its current text and becomes editable.
- **FR-15.** If the selected project has no `key` (no board), the task selector is hidden entirely and `task` behaves as plain free text, unchanged from spec 12.
- **FR-16.** Clearing the project (setting it back to "No project") also clears any task selection, since `taskId` requires `projectId` (FR-4).

### Time Logged on Task Detail

- **FR-17.** The task detail page (spec 13) gains a "Time Logged" section showing:
  - **Total time logged**: sum of `durationMinutes` across all `TimeEntry` rows with this `taskId`, formatted as `Xh Ym`.
  - **Recent time entries**: up to 10 most recent entries (sorted by `date` desc, then `createdAt` desc), each showing date, duration (`Xh Ym`), and the logging member's name.
  - Each entry links to the Time Tracking page's daily view for that entry's date (`/org/{orgId}/time-tracking?view=daily&date={date}`).
- **FR-18.** Visibility of the aggregate and the entry list follows spec 12's viewing rules: a `user` sees only their **own** entries against the task (both in the total and the list); `admin`/`manager` see **all** members' entries against the task. `viewer` cannot reach the task detail page at all (spec 13).
- **FR-19.** The section shows an empty state ("No time logged on this task yet.") when there are zero visible entries for the caller.
- **FR-20.** The total and the list only ever include entries whose `taskId` currently points at this task — entries whose task link was cleared (FR-6) or nulled by deletion (FR-8) no longer count, even though their `task` text still mentions the (possibly stale) key/title.

### Starting a Timer from a Task

- **FR-21.** The task detail page shows a "Start Timer" button when the caller has the `UseTimer` capability (spec 12) and no timer is already running for the caller.
- **FR-22.** Clicking "Start Timer" calls `POST .../timer/start` with `projectId` set to the task's project and `taskId` set to the task's id. `task` is omitted in the request — the server computes it per FR-2.
- **FR-23.** If the caller already has a running timer, "Start Timer" is replaced by a disabled state or hidden per spec 12's existing one-timer-per-member rule (spec 12 FR-11); attempting to start anyway follows spec 12's existing 409 behavior.
- **FR-24.** On success, the same feedback as starting a timer elsewhere applies: toast "Timer started" (spec 12), topbar indicator appears, and the task detail page reflects the running state (the "Start Timer" button becomes a "Timer running" indicator linking to the Time Tracking page).

## Data Model

### Modified: TimeEntry (spec 12)

| Field | Type | Description |
|---|---|---|
| `taskId` | String? (FK → Task) | References `Task.id` (spec 13). `onDelete: SetNull`. Nullable — most entries have no task link. Must belong to the same project as `projectId` when set (FR-5). |

New index: `@@index([taskId])`.

### Modified: RunningTimer (spec 12)

| Field | Type | Description |
|---|---|---|
| `taskId` | String? (FK → Task) | References `Task.id` (spec 13). `onDelete: SetNull`. Nullable. Must belong to the same project as `projectId` when set (FR-5). Carried over to the `TimeEntry` created on stop (FR-9). |

New index: `@@index([taskId])`.

No changes to `Task` (spec 13) or `BoardColumn` (spec 13). No new entities, no new capabilities — this spec reuses `UseTimer`, `ManageOwnTimeEntries`, `ManageAllTimeEntries`, `ViewTimeTracking` (spec 12) and `view-board`, `manage-tasks` (spec 13).

## Screens

### Task Selector — Timer Panel (running state, task selected)

```
┌─ Timer ─────────────────────────────────────────┐
│                                                   │
│          ⏱  01:23:45                              │
│          Project Alpha · MOB-5: Fix login bug     │
│                                                   │
│  [ Project Alpha    ▾ ]                           │
│  [ 🔵 MOB-5: Fix login bug              ✕ ]       │
│  [ Working on the CSS fix                     ]   │
│                                                   │
│        [ Discard ]    [ ■ Stop & save ]           │
└──────────────────────────────────────────────────┘
```

### Task Selector — Timer Panel (searching)

```
┌─ Timer ─────────────────────────────────────────┐
│  [ Project Alpha    ▾ ]                           │
│  [ log▏                                       ]   │
│  ┌─────────────────────────────────────────────┐ │
│  │ 🔵 MOB-5   Fix login bug                     │ │
│  │ 🐛 MOB-7   API 500 error on login             │ │
│  │ 📋 MOB-12  Refactor login form                │ │
│  └─────────────────────────────────────────────┘ │
│  [ Description                                ]   │
│                         [ ▶ Start timer ]        │
└──────────────────────────────────────────────────┘
```

### Task Selector — Add/Edit Time Entry Modal

```
┌──────────────── Add Time Entry ──────────────────┐
│                                                    │
│  Project                                           │
│  [ Project Alpha                        ▾ ]        │
│                                                    │
│  Task                                              │
│  [ 🔵 MOB-5: Fix login bug              ✕ ]        │
│  (free-text task input is hidden while a task      │
│   is selected)                                     │
│                                                    │
│  Date *                                            │
│  [ 2026-08-28                           ]          │
│                                                    │
│  (●) Time range    ( ) Duration only               │
│  ...                                               │
│            [ Cancel ]  [ Save entry ]              │
└────────────────────────────────────────────────────┘
```

Without a task selected (project chosen, no task, or project has no key):

```
┌──────────────── Add Time Entry ──────────────────┐
│  Project                                           │
│  [ Project Alpha                        ▾ ]        │
│                                                    │
│  Task                                              │
│  [ 🔍 Search tasks in Project Alpha...    ]        │
│  Task label                                        │
│  [ or type free text...                  ]         │
│  ...                                               │
└────────────────────────────────────────────────────┘
```

### Time Logged Section — Task Detail Page

```
┌─────────────────────────────────────────────────────────────────────┐
│ [← Board]  MOB-5                                                    │
├─────────────────────────────────────┬───────────────────────────────┤
│  ...                                 │  ...                          │
│  ─── Time Logged ──────────────      │  [ ▶ Start Timer ]            │
│  Total: 4h 15m                       │                               │
│  ┌─────────────────────────────────┐ │                               │
│  │ Aug 27, 2026 · 2h 30m · Alex K  │ │                               │
│  │ Aug 26, 2026 · 1h 45m · Jane D  │ │                               │
│  └─────────────────────────────────┘ │                               │
│                                       │                               │
└───────────────────────────────────────┴───────────────────────────────┘
```

Empty state:

```
│  ─── Time Logged ──────────────      │
│  No time logged on this task yet.    │
```

Running-timer state on task detail:

```
│  ─── Time Logged ──────────────      │  [ ⏱ Timer running → ]        │
```

## Flows

### Main Flow: Select a task while starting a timer

1. User opens the Time Tracking page, Timer panel is idle.
2. User selects "Project Alpha" in the project dropdown. Because the project has a `key`, a task selector field appears below it.
3. User types "log" in the task selector.
4. System sends `GET .../projects/{projectId}/tasks/search?q=log`, debounced.
5. Dropdown shows matching tasks (key + title + type icon).
6. User selects "MOB-5: Fix login bug".
7. System sets `taskId` locally and auto-fills the `task` field with "MOB-5: Fix login bug" (read-only).
8. User clicks "Start timer".
9. System sends `POST .../timer/start` with `{ projectId, taskId }` (no `task` — server computes it).
10. On success: Timer panel switches to running state showing the auto-filled task label. Topbar indicator shows the project (and, on hover/expanded view, the task).

### Alt Flow A: Clear task selection (branches from step 7)

7a. User clicks ✕ on the task selector.
7b. `taskId` is cleared. The `task` text field becomes editable, retaining "MOB-5: Fix login bug" as plain editable text.
7c. User can now freely edit or replace the text; it no longer references the task.

### Alt Flow B: Change project after selecting a task (branches from step 7)

7a. User changes the project dropdown to "Project Beta".
7b. System clears the task selection (task belonged to Project Alpha). Task selector resets to search mode for Project Beta. `task` text field retains its current text and becomes editable.

### Alt Flow C: Task search finds nothing (branches from step 4)

4a. Dropdown shows "No matching tasks."
4b. User can still type free text if no task is selected, or leave the field empty.

### Main Flow: Select a task on a manual time entry

1. User clicks "Add entry" on the Time Tracking page.
2. User selects a project with a `key`. Task selector appears.
3. User searches and selects a task.
4. `task` field auto-fills and becomes read-only.
5. User fills date, time range or duration, optional description.
6. User clicks "Save entry".
7. System sends `POST .../time-entries` with `{ projectId, taskId, date, ... }` (no `task`).
8. On success: modal closes, toast "Time entry saved". The entry appears in the current view, its task label shown as the computed snapshot.

### Main Flow: View time logged on a task and start a timer from it

1. User opens a task's detail page (`/org/{orgId}/projects/{projectId}/tasks/{taskId}`).
2. System loads `GET .../tasks/{taskId}`, which now includes `timeLoggedMinutes` and `recentTimeEntries`.
3. The "Time Logged" section renders: total (formatted `Xh Ym`) and up to 10 recent entries (date, duration, member name).
4. User clicks a recent entry's date.
5. System navigates to `/org/{orgId}/time-tracking?view=daily&date={date}`, landing on the daily view for that date.
6. User navigates back to the task detail page.
7. User clicks "Start Timer".
8. System sends `POST .../timer/start` with `{ projectId: task.projectId, taskId: task.id }`.
9. On success: toast "Timer started", topbar indicator appears, "Start Timer" button becomes a "Timer running" link back to the Time Tracking page.

### Alt Flow D: Start Timer when one is already running (branches from step 7)

7a. "Start Timer" button is disabled (or hidden, matching the existing pattern on the Timer panel) because the caller already has a running timer (spec 12 FR-11).

### Alt Flow E: `user` viewing time logged sees only their own entries (branches from step 3)

3a. If the caller is `user` role, `timeLoggedMinutes` and `recentTimeEntries` reflect only the caller's own entries against the task, even if other members logged time on it too.

### Alt Flow F: Task deleted while time entries still reference it (background flow, not user-initiated)

- An `admin`/`manager` deletes the task (spec 13 FR-21) from the board.
- Every `TimeEntry`/`RunningTimer` row with that `taskId` has `taskId` set to `null` via `onDelete: SetNull`. Their `task` text (the frozen snapshot) is untouched and keeps showing e.g. "MOB-5: Fix login bug" even though MOB-5 no longer exists.
- Those entries no longer count toward any task's "Time Logged" section (there is no task detail page to show them on anymore).

## API Contracts

### POST `.../organizations/{orgId}/timer/start` (modified — spec 12)

**Request** — adds `taskId`:
```json
{
  "projectId": "uuid",
  "taskId": "uuid-or-null",
  "task": "ignored when taskId is set",
  "description": "Working on endpoints"
}
```
If `taskId` is provided, `projectId` is required, `task` is ignored and recomputed server-side (FR-2). If `taskId` is provided without `projectId`, returns 400 `task_requires_project`. If `taskId`'s task belongs to a different project than `projectId`, returns 400 `task_wrong_project`.

**Response `201`** — adds `taskId`, `taskKey`:
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "projectName": "Project Alpha",
  "taskId": "uuid",
  "taskKey": "MOB-5",
  "task": "MOB-5: Fix login bug",
  "description": "Working on endpoints",
  "startedAt": "2026-08-28T09:00:00Z"
}
```

Errors (in addition to spec 12's): `400 task_requires_project`, `400 task_wrong_project`, `400 task_not_found` (taskId references a non-existent or cross-org task), `403 task_project_not_assigned` (`user` role selecting a task outside their assigned projects).

### PUT `.../organizations/{orgId}/timer` (modified — spec 12)

**Request** — adds `taskId` (send `null` to clear):
```json
{
  "projectId": "uuid-or-null",
  "taskId": "uuid-or-null",
  "task": "ignored when taskId is set",
  "description": "Updated description"
}
```
Same validation as start (`task_requires_project`, `task_wrong_project`). Clearing `taskId` (explicit `null`) leaves `task` unchanged (FR-6) and makes it editable again on subsequent updates.

**Response `200`** — same shape as start's response, reflecting the update.

### POST `.../organizations/{orgId}/time-entries` (modified — spec 12)

**Request** — adds `taskId`:
```json
{
  "membershipId": "uuid",
  "projectId": "uuid-or-null",
  "taskId": "uuid-or-null",
  "task": "ignored when taskId is set",
  "description": "Working on endpoints",
  "date": "2026-08-28",
  "startTime": "09:00",
  "endTime": "11:30",
  "durationMinutes": null
}
```

**Response `201`** — adds `taskId`, `taskKey`:
```json
{
  "id": "uuid",
  "membershipId": "uuid",
  "projectId": "uuid",
  "projectName": "Project Alpha",
  "taskId": "uuid",
  "taskKey": "MOB-5",
  "task": "MOB-5: Fix login bug",
  "description": "Working on endpoints",
  "date": "2026-08-28",
  "startTime": "2026-08-28T09:00:00Z",
  "endTime": "2026-08-28T11:30:00Z",
  "durationMinutes": 150,
  "createdAt": "2026-08-28T11:30:00Z"
}
```

Errors: same as spec 12's create, plus `400 task_requires_project`, `400 task_wrong_project`, `400 task_not_found`, `403 task_project_not_assigned`.

### PUT `.../organizations/{orgId}/time-entries/{entryId}` (modified — spec 12)

Same request/response shape as POST (excluding `membershipId`), with `taskId` supported identically, including explicit `null` to clear.

### GET `.../organizations/{orgId}/projects/{projectId}/tasks/{taskId}` (modified — spec 13)

**Response `200`** — adds `timeLoggedMinutes`, `recentTimeEntries`:
```json
{
  "id": "uuid", "key": "MOB-5", "taskNumber": 5, "type": "task",
  "title": "Fix login bug",
  "...": "... (unchanged fields from spec 13) ...",
  "timeLoggedMinutes": 255,
  "recentTimeEntries": [
    {
      "id": "uuid",
      "date": "2026-08-27",
      "durationMinutes": 150,
      "memberName": "Alex Kaminski",
      "membershipId": "uuid"
    },
    {
      "id": "uuid",
      "date": "2026-08-26",
      "durationMinutes": 105,
      "memberName": "Jane Doe",
      "membershipId": "uuid"
    }
  ]
}
```
`recentTimeEntries` is capped at 10, sorted by `date` desc then `createdAt` desc. For `user` role, both `timeLoggedMinutes` and `recentTimeEntries` are computed from the caller's own entries only (FR-18). For `admin`/`manager`, computed across all members.

### GET `.../organizations/{orgId}/projects/{projectId}/tasks/search` (new)

**Auth:** `view-board` (spec 13). `user` role: must be a project member (spec 13 rule).

**Query parameters:**
- `q` (string, optional): search text matched against task key (exact/prefix, case-insensitive) and title (substring, case-insensitive). Empty or omitted `q` returns the project's most recently updated tasks (up to 20).

**Response `200`:**
```json
{
  "tasks": [
    { "id": "uuid", "key": "MOB-5", "title": "Fix login bug", "type": "task" },
    { "id": "uuid", "key": "MOB-7", "title": "API 500 error on login", "type": "bug" }
  ]
}
```
Max 20 results. Sorted by relevance: exact key match first, then key prefix match, then title substring match, then most-recently-updated within each tier.

**Errors:**
- `400 project_key_required`: project has no `key` (no board, spec 13 FR-2).
- `403 forbidden`: `user` role not a project member; `viewer` role.
- `404`: project not found or cross-org.

## Validation Rules

1. **taskId requires projectId**: if `taskId` is set and `projectId` is null/absent, reject. Error: `taskRequiresProject`.
2. **taskId project match**: the referenced task's `projectId` must equal the request's `projectId`. Error: `taskWrongProject`.
3. **taskId existence**: must reference an existing task belonging to the caller's organization. Error: `taskNotFound`.
4. **taskId project visibility** (`user` role only): the task's project must be one the caller is assigned to via `ProjectMember`. Error: `taskProjectNotAssigned`.
5. **task (free text)**: when `taskId` is present in the request, any client-supplied `task` value is ignored — no validation error, it is simply discarded (FR-2). When `taskId` is absent, spec 12's existing `task` validation (max 200 codepoints) applies unchanged.
6. **Search query `q`**: optional, max 100 codepoints, trimmed. No error on empty — treated as "browse recent tasks."

Client-side validation: rule 1 (task selector cannot be shown without a project) and the general spec 12 field rules. Server-side: all rules 1–6, always, regardless of UI state.

## Error Messages

| Context | Message |
|---|---|
| Task requires project | Select a project before choosing a task |
| Task wrong project | The selected task does not belong to the chosen project |
| Task not found | Task not found |
| Task project not assigned | You do not have access to tasks in this project |
| Project key required (search) | This project does not have a board |
| Toast: timer started (unchanged) | Timer started |
| Toast: timer stopped (unchanged) | Timer stopped — {duration} logged |
| Toast: entry saved (unchanged) | Time entry saved |
| Empty: time logged | No time logged on this task yet. |
| Task selector: no matches | No matching tasks. |
| Task selector: search placeholder | Search tasks in {projectName}... |
| Generic error (unchanged) | Something went wrong. Please try again. |

## UI Description

### Task Selector (Timer panel & Add/Edit Time Entry modal)

- Appears directly below the project selector, only when the selected project has a `key` (board-enabled).
- **No task selected:** renders as a search input with placeholder "Search tasks in {projectName}...". Typing (debounced ~250ms) queries the search endpoint and shows a dropdown of up to 20 results, each row: type icon (spec 13 color-coded icons), key (muted), title (truncated). Below the search input (when no task is selected), the original free-text `task` input remains available for members who prefer to type instead of linking a task — selecting from the dropdown replaces it.
- **Task selected:** the search input is replaced by a compact chip/readonly field showing the type icon, key, and title, with a ✕ clear button. The underlying free-text `task` input is hidden/disabled while a task is selected.
- Clearing (✕) reverts to the search input, and the previously auto-filled text becomes an editable free-text value in the `task` field (FR-6).
- Changing the project resets the task selector to its unselected state (FR-14).

### Time Logged Section (Task Detail Page)

- New subsection on the left column of the task detail page (spec 13), positioned below "Children" and above the "(Comments, watchers, activity log — see spec 14)" placeholder.
- Heading: "Time Logged". Shows the total (`Xh Ym`) prominently, followed by a list of up to 10 recent entries: date, duration, member name. Each row is a link.
- Empty state: "No time logged on this task yet."
- Loading state: skeleton matching the row layout (3 placeholder rows).

### Start Timer (Task Detail Page)

- A button in the right side panel (spec 13), positioned near the top (e.g., above "Status") or as a prominent action near the task title — implementation may place it wherever fits the existing panel layout, but it must be visible without scrolling on desktop.
- Hidden entirely if the caller lacks `UseTimer` (spec 12) or the project is archived (spec 13 read-only rule extends here — a Start Timer on an archived project's task is still allowed, since timers/time-entries are a separate feature from task editing; **not** hidden for archived projects).
- If the caller already has a running timer, the button is replaced with a small "⏱ Timer running →" link that navigates to the Time Tracking page (does not attempt to start a second timer).
- On click: same loading/disabled pattern as the Timer panel's "Start timer" button. On success: toast "Timer started", button switches to the running-link state, topbar indicator appears.

### States

| State | Behavior |
|---|---|
| Task selector — loading search results | Spinner in the dropdown |
| Task selector — no results | "No matching tasks." row, non-interactive |
| Task selector — project has no key | Selector hidden; plain `task` text input shown (spec 12 behavior) |
| Time Logged — loading | Skeleton rows |
| Time Logged — empty | "No time logged on this task yet." |
| Time Logged — populated | Total + up to 10 rows, each linking to daily view |
| Start Timer — available | Enabled button |
| Start Timer — timer already running | Disabled/replaced with "Timer running →" link |
| Start Timer — no `UseTimer` capability | Hidden |

## Required `data-testid` Attributes

**Task selector (shared across Timer panel and Entry modal, prefixed per context):**
- `tt-timer-task-selector`, `tt-timer-task-search-input`, `tt-timer-task-option-{id}`, `tt-timer-task-clear-btn`
- `tt-entry-task-selector`, `tt-entry-task-search-input`, `tt-entry-task-option-{id}`, `tt-entry-task-clear-btn`

**Task detail page — Time Logged section:**
- `task-time-logged-section`, `task-time-logged-total`
- `task-time-logged-entry-{id}`
- `task-time-logged-empty`

**Task detail page — Start Timer:**
- `task-start-timer-btn`, `task-timer-running-link`

## Security

### Authentication & Authorization
- All modified/new endpoints reuse `SessionGuard` + `OrgScopeGuard` (spec 02) and the existing capability checks from spec 12 (`UseTimer`, `ManageOwnTimeEntries`, `ManageAllTimeEntries`, `ViewTimeTracking`) and spec 13 (`view-board`, `manage-tasks`).
- The new `GET .../tasks/search` endpoint requires `view-board` and, for `user` role, project membership — identical gating to spec 13's `GET .../board` and `GET .../tasks`.

### Cross-Organization Protection (IDOR)
- `taskId` is always resolved and validated to belong to the caller's organization (via its project) within the same transaction as the time-entry/timer mutation. A `taskId` from another org returns `task_not_found` (400), not a 500 or silent success.
- `GET .../tasks/{taskId}`'s `recentTimeEntries` never includes entries from other organizations — the aggregate query is scoped by the task's own `organizationId` implicitly (a task cannot span orgs).
- The search endpoint's project-scope check mirrors spec 13's: a `projectId` from another org returns 404.

### Cross-Project / Cross-Assignment Protection
- `taskId` must belong to the same project as `projectId` (FR-5) — this is enforced server-side even if the client's UI would never construct such a request, closing off direct API manipulation.
- `user` role: task selection is rejected (403 `task_project_not_assigned`) if the task's project is not in the caller's `ProjectMember` set, mirroring the existing `projectId` visibility rule (spec 12 FR-8) and the board access rule (spec 13).

### Data Snapshot Integrity
- The `task` free-text field, once computed from a `taskId` (FR-2), is never trusted from client input while `taskId` is present — this prevents a client from setting `taskId` to one task while displaying a spoofed label for a different one.
- Because the label is a snapshot (FR-3), renaming or deleting a task does not retroactively alter historical time entries — this is a deliberate design choice for audit-trail stability, not an oversight.

### Privacy
- `timeLoggedMinutes` and `recentTimeEntries` on the task detail response respect the same per-role visibility as spec 12's time entry list: `user` sees only their own contributions; only `admin`/`manager` see `memberName` for entries belonging to other members (consistent with spec 12 Security rule 35).

### Rate Limiting
- `GET .../tasks/search` inherits the board-read rate limit from spec 13 (120/min per session).
- Modified timer/time-entry endpoints inherit their existing spec 12 rate limits unchanged (10/min for timer start, 60/min for mutations, 120/min for list/detail reads).

### Logging
- Task linking/unlinking on time entries and timers is captured by the existing mutation logs (spec 12 Security rule 30) — the log continues to omit free-text content but now also includes whether a `taskId` was present, for audit purposes without exposing task titles.

## Out of Scope

- Bulk re-linking of existing time entries to tasks (retroactively setting `taskId` on old entries created before this spec).
- Time estimates or "remaining work" tracking on tasks (estimate vs. logged comparison).
- Task-level time budgets, alerts, or overruns.
- Filtering the Time Tracking calendar/grid views by task (only by project, per spec 12).
- Showing time-logged rollups on the Kanban board cards or list view (spec 13) — only the task detail page is covered.
- Aggregating time logged across an epic's children (parent/subtask rollups).
- Editing a time entry's task link from the Time Logged section on the task detail page (editing still happens via the Time Tracking page, spec 12).
- Real-time updates to the Time Logged section while another member is actively logging time (no polling/WebSocket — refreshed on page load/navigation only).
- Task search across multiple projects at once (search is always scoped to one `projectId`).

## Test Cases

### Unit Tests

**TC-15-UNIT-01: computeTaskLabel — formats key and title**
- Level: Unit
- Steps: Call `computeTaskLabel({ projectKey: "MOB", taskNumber: 5, title: "Fix login bug" })`
- Expected: Returns `"MOB-5: Fix login bug"`

**TC-15-UNIT-02: computeTaskLabel — long title unaffected by task field length**
- Level: Unit
- Steps: Call with a title at 200 codepoints (spec 13 max)
- Expected: Returns the full computed string without truncation (task label max length is a display/storage concern for `task`, not validated against title length here)

**TC-15-UNIT-03: validateTaskLink — taskId without projectId**
- Level: Unit
- Steps: Call `validateTaskLink({ taskId: "uuid", projectId: null })`
- Expected: `{ valid: false, error: "taskRequiresProject" }`

**TC-15-UNIT-04: validateTaskLink — taskId with matching projectId**
- Level: Unit
- Steps: Call `validateTaskLink({ taskId: "uuid", projectId: "p1", taskProjectId: "p1" })`
- Expected: `{ valid: true }`

**TC-15-UNIT-05: validateTaskLink — taskId with mismatched projectId**
- Level: Unit
- Steps: Call `validateTaskLink({ taskId: "uuid", projectId: "p1", taskProjectId: "p2" })`
- Expected: `{ valid: false, error: "taskWrongProject" }`

**TC-15-UNIT-06: validateTaskLink — null taskId is always valid**
- Level: Unit
- Steps: Call with `taskId: null` and `projectId: null`, and again with `taskId: null` and `projectId: "p1"`
- Expected: Both `{ valid: true }`

**TC-15-UNIT-07: task free-text override logic**
- Level: Unit
- Steps: Given a request body `{ taskId: "uuid", task: "client supplied text" }`, run the field-resolution function
- Expected: Resolved `task` equals the computed label, not `"client supplied text"`

**TC-15-UNIT-08: clearing taskId preserves task text**
- Level: Unit
- Steps: Given existing entry `{ taskId: "uuid", task: "MOB-5: Fix login bug" }`, apply update `{ taskId: null }`
- Expected: Resulting entry has `taskId: null`, `task: "MOB-5: Fix login bug"` (unchanged)

### Integration Tests

**TC-15-INT-01: Start timer with taskId — happy path**
- Level: Integration
- Preconditions: user U assigned to project P (key "MOB"), task T (MOB-5, "Fix login bug") in P
- Steps: `POST .../timer/start` with `{ projectId: P.id, taskId: T.id }`
- Expected: 201 with `taskId: T.id`, `taskKey: "MOB-5"`, `task: "MOB-5: Fix login bug"`

**TC-15-INT-02: Start timer — taskId without projectId rejected**
- Level: Integration
- Steps: `POST .../timer/start` with `{ taskId: T.id }` (no projectId)
- Expected: 400 `task_requires_project`

**TC-15-INT-03: Start timer — taskId from different project rejected**
- Level: Integration
- Preconditions: project P1 (task T1), project P2
- Steps: `POST .../timer/start` with `{ projectId: P2.id, taskId: T1.id }`
- Expected: 400 `task_wrong_project`

**TC-15-INT-04: Start timer — taskId not found**
- Level: Integration
- Steps: `POST .../timer/start` with `{ projectId: P.id, taskId: "nonexistent-uuid" }`
- Expected: 400 `task_not_found`

**TC-15-INT-05: Start timer — taskId from cross-org task rejected**
- Level: Integration
- Preconditions: task T belongs to org B; caller in org A
- Steps: `POST /api/organizations/{A.id}/timer/start` with `{ projectId: <A's project>, taskId: T.id }`
- Expected: 400 `task_not_found` (not leaking existence)

**TC-15-INT-06: Start timer — user role, task in unassigned project rejected**
- Level: Integration
- Preconditions: user U not assigned to project P2 (has task T2)
- Steps: as U, `POST .../timer/start` with `{ projectId: P2.id, taskId: T2.id }`
- Expected: 403 `task_project_not_assigned`

**TC-15-INT-07: Start timer — admin can select task in any project**
- Level: Integration
- Preconditions: admin A not assigned to project P (has task T)
- Steps: as A, `POST .../timer/start` with `{ projectId: P.id, taskId: T.id }`
- Expected: 201 success (admin bypasses assignment, per spec 12/13 precedent)

**TC-15-INT-08: Start timer — client-supplied task text ignored when taskId set**
- Level: Integration
- Steps: `POST .../timer/start` with `{ projectId: P.id, taskId: T.id, task: "totally different text" }`
- Expected: 201 with `task` equal to the computed label, not the client text

**TC-15-INT-09: Stop timer — taskId carried to created TimeEntry**
- Level: Integration
- Preconditions: running timer with `taskId: T.id`
- Steps: `POST .../timer/stop`
- Expected: 200 with `timeEntry.taskId === T.id` and `timeEntry.task` equal to the computed label

**TC-15-INT-10: Stop timer — task label recomputed at stop time if task changed while running**
- Level: Integration
- Preconditions: running timer with `taskId: T.id` (title "Fix login bug"); task T's title is changed to "Fix login bug (v2)" via `PUT .../tasks/{T.id}` while timer is running
- Steps: `POST .../timer/stop`
- Expected: 200 with `timeEntry.task` reflecting "Fix login bug (v2)"

**TC-15-INT-11: Update running timer — set taskId while running**
- Level: Integration
- Preconditions: running timer with `projectId: P.id`, no taskId
- Steps: `PUT .../timer` with `{ taskId: T.id }` (T belongs to P)
- Expected: 200 with `taskId: T.id`, `task` auto-filled; `startedAt` unchanged

**TC-15-INT-12: Update running timer — clear taskId**
- Level: Integration
- Preconditions: running timer with `taskId: T.id`, `task: "MOB-5: Fix login bug"`
- Steps: `PUT .../timer` with `{ taskId: null }`
- Expected: 200 with `taskId: null`, `task` still `"MOB-5: Fix login bug"` (unchanged, now editable client-side)

**TC-15-INT-13: Create time entry with taskId — happy path**
- Level: Integration
- Steps: `POST .../time-entries` with `{ projectId: P.id, taskId: T.id, date: today, durationMinutes: 60 }`
- Expected: 201 with `taskId: T.id`, `taskKey`, computed `task`

**TC-15-INT-14: Create time entry — taskId without projectId rejected**
- Level: Integration
- Steps: `POST .../time-entries` with `{ taskId: T.id, date: today, durationMinutes: 60 }`
- Expected: 400 `task_requires_project`

**TC-15-INT-15: Create time entry — taskId wrong project rejected**
- Level: Integration
- Steps: `POST .../time-entries` with `{ projectId: P2.id, taskId: T1.id, date: today, durationMinutes: 60 }`
- Expected: 400 `task_wrong_project`

**TC-15-INT-16: Edit time entry — set taskId on existing free-text entry**
- Level: Integration
- Preconditions: entry E with `task: "manual note"`, no taskId
- Steps: `PUT .../time-entries/{E.id}` with `{ taskId: T.id, projectId: P.id }`
- Expected: 200 with `taskId: T.id`, `task` overwritten with computed label (client text discarded)

**TC-15-INT-17: Edit time entry — clear taskId, task text preserved**
- Level: Integration
- Preconditions: entry E with `taskId: T.id`, `task: "MOB-5: Fix login bug"`
- Steps: `PUT .../time-entries/{E.id}` with `{ taskId: null }`
- Expected: 200 with `taskId: null`, `task` still `"MOB-5: Fix login bug"`

**TC-15-INT-18: Edit time entry — user cannot set taskId on another member's entry without ManageAllTimeEntries**
- Level: Integration
- Preconditions: entry E belongs to user U2
- Steps: as U1 (user role), `PUT .../time-entries/{E.id}` with `{ taskId: T.id }`
- Expected: 403 (existing spec 12 ownership rule, unaffected by this spec)

**TC-15-INT-19: Task deletion — TimeEntry.taskId set null, task text preserved**
- Level: Integration
- Preconditions: entry E with `taskId: T.id`, `task: "MOB-5: Fix login bug"`
- Steps: `DELETE .../projects/{P.id}/tasks/{T.id}` (spec 13). Then `GET .../time-entries?from=...&to=...`
- Expected: Entry E now has `taskId: null`; `task` remains `"MOB-5: Fix login bug"`

**TC-15-INT-20: Task deletion — RunningTimer.taskId set null**
- Level: Integration
- Preconditions: running timer with `taskId: T.id`
- Steps: `DELETE .../projects/{P.id}/tasks/{T.id}`. Then `GET .../timer`
- Expected: Timer still running, `taskId: null`, `task` text preserved

**TC-15-INT-21: Deleted task's time entries no longer count toward any Time Logged total**
- Level: Integration
- Preconditions: task T with 2 entries (150 min total). Task T is deleted.
- Steps: `GET .../projects/{P.id}/tasks/{T2.id}` for an unrelated task T2 with no entries
- Expected: T2's `timeLoggedMinutes: 0` — deleted-task entries are simply unreachable, not attributed elsewhere

**TC-15-INT-22: Task detail — timeLoggedMinutes aggregates correctly**
- Level: Integration
- Preconditions: task T with 3 entries of 60, 90, 45 minutes, all `taskId: T.id`
- Steps: `GET .../tasks/{T.id}`
- Expected: `timeLoggedMinutes: 195`

**TC-15-INT-23: Task detail — recentTimeEntries capped at 10, sorted desc**
- Level: Integration
- Preconditions: task T with 15 entries across different dates
- Steps: `GET .../tasks/{T.id}`
- Expected: `recentTimeEntries.length === 10`, ordered by date desc (then createdAt desc for same-date entries)

**TC-15-INT-24: Task detail — user role sees only own entries in aggregate**
- Level: Integration
- Preconditions: task T. User U1 logged 60 min. User U2 logged 90 min. Both are project members.
- Steps: as U1, `GET .../tasks/{T.id}`
- Expected: `timeLoggedMinutes: 60`, `recentTimeEntries` contains only U1's entry

**TC-15-INT-25: Task detail — admin sees all members' entries in aggregate**
- Level: Integration
- Preconditions: same as TC-15-INT-24
- Steps: as admin A, `GET .../tasks/{T.id}`
- Expected: `timeLoggedMinutes: 150`, `recentTimeEntries` contains both U1's and U2's entries with `memberName` set

**TC-15-INT-26: Task detail — empty state (no entries)**
- Level: Integration
- Preconditions: task T with zero time entries
- Steps: `GET .../tasks/{T.id}`
- Expected: `timeLoggedMinutes: 0`, `recentTimeEntries: []`

**TC-15-INT-27: Task search — matches by key prefix**
- Level: Integration
- Preconditions: project P with tasks MOB-1, MOB-2, MOB-15
- Steps: `GET .../projects/{P.id}/tasks/search?q=MOB-1`
- Expected: 200 with MOB-1 and MOB-15 returned (MOB-1 ranked first as exact/prefix match)

**TC-15-INT-28: Task search — matches by title substring, case-insensitive**
- Level: Integration
- Preconditions: task "Fix login bug"
- Steps: `GET .../projects/{P.id}/tasks/search?q=LOGIN`
- Expected: 200 with the task included

**TC-15-INT-29: Task search — empty query returns recent tasks**
- Level: Integration
- Preconditions: project P with 5 tasks
- Steps: `GET .../projects/{P.id}/tasks/search` (no `q`)
- Expected: 200 with up to 20 tasks, most-recently-updated first

**TC-15-INT-30: Task search — capped at 20 results**
- Level: Integration
- Preconditions: project P with 30 tasks matching query
- Steps: `GET .../projects/{P.id}/tasks/search?q=task`
- Expected: 200 with exactly 20 results

**TC-15-INT-31: Task search — project without key returns 400**
- Level: Integration
- Preconditions: project P2 has no `key`
- Steps: `GET .../projects/{P2.id}/tasks/search?q=x`
- Expected: 400 `project_key_required`

**TC-15-INT-32: Task search — user role not a project member returns 403**
- Level: Integration
- Preconditions: user U not assigned to project P
- Steps: as U, `GET .../projects/{P.id}/tasks/search?q=x`
- Expected: 403 `forbidden`

**TC-15-INT-33: Task search — viewer role returns 403**
- Level: Integration
- Steps: as viewer, `GET .../projects/{P.id}/tasks/search?q=x`
- Expected: 403 `forbidden`

**TC-15-INT-34: Task search — cross-org project returns 404**
- Level: Integration
- Steps: `GET /api/organizations/{A.id}/projects/{B's project}/tasks/search?q=x`
- Expected: 404

**TC-15-INT-35: Time entry with taskId — response includes taskKey for display**
- Level: Integration
- Steps: `POST .../time-entries` with valid `taskId`
- Expected: 201 response includes both `taskId` and `taskKey` (e.g., "MOB-5") for client rendering without an extra lookup

### E2E Tests

**TC-15-E2E-01: Select a task in the Timer panel and start a timer**
- Level: E2E
- Preconditions: logged in as user, assigned to project "Mobile App" (key MOB) with task "MOB-5: Fix login bug"
- Steps:
  1. Navigate to Time Tracking page.
  2. Select project "Mobile App" in the Timer panel.
  3. Verify task selector appears.
  4. Type "login" in the task selector.
  5. Select "MOB-5: Fix login bug" from the dropdown.
  6. Verify `task` field auto-fills with "MOB-5: Fix login bug" and becomes read-only.
  7. Click "Start timer".
  8. Verify timer panel shows running state with the task label. Verify topbar indicator appears.
- Expected: Task selected, timer started with task link
- Selectors: `tt-timer-project-select`, `tt-timer-task-selector`, `tt-timer-task-search-input`, `tt-timer-task-option-*`, `tt-timer-start-btn`, `tt-timer-elapsed`, `topbar-timer-indicator`

**TC-15-E2E-02: Clear task selection in Timer panel**
- Level: E2E
- Preconditions: Timer panel idle, project and task selected as in TC-15-E2E-01 steps 1–6
- Steps:
  1. Click the ✕ clear button on the task chip.
  2. Verify the task selector reverts to search mode.
  3. Verify the `task` text field is now editable and still shows "MOB-5: Fix login bug".
  4. Edit the text to "Custom note".
  5. Click "Start timer".
  6. Verify timer starts with free-text task "Custom note" and no task link.
- Expected: Task unlinked, free text editable and used
- Selectors: `tt-timer-task-clear-btn`, `tt-timer-task-search-input`

**TC-15-E2E-03: Select a task in the Add Time Entry modal**
- Level: E2E
- Preconditions: logged in as user, assigned to project with tasks
- Steps:
  1. Click "Add entry".
  2. Select project "Mobile App".
  3. Verify task selector appears in the modal.
  4. Search and select "MOB-7: API 500 error".
  5. Set date, duration.
  6. Click "Save entry".
  7. Verify toast "Time entry saved".
  8. Verify the entry in the daily view shows the task label "MOB-7: API 500 error".
- Expected: Entry created and linked to the task
- Selectors: `tt-add-entry-btn`, `tt-entry-modal`, `tt-entry-project-select`, `tt-entry-task-selector`, `tt-entry-task-search-input`, `tt-entry-task-option-*`, `tt-entry-save-btn`, `toast-entry-saved`

**TC-15-E2E-04: Changing project after selecting a task clears the task**
- Level: E2E
- Preconditions: Add Time Entry modal open, project "Mobile App" and a task selected
- Steps:
  1. Change the project dropdown to "Website Redesign".
  2. Verify the task selection is cleared and the selector resets to search mode for the new project.
  3. Verify the previously auto-filled `task` text is now editable.
- Expected: Task cleared on project change
- Selectors: `tt-entry-project-select`, `tt-entry-task-selector`

**TC-15-E2E-05: View Time Logged section on task detail page**
- Level: E2E
- Preconditions: task MOB-5 has 2 time entries from the current user totaling 2h 30m
- Steps:
  1. Navigate to the task detail page for MOB-5.
  2. Verify "Time Logged" section shows total "2h 30m".
  3. Verify 2 entries listed with date, duration, member name.
  4. Click the date on the first entry.
  5. Verify navigation to the Time Tracking daily view for that date.
- Expected: Aggregate and entries displayed correctly, link navigates
- Selectors: `task-time-logged-section`, `task-time-logged-total`, `task-time-logged-entry-*`

**TC-15-E2E-06: Time Logged section — empty state**
- Level: E2E
- Preconditions: task with no time entries
- Steps:
  1. Navigate to the task detail page.
  2. Verify "No time logged on this task yet." is shown.
- Expected: Empty state rendered
- Selectors: `task-time-logged-empty`

**TC-15-E2E-07: Start timer from task detail page**
- Level: E2E
- Preconditions: logged in as user with no running timer, viewing task MOB-5's detail page
- Steps:
  1. Click "Start Timer" on the task detail page.
  2. Verify toast "Timer started".
  3. Verify topbar indicator appears.
  4. Verify the button switches to "Timer running →".
  5. Navigate to Time Tracking page.
  6. Verify the Timer panel shows the running timer with project and task pre-filled from MOB-5.
- Expected: Timer started with correct project/task pre-fill
- Selectors: `task-start-timer-btn`, `topbar-timer-indicator`, `task-timer-running-link`, `tt-timer-elapsed`

**TC-15-E2E-08: Start Timer disabled when a timer is already running**
- Level: E2E
- Preconditions: user has a running timer (started elsewhere)
- Steps:
  1. Navigate to a different task's detail page.
  2. Verify "Start Timer" is not shown; "Timer running →" link is shown instead.
  3. Click the link.
  4. Verify navigation to the Time Tracking page.
- Expected: No duplicate timer can be started from task detail
- Selectors: `task-timer-running-link`

**TC-15-E2E-09: Admin sees all members' time logged on a task**
- Level: E2E
- Preconditions: task MOB-5 has entries from both "Alex K" (own) and "Jane D" (another member); logged in as admin
- Steps:
  1. Navigate to MOB-5's detail page.
  2. Verify Time Logged total reflects both members' combined minutes.
  3. Verify both "Alex K" and "Jane D" appear in the recent entries list.
- Expected: Admin sees combined totals and both member names
- Selectors: `task-time-logged-total`, `task-time-logged-entry-*`

**TC-15-E2E-10: User sees only their own time logged on a task**
- Level: E2E
- Preconditions: same task MOB-5 with two members' entries as in TC-15-E2E-09; logged in as the "user" role member (not admin)
- Steps:
  1. Navigate to MOB-5's detail page.
  2. Verify Time Logged total reflects only the caller's own minutes.
  3. Verify only the caller's own entry appears in the list.
- Expected: `user` role sees a scoped-down total and entry list
- Selectors: `task-time-logged-total`, `task-time-logged-entry-*`

**TC-15-E2E-11: Task selector hidden for projects without a board key**
- Level: E2E
- Preconditions: project "Legacy Ops" has no `key` set
- Steps:
  1. Open Add Time Entry modal.
  2. Select project "Legacy Ops".
  3. Verify no task selector appears — only the plain free-text `task` input is shown.
  4. Type free text, save the entry.
  5. Verify the entry saves successfully with the free-text task and no task link.
- Expected: Task selector absent for keyless projects, free text works as in spec 12
- Selectors: `tt-entry-project-select`, `tt-entry-task-input`, `tt-entry-save-btn`, `toast-entry-saved`
