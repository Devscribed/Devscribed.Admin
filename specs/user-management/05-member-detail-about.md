# 05 — Member Detail: About

## Summary

Selecting a member from the Members list opens that member's detail view. In this release the detail view has a single active tab, **About**: a read-only header (avatar, name, role badge, joined date, email, timezone) plus two editable fields — **Role** (via a role picker) and **Job title** — saved together with a single "Save changes" action. Viewing is available to all roles; editing is limited by the permission matrix and only applies to `active` members. Removed members' details are fully read-only regardless of the viewer's role. Other tabs (Projects, Roles, Payments) are shown as disabled visual placeholders and are non-functional.

## Actors & Preconditions

- **Actors:** all roles (`admin`, `manager`, `user`, `viewer`) may view; only `admin`/`manager` may edit, subject to role-change authority rules.
- **Preconditions:** a member exists and is reachable from the Members list.

## Permission Matrix (for this screen)

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| View member detail (About) | ✅ | ✅ | ✅ (read-only) | ✅ (read-only) |
| Edit Job title of `active` member | ✅ | ✅ | ❌ | ❌ |
| Change role of `user`/`viewer` member | ✅ (to any role) | ✅ (to `manager`/`user`/`viewer` — no `admin`) | ❌ | ❌ |
| Change role of `manager`/`admin` member | ✅ (to any role) | ❌ | ❌ | ❌ |

## Functional Requirements

### Detail View & Header

1. The detail view is reached by selecting a member row in the Members list and shows a back-link returning to that list.
2. **Read-only header** displays: the member's avatar/placeholder, full name, role badge, "Joined" date (displayed in the viewer's timezone), email, and timezone. These fields are not editable on this screen.
3. The **About** tab is the only active tab in this release. Other tab labels (Projects, Roles, Payments) are shown as disabled/non-functional visual placeholders.

### Editable Fields: Role & Job Title

4. **Role picker:** a dropdown showing the role options. Role and Job title are persisted together via the "Save changes" action.
   - An `admin` sees the role picker on all `active` members, with all four roles as options (`admin`, `manager`, `user`, `viewer`).
   - A `manager` sees the role picker only on `user` and `viewer` members, with `manager`/`user`/`viewer` as options (no `admin`). The picker is hidden (not shown) on `admin` and `manager` members since the viewer has no authority over those members' roles.
   - `user` and `viewer` see no role picker — the role badge is displayed read-only.
5. **Job title** is a free-text field, up to 100 characters, and may be empty (cleared). Job title is an organizational designation set by `admin`/`manager` — it is not self-service.
6. A single **"Save changes"** action persists both the Role and Job title atomically. If either field's change fails validation (e.g. the role change violates the zero-admin guard), the entire save fails — no partial updates. On success the new values are shown and survive a page reload. Concurrency: last write wins; no conflict detection.

### Role-Change Rules

7. **Role assignment authority:**
   - An `admin` may assign or change any `active` member's role to any value in the role enum (`admin`, `manager`, `user`, `viewer`).
   - A `manager` may change `user` and `viewer` members to any non-admin role (`manager`/`user`/`viewer`). A `manager` cannot change the role of `admin` or `manager` members, and cannot promote anyone to `admin`.
   - `user` and `viewer` cannot change anyone's role.
8. **Zero-admin guard:** the system rejects any role change that would leave the organization with zero `active` members holding the `admin` role. This applies to demoting the last admin. The role picker is disabled (with an explanatory tooltip) when using it would violate this guard. The guard is enforced atomically at the database/transaction level to prevent race conditions.
9. **Role changes apply only to `active` members.** The save endpoint rejects role changes for `removed` members — the member must be restored first.

### Read-Only Constraints

10. Editing (both Role and Job title) is permitted only for `admin`/`manager` on `active` members. For `user`/`viewer` the fields are displayed read-only with no editor and no Save control; the save endpoint rejects calls from these roles (HTTP 403).
11. **Removed members are fully read-only.** Viewing a `removed` member's detail is possible via the removed filter in the list. However, both Role and Job title are displayed read-only regardless of the viewer's role — even `admin`/`manager` cannot edit them. The save endpoint rejects calls for `removed` members (HTTP 4xx).
12. The "Joined" date reflects when the member last joined or was restored to the organization (restore resets the joined date).

## UI Notes

