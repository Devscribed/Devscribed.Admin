---
id: "01"
title: Clients
routes: ["/org/{orgId}/clients", "/org/{orgId}/clients/{clientId}"]
api:
  - "GET    /api/organizations/{orgId}/clients"
  - "POST   /api/organizations/{orgId}/clients"
  - "GET    /api/organizations/{orgId}/clients/{clientId}"
  - "PATCH  /api/organizations/{orgId}/clients/{clientId}"
  - "PATCH  /api/organizations/{orgId}/clients/{clientId}/archive"
  - "PATCH  /api/organizations/{orgId}/clients/{clientId}/restore"
entities: [Client, Project]
tags: [client, project-client-link, crud, archive, restore, sidebar]
depends-on: ["04", "11"]
---

# 01 — Clients

## Summary

Organizations group projects under **clients** — the third-party companies or internal cost centres the work is billed against. An `admin` or `manager` creates clients, assigns them to projects, and archives clients that are no longer active. Archiving a client is soft: existing projects keep their `clientId` and historical time entries still resolve the client name; new projects cannot select an archived client. The Clients page lives under the Projects sidebar group. This spec introduces the `Client` entity, the `Project.clientId?` link, the CRUD API, and the two admin surfaces (list page and per-client detail). It is the first prerequisite for the Reports feature (`specs/reports/`), which uses `Client` as a filter and as a Time & Activity grouping dimension.

## Actors & Preconditions

- **Actors:** `admin` and `manager` create, edit, archive, and restore clients. `user` sees the client column on their assigned projects (read-only). `viewer` has no access.
- **Preconditions:** the caller must be an `active` member of the organization; every request runs under `SessionGuard` + `OrgScopeGuard` (cross-org access returns 404, never 403).

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| View Clients page (list all clients) | ✅ | ✅ | ❌ | ❌ |
| See client name on an assigned project | ✅ | ✅ | ✅ | ❌ |
| Create client | ✅ | ✅ | ❌ | ❌ |
| Rename client | ✅ | ✅ | ❌ | ❌ |
| Archive client | ✅ | ✅ | ❌ | ❌ |
| Restore archived client | ✅ | ✅ | ❌ | ❌ |
| Assign a client to a project | ✅ | ✅ | ❌ | ❌ |
| Remove a client from a project | ✅ | ✅ | ❌ | ❌ |

## Functional Requirements

### Client entity

1. A client belongs to exactly one organization. It has a `name` and a `status` (`active` or `archived`).
2. `name` is required, 1–120 characters after trimming. Allowed characters: any Unicode letter, digit, space, and the punctuation `- & . , ' ( ) /`. Leading and trailing whitespace is trimmed on save. Two or more consecutive whitespace characters collapse to a single space on save.
3. Client names are **unique within an organization** (case-insensitive comparison over the trimmed value). Creating or renaming to a duplicate returns `409 Conflict` with `{ error: "client_name_taken", message: "A client with this name already exists." }`.
4. A client is created with status `active`.
5. There is no hard delete. Archiving is the equivalent of soft-delete.

### Archiving & Restoring

6. An `active` client can be **archived**. An `archived` client can be **restored** to `active`.
7. Archiving a client does **not** delete existing time entries, projects, or reports referencing it. Project.clientId stays set so historical data still resolves the client name. Reports still surface archived clients when they own historical rows.
8. An archived client does **not** appear in project create/edit selectors. Members cannot select it when creating a new project.
9. The archive action requires a confirmation modal (see §Screens). The confirmation message states how many active projects currently reference the client, so an admin knows the blast radius.
10. Renaming a client updates the display everywhere immediately (list, project detail, member views); historical reports already generated are frozen and are not retroactively rewritten. Reports generated after the rename use the new name.

### Project ↔ Client link

