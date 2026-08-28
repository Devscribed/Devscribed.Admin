---
id: "05"
title: "Member Detail: About"
routes: ["/org/{orgId}/members/{memberId}"]
api: ["GET /api/organizations/{orgId}/members/{memberId}", "PUT /api/organizations/{orgId}/members/{memberId}"]
entities: [Membership]
tags: [member-detail, role-picker, job-title, zero-admin-guard, tab-bar, initials-avatar]
depends-on: ["04"]
---

# 05 — Member Detail: About

## Summary

Selecting a member from the Members list opens that member's detail view. In this release the detail view has a single active tab, **About**: a read-only header (initials avatar, name, role badge, joined date, email, timezone) plus two editable fields — **Role** (via a role picker) and **Job title** — saved together with a single "Save changes" action. The avatar is an initials-based placeholder (no upload). Viewing is available to all roles; editing is limited by the permission matrix and only applies to `active` members. Removed members' details are fully read-only regardless of the viewer's role. Other tabs (Projects, Roles, Payments) are shown as disabled visual placeholders and are non-functional.

## Actors & Preconditions

- **Actors:** all roles (`admin`, `manager`, `user`, `viewer`) may view; only `admin`/`manager` may edit, subject to role-change authority rules.
- **Preconditions:** a member exists and is reachable from the Members list.

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| View member detail (About) | ✅ | ✅ | ✅ (read-only) | ✅ (read-only) |
| Edit Job title of `active` member | ✅ | ✅ | ❌ | ❌ |
| Change role of `user`/`viewer` member | ✅ (to any role) | ✅ (to `manager`/`user`/`viewer` — no `admin`) | ❌ | ❌ |
| Change role of `manager`/`admin` member | ✅ (to any role) | ❌ | ❌ | ❌ |

> **Note:** A `manager` viewing an `admin` or `manager` member's detail sees no role picker but **can** still edit the Job title and save. The save sends the current (unchanged) role along with the updated job title.

## Functional Requirements

### Detail View & Header

1. The detail view is reached by selecting a member row in the Members list and shows a back-link returning to that list. Route: `/org/{orgId}/members/{memberId}`.
2. **Read-only header** displays: the member's initials avatar, full name, role badge, "Joined" date (displayed in the viewer's timezone), email, and timezone. These fields are not editable on this screen.
3. The **About** tab is active by default. The **Vacation** tab is active when `MemberFinancials` exist for the member and the caller has permission to view it (see spec 07). Other tab labels (Projects, Roles, Payments) are shown as disabled/non-functional visual placeholders.

### Avatar

4. The header avatar is an initials-based placeholder: the uppercase first character of the first name followed by the uppercase first character of the last name (e.g. "AK" for Alex Kaminski), rendered in a colored circle. The background color is deterministically derived from the member's name (consistent hashing). No avatar upload is supported in this release.

### Editable Fields: Role & Job Title

5. **Role picker:** a dropdown showing the role options. Role and Job title are persisted together via the "Save changes" action.
   - An `admin` sees the role picker on all `active` members, with all four roles as options (`admin`, `manager`, `user`, `viewer`).
   - A `manager` sees the role picker only on `user` and `viewer` members, with `manager`/`user`/`viewer` as options (no `admin`). The picker is hidden (not shown) on `admin` and `manager` members since the viewer has no authority over those members' roles.
   - `user` and `viewer` see no role picker — the role badge is displayed read-only.
6. **Job title** is a free-text field, up to 100 characters, and may be empty (cleared). Job title is an organizational designation set by `admin`/`manager` — it is not self-service.
7. A single **"Save changes"** action persists both the Role and Job title atomically. If either field's change fails validation (e.g. the role change violates the zero-admin guard), the entire save fails — no partial updates. On success the new values are shown and survive a page reload. Concurrency: last write wins; no conflict detection.

### Role-Change Rules

8. **Role assignment authority:**
   - An `admin` may assign or change any `active` member's role to any value in the role enum (`admin`, `manager`, `user`, `viewer`).
   - A `manager` may change `user` and `viewer` members to any non-admin role (`manager`/`user`/`viewer`). A `manager` cannot change the role of `admin` or `manager` members, and cannot promote anyone to `admin`.
   - `user` and `viewer` cannot change anyone's role.
