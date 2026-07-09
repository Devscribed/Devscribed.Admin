# 04 — Member List & Management

## Summary

The Members screen lists an organization's members and is the post-login landing page. `admin` and `manager` roles get a management view where they can search, reveal removed members, soft-delete a member, restore a previously removed member, and change a member's role via an inline role picker. `user` and `viewer` roles get the same list read-only, with no per-row actions. Members have exactly two states: `active` and `removed`. Deleting is a soft-delete (moves to `removed`, blocks login, revokes all sessions immediately); restoring returns a removed member directly to `active` without a new invitation, but resets the joined date and clears the job title. The last remaining `admin` cannot be removed, and no member can remove themselves.

## Actors & Preconditions

- **Actors:** `admin`/`manager` (full actions) and `user`/`viewer` (read-only).
- **Preconditions:** an organization with one or more members exists.

## Roles & Permission Matrix

The organization uses four roles: `admin`, `manager`, `user`, `viewer`. Every active membership has exactly one role.

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| View members list, search, filter removed | ✅ | ✅ | ✅ (read-only) | ✅ (read-only) |
| Invite members | ✅ | ✅ | ❌ | ❌ |
| Delete / Restore members | ✅ | ✅ | ❌ | ❌ |
| Change role of `user`/`viewer` members | ✅ (to any role) | ✅ (to `manager`/`user`/`viewer` — no `admin`) | ❌ | ❌ |
| Change role of `manager`/`admin` members | ✅ (to any role) | ❌ | ❌ | ❌ |

## Functional Requirements

### List & Search

1. The screen lists members of the current organization. Each row shows the member's full name, role badge, and email. For `admin`/`manager` rows also include a per-row actions menu and a role picker control. Rows link to the member's detail view.
2. **Default view:** only `active` members are shown, sorted by name ascending.
3. **Search:** a single search box filters the list live (on each keystroke) by case-insensitive partial match against the member's full name **or** email. Clearing the box restores the unfiltered list. Search does not match against role or job title.
4. **"Show removed members" checkbox:** unchecked (default) shows `active` members only; checked shows `active` **and** `removed` members together in one list, with removed rows visually marked by a status badge. It is an additive reveal, not a replace-toggle.
5. Search and the removed filter compose: with "Show removed" checked, the search term filters across the combined active+removed set (removed members are also searchable).

### Delete & Restore

6. **Delete (soft-delete)** — available to `admin`/`manager` only, on `active` members other than themselves: sets the member's status to `removed`. A removed member can no longer log in, and all their active sessions are immediately revoked. The member disappears from the default view. A confirmation dialog precedes the delete.
7. **Self-delete is blocked:** no member can remove themselves, regardless of role. The delete action is not available on the member's own row (hidden or disabled), and the API rejects the call if attempted directly.
8. **Restore** — available to `admin`/`manager` only, on `removed` members (visible via the removed filter): sets status back to `active`, resets the joined date to the restoration time, and clears the job title. No new invitation is required, and the member's prior role is retained. There is no separate "disabled" state — only `active` and `removed`.
9. **Zero-admin guard (delete):** deleting a member is rejected if it would leave the organization with zero `active` members holding the `admin` role. The delete control for the last admin is disabled with an explanatory message, and the API rejects the call if attempted directly. The guard is enforced atomically at the database/transaction level to prevent race conditions.

### Role Change (inline on list rows)

10. **Role picker on list rows:** `admin` sees a role picker on every member's row. `manager` sees a role picker only on `user` and `viewer` rows — no picker is shown on `admin` or `manager` rows since they have no authority over those members' roles.
11. **Role assignment authority:**
    - An `admin` may change any member's role to any value in the role enum (`admin`, `manager`, `user`, `viewer`).
    - A `manager` may change `user` and `viewer` members to any non-admin role (`manager`/`user`/`viewer`). A `manager` cannot change the role of `admin` or `manager` members, and cannot promote anyone to `admin`.
    - `user` and `viewer` cannot change anyone's role.
12. **Zero-admin guard (role change):** the system must reject any role change that would leave the organization with zero `active` members holding the `admin` role. This applies to demoting the last admin. The role picker is disabled (with an explanatory tooltip) when using it would violate this guard. The guard is enforced atomically at the database/transaction level.
13. **Role changes apply only to `active` members.** Changing the role of a `removed` member is rejected — the member must be restored first.
14. A role change from the list row applies immediately on selection (no separate save action required).

### Read-only & Security