11. A project has a nullable `clientId`. A project may have zero or one client. A client may be linked to zero or more projects.
12. When a project is created or edited (spec 11), the payload may include `clientId` referencing an **active** client in the same organization. Referencing an archived client on write returns `422 Unprocessable Entity` with `{ error: "client_archived", message: "This client is archived and cannot be assigned to new projects." }`.
13. When a client is soft-archived, existing `Project.clientId` values are **not** cleared — the FK is preserved. The `ON DELETE SET NULL` cascade only applies to a hard delete, which never happens through the API.
14. When a project is renamed, archived, or restored (spec 11), the `Client` is unaffected.
15. A future FX-rate change on `Organization.currencyCode` (spec 02) does not require re-linking projects — the client is currency-agnostic in v1.

### List & search

16. `GET /api/organizations/{orgId}/clients` returns clients ordered by name ascending (case-insensitive). Query params: `status` (`active` | `archived` | `all`, default `active`), `q` (case-insensitive substring match against name, optional, 0–120 chars).
17. Each list row includes `projectCount` (count of projects with `clientId = this.id`, regardless of project status) and `activeProjectCount` (count of projects with `status = 'active'`).
18. The list is not paginated in v1. An organization with >1000 clients is out of scope; the UI still renders the full list.

### Detail

19. `GET /api/organizations/{orgId}/clients/{clientId}` returns the client plus a list of its projects (id, name, status). Members of individual projects are **not** included; the projects list is a navigation aid only.
20. A `user` calling the detail endpoint receives `404 Not Found`, matching the OrgScopeGuard pattern.

## Data Model

### Client

| Field | Type | Description |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `organizationId` | String (FK) | References `Organization.id`. Cascade delete. |
| `name` | String(120) | Trimmed, whitespace-collapsed. Unique per org (case-insensitive). |
| `status` | String | `active` or `archived`. Default: `active`. |
| `createdAt` | DateTime | Creation timestamp (UTC). |
| `updatedAt` | DateTime | Last modification timestamp (UTC). |
| `createdByAccountId` | String (FK) | Account that created the client. |
| `archivedAt` | DateTime? | Set when status transitions to `archived`, cleared on restore. |
| `archivedByAccountId` | String? (FK) | Account that archived the client. |

**Indexes:** `(organizationId, status)`, unique `(organizationId, LOWER(name))` (Postgres `CITEXT`-equivalent via functional unique index).

### Project (extension)

| Field | Type | Description |
|---|---|---|
| `clientId` | String? (FK) | Nullable. References `Client.id`. `ON DELETE SET NULL`. |

**Indexes:** `(clientId)` (partial index `WHERE clientId IS NOT NULL`).

### New Capabilities (extend the `Capability` union in `packages/validation/src/roles.ts` and the lowercase-dashed `MemberCapability` in `packages/validation/src/index.ts`)

- `ManageClients` / `manage-clients` — create, edit, archive/restore clients (admin, manager)
- `ViewClients` / `view-clients` — see the Clients page and use client filters in reports (admin, manager)

## API Contracts

### `GET /api/organizations/{orgId}/clients`

**Query:** `status?` (`active` | `archived` | `all`, default `active`), `q?` (string, 0–120 chars).

**200 Response:**
```json
{
  "clients": [
    {
      "id": "clw12ab34",
      "name": "Acme Corp",
      "status": "active",
      "projectCount": 4,
      "activeProjectCount": 3,
      "createdAt": "2026-01-15T10:22:00Z",
      "updatedAt": "2026-03-11T09:14:00Z"
    }
  ]
}
```

**403 / 404:** Standard capability + org-scope guard errors.

### `POST /api/organizations/{orgId}/clients`

**Body:**
```json
{ "name": "Acme Corp" }
```

**201 Response:** `{ "client": { ...Client } }`
**422 Response:** `{ "error": "validation_error", "fields": { "name": "Client name is required." } }`
**409 Response:** `{ "error": "client_name_taken", "message": "A client with this name already exists." }`

### `GET /api/organizations/{orgId}/clients/{clientId}`

