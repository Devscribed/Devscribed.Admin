---
id: "13"
title: Kanban Board & Tasks
routes: ["/org/{orgId}/projects/{projectId}/board", "/org/{orgId}/projects/{projectId}/list", "/org/{orgId}/projects/{projectId}/tasks/{taskId}"]
api:
  - "GET    .../projects/{projectId}/board"
  - "POST   .../projects/{projectId}/board/columns"
  - "PUT    .../projects/{projectId}/board/columns/{columnId}"
  - "PUT    .../projects/{projectId}/board/columns/reorder"
  - "DELETE .../projects/{projectId}/board/columns/{columnId}"
  - "POST   .../projects/{projectId}/tasks"
  - "GET    .../projects/{projectId}/tasks"
  - "GET    .../projects/{projectId}/tasks/{taskId}"
  - "PUT    .../projects/{projectId}/tasks/{taskId}"
  - "PATCH  .../projects/{projectId}/tasks/{taskId}/move"
  - "DELETE .../projects/{projectId}/tasks/{taskId}"
entities: [BoardColumn, Task]
tags: [kanban, tasks, board, project-management]
depends-on: ["11"]
---

# 13 — Kanban Board & Tasks

## Summary

Organizations manage work through Kanban boards attached to projects (spec 11). Each project has one board with customizable columns. Tasks support a three-level hierarchy: Epics group Tasks/Bugs/Stories, which may have Subtasks. Tasks carry core fields: type, title, description (markdown), priority, assignee, story points, and due date. Two views: drag-and-drop board and a filterable list. Task detail opens on a separate page.

Labels, comments, watchers, and activity log are covered in spec 14. Time tracking integration is covered in spec 15.

**Depends on:** Spec 11 (Projects).

## Actors & Preconditions

- **Actors:** Authenticated members with an active membership in the organization.
- **Preconditions:**
  - Organization exists with at least one project (spec 11).
  - The project has a `key` set (2–10 uppercase letters). Projects without a key cannot use task management.
  - For `user` role: the member must be assigned to the project via `ProjectMember`.

## Roles & Permission Matrix

| Capability              | admin | manager | user | viewer |
|-------------------------|-------|---------|------|--------|
| view-board              | ✓     | ✓       | ✓¹   | ✗      |
| manage-tasks            | ✓     | ✓       | ✓¹   | ✗      |
| manage-board-columns    | ✓     | ✓       | ✗    | ✗      |

¹ `user` role is further scoped: can only access boards/tasks in projects they are assigned to via `ProjectMember`.

Admin/manager can access all active projects' boards regardless of project membership, matching spec 11 behavior.

## Functional Requirements

### Project Key

