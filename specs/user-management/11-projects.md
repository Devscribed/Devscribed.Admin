---
id: "11"
title: Projects
routes: ["/org/{orgId}/projects"]
api: ["GET .../projects", "POST .../projects", "PUT .../projects/{id}", "PATCH .../projects/{id}/archive", "PATCH .../projects/{id}/restore", "GET .../projects/{id}/members", "POST .../projects/{id}/members", "DELETE .../projects/{id}/members/{membershipId}"]
entities: [Project, ProjectMember]
tags: [project, project-member, assignment, archive, restore, sidebar, projects-page]
depends-on: ["04"]
---

# 11 — Projects

## Summary

Organizations group work into **projects**. An `admin` or `manager` creates projects, assigns members to them, and archives projects that are no longer active. Members can only log time (spec 12) against projects they are assigned to. The Projects page lives in its own sidebar section and shows a list of projects with member counts and total logged hours. This spec covers the project entity, member assignment, and project management UI. Time tracking itself is covered in spec 12.

## Actors & Preconditions

- **Actors:** `admin` and `manager` manage projects and member assignments. `user` sees only their assigned active projects (via time entry selectors in spec 12). `viewer` has no access to project features.
- **Preconditions:** the caller must be an `active` member of the organization.

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| View Projects page (all projects) | ✅ | ✅ | ❌ | ❌ |
| List assigned active projects (for time entry) | ✅ | ✅ | ✅ | ❌ |
| Create project | ✅ | ✅ | ❌ | ❌ |
| Edit project name | ✅ | ✅ | ❌ | ❌ |
| Archive project | ✅ | ✅ | ❌ | ❌ |
| Restore archived project | ✅ | ✅ | ❌ | ❌ |
| Add members to project | ✅ | ✅ | ❌ | ❌ |
| Remove members from project | ✅ | ✅ | ❌ | ❌ |

> **Note:** `admin` and `manager` can log time on **any** active project regardless of assignment. Assignment restricts only the `user` role.

## Functional Requirements

### Projects

1. A project belongs to exactly one organization. It has a `name` and a `status` (`active` or `archived`).
2. `name` is required, 1–100 characters. Allowed characters: letters (any script), digits, spaces, hyphens, ampersands, periods, parentheses. Leading and trailing whitespace is trimmed.
3. Project names are **unique within an organization** (case-insensitive comparison). Creating or renaming to a duplicate returns an error.
4. A project is created with status `active`.
5. There is no hard delete. Archiving is the equivalent of soft-delete.

### Archiving & Restoring

6. An `active` project can be **archived**. An `archived` project can be **restored** to `active`.
7. Archiving a project does **not** delete existing time entries referencing it. Those entries remain visible with the project name shown.
8. An archived project does **not** appear in time entry project selectors. Members cannot log new time against it.
9. Archiving a project does **not** remove its member assignments. If restored, the same members are still assigned.
10. A running timer (spec 12) referencing an archived project is **not** affected — the timer continues, and stopping it creates an entry referencing the now-archived project. The user is shown a notice that the project has been archived.

### Member Assignment

11. An `admin` or `manager` assigns members to a project. Only `active` members of the organization can be assigned.
12. A member can be assigned to multiple projects. A project can have multiple members.
13. The same member cannot be assigned to the same project twice. Attempting to re-add returns a 409 Conflict.
14. Removing a member from a project does **not** delete their existing time entries on that project. Those entries remain.
15. When a member is removed from the organization (spec 04), their project assignments are cascade-deleted.
16. `admin` and `manager` are **not** required to be assigned to a project to log time on it. Assignment restricts only the `user` role's visibility in time entry selectors.

## Data Model

### Project

| Field | Type | Description |
|---|---|---|
| `Id` | Guid | Primary key |
| `OrganizationId` | Guid (FK) | References `Organization.Id`. Cascade delete. |
| `Name` | string(100) | Project name. Unique per org (case-insensitive). |
| `Status` | string | `active` or `archived`. Default: `active`. |
| `CreatedAt` | DateTime | Creation timestamp. |
| `UpdatedAt` | DateTime | Last modification timestamp. |
| `CreatedByAccountId` | Guid (FK) | Account that created the project. |

**Indexes:** `(OrganizationId)`, unique `(OrganizationId, Name)` with case-insensitive collation.

### ProjectMember

| Field | Type | Description |
|---|---|---|
| `Id` | Guid | Primary key |
| `ProjectId` | Guid (FK) | References `Project.Id`. Cascade delete. |
| `MembershipId` | Guid (FK) | References `Membership.Id`. Cascade delete. |
| `AssignedAt` | DateTime | When the member was assigned. |
| `AssignedByAccountId` | Guid (FK) | Account that assigned the member. |

**Indexes:** unique `(ProjectId, MembershipId)`.