15. **Read-only for user/viewer:** `user` and `viewer` see the list, search, and the removed filter, but no actions menu, no role picker, and no delete/restore controls. The delete/restore/role-change endpoints reject calls from these roles (HTTP 403).
16. Permission checks are enforced on the server (API) for every gated action; hiding a control in the UI is a convenience, not the security boundary.
17. **Concurrency:** last write wins for data updates. No optimistic concurrency / conflict detection.

## UI Notes

- Header tab/title "Active members"; a "Show removed members" checkbox; a search input; a table with Name, Role, Email columns and an Actions column (Actions column present only for admin/manager).
- Role picker is a dropdown on each row (for authorized roles). The picker options: `admin` sees all four roles; `manager` sees `manager`/`user`/`viewer`.
- Each actions menu offers "Delete" for active rows (except the member's own row) and "Restore" for removed rows. A delete opens a confirmation dialog; success shows a toast.
- Removed rows carry a visible "Removed" status badge.
- Empty states: no members match the search → "No members found"; removed filter on with no removed members → active list only.
- Required `data-testid` attributes:
  - `members-list`, `members-search-input`, `show-removed-checkbox`
  - `member-row-{id}`, `member-name-{id}`, `member-email-{id}`, `member-role-badge-{id}`, `member-status-badge-{id}`
  - `member-role-select-{id}` — the role picker (admin sees on all members; manager sees on user/viewer members only)
  - `member-row-actions-{id}` (menu trigger), `member-action-delete`, `member-action-restore`
  - `confirm-delete-dialog`, `confirm-delete-button`, `cancel-delete-button`
  - `toast-member-removed`, `toast-member-restored`
  - `members-empty-state`, `delete-guard-message`, `role-change-guard-message`

## Out of Scope

- Bulk selection / bulk delete.
- Column sorting/pagination controls beyond default name sort (may be added later).
- Editing member fields from the list (done on the detail screen).
- Hard/permanent deletion of members (hard delete only occurs on org-switch via invitation acceptance).

## Test Cases

### TC-04-UNIT-01: Search matching (name/email, partial, case-insensitive)
- **Level:** Unit
- **Preconditions:** a member set including "Alex Kaminski" `<alex.k@acme.com>`, "Alesia Varaniuk" `<alesia@acme.com>`, "Pat Owner" `<pat@acme.com>`.
- **Steps:**
  1. Filter with term `"ale"`.
  2. Filter with term `"ALEX"`.
  3. Filter with term `"pat@"`.
  4. Filter with term `"zzz"`.
- **Expected Result:**
  1. Returns "Alex Kaminski" and "Alesia Varaniuk".
  2. Returns "Alex Kaminski" (case-insensitive).
  3. Returns "Pat Owner" (email match).
  4. Returns an empty set.

### TC-04-UNIT-02: Removed-filter combination logic
- **Level:** Unit
- **Preconditions:** members: 2 active, 1 removed.
- **Steps:**
  1. Compute the visible set with `showRemoved = false`.
  2. Compute the visible set with `showRemoved = true`.
- **Expected Result:**
  1. Only the 2 active members.
  2. All 3 members (active + removed), with the removed one flagged.

### TC-04-UNIT-03: Search with special characters
- **Level:** Unit
- **Preconditions:** member set with normal names/emails.
- **Steps:**
  1. Filter with term `"<script>"`.
  2. Filter with term `"'; DROP TABLE"`.
  3. Filter with term `"@#$%"`.
- **Expected Result:**
  1. Returns an empty set (no crash, no error).
  2. Returns an empty set (no crash, no error).
  3. Returns an empty set (no crash, no error).

### TC-04-UNIT-04: Search applies to removed members when showRemoved=true
- **Level:** Unit
- **Preconditions:** members: "Alex Active" (active), "Alex Removed" (removed).
- **Steps:**
  1. Filter with term `"Alex"` and `showRemoved = false`.
  2. Filter with term `"Alex"` and `showRemoved = true`.
- **Expected Result:**
  1. Returns only "Alex Active".
  2. Returns both "Alex Active" and "Alex Removed".

### TC-04-UNIT-05: Permission-matrix lookup
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. For each role in {admin, manager, user, viewer} and each capability in {view list, invite, delete/restore, change roles of user/viewer, change roles of manager/admin}, call the permission-lookup function.
- **Expected Result:**
  1. Every result matches the permission matrix exactly — in particular:
     - `can(admin, *) == true` for all capabilities.
     - `can(manager, "delete/restore") == true`.
     - `can(manager, "change roles of user/viewer") == true`.
     - `can(manager, "change roles of manager/admin") == false`.
     - `can(user, "delete/restore") == false`.
     - `can(viewer, "view list") == true`.

### TC-04-UNIT-06: Manager role-change authority boundaries
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
  1. ✅ Allowed (user is in manager's scope, target is non-admin).
  2. ✅ Allowed.
  3. ✅ Allowed.
  4. ❌ Rejected (cannot promote to admin).
  5. ❌ Rejected (manager is not in manager's scope).
  6. ❌ Rejected (admin is not in manager's scope).

### TC-04-INT-01: List visibility per role
- **Level:** Integration
- **Preconditions:** org with members; callers available as `admin`, `manager`, `user`, `viewer`.
- **Steps:**
  1. Fetch the members list as each role.
- **Expected Result:**
  1. All four roles receive the member list with name, role, and email for each member.
  2. The response for `admin`/`manager` indicates actions are permitted; for `user`/`viewer` it indicates read-only (no action affordances).

### TC-04-INT-02: Delete is a soft-delete that blocks login and revokes sessions
- **Level:** Integration
- **Preconditions:** as `admin`; target `active` member M who is not the last admin and is not the caller; M has valid credentials and an active session.
- **Steps:**
  1. Call the delete endpoint for M.
  2. Query M's membership status.
  3. Attempt to log in as M with correct credentials.
  4. Attempt to use M's prior session token.
- **Expected Result:**
  1. Success (HTTP 2xx).
  2. M's status is `removed`.
  3. Login as M is rejected with "your account has been deactivated, contact your administrator".
  4. M's prior session is invalid (revoked).

### TC-04-INT-03: Restore returns a removed member to active with reset joined date and cleared job title
- **Level:** Integration
- **Preconditions:** as `admin`; member M is `removed` and previously had role `user`, job title "Engineer", and original joined date `2025-01-01`.
- **Steps:**
  1. Call the restore endpoint for M.
  2. Query M's membership.
- **Expected Result:**
  1. Success (HTTP 2xx).
  2. M's status is `active`, role is still `user`, joined date is the current restoration time (not `2025-01-01`), and job title is empty (cleared). No invitation record was created.

### TC-04-INT-04: Delete blocked when it would remove the last admin
- **Level:** Integration
- **Preconditions:** org has exactly one `active` admin A and other non-admin members; caller is a different `admin` or `manager`.
- **Steps:**
  1. Call the delete endpoint targeting A.
- **Expected Result:**
  1. Rejected (HTTP 4xx) with the "organization must retain at least one admin" error; A remains `active` admin.

### TC-04-INT-05: user/viewer cannot delete or restore
- **Level:** Integration
- **Preconditions:** callers as `user` and `viewer`; a deletable active member M and a removed member R exist.
- **Steps:**
  1. As `user`, call delete for M; call restore for R.
  2. As `viewer`, call delete for M; call restore for R.
- **Expected Result:**
  1. All four calls rejected (HTTP 403); M stays active, R stays removed.

### TC-04-INT-06: Self-delete blocked — admin
- **Level:** Integration
- **Preconditions:** org has two admins A1 and A2.
- **Steps:**
  1. As A1, call the delete endpoint targeting A1 (self).
- **Expected Result:**
  1. Rejected (HTTP 4xx) with a "cannot remove yourself" error; A1 remains active.

### TC-04-INT-07: Self-delete blocked — manager
- **Level:** Integration
- **Preconditions:** org with `manager` M.
- **Steps:**
  1. As M, call the delete endpoint targeting M (self).
- **Expected Result:**
  1. Rejected (HTTP 4xx) with a "cannot remove yourself" error; M remains active.

### TC-04-INT-08: Removing a member revokes their active sessions
- **Level:** Integration
- **Preconditions:** member M has an active session token T.
- **Steps:**
  1. As `admin`, call delete for M.
  2. Make a request using session token T.
- **Expected Result:**
  1. Delete succeeds.
  2. Request with token T is rejected (session invalid / expired).

### TC-04-INT-09: Race condition — two admins simultaneously try to delete the other
- **Level:** Integration
- **Preconditions:** org has exactly two `admin` members A1 and A2 and no other admins.
- **Steps:**
  1. Simultaneously: A1 deletes A2, A2 deletes A1.
- **Expected Result:**
  1. At most one request succeeds; the other is rejected by the zero-admin guard.
  2. The organization retains at least one `active` admin.

### TC-04-INT-10: Only admin may change admin/manager roles
- **Level:** Integration
- **Preconditions:** org with an `admin` (A), a `manager` (M), and a `user` (U); a target member T with role `user`.
- **Steps:**
  1. As M, call the role-change endpoint to set T's role to `manager`.
  2. As U, call the role-change endpoint to set T's role to `manager`.
  3. As A, call the role-change endpoint to set T's role to `manager`.
- **Expected Result:**
  1. Step 1 succeeds; T's role is now `manager` (manager can change user → non-admin).
  2. Step 2 rejected (HTTP 403); T unchanged.
  3. Step 3 succeeds; T's role remains `manager`.

### TC-04-INT-11: Last admin cannot be demoted (zero-admin guard)
- **Level:** Integration
- **Preconditions:** org has exactly one `admin` (the caller) and ≥1 non-admin member.
- **Steps:**
  1. Call the role-change endpoint as the sole admin, setting the caller's own role to `manager`.
- **Expected Result:**
  1. Request rejected with a validation error (HTTP 4xx) whose code/message indicates "organization must retain at least one admin".
  2. The persisted role is unchanged (`admin`).

### TC-04-INT-12: Demoting a non-last admin is allowed
- **Level:** Integration
- **Preconditions:** org has two admins A1 and A2.
- **Steps:**
  1. As A1, change A2's role to `manager`.
- **Expected Result:**
  1. Succeeds; A2 is now `manager`; A1 remains the sole `admin`.

### TC-04-INT-13: Manager changes user's role to manager
- **Level:** Integration
- **Preconditions:** org with `admin` (A), `manager` (M), and `user` (U).
- **Steps:**
  1. As M, call the role-change endpoint to set U's role to `manager`.
  2. Query U's membership.
- **Expected Result:**
  1. Succeeds (HTTP 2xx).
  2. U's role is now `manager`.

### TC-04-INT-14: Manager cannot change another manager's role
- **Level:** Integration
- **Preconditions:** org with `manager` M1 and `manager` M2.
- **Steps:**
  1. As M1, call the role-change endpoint to set M2's role to `user`.
- **Expected Result:**
  1. Rejected (HTTP 403); M2's role unchanged.

### TC-04-INT-15: Manager cannot change admin's role
- **Level:** Integration
- **Preconditions:** org with `admin` A and `manager` M.
- **Steps:**
  1. As M, call the role-change endpoint to set A's role to `manager`.
- **Expected Result:**
  1. Rejected (HTTP 403); A's role unchanged.

### TC-04-INT-16: Cannot change a removed member's role
- **Level:** Integration
- **Preconditions:** org with `admin` A; member R with status `removed` and role `user`.
- **Steps:**
  1. As A, call the role-change endpoint to set R's role to `manager`.
- **Expected Result:**
  1. Rejected (HTTP 4xx) with error indicating member must be restored first.
  2. R's role unchanged.

### TC-04-INT-17: Race condition — concurrent demotion of last two admins
- **Level:** Integration
- **Preconditions:** org has exactly two `admin` members, A1 and A2, and no other admins.
- **Steps:**
  1. Simultaneously (concurrent requests): A1 demotes A2 to `manager`, and A2 demotes A1 to `manager`.
- **Expected Result:**
  1. At most one request succeeds. The other is rejected by the zero-admin guard.
  2. The organization retains at least one `admin` after both requests complete.

### TC-04-E2E-01: Search-as-you-type narrows the list
- **Level:** E2E
- **Preconditions:** logged in as `admin`; members include several names starting with "Al".
- **Steps:**
  1. Open the Members list.
  2. Type "Al" into the search input.
  3. Append "ex" to make "Alex".
  4. Clear the search input.
- **Expected Result:**
  1. After step 2 only members matching "al" remain.
  2. After step 3 only "Alex …" members remain.
  3. After step 4 the full active list returns.
- **Selectors:** `members-list`, `members-search-input`, `member-row-{id}`.

### TC-04-E2E-02: "Show removed" adds removed rows with a distinct badge
- **Level:** E2E
- **Preconditions:** logged in as `admin`; org has ≥1 active and ≥1 removed member.
- **Steps:**
  1. Open the Members list (default active-only).
  2. Tick the "Show removed members" checkbox.
- **Expected Result:**
  1. After step 2 removed members appear alongside active ones, each removed row carrying a "Removed" status badge; active rows keep no badge.
- **Selectors:** `members-list`, `show-removed-checkbox`, `member-row-{id}`, `member-status-badge-{id}`.

### TC-04-E2E-03: Admin deletes an active member, then restores them
- **Level:** E2E
- **Preconditions:** Logged in as `admin`; org has ≥2 admins (zero-admin guard not in play); target member "Alex Kaminski" exists and is `active`.
- **Steps:**
  1. Open Members list; confirm default view shows active members.
  2. Type "Alex" into the search input.
  3. In the "Alex Kaminski" row, open the row actions menu.
  4. Click "Delete".
  5. Confirm in the delete-confirmation dialog.
  6. Clear the search; tick the "Show removed members" checkbox.
  7. In the "Alex Kaminski" row, open the row actions menu and click "Restore".
- **Expected Result:**
  1. After step 2, only rows whose name/email contain "alex" (case-insensitive) remain.
  2. After step 5, "Alex Kaminski" disappears from the active list and a "Member removed" toast appears.
  3. After step 6, "Alex Kaminski" reappears carrying a "Removed" status badge; their menu shows "Restore" (not "Delete").
  4. After step 7, the badge clears; with "Show removed" unticked the member is back in the active list.
- **Selectors:** `members-search-input`, `member-row-{id}`, `member-row-actions-{id}`, `member-action-delete`, `confirm-delete-dialog`, `confirm-delete-button`, `toast-member-removed`, `show-removed-checkbox`, `member-status-badge-{id}`, `member-action-restore`.

### TC-04-E2E-04: user/viewer see the list but no actions menu
- **Level:** E2E
- **Preconditions:** logged in as `user` (repeat as `viewer`); org has several members.
- **Steps:**
  1. Open the Members list.
  2. Use the search box to filter.
  3. Inspect any row for an actions menu or role picker.
- **Expected Result:**
  1. The list and search work.
  2. No `member-row-actions-*` control exists on any row; no `member-role-select-*` control exists; no delete/restore affordance is present.
- **Selectors:** `members-list`, `members-search-input`, `member-row-{id}`, `member-row-actions-{id}` (asserted absent), `member-role-select-{id}` (asserted absent).

### TC-04-E2E-05: Self-delete not available in the UI
- **Level:** E2E
- **Preconditions:** logged in as `admin`; org has ≥2 admins.
- **Steps:**
  1. Open the Members list.
  2. Find the logged-in user's own row.
  3. Inspect the row actions menu (or lack thereof).
- **Expected Result:**
  1. The own row has no "Delete" option in the actions menu (either the menu is absent or the delete action is hidden/disabled).
- **Selectors:** `member-row-{id}`, `member-row-actions-{id}`, `member-action-delete` (asserted absent on own row).

### TC-04-E2E-06: Member list shows name, role badge, and email columns
- **Level:** E2E
- **Preconditions:** logged in as any role; org has several members.
- **Steps:**
  1. Open the Members list.
- **Expected Result:**
  1. Each row displays the member's full name, role badge, and email address.
- **Selectors:** `members-list`, `member-row-{id}`, `member-name-{id}`, `member-role-badge-{id}`, `member-email-{id}`.

### TC-04-E2E-07: Admin changes a member's role via list row picker
- **Level:** E2E
- **Preconditions:** logged in as `admin`; target member "Alex Kaminski" is currently `user`.
- **Steps:**
  1. Open the Members list.
  2. In Alex Kaminski's row, select `manager` from the role picker.
  3. Reload the page.
- **Expected Result:**
  1. After step 2 the role badge updates to `manager`.
  2. After reload the role badge still reads `manager`.
- **Selectors:** `member-role-select-{id}`, `member-role-badge-{id}`.

### TC-04-E2E-08: Manager sees role picker for user/viewer but not for admin/manager members
- **Level:** E2E
- **Preconditions:** logged in as `manager`; org has members with roles `admin`, `manager`, `user`, `viewer`.
- **Steps:**
  1. Open the Members list.
  2. Check for role-select controls on each member row.
- **Expected Result:**
  1. Role-select controls appear only on `user` and `viewer` rows.
  2. No role-select control on `admin` or `manager` rows.
  3. The role picker for user/viewer members does NOT include `admin` as an option.
- **Selectors:** `member-role-select-{id}` (present on user/viewer, absent on admin/manager), `member-role-badge-{id}`.

### TC-04-E2E-09: Non-admin does not see role-change controls
- **Level:** E2E
- **Preconditions:** logged in as `user`; org has several members.
- **Steps:**
  1. Open the Members list.
- **Expected Result:**
  1. Role badges are visible, but no role-select control is present anywhere.
- **Selectors:** `members-list`, `member-role-badge-{id}`, `member-role-select-{id}` (asserted absent).
