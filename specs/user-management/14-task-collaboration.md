---
id: "14"
title: Task Collaboration
routes: ["/org/{orgId}/projects/{projectId}/tasks/{taskId}"]
api:
  - "POST   .../projects/{projectId}/labels"
  - "PUT    .../projects/{projectId}/labels/{labelId}"
  - "DELETE .../projects/{projectId}/labels/{labelId}"
  - "GET    .../projects/{projectId}/labels"
  - "POST   .../projects/{projectId}/tasks/{taskId}/labels"
  - "DELETE .../projects/{projectId}/tasks/{taskId}/labels/{labelId}"
  - "POST   .../projects/{projectId}/tasks/{taskId}/comments"
  - "PUT    .../projects/{projectId}/tasks/{taskId}/comments/{commentId}"
  - "DELETE .../projects/{projectId}/tasks/{taskId}/comments/{commentId}"
  - "GET    .../projects/{projectId}/tasks/{taskId}/comments"
  - "POST   .../projects/{projectId}/tasks/{taskId}/watchers"
  - "DELETE .../projects/{projectId}/tasks/{taskId}/watchers"
  - "GET    .../projects/{projectId}/tasks/{taskId}/watchers"
  - "GET    .../projects/{projectId}/tasks/{taskId}/activity"
entities: [TaskLabel, TaskLabelAssignment, TaskComment, TaskWatcher, TaskActivity]
tags: [labels, comments, watchers, activity-log, tasks, collaboration]
depends-on: ["13"]
---

# 14 — Task Collaboration

## Summary

Tasks (spec 13) gain collaboration features: **labels** for categorization, **comments** for discussion, **watchers** for future-notification subscriptions, and an **activity log** for auditability. Labels are project-scoped, color-coded tags managed by admin/manager and assignable by anyone with `manage-tasks`. Comments are markdown, editable/deletable by their author, and deletable by admin/manager. Watchers is a data-model-and-UI feature only in this spec — actual notification delivery is out of scope. The activity log is a read-only chronological feed of key task events, populated automatically by the system as side effects of other operations (label/comment/status/assignee/field changes).

**Depends on:** Spec 13 (Kanban Board & Tasks).

## Actors & Preconditions