### New Capabilities (extend `Capability` enum)

- `ManageProjects` — create, edit, archive/restore projects, manage members (admin, manager)
- `ListAssignedProjects` — see assigned active projects in time entry selectors (admin, manager, user)

## Screens

### Projects Page — admin/manager view

```
┌──────────────┬──────────────────────────────────────────────────┐
│ PEOPLE       │  Projects                                        │
│  Members     │                                                   │
│              │  [ Active ▾ ]                     [ + New project ]│
│ PROJECTS     │                                                   │
│  ▣ Projects  │  ┌────────────────────────────────────────────┐  │
│              │  │  Name            Members   Hours   Status  │  │
│ TIME         │  │  ─────────────────────────────────────────  │  │
│  Time        │  │  Project Alpha   ●●● 3    142.5h  Active  │  │
│  Tracking    │  │  Project Beta    ●● 2      87.0h  Active  │  │
│              │  │  Internal        ● 1       24.0h  Active  │  │
│              │  └────────────────────────────────────────────┘  │
│              │                                                   │
└──────────────┴──────────────────────────────────────────────────┘
```

### Projects Page — archived filter

```
┌────────────────────────────────────────────────────────────┐
│  [ Archived ▾ ]                                            │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Name            Members   Hours     Status          │  │
│  │  ─────────────────────────────────────────────────    │  │
│  │  Old Project     ●● 2      340.0h   Archived         │  │
│  │                              [ Restore ]             │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### Project Detail — member management

```
┌──────────────────── Project Alpha ───────────────────────┐
│                                                           │
│  ┌─ Members ──────────────────────── [ + Add member ] ─┐ │
│  │                                                      │ │
│  │  ●  Alex Kaminski (user)              [ Remove ]     │ │
│  │  ●  Jane Smith (manager)              [ Remove ]     │ │
│  │  ●  Bob Chen (user)                   [ Remove ]     │ │
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                           │
│  Status: Active                        [ Archive ]        │
│                                                           │
│  [ ← Back to projects ]                                  │
└───────────────────────────────────────────────────────────┘
```

### Create / Edit Project Modal

```
┌──────────────── New Project ──────────────────┐
│                                                │
│  Project name *                                │
│  [ e.g. Client Website Redesign     ]          │
│                                                │
│            [ Cancel ]  [ Create project ]      │
└────────────────────────────────────────────────┘
```

### Add Member Modal

```
┌──────────────── Add Members ─────────────────┐
│                                                │
│  Search members                                │
│  [ Search by name...                 ]         │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │  ☐  Alex Kaminski (user)                 │  │
│  │  ☑  Jane Smith (manager)                 │  │
│  │  ☐  Bob Chen (user)                      │  │
│  │  — Pat Owner (admin) — already added     │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│            [ Cancel ]  [ Add selected ]        │
└────────────────────────────────────────────────┘
```

## Flows

### Main Flow: Admin creates a project and assigns members

1. Admin navigates to the Projects page via the sidebar.
2. System shows the project list (or empty state if no projects exist).
3. Admin clicks "New project".
4. System opens the Create Project modal with an empty name field.
5. Admin enters a project name and clicks "Create project".
6. System sends `POST /api/organizations/{orgId}/projects`.
7. On success: modal closes, toast "Project created", project appears in the list. System navigates to the project detail page.
8. Admin clicks "Add member" on the project detail page.
9. System opens the Add Members modal showing all active org members, with already-assigned members greyed out.
10. Admin selects one or more members and clicks "Add selected".
11. System sends `POST /api/organizations/{orgId}/projects/{projectId}/members` with the selected membership IDs.
12. On success: modal closes, toast "Members added", member list refreshes.

### Alt Flow A: Duplicate project name (branches from step 6)

6a. System returns 409 with error "A project with this name already exists".
6b. Inline error shown under the name field. Modal stays open.

### Alt Flow B: Archive a project (from project detail)

1. Admin clicks "Archive" on a project detail page.
2. System shows confirmation: "Archive this project? Members will no longer be able to log time against it."
3. Admin confirms.
4. System sends `PATCH /api/organizations/{orgId}/projects/{projectId}/archive`.
5. On success: toast "Project archived", navigates back to project list.

### Alt Flow C: Restore an archived project

1. Admin switches the filter to "Archived" on the Projects page.
2. Admin clicks "Restore" on an archived project.
3. System sends `PATCH /api/organizations/{orgId}/projects/{projectId}/restore`.
4. On success: toast "Project restored", project moves to the active list.

### Alt Flow D: Remove a member from a project

1. Admin clicks "Remove" next to a member on the project detail page.
2. System sends `DELETE /api/organizations/{orgId}/projects/{projectId}/members/{membershipId}`.
3. On success: toast "Member removed from project", member disappears from the list.

### Alt Flow E: Network/server error (any mutation)

- System shows error toast "Something went wrong. Please try again."
- Modal/form retains values. Buttons re-enable.

## API Contracts

### GET /api/organizations/{orgId}/projects

**Authentication:** required. Caller must be `active` member of the organization.

**Authorization:**
- `admin`/`manager`: returns all projects (active and archived). Supports `?status=active` or `?status=archived` filter.
- `user`: returns only **active** projects the user is **assigned to**. Status filter ignored.
- `viewer`: returns `403`.

**Response `200`:**
```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "Project Alpha",
      "status": "active",
      "memberCount": 3,
      "memberPreview": [
        { "name": "Jane Smith", "initials": "JS" },
        { "name": "Alex Kaminski", "initials": "AK" }
      ],
      "totalHours": 142.5,
      "createdAt": "2026-08-01T10:00:00Z"
    }
  ]
}
```

`totalHours` is the sum of all `durationMinutes` across all time entries for the project, divided by 60, rounded to one decimal.

`memberPreview` carries **at most the first three** of the project's active members, in the same
order `GET .../projects/{id}/members` returns them — last name, then first. It is a sample, not
a length: `memberCount` remains the count of *all* active members, and a project with more
members than the preview holds is still described by the count beside it. `initials` is the
first letter of each name, upper-cased, computed server-side so that one rule serves every
screen that draws the mark. Added for the Members column of the projects list (see
[11-projects.design.md](11-projects.design.md) §Member cell), which draws people rather than a
quantity; additive, so a client that ignores the field is unaffected.

**Errors:**
- `401 Unauthorized`: not authenticated.
- `403 Forbidden`: `viewer` role.

### POST /api/organizations/{orgId}/projects

**Authentication:** required. Caller must be `admin` or `manager`.

**Request:**
```json
{
  "name": "Project Alpha"
}
```

**Response `201`:**
```json
{
  "id": "uuid",
  "name": "Project Alpha",
  "status": "active",
  "createdAt": "2026-08-26T10:00:00Z"
}
```

**Errors:**
- `400 Bad Request`: validation errors — `{ "errors": { "name": "Project name is required" } }`
- `403 Forbidden`: `user`/`viewer` role.
- `409 Conflict`: duplicate name — `{ "error": "duplicate_name", "message": "A project with this name already exists" }`

### PUT /api/organizations/{orgId}/projects/{projectId}

**Authentication:** required. Caller must be `admin` or `manager`.

**Request:**
```json
{
  "name": "New Project Name"
}
```

**Response `200`:**
```json
{
  "id": "uuid",
  "name": "New Project Name",
  "status": "active",
  "createdAt": "2026-08-01T10:00:00Z"
}
```

**Errors:**
- `400 Bad Request`: validation errors.
- `403 Forbidden`: `user`/`viewer` role.
- `404 Not Found`: project not found.
- `409 Conflict`: duplicate name.

### PATCH /api/organizations/{orgId}/projects/{projectId}/archive

**Authentication:** required. Caller must be `admin` or `manager`.

**No request body.**

**Response `200`:**
```json
{ "success": true }
```

**Errors:**
- `400 Bad Request`: already archived — `{ "error": "already_archived", "message": "Project is already archived" }`
- `403 Forbidden`: `user`/`viewer` role.
- `404 Not Found`: project not found.

### PATCH /api/organizations/{orgId}/projects/{projectId}/restore

**Authentication:** required. Caller must be `admin` or `manager`.

**No request body.**

**Response `200`:**
```json
{ "success": true }
```

**Errors:**
- `400 Bad Request`: already active — `{ "error": "already_active", "message": "Project is already active" }`
- `403 Forbidden`: `user`/`viewer` role.
- `404 Not Found`: project not found.

### GET /api/organizations/{orgId}/projects/{projectId}/members

**Authentication:** required. Caller must be `admin` or `manager`.

**Response `200`:**
```json
{
  "members": [
    {
      "membershipId": "uuid",
      "accountId": "uuid",
      "firstName": "Alex",
      "lastName": "Kaminski",
      "role": "user",
      "assignedAt": "2026-08-10T14:00:00Z"
    }
  ]
}
```

Sorted by `lastName`, `firstName` ascending.

**Errors:**
- `403 Forbidden`: `user`/`viewer` role.
- `404 Not Found`: project not found.

### POST /api/organizations/{orgId}/projects/{projectId}/members

**Authentication:** required. Caller must be `admin` or `manager`.

**Request:**
```json
{
  "membershipIds": ["uuid1", "uuid2"]
}
```

**Response `200`:**
```json
{
  "added": 2,
  "alreadyAssigned": 0
}
```

Members that are already assigned are silently skipped (counted in `alreadyAssigned`). This allows bulk-add without failing on partial overlap.

**Errors:**
- `400 Bad Request`: empty array — `{ "errors": { "membershipIds": "At least one member is required" } }`
- `400 Bad Request`: membership not found or not active — `{ "error": "invalid_member", "message": "One or more members not found or not active" }`
- `403 Forbidden`: `user`/`viewer` role.
- `404 Not Found`: project not found.

### DELETE /api/organizations/{orgId}/projects/{projectId}/members/{membershipId}

**Authentication:** required. Caller must be `admin` or `manager`.

**Response `200`:**
```json
{ "success": true }
```

**Errors:**
- `403 Forbidden`: `user`/`viewer` role.
- `404 Not Found`: project or membership not found, or member not assigned to the project.

## Validation Rules

1. **Project name**: required, 1–100 characters after trimming. Error: "Project name is required" (empty), "Project name must be at most 100 characters" (too long).
2. **Project name uniqueness**: case-insensitive within the organization. Error: "A project with this name already exists".
3. **Archive**: project must be `active`. Error: "Project is already archived".
4. **Restore**: project must be `archived`. Error: "Project is already active".
5. **Add members**: at least one membershipId required. All must be `active` members of the same org. Error: "At least one member is required", "One or more members not found or not active".

Client-side validation: name field validated on blur/submit.

Server-side validation: all rules enforced regardless of UI state.

## Error Messages

| Context | Message |
|---|---|
| Name — empty | "Project name is required" |
| Name — too long | "Project name must be at most 100 characters" |
| Name — duplicate | "A project with this name already exists" |
| Archive — already archived | "Project is already archived" |
| Restore — already active | "Project is already active" |
| Members — empty array | "At least one member is required" |
| Members — invalid | "One or more members not found or not active" |
| Forbidden | "You do not have permission to manage projects" |
| Not found | "Project not found" |
| Toast — created | "Project created" |
| Toast — updated | "Project updated" |
| Toast — archived | "Project archived" |
| Toast — restored | "Project restored" |
| Toast — members added | "Members added" |
| Toast — member removed | "Member removed from project" |
| Archive confirmation | "Archive this project? Members will no longer be able to log time against it." |
| Network/server error | "Something went wrong. Please try again." |
| Empty state — no projects | "No projects yet. Create your first project to start tracking time." |

## UI Description

### Projects Page Layout

- Route: `/org/{orgId}/projects`.
- Sidebar section: **PROJECTS**, row: **Projects**. Visible to `admin` and `manager` only.
- Page header: "Projects" with "New project" action button.
- Status filter dropdown (`projects-status-filter`): "Active" (default), "Archived", "All".
- Project table below the filter.

### Project Table

- Columns: Name, Members (avatar stack + count), Hours (total logged), Status (badge).
- Each row is clickable → navigates to `/org/{orgId}/projects/{projectId}`.
- Archived projects show a muted row with "Archived" badge and a "Restore" button inline.
- Active projects show "Active" badge.
- Sorted by name ascending.

### Project Detail Page

- Route: `/org/{orgId}/projects/{projectId}`.
- Page header: project name, with "Edit" (pencil icon) to rename.
- Members section: list of assigned members with name, role badge, and "Remove" button per member. "Add member" button at the top of the section.
- Status line: "Status: Active" with "Archive" button, or "Status: Archived" with "Restore" button.
- "Back to projects" link navigates to `/org/{orgId}/projects`.

### Create/Edit Project Modal (`projects-modal`)

- Single field: project name (`projects-name-input`).
- Create mode: title "New Project", button "Create project" (`projects-create-btn`).
- Edit mode: title "Edit Project", field pre-filled, button "Save changes" (`projects-save-btn`).
- Cancel button (`projects-cancel-btn`).
- Inline error beneath name field (`field-error-projectName`).

### Add Members Modal (`projects-add-members-modal`)

- Search input (`projects-member-search`) filters the list by name.
- Checkbox list of all `active` org members. Already-assigned members shown greyed out with "Already added" label, checkbox disabled.
- "Add selected" button (`projects-add-members-btn`) — disabled when no new members selected.
- Cancel button (`projects-add-members-cancel-btn`).

### States

| State | Behavior |
|---|---|
| **Loading** | Skeleton/shimmer matching the table layout. |
| **Empty (no projects)** | Empty state message with "New project" button. |
| **Default** | Project table with filter. |
| **Saving (modal)** | Save/Create button disabled with loading indicator. Fields read-only. |
| **Success** | Toast notification. Modal closes. Page refreshes. |
| **Error** | Error toast or inline error. Modal stays open. Buttons re-enable. |

### Responsive Behavior

Breakpoints follow the app shell (spec 00). The Projects page has three layouts:

**Desktop (≥ 1024px):**
- Full sidebar with section labels visible.
- Table shows all columns at their designed widths.
- Modals are centered, 480–520px wide.
- Detail page uses the full content area, member list at natural row height.

**Tablet (768–1023px):**
- Sidebar collapses to icon-only rail (68px wide), per app shell rule. Section labels hidden; nav items show tooltips on hover.
- Table keeps all columns but trims padding. Hours column right-aligned to save width.
- Detail page: member list stays as rows; add-member modal at 480px width.

**Mobile (< 768px):**
- This is a **responsive web app viewed in a mobile browser** — no native-app chrome, no iOS-style bottom sheets, no sticky bottom action bars (the mobile browser's own URL bar and gesture area sit there).
- Sidebar hidden by default; opens as an overlay drawer via a hamburger toggle in the topbar. The drawer slides in from the left, dims the content, and closes on scrim tap or the drawer's own close button. Standard web pattern.
- **Project table transforms into a card list**: each project is a card with name, status badge, member avatar stack (max 3 + count), hours, and a kebab menu (⋮) in the top-right for row actions (Edit / Archive). Cards are tap-targetable — tapping the card body opens the project detail.
- **Page-level primary action** (New project) sits **inline in the page header** next to the title as a compact button (36px height, `+ New`). No floating action button, no sticky bar. The page header scrolls with the content normally.
- **Project detail** stacks vertically: back link → title + status badge → statistics tiles → member list → an Archive button rendered inline at the bottom of the page as part of the content flow (not sticky).
- **Member rows** become vertically-stacked mini-cards: avatar + name + email on top, role chip + Remove button on the bottom. Both rows are 44 × 44 px minimum for touch.
- **Modals** render as standard centered web dialogs — the modal fills most of the width (with 12px page margins) and appears near the top of the viewport (56px from top) so keyboard opening does not push it off-screen. Scrim covers the rest of the page. Closes on scrim tap, Escape, or the Cancel button. No drag handle, no swipe-to-dismiss.
- **Filter dropdown** becomes a full-width selector on its own row above the list.
- **Touch targets** — every interactive element is at least 44 × 44 px hit area. Icon buttons pad from 32px to a 44px transparent hit box.

**Accessibility (all breakpoints):**
- All interactive elements are keyboard-reachable in a logical tab order.
- Modals trap focus and return focus to the trigger on close.
- Icon-only buttons carry an `aria-label`.
- Status badges use both color and text (color is never the sole signal).
- Contrast ratios pass WCAG 2.1 AA (Meridian tokens are pre-validated).

## Required `data-testid` Attributes

**Sidebar:**
- `nav-projects`

**Projects page:**
- `projects-page`, `projects-page-title`
- `projects-status-filter`
- `projects-table`, `projects-row-{id}`
- `projects-new-btn`
- `projects-empty-state`
- ~~`projects-loading-skeleton`~~ → `projects-loading`

  *Amended by the main merge, Phase 6:* renamed to **`projects-loading`**, and drawn by `Preloader` (§23, §69). The old id named a component that does not exist — the design system ships no `Skeleton`, and the one outline left in this product is the members list's, kept there deliberately and not copied. That is the ruling the first migration already made twice, at `specs/hiring/05-board.design.md` and `specs/hiring/04-candidate-card.design.md`: a test id naming an *announcement* survives the component drawing it, and one naming the component does not.


**Project detail:**
- `project-detail-page`, `project-detail-name`
- `project-edit-name-btn`
- `project-members-list`, `project-member-row-{membershipId}`
- `project-member-remove-{membershipId}`
- `project-add-member-btn`
- `project-archive-btn`, `project-restore-btn`
- `project-back-link`
- `project-status-badge`

**Create/Edit modal:**
- `projects-modal`
- `projects-name-input`
- `projects-create-btn`, `projects-save-btn`, `projects-cancel-btn`
- `field-error-projectName`

**Add Members modal:**
- `projects-add-members-modal`
- `projects-member-search`
- `projects-member-checkbox-{membershipId}`
- `projects-add-members-btn`, `projects-add-members-cancel-btn`

**Toasts:**
- `toast-project-created`, `toast-project-updated`
- `toast-project-archived`, `toast-project-restored`
- `toast-members-added`, `toast-member-removed`

## Security

Security is enforced end-to-end. The UI hides what a caller cannot do; the API is the actual boundary and enforces every rule independently.

### Authentication & Authorization

1. **Every endpoint requires an authenticated session.** `SessionGuard` runs first: it validates the JWT signature on the `ds_session` cookie and re-reads the account's `securityStamp` from the database on every request (see spec 02). A rotated stamp invalidates every outstanding session instantly.
2. **Every endpoint runs `OrgScopeGuard` after `SessionGuard`.** The `:orgId` path parameter is compared against `session.organizationId`. On mismatch the endpoint returns `404 Not Found` (not `403`) so a guessed org ID is indistinguishable from a nonexistent one — this deliberately prevents org enumeration.
3. **Capability check happens after guards.** `ManageProjects` is required for POST/PUT/PATCH/DELETE and for admin-facing GET queries. `ListAssignedProjects` is required for the user-scoped GET.
4. **The client role is never trusted.** The API resolves the caller's role from `Membership` in the database on every request. A JWT with a manipulated role claim (if any) is ignored.

### Cross-organization protection (IDOR)

5. Every reference to a `projectId`, `membershipId`, `projectMemberId`, or `accountId` in a URL or body is validated to belong to the caller's organization **inside the transaction**. A project ID from another org returns `404`, matching the "does not exist" response byte-for-byte.
6. Bulk member assignment (`POST .../projects/{id}/members` with `membershipIds`) validates every membership ID belongs to the same org and has `status: active`. A single invalid ID rejects the whole batch — no partial writes.
7. The user-role GET endpoint filters projects by `ProjectMember.membershipId = session.membershipId AND Project.status = 'active'`. There is no code path where a user can request another member's assigned projects.

### Input handling

8. Project `name` is trimmed then validated: 1–100 chars, allowed character class as specified. Server-side validation is authoritative — client-side is UX only.
9. Duplicate check uses a **case-insensitive unique index** on `(OrganizationId, Name)`. A race between two concurrent creates is resolved by the DB constraint, never by application code.
10. All text output on the web client (project names, member names) is rendered as **text nodes**, never as HTML. React auto-escapes; there is no `dangerouslySetInnerHTML` on any of these fields.
11. Query parameters (`?status=`) are validated against a fixed enum (`active`, `archived`, `all`). Unknown values fall back to the default and are logged, not echoed.

### CSRF & session

12. The `ds_session` cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production. `SameSite=Lax` blocks cross-origin form submissions and is our primary CSRF mitigation. All mutations use JSON body over `POST`/`PUT`/`PATCH`/`DELETE` — no `simple` cross-origin requests can trigger them.
13. Logout drops the browser cookie but does not rotate `securityStamp`. Session revocation across devices is only triggered by password change or reset (see spec 02).

### Concurrency & audit

14. `CreatedByAccountId` on `Project` and `AssignedByAccountId` on `ProjectMember` are set by the server from the session — never from the request body. These fields form an immutable audit trail.
15. Archive/restore state transitions are wrapped in a transaction with a status check — a project archived twice by two concurrent requests results in exactly one archive event.
16. Member removal from the organization (spec 04) cascades to `ProjectMember` via foreign key `ON DELETE CASCADE`. A removed member cannot appear in any project's roster.

### Rate limiting

17. Mutation endpoints (`POST/PUT/PATCH/DELETE`) are rate-limited per session: **20 requests / minute**. Exceeded → `429 Too Many Requests`. This blunts scripted bulk-creation abuse.
18. The list endpoint is rate-limited more permissively but still bounded: **120 requests / minute** per session.

### Logging

19. Every mutation logs: caller `accountId`, `organizationId`, action, target ID, result (success/error code). No project names, member names, or PII appear in the log line — only IDs and outcomes.
20. Failed authorization (403/404 on scope mismatch) is logged at `warn` with the caller's `accountId` for anomaly detection. Success entries are `info`.

## Out of Scope

- Client entity (a separate entity linking projects to billing clients).
- Budget or hour limits per project.
- Billable vs non-billable project distinction.
- Project deadlines or date ranges.
- Project-level reporting or analytics (beyond total hours shown in the list).
- Member roles within a project (everyone is equal within a project).
- Bulk archive/restore.
- Project search (use the status filter; search can come later if the list grows).
- `viewer` access to any project features.

## Test Cases

### TC-11-UNIT-01: Project name validation

- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate empty string → rejected.
  2. Validate 101-character string → rejected.
  3. Validate "  Project Alpha  " → accepted, trimmed to "Project Alpha".
  4. Validate "My Project (v2)" → accepted.
  5. Validate "Client & Partners" → accepted.
- **Expected Result:**
  1. Error: "Project name is required".
  2. Error: "Project name must be at most 100 characters".
  3. Accepted with trimmed value.
  4–5. Accepted.

### TC-11-INT-01: Create project — happy path

- **Level:** Integration
- **Preconditions:** org with admin A.
- **Steps:**
  1. As A, `POST /api/organizations/{orgId}/projects` with `{ "name": "Project Alpha" }`.
  2. As A, `GET /api/organizations/{orgId}/projects`.
- **Expected Result:**
  1. HTTP 201 with `{ id, name: "Project Alpha", status: "active" }`.
  2. Response includes "Project Alpha" with `memberCount: 0`, `totalHours: 0`.

### TC-11-INT-02: Create project — duplicate name rejected

- **Level:** Integration
- **Preconditions:** org with admin A, existing project "Project Alpha".
- **Steps:**
  1. As A, `POST .../projects` with `{ "name": "project alpha" }` (different case).
- **Expected Result:**
  1. HTTP 409 with `{ "error": "duplicate_name" }`.

### TC-11-INT-03: Create project — forbidden for user/viewer

- **Level:** Integration
- **Preconditions:** org with user U and viewer V.
- **Steps:**
  1. As U, `POST .../projects` with valid data.
  2. As V, `POST .../projects` with valid data.
- **Expected Result:**
  1–2. HTTP 403.

### TC-11-INT-04: Rename project — happy path

- **Level:** Integration
- **Preconditions:** org with admin A, project "Alpha".
- **Steps:**
  1. As A, `PUT .../projects/{id}` with `{ "name": "Beta" }`.
- **Expected Result:**
  1. HTTP 200 with `name: "Beta"`.

### TC-11-INT-05: Archive project — happy path

- **Level:** Integration
- **Preconditions:** org with admin A, active project P.
- **Steps:**
  1. As A, `PATCH .../projects/{P.id}/archive`.
  2. As A, `GET .../projects?status=archived`.
- **Expected Result:**
  1. HTTP 200 `{ success: true }`.
  2. Project P appears with `status: "archived"`.

### TC-11-INT-06: Archive already-archived project — 400

- **Level:** Integration
- **Preconditions:** org with admin A, archived project P.
- **Steps:**
  1. As A, `PATCH .../projects/{P.id}/archive`.
- **Expected Result:**
  1. HTTP 400 with `{ "error": "already_archived" }`.

### TC-11-INT-07: Restore archived project — happy path

- **Level:** Integration
- **Preconditions:** org with admin A, archived project P.
- **Steps:**
  1. As A, `PATCH .../projects/{P.id}/restore`.
- **Expected Result:**
  1. HTTP 200 `{ success: true }`. Project status is `active`.

### TC-11-INT-08: Add members to project — happy path

- **Level:** Integration
- **Preconditions:** org with admin A, active project P, active users U1 and U2.
- **Steps:**
  1. As A, `POST .../projects/{P.id}/members` with `{ "membershipIds": [U1.id, U2.id] }`.
  2. As A, `GET .../projects/{P.id}/members`.
- **Expected Result:**
  1. HTTP 200 `{ added: 2, alreadyAssigned: 0 }`.
  2. Returns U1 and U2 in the member list.

### TC-11-INT-09: Add already-assigned member — silently skipped

- **Level:** Integration
- **Preconditions:** project P with member U1 already assigned, U2 not assigned.
- **Steps:**
  1. As admin, `POST .../projects/{P.id}/members` with `{ "membershipIds": [U1.id, U2.id] }`.
- **Expected Result:**
  1. HTTP 200 `{ added: 1, alreadyAssigned: 1 }`.

### TC-11-INT-10: Remove member from project — happy path

- **Level:** Integration
- **Preconditions:** project P with member U1 assigned.
- **Steps:**
  1. As admin, `DELETE .../projects/{P.id}/members/{U1.id}`.
  2. `GET .../projects/{P.id}/members`.
- **Expected Result:**
  1. HTTP 200 `{ success: true }`.
  2. U1 no longer in the member list.

### TC-11-INT-11: List projects — user sees only assigned active projects

- **Level:** Integration
- **Preconditions:** org with user U. Active project P1 (U assigned), active project P2 (U not assigned), archived project P3 (U assigned).
- **Steps:**
  1. As U, `GET /api/organizations/{orgId}/projects`.
- **Expected Result:**
  1. HTTP 200. Response includes P1 only. P2 and P3 are excluded.

### TC-11-INT-12: List projects — viewer gets 403

- **Level:** Integration
- **Preconditions:** org with viewer V.
- **Steps:**
  1. As V, `GET /api/organizations/{orgId}/projects`.
- **Expected Result:**
  1. HTTP 403.

### TC-11-INT-13: Member removal cascades project assignments

- **Level:** Integration
- **Preconditions:** user U assigned to project P. U is then removed from org (spec 04).
- **Steps:**
  1. Remove U from the organization.
  2. As admin, `GET .../projects/{P.id}/members`.
- **Expected Result:**
  2. U no longer in the member list. No orphan ProjectMember row.

### TC-11-INT-14: Cross-org project access returns 404 (not 403)

- **Level:** Integration
- **Preconditions:** two orgs A and B. Admin in A. Project P exists in B.
- **Steps:**
  1. As admin of A, `GET /api/organizations/{A.id}/projects/{P.id}/members`.
  2. As admin of A, `PATCH /api/organizations/{A.id}/projects/{P.id}/archive`.
  3. As admin of A, `PATCH /api/organizations/{B.id}/projects/{P.id}/archive`.
- **Expected Result:**
  1–2. HTTP 404 (project does not exist in the caller's org).
  3. HTTP 404 (`OrgScopeGuard` rejects: `:orgId` mismatch with session's `organizationId`).
  All three responses are byte-for-byte identical — no signal that the resource exists elsewhere.

### TC-11-INT-15: Duplicate project name — race condition resolved by DB constraint

- **Level:** Integration
- **Preconditions:** org with admin A. No existing project named "Race".
- **Steps:**
  1. Fire two concurrent `POST .../projects` with `{ "name": "Race" }` from A.
- **Expected Result:**
  1. Exactly one 201; the other 409 duplicate_name. Never two 201s. The unique index on `(OrganizationId, LOWER(Name))` guarantees this at the DB level.

### TC-11-INT-16: Mutation rate limit — 21st request in a minute is throttled

- **Level:** Integration
- **Preconditions:** admin A. Clean rate-limit bucket.
- **Steps:**
  1. Fire 20 `POST .../projects` calls with unique names within 5 seconds.
  2. Fire a 21st call.
- **Expected Result:**
  1. 20 × HTTP 201.
  2. HTTP 429 with `Retry-After` header.

### TC-11-INT-17: XSS payload in project name — stored, not executed

- **Level:** Integration
- **Preconditions:** admin A.
- **Steps:**
  1. As A, `POST .../projects` with `{ "name": "<script>alert('x')</script>" }` — server accepts (100-char limit is the only constraint; the character class rule rejects `<` and `>`).
- **Expected Result:**
  1. HTTP 400 with validation error on `name` — the allowed-character class excludes `<` and `>`. Even if it did accept them, the web client would render as a text node, not HTML.

### TC-11-INT-18: `memberPreview` samples the roster and never replaces the count

- **Level:** Integration
- **Preconditions:** admin A, four active members — Chen, Kaminski, Novak, Smith.
- **Steps:**
  1. As A, create a project and assign all four.
  2. As A, `GET .../projects`.
- **Expected Result:**
  1. `memberCount` is `4` — every active member, not the length of the preview.
  2. `memberPreview` has **three** entries, in roster order: Chen, Kaminski, Novak.
  3. Each entry carries `name` (first + last) and `initials` (first letter of each, upper-cased).
  4. A project with no members returns `memberPreview: []` and `memberCount: 0`.
  5. A member removed from the organization (spec 04's soft delete) leaves the preview as well as the count.

### TC-11-E2E-01: Admin creates project, adds members, archives

- **Level:** E2E
- **Preconditions:** logged in as admin. Two active members exist.
- **Steps:**
  1. Navigate to Projects page. Verify empty state.
  2. Click "New project". Enter "Project Alpha". Click "Create project".
  3. Verify toast "Project created". Verify project detail page opens.
  4. Click "Add member". Select two members. Click "Add selected".
  5. Verify toast "Members added". Verify two members listed.
  6. Click "Archive". Confirm in dialog.
  7. Verify toast "Project archived". Verify navigated back to projects list.
  8. Switch filter to "Archived". Verify "Project Alpha" appears.
  9. Click "Restore". Verify toast "Project restored". Verify project back in active list.
- **Selectors:** `nav-projects`, `projects-empty-state`, `projects-new-btn`, `projects-modal`, `projects-name-input`, `projects-create-btn`, `toast-project-created`, `project-detail-name`, `project-add-member-btn`, `projects-add-members-modal`, `projects-add-members-btn`, `toast-members-added`, `project-members-list`, `project-archive-btn`, `toast-project-archived`, `projects-status-filter`, `project-restore-btn`, `toast-project-restored`.

### TC-11-E2E-02: Duplicate project name shows error

- **Level:** E2E
- **Preconditions:** logged in as admin. Project "Alpha" exists.
- **Steps:**
  1. Click "New project". Enter "alpha" (lowercase). Click "Create project".
  2. Verify inline error "A project with this name already exists".
  3. Change name to "Beta". Click "Create project".
  4. Verify toast "Project created". Verify modal closes.
- **Selectors:** `projects-new-btn`, `projects-modal`, `projects-name-input`, `projects-create-btn`, `field-error-projectName`, `toast-project-created`.

### TC-11-E2E-03: User cannot see Projects page

- **Level:** E2E
- **Preconditions:** logged in as user.
- **Steps:**
  1. Observe sidebar. Verify "Projects" row is not present.
  2. Navigate directly to `/org/{orgId}/projects`.
- **Expected Result:**
  1. No "Projects" nav item in sidebar.
  2. Redirected or shown 404/forbidden page.
- **Selectors:** `app-sidebar`.