- **FR-1.** Project gains a `key` field: 2–10 uppercase ASCII letters (`/^[A-Z]+$/`), unique per organization (case-sensitive, since it's already uppercase). Set at project creation or via project edit (if not already set). Once set, immutable.
- **FR-2.** Existing projects without a key work unchanged. Task management features require a key — accessing the board for a keyless project returns 400.

### Board Columns

- **FR-3.** Each project has one board. Default columns are lazy-created on first `GET .../board`: "To Do" (category `todo`, position 0), "In Progress" (category `in_progress`, position 1), "Done" (category `done`, position 2).
- **FR-4.** Admin/manager can create, rename, reorder, and delete columns. Column names: 1–50 chars, unique per project (case-insensitive).
- **FR-5.** A column can only be deleted if it contains no tasks. A board must have at least one column.
- **FR-6.** Column reorder is a batch operation: client sends the full ordered list of column IDs.
- **FR-7.** Each column has a `category` field: `todo`, `in_progress`, `done`, or `custom`. Category is informational (used for board visual styling). Default columns get fixed categories; custom columns default to `custom`.

### Tasks — Core Fields

- **FR-8.** Tasks are identified by a human-readable key derived at read time: `{Project.key}-{Task.taskNumber}` (e.g., `MOB-42`). The `taskNumber` is auto-incremented per project using an atomic `SELECT ... FOR UPDATE` on the project row.
- **FR-9.** Task types (fixed enum): `epic`, `task`, `bug`, `story`, `subtask`.
- **FR-10.** Hierarchy rules:
  - Epic: cannot have a parent.
  - Task/Bug/Story: parent (if set) must be an epic in the same project.
  - Subtask: parent is required; must be a task/bug/story (not epic, not subtask) in the same project.
  - Circular references are rejected.
- **FR-11.** Required fields on create: `type`, `title`. Optional: `description`, `priority`, `columnId` (defaults to first column by position), `storyPoints`, `assigneeId`, `parentId`, `dueDate`.
- **FR-12.** `reporterId` is always set from the caller's session membership. Cannot be changed.
- **FR-13.** `assigneeId` must reference an active membership in the same organization. The assignee does not need to be a project member (admin/manager may assign anyone).
- **FR-14.** Priority: `low`, `medium`, `high`, `critical`, or null (unset).
- **FR-15.** Story points: nullable integer 0–999.
- **FR-16.** Due date: nullable date. No past/future constraints.
- **FR-17.** Description: markdown, max 10,000 codepoints. Nullable.
- **FR-18.** Title: 1–200 codepoints. Trimmed. Required.

### Tasks — Operations

- **FR-19.** Task update is partial: only provided fields change. `type`, `title`, `description`, `priority`, `storyPoints`, `assigneeId`, `parentId`, `dueDate`, `columnId` are updatable. `taskNumber`, `reporterId`, `projectId` are immutable.
- **FR-20.** Task move (drag-and-drop): accepts `columnId` and/or `position`. At least one required. Uses fractional indexing for `position` (float) — inserting between 2.0 and 3.0 yields 2.5, no rewrite of other rows needed.
- **FR-21.** Task delete is a hard delete. Children are orphaned (`parentId` set to null via `onDelete: SetNull`).
- **FR-22.** Archived projects (spec 11): board and tasks remain accessible in read-only mode for admin/manager. No new tasks can be created. Existing tasks cannot be modified.

### List View

- **FR-23.** Table view with columns: Key, Type (icon), Title, Status (column name), Priority (icon), Assignee (avatar), Story Points, Due Date.
- **FR-24.** Filters: type, status (column), priority, assignee. All filters are multi-select.
- **FR-25.** Sort by: created date (default desc), priority, due date, story points, title.
- **FR-26.** Search by title (case-insensitive substring match, server-side).
- **FR-27.** Clicking a row navigates to the task detail page.

## Data Model

### Modified: Project

| Field | Type | Description |
|---|---|---|
| key | String? | 2–10 uppercase ASCII letters. Unique per org. Immutable once set. |
| nextTaskNumber | Int @default(1) | Auto-incrementing task counter. |

New index: partial unique `(organizationId, key) WHERE key IS NOT NULL` (migration SQL).

### New: BoardColumn

| Field | Type | Description |
|---|---|---|
| id | String @id @default(uuid()) | |
| projectId | String (FK → Project) | Cascade delete |
| name | String | 1–50 chars |
| position | Int | 0-based order. @@unique([projectId, position]) |
| category | String @default("custom") | `todo` / `in_progress` / `done` / `custom` |
| createdAt | DateTime @default(now()) | |

Index: `@@index([projectId])`

### New: Task

| Field | Type | Description |
|---|---|---|
| id | String @id @default(uuid()) | |
| projectId | String (FK → Project) | Cascade delete |
| taskNumber | Int | Per-project sequence. @@unique([projectId, taskNumber]) |
| type | String | `epic` / `task` / `bug` / `story` / `subtask` |
| title | String | 1–200 codepoints |
| description | String? | Markdown, max 10,000 codepoints |
| priority | String? | `low` / `medium` / `high` / `critical` |
| columnId | String (FK → BoardColumn) | Current column |
| position | Float | Order within column (fractional indexing) |
| storyPoints | Int? | 0–999 |
| assigneeId | String? (FK → Membership) | onDelete: SetNull |
| reporterId | String (FK → Membership) | onDelete: Cascade |
| parentId | String? (FK → Task, self) | onDelete: SetNull |
| dueDate | DateTime? @db.Date | |
| createdAt | DateTime @default(now()) | |
| updatedAt | DateTime @updatedAt | |

Indexes: `@@index([projectId, columnId])`, `@@index([assigneeId])`, `@@index([parentId])`

### New Capabilities

Add to `MemberCapability` and `CAPABILITY_MATRIX`:

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| view-board | true | true | true | false |
| manage-tasks | true | true | true | false |
| manage-board-columns | true | true | false | false |

## Screens

### Board View

```
┌─────────────────────────────────────────────────────────────────────┐
│ [← Projects]  PROJECT NAME  [Board | List]  [⚙ Board Settings]    │
├─────────────────────────────────────────────────────────────────────┤
│ [+ Create Task]  Filter: [Type ▾] [Priority ▾] [Assignee ▾]       │
│                   Search: [___________]                            │
├──────────────────┬──────────────────┬──────────────────┬───────────┤
│ To Do (3)        │ In Progress (2)  │ Done (1)         │ + Column  │
│ ┌──────────────┐ │ ┌──────────────┐ │ ┌──────────────┐ │           │
│ │🔵 MOB-5      │ │ │🟢 MOB-3      │ │ │🟢 MOB-1      │ │           │
│ │Fix login bug │ │ │Add dashboard │ │ │Setup CI/CD   │ │           │
│ │🔴 High   👤AK│ │ │🟡 Med    👤JD│ │ │✓ Done        │ │           │
│ │         5sp  │ │ │              │ │ │              │ │           │
│ └──────────────┘ │ └──────────────┘ │ └──────────────┘ │           │
│ ┌──────────────┐ │ ┌──────────────┐ │                  │           │
│ │🐛 MOB-7      │ │ │📖 MOB-4      │ │                  │           │
│ │API 500 error │ │ │User stories  │ │                  │           │
│ │🔴 Critical   │ │ │🟢 Low    👤AK│ │                  │           │
│ └──────────────┘ │ └──────────────┘ │                  │           │
│ ┌──────────────┐ │                  │                  │           │
│ │📋 MOB-8      │ │                  │                  │           │
│ │Refactor auth │ │                  │                  │           │
│ │⚪ None       │ │                  │                  │           │
│ └──────────────┘ │                  │                  │           │
└──────────────────┴──────────────────┴──────────────────┴───────────┘
```

### List View

```
┌─────────────────────────────────────────────────────────────────────┐
│ [← Projects]  PROJECT NAME  [Board | List]                         │
├─────────────────────────────────────────────────────────────────────┤
│ [+ Create Task]  Filter: [Type ▾] [Priority ▾] [Assignee ▾]       │
│                   [Status ▾]   Search: [___________]               │
│                                Sort: [Created ▾]                   │
├──────┬──┬──────────────────┬────────────┬────┬─────┬──┬────────────┤
│ Key  │Ty│ Title            │ Status     │Pri │Asgn │SP│Due         │
├──────┼──┼──────────────────┼────────────┼────┼─────┼──┼────────────┤
│MOB-7 │🐛│ API 500 error    │ To Do      │ 🔴 │     │  │            │
│MOB-5 │🔵│ Fix login bug    │ To Do      │ 🔴 │ 👤AK│ 5│Sep 15      │
│MOB-8 │📋│ Refactor auth    │ To Do      │    │     │  │            │
│MOB-3 │🟢│ Add dashboard    │ In Progress│ 🟡 │ 👤JD│  │            │
│MOB-4 │📖│ User stories     │ In Progress│ 🟢 │ 👤AK│  │            │
│MOB-1 │🟢│ Setup CI/CD      │ Done       │    │     │  │            │
└──────┴──┴──────────────────┴────────────┴────┴─────┴──┴────────────┘
```

### Task Detail Page

```
┌─────────────────────────────────────────────────────────────────────┐
│ [← Board]  MOB-5                                                    │
├─────────────────────────────────────┬───────────────────────────────┤
│                                     │ Status                        │
│ 🔵 Task                             │ [In Progress ▾]               │
│ ┌─────────────────────────────────┐ │                               │
│ │ Fix login bug                   │ │ Assignee                      │
│ └─────────────────────────────────┘ │ [👤 Alex K ▾]                 │
│                                     │                               │
│ Description                    [✏] │ Priority                      │
│ ┌─────────────────────────────────┐ │ [🔴 High ▾]                   │
│ │ The login form throws a 500    │ │                               │
│ │ error when email has special   │ │ Type                          │
│ │ characters...                  │ │ [Task ▾]                      │
│ └─────────────────────────────────┘ │                               │
│                                     │ Story Points                  │
│ ─── Children (2) ──────────────     │ [5]                           │
│ ☐ MOB-9  Write unit test    👤JD   │                               │
│ ☑ MOB-10 Fix regex pattern  👤AK   │ Due Date                      │
│ [+ Add subtask]                     │ [2026-09-15]                  │
│                                     │                               │
│ (Comments, watchers, activity log   │ Parent                        │
│  — see spec 14)                     │ MOB-0: Auth Epic              │
│                                     │                               │
│ (Time logged — see spec 15)         │ Reporter                      │
│                                     │ 👤 John D                     │
│                                     │                               │
│                                     │ Created                       │
│                                     │ Aug 25, 2026                  │
│                                     │                               │
│                                     │ [Delete task]                 │
└─────────────────────────────────────┴───────────────────────────────┘
```

### Board Settings Modal

```
┌──────────────────────────────────────┐
│ Board Settings                    ✕  │
├──────────────────────────────────────┤
│ Columns                             │
│ ┌──────────────────────────────────┐ │
│ │ ≡ To Do              [✏] [🗑]  │ │
│ │ ≡ In Progress         [✏] [🗑]  │ │
│ │ ≡ Code Review         [✏] [🗑]  │ │
│ │ ≡ Done                [✏] [🗑]  │ │
│ └──────────────────────────────────┘ │
│ [+ Add Column]                       │
│                                      │
│ (Labels section — see spec 14)       │
└──────────────────────────────────────┘
```

### Create Task Modal

```
┌──────────────────────────────────────┐
│ Create Task                       ✕  │
├──────────────────────────────────────┤
│ Type                                 │
│ [Task ▾]                             │
│                                      │
│ Title *                              │
│ [_________________________________]  │
│                                      │
│ Description                          │
│ ┌──────────────────────────────────┐ │
│ │ (Markdown supported)             │ │
│ └──────────────────────────────────┘ │
│                                      │
│ Parent (optional)                    │
│ [Select epic... ▾]                   │
│                                      │
│ ┌────────────────┬─────────────────┐ │
│ │ Priority       │ Story Points    │ │
│ │ [None ▾]       │ [___]           │ │
│ └────────────────┴─────────────────┘ │
│ ┌────────────────┬─────────────────┐ │
│ │ Assignee       │ Due Date        │ │
│ │ [Unassigned ▾] │ [____-__-__]    │ │
│ └────────────────┴─────────────────┘ │
│                                      │
│ Status                               │
│ [To Do ▾]                            │
│                                      │
│              [Cancel] [Create Task]  │
└──────────────────────────────────────┘
```

## Flows

### Main Flow: View board and create a task

1. User clicks project name in sidebar (or navigates from Projects page).
2. System loads project detail. If project has a `key`, "Board" and "List" tabs appear.
3. User clicks "Board".
4. System loads `GET .../board`. If first access, default columns are created. Board renders with columns and task cards.
5. User clicks "+ Create Task".
6. System opens Create Task modal with defaults: type=task, column=first column.
7. User fills title (required), optionally sets type, description, priority, assignee, due date, story points, parent, column.
8. User clicks "Create Task".
9. System validates all fields client-side. Sends `POST .../tasks`.
10. On success: closes modal, shows toast "Task created", card appears in target column.
11. Card shows type icon, key, title, priority badge, assignee avatar, story points.

### Alt Flow A: Validation error on create (branches from step 9)
9a. Client-side: inline errors under invalid fields. Modal stays open.
9b. Server-side (e.g., hierarchy violation): toast with error message. Modal stays open.

### Alt Flow B: User role without project access (branches from step 4)
4b. System returns 403. User sees "You do not have permission to view this board".

### Alt Flow C: Project without key (branches from step 2)
2c. "Board" and "List" tabs hidden. If admin/manager, a prompt to set a project key appears on the project detail page.

### Alt Flow D: Archived project (branches from step 4)
4d. Board loads in read-only mode. "+ Create Task" hidden. DnD disabled. Task detail fields are read-only.

### Main Flow: Drag and drop task

1. User presses and holds a task card on the board.
2. Card lifts (visual elevation change), a drop placeholder appears.
3. User drags the card to another column (or different position in same column).
4. Drop zone highlights as the card hovers over valid targets.
5. User releases the card.
6. System optimistically moves the card to the new position.
7. System sends `PATCH .../tasks/{taskId}/move` with `columnId` and `position`.
8. On success: card stays in new position. If column changed, toast "Task moved".
9. On error: card snaps back to original position. Toast with error.

### Main Flow: Edit task on detail page

1. User clicks a task card on the board (or row in list).
2. System navigates to `/org/{orgId}/projects/{projectId}/tasks/{taskId}`.
3. System loads `GET .../tasks/{taskId}`.
4. Task detail renders: title, type badge, description (markdown), side panel fields.
5. User changes assignee via dropdown in side panel.
6. System sends `PUT .../tasks/{taskId}` with `{ "assigneeId": "uuid" }`.
7. On success: field updates. Toast "Task updated".
8. User edits title inline, presses Enter or clicks away.
9. System sends `PUT` with `{ "title": "new title" }`.
10. User clicks "✏" on description. Textarea appears with markdown editor.
11. User edits, clicks "Save". System sends `PUT` with `{ "description": "..." }`.

### Main Flow: Board settings — manage columns

1. Admin/manager clicks "⚙ Board Settings" on the board.
2. System opens Board Settings modal with column list (drag-reorderable).
3. User clicks "+ Add Column", types "Code Review", presses Enter.
4. System sends `POST .../board/columns`. Column appears in list.
5. User drags "Code Review" to position 2 (between "In Progress" and "Done").
6. System sends `PUT .../board/columns/reorder` with ordered IDs.
7. Board updates to show new column order.
8. User clicks 🗑 on an empty column.
9. System sends `DELETE .../board/columns/{columnId}`. Column removed.

### Alt Flow E: Delete non-empty column (branches from step 8)
8e. System shows error toast: "Cannot delete a column that contains tasks. Move or delete the tasks first."

### Alt Flow F: Delete last column (branches from step 8)
8f. System shows error toast: "A board must have at least one column."

### Main Flow: Create task with hierarchy

1. User clicks "+ Create Task".
2. User selects type "Epic".
3. "Parent" field is hidden (epics cannot have parents).
4. User fills title "Auth System", clicks "Create Task". Epic MOB-1 created.
5. User clicks "+ Create Task" again.
6. User selects type "Task".
7. "Parent" field shows available epics: "MOB-1: Auth System".
8. User selects parent, fills title "Login flow", clicks "Create Task". Task MOB-2 created under MOB-1.
9. User opens MOB-2 detail page.
10. User clicks "+ Add subtask".
11. Create modal opens with type pre-set to "Subtask" and parent pre-set to MOB-2.
12. User fills title "Write unit tests", clicks "Create Task". Subtask MOB-3 created.
13. MOB-2 detail page shows MOB-3 in "Children" section.

### Main Flow: List view with filters

1. User clicks "List" tab on board header.
2. System loads `GET .../tasks` and renders table.
3. User opens "Type" filter, selects "Bug".
4. Table filters to show only bugs.
5. User opens "Sort" dropdown, selects "Priority (desc)".
6. Table re-sorts: critical bugs first.
7. User types "login" in search box.
8. Table filters to tasks with "login" in title.
9. User clicks a row. System navigates to task detail page.

## API Contracts

All routes: `api/organizations/:orgId/projects/:projectId/...`
Guards: `SessionGuard` + `OrgScopeGuard`. Capability + project membership checks in service layer.

### Board

**GET `.../board`**
Auth: `view-board`. User role: must be project member.
Returns 400 if project has no `key`. Lazy-creates default columns on first access.

Response 200:
```json
{
  "project": { "id": "uuid", "name": "Mobile App", "key": "MOB", "status": "active" },
  "columns": [
    { "id": "uuid", "name": "To Do", "position": 0, "category": "todo", "taskCount": 3 }
  ],
  "tasks": [
    {
      "id": "uuid", "key": "MOB-5", "taskNumber": 5, "type": "task",
      "title": "Fix login bug", "priority": "high",
      "columnId": "uuid", "position": 1.0, "storyPoints": 5,
      "assignee": { "membershipId": "uuid", "firstName": "Alex", "lastName": "K" },
      "dueDate": "2026-09-15",
      "parentId": null, "parentKey": null,
      "childCount": 2,
      "createdAt": "2026-08-25T10:00:00Z"
    }
  ]
}
```

Error 400: `{ "error": "project_key_required", "message": "Set a project key before using the board" }`
Error 403: `{ "error": "forbidden", "message": "You do not have permission to view this board" }`

### Board Columns

**POST `.../board/columns`**
Auth: `manage-board-columns`.
```json
{ "name": "Code Review", "position": 2 }
```
`position` optional — appends to end if omitted.
Response 201: `{ "id": "uuid", "name": "Code Review", "position": 2, "category": "custom" }`
Error 409: `{ "error": "column_name_duplicate", "message": "A column with this name already exists" }`

**PUT `.../board/columns/:columnId`**
Auth: `manage-board-columns`.
```json
{ "name": "In Review" }
```
Response 200: `{ "id": "uuid", "name": "In Review", "position": 2, "category": "custom" }`
Error 404: `{ "error": "column_not_found", "message": "Column not found" }`

**PUT `.../board/columns/reorder`**
Auth: `manage-board-columns`.
```json
{ "columnIds": ["uuid1", "uuid2", "uuid3", "uuid4"] }
```
All column IDs for the project must be included.
Response 200: `{ "success": true }`
Error 400: `{ "error": "column_ids_mismatch", "message": "All column IDs must be provided" }`

**DELETE `.../board/columns/:columnId`**
Auth: `manage-board-columns`.
Response 200: `{ "success": true }`
Error 400 (not empty): `{ "error": "column_not_empty", "message": "Cannot delete a column that contains tasks. Move or delete the tasks first." }`
Error 400 (last column): `{ "error": "column_delete_last", "message": "A board must have at least one column" }`
Error 404: `{ "error": "column_not_found", "message": "Column not found" }`

### Tasks

**POST `.../tasks`**
Auth: `manage-tasks`. User role: must be project member.
```json
{
  "type": "task",
  "title": "Fix login bug",
  "description": "The login form throws a 500 error...",
  "priority": "high",
  "columnId": "uuid",
  "storyPoints": 5,
  "assigneeId": "uuid",
  "parentId": "uuid",
  "dueDate": "2026-09-15"
}
```
Required: `type`, `title`. All others optional.
`columnId` defaults to first column by position if omitted.
`reporterId` set from session.
`taskNumber` atomically allocated via `SELECT ... FOR UPDATE` on project row.
Response 201:
```json
{
  "id": "uuid", "key": "MOB-1", "taskNumber": 1, "type": "task",
  "title": "Fix login bug", "description": "The login form throws a 500 error...",
  "priority": "high", "columnId": "uuid", "columnName": "To Do",
  "position": 1.0, "storyPoints": 5, "dueDate": "2026-09-15",
  "assignee": { "membershipId": "uuid", "firstName": "Alex", "lastName": "K" },
  "reporter": { "membershipId": "uuid", "firstName": "John", "lastName": "D" },
  "parentId": "uuid", "parentKey": "MOB-0",
  "createdAt": "2026-08-28T10:00:00Z", "updatedAt": "2026-08-28T10:00:00Z"
}
```
Error 400 (hierarchy): `{ "error": "epic_cannot_have_parent", "message": "Epics cannot have a parent task" }`
Error 400 (archived): `{ "error": "project_archived", "message": "Cannot modify tasks in an archived project" }`

**GET `.../tasks`** (list view)
Auth: `view-board`. User role: must be project member.
Query params: `type`, `priority`, `assigneeId`, `columnId` (all multi-value via comma), `sort` (`created_desc` default, `created_asc`, `priority_desc`, `priority_asc`, `due_date_asc`, `due_date_desc`, `story_points_desc`, `title_asc`), `search` (title substring, case-insensitive).
Response 200:
```json
{
  "tasks": [
    {
      "id": "uuid", "key": "MOB-5", "taskNumber": 5, "type": "task",
      "title": "Fix login bug", "priority": "high",
      "columnId": "uuid", "columnName": "To Do",
      "storyPoints": 5, "dueDate": "2026-09-15",
      "assignee": { "membershipId": "uuid", "firstName": "Alex", "lastName": "K" },
      "parentId": null, "parentKey": null, "childCount": 2,
      "createdAt": "2026-08-25T10:00:00Z"
    }
  ]
}
```

**GET `.../tasks/:taskId`**
Auth: `view-board`. User role: must be project member.
Response 200:
```json
{
  "id": "uuid", "key": "MOB-5", "taskNumber": 5, "type": "task",
  "title": "Fix login bug",
  "description": "The login form throws a 500 error...",
  "priority": "high",
  "columnId": "uuid", "columnName": "To Do",
  "position": 1.0, "storyPoints": 5, "dueDate": "2026-09-15",
  "assignee": { "membershipId": "uuid", "firstName": "Alex", "lastName": "K" },
  "reporter": { "membershipId": "uuid", "firstName": "John", "lastName": "D" },
  "parent": { "id": "uuid", "key": "MOB-0", "title": "Auth Epic" },
  "children": [
    { "id": "uuid", "key": "MOB-9", "type": "subtask", "title": "Write unit test",
      "priority": null, "columnName": "To Do",
      "assignee": { "membershipId": "uuid", "firstName": "Jane", "lastName": "D" } }
  ],
  "createdAt": "2026-08-26T09:00:00Z",
  "updatedAt": "2026-08-28T14:00:00Z"
}
```
Error 404: `{ "error": "task_not_found", "message": "Task not found" }`

**PUT `.../tasks/:taskId`**
Auth: `manage-tasks`. Partial update — only provided fields change.
```json
{
  "title": "Fix login bug (updated)",
  "priority": "critical",
  "assigneeId": "uuid"
}
```
Response 200: full task object.
Error 400 (archived): `{ "error": "project_archived", "message": "Cannot modify tasks in an archived project" }`
Error 400 (hierarchy): appropriate hierarchy error
Error 404: `{ "error": "task_not_found", "message": "Task not found" }`

**PATCH `.../tasks/:taskId/move`**
Auth: `manage-tasks`.
```json
{ "columnId": "uuid", "position": 2.5 }
```
At least one field required.
Response 200: `{ "id": "uuid", "columnId": "uuid", "columnName": "In Progress", "position": 2.5 }`
Error 400 (archived): `{ "error": "project_archived", "message": "Cannot modify tasks in an archived project" }`

**DELETE `.../tasks/:taskId`**
Auth: `manage-tasks`. Hard delete. Children orphaned.
Response 200: `{ "success": true }`
Error 400 (archived): `{ "error": "project_archived", "message": "Cannot modify tasks in an archived project" }`

### Project Creation/Update (spec 11 modifications)

**POST `.../projects`** — add optional `key` field.
**PUT `.../projects/:projectId`** — allow setting `key` if not already set. Return 400 `key_immutable` if already set and value differs.

## Validation Rules

1. **Project key**: trim, required (for board access), 2–10 codepoints, `/^[A-Z]+$/`. Errors: `keyRequired` / `keyTooShort` / `keyTooLong` / `keyInvalidFormat`.
2. **Column name**: trim, required, 1–50 codepoints. Errors: `columnNameRequired` / `columnNameTooLong`.
3. **Task title**: trim, required, 1–200 codepoints. Errors: `titleRequired` / `titleTooLong`.
4. **Task description**: trim, max 10,000 codepoints. Null allowed. Error: `descriptionTooLong`.
5. **Task type**: must be one of `epic`, `task`, `bug`, `story`, `subtask`. Errors: `typeRequired` / `typeInvalid`.
6. **Priority**: if provided, must be one of `low`, `medium`, `high`, `critical`. Error: `priorityInvalid`.
7. **Story points**: if provided, integer 0–999. Error: `storyPointsInvalid`.
8. **Due date**: if provided, must be a valid date (ISO format). Error: `dueDateInvalid`.
9. **Hierarchy** (server-side only): see FR-10. Errors: `epicCannotHaveParent` / `subtaskRequiresParent` / `subtaskParentInvalid` / `taskParentMustBeEpic` / `parentNotFound` / `parentWrongProject` / `circularReference`.
10. **Assignee** (server-side only): must be active membership in org. Error: `assigneeInvalid`.
11. **Column IDs (reorder)**: must contain all column IDs for the project, no duplicates. Error: `columnIdsMismatch`.

Client-side validation: rules 1–8 (immediate feedback). Server-side: all rules 1–11.

## Error Messages

| Context | Message |
|---|---|
| Project key required | Set a project key before using the board |
| Project key too short | Project key must be at least 2 characters |
| Project key too long | Project key must be at most 10 characters |
| Project key invalid | Project key must contain only uppercase letters |
| Project key duplicate | A project with this key already exists in your organization |
| Project key immutable | Project key cannot be changed after creation |
| Column name empty | Column name is required |
| Column name too long | Column name must be at most 50 characters |
| Column name duplicate | A column with this name already exists |
| Column not found | Column not found |
| Column not empty | Cannot delete a column that contains tasks. Move or delete the tasks first. |
| Column last | A board must have at least one column |
| Column IDs mismatch | All column IDs must be provided |
| Task title empty | Task title is required |
| Task title too long | Task title must be at most 200 characters |
| Description too long | Description must be at most 10,000 characters |
| Type missing | Task type is required |
| Type invalid | Task type must be one of: epic, task, bug, story, subtask |
| Priority invalid | Priority must be one of: low, medium, high, critical |
| Story points invalid | Story points must be an integer between 0 and 999 |
| Due date invalid | Invalid due date |
| Epic has parent | Epics cannot have a parent task |
| Subtask no parent | Subtasks must have a parent task |
| Subtask wrong parent | Subtask parent must be a task, bug, or story (not an epic or subtask) |
| Task wrong parent | Parent of a task, bug, or story must be an epic |
| Parent not found | Parent task not found |
| Parent wrong project | Parent task must be in the same project |
| Circular reference | Cannot create a circular parent reference |
| Assignee invalid | Assignee must be an active member of the organization |
| Task not found | Task not found |
| Archived project | Cannot modify tasks in an archived project |
| Permission denied (board) | You do not have permission to view this board |
| Permission denied (tasks) | You do not have permission to manage tasks in this project |
| Permission denied (columns) | You do not have permission to manage board columns |
| Toast: task created | Task created |
| Toast: task updated | Task updated |
| Toast: task deleted | Task deleted |
| Toast: task moved | Task moved |
| Toast: column created | Column created |
| Toast: column updated | Column updated |
| Toast: column deleted | Column deleted |
| Empty: board | No tasks yet. Create your first task to get started. |
| Empty: column | No tasks in this column. |
| Empty: list | No tasks match your filters. |
| Delete confirmation | Are you sure you want to delete "{taskKey}: {title}"? This action cannot be undone. Subtasks will be detached. |
| Generic error | Something went wrong. Please try again. |

## UI Description

### Board View (`/org/{orgId}/projects/{projectId}/board`)

**Layout:** Full-width horizontal scrolling container. Top bar: back link to projects, project name, view toggle (Board/List as SegmentedControl), board settings gear icon (admin/manager only). Filter bar: "+ Create Task" button (primary), type/priority/assignee dropdown filters, search input. Main area: columns as vertical lanes, each with header (name + count) and scrollable card stack. "+ Column" at far right (admin/manager only).

**Task cards:** Type icon (color-coded: epic=purple, task=blue, bug=red, story=green, subtask=gray), task key (muted), title (max 2 lines with ellipsis), priority icon (if set), assignee avatar (if set), story point badge (if set), due date text (red if overdue, muted otherwise). Card has subtle border-left color matching type.

**Drag and drop:** Cards draggable via @dnd-kit or similar. Drop placeholder shows between cards and at column top/bottom. Drag overlay shows a semi-transparent card copy. Optimistic update — card moves immediately; reverts on API error with toast.

**States table:**

| State | Behavior |
|---|---|
| Loading | Skeleton columns (3) with 2–3 placeholder cards each |
| Empty board (no tasks) | Centered message + "Create your first task" button |
| Empty column | Gray text "No tasks in this column" |
| Error on load | Toast "Something went wrong" + retry option |
| Archived project | Cards non-draggable (visual cue: no grab cursor), create/settings hidden, muted header bar |

**Responsive:** Desktop (≥1280px): all columns visible with horizontal scroll. Tablet (768–1279px): columns scrollable horizontally, cards slightly narrower. Mobile (<768px): single column visible, swipe to navigate between columns (column tabs at top).

### List View (`/org/{orgId}/projects/{projectId}/list`)

**Layout:** Same top bar as board. Filter bar adds status (column) filter dropdown and sort dropdown. Below: full-width data table.

**Table columns:** Key (fixed width), Type (icon only), Title (flex), Status (column name as badge), Priority (icon), Assignee (avatar + name on hover), SP (number), Due (date, red if overdue).

**Interactions:** Row click navigates to task detail. Hover: row highlight. No inline editing in list view.

**Responsive:** Desktop: full table. Tablet: hide SP and Due columns. Mobile: card layout — each task as a compact card showing key, type icon, title, priority, assignee.

### Task Detail Page (`/org/{orgId}/projects/{projectId}/tasks/{taskId}`)

**Layout:** Two-column (60/40 split on desktop). Left: content area. Right: side panel (sticky on scroll).

**Left column:**
- Task key + type badge (e.g., "🔵 Task") at top
- Title: rendered as text. Click to switch to input field. Enter or blur saves. Escape cancels.
- Description: markdown rendered below title. Edit button switches to textarea (monospace, with tab support). Save/Cancel buttons appear. Preview tab optional.
- Children section: list of child tasks showing key, title, type icon, assignee, done state (✓ if in "done" category column). "+ Add subtask" button opens create modal with pre-set parent and type=subtask.

**Right column (side panel):**
- Status: dropdown with column names
- Assignee: searchable dropdown with org members (avatar + name)
- Priority: dropdown (None, Low, Medium, High, Critical)
- Type: dropdown
- Story Points: number input
- Due Date: date picker
- Parent: read-only link to parent task (if any), or "None"
- Reporter: read-only (avatar + name)
- Created: formatted date
- Delete task: red text button at bottom, opens confirm dialog

All side panel fields trigger immediate API call on change (debounced for text inputs).

**Responsive:** Desktop: two columns. Tablet: side panel collapses into horizontal bar below title. Mobile: side panel as expandable accordion or separate tab.

### Board Settings Modal

Overlay modal triggered by gear icon. Two sections stacked vertically.

**Columns section:** Vertical list of column rows. Each row: drag handle (≡), column name (text or inline input on edit), edit button (✏), delete button (🗑, disabled if column has tasks). Rows are drag-reorderable. "+ Add Column" button at bottom opens an inline input with Enter to save.

**Accessibility:** Tab through columns, Enter to edit, Escape to cancel. Delete confirms with keyboard.

### Create Task Modal

Standard form modal. Fields in order: Type (dropdown), Title (text input, required), Description (textarea, markdown), Parent (dropdown, filtered by type rules — shows epics for task/bug/story, shows tasks/bugs/stories for subtask, hidden for epic), Priority + Story Points (side by side), Assignee + Due Date (side by side), Status (dropdown with column names). Cancel + Create Task buttons.

**Behavior:** Validation on blur for each field. Submit validates all. Error messages inline below fields. Modal scrollable if content overflows.

### Project Creation (Modified)

Project create modal (spec 11) gains a "Project Key" field. Auto-suggested from first letters of project name (e.g., "Mobile App" → "MOB"), editable. Validated: 2–10 uppercase letters, unique per org. Optional at creation but required for board access.

Project detail page: key shown as read-only badge if set. If not set, admin/manager sees an "Add Key" button that opens inline input.

## Required `data-testid` Attributes

**Board view:**
`board-view`, `board-create-task-btn`, `board-settings-btn`, `board-view-toggle`
`board-filter-type`, `board-filter-priority`, `board-filter-assignee`, `board-search`
`board-column-{id}`, `board-column-header-{id}`, `board-column-count-{id}`, `board-column-add`
`board-task-card-{id}`

**List view:**
`list-view`, `list-create-task-btn`
`list-filter-type`, `list-filter-priority`, `list-filter-assignee`, `list-filter-status`, `list-search`, `list-sort`
`list-task-row-{id}`

**Task detail:**
`task-detail`, `task-key`, `task-type-badge`
`task-title`, `task-title-input`
`task-description`, `task-description-edit-btn`, `task-description-input`, `task-description-save-btn`, `task-description-cancel-btn`
`task-status-select`, `task-assignee-select`, `task-priority-select`, `task-type-select`
`task-story-points-input`, `task-due-date-input`
`task-parent-link`, `task-reporter`
`task-children-section`, `task-child-{id}`, `task-add-subtask-btn`
`task-created-date`
`task-delete-btn`, `task-delete-confirm`, `task-delete-cancel`

**Create task modal:**
`create-task-modal`, `create-task-type`, `create-task-title`, `create-task-title-error`
`create-task-description`
`create-task-parent`, `create-task-priority`, `create-task-story-points`
`create-task-assignee`, `create-task-due-date`, `create-task-status`
`create-task-submit`, `create-task-cancel`

**Board settings:**
`board-settings-modal`
`board-settings-column-{id}`, `board-settings-column-name-{id}`, `board-settings-column-edit-{id}`, `board-settings-column-delete-{id}`
`board-settings-column-add`, `board-settings-column-name-input`

**Project (modified):**
`project-key-input`, `project-key-badge`, `project-add-key-btn`

## Security

### Authentication & Authorization
- All endpoints require `SessionGuard` + `OrgScopeGuard`.
- Capability checks in service layer using shared `can(role, capability)`.
- `user` role additionally checked against `ProjectMember` for project-scoped access. Returns 403 if not a project member.
- `viewer` role returns 403 on all board endpoints.

### Cross-Organization Protection (IDOR)
- All queries filter by `organizationId` from session.
- Task, column lookups verify the entity belongs to the project, which belongs to the org.
- Project membership check for `user` role prevents accessing other projects' boards.
- Non-existent or cross-org resources return 404 (not 403) to prevent enumeration.

### Input Handling
- All text fields trimmed and codepoint-counted server-side.
- Markdown stored as-is; rendered with a sanitizing renderer on the client (XSS prevention).
- `assigneeId` and `parentId` validated against org's memberships and project's tasks.
- `columnId` validated against project's columns.
- Fractional position values are sanitized (must be finite float).

### Concurrency
- Task number allocation uses `SELECT ... FOR UPDATE` on the project row in a transaction.
- Column reorder is a batch replace — last write wins.
- Fractional indexing for task positions minimizes contention during concurrent DnD.

### Rate Limiting
- Board reads: 120/min per session.
- Task mutations (create/update/move/delete): 60/min per session.
- Column mutations: 20/min per session.

### Logging
- All task CRUD operations logged (actor, action, entityId, timestamp) at application level.

## Out of Scope

- Labels, comments, watchers, activity log (spec 14)
- Time tracking integration (spec 15)
- Sprint / iteration management
- Custom task types
- Custom fields on tasks
- File attachments
- Bulk operations (multi-select, bulk move/assign/delete)
- Task dependencies / blocking relationships
- Notifications
- Saved filter views
- Import/export
- Burndown / velocity charts
- Keyboard shortcuts on board
- Board swimlanes
- Real-time collaboration (WebSocket board updates)

## Test Cases

### Unit Tests

**TC-13-UNIT-01: validateProjectKey — valid keys**
- Level: Unit
- Steps: Call `validateProjectKey` with `"MOB"`, `"AB"` (min 2), `"ABCDEFGHIJ"` (max 10)
- Expected: All return `{ valid: true, value: <trimmed> }`

**TC-13-UNIT-02: validateProjectKey — too short**
- Level: Unit
- Steps: Call with `"A"` (1 char)
- Expected: `{ valid: false, error: "Project key must be at least 2 characters" }`

**TC-13-UNIT-03: validateProjectKey — too long**
- Level: Unit
- Steps: Call with `"ABCDEFGHIJK"` (11 chars)
- Expected: `{ valid: false, error: "Project key must be at most 10 characters" }`

**TC-13-UNIT-04: validateProjectKey — lowercase rejected**
- Level: Unit
- Steps: Call with `"mob"`, `"Mob"`, `"mOB"`
- Expected: All return `{ valid: false, error: "Project key must contain only uppercase letters" }`

**TC-13-UNIT-05: validateProjectKey — special chars rejected**
- Level: Unit
- Steps: Call with `"MO1"`, `"MO-B"`, `"MO B"`, `"MO_B"`, `"MOB!"`, `"МОБ"` (Cyrillic)
- Expected: All return invalid format error

**TC-13-UNIT-06: validateProjectKey — empty and whitespace**
- Level: Unit
- Steps: Call with `""`, `" "`, `"  MOB  "` (spaces around valid key)
- Expected: Empty/whitespace → required error. Padded → valid (trimmed to "MOB")

**TC-13-UNIT-07: validateTaskTitle — valid values**
- Level: Unit
- Steps: Call with `"A"` (min), `"Fix the bug"`, `"A".repeat(200)` (max), `"  Fix bug  "` (trim)
- Expected: All valid. Trimmed to "A", "Fix the bug", 200 chars, "Fix bug"

**TC-13-UNIT-08: validateTaskTitle — empty and whitespace**
- Level: Unit
- Steps: Call with `""`, `" "`, `"   "`
- Expected: All return `{ valid: false, error: "Task title is required" }`

**TC-13-UNIT-09: validateTaskTitle — too long**
- Level: Unit
- Steps: Call with `"A".repeat(201)`, string with 200 Cyrillic chars (valid), string with 201 Cyrillic chars (invalid)
- Expected: 201 ASCII → too long. 200 Cyrillic → valid. 201 Cyrillic → too long.

**TC-13-UNIT-10: validateTaskTitle — codepoint counting**
- Level: Unit
- Steps: Call with emoji string (2-byte codepoints) at exactly 200 codepoints, and at 201
- Expected: 200 → valid. 201 → too long.

**TC-13-UNIT-11: validateTaskDescription — null and empty**
- Level: Unit
- Steps: Call with `null`, `undefined`, `""`, `" "`
- Expected: All return `{ valid: true, value: null }`

**TC-13-UNIT-12: validateTaskDescription — valid values**
- Level: Unit
- Steps: Call with `"Short"`, `"A".repeat(10000)`, markdown with `# heading\n\n- list`
- Expected: All valid with trimmed values

**TC-13-UNIT-13: validateTaskDescription — too long**
- Level: Unit
- Steps: Call with `"A".repeat(10001)`, Cyrillic at 10001 codepoints
- Expected: Both return `{ valid: false, error: "Description must be at most 10,000 characters" }`

**TC-13-UNIT-14: validateColumnName — valid values**
- Level: Unit
- Steps: Call with `"A"`, `"To Do"`, `"A".repeat(50)`, `"  Trimmed  "`
- Expected: All valid with trimmed values

**TC-13-UNIT-15: validateColumnName — invalid**
- Level: Unit
- Steps: Call with `""`, `" "`, `"A".repeat(51)`
- Expected: Required, required, too long

**TC-13-UNIT-16: isValidTaskType — valid types**
- Level: Unit
- Steps: Call with `"epic"`, `"task"`, `"bug"`, `"story"`, `"subtask"`
- Expected: All return `true`

**TC-13-UNIT-17: isValidTaskType — invalid types**
- Level: Unit
- Steps: Call with `"feature"`, `"Epic"` (case), `""`, `"TASK"`, `"sub_task"`
- Expected: All return `false`

**TC-13-UNIT-18: isValidTaskPriority — valid priorities**
- Level: Unit
- Steps: Call with `"low"`, `"medium"`, `"high"`, `"critical"`
- Expected: All return `true`

**TC-13-UNIT-19: isValidTaskPriority — invalid priorities**
- Level: Unit
- Steps: Call with `"urgent"`, `"Low"` (case), `""`, `"none"`, `"CRITICAL"`
- Expected: All return `false`

**TC-13-UNIT-20: validateStoryPoints — valid values**
- Level: Unit
- Steps: Call with `0`, `1`, `13`, `999`, `null`, `undefined`
- Expected: 0, 1, 13, 999 → valid. null/undefined → valid (nullable)

**TC-13-UNIT-21: validateStoryPoints — invalid values**
- Level: Unit
- Steps: Call with `-1`, `1000`, `3.5`, `"five"`, `NaN`, `Infinity`
- Expected: All return invalid error

**TC-13-UNIT-22: formatTaskKey — formatting**
- Level: Unit
- Steps: Call with `("MOB", 1)`, `("WEB", 42)`, `("AB", 999)`
- Expected: `"MOB-1"`, `"WEB-42"`, `"AB-999"`

**TC-13-UNIT-23: capabilities — view-board**
- Level: Unit
- Steps: Call `can(role, 'view-board')` for all 4 roles
- Expected: admin=true, manager=true, user=true, viewer=false

**TC-13-UNIT-24: capabilities — manage-tasks**
- Level: Unit
- Steps: Call `can(role, 'manage-tasks')` for all 4 roles
- Expected: admin=true, manager=true, user=true, viewer=false

**TC-13-UNIT-25: capabilities — manage-board-columns**
- Level: Unit
- Steps: Call `can(role, 'manage-board-columns')` for all 4 roles
- Expected: admin=true, manager=true, user=false, viewer=false

### Integration Tests

**TC-13-INT-01: Board lazy initialization — first access creates defaults**
- Level: Integration
- Preconditions: Project with key "MOB", no columns
- Steps: GET `.../board`
- Expected: 200 with 3 columns (To Do/In Progress/Done), positions 0/1/2, categories todo/in_progress/done, empty tasks

**TC-13-INT-02: Board lazy initialization — idempotent**
- Level: Integration
- Preconditions: Board already initialized
- Steps: GET `.../board` twice
- Expected: Same 3 columns both times, no duplicates

**TC-13-INT-03: Board access without project key**
- Level: Integration
- Preconditions: Project without key
- Steps: GET `.../board`
- Expected: 400 `project_key_required`

**TC-13-INT-04: Board access — admin without project membership**
- Level: Integration
- Preconditions: Admin not in ProjectMember for this project
- Steps: GET `.../board`
- Expected: 200 (admin bypasses project membership)

**TC-13-INT-05: Board access — user as project member**
- Level: Integration
- Preconditions: User role, assigned to project
- Steps: GET `.../board`
- Expected: 200

**TC-13-INT-06: Board access — user NOT project member**
- Level: Integration
- Preconditions: User role, not assigned to project
- Steps: GET `.../board`
- Expected: 403 `forbidden`

**TC-13-INT-07: Board access — viewer role**
- Level: Integration
- Steps: GET `.../board` as viewer
- Expected: 403 `forbidden`

**TC-13-INT-08: Create column — happy path**
- Level: Integration
- Preconditions: Board initialized with 3 columns
- Steps: POST `.../board/columns` with `{ "name": "Code Review" }`
- Expected: 201 with position 3, category "custom"

**TC-13-INT-09: Create column — with explicit position**
- Level: Integration
- Steps: POST `.../board/columns` with `{ "name": "QA", "position": 1 }`
- Expected: 201 at position 1, existing columns shifted

**TC-13-INT-10: Create column — duplicate name (case-insensitive)**
- Level: Integration
- Preconditions: Column "To Do" exists
- Steps: POST `.../board/columns` with `{ "name": "to do" }`
- Expected: 409 `column_name_duplicate`

**TC-13-INT-11: Create column — user role forbidden**
- Level: Integration
- Preconditions: User role, project member
- Steps: POST `.../board/columns`
- Expected: 403

**TC-13-INT-12: Rename column**
- Level: Integration
- Steps: PUT `.../board/columns/{id}` with `{ "name": "In Review" }`
- Expected: 200 with updated name

**TC-13-INT-13: Rename column — duplicate name**
- Level: Integration
- Steps: Rename column to an existing column's name
- Expected: 409 `column_name_duplicate`

**TC-13-INT-14: Rename column — not found**
- Level: Integration
- Steps: PUT with non-existent columnId
- Expected: 404 `column_not_found`

**TC-13-INT-15: Reorder columns — valid**
- Level: Integration
- Preconditions: 3 columns (A, B, C)
- Steps: PUT `.../board/columns/reorder` with `[C, A, B]`
- Expected: 200. Positions updated: C=0, A=1, B=2

**TC-13-INT-16: Reorder columns — missing IDs**
- Level: Integration
- Steps: PUT reorder with only 2 of 3 column IDs
- Expected: 400 `column_ids_mismatch`

**TC-13-INT-17: Reorder columns — extra IDs**
- Level: Integration
- Steps: PUT reorder with IDs including a non-existent one
- Expected: 400 `column_ids_mismatch`

**TC-13-INT-18: Delete column — empty column**
- Level: Integration
- Preconditions: Column with 0 tasks
- Steps: DELETE `.../board/columns/{id}`
- Expected: 200

**TC-13-INT-19: Delete column — non-empty**
- Level: Integration
- Preconditions: Column with 1 task
- Steps: DELETE column
- Expected: 400 `column_not_empty`

**TC-13-INT-20: Delete column — last column**
- Level: Integration
- Preconditions: 1 column remaining (others deleted)
- Steps: DELETE last column
- Expected: 400 `column_delete_last`

**TC-13-INT-21: Delete column — not found**
- Level: Integration
- Steps: DELETE non-existent column
- Expected: 404 `column_not_found`

**TC-13-INT-22: Create task — minimal fields**
- Level: Integration
- Preconditions: Board initialized
- Steps: POST `.../tasks` with `{ "type": "task", "title": "Test task" }`
- Expected: 201 with key "MOB-1", taskNumber 1, columnId = first column, reporter = caller, assignee null, priority null, storyPoints null, dueDate null

**TC-13-INT-23: Create task — all fields**
- Level: Integration
- Steps: POST with type, title, description, priority, columnId (2nd column), storyPoints, assigneeId, dueDate
- Expected: 201 with all fields set correctly

**TC-13-INT-24: Create task — auto-increment numbers**
- Level: Integration
- Steps: Create 3 tasks sequentially
- Expected: Keys MOB-1, MOB-2, MOB-3

**TC-13-INT-25: Create task — concurrent number allocation**
- Level: Integration
- Steps: POST 5 tasks in parallel (concurrent requests)
- Expected: All succeed with unique sequential numbers (no duplicates)

**TC-13-INT-26: Create task — default column (first by position)**
- Level: Integration
- Preconditions: Reorder columns so "In Progress" is position 0
- Steps: Create task without columnId
- Expected: Task lands in "In Progress" (the new first column)

**TC-13-INT-27: Create task — explicit column**
- Level: Integration
- Steps: Create task with columnId = "Done" column
- Expected: Task in "Done" column

**TC-13-INT-28: Create task — invalid column (wrong project)**
- Level: Integration
- Steps: Create task with columnId from a different project
- Expected: 400

**TC-13-INT-29: Create task — title validation (empty)**
- Level: Integration
- Steps: POST with `{ "type": "task", "title": "" }`
- Expected: 400 `title_required`

**TC-13-INT-30: Create task — title validation (too long)**
- Level: Integration
- Steps: POST with title of 201 chars
- Expected: 400 `title_too_long`

**TC-13-INT-31: Create task — type validation (invalid)**
- Level: Integration
- Steps: POST with `{ "type": "feature" }`
- Expected: 400 `type_invalid`

**TC-13-INT-32: Create task — priority validation (invalid)**
- Level: Integration
- Steps: POST with `{ "priority": "urgent" }`
- Expected: 400 `priority_invalid`

**TC-13-INT-33: Create task — story points validation**
- Level: Integration
- Steps: POST with storyPoints = -1, then 1000, then 3.5
- Expected: All return 400 `story_points_invalid`

**TC-13-INT-34: Create task — assignee valid (active membership)**
- Level: Integration
- Steps: POST with assigneeId = active membership in org
- Expected: 201 with assignee set

**TC-13-INT-35: Create task — assignee invalid (removed member)**
- Level: Integration
- Steps: POST with assigneeId = removed membership
- Expected: 400 `assignee_invalid`

**TC-13-INT-36: Create task — assignee invalid (different org)**
- Level: Integration
- Steps: POST with assigneeId from different org
- Expected: 400 `assignee_invalid`

**TC-13-INT-37: Create task — archived project**
- Level: Integration
- Preconditions: Project archived
- Steps: POST task
- Expected: 400 `project_archived`

**TC-13-INT-38: Hierarchy — epic cannot have parent**
- Level: Integration
- Steps: Create epic with parentId set to another task
- Expected: 400 `epic_cannot_have_parent`

**TC-13-INT-39: Hierarchy — task with epic parent**
- Level: Integration
- Steps: Create epic MOB-1. Create task with parentId = MOB-1
- Expected: 201. parentKey = "MOB-1"

**TC-13-INT-40: Hierarchy — task with non-epic parent**
- Level: Integration
- Steps: Create task MOB-1. Create another task with parentId = MOB-1
- Expected: 400 `task_parent_must_be_epic`

**TC-13-INT-41: Hierarchy — subtask requires parent**
- Level: Integration
- Steps: Create subtask without parentId
- Expected: 400 `subtask_requires_parent`

**TC-13-INT-42: Hierarchy — subtask with valid parent (task)**
- Level: Integration
- Steps: Create task MOB-1. Create subtask with parentId = MOB-1
- Expected: 201

**TC-13-INT-43: Hierarchy — subtask with valid parent (bug)**
- Level: Integration
- Steps: Create bug MOB-1. Create subtask with parentId = MOB-1
- Expected: 201

**TC-13-INT-44: Hierarchy — subtask with valid parent (story)**
- Level: Integration
- Steps: Create story MOB-1. Create subtask with parentId = MOB-1
- Expected: 201

**TC-13-INT-45: Hierarchy — subtask with epic parent**
- Level: Integration
- Steps: Create epic. Create subtask with parentId = epic
- Expected: 400 `subtask_parent_invalid`

**TC-13-INT-46: Hierarchy — subtask with subtask parent**
- Level: Integration
- Steps: Create task. Create subtask. Create another subtask with parentId = first subtask
- Expected: 400 `subtask_parent_invalid`

**TC-13-INT-47: Hierarchy — parent from different project**
- Level: Integration
- Steps: Create task in project A. Create task in project B with parentId = project A's task
- Expected: 400 `parent_wrong_project`

**TC-13-INT-48: Hierarchy — parent not found**
- Level: Integration
- Steps: Create task with parentId = non-existent UUID
- Expected: 400 `parent_not_found`

**TC-13-INT-49: Hierarchy — circular reference prevention**
- Level: Integration
- Steps: Create epic E. Create task T under E. Update E's parentId to T.
- Expected: 400 `circular_reference` (epic can't have parent anyway, but test the check)

**TC-13-INT-50: Get task detail — happy path**
- Level: Integration
- Steps: Create task with all fields. GET `.../tasks/{taskId}`
- Expected: 200 with all fields, children array, parent info

**TC-13-INT-51: Get task detail — not found**
- Level: Integration
- Steps: GET with non-existent taskId
- Expected: 404 `task_not_found`

**TC-13-INT-52: Get task detail — cross-org (IDOR protection)**
- Level: Integration
- Steps: GET task belonging to another org
- Expected: 404

**TC-13-INT-53: Update task — partial update (title only)**
- Level: Integration
- Steps: PUT with `{ "title": "New title" }`
- Expected: 200. Title changed. All other fields unchanged.

**TC-13-INT-54: Update task — partial update (priority only)**
- Level: Integration
- Steps: PUT with `{ "priority": "critical" }`
- Expected: 200. Priority changed. Other fields unchanged.

**TC-13-INT-55: Update task — change assignee**
- Level: Integration
- Steps: PUT with `{ "assigneeId": "uuid" }`
- Expected: 200. Assignee updated.

**TC-13-INT-56: Update task — clear assignee (set to null)**
- Level: Integration
- Steps: PUT with `{ "assigneeId": null }`
- Expected: 200. Assignee cleared.

**TC-13-INT-57: Update task — change type**
- Level: Integration
- Steps: PUT with `{ "type": "bug" }`
- Expected: 200. Type changed.

**TC-13-INT-58: Update task — change type to epic (has children violation)**
- Level: Integration
- Preconditions: Task has subtasks
- Steps: PUT with `{ "type": "epic" }` — subtasks can't be under epics
- Expected: 400 (hierarchy violation, since subtask parent must be task/bug/story)

**TC-13-INT-59: Update task — change type to subtask (no parent)**
- Level: Integration
- Preconditions: Task has no parent
- Steps: PUT with `{ "type": "subtask" }`
- Expected: 400 `subtask_requires_parent`

**TC-13-INT-60: Update task — archived project**
- Level: Integration
- Preconditions: Project archived
- Steps: PUT task
- Expected: 400 `project_archived`

**TC-13-INT-61: Update task — immutable fields ignored**
- Level: Integration
- Steps: PUT with `{ "taskNumber": 999, "reporterId": "uuid", "projectId": "uuid" }`
- Expected: 200. taskNumber, reporterId, projectId unchanged.

**TC-13-INT-62: Move task — change column**
- Level: Integration
- Preconditions: Task in "To Do" column
- Steps: PATCH `.../tasks/{id}/move` with `{ "columnId": "in-progress-uuid" }`
- Expected: 200. columnName = "In Progress"

**TC-13-INT-63: Move task — change position only**
- Level: Integration
- Steps: PATCH with `{ "position": 2.5 }`
- Expected: 200. Position updated, column unchanged.

**TC-13-INT-64: Move task — change column and position**
- Level: Integration
- Steps: PATCH with both `columnId` and `position`
- Expected: 200. Both updated.

**TC-13-INT-65: Move task — archived project**
- Level: Integration
- Steps: PATCH move in archived project
- Expected: 400 `project_archived`

**TC-13-INT-66: Move task — invalid column (different project)**
- Level: Integration
- Steps: PATCH with columnId from different project
- Expected: 400

**TC-13-INT-67: Delete task — happy path**
- Level: Integration
- Steps: DELETE `.../tasks/{id}`
- Expected: 200. Task no longer in board.

**TC-13-INT-68: Delete task — children orphaned**
- Level: Integration
- Preconditions: Task has 2 subtasks
- Steps: DELETE parent task
- Expected: 200. Subtasks still exist, parentId = null.

**TC-13-INT-69: Delete task — not found**
- Level: Integration
- Steps: DELETE non-existent taskId
- Expected: 404

**TC-13-INT-70: Delete task — archived project**
- Level: Integration
- Steps: DELETE task in archived project
- Expected: 400 `project_archived`

**TC-13-INT-71: List tasks — no filters**
- Level: Integration
- Preconditions: 5 tasks of various types
- Steps: GET `.../tasks`
- Expected: 200 with all 5 tasks, default sort by created_desc

**TC-13-INT-72: List tasks — filter by type**
- Level: Integration
- Steps: GET `.../tasks?type=bug`
- Expected: Only bugs returned

**TC-13-INT-73: List tasks — filter by multiple types**
- Level: Integration
- Steps: GET `.../tasks?type=bug,story`
- Expected: Bugs and stories returned

**TC-13-INT-74: List tasks — filter by priority**
- Level: Integration
- Steps: GET `.../tasks?priority=high,critical`
- Expected: Only high and critical priority tasks

**TC-13-INT-75: List tasks — filter by assignee**
- Level: Integration
- Steps: GET `.../tasks?assigneeId=uuid`
- Expected: Only tasks assigned to that member

**TC-13-INT-76: List tasks — filter by column**
- Level: Integration
- Steps: GET `.../tasks?columnId=uuid`
- Expected: Only tasks in that column

**TC-13-INT-77: List tasks — search by title**
- Level: Integration
- Steps: GET `.../tasks?search=login`
- Expected: Only tasks with "login" in title (case-insensitive)

**TC-13-INT-78: List tasks — sort by priority desc**
- Level: Integration
- Steps: GET `.../tasks?sort=priority_desc`
- Expected: Critical first, then high, medium, low, null last

**TC-13-INT-79: List tasks — sort by due date asc**
- Level: Integration
- Steps: GET `.../tasks?sort=due_date_asc`
- Expected: Earliest due date first, null last

**TC-13-INT-80: List tasks — combined filters and sort**
- Level: Integration
- Steps: GET `.../tasks?type=task&priority=high&sort=created_asc`
- Expected: High-priority tasks sorted by oldest first

**TC-13-INT-81: Project key creation — happy path**
- Level: Integration
- Steps: PUT `.../projects/{id}` with `{ "key": "MOB" }`
- Expected: 200. Project now has key "MOB"

**TC-13-INT-82: Project key — duplicate across org**
- Level: Integration
- Preconditions: Project A has key "MOB"
- Steps: PUT project B with `{ "key": "MOB" }`
- Expected: 409 `key_duplicate`

**TC-13-INT-83: Project key — immutable once set**
- Level: Integration
- Preconditions: Project has key "MOB"
- Steps: PUT with `{ "key": "WEB" }`
- Expected: 400 `key_immutable`

**TC-13-INT-84: Project key — same value is idempotent**
- Level: Integration
- Preconditions: Project has key "MOB"
- Steps: PUT with `{ "key": "MOB" }`
- Expected: 200 (no error, same value)

**TC-13-INT-85: Project key — set at creation**
- Level: Integration
- Steps: POST `.../projects` with `{ "name": "Mobile App", "key": "MOB" }`
- Expected: 201 with key "MOB"

**TC-13-INT-86: Member removal — cascades project membership, board access revoked for user**
- Level: Integration
- Preconditions: User assigned to project, can access board
- Steps: Remove user from org. Try GET board.
- Expected: Board returns 403 (no membership)

**TC-13-INT-87: Task with children — children listed in detail**
- Level: Integration
- Preconditions: Epic with 2 child tasks, 1 child task with 1 subtask
- Steps: GET epic detail. GET child task detail.
- Expected: Epic shows 2 children. Child task shows 1 child (subtask).

**TC-13-INT-88: Board data — taskCount per column**
- Level: Integration
- Preconditions: 3 tasks in "To Do", 1 in "In Progress"
- Steps: GET `.../board`
- Expected: columns[0].taskCount = 3, columns[1].taskCount = 1

### E2E Tests

**TC-13-E2E-01: Create project with key and view board**
- Level: E2E
- Preconditions: Logged in as admin
- Steps:
  1. Navigate to Projects page
  2. Click "+ Create Project"
  3. Enter name "Mobile App"
  4. Enter key "MOB"
  5. Click "Create"
  6. Click the created project
  7. Click "Board" tab
  8. Verify 3 default columns appear (To Do, In Progress, Done)
  9. Verify empty board message shows
- Expected: Board visible with default columns and empty state
- Selectors: `project-key-input`, `board-view`, `board-column-*`

**TC-13-E2E-02: Create task on board**
- Level: E2E
- Preconditions: Project "MOB" with board
- Steps:
  1. Click "+ Create Task"
  2. Select type "Bug"
  3. Enter title "Login fails on Safari"
  4. Set priority "High"
  5. Set story points "5"
  6. Click "Create Task"
  7. Verify modal closes
  8. Verify toast "Task created"
  9. Verify card MOB-1 appears in first column with bug icon and high priority
- Expected: Task card visible with correct key, type, priority
- Selectors: `board-create-task-btn`, `create-task-modal`, `create-task-type`, `create-task-title`, `create-task-priority`, `create-task-story-points`, `create-task-submit`, `board-task-card-*`

**TC-13-E2E-03: Create task — validation error (empty title)**
- Level: E2E
- Steps:
  1. Click "+ Create Task"
  2. Click "Create Task" without title
  3. Verify "Task title is required" error appears
  4. Enter valid title
  5. Verify error clears
  6. Submit successfully
- Expected: Inline error shown and cleared
- Selectors: `create-task-title`, `create-task-title-error`, `create-task-submit`

**TC-13-E2E-04: Drag task between columns**
- Level: E2E
- Preconditions: Task MOB-1 in "To Do"
- Steps:
  1. Drag MOB-1 card from "To Do" to "In Progress"
  2. Verify card appears in "In Progress"
  3. Verify "To Do" count decremented
  4. Verify "In Progress" count incremented
  5. Open task detail
  6. Verify status shows "In Progress"
- Expected: Card moved, counts updated, status reflected
- Selectors: `board-task-card-*`, `board-column-*`, `board-column-count-*`, `task-status-select`

**TC-13-E2E-05: Task detail — edit fields**
- Level: E2E
- Preconditions: Task exists
- Steps:
  1. Click task card to open detail page
  2. Click title to edit, change text, press Enter
  3. Verify toast "Task updated"
  4. Change assignee via dropdown
  5. Change priority to "Critical"
  6. Set story points to "8"
  7. Set due date
  8. Verify all changes persist (reload page)
- Expected: All fields editable, changes saved and persisted
- Selectors: `task-title`, `task-title-input`, `task-assignee-select`, `task-priority-select`, `task-story-points-input`, `task-due-date-input`

**TC-13-E2E-06: Task detail — edit description (markdown)**
- Level: E2E
- Steps:
  1. Open task detail
  2. Click edit (✏) on description
  3. Enter markdown: "## Bug\n- Step 1\n- Step 2"
  4. Click "Save"
  5. Verify markdown renders as heading + list
- Expected: Markdown saved and rendered correctly
- Selectors: `task-description`, `task-description-edit-btn`, `task-description-input`, `task-description-save-btn`

**TC-13-E2E-07: Create epic → task → subtask hierarchy**
- Level: E2E
- Steps:
  1. Create task type "Epic", title "Auth System" → MOB-1
  2. Create task type "Task", title "Login flow", parent "MOB-1: Auth System" → MOB-2
  3. Open MOB-2 detail
  4. Verify parent shows "MOB-1: Auth System"
  5. Click "+ Add subtask"
  6. Verify modal opens with type "Subtask" pre-selected
  7. Enter title "Write tests", create → MOB-3
  8. Verify MOB-3 appears in children section of MOB-2
  9. Open MOB-1 detail
  10. Verify MOB-2 appears in children section
- Expected: Three-level hierarchy displayed correctly
- Selectors: `create-task-type`, `create-task-parent`, `task-parent-link`, `task-children-section`, `task-child-*`, `task-add-subtask-btn`

**TC-13-E2E-08: Board settings — add, reorder, delete columns**
- Level: E2E
- Preconditions: Board with default 3 columns
- Steps:
  1. Click ⚙ Board Settings
  2. Click "+ Add Column"
  3. Type "Code Review", press Enter
  4. Verify new column appears in settings list
  5. Close settings, verify column on board
  6. Reopen settings, drag "Code Review" before "Done"
  7. Close settings, verify column order changed
  8. Reopen settings, click delete on "Code Review" (empty)
  9. Verify column removed from board
- Expected: Column add/reorder/delete works
- Selectors: `board-settings-btn`, `board-settings-modal`, `board-settings-column-add`, `board-settings-column-name-input`, `board-settings-column-delete-*`

**TC-13-E2E-09: Board settings — cannot delete non-empty column**
- Level: E2E
- Preconditions: Column "To Do" has 1 task
- Steps:
  1. Open Board Settings
  2. Attempt delete on "To Do"
  3. Verify delete button disabled or error toast appears
- Expected: Column not deleted, error message shown
- Selectors: `board-settings-column-delete-*`

**TC-13-E2E-10: List view — switch view, filter, sort**
- Level: E2E
- Preconditions: 5 tasks of various types and priorities
- Steps:
  1. Click "List" in view toggle
  2. Verify table with all tasks
  3. Open Type filter, select "Bug"
  4. Verify only bugs shown
  5. Open Sort, select "Priority (desc)"
  6. Verify critical bugs first
  7. Type "login" in search
  8. Verify filtered results
  9. Click a row
  10. Verify navigation to task detail
- Expected: Filters, sort, and search work. Row click navigates.
- Selectors: `board-view-toggle`, `list-view`, `list-filter-type`, `list-sort`, `list-search`, `list-task-row-*`, `task-detail`

**TC-13-E2E-11: Delete task with confirmation**
- Level: E2E
- Steps:
  1. Open task detail
  2. Click "Delete task"
  3. Verify confirmation dialog with task key and title
  4. Click "Cancel" — verify task still exists
  5. Click "Delete task" again
  6. Click "Confirm"
  7. Verify redirect to board
  8. Verify task card removed
- Expected: Confirmation required. Delete removes task.
- Selectors: `task-delete-btn`, `task-delete-confirm`, `task-delete-cancel`, `board-view`

**TC-13-E2E-12: Delete task — subtasks orphaned**
- Level: E2E
- Preconditions: Task MOB-2 has subtask MOB-3
- Steps:
  1. Open MOB-2, delete it
  2. Verify MOB-3 still visible on board (no parent)
  3. Open MOB-3 detail
  4. Verify parent is "None"
- Expected: Subtask persists without parent
- Selectors: `task-delete-btn`, `task-delete-confirm`, `board-task-card-*`, `task-parent-link`

**TC-13-E2E-13: User role — board access only for assigned projects**
- Level: E2E
- Preconditions: User role, assigned to project A, not assigned to project B
- Steps:
  1. Navigate to project A board
  2. Verify board loads, can create tasks
  3. Navigate directly to project B board URL
  4. Verify "You do not have permission" message
- Expected: Access granted for A, denied for B
- Selectors: `board-view`, `board-create-task-btn`

**TC-13-E2E-14: User role — cannot manage columns**
- Level: E2E
- Preconditions: User role, project member
- Steps:
  1. Navigate to board
  2. Verify ⚙ Board Settings button is NOT visible
  3. Verify "+ Column" button is NOT visible
- Expected: Column management UI hidden for user role
- Selectors: `board-settings-btn`, `board-column-add`

**TC-13-E2E-15: Archived project — read-only board**
- Level: E2E
- Preconditions: Project with tasks, then archived
- Steps:
  1. Navigate to board
  2. Verify "+ Create Task" hidden
  3. Verify task cards not draggable (no grab cursor)
  4. Click task card to open detail
  5. Verify fields are read-only (dropdowns disabled, no edit buttons)
  6. Verify "Delete task" hidden
- Expected: Board fully read-only
- Selectors: `board-create-task-btn`, `board-task-card-*`, `task-status-select`, `task-delete-btn`

**TC-13-E2E-16: Project key — set on existing project**
- Level: E2E
- Preconditions: Project without key
- Steps:
  1. Navigate to project detail
  2. Verify "Board" tab not visible
  3. Click "Add Key" button
  4. Enter "MOB", save
  5. Verify key badge appears
  6. Verify "Board" tab now visible
  7. Click "Board", verify board loads
- Expected: Key enables board access
- Selectors: `project-add-key-btn`, `project-key-input`, `project-key-badge`, `board-view`

**TC-13-E2E-17: Board filters — multiple active filters**
- Level: E2E
- Preconditions: Tasks of various types, priorities, assignees
- Steps:
  1. On board view, select Type = Bug
  2. Verify only bug cards shown
  3. Additionally select Priority = High
  4. Verify only high-priority bugs shown
  5. Clear all filters
  6. Verify all cards shown
- Expected: Filters combine (AND logic), clear works
- Selectors: `board-filter-type`, `board-filter-priority`, `board-task-card-*`

**TC-13-E2E-18: Create multiple tasks — numbers increment**
- Level: E2E
- Steps:
  1. Create task → verify MOB-1
  2. Create task → verify MOB-2
  3. Delete MOB-1
  4. Create task → verify MOB-3 (not MOB-1 — numbers don't recycle)
- Expected: Monotonically increasing task numbers
- Selectors: `board-task-card-*`, `task-key`
