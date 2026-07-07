# 06 — Member Detail: About Tab

## Summary

Selecting a member from the Members list opens that member's detail view. In this release the detail view has a single tab, **About**: a read-only header (avatar, name, joined date, email, timezone) plus one editable field, **Job title**, saved with a "Save changes" action. Viewing is available to all roles; editing the Job title is limited to `admin`/`manager`. Other tabs (Projects, Roles, Payments) are shown as future placeholders or omitted entirely and are out of scope here.

## Actors & Preconditions

- **Actors:** viewers of the detail — all roles (`admin`, `manager`, `user`, `viewer`) may view; only `admin`/`manager` may edit the Job title, per the permission matrix in [03-roles-and-permissions](03-roles-and-permissions.md).
- **Preconditions:** a member exists and is reachable from the Members list ([05-member-list-management](05-member-list-management.md)).

## Functional Requirements

1. The detail view is reached by selecting a member row in the Members list and shows a back-link returning to that list.
2. **Read-only header** displays: the member's avatar/placeholder, full name, "Joined" date, email, and timezone. These fields are not editable on this screen.
3. The **About** tab is the only active tab in this release. If other tab labels (Projects/Roles/Payments) are shown, they are non-functional placeholders and are out of scope.
4. **Job title** is the single editable field on the About tab. It accepts free text up to 100 characters and may be empty (cleared).
5. A **"Save changes"** action persists the Job title. On success the new value is shown and survives a page reload.
6. Editing the Job title is permitted only to `admin`/`manager`. For `user`/`viewer` the Job title is displayed read-only with no editor and no Save control; the save endpoint rejects calls from these roles (HTTP 403) even if invoked directly.
7. Viewing a `removed` member's detail is possible via the removed filter in the list; the same read-only/editable rules apply.

## UI Notes

- Layout mirrors the reference screenshot: centered avatar, "Joined {date}", bold name, email row with mail icon, timezone row with clock icon, then the tab bar (ABOUT active), then the "Job title" labeled input with placeholder "Enter a job title" and a primary "Save changes" button.
- Empty Job title shows the placeholder. A successful save shows a confirmation (toast or inline).
- For read-only roles the Job title renders as static text (or a disabled input) and the Save button is absent.
- Required `data-testid` attributes:
  - `member-detail`, `member-detail-back-link`
  - `member-detail-name`, `member-detail-joined`, `member-detail-email`, `member-detail-timezone`
  - `member-detail-tab-about` (and, if present, `member-detail-tab-projects/roles/payments` as placeholders)
  - `job-title-input`, `job-title-save-button`, `job-title-readonly` (read-only render), `toast-member-saved`

## Out of Scope

- Projects, Roles, and Payments tabs (future).
- Editing header fields (name, email, timezone) from this screen — those are self-service in [07-account-settings](07-account-settings.md) or admin flows elsewhere.
- Changing the member's role from this screen (admin-only, per [03-roles-and-permissions](03-roles-and-permissions.md)).

## Test Cases

### TC-06-UNIT-01: Job title validation (max length)
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

### TC-06-INT-01: Save allowed for admin/manager
- **Level:** Integration
- **Preconditions:** target member M; callers as `admin` and `manager`.
- **Steps:**
  1. As `admin`, call the save-job-title endpoint for M with "Engineer".
  2. As `manager`, call it for M with "Senior Engineer".
  3. Query M.
- **Expected Result:**
  1. Both calls succeed (HTTP 2xx).
  2. M's Job title is "Senior Engineer" (last write wins).

### TC-06-INT-02: Save rejected at the API for user/viewer
- **Level:** Integration
- **Preconditions:** target member M with Job title "Engineer"; callers as `user` and `viewer`.
- **Steps:**
  1. As `user`, call the save-job-title endpoint for M with "Hacker".
  2. As `viewer`, call the save-job-title endpoint for M with "Hacker".
  3. Query M.
- **Expected Result:**
  1. Both calls rejected (HTTP 403).
  2. M's Job title is unchanged ("Engineer").

### TC-06-E2E-01: Admin edits Job title and it persists
- **Level:** E2E
- **Preconditions:** logged in as `admin`; open member "Aleksey Siniakevich" whose Job title is empty.
- **Steps:**
  1. From the Members list, open Aleksey Siniakevich's detail.
  2. Confirm the About tab is active and the header shows name, joined date, email, timezone.
  3. Enter "Backend Engineer" in the Job title input.
  4. Click "Save changes".
  5. Reload the page.
- **Expected Result:**
  1. After step 4 a save confirmation appears and the Job title input holds "Backend Engineer".
  2. After reload the Job title still reads "Backend Engineer".
- **Selectors:** `member-detail`, `member-detail-tab-about`, `member-detail-name`, `member-detail-joined`, `member-detail-email`, `member-detail-timezone`, `job-title-input`, `job-title-save-button`, `toast-member-saved`.

### TC-06-E2E-02: user sees a read-only About with no editor
- **Level:** E2E
- **Preconditions:** logged in as `user`; open any member's detail.
- **Steps:**
  1. Open the member's detail and the About tab.
- **Expected Result:**
  1. The header fields are visible.
  2. The Job title renders read-only; no `job-title-input` editor and no `job-title-save-button` are present.
- **Selectors:** `member-detail`, `member-detail-tab-about`, `job-title-readonly`, `job-title-input` (asserted absent), `job-title-save-button` (asserted absent).

## Open Questions / Assumptions

- Assumes the header fields are sourced from the member's account profile (name/email/timezone) and are edited elsewhere.
- Assumes placeholder tabs, if rendered, are inert and require no behavior in this release.