- **Actors:** Authenticated members with an active membership in the organization, subject to the same project-scoping rules as spec 13.
- **Preconditions:**
  - Organization exists with at least one project (spec 11) that has a board (spec 13).
  - The task being commented on, labeled, watched, or inspected must exist in that project.
  - For `user` role: the member must be assigned to the project via `ProjectMember` (same rule as spec 13's `view-board` / `manage-tasks`).

## Roles & Permission Matrix

| Capability                  | admin | manager | user | viewer |
|------------------------------|-------|---------|------|--------|
| manage-labels                | ✓     | ✓       | ✗    | ✗      |
| assign/remove labels on task | ✓¹    | ✓¹      | ✓¹   | ✗      |
| view comments                | ✓¹    | ✓¹      | ✓¹   | ✗      |
| create comment                | ✓¹    | ✓¹      | ✓¹   | ✗      |
| edit own comment              | ✓¹    | ✓¹      | ✓¹   | ✗      |
| delete own comment            | ✓¹    | ✓¹      | ✓¹   | ✗      |
| delete any comment            | ✓     | ✓       | ✗    | ✗      |
| watch / unwatch task           | ✓¹    | ✓¹      | ✓¹   | ✗      |
| view watchers list             | ✓¹    | ✓¹      | ✓¹   | ✗      |
| view activity log              | ✓¹    | ✓¹      | ✓¹   | ✗      |

¹ `user` role is further scoped: can only access tasks in projects they are assigned to via `ProjectMember` (identical scoping rule as `view-board`/`manage-tasks` in spec 13). Admin/manager bypass project membership, matching spec 13.

Label assignment reuses the `manage-tasks` capability (spec 13) rather than a new capability — any member who can edit a task can attach/detach labels on it. `manage-labels` is a new capability gating label **definition** (create/edit/delete label records) in Board Settings.

## Functional Requirements

### Labels

- **FR-1.** A `TaskLabel` belongs to exactly one project. Name: 1–30 codepoints, trimmed. Unique per project (case-insensitive).
- **FR-2.** Color: 7-character hex string, `/^#[0-9A-Fa-f]{6}$/` (e.g., `#FF0000`). No uniqueness constraint on color — multiple labels may share a color.
- **FR-3.** Admin/manager create, edit (name and/or color), and delete labels via the Board Settings modal (extending spec 13's modal with a Labels section).
- **FR-4.** Deleting a label removes all its `TaskLabelAssignment` rows (cascade). No confirmation gate on assignment count — the delete confirmation dialog states how many tasks will be affected.
- **FR-5.** A task may have zero or more labels. A label may be assigned to zero or more tasks (many-to-many via `TaskLabelAssignment`).
- **FR-6.** Assigning/removing a label on a task requires `manage-tasks` (same capability as task edit), plus the `user`-role project-membership scoping.
- **FR-7.** Assigning an already-assigned label, or removing a not-assigned label, is idempotent — returns success without creating a duplicate `TaskActivity` entry or duplicate assignment row.
- **FR-8.** Labels render on task cards (board and list views) as small colored chips, and in the task detail side panel as removable chips with an "add label" control.

### Comments

- **FR-9.** A `TaskComment` belongs to a task and an author (`Membership`). Content: markdown, 1–10,000 codepoints, trimmed.
- **FR-10.** Any member who can view the task (`view-board` + project scoping) can create a comment.
- **FR-11.** A member can edit and delete their own comments. Admin/manager can delete (but not edit) any member's comment.
- **FR-12.** Editing a comment updates `updatedAt`. The UI shows an "(edited)" indicator when `updatedAt` differs from `createdAt` by more than a few seconds (to avoid flagging trivial round-trips).
- **FR-13.** Deleting a comment is a hard delete. It does not remove the corresponding `TaskActivity` "comment_added" entry from the history; a new `TaskActivity` entry of type `comment_deleted` is recorded.
- **FR-14.** Comments are listed oldest-first (chronological) on the task detail page.
- **FR-15.** Creating a comment auto-watches the task for its author (see FR-17).

### Watchers

- **FR-16.** A `TaskWatcher` is a (task, membership) pair. A member either watches a task or does not — no partial/granular watch settings in v1.
- **FR-17.** Auto-watch triggers (idempotent — no duplicate row, no error if already watching):
  - The reporter is auto-watched when a task is created (their own membership).
  - Any member is auto-watched when they add a comment to the task.
  - Any member is auto-watched when they are set as the task's assignee (including via task create or update).
- **FR-18.** Members can manually toggle watch/unwatch at any time, including un-watching a task they were auto-watched on (e.g., a former assignee un-watches after reassignment — auto-watch does not re-trigger for that member unless they comment or are re-assigned).
- **FR-19.** The watchers list is visible to anyone who can view the task; it shows all current watchers (avatar + name).
- **FR-20.** Watchers are informational/data-model only in this spec. No email, in-app, or push notification is sent to watchers as a result of any event. That is out of scope (see Out of Scope).

### Activity Log

- **FR-21.** Every task records a chronological, read-only activity log. Entries are created automatically as side effects — there is no direct "create activity" API.
- **FR-22.** Logged actions (enum `TaskActivityAction`): `created`, `field_changed`, `comment_added`, `comment_deleted`, `label_added`, `label_removed`, `watcher_added`, `watcher_removed`.
- **FR-23.** `field_changed` entries record `field` (the changed field name, e.g. `"priority"`, `"assigneeId"`, `"columnId"`, `"title"`, `"dueDate"`, `"storyPoints"`, `"type"`, `"description"`, `"parentId"`), `oldValue`, and `newValue` (both stored as strings; display-formatted client-side — e.g., membership IDs resolved to names, column IDs to column names).
- **FR-24.** A single `PUT .../tasks/{taskId}` request that changes multiple fields produces one `field_changed` activity entry per changed field, all sharing the same `createdAt` timestamp (batched in the same DB transaction as the update).
- **FR-25.** `PATCH .../tasks/{taskId}/move` (spec 13) produces a `field_changed` entry for `columnId` when the column changes. A same-column position-only move (drag reorder within a column) does **not** produce an activity entry — only column changes are logged, to avoid log noise from reordering.
- **FR-26.** Activity log is not paginated in v1 — the full history for a task is returned in one response, ordered oldest-first.
- **FR-27.** `description` field changes log `oldValue`/`newValue` as `null` in the activity payload (full markdown diffing/snapshotting is out of scope) — the entry itself still records that the field changed, with `field: "description"`.

## Data Model

### New: TaskLabel

| Field | Type | Description |
|---|---|---|
| id | String @id @default(uuid()) | |
| projectId | String (FK → Project) | Cascade delete |
| name | String | 1–30 codepoints. Unique per project (case-insensitive, enforced in service layer + DB citext/lower index) |
| color | String | 7-char hex, e.g. `#FF0000` |
| createdAt | DateTime @default(now()) | |

Index: `@@index([projectId])`. Unique: `@@unique([projectId, name])` (name stored/compared lower-cased for case-insensitivity, or enforced via a functional unique index).

### New: TaskLabelAssignment

| Field | Type | Description |
|---|---|---|
| taskId | String (FK → Task) | Cascade delete |
| labelId | String (FK → TaskLabel) | Cascade delete |

`@@id([taskId, labelId])` (composite primary key).

### New: TaskComment

| Field | Type | Description |
|---|---|---|
| id | String @id @default(uuid()) | |
| taskId | String (FK → Task) | Cascade delete |
| authorId | String (FK → Membership) | onDelete: SetNull is not used — author membership is expected to remain; see Security for removed-member display handling |
| content | String | Markdown, 1–10,000 codepoints |
| createdAt | DateTime @default(now()) | |
| updatedAt | DateTime @updatedAt | |

Index: `@@index([taskId, createdAt])`

### New: TaskWatcher

| Field | Type | Description |
|---|---|---|
| taskId | String (FK → Task) | Cascade delete |
| membershipId | String (FK → Membership) | Cascade delete |

`@@id([taskId, membershipId])` (composite primary key / unique).

### New: TaskActivity

| Field | Type | Description |
|---|---|---|
| id | String @id @default(uuid()) | |
| taskId | String (FK → Task) | Cascade delete |
| actorId | String (FK → Membership) | Member who triggered the event |
| action | String | `created` / `field_changed` / `comment_added` / `comment_deleted` / `label_added` / `label_removed` / `watcher_added` / `watcher_removed` |
| field | String? | Set only for `field_changed` |
| oldValue | String? | Set only for `field_changed` |
| newValue | String? | Set only for `field_changed` |
| createdAt | DateTime @default(now()) | |

Index: `@@index([taskId, createdAt])`

### New Capabilities

Add to `MemberCapability` and `CAPABILITY_MATRIX`:

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| manage-labels | true | true | false | false |

Label assignment, comments, watchers, and activity read use the existing `manage-tasks` / `view-board` capabilities from spec 13 plus the same `user`-role project-membership scoping — no additional capability rows are needed for those.

## Screens

### Board Settings Modal — Labels Section

```
┌──────────────────────────────────────┐
│ Board Settings                    ✕  │
├──────────────────────────────────────┤
│ Columns                              │
│ (— see spec 13 —)                    │
│                                       │
│ Labels                               │
│ ┌───────────────────────────────────┐│
│ │ ● Bug            #E11D48   [✏][🗑]││
│ │ ● Frontend        #3B82F6  [✏][🗑]││
│ │ ● Needs Design     #A855F7 [✏][🗑]││
│ └───────────────────────────────────┘│
│ [+ Add Label]                        │
└──────────────────────────────────────┘
```

### Task Cards with Labels (Board / List)

```
┌──────────────┐
│🔵 MOB-5      │
│Fix login bug │
│🔴 High   👤AK│
│🏷 Bug  Frontend│
│         5sp  │
└──────────────┘
```

### Comments Section (Task Detail)

```
│ ─── Comments (3) ──────────────────  │
│ ┌───────────────────────────────────┐│
│ │ 👤 Alex K · Aug 26, 10:03 AM       ││
│ │ Repro steps confirmed on Safari.   ││
│ │                        [✏] [🗑]    ││
│ └───────────────────────────────────┘│
│ ┌───────────────────────────────────┐│
│ │ 👤 Jane D · Aug 27, 9:15 AM (edited)││
│ │ **Fixed** in commit abc123.        ││
│ │                                    ││
│ └───────────────────────────────────┘│
│ ┌───────────────────────────────────┐│
│ │ 👤 You · Aug 28, 8:00 AM           ││
│ │ Verified on staging. Closing.      ││
│ │                        [✏] [🗑]    ││
│ └───────────────────────────────────┘│
│                                       │
│ [ Write a comment... (markdown)    ] │
│                        [Comment]     │
```

### Watchers Section (Task Detail Side Panel)

```
│ Watchers (3)                    [👁 Watching ▾] │
│ 👤 John D  👤 Alex K  👤 Jane D                  │
```

- The `[👁 Watching ▾]` / `[👁‍🗨 Watch]` control toggles the caller's own watch state; the avatar row lists all current watchers (caller included when watching).

### Activity Log (Task Detail)

```
│ ─── Activity ──────────────────────  │
│ 👤 John D created this task           │
│    Aug 25, 9:00 AM                    │
│ 👤 Alex K changed Priority             │
│    Medium → High · Aug 25, 2:30 PM    │
│ 👤 Alex K added label "Bug"            │
│    Aug 25, 2:31 PM                    │
│ 👤 Jane D commented                    │
│    Aug 26, 10:03 AM                   │
│ 👤 John D changed Assignee             │
│    Unassigned → Alex K · Aug 27, 9AM  │
│ 👤 Jane D changed Status               │
│    To Do → In Progress · Aug 27, 9AM  │
```

- Each row: actor avatar + name, human-readable action description, timestamp. `field_changed` rows show `old → new` in display-formatted form (column names, member names, etc. — not raw IDs).

## Flows

### Main Flow: Admin creates and assigns a label

1. Admin/manager clicks "⚙ Board Settings" on the board (spec 13), opens Labels section.
2. Admin clicks "+ Add Label".
3. Modal shows name input and a color picker (swatches + hex input).
4. Admin enters name "Bug", picks color `#E11D48`, clicks "Save".
5. System sends `POST .../labels`. On success: label appears in the list, toast "Label created".
6. Admin closes Board Settings, opens a task's detail page.
7. In the side panel, admin clicks "+ Add label" next to the Labels chips row.
8. A dropdown of project labels appears (with color swatches). Admin selects "Bug".
9. System sends `POST .../tasks/{taskId}/labels`. Label chip appears on the task. Card on the board now shows the "Bug" chip.
10. A `TaskActivity` entry `label_added` is recorded and appears in the Activity section.

### Alt Flow A: Duplicate label name (branches from step 5)
5a. System returns 409 `label_name_duplicate`. Toast: "A label with this name already exists". Modal stays open.

### Alt Flow B: Delete a label in use (branches from Board Settings)
1. Admin clicks 🗑 on "Bug" (assigned to 4 tasks).
2. Confirmation dialog: "Delete label 'Bug'? It will be removed from 4 tasks. This cannot be undone."
3. Admin confirms. System sends `DELETE .../labels/{labelId}`.
4. Label and all its assignments removed. Board/list/task-detail chips update on next fetch.

### Main Flow: Comment on a task

1. User opens a task detail page they have view access to.
2. User scrolls to Comments section, types markdown in the composer.
3. User clicks "Comment".
4. System sends `POST .../tasks/{taskId}/comments`.
5. On success: comment appears at bottom of list (own avatar, "You", timestamp). Composer clears.
6. System auto-watches the commenter (FR-17) and records `comment_added` in the activity log.
7. Other members who load/refresh the task see the new comment and, if not already watching, remain unaffected (auto-watch applies only to the commenter).

### Alt Flow C: Edit own comment
1. User clicks ✏ on their own comment.
2. Composer pre-fills with the comment's markdown, in edit mode.
3. User edits, clicks "Save".
4. System sends `PUT .../tasks/{taskId}/comments/{commentId}`. Comment updates; "(edited)" indicator appears.

### Alt Flow D: Delete a comment (own, or admin/manager on any)
1. User (or admin/manager) clicks 🗑 on a comment.
2. Confirmation: "Delete this comment? This action cannot be undone."
3. On confirm, system sends `DELETE .../tasks/{taskId}/comments/{commentId}`.
4. Comment removed from the list. Activity log records `comment_deleted`.

### Alt Flow E: Non-author, non-admin attempts to edit/delete a comment
- Edit/delete controls are hidden client-side for comments not owned by the caller (unless caller is admin/manager, who see delete-only). A direct API call still returns 403.

### Main Flow: Watch / unwatch a task

1. User opens a task detail page. The Watchers control shows "Watch" (not currently watching) or "Watching" (already watching — e.g., auto-watched as assignee).
2. User clicks the toggle.
3. System sends `POST .../tasks/{taskId}/watchers` (to watch) or `DELETE .../tasks/{taskId}/watchers` (to unwatch).
4. On success: control label flips, the watchers avatar row updates, and a `watcher_added`/`watcher_removed` activity entry is recorded.

### Alt Flow F: Auto-watch on assignment
1. Admin assigns a task to Alex via the side panel dropdown (spec 13 flow).
2. System processes the `PUT .../tasks/{taskId}` update: records `field_changed` for `assigneeId`, and auto-adds Alex as a watcher if not already watching (records `watcher_added` if newly added).
3. If Alex later reassigns the task away from themselves, Alex remains a watcher unless they manually unwatch.

### Main Flow: View activity log

1. User opens a task detail page.
2. System loads `GET .../tasks/{taskId}/activity` alongside the task detail.
3. Activity section renders entries oldest-first: task creation, subsequent field changes, comments, label changes, watcher changes — each with actor, human-readable description, and timestamp.
4. User performs an action elsewhere (e.g., drags the task to a new column). On return to the task detail (or via optimistic append), a new `field_changed` (columnId) entry appears at the bottom.

## API Contracts

All routes: `api/organizations/:orgId/projects/:projectId/...`
Guards: `SessionGuard` + `OrgScopeGuard`. Capability + project-membership checks in service layer (same pattern as spec 13).

### Labels

**POST `.../labels`**
Auth: `manage-labels`.
```json
{ "name": "Bug", "color": "#E11D48" }
```
Response 201: `{ "id": "uuid", "projectId": "uuid", "name": "Bug", "color": "#E11D48", "createdAt": "2026-08-28T10:00:00Z" }`
Error 409: `{ "error": "label_name_duplicate", "message": "A label with this name already exists" }`

**PUT `.../labels/:labelId`**
Auth: `manage-labels`.
```json
{ "name": "Critical Bug", "color": "#B91C1C" }
```
Partial update — either field alone is valid.
Response 200: full label object.
Error 404: `{ "error": "label_not_found", "message": "Label not found" }`
Error 409: `{ "error": "label_name_duplicate", "message": "A label with this name already exists" }`

**DELETE `.../labels/:labelId`**
Auth: `manage-labels`. Removes the label and cascades all `TaskLabelAssignment` rows.
Response 200: `{ "success": true, "unassignedFromTaskCount": 4 }`
Error 404: `{ "error": "label_not_found", "message": "Label not found" }`

**GET `.../labels`**
Auth: `view-board` (same as spec 13). User role: must be project member.
Response 200:
```json
{ "labels": [ { "id": "uuid", "name": "Bug", "color": "#E11D48", "createdAt": "2026-08-25T10:00:00Z" } ] }
```

**POST `.../tasks/:taskId/labels`**
Auth: `manage-tasks`.
```json
{ "labelId": "uuid" }
```
Idempotent — assigning an already-assigned label returns 200/201 without duplicate side effects.
Response 201: `{ "taskId": "uuid", "labelId": "uuid" }`
Error 400: `{ "error": "label_wrong_project", "message": "Label must belong to the same project as the task" }`
Error 404: `{ "error": "label_not_found", "message": "Label not found" }`

**DELETE `.../tasks/:taskId/labels/:labelId`**
Auth: `manage-tasks`. Idempotent — removing a non-assigned label returns 200.
Response 200: `{ "success": true }`

### Comments

**POST `.../tasks/:taskId/comments`**
Auth: `view-board` (viewing capability suffices to comment — no separate capability). User role: must be project member.
```json
{ "content": "Repro steps confirmed on Safari." }
```
Response 201:
```json
{
  "id": "uuid", "taskId": "uuid",
  "author": { "membershipId": "uuid", "firstName": "Alex", "lastName": "K" },
  "content": "Repro steps confirmed on Safari.",
  "createdAt": "2026-08-26T10:03:00Z", "updatedAt": "2026-08-26T10:03:00Z"
}
```
Error 400: `{ "error": "content_required", "message": "Comment cannot be empty" }`

**PUT `.../tasks/:taskId/comments/:commentId`**
Auth: comment author only.
```json
{ "content": "Updated comment text." }
```
Response 200: full comment object with refreshed `updatedAt`.
Error 403: `{ "error": "forbidden", "message": "You can only edit your own comments" }`
Error 404: `{ "error": "comment_not_found", "message": "Comment not found" }`

**DELETE `.../tasks/:taskId/comments/:commentId`**
Auth: comment author, or admin/manager for any comment.
Response 200: `{ "success": true }`
Error 403: `{ "error": "forbidden", "message": "You do not have permission to delete this comment" }`
Error 404: `{ "error": "comment_not_found", "message": "Comment not found" }`

**GET `.../tasks/:taskId/comments`**
Auth: `view-board`. User role: must be project member.
Response 200:
```json
{
  "comments": [
    {
      "id": "uuid",
      "author": { "membershipId": "uuid", "firstName": "Alex", "lastName": "K" },
      "content": "Repro steps confirmed on Safari.",
      "createdAt": "2026-08-26T10:03:00Z", "updatedAt": "2026-08-26T10:03:00Z"
    }
  ]
}
```
Sorted oldest-first.

### Watchers

**POST `.../tasks/:taskId/watchers`**
Auth: `view-board`. No body. Watches the task for the caller. Idempotent.
Response 201: `{ "taskId": "uuid", "membershipId": "uuid" }`

**DELETE `.../tasks/:taskId/watchers`**
Auth: `view-board`. No body. Unwatches the task for the caller. Idempotent.
Response 200: `{ "success": true }`

**GET `.../tasks/:taskId/watchers`**
Auth: `view-board`. User role: must be project member.
Response 200:
```json
{
  "watchers": [
    { "membershipId": "uuid", "firstName": "John", "lastName": "D" },
    { "membershipId": "uuid", "firstName": "Alex", "lastName": "K" }
  ],
  "isWatching": true
}
```
`isWatching` reflects whether the caller is in the list.

### Activity

**GET `.../tasks/:taskId/activity`**
Auth: `view-board`. User role: must be project member.
Response 200:
```json
{
  "activity": [
    {
      "id": "uuid", "action": "created",
      "actor": { "membershipId": "uuid", "firstName": "John", "lastName": "D" },
      "field": null, "oldValue": null, "newValue": null,
      "createdAt": "2026-08-25T09:00:00Z"
    },
    {
      "id": "uuid", "action": "field_changed",
      "actor": { "membershipId": "uuid", "firstName": "Alex", "lastName": "K" },
      "field": "priority", "oldValue": "medium", "newValue": "high",
      "createdAt": "2026-08-25T14:30:00Z"
    },
    {
      "id": "uuid", "action": "comment_added",
      "actor": { "membershipId": "uuid", "firstName": "Jane", "lastName": "D" },
      "field": null, "oldValue": null, "newValue": null,
      "createdAt": "2026-08-26T10:03:00Z"
    }
  ]
}
```
Sorted oldest-first, unpaginated.

## Validation Rules

1. **Label name**: trim, required, 1–30 codepoints, unique per project (case-insensitive). Errors: `labelNameRequired` / `labelNameTooLong` / `labelNameDuplicate`.
2. **Label color**: required, `/^#[0-9A-Fa-f]{6}$/`. Error: `labelColorInvalid`.
3. **Label assignment**: `labelId` must exist and belong to the same project as the task. Errors: `labelNotFound` / `labelWrongProject`.
4. **Comment content**: trim, required, 1–10,000 codepoints. Errors: `contentRequired` / `contentTooLong`.
5. **Comment edit/delete authorization**: caller must be the comment author, or admin/manager for delete. Error: `forbidden`.
6. **Watcher toggle**: no body validation — action is idempotent and scoped to the caller's own membership only (cannot watch/unwatch on behalf of another member via this API).

Client-side validation: rules 1, 2, 4 (immediate feedback). Server-side: all rules.

## Error Messages

| Context | Message |
|---|---|
| Label name empty | Label name is required |
| Label name too long | Label name must be at most 30 characters |
| Label name duplicate | A label with this name already exists |
| Label color invalid | Color must be a valid hex code (e.g., #FF0000) |
| Label not found | Label not found |
| Label wrong project | Label must belong to the same project as the task |
| Comment content empty | Comment cannot be empty |
| Comment content too long | Comment must be at most 10,000 characters |
| Comment not found | Comment not found |
| Comment edit forbidden | You can only edit your own comments |
| Comment delete forbidden | You do not have permission to delete this comment |
| Permission denied (labels) | You do not have permission to manage labels |
| Permission denied (task access) | You do not have permission to view this task |
| Toast: label created | Label created |
| Toast: label updated | Label updated |
| Toast: label deleted | Label deleted |
| Toast: comment posted | Comment posted |
| Toast: comment updated | Comment updated |
| Toast: comment deleted | Comment deleted |
| Toast: now watching | You are now watching this task |
| Toast: unwatched | You stopped watching this task |
| Empty: comments | No comments yet. Be the first to comment. |
| Empty: watchers | No one is watching this task yet. |
| Empty: activity | No activity yet. |
| Delete label confirmation | Delete label "{name}"? It will be removed from {count} task(s). This cannot be undone. |
| Delete comment confirmation | Delete this comment? This action cannot be undone. |
| Generic error | Something went wrong. Please try again. |

## UI Description

### Board Settings Modal — Labels Section (extends spec 13)

Below the Columns section, a "Labels" heading with a vertical list of label rows: color dot, name, hex code (muted, small), edit button (✏, opens inline name + color-picker inputs), delete button (🗑). "+ Add Label" at the bottom opens an inline form (name input + color swatch picker with a hex fallback input). Color picker offers a small fixed palette (8–10 swatches) plus a free-text hex input for custom colors.

### Task Cards (Board / List) — Labels

Below the priority/assignee row, a wrapping row of small colored chips (label dot + name, truncated if too many — shows first 2–3 chips plus a "+N" overflow indicator). Chips are read-only on the card; label management happens on the task detail page.

### Task Detail — Labels (Side Panel)

A "Labels" field in the side panel shows current label chips, each with a small ✕ to remove (click sends `DELETE .../tasks/{taskId}/labels/{labelId}`). An "+ Add label" control opens a dropdown/popover listing all project labels (with color swatches) not yet assigned; selecting one calls `POST .../tasks/{taskId}/labels`.

### Task Detail — Comments Section

Positioned below the Children section (or below Description if no children) in the left column. Each comment: author avatar + name, relative/absolute timestamp, rendered markdown body (sanitized), "(edited)" tag when applicable, edit/delete icon buttons (visible only to the author, plus delete-only for admin/manager on others' comments). A markdown composer at the bottom with a "Comment" submit button (disabled when empty). Markdown preview toggle optional.

### Task Detail — Watchers Section

A compact row (side panel or below comments) showing a toggle button ("Watch" / "Watching", eye icon) plus a horizontal avatar stack of current watchers with a tooltip listing names on hover; a "+N more" indicator if the list overflows the visible avatar count (e.g., beyond 5).

### Task Detail — Activity Section

An **oldest-first** vertical timeline list at the bottom of the left column (or a dedicated tab/section), each row: small actor avatar, one-line human-readable description (e.g., "Alex K changed Priority: Medium → High"), and a muted timestamp. No pagination controls — the full list renders; the section scrolls internally if long (max-height with internal scroll, e.g. 400px).

**States table:**

| State | Behavior |
|---|---|
| Loading (comments/watchers/activity) | Skeleton rows (2–3 placeholders) per section |
| Empty comments | "No comments yet. Be the first to comment." |
| Empty watchers | "No one is watching this task yet." (toggle still available) |
| Empty activity | "No activity yet." (only possible transiently before task-creation entry is written, effectively unreachable in steady state) |
| Error on load | Toast "Something went wrong" + retry option per section |
| Comment submitting | Submit button shows loading state, disabled |

**Responsive:** Desktop/tablet: sections stack in the left column as in spec 13's task detail layout. Mobile: Comments, Watchers, and Activity become expandable accordion sections (or separate tabs) below the main task fields, matching spec 13's mobile task-detail pattern.

## Required `data-testid` Attributes

**Labels (Board Settings):**
`board-settings-labels-section`, `board-settings-label-{id}`, `board-settings-label-name-{id}`, `board-settings-label-color-{id}`, `board-settings-label-edit-{id}`, `board-settings-label-delete-{id}`
`board-settings-label-add`, `board-settings-label-name-input`, `board-settings-label-color-input`

**Labels (task cards):**
`task-card-label-{id}` (on board and list card instances)

**Labels (task detail):**
`task-labels-section`, `task-label-chip-{id}`, `task-label-remove-{id}`, `task-label-add-btn`, `task-label-picker`, `task-label-picker-option-{id}`

**Comments:**
`task-comments-section`, `task-comment-{id}`, `task-comment-author-{id}`, `task-comment-content-{id}`, `task-comment-edited-badge-{id}`
`task-comment-edit-btn-{id}`, `task-comment-delete-btn-{id}`
`task-comment-composer`, `task-comment-submit-btn`
`task-comment-edit-composer-{id}`, `task-comment-edit-save-{id}`, `task-comment-edit-cancel-{id}`
`task-comment-delete-confirm`, `task-comment-delete-cancel`

**Watchers:**
`task-watchers-section`, `task-watch-toggle-btn`, `task-watcher-avatar-{id}`, `task-watchers-count`

**Activity:**
`task-activity-section`, `task-activity-entry-{id}`

## Security

### Authentication & Authorization
- All endpoints require `SessionGuard` + `OrgScopeGuard`.
- Capability checks in service layer using shared `can(role, capability)` — `manage-labels` for label definitions; `view-board`/`manage-tasks` (spec 13) reused for label assignment, comments, watchers, and activity.
- `user` role additionally checked against `ProjectMember` for project-scoped access, identical to spec 13. Returns 403 if not a project member.
- `viewer` role returns 403 on all endpoints in this spec.
- Comment edit is author-only; comment delete is author-or-admin/manager. These checks run server-side regardless of what the client UI hides.

### Cross-Organization Protection (IDOR)
- All label, comment, watcher, and activity queries verify the parent task belongs to the project, which belongs to the org (from session).
- `labelId` on assignment is verified to belong to the same project as the task (not just the same org) — prevents cross-project label leakage within an org.
- Non-existent or cross-org resources return 404 (not 403) to prevent enumeration, consistent with spec 13.

### Input Handling
- Comment `content` is stored as raw markdown; rendered client-side with a sanitizing markdown renderer (XSS prevention) — identical approach to task descriptions in spec 13.
- Label `name` and `color` are validated server-side (length, hex format) regardless of client-side checks.
- Comment length is codepoint-counted, not byte-counted, to prevent multi-byte-character bypass of the 10,000-codepoint limit.

### Data Integrity
- `TaskLabelAssignment`, `TaskWatcher` use composite primary keys to guarantee no duplicate rows; assignment/watch endpoints are naturally idempotent at the DB level (upsert or ignore-on-conflict), not just in application logic.
- `TaskActivity` rows are append-only — no update or delete endpoint exists for activity entries. Deleting a comment does not delete its `comment_added` activity entry, preserving audit history; a `comment_deleted` entry is appended instead.
- Deleting a `TaskLabel` cascades `TaskLabelAssignment` deletion but does not delete the `label_added`/`label_removed` activity history referencing that label (activity rows store the label name as text context at write time is out of scope for full snapshotting — the current implementation resolves label references by ID for display, which may show "Unknown label" if the label was since deleted; this is an accepted v1 limitation, not a security issue).
- Removing a member from the organization (spec 04) cascades their `TaskWatcher` rows (watcher_id FK cascade) but does not delete their `TaskComment` rows or `TaskActivity` actor references — historical comments/activity remain attributed to the departed member's `Membership` record (which spec 04 retains in a removed state) for audit continuity.

### Rate Limiting
- Comment create/edit/delete: 30/min per session.
- Label mutations: 20/min per session.
- Watcher toggle: 30/min per session.
- Activity/comment/watcher reads: 120/min per session.

### Logging
- All label, comment, and watcher mutations logged (actor, action, entityId, timestamp) at application level, consistent with spec 13's task CRUD logging.

## Out of Scope

- Actual notification delivery to watchers (email, in-app, push) — this spec defines only the watch/unwatch data model and UI.
- @mentions in comments.
- Comment threading/replies.
- Comment reactions (emoji, likes).
- Comment attachments/file uploads.
- Rich-text (non-markdown) comment editor.
- Full field-level diffing/snapshotting for `description` changes in the activity log (only the fact of the change is recorded, not a content diff).
- Activity log pagination, filtering, or search.
- Activity log export.
- Label icons (beyond color).
- Bulk label assignment across multiple tasks.
- Global (cross-project) label libraries — labels remain project-scoped.
- Real-time collaboration (WebSocket live updates for comments/activity as other users act).
- Granular/muted watch preferences (e.g., "watch status changes only").
- Restoring deleted comments.

## Test Cases

### Unit Tests

**TC-14-UNIT-01: validateLabelName — valid values**
- Level: Unit
- Steps: Call with `"A"` (min), `"Bug"`, `"A".repeat(30)` (max), `"  Bug  "` (trim)
- Expected: All valid. Trimmed to "A", "Bug", 30 chars, "Bug"

**TC-14-UNIT-02: validateLabelName — empty and whitespace**
- Level: Unit
- Steps: Call with `""`, `" "`, `"   "`
- Expected: All return `{ valid: false, error: "Label name is required" }`

**TC-14-UNIT-03: validateLabelName — too long**
- Level: Unit
- Steps: Call with `"A".repeat(31)`, 31 Cyrillic codepoints
- Expected: Both return `{ valid: false, error: "Label name must be at most 30 characters" }`

**TC-14-UNIT-04: validateLabelColor — valid hex codes**
- Level: Unit
- Steps: Call with `"#FF0000"`, `"#00ff00"`, `"#123ABC"`
- Expected: All return `{ valid: true }`

**TC-14-UNIT-05: validateLabelColor — invalid values**
- Level: Unit
- Steps: Call with `"FF0000"` (no #), `"#FFF"` (3-char shorthand), `"#GGGGGG"`, `"red"`, `""`, `"#FF00000"` (too long)
- Expected: All return `{ valid: false, error: "Color must be a valid hex code (e.g., #FF0000)" }`

**TC-14-UNIT-06: validateCommentContent — valid values**
- Level: Unit
- Steps: Call with `"A"` (min), `"Looks good"`, `"A".repeat(10000)` (max), markdown `"**bold** and _italic_"`
- Expected: All valid with trimmed values

**TC-14-UNIT-07: validateCommentContent — empty and whitespace**
- Level: Unit
- Steps: Call with `""`, `" "`, `"   "`
- Expected: All return `{ valid: false, error: "Comment cannot be empty" }`

**TC-14-UNIT-08: validateCommentContent — too long**
- Level: Unit
- Steps: Call with `"A".repeat(10001)`, 10001 emoji codepoints
- Expected: Both return `{ valid: false, error: "Comment must be at most 10,000 characters" }`

**TC-14-UNIT-09: validateCommentContent — codepoint counting**
- Level: Unit
- Steps: Call with emoji string at exactly 10,000 codepoints, and at 10,001
- Expected: 10,000 → valid. 10,001 → too long.

**TC-14-UNIT-10: capabilities — manage-labels**
- Level: Unit
- Steps: Call `can(role, 'manage-labels')` for all 4 roles
- Expected: admin=true, manager=true, user=false, viewer=false

**TC-14-UNIT-11: formatActivityDescription — field_changed rows**
- Level: Unit
- Steps: Format `{ action: "field_changed", field: "priority", oldValue: "medium", newValue: "high" }`; format `{ field: "assigneeId", oldValue: null, newValue: "membership-uuid" }` with a resolved name lookup
- Expected: First → "changed Priority: Medium → High". Second → "changed Assignee: Unassigned → Alex K"

**TC-14-UNIT-12: formatActivityDescription — non-field actions**
- Level: Unit
- Steps: Format `created`, `comment_added`, `comment_deleted`, `label_added`, `label_removed`, `watcher_added`, `watcher_removed`
- Expected: Each maps to its fixed human-readable phrase (e.g., "created this task", "commented", "added label", etc.)

**TC-14-UNIT-13: isValidTaskActivityAction — valid and invalid**
- Level: Unit
- Steps: Call with each of the 8 valid enum values, then with `"deleted"`, `""`, `"Created"` (case)
- Expected: 8 valid values return `true`; invalid ones return `false`

### Integration Tests

**TC-14-INT-01: Create label — happy path**
- Level: Integration
- Preconditions: Project with board
- Steps: POST `.../labels` with `{ "name": "Bug", "color": "#E11D48" }`
- Expected: 201 with name "Bug", color "#E11D48"

**TC-14-INT-02: Create label — duplicate name (case-insensitive)**
- Level: Integration
- Preconditions: Label "Bug" exists
- Steps: POST `.../labels` with `{ "name": "bug", "color": "#000000" }`
- Expected: 409 `label_name_duplicate`

**TC-14-INT-03: Create label — invalid color**
- Level: Integration
- Steps: POST with `{ "name": "X", "color": "red" }`
- Expected: 400 `label_color_invalid`

**TC-14-INT-04: Create label — user role forbidden**
- Level: Integration
- Preconditions: User role, project member
- Steps: POST `.../labels`
- Expected: 403

**TC-14-INT-05: Create label — manager allowed**
- Level: Integration
- Preconditions: Manager role
- Steps: POST `.../labels`
- Expected: 201

**TC-14-INT-06: Update label — rename**
- Level: Integration
- Steps: PUT `.../labels/{id}` with `{ "name": "Critical Bug" }`
- Expected: 200, color unchanged

**TC-14-INT-07: Update label — change color only**
- Level: Integration
- Steps: PUT with `{ "color": "#000000" }`
- Expected: 200, name unchanged

**TC-14-INT-08: Update label — duplicate name**
- Level: Integration
- Steps: Rename label to an existing label's name
- Expected: 409 `label_name_duplicate`

**TC-14-INT-09: Update label — not found**
- Level: Integration
- Steps: PUT non-existent labelId
- Expected: 404 `label_not_found`

**TC-14-INT-10: Delete label — cascades assignments**
- Level: Integration
- Preconditions: Label assigned to 3 tasks
- Steps: DELETE `.../labels/{id}`. Then GET one of the 3 tasks.
- Expected: 200 with `unassignedFromTaskCount: 3`. Task no longer lists the label.

**TC-14-INT-11: Delete label — no assignments**
- Level: Integration
- Steps: DELETE unused label
- Expected: 200 `unassignedFromTaskCount: 0`

**TC-14-INT-12: Delete label — not found**
- Level: Integration
- Steps: DELETE non-existent labelId
- Expected: 404

**TC-14-INT-13: List labels — happy path**
- Level: Integration
- Preconditions: 3 labels created
- Steps: GET `.../labels`
- Expected: 200 with all 3 labels

**TC-14-INT-14: List labels — user role, project member**
- Level: Integration
- Steps: GET `.../labels` as user assigned to project
- Expected: 200

**TC-14-INT-15: List labels — user role, not project member**
- Level: Integration
- Steps: GET `.../labels` as user not assigned
- Expected: 403

**TC-14-INT-16: Assign label to task — happy path**
- Level: Integration
- Preconditions: Task and label exist in same project
- Steps: POST `.../tasks/{taskId}/labels` with `{ "labelId": "uuid" }`
- Expected: 201. GET task shows label in list.

**TC-14-INT-17: Assign label — idempotent (already assigned)**
- Level: Integration
- Preconditions: Label already assigned to task
- Steps: POST assign same label again
- Expected: 200/201, no duplicate row, no duplicate activity entry

**TC-14-INT-18: Assign label — wrong project**
- Level: Integration
- Steps: POST assign with labelId from a different project
- Expected: 400 `label_wrong_project`

**TC-14-INT-19: Assign label — label not found**
- Level: Integration
- Steps: POST assign with non-existent labelId
- Expected: 404 `label_not_found`

**TC-14-INT-20: Assign label — records activity**
- Level: Integration
- Steps: POST assign label. GET activity.
- Expected: Activity includes `label_added` entry with correct actor

**TC-14-INT-21: Remove label from task — happy path**
- Level: Integration
- Preconditions: Label assigned to task
- Steps: DELETE `.../tasks/{taskId}/labels/{labelId}`
- Expected: 200. GET task no longer shows label.

**TC-14-INT-22: Remove label — idempotent (not assigned)**
- Level: Integration
- Steps: DELETE a label that isn't assigned to the task
- Expected: 200, no error

**TC-14-INT-23: Remove label — records activity**
- Level: Integration
- Steps: Remove assigned label. GET activity.
- Expected: Activity includes `label_removed` entry

**TC-14-INT-24: Create comment — happy path**
- Level: Integration
- Steps: POST `.../tasks/{taskId}/comments` with `{ "content": "Looks good" }`
- Expected: 201 with author = caller membership, content trimmed

**TC-14-INT-25: Create comment — empty content**
- Level: Integration
- Steps: POST with `{ "content": "" }`
- Expected: 400 `content_required`

**TC-14-INT-26: Create comment — too long**
- Level: Integration
- Steps: POST with content of 10,001 chars
- Expected: 400 `content_too_long`

**TC-14-INT-27: Create comment — user role, not project member**
- Level: Integration
- Steps: POST comment as user not assigned to project
- Expected: 403

**TC-14-INT-28: Create comment — auto-watches author**
- Level: Integration
- Preconditions: Commenter not currently watching
- Steps: POST comment. GET watchers.
- Expected: Commenter now in watchers list

**TC-14-INT-29: Create comment — records activity**
- Level: Integration
- Steps: POST comment. GET activity.
- Expected: Activity includes `comment_added` entry

**TC-14-INT-30: Edit comment — author succeeds**
- Level: Integration
- Preconditions: Comment authored by caller
- Steps: PUT `.../comments/{id}` with `{ "content": "Updated" }`
- Expected: 200 with updated content, refreshed `updatedAt`

**TC-14-INT-31: Edit comment — non-author forbidden**
- Level: Integration
- Preconditions: Comment authored by another member
- Steps: PUT comment as different user
- Expected: 403 `forbidden`

**TC-14-INT-32: Edit comment — admin cannot edit another's (edit is author-only)**
- Level: Integration
- Preconditions: Comment authored by user U
- Steps: PUT comment as admin
- Expected: 403 `forbidden`

**TC-14-INT-33: Edit comment — not found**
- Level: Integration
- Steps: PUT non-existent commentId
- Expected: 404

**TC-14-INT-34: Delete comment — author succeeds**
- Level: Integration
- Steps: DELETE own comment
- Expected: 200. GET comments no longer includes it.

**TC-14-INT-35: Delete comment — admin can delete any**
- Level: Integration
- Preconditions: Comment authored by user U
- Steps: DELETE as admin
- Expected: 200

**TC-14-INT-36: Delete comment — manager can delete any**
- Level: Integration
- Steps: DELETE another member's comment as manager
- Expected: 200

**TC-14-INT-37: Delete comment — non-author, non-admin forbidden**
- Level: Integration
- Steps: DELETE another member's comment as regular user
- Expected: 403 `forbidden`

**TC-14-INT-38: Delete comment — records activity, preserves comment_added entry**
- Level: Integration
- Steps: Create comment, delete it. GET activity.
- Expected: Activity includes both `comment_added` and `comment_deleted` entries

**TC-14-INT-39: List comments — chronological order**
- Level: Integration
- Preconditions: 3 comments created in sequence
- Steps: GET `.../comments`
- Expected: 200, comments ordered oldest-first

**TC-14-INT-40: List comments — viewer forbidden**
- Level: Integration
- Steps: GET comments as viewer
- Expected: 403

**TC-14-INT-41: Watch task — happy path**
- Level: Integration
- Steps: POST `.../watchers`. GET `.../watchers`.
- Expected: 201 then caller appears in watchers list, `isWatching: true`

**TC-14-INT-42: Watch task — idempotent**
- Level: Integration
- Preconditions: Already watching
- Steps: POST `.../watchers` again
- Expected: 200/201, no duplicate row

**TC-14-INT-43: Unwatch task — happy path**
- Level: Integration
- Preconditions: Currently watching
- Steps: DELETE `.../watchers`. GET `.../watchers`.
- Expected: 200 then caller not in list, `isWatching: false`

**TC-14-INT-44: Unwatch task — idempotent (not watching)**
- Level: Integration
- Steps: DELETE `.../watchers` when not currently watching
- Expected: 200, no error

**TC-14-INT-45: Auto-watch on task creation — reporter**
- Level: Integration
- Steps: Create task as user U. GET `.../watchers`.
- Expected: U appears as a watcher

**TC-14-INT-46: Auto-watch on assignment**
- Level: Integration
- Preconditions: Task exists, Alex not currently watching
- Steps: PUT task with `{ "assigneeId": "alex-uuid" }`. GET `.../watchers`.
- Expected: Alex appears as a watcher

**TC-14-INT-47: Auto-watch does not duplicate on repeated triggers**
- Level: Integration
- Preconditions: Alex is assignee and already watching
- Steps: PUT task re-setting the same assigneeId. GET watchers.
- Expected: Alex appears exactly once

**TC-14-INT-48: Manual unwatch persists after auto-watch trigger already fired**
- Level: Integration
- Preconditions: Alex is assignee (auto-watched), then manually unwatches
- Steps: Alex DELETE `.../watchers`. PUT task with an unrelated field change (Alex remains assignee). GET watchers.
- Expected: Alex still not in watchers list (auto-watch does not re-trigger without a new assignment event)

**TC-14-INT-49: Watchers list — view access matches task view access**
- Level: Integration
- Steps: GET `.../watchers` as user not assigned to project
- Expected: 403

**TC-14-INT-50: Activity log — task creation entry**
- Level: Integration
- Steps: Create task. GET `.../activity`.
- Expected: First entry has `action: "created"`, actor = reporter

**TC-14-INT-51: Activity log — single field change**
- Level: Integration
- Steps: PUT task with `{ "priority": "high" }`. GET activity.
- Expected: Entry with `action: "field_changed"`, `field: "priority"`, correct oldValue/newValue

**TC-14-INT-52: Activity log — multiple field changes in one request**
- Level: Integration
- Steps: PUT task with `{ "priority": "high", "title": "New title" }`. GET activity.
- Expected: Two `field_changed` entries (one per field), same timestamp

**TC-14-INT-53: Activity log — column move via drag**
- Level: Integration
- Steps: PATCH `.../move` with new `columnId`. GET activity.
- Expected: `field_changed` entry with `field: "columnId"`

**TC-14-INT-54: Activity log — position-only move does not log**
- Level: Integration
- Preconditions: Task in a column with other tasks
- Steps: PATCH `.../move` with only `position` changed (same columnId). GET activity.
- Expected: No new `field_changed` entry created

**TC-14-INT-55: Activity log — ordering is oldest-first**
- Level: Integration
- Steps: Create task, then perform 3 sequential updates. GET activity.
- Expected: Entries returned in chronological (ascending) order

**TC-14-INT-56: Activity log — unpaginated, returns full history**
- Level: Integration
- Steps: Perform 30 changes to a task. GET activity.
- Expected: All 30+ entries returned in a single response

**TC-14-INT-57: Activity log — viewer forbidden**
- Level: Integration
- Steps: GET activity as viewer
- Expected: 403

**TC-14-INT-58: Cross-org label access (IDOR)**
- Level: Integration
- Steps: GET/PUT/DELETE a label belonging to a different org
- Expected: 404

**TC-14-INT-59: Cross-org comment access (IDOR)**
- Level: Integration
- Steps: PUT/DELETE a comment belonging to a task in a different org
- Expected: 404

### E2E Tests

**TC-14-E2E-01: Create label and assign to a task**
- Level: E2E
- Preconditions: Logged in as admin, board with a task
- Steps:
  1. Open Board Settings, go to Labels section
  2. Click "+ Add Label", enter "Bug", pick a red swatch, save
  3. Verify toast "Label created" and label appears in settings list
  4. Close settings, open the task detail page
  5. Click "+ Add label", select "Bug"
  6. Verify label chip appears on the task detail side panel
  7. Navigate to board, verify the "Bug" chip appears on the task's card
- Expected: Label created and visibly assigned across board, list, and detail
- Selectors: `board-settings-labels-section`, `board-settings-label-add`, `board-settings-label-name-input`, `task-label-add-btn`, `task-label-picker-option-*`, `task-label-chip-*`, `task-card-label-*`

**TC-14-E2E-02: Remove a label from a task**
- Level: E2E
- Preconditions: Task has label "Bug" assigned
- Steps:
  1. Open task detail
  2. Click ✕ on the "Bug" chip
  3. Verify chip disappears
  4. Navigate to board, verify card no longer shows "Bug"
- Expected: Label removed from task
- Selectors: `task-label-chip-*`, `task-label-remove-*`, `task-card-label-*`

**TC-14-E2E-03: Delete a label in use**
- Level: E2E
- Preconditions: Label "Bug" assigned to 2 tasks
- Steps:
  1. Open Board Settings, Labels section
  2. Click delete on "Bug"
  3. Verify confirmation dialog mentions 2 tasks
  4. Confirm
  5. Verify label removed from settings list
  6. Check both tasks — verify "Bug" chip no longer appears
- Expected: Label and its assignments removed
- Selectors: `board-settings-label-delete-*`, `task-label-chip-*`

**TC-14-E2E-04: Post a comment on a task**
- Level: E2E
- Preconditions: Task detail page open
- Steps:
  1. Scroll to Comments section
  2. Type "Repro steps confirmed" in composer
  3. Click "Comment"
  4. Verify comment appears with own name and timestamp
  5. Verify composer clears
- Expected: Comment posted and visible
- Selectors: `task-comments-section`, `task-comment-composer`, `task-comment-submit-btn`, `task-comment-*`

**TC-14-E2E-05: Edit own comment**
- Level: E2E
- Preconditions: User has posted a comment
- Steps:
  1. Click ✏ on own comment
  2. Change text, click "Save"
  3. Verify updated text and "(edited)" indicator
- Expected: Comment edited in place
- Selectors: `task-comment-edit-btn-*`, `task-comment-edit-composer-*`, `task-comment-edit-save-*`, `task-comment-edited-badge-*`

**TC-14-E2E-06: Delete own comment with confirmation**
- Level: E2E
- Steps:
  1. Click 🗑 on own comment
  2. Verify confirmation dialog
  3. Confirm
  4. Verify comment removed from list
- Expected: Comment deleted
- Selectors: `task-comment-delete-btn-*`, `task-comment-delete-confirm`

**TC-14-E2E-07: Non-author cannot edit/delete another's comment**
- Level: E2E
- Preconditions: Two users, one comment authored by user A
- Steps:
  1. Log in as user B (not admin/manager)
  2. Open the task with A's comment
  3. Verify no edit/delete buttons appear on A's comment
- Expected: Controls hidden for non-owned comment
- Selectors: `task-comment-edit-btn-*`, `task-comment-delete-btn-*`

**TC-14-E2E-08: Admin can delete (not edit) another member's comment**
- Level: E2E
- Preconditions: Comment authored by user U, logged in as admin
- Steps:
  1. Open task, locate U's comment
  2. Verify edit button is absent, delete button is present
  3. Click delete, confirm
  4. Verify comment removed
- Expected: Admin sees delete-only control on others' comments
- Selectors: `task-comment-delete-btn-*`

**TC-14-E2E-09: Manually watch and unwatch a task**
- Level: E2E
- Preconditions: Task detail page, not currently watching
- Steps:
  1. Verify toggle shows "Watch"
  2. Click toggle
  3. Verify toggle switches to "Watching" and own avatar appears in watchers row
  4. Click toggle again
  5. Verify reverts to "Watch" and avatar removed
- Expected: Watch state toggles correctly
- Selectors: `task-watch-toggle-btn`, `task-watcher-avatar-*`, `task-watchers-count`

**TC-14-E2E-10: Auto-watch on assignment is reflected in UI**
- Level: E2E
- Preconditions: Task detail page, "Alex" not currently a watcher
- Steps:
  1. Change assignee to "Alex" via side panel dropdown
  2. Verify Alex's avatar appears in the watchers row
- Expected: Assignment auto-adds a watcher visibly
- Selectors: `task-assignee-select`, `task-watcher-avatar-*`

**TC-14-E2E-11: Activity log reflects field changes**
- Level: E2E
- Preconditions: Task detail page
- Steps:
  1. Change priority from "Medium" to "High" via side panel
  2. Scroll to Activity section
  3. Verify a new entry: "changed Priority: Medium → High" with actor and timestamp
- Expected: Activity entry appears after field change
- Selectors: `task-activity-section`, `task-activity-entry-*`

**TC-14-E2E-12: Activity log reflects comment and label events**
- Level: E2E
- Preconditions: Task detail page
- Steps:
  1. Post a comment
  2. Assign a label
  3. Scroll to Activity section
  4. Verify entries for "commented" and "added label" appear in order
- Expected: Both events logged and visible
- Selectors: `task-activity-section`, `task-activity-entry-*`, `task-comment-composer`, `task-label-add-btn`

**TC-14-E2E-13: User role — cannot manage labels**
- Level: E2E
- Preconditions: User role, project member
- Steps:
  1. Open Board Settings
  2. Verify Labels section shows no "+ Add Label" button, or edit/delete controls are hidden/disabled
- Expected: Label management UI unavailable for user role
- Selectors: `board-settings-labels-section`, `board-settings-label-add`

**TC-14-E2E-14: User role — can still assign existing labels to tasks**
- Level: E2E
- Preconditions: User role, project member, label "Bug" already exists
- Steps:
  1. Open a task detail page
  2. Click "+ Add label", select "Bug"
  3. Verify chip appears
- Expected: Assignment allowed even though label creation is restricted
- Selectors: `task-label-add-btn`, `task-label-picker-option-*`, `task-label-chip-*`

**TC-14-E2E-15: Viewer role — no access to task collaboration features**
- Level: E2E
- Preconditions: Viewer role
- Steps:
  1. Attempt to navigate directly to a task detail URL
  2. Verify "You do not have permission" message (consistent with spec 13's board access denial)
- Expected: Viewer blocked from all task collaboration features
- Selectors: `task-detail`