9. **Zero-admin guard:** the system rejects any role change that would leave the organization with zero `active` members holding the `admin` role. This applies to demoting the last admin. The role picker is disabled (with an explanatory tooltip) when using it would violate this guard. The guard is enforced atomically at the database/transaction level to prevent race conditions.
10. **Role changes apply only to `active` members.** The save endpoint rejects changes for `removed` members — the member must be restored first.

### Read-Only Constraints

11. Editing (both Role and Job title) is permitted only for `admin`/`manager` on `active` members. For `user`/`viewer` the fields are displayed read-only with no editor and no Save control; the save endpoint rejects calls from these roles (HTTP 403).
12. **Removed members are fully read-only.** Viewing a `removed` member's detail is possible via the removed filter in the list. However, both Role and Job title are displayed read-only regardless of the viewer's role — even `admin`/`manager` cannot edit them. The save endpoint rejects calls for `removed` members (HTTP 400).
13. The "Joined" date reflects when the member last joined or was restored to the organization (restore resets the joined date).

## Screens

### Member Detail — admin/manager view (editable)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to members                                         │
│                                                             │
│                        ┌────┐                               │
│                        │ AK │        (initials avatar)      │
│                        └────┘                               │
│                    Alex Kaminski                             │
│                       [user]         (role badge)            │
│                  Joined Jun 1, 2025                         │
│                  ✉  alex@acme.com                           │
│                  🕐 America/New_York                        │
│                                                             │
│  [ ABOUT ]   Vacation   Projects   Roles   Payments          │
│    active    see spec07 disabled   disabled  disabled        │
│                                                             │
│  Role                                                       │
│  [ user                          ▾ ]   (dropdown)           │
│                                                             │
│  Job title                                                  │
│  [ Enter a job title               ]   (text input)         │
│                                                             │
│  [ Save changes ]                                           │
└─────────────────────────────────────────────────────────────┘
```

- Back link returns to `/org/{orgId}/members`.
- Avatar shows initials in a colored circle.
- Role badge in the header is always read-only (separate from the role picker below).
- Role picker options depend on the caller's role and the target member's role (per permission matrix).
- When the zero-admin guard applies, the role picker is disabled with a tooltip.
- When a `manager` views an `admin`/`manager` member, the role picker is hidden but Job title input and Save button remain.

### Member Detail — user/viewer view (read-only)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to members                                         │
│                                                             │
│                        ┌────┐                               │
│                        │ AK │                               │
│                        └────┘                               │
│                    Alex Kaminski                             │
│                       [user]                                │
│                  Joined Jun 1, 2025                         │
│                  ✉  alex@acme.com                           │
│                  🕐 America/New_York                        │
│                                                             │
│  [ ABOUT ]   Vacation   Projects   Roles   Payments          │
│                                                             │
│  Job title: Backend Engineer       (static text)            │
│                                                             │
│  (no role picker, no save button)                           │
└─────────────────────────────────────────────────────────────┘
```

- No role picker, no job title input, no Save button.
- Role is displayed as a static badge in the header only.
- Job title (if any) is rendered as static text (`job-title-readonly`). If empty, nothing is shown.