**200 Response:**
```json
{
  "client": { ...Client },
  "projects": [
    { "id": "prj123", "name": "Website Redesign", "status": "active" },
    { "id": "prj124", "name": "Mobile App v2", "status": "archived" }
  ]
}
```

**404:** Client not in caller's org, or does not exist.

### `PATCH /api/organizations/{orgId}/clients/{clientId}`

**Body:** `{ "name": "Acme Corporation" }`
**200:** Updated client. **409/422:** Same shape as POST.

### `PATCH /api/organizations/{orgId}/clients/{clientId}/archive`

**200:** `{ "client": { ...Client } }` with `status: "archived"`, `archivedAt`, `archivedByAccountId` set. Idempotent — archiving an already-archived client returns 200 with the current state.

### `PATCH /api/organizations/{orgId}/clients/{clientId}/restore`

**200:** `{ "client": { ...Client } }` with `status: "active"`, `archivedAt` cleared. Idempotent.

### Extension to `POST/PATCH /api/organizations/{orgId}/projects` (spec 11)

Body accepts an optional `clientId: string | null`. `null` clears the link; a valid **active** client id sets it; a non-existent id returns 422 `{ error: "client_not_found" }`; an archived id returns 422 `{ error: "client_archived" }`.

## Validation Rules

1. `name` required — "Client name is required." (empty after trim).
2. `name` too long — "Client name cannot exceed 120 characters." (>120 chars after trim & collapse).
3. `name` disallowed characters — "Client name contains disallowed characters. Use letters, digits, and `- & . , ' ( ) /`." (regex match fails).
4. `name` duplicate — "A client with this name already exists." (409, server-authoritative; the UI never disables submit for this).
5. `clientId` (on project create/edit) references non-existent — "This client does not exist." (422).
6. `clientId` (on project create/edit) references archived — "This client is archived and cannot be assigned to new projects." (422).

All rules run **server-side** on every request. Client-side copies in `packages/validation` are convenience mirrors, never gates.

## Error Messages

| Context | Message |
|---|---|
| Toast — client created | "Client created." |
| Toast — client renamed | "Client updated." |
| Toast — client archived | "Client archived." |
| Toast — client restored | "Client restored." |
| Toast — server error | "Something went wrong. Please try again." |
| Confirm — archive client with active projects | "Archive **{name}**? {n} active project(s) will keep this client on their records, but you won't be able to select this client on new projects until it is restored." |
| Confirm — archive client with no active projects | "Archive **{name}**?" |
| Confirm buttons | "Cancel" (secondary) / "Archive client" (primary, danger tone) |
| Empty state — no clients yet | "No clients yet. Add your first client to group projects by who you're doing the work for." |
| Empty state — no results for search | "No clients match \"{q}\". Try a shorter query." |
| Empty state — archived tab, none archived | "No archived clients." |

## Screens

### Clients list — populated

```
┌──────────────┬────────────────────────────────────────────────┐
│ PEOPLE       │  Clients                       [ + New client ] │
│  Members     │  Group projects by who you're billing.          │
│              │                                                 │
│ PROJECTS     │  [ Active ▾ ]        [ 🔍 Search clients... ]    │
│  Projects    │                                                 │
│  ▣ Clients   │  ┌────────────────────────────────────────────┐ │
│              │  │  Name          Projects  Status   Actions  │ │
│ TIME         │  │  ─────────────────────────────────────────  │ │
│  Time        │  │  Acme Corp        4      ●Active   ✎        │ │
│  Tracking    │  │  Beta Analytics   2      ●Active   ✎        │ │
│              │  │  Chronos Ltd      1      ●Active   ✎        │ │
│              │  │  Internal (IT)    3      ●Active   ✎        │ │
│              │  └────────────────────────────────────────────┘ │
└──────────────┴────────────────────────────────────────────────┘
```

### Clients list — empty state

```
┌──────────────────────────────────────────────────────────────┐
│  Clients                                    [ + New client ]  │
│                                                                │
│                        🏢                                      │
│              No clients yet.                                   │
│    Add your first client to group projects by who              │
│                you're doing the work for.                      │
│                                                                │
│                    [ + Add your first client ]                 │
└────────────────────────────────────────────────────────────────┘
```