- Layout: centered avatar, "Joined {date}" (in viewer's timezone), bold name, role badge, email row with mail icon, timezone row with clock icon, then the tab bar (ABOUT active, other tabs disabled), then the Role picker (if authorized), "Job title" labeled input with placeholder "Enter a job title", and a primary "Save changes" button.
- Empty Job title shows the placeholder. A successful save shows a confirmation (toast or inline).
- For read-only roles: Role shows as a static badge, Job title renders as static text (or a disabled input), and the Save button is absent.
- For removed members: the entire detail is read-only — no role picker, no Job title input, no Save button, regardless of the viewer's role.
- The role picker is disabled (with an explanatory tooltip) when the zero-admin guard would prevent the change.
- Required `data-testid` attributes:
  - `member-detail`, `member-detail-back-link`
  - `member-detail-name`, `member-detail-role-badge`, `member-detail-joined`, `member-detail-email`, `member-detail-timezone`
  - `member-detail-tab-about`, `member-detail-tab-projects` (disabled), `member-detail-tab-roles` (disabled), `member-detail-tab-payments` (disabled)
  - `member-role-select-{id}` — the role picker on the detail page
  - `role-change-guard-message` — the "must retain at least one admin" explanation
  - `job-title-input`, `job-title-save-button`, `job-title-readonly` (read-only render), `toast-member-saved`

## Out of Scope

- Projects, Roles, and Payments tabs (future features).
- Editing header fields (name, email, timezone) from this screen — those are self-service in Account Settings.
- Self-service job title editing (job title is admin/manager-controlled only).

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
  2. 101 chars → invalid ("must be at most 100 characters").
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

### TC-05-INT-01: Save allowed for admin/manager on active members (role + job title)
- **Level:** Integration
- **Preconditions:** target active member M with role `user` and no job title; callers as `admin` and `manager`.
- **Steps:**
  1. As `admin`, call the save endpoint for M with role `manager` and job title "Engineer".
  2. Query M.
  3. As `manager`, call the save endpoint for M with role `user` and job title "Senior Engineer".
  4. Query M.
- **Expected Result:**
  1. Step 1 succeeds (HTTP 2xx). M's role is `manager`, job title is "Engineer".
  2. Step 3: manager cannot change a `manager` member's role → rejected (HTTP 403). M unchanged.

### TC-05-INT-02: Save rejected at the API for user/viewer
- **Level:** Integration
- **Preconditions:** target active member M with Job title "Engineer"; callers as `user` and `viewer`.
- **Steps:**
  1. As `user`, call the save endpoint for M with job title "Hacker".
  2. As `viewer`, call the save endpoint for M with job title "Hacker".
  3. Query M.
- **Expected Result:**
  1. Both calls rejected (HTTP 403).
  2. M's Job title is unchanged ("Engineer").

### TC-05-INT-03: Save rejected for removed member
- **Level:** Integration
- **Preconditions:** member R with status `removed`, role `user`, and Job title "Engineer"; caller is `admin`.
- **Steps:**
  1. As `admin`, call the save endpoint for R with role `manager` and job title "Senior Engineer".
  2. Query R.
- **Expected Result:**
  1. Rejected (HTTP 4xx) — cannot edit removed member's data.
  2. R's role and Job title are unchanged.

### TC-05-INT-04: Job title over 100 characters rejected at API
- **Level:** Integration
- **Preconditions:** target active member M; caller is `admin`.
- **Steps:**
  1. Call the save endpoint for M with a 101-character job title string and unchanged role.
- **Expected Result:**
  1. Rejected (HTTP 4xx) with validation error.

### TC-05-INT-05: Atomic save — role change fails, job title also not saved
- **Level:** Integration
- **Preconditions:** org has exactly one `admin` A; member M with role `user`; caller is A.
- **Steps:**
  1. Call the save endpoint for A (self) with role `manager` and job title "New Title".
- **Expected Result:**
  1. Rejected (HTTP 4xx) — zero-admin guard prevents demotion of last admin.
  2. A's role remains `admin` AND job title is unchanged (atomic failure — no partial save).

### TC-05-INT-06: Last admin cannot be demoted via detail save
- **Level:** Integration
- **Preconditions:** org has exactly one `admin` (the caller) and ≥1 non-admin member.
- **Steps:**
  1. Call the save endpoint setting the caller's own role to `manager`.
- **Expected Result:**
  1. Rejected with "organization must retain at least one admin".
  2. Role unchanged.

### TC-05-INT-07: Manager cannot change admin's role via detail save
- **Level:** Integration
- **Preconditions:** org with `admin` A and `manager` M.
- **Steps:**
  1. As M, call the save endpoint to set A's role to `manager`.
- **Expected Result:**
  1. Rejected (HTTP 403); A's role unchanged.

### TC-05-INT-08: Cannot change a removed member's role via detail save
- **Level:** Integration
- **Preconditions:** org with `admin` A; member R with status `removed` and role `user`.
- **Steps:**
  1. As A, call the save endpoint to set R's role to `manager`.
- **Expected Result:**
  1. Rejected (HTTP 4xx) with error indicating member must be restored first.

### TC-05-E2E-01: Admin edits role and Job title and they persist
- **Level:** E2E
- **Preconditions:** logged in as `admin`; open member "Aleksey Siniakevich" who is `user` with empty Job title.
- **Steps:**
  1. From the Members list, open Aleksey Siniakevich's detail.
  2. Confirm the About tab is active and the header shows name, role badge, joined date, email, timezone.
  3. Select `manager` from the role picker.
  4. Enter "Backend Engineer" in the Job title input.
  5. Click "Save changes".
  6. Reload the page.
- **Expected Result:**
  1. After step 5 a save confirmation appears, role badge updates to `manager`, and Job title shows "Backend Engineer".
  2. After reload both values are retained.
- **Selectors:** `member-detail`, `member-detail-tab-about`, `member-detail-name`, `member-detail-role-badge`, `member-detail-joined`, `member-detail-email`, `member-detail-timezone`, `member-role-select-{id}`, `job-title-input`, `job-title-save-button`, `toast-member-saved`.

### TC-05-E2E-02: user sees a read-only About with no editor
- **Level:** E2E
- **Preconditions:** logged in as `user`; open any active member's detail.
- **Steps:**
  1. Open the member's detail and the About tab.
- **Expected Result:**
  1. The header fields are visible (name, role badge, joined date, email, timezone).
  2. No role picker is present. The Job title renders read-only. No `job-title-input` editor, no `member-role-select-*`, and no `job-title-save-button` are present.
- **Selectors:** `member-detail`, `member-detail-tab-about`, `job-title-readonly`, `job-title-input` (asserted absent), `member-role-select-{id}` (asserted absent), `job-title-save-button` (asserted absent).

### TC-05-E2E-03: Removed member's detail is fully read-only even for admin
- **Level:** E2E
- **Preconditions:** logged in as `admin`; a removed member exists (visible via "Show removed" filter).
- **Steps:**
  1. Tick "Show removed members" on the Members list.
  2. Open the removed member's detail.
- **Expected Result:**
  1. The header shows name, role badge, joined date, email, timezone, and the "Removed" status.
  2. No role picker, no `job-title-input` editor, and no `job-title-save-button` are present — fully read-only.
- **Selectors:** `member-detail`, `member-detail-tab-about`, `job-title-readonly`, `job-title-input` (asserted absent), `member-role-select-{id}` (asserted absent), `job-title-save-button` (asserted absent).

### TC-05-E2E-04: Admin clears Job title
- **Level:** E2E
- **Preconditions:** logged in as `admin`; open an active member whose Job title is "Backend Engineer".
- **Steps:**
  1. Clear the Job title input (select all + delete).
  2. Click "Save changes".
  3. Reload the page.
- **Expected Result:**
  1. After step 2 a save confirmation appears.
  2. After reload the Job title input shows the placeholder "Enter a job title" (empty).
- **Selectors:** `job-title-input`, `job-title-save-button`, `toast-member-saved`.

### TC-05-E2E-05: Manager sees role picker on user/viewer detail but not on admin/manager detail
- **Level:** E2E
- **Preconditions:** logged in as `manager`; org has members with roles `admin`, `manager`, `user`, `viewer`.
- **Steps:**
  1. Open a `user` member's detail — verify role picker is present with options `manager`/`user`/`viewer` (no `admin`).
  2. Open an `admin` member's detail — verify role picker is absent.
  3. Open a `manager` member's detail — verify role picker is absent.
- **Expected Result:**
  1. Role picker present on `user`/`viewer` details, absent on `admin`/`manager` details.
  2. The picker does NOT include `admin` as an option.
- **Selectors:** `member-role-select-{id}` (present on user/viewer, absent on admin/manager).

### TC-05-E2E-06: Placeholder tabs are visible but disabled
- **Level:** E2E
- **Preconditions:** logged in as any role; open any member's detail.
- **Steps:**
  1. Observe the tab bar.
- **Expected Result:**
  1. The About tab is active. Projects, Roles, and Payments tab labels are visible but disabled/non-functional.
- **Selectors:** `member-detail-tab-about`, `member-detail-tab-projects`, `member-detail-tab-roles`, `member-detail-tab-payments`.