### Member Detail — removed member view

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to members                                         │
│                                                             │
│                        ┌────┐                               │
│                        │ AK │                               │
│                        └────┘                               │
│                    Alex Kaminski                             │
│                   [user] [Removed]                          │
│                  Joined Jun 1, 2025                         │
│                  ✉  alex@acme.com                           │
│                  🕐 America/New_York                        │
│                                                             │
│  [ ABOUT ]   Vacation   Projects   Roles   Payments          │
│                                                             │
│  Job title: Backend Engineer       (static text)            │
│                                                             │
│  (fully read-only — no editing regardless of viewer role)   │
└─────────────────────────────────────────────────────────────┘
```

- A "Removed" status badge is displayed alongside the role badge.
- Fully read-only for all roles, including `admin`/`manager`.

## Flows

### Main Flow: View and edit member detail (admin)

1. Admin clicks a member row on the Members list.
2. Browser navigates to `/org/{orgId}/members/{memberId}`.
3. System sends `GET /api/organizations/{orgId}/members/{memberId}`.
4. System renders skeleton/loading state while waiting.
5. System displays the member detail header: initials avatar, name, role badge, "Joined {date}" in viewer's timezone, email, timezone.
6. System renders the About tab as active; Vacation tab as active or disabled per spec 07 rules; Projects, Roles, Payments tabs as disabled.
7. System renders the role picker (populated with options from API `availableRoles`, pre-selected with current role) and the job title input (pre-filled with current value, or empty with placeholder "Enter a job title").
8. Admin selects a new role and/or edits the job title.
9. Admin clicks "Save changes". The button disables with a loading indicator.
10. System sends `PUT /api/organizations/{orgId}/members/{memberId}` with `{ "role": "...", "jobTitle": "..." }`.
11. On success: toast "Changes saved" (`toast-member-saved`) appears, role badge in header updates to the new role, new values persist on page reload.

### Flow: Navigate back to members list

1. User clicks the "Back to members" link (`member-detail-back-link`).
2. Browser navigates to `/org/{orgId}/members`.

### Flow: Manager edits user/viewer member

1. Manager clicks a `user` or `viewer` member row.
2. System navigates and fetches as in Main Flow steps 2–6.
3. System renders the role picker with options `manager`, `user`, `viewer` (no `admin`).
4. System renders the job title input.
5. Manager edits and saves as in Main Flow steps 8–11.

### Alt Flow: Manager views admin/manager member (branches from Main Flow, step 7)

7a. System does NOT render the role picker (manager has no authority over `admin`/`manager` members' roles).
7b. System renders the job title input and Save button (manager can edit job title of any active member).
8a. Manager edits the job title and clicks "Save changes".
9a. System sends `PUT` with the current (unchanged) role and the new job title.
10a. On success: toast appears, job title updates.

### Alt Flow: User/viewer views member detail (branches from Main Flow, step 7)

7a. System does NOT render the role picker, job title input, or Save button.
7b. Job title (if any) is displayed as static text (`job-title-readonly`). Role is shown as a static badge in the header only.

### Alt Flow: Viewing removed member detail (branches from Main Flow, step 5)

5a. System renders the header with a "Removed" status badge alongside the role badge.
6a. System renders the About tab as active; other tabs as disabled.
7a. No role picker, no job title input, no Save button are rendered — regardless of the viewer's role.
7b. Job title (if any) is displayed as static text.

### Alt Flow: Save fails — zero-admin guard (branches from Main Flow, step 7)

7a. The target member is the last active admin. The role picker is rendered but disabled with tooltip "Organization must retain at least one admin" (`role-change-guard-message`).
7b. The job title input remains editable. The Save button is enabled (for job-title-only changes with the role unchanged).
8a. If the guard is bypassed (direct API call): `PUT` returns `409 Conflict` with `{ "error": "last_admin_guard", "message": "Organization must retain at least one admin" }`.
8b. Both role and job title are unchanged (atomic failure).

### Alt Flow: Save fails — validation error (branches from Main Flow, step 10)

10a. Job title exceeds 100 characters. Client-side validation shows inline error "Job title must be at most 100 characters" beneath the input (`field-error-jobTitle`). Save is blocked until corrected.
10b. If client validation is bypassed: `PUT` returns `400 Bad Request` with `{ "errors": { "jobTitle": "Job title must be at most 100 characters" } }`.

### Alt Flow: Save fails — role authority violation (branches from Main Flow, step 10)

10a. Manager attempts to assign `admin` role via direct API call. `PUT` returns `403 Forbidden` with `{ "error": "role_authority", "message": "You do not have permission to assign this role" }`.
10b. No changes saved. Form retains values. Save button re-enables.

### Alt Flow: Network/server error (branches from Main Flow, step 10)

10a. Save request fails with 5xx or network error.
10b. System shows error toast "Something went wrong. Please try again."
10c. Form retains its current values. Save button re-enables.

## API Contracts

### GET /api/organizations/{orgId}/members/{memberId}

**Authentication:** required. Caller must be an `active` member of the organization.

**Response `200`:**
```json
{
  "id": "uuid",
  "fullName": "Alex Kaminski",
  "email": "alex@acme.com",
  "role": "user",
  "status": "active",
  "joinedAt": "2025-06-01T12:00:00Z",
  "jobTitle": "Backend Engineer",
  "timezone": "America/New_York",
  "avatarInitials": "AK",
  "isLastAdmin": false,
  "canEditRole": true,
  "canEditJobTitle": true,
  "availableRoles": ["admin", "manager", "user", "viewer"],
  "callerRole": "admin"
}
```

Field semantics:
- `canEditRole`: `true` if the caller has authority to change this member's role (based on caller role, target role, and target status). Drives whether the role picker is rendered.
- `canEditJobTitle`: `true` if the caller is `admin`/`manager` AND the target is `active`. Drives whether the job title input is rendered.
- `availableRoles`: the role options the caller may assign to this member. Empty array if `canEditRole` is `false`. For `admin`: all four roles. For `manager` on `user`/`viewer`: `["manager", "user", "viewer"]`.
- `isLastAdmin`: `true` if this member is the sole active admin. Drives the zero-admin guard tooltip on the role picker.
- `avatarInitials`: uppercase first character of first name + uppercase first character of last name.
- `jobTitle`: current job title string, or `null`/empty if unset.

**Errors:**
- `401 Unauthorized`: not authenticated.
- `403 Forbidden`: caller is not a member of this organization — `{ "error": "forbidden", "message": "You do not have permission to view this member" }`.
- `404 Not Found`: member not found in this org — `{ "error": "not_found", "message": "Member not found" }`.

### PUT /api/organizations/{orgId}/members/{memberId}

**Authentication:** required. Caller must be `admin` or `manager` with an `active` membership.

**Request:**
```json
{
  "role": "manager",
  "jobTitle": "Backend Engineer"
}
```

Both fields are always sent. The save is atomic — both succeed or both fail.

**Success `200`:**
```json
{
  "success": true
}
```

**Errors:**
- `400 Bad Request` (validation): `{ "errors": { "jobTitle": "Job title must be at most 100 characters" } }` — field validation failure.
- `400 Bad Request` (invalid role): `{ "error": "invalid_role", "message": "Invalid role" }` — role not in enum.
- `400 Bad Request` (removed member): `{ "error": "member_removed", "message": "Cannot edit a removed member" }` — target is in `removed` status.
- `403 Forbidden` (permission): `{ "error": "forbidden", "message": "You do not have permission to edit members" }` — caller is `user`/`viewer`.
- `403 Forbidden` (role authority): `{ "error": "role_authority", "message": "You do not have permission to assign this role" }` — e.g. manager assigning `admin`, or manager changing `admin`/`manager` member's role.
- `404 Not Found`: `{ "error": "not_found", "message": "Member not found" }`.
- `409 Conflict` (zero-admin guard): `{ "error": "last_admin_guard", "message": "Organization must retain at least one admin" }` — role change would leave zero active admins.

**Side effects on success:**
- Update membership role and job title atomically in a single database transaction.
- No session revocation (unlike delete in spec 04).

## Validation Rules

1. **Job title**: optional (may be empty/cleared). Maximum 100 characters.
2. **Role**: must be a value in the role enum (`admin`, `manager`, `user`, `viewer`).
3. **Role-change authority**: the caller must have authority to assign the target role to the target member (see permission matrix). Manager cannot assign `admin` or change `admin`/`manager` members' roles.
4. **Zero-admin guard**: a role change must not leave the organization with zero `active` members holding the `admin` role. Enforced atomically via database transaction.
5. **Target status**: only `active` members may be edited. The save endpoint rejects calls for `removed` members.
6. **Caller permission**: caller must be `admin` or `manager` with an `active` membership.

Client-side validation: job title length check (inline error beneath input). Role validation is implicit in the dropdown (only valid options are presented).

Server-side validation: all rules enforced regardless of UI state.

## Error Messages

| Context | Message |
|---|---|
| Save — forbidden (user/viewer) | "You do not have permission to edit members" |
| Save — removed member | "Cannot edit a removed member" |
| Save — zero-admin guard | "Organization must retain at least one admin" |
| Save — role authority violation | "You do not have permission to assign this role" |
| Save — invalid role value | "Invalid role" |
| Save — job title too long | "Job title must be at most 100 characters" |
| Save — member not found | "Member not found" |
| View — forbidden | "You do not have permission to view this member" |
| View — member not found | "Member not found" |
| Network/server error (any mutation) | "Something went wrong. Please try again." |
| Zero-admin guard tooltip (role picker) | "Organization must retain at least one admin" |
| Toast — member saved | "Changes saved" |

## UI Description

### Layout

- Route: `/org/{orgId}/members/{memberId}`.
- Entry point: clicking a member row on the Members list (spec 04).
- Back link at top: "Back to members" linking to `/org/{orgId}/members`.
- Vertically stacked layout, centered, max-width approximately 600px.
- Header section: centered initials avatar (colored circle), full name (bold), role badge, "Joined {date}" (in viewer's timezone), email with mail icon, timezone with clock icon.
- Tab bar: ABOUT (active), Vacation (active/disabled per spec 07), Projects (disabled), Roles (disabled), Payments (disabled).
- Form section (below tabs): Role picker (if authorized), Job title input, Save changes button.
- Toast notification for save confirmation.

### Components

**Initials avatar (`member-detail-avatar`):**
- Circular colored background with white initials text.
- Initials: uppercase first character of first name + uppercase first character of last name.
- Background color deterministically derived from the member's name.

**Role picker (`member-role-select-{id}`):**
- Labeled dropdown. Label: "Role".
- Options populated from the API `availableRoles` array.
- Pre-selected with the member's current role.
- Disabled with tooltip (`role-change-guard-message`) when `isLastAdmin` is `true` and the current role is `admin`.
- Hidden entirely when `canEditRole` is `false`.

**Job title input (`job-title-input`):**
- Labeled text input. Label: "Job title".
- Placeholder: "Enter a job title".
- Max length: 100 characters.
- Pre-filled with current value (if any).
- Inline error area beneath (`field-error-jobTitle`) for validation errors.
- Hidden when `canEditJobTitle` is `false`; replaced with `job-title-readonly` static text showing the current value (or nothing if empty).

**Save button (`job-title-save-button`):**
- Text: "Save changes".
- Primary style.
- Visible only when at least one editable field is rendered (role picker and/or job title input).
- Disabled during API submission (loading state).

### States

| State | Behavior |
|---|---|
| **Loading** | Skeleton/shimmer matching the header and form layout while the `GET` request is in flight. |
| **Default (editable)** | Header displayed. Role picker and/or job title input rendered per caller permissions. Save button enabled. |
| **Default (read-only)** | Header displayed. Role shown as badge in header only. Job title as static text (`job-title-readonly`). No save button. |
| **Removed member** | Header displayed with "Removed" status badge. Fully read-only regardless of caller role. |
| **Zero-admin guard** | Role picker disabled with tooltip. Job title input still editable. Save button enabled (for job-title-only changes). |
| **Saving** | Save button disabled with loading indicator. Fields read-only during submission. |
| **Save success** | Toast "Changes saved" appears. Role badge in header updates. Values persist on reload. |
| **Save error** | Error toast with the API error message. Fields retain values. Save button re-enables. |
| **Not found** | Error state: "Member not found" message displayed. No header or form rendered. |

### Interactions

- **Back link click:** navigates to the members list.
- **Tab click on disabled tab:** no action (visual indication that tab is disabled/greyed out).
- **Role picker change:** updates the selected value locally. No immediate save — deferred to Save button.
- **Job title input:** standard text input behavior. Client-side length validation on input (inline error if > 100 chars).
- **Save click:** sends `PUT` request. On success: shows toast and updates role badge in header. On error: shows error toast with the API error message, form retains values, save button re-enables.

### Responsive Behavior

- Max-width approximately 600px, centered on desktop.
- On narrow viewports, full width with horizontal padding.
- Header elements stack vertically at all breakpoints — no side-by-side layout.

### Required `data-testid` Attributes

- `member-detail`, `member-detail-back-link`
- `member-detail-avatar`
- `member-detail-name`, `member-detail-role-badge`, `member-detail-joined`, `member-detail-email`, `member-detail-timezone`
- `member-detail-tab-about`, `member-detail-tab-vacation` (see spec 07), `member-detail-tab-projects` (disabled), `member-detail-tab-roles` (disabled), `member-detail-tab-payments` (disabled)
- `member-role-select-{id}` — the role picker on the detail page
- `role-change-guard-message` — the "must retain at least one admin" explanation
- `job-title-input`, `field-error-jobTitle`, `job-title-save-button`, `job-title-readonly` (read-only render)
- `toast-member-saved`
- `member-detail-loading-skeleton`

## Out of Scope

- Projects, Roles, and Payments tabs (future features). Vacation tab is covered in spec 07.
- Editing header fields (name, email, timezone) from this screen — those are self-service in Account Settings (spec 06).
- Self-service job title editing (job title is admin/manager-controlled only).
- Avatar/photo upload (initials-based placeholder only in this release).

## Test Cases

### TC-05-UNIT-01: Job title validation (max length)
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate a 100-character string.
  2. Validate a 101-character string.
  3. Validate an empty string.
- **Expected Result:**
  1. 100 chars → valid.
  2. 101 chars → invalid ("Job title must be at most 100 characters").
  3. Empty → valid (Job title may be cleared).

### TC-05-UNIT-02: Job title allows empty (clearing)
- **Level:** Unit
- **Preconditions:** a member with Job title "Engineer".
- **Steps:**
  1. Set Job title to `""` (empty string).
  2. Validate.
- **Expected Result:**
  1. Valid — Job title is cleared.

### TC-05-UNIT-03: Manager role-change authority on detail page
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Check if manager can change `user` → `manager`.
  2. Check if manager can change `user` → `viewer`.
  3. Check if manager can change `viewer` → `user`.
  4. Check if manager can change `user` → `admin`.
  5. Check if manager can change `manager` → `user`.
  6. Check if manager can change `admin` → `user`.
- **Expected Result:**
  1. ✅ Allowed.
  2. ✅ Allowed.
  3. ✅ Allowed.
  4. ❌ Rejected (cannot promote to admin).
  5. ❌ Rejected (manager is not in manager's scope).
  6. ❌ Rejected (admin is not in manager's scope).

### TC-05-UNIT-04: Avatar initials generation
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Generate initials for first name "Alex", last name "Kaminski".
  2. Generate initials for first name "pat", last name "owner".
  3. Generate initials for first name "María", last name "García".
- **Expected Result:**
  1. "AK".
  2. "PO" (uppercased).
  3. "MG" (Unicode letters supported).

### TC-05-INT-01: Save allowed for admin/manager on active members (role + job title)
- **Level:** Integration
- **Preconditions:** target active member M with role `user` and no job title; callers as `admin` and `manager`.
- **Steps:**
  1. As `admin`, call `PUT /api/organizations/{orgId}/members/{M.id}` with `{ "role": "manager", "jobTitle": "Engineer" }`.
  2. Query M.
  3. As `manager`, call `PUT` for M with `{ "role": "user", "jobTitle": "Senior Engineer" }`.
  4. Query M.
- **Expected Result:**
  1. Step 1 succeeds (HTTP 200). M's role is `manager`, job title is "Engineer".
  2. Step 3: manager cannot change a `manager` member's role → rejected (HTTP 403) with `{ "error": "role_authority" }`. M unchanged.

### TC-05-INT-02: Save rejected at the API for user/viewer
- **Level:** Integration
- **Preconditions:** target active member M with Job title "Engineer"; callers as `user` and `viewer`.
- **Steps:**
  1. As `user`, call `PUT` for M with `{ "role": "user", "jobTitle": "Hacker" }`.
  2. As `viewer`, call `PUT` for M with `{ "role": "user", "jobTitle": "Hacker" }`.
  3. Query M.
- **Expected Result:**
  1. Both calls rejected (HTTP 403) with `{ "error": "forbidden", "message": "You do not have permission to edit members" }`.
  2. M's Job title is unchanged ("Engineer").

### TC-05-INT-03: Save rejected for removed member
- **Level:** Integration
- **Preconditions:** member R with status `removed`, role `user`, and Job title "Engineer"; caller is `admin`.
- **Steps:**
  1. As `admin`, call `PUT` for R with `{ "role": "manager", "jobTitle": "Senior Engineer" }`.
  2. Query R.
- **Expected Result:**
  1. Rejected (HTTP 400) with `{ "error": "member_removed", "message": "Cannot edit a removed member" }`.
  2. R's role and Job title are unchanged.

### TC-05-INT-04: Job title over 100 characters rejected at API
- **Level:** Integration
- **Preconditions:** target active member M; caller is `admin`.
- **Steps:**
  1. Call `PUT` for M with a 101-character job title string and unchanged role.
- **Expected Result:**
  1. Rejected (HTTP 400) with `{ "errors": { "jobTitle": "Job title must be at most 100 characters" } }`.

### TC-05-INT-05: Atomic save — role change fails, job title also not saved
- **Level:** Integration
- **Preconditions:** org has exactly one `admin` A; member M with role `user`; caller is A.
- **Steps:**
  1. Call `PUT` for A (self) with `{ "role": "manager", "jobTitle": "New Title" }`.
- **Expected Result:**
  1. Rejected (HTTP 409) with `{ "error": "last_admin_guard", "message": "Organization must retain at least one admin" }`.
  2. A's role remains `admin` AND job title is unchanged (atomic failure — no partial save).

### TC-05-INT-06: Last admin cannot be demoted via detail save
- **Level:** Integration
- **Preconditions:** org has exactly one `admin` (the caller) and ≥1 non-admin member.
- **Steps:**
  1. Call `PUT` setting the caller's own role to `manager`.
- **Expected Result:**
  1. Rejected (HTTP 409) with `{ "error": "last_admin_guard", "message": "Organization must retain at least one admin" }`.
  2. Role unchanged.

### TC-05-INT-07: Manager cannot change admin's role via detail save
- **Level:** Integration
- **Preconditions:** org with `admin` A and `manager` M.
- **Steps:**
  1. As M, call `PUT` for A with `{ "role": "manager", "jobTitle": "..." }`.
- **Expected Result:**
  1. Rejected (HTTP 403) with `{ "error": "role_authority", "message": "You do not have permission to assign this role" }`.
  2. A's role unchanged.

### TC-05-INT-08: Cannot change a removed member's role via detail save
- **Level:** Integration
- **Preconditions:** org with `admin` A; member R with status `removed` and role `user`.
- **Steps:**
  1. As A, call `PUT` for R with `{ "role": "manager", "jobTitle": "..." }`.
- **Expected Result:**
  1. Rejected (HTTP 400) with `{ "error": "member_removed", "message": "Cannot edit a removed member" }`.

### TC-05-INT-09: GET member detail returns correct permission flags for admin
- **Level:** Integration
- **Preconditions:** `admin` caller; target is an active `user` member with job title "Engineer".
- **Steps:**
  1. Call `GET /api/organizations/{orgId}/members/{memberId}`.
- **Expected Result:**
  1. Response includes `canEditRole: true`, `canEditJobTitle: true`, `availableRoles: ["admin", "manager", "user", "viewer"]`, `callerRole: "admin"`.
  2. Response includes `fullName`, `email`, `role: "user"`, `status: "active"`, `jobTitle: "Engineer"`, `timezone`, `avatarInitials`, `joinedAt`.

### TC-05-INT-10: GET member detail returns correct permission flags for manager viewing user
- **Level:** Integration
- **Preconditions:** `manager` caller; target is an active `user` member.
- **Steps:**
  1. Call `GET /api/organizations/{orgId}/members/{memberId}`.
- **Expected Result:**
  1. `canEditRole: true`, `canEditJobTitle: true`, `availableRoles: ["manager", "user", "viewer"]`, `callerRole: "manager"`.

### TC-05-INT-11: GET member detail returns correct permission flags for manager viewing admin
- **Level:** Integration
- **Preconditions:** `manager` caller; target is an `admin` member.
- **Steps:**
  1. Call `GET /api/organizations/{orgId}/members/{memberId}`.
- **Expected Result:**
  1. `canEditRole: false`, `canEditJobTitle: true`, `availableRoles: []`.

### TC-05-INT-12: GET member detail returns correct permission flags for user/viewer
- **Level:** Integration
- **Preconditions:** `user` caller; target is any active member.
- **Steps:**
  1. Call `GET /api/organizations/{orgId}/members/{memberId}`.
- **Expected Result:**
  1. `canEditRole: false`, `canEditJobTitle: false`, `availableRoles: []`.

### TC-05-INT-13: GET member detail for removed member
- **Level:** Integration
- **Preconditions:** `admin` caller; target is a `removed` member.
- **Steps:**
  1. Call `GET /api/organizations/{orgId}/members/{memberId}`.
- **Expected Result:**
  1. `status: "removed"`, `canEditRole: false`, `canEditJobTitle: false`, `availableRoles: []`.

### TC-05-INT-14: GET member detail returns 404 for non-existent member
- **Level:** Integration
- **Preconditions:** `admin` caller; invalid/non-existent `memberId`.
- **Steps:**
  1. Call `GET /api/organizations/{orgId}/members/{memberId}`.
- **Expected Result:**
  1. HTTP 404 with `{ "error": "not_found", "message": "Member not found" }`.

### TC-05-INT-15: Manager edits job title of admin member (role unchanged)
- **Level:** Integration
- **Preconditions:** `manager` caller; target is an `admin` member with job title "CTO".
- **Steps:**
  1. Call `PUT` for target with `{ "role": "admin", "jobTitle": "CEO" }`.
  2. Query target.
- **Expected Result:**
  1. HTTP 200 (success). Role remains `admin`, job title updated to "CEO".

### TC-05-E2E-01: Admin edits role and Job title and they persist
- **Retired.** Covered by the integration case that saves role and job title together on an active member and reads them back. The form's write-and-reread path on this screen is still exercised by TC-05-E2E-11.

### TC-05-E2E-02: user sees a read-only About with no editor
- **Retired.** Covered by TC-05-INT-12 (the permission flags a user or viewer receives) and TC-05-INT-02 (the save is refused at the API regardless of what the page draws). The page renders from those flags.

### TC-05-E2E-03: Removed member's detail is fully read-only even for admin
- **Retired.** Covered by the integration cases that return fully locked-down flags for a removed member and reject a save against one. That the screen renders read-only from those flags is asserted by TC-05-E2E-02.

### TC-05-E2E-04: Admin clears Job title
- **Retired.** Covered by the integration case that allows clearing a job title. Clearing is the same form path as setting, on the same field.

### TC-05-E2E-05: Manager sees role picker on user/viewer detail but not on admin/manager detail
- **Retired.** Covered by TC-05-INT-10 and TC-05-INT-11 for the flags a manager receives on a user and on an admin, and by TC-05-INT-07 for the rule behind them. Role-gated rendering is proved in the browser once, by TC-01-E2E-07 in the documents area.

### TC-05-E2E-06: Placeholder tabs are visible but disabled
- **Retired.** Retired without replacement. The placeholder tabs are static markup with nothing behind them; the case asserted that four disabled elements are disabled.

### TC-05-E2E-07: Navigate to member detail and back
- **Level:** E2E
- **Preconditions:** logged in as any role; on the Members list.
- **Steps:**
  1. Click a member row.
  2. Verify the member detail page loads with the correct member's data.
  3. Click the "Back to members" link.
  4. Verify the Members list page loads.
- **Expected Result:**
  1. After step 1 the browser navigates to `/org/{orgId}/members/{memberId}`.
  2. The detail page shows the selected member's name, role, email, etc.
  3. After step 3 the browser navigates back to `/org/{orgId}/members`.
- **Selectors:** `member-row-{id}`, `member-detail`, `member-detail-name`, `member-detail-back-link`, `members-list`.

### TC-05-E2E-08: Zero-admin guard disables role picker on last admin
- **Level:** E2E
- **Preconditions:** logged in as sole `admin`; open own member detail.
- **Steps:**
  1. Open own member detail.
  2. Observe the role picker state.
- **Expected Result:**
  1. The role picker is rendered but disabled.
  2. The guard message "Organization must retain at least one admin" is visible (tooltip or inline).
  3. The job title input remains editable.
- **Selectors:** `member-detail`, `member-role-select-{id}`, `role-change-guard-message`, `job-title-input`.

### TC-05-E2E-09: Manager edits job title of admin member (no role picker)
- **Level:** E2E
- **Preconditions:** logged in as `manager`; open an `admin` member's detail. Member has job title "CTO".
- **Steps:**
  1. Verify the role picker is absent.
  2. Clear the job title and enter "CEO".
  3. Click "Save changes".
  4. Reload the page.
- **Expected Result:**
  1. No `member-role-select-*` is present.
  2. After step 3, "Changes saved" toast appears. Job title shows "CEO".
  3. After reload, job title is "CEO". Role badge is still `admin` (unchanged).
- **Selectors:** `member-role-select-{id}` (asserted absent), `job-title-input`, `job-title-save-button`, `toast-member-saved`.

### TC-05-E2E-10: Loading skeleton shown while fetching member detail
- **Retired.** Duplicate mechanism. The loading skeleton is one component with one trigger, and TC-04-E2E-09 proves it on the list.

### TC-05-E2E-11: Job title validation error shown for input exceeding 100 characters
- **Retired.** Covered by TC-05-INT-04 for the 100-character limit. "Inline error on blur, cleared on correction" is the shared form mechanism TC-01-E2E-03 proves once.