### Clients list — archived filter

```
[ Archived ▾ ]        [ 🔍 Search clients... ]

┌──────────────────────────────────────────────────────────────┐
│  Name             Projects  Status      Actions               │
│  ─────────────────────────────────────────────────────────    │
│  Old Client Co       6      ●Archived   [ Restore ]           │
│  Legacy Vendor       2      ●Archived   [ Restore ]           │
└──────────────────────────────────────────────────────────────┘
```

### Client detail

```
┌────────── ← Back to clients ─────────────────────────────────┐
│                                                                │
│  Acme Corp                                                     │
│  Created 15 Jan 2026 · Last updated 11 Mar 2026                │
│                                                                │
│  [ ✎ Rename ]  [ Archive ]                                     │
│                                                                │
│  ┌─ Projects (4) ─────────────────────────────────────────┐   │
│  │  Website Redesign     Active   142.5 h                  │   │
│  │  Mobile App v2        Archived  87.0 h                  │   │
│  │  Marketing Site       Active    24.0 h                  │   │
│  │  Internal Dashboard   Active    12.5 h                  │   │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Create client modal

```
┌──────────────── New Client ─────────────────┐
│                                              │
│  Client name *                               │
│  [ e.g. Acme Corp                    ]       │
│                                              │
│           [ Cancel ]  [ Create client ]      │
└──────────────────────────────────────────────┘
```

### Rename client modal — duplicate error

```
┌──────────────── Rename Client ──────────────┐
│                                              │
│  Client name *                               │
│  [ Acme Corp                    ]  ⚠         │
│  A client with this name already exists.     │
│                                              │
│           [ Cancel ]  [ Save ]               │
└──────────────────────────────────────────────┘
```

### Archive confirmation

```
┌────────────── Archive client? ──────────────┐
│                                              │
│  Archive Acme Corp?                          │
│                                              │
│  4 active project(s) will keep this client   │
│  on their records, but you won't be able to  │
│  select this client on new projects until    │
│  it is restored.                             │
│                                              │
│         [ Cancel ]  [ Archive client ]       │
└──────────────────────────────────────────────┘
```

### Project create / edit — client picker (spec 11 extension)

```
┌──────────────── New Project ─────────────────┐
│                                               │
│  Project name *                               │
│  [ Website Redesign                ]          │
│                                               │
│  Client (optional)                            │
│  [ Acme Corp                      ▾ ]         │
│    ─────────────────                          │
│    Acme Corp                                  │
│    Beta Analytics                             │
│    Chronos Ltd                                │
│    Internal (IT)                              │
│                                               │
│           [ Cancel ]  [ Create project ]      │
└───────────────────────────────────────────────┘
```

## Flows

### Main Flow: Admin creates a client and links it to a project

1. Admin clicks **Clients** in the Projects sidebar group.
2. System shows the list (or empty state).
3. Admin clicks **+ New client** in the page header.
4. System opens the Create Client modal.
5. Admin types a name and clicks **Create client**.
6. System sends `POST /api/organizations/{orgId}/clients`.
7. On success: modal closes, toast **"Client created."**, list refreshes with the new row.
8. Admin navigates to **Projects**, opens a project, clicks **Edit**.
9. Client picker now offers the new client (and every other active client, alphabetical). Admin picks one and saves.
10. System sends `PATCH /api/organizations/{orgId}/projects/{projectId}` with `clientId` set.
11. On success: modal closes, toast **"Project updated."**, project detail shows the client under the project name.

### Alt Flow A: Duplicate client name (branches from step 6)

6a. Server returns 409 `client_name_taken`. Modal stays open; the name field shows an inline error **"A client with this name already exists."** The submit button is **not** disabled — clicking it again reruns the request unchanged so the user can see the error persists.

### Alt Flow B: Rename to duplicate (branches from step 5 in Rename Flow)

- Same 409 handling as Alt A, in the Rename modal.

### Alt Flow C: Archive a client with active projects (branches from a click on **Archive** in Client detail)

1. Admin clicks **Archive** on the Client detail page.
2. System opens Archive confirmation with the message **"Archive {name}? {n} active project(s) will keep this client on their records, but you won't be able to select this client on new projects until it is restored."**
3. Admin clicks **Archive client**.
4. System sends `PATCH /api/organizations/{orgId}/clients/{id}/archive`.
5. On success: modal closes, toast **"Client archived."**, redirect back to the Clients list. The **Active** filter now hides the client; the **Archived** filter shows it with a **Restore** button.

### Alt Flow D: Try to select archived client on new project (branches from step 9)

- The archived client is **not** in the picker options. If the caller crafts a request with the archived `clientId` directly, server returns 422 `client_archived` and the project modal shows an inline error on the client field: **"This client is archived and cannot be assigned to new projects."**

### Alt Flow E: `user` role opens a Clients URL

- Sidebar does not show the Clients row for `user`. If they navigate directly to `/org/{orgId}/clients`, the API returns 404 for both the list and the detail endpoint. The web app redirects to `/org/{orgId}/members` on a 404.

## UI Description

### Route

`/org/{orgId}/clients` — list. `/org/{orgId}/clients/{clientId}` — detail.

### Layout

The page renders inside the existing app shell (sidebar + top bar). The Clients page adopts the same DS `Table` component (`1_DS for dev/components/data/Table.jsx`) as the Projects page (spec 11), with three data columns: Name, Projects (count), Status; plus an Actions column with an inline **✎ Rename** icon button. The list is preceded by a toolbar with a `Select` for status and a `SearchField` for the `q` param. `SearchField` fires the request on `debounce(250ms)`; the URL query string mirrors the current status and `q` so the state survives a reload.

The Client detail page renders a Card with the name, created/updated timestamps, primary actions (**Rename**, **Archive** / **Restore**), and a nested projects list. Each project row navigates to the project detail page (spec 11). A **Back to clients** link sits above the header.

### Sidebar integration

A new nav row under the existing **PROJECTS** section, positioned after **Projects**. Icon: a briefcase glyph added to `apps/web/src/layout/icons.tsx`. Role-gated on `ManageClients` — the row is omitted (not disabled) when the role lacks it. The row is `active` when the current path equals `/org/{orgId}/clients` or is nested beneath it.

### States

| State | Trigger | Rendered |
|---|---|---|
| Loading | Initial fetch or filter change | Table skeleton with 4 shimmering rows |
| Empty (no clients) | `status=active` returns 0 clients and no `q` | Centered empty state with primary CTA that opens the Create modal |
| Empty (no search results) | `q` matches nothing | Compact inline empty state with **"No clients match \"{q}\"."** |
| Populated | Any non-empty result | Table as sketched |
| Error | 5xx or network | Inline banner **"Couldn't load clients. Retry?"** with a **Retry** button |
| Archived tab, empty | `status=archived` returns 0 clients | Compact inline empty state **"No archived clients."** |

### Responsive Behavior

**Desktop (>1024px):** as above.
**Tablet (768–1024px):** Table Actions column moves into a `⋯` overflow menu; other columns remain. Toolbar collapses to two rows (status filter above search).
**Mobile (<768px):** Table converts to a card list — each client renders as a Card with name, project count, status badge, and a `⋯` menu. Modals expand to the full width with a 16px inset. The client picker in the project modal becomes a bottom-sheet select.

### Accessibility

- Every button carries an `aria-label` matching its visible text.
- Modal traps focus; `Esc` closes; the underlying page is `aria-hidden` while the modal is open.
- Status badge exposes its state via visible text plus a colour dot (colour never carries meaning alone).
- The search field is `type="search"` and announces the result count to a `role="status"` live region ("**{n} clients**") on change.

## Required `data-testid` Attributes

### Sidebar

- `nav-clients`

### Clients page

- `clients-page`, `clients-page-title`
- `clients-status-filter`
- `clients-search`
- `clients-new-btn`
- `clients-table`
- `clients-row-{id}`, `clients-row-{id}-rename-btn`, `clients-row-{id}-archive-btn`, `clients-row-{id}-restore-btn`
- `clients-empty-state`, `clients-empty-primary-cta`
- `clients-loading-skeleton`
- `clients-error-banner`, `clients-error-retry-btn`

### Client detail page

- `client-detail-page`, `client-detail-title`
- `client-detail-rename-btn`, `client-detail-archive-btn`, `client-detail-restore-btn`
- `client-detail-projects-list`, `client-detail-project-{id}`
- `client-detail-back-link`

### Create / Rename modal

- `client-modal`, `client-modal-title`
- `client-name-input`
- `client-save-btn`, `client-cancel-btn`
- `field-error-name`

### Archive confirmation

- `client-archive-confirm`, `client-archive-confirm-title`, `client-archive-confirm-message`
- `client-archive-confirm-btn`, `client-archive-cancel-btn`

### Toasts

- `toast-client-created`
- `toast-client-updated`
- `toast-client-archived`
- `toast-client-restored`
- `toast-server-error`

## Security

### Authentication & Authorization

- All endpoints require an authenticated session cookie; unauthenticated requests get 401.
- `RequireCapability('manage-clients')` on all mutating endpoints and the list/detail GETs.
- `OrgScopeGuard` compares path `orgId` with `session.organizationId`; mismatch returns **404** (never 403 — parity with the org-scope discipline documented in `CLAUDE.md`).

### Cross-organization protection (IDOR)

- Every server query filters by `session.organizationId`, never the path `orgId`. A caller crafting `/api/organizations/{otherOrgId}/clients/{clientId}` where the client exists in `otherOrgId` receives 404, not 200.
- `Project.clientId` writes verify the client's `organizationId` equals `session.organizationId` before persisting; a cross-org id returns 422 `client_not_found`.

### Input handling

- `name` is validated by the shared rules table (§Validation Rules) both client- and server-side. The server is authoritative.
- No HTML injection surface — the name is only ever rendered as text (React auto-escapes).
- Search query `q` is used only in a Prisma `contains` with `mode: 'insensitive'`. No SQL string interpolation.

### CSRF & session

- Same-origin fetch with `credentials: 'same-origin'`; no CSRF token needed (inherited from the app-wide pattern).
- Session revocation via `Account.securityStamp` is enforced on every request by `SessionGuard`.

### Concurrency & audit

- Concurrent renames to the same target name are serialized by the unique index; the loser gets 409.
- `updatedAt` bumps on every successful mutation. `archivedAt` / `archivedByAccountId` written in the same transaction as the status flip.

### Rate limiting

- Uses the app-wide default (see spec 02); no per-endpoint override.

### Logging

- Every mutation logs `{ event, actorAccountId, organizationId, clientId, beforeName?, afterName?, beforeStatus?, afterStatus? }` at `info` level. No PII in these logs (client name is a business name, not personal data).

## Out of Scope

- Client contact fields (email, phone, address) — see Known Gaps in the area README.
- Per-client rate overrides — deferred to a future `04-project-rates.md` spec.
- Client logo / avatar upload.
- Client import from CSV.
- Client-scoped user permissions ("can see only projects for client X").
- Free-form tags on clients.
- Client-level totals shown on the Clients list (e.g., total hours, total billed) — the Reports feature (`specs/reports/`) will surface these.

## Test Cases

### Unit

- **TC-01-UNIT-01: Name validation — empty.** `validateClientName("")` returns `{ valid: false, error: "Client name is required." }`.
- **TC-01-UNIT-02: Name validation — whitespace only.** `validateClientName("   ")` returns the same error (trims first).
- **TC-01-UNIT-03: Name validation — too long.** `validateClientName("a".repeat(121))` returns `{ valid: false, error: "Client name cannot exceed 120 characters." }`.
- **TC-01-UNIT-04: Name validation — boundary.** `validateClientName("a".repeat(120))` returns `{ valid: true }`.
- **TC-01-UNIT-05: Name validation — allowed punctuation.** `validateClientName("Smith & Sons, Ltd. (US)")` returns `{ valid: true }`.
- **TC-01-UNIT-06: Name validation — disallowed character.** `validateClientName("Acme <script>")` returns the disallowed-characters error.
- **TC-01-UNIT-07: Whitespace collapse.** `normalizeClientName("  Acme   Corp  ")` returns `"Acme Corp"`.
- **TC-01-UNIT-08: Case-insensitive equality.** `namesEqual("Acme Corp", "acme corp")` returns `true`.
- **TC-01-UNIT-09: `normalizeRole` fallthrough.** `hasCapability(normalizeRole('member'), 'manage-clients')` returns `false` (legacy member maps to user).

### Integration

- **TC-01-INT-01: Create as admin — happy path.** POST with `{ name: "Acme Corp" }` returns 201; response contains a client with `status: "active"`; a subsequent GET returns it in the list.
- **TC-01-INT-02: Create as manager — happy path.** Same as INT-01 but caller is a manager. Returns 201.
- **TC-01-INT-03: Create as user — forbidden.** POST returns 404 (org-scope-style hiding; matches CLAUDE.md rule).
- **TC-01-INT-04: Create as viewer — forbidden.** Same as INT-03.
- **TC-01-INT-05: Create — duplicate name (exact).** Two POSTs with `"Acme Corp"` — the second returns 409 `client_name_taken`.
- **TC-01-INT-06: Create — duplicate name (case).** POST `"acme corp"` after `"Acme Corp"` — 409.
- **TC-01-INT-07: Create — duplicate name (whitespace).** POST `"  Acme  Corp  "` after `"Acme Corp"` — 409 (trims + collapses first).
- **TC-01-INT-08: Create — cross-org duplicate is fine.** Two different orgs each POST `"Acme Corp"` — both return 201.
- **TC-01-INT-09: List — active default.** Seed 3 active + 2 archived clients; GET without `status` returns the 3 active.
- **TC-01-INT-10: List — archived filter.** GET with `?status=archived` returns the 2 archived.
- **TC-01-INT-11: List — all filter.** GET with `?status=all` returns all 5.
- **TC-01-INT-12: List — search.** Seed `"Acme Corp"`, `"Chronos Ltd"`, `"Alpha Analytics"`; GET with `?q=ac` returns the two starting with `Ac`.
- **TC-01-INT-13: List — `projectCount` accuracy.** Seed a client with 3 active + 1 archived projects; response includes `projectCount: 4`, `activeProjectCount: 3`.
- **TC-01-INT-14: Rename — happy path.** PATCH with a new name returns 200; a subsequent list reflects the new name; `updatedAt` moves.
- **TC-01-INT-15: Rename — duplicate.** PATCH to an existing client's name returns 409.
- **TC-01-INT-16: Rename — no-op.** PATCH with the current name returns 200; `updatedAt` still bumps (documented behavior).
- **TC-01-INT-17: Archive — happy path.** PATCH `/archive` returns 200 with `status: "archived"`, `archivedAt` set, `archivedByAccountId` set. A subsequent default list omits the client.
- **TC-01-INT-18: Archive — idempotent.** Two consecutive `/archive` calls both return 200; `archivedAt` does not change on the second call.
- **TC-01-INT-19: Archive — projects keep the FK.** Seed a project linked to a client; archive the client; the project's `clientId` still equals the client's id.
- **TC-01-INT-20: Restore — happy path.** Archive then restore; `status` is `active`, `archivedAt` is null.
- **TC-01-INT-21: Cross-org access blocked.** Admin in org A calls `GET /api/organizations/{orgB}/clients/{clientBId}` — returns 404.
- **TC-01-INT-22: Project create with active client.** POST project with `clientId` referring to an active client — 201.
- **TC-01-INT-23: Project create with archived client.** POST project with an archived `clientId` — 422 `client_archived`.
- **TC-01-INT-24: Project create with non-existent client.** POST project with a random cuid — 422 `client_not_found`.
- **TC-01-INT-25: Project create with cross-org client.** POST project in org A with a `clientId` from org B — 422 `client_not_found` (never 404 on the project endpoint).
- **TC-01-INT-26: Project edit clears client (null).** PATCH project with `clientId: null` — 200; project's `clientId` is null after.
- **TC-01-INT-27: Detail endpoint returns project list.** GET `/clients/{id}` returns a `projects` array with id/name/status only.
- **TC-01-INT-28: Detail endpoint — `user` role.** User role calling detail — 404.
- **TC-01-INT-29: Session revocation.** Rotate `Account.securityStamp` mid-request cycle — the second POST returns 401.
- **TC-01-INT-30: Vacation math not touched.** Seed a full vacation-request lifecycle before and after the Clients migration; the frozen `workingDays` and `deductionAmount` on the pre-existing `VacationRequest` remain unchanged.

### E2E

- **TC-01-E2E-01: Admin creates a client and links it to a project — happy path.** From the Clients page, admin clicks **+ New client**, enters "Acme Corp", clicks **Create client**, sees the toast and the new row. Then navigates to a project via the sidebar, opens Edit, selects "Acme Corp" from the client picker, saves, and sees the client name on the project detail.
  - **Selectors:** `nav-clients`, `clients-new-btn`, `client-name-input`, `client-save-btn`, `toast-client-created`, `clients-row-{id}`, `nav-projects`, `project-edit-btn`, `project-client-select`, `project-save-btn`, `toast-project-updated`, `project-detail-client-label`.
- **TC-01-E2E-02: Manager renames a client — successful flow.** From the Clients page, manager clicks the rename icon on a row, changes the name, sees the toast and the updated list.
  - **Selectors:** `clients-row-{id}-rename-btn`, `client-name-input`, `client-save-btn`, `toast-client-updated`, `clients-row-{id}`.
- **TC-01-E2E-03: Manager renames to duplicate — unsuccessful flow.** Manager renames a client to an existing name; the modal stays open; sees inline error under the name field; the submit button is not disabled; clicking Cancel closes the modal without saving.
  - **Selectors:** `clients-row-{id}-rename-btn`, `client-name-input`, `client-save-btn`, `field-error-name`, `client-cancel-btn`.
- **TC-01-E2E-04: Admin archives a client with active projects — confirmation flow.** Admin opens client detail, clicks **Archive**, sees the confirmation with the correct active-project count in the message, confirms, is redirected back to the list where the client no longer appears under **Active**; switching to **Archived** shows it with a **Restore** button.
  - **Selectors:** `client-detail-archive-btn`, `client-archive-confirm-message`, `client-archive-confirm-btn`, `clients-status-filter`, `clients-row-{id}-restore-btn`.
- **TC-01-E2E-05: Cannot select archived client on new project — permission/state flow.** Admin archives a client, then opens **+ New project**; the client picker no longer offers the archived client. A direct API call with the archived id (via `page.evaluate`) returns 422 with `client_archived`.
  - **Selectors:** `project-client-select`, `field-error-client`.
- **TC-01-E2E-06: `user` role does not see the Clients nav row and cannot reach the page.** User signs in; the sidebar Projects group has no **Clients** entry; navigating to `/org/{orgId}/clients` redirects to `/org/{orgId}/members`.
  - **Selectors:** `nav-clients` (asserted absent), `members-page`.
- **TC-01-E2E-07: Search narrows the list live.** With 5 clients seeded, admin types "ac" in the search box; the table shrinks to the 2 rows whose name starts with "Ac"; clearing the search restores all 5.
  - **Selectors:** `clients-search`, `clients-table`, `clients-row-{id}`.
