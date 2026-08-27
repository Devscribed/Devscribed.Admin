---
id: "04"
title: Member List & Management
routes: ["/org/{orgId}/members"]
api: ["GET /api/organizations/{orgId}/members", "DELETE /api/organizations/{orgId}/members/{memberId}", "POST /api/organizations/{orgId}/members/{memberId}/restore"]
entities: [MembershipStatus]
tags: [member-list, search, soft-delete, restore, remove-member, last-admin-guard, session-revocation]
depends-on: ["01", "02", "03"]
---

# 04 — Member List & Management

## Summary

The Members screen lists an organization's members and is the post-login landing page. `admin` and `manager` roles get a management view where they can search, reveal removed members, soft-delete a member, and restore a previously removed member. `user` and `viewer` roles get the same list read-only, with no per-row actions. Members have exactly two states: `active` and `removed`. Deleting is a soft-delete (moves to `removed`, blocks login, revokes all sessions immediately); restoring returns a removed member directly to `active` without a new invitation, but resets the joined date and clears the job title. The last remaining `admin` cannot be removed, and no member can remove themselves. Role changes are **not** done on this screen — they happen on the member detail page (spec 05).

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

> **Note:** Role-change capabilities are defined in spec 05 (Member Detail).

## Functional Requirements

### List & Search

1. The screen lists members of the current organization. Each row shows the member's full name, role badge, and email. For `admin`/`manager` rows also include a per-row actions menu. Rows link to the member's detail view (`/org/{orgId}/members/{memberId}`).
2. **Default view:** only `active` members are shown, sorted by name ascending.
3. **Search:** a single search box filters the list by case-insensitive partial match against the member's full name **or** email. The search is **server-side** — the client sends a query parameter to the API. Filtering is **debounced at 300 ms** (no API call until the user stops typing for 300 ms). Clearing the box restores the unfiltered list. Search does not match against role or job title.
4. **"Show removed members" checkbox:** unchecked (default) shows `active` members only; checked shows `active` **and** `removed` members together in one list, with removed rows visually marked by a status badge. It is an additive reveal, not a replace-toggle.
5. Search and the removed filter compose: with "Show removed" checked, the search term filters across the combined active+removed set (removed members are also searchable).

### Delete & Restore

6. **Delete (soft-delete)** — available to `admin`/`manager` only, on `active` members other than themselves: sets the member's status to `removed`. A removed member can no longer log in, and all their active sessions are immediately revoked. The member disappears from the default view. A name-specific confirmation dialog precedes the delete.
7. **Self-delete is blocked:** no member can remove themselves, regardless of role. The delete action is not shown in the member's own row actions menu, and the API rejects the call if attempted directly.
8. **Restore** — available to `admin`/`manager` only, on `removed` members (visible via the removed filter): sets status back to `active`, resets the joined date to the restoration time, and clears the job title. No new invitation is required, and the member's prior role is retained. There is no separate "disabled" state — only `active` and `removed`. **No confirmation dialog** — restore happens immediately on click.
9. **Zero-admin guard (delete):** deleting a member is rejected if it would leave the organization with zero `active` members holding the `admin` role. The delete action for the last admin is disabled with an explanatory tooltip, and the API rejects the call if attempted directly. The guard is enforced atomically at the database/transaction level to prevent race conditions.

### Read-only & Security

10. **Read-only for user/viewer:** `user` and `viewer` see the list, search, and the removed filter, but no actions menu and no delete/restore controls. The delete/restore endpoints reject calls from these roles (HTTP 403).
11. Permission checks are enforced on the server (API) for every gated action; hiding a control in the UI is a convenience, not the security boundary.
12. **Concurrency:** last write wins for data updates. No optimistic concurrency / conflict detection.

## Screens

### Members List — admin/manager view

```
┌─────────────────────────────────────────────────────────────┐
│  Active members                                             │
│                                                             │
│  [🔍 Search members...]          ☐ Show removed members     │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Name              │ Role     │ Email         │ Actions  ││
│  ├───────────────────┼──────────┼───────────────┼──────────┤│
│  │ Alex Kaminski     │ user     │ alex@co.com   │  ⋮      ││
│  │ Pat Owner (you)   │ admin    │ pat@co.com    │          ││
│  │ Sam Manager       │ manager  │ sam@co.com    │  ⋮      ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

- Title: "Active members" (always, regardless of filter state).
- Search input with placeholder "Search members...".
- "Show removed members" checkbox (unchecked by default).
- Table columns: Name, Role, Email, Actions. Actions column present only for `admin`/`manager`.
- **Role column: static badge only** — no inline editing. Role changes happen on the member detail page (spec 05).
- Actions column: "⋮" menu trigger per row.
  - Active members (not self): menu contains "Delete".
  - Own row: no actions menu shown (or menu without "Delete" — the delete action is simply not available).
  - Removed members: menu contains "Restore" (no "Delete").
  - Last admin: "Delete" is disabled with tooltip "Cannot remove the last admin".
- Rows link to the member detail page.
- Loading state: skeleton rows matching the table layout.

### Members List — user/viewer view

Same layout but:
- No Actions column.
- Search and "Show removed" filter still work.
- Rows still link to the member detail page (read-only view there too).

### Delete Confirmation Dialog

```
┌─────────────────────────────────────────────┐
│  Remove member                              │
│                                             │
│  Are you sure you want to remove            │
│  {member.fullName}? They will lose access   │
│  immediately.                               │
│                                             │
│            [Cancel]    [Remove]             │
└─────────────────────────────────────────────┘
```

- Title: "Remove member".
- Body: "Are you sure you want to remove {member.fullName}? They will lose access immediately."
- Cancel button: closes dialog, no action.
- Remove button: destructive style (red), triggers the delete API call.

## Flows

### Main Flow: View Members List

1. User navigates to `/org/{orgId}/members`.
2. System fetches members from `GET /api/organizations/{orgId}/members` (default: active only).
3. System renders skeleton rows while loading.
4. System displays the member list table with name, role badge, email per row.
5. For `admin`/`manager`: system renders the Actions column with per-row "⋮" menus.
6. For `user`/`viewer`: system renders read-only list (no Actions column).

### Flow: Navigate to Member Detail

1. User clicks on a member row (anywhere except the actions menu).
2. System navigates to `/org/{orgId}/members/{memberId}`.
3. Member detail page loads (spec 05).

### Flow: Search Members

1. User types into the search input.
2. After 300 ms debounce, system sends `GET /api/organizations/{orgId}/members?search={term}&showRemoved={bool}`.
3. System replaces the list with matching results.
4. If no results match, system shows "No members found" empty state.
5. User clears the search input → system refetches without search param, restoring full list.

### Flow: Toggle "Show Removed" Filter

1. User checks/unchecks the "Show removed members" checkbox.
2. System sends `GET /api/organizations/{orgId}/members?showRemoved={bool}&search={currentSearchTerm}`.
3. When checked: removed members appear with a "Removed" status badge; active members show no badge.
4. When unchecked: only active members shown.

### Flow: Delete Member (admin/manager)

1. User clicks "⋮" on an active member row (not own row) → dropdown opens.
2. User clicks "Delete".
3. System opens confirmation dialog: "Are you sure you want to remove {name}? They will lose access immediately."
4. User clicks "Remove".
5. System sends `DELETE /api/organizations/{orgId}/members/{memberId}`.
6. On success: system closes the dialog, shows toast "Member removed", refetches the list.
7. On error: system closes the dialog, shows error toast with the API error message.

### Alt Flow: Delete Blocked — Self-Delete

- At flow step 1: the "Delete" option is **not shown** in the actions menu for the caller's own row.
- API guard: if `DELETE` is called with `memberId === callerId`, API returns `409 Conflict` with `{ error: "cannot_remove_self", message: "You cannot remove yourself from the organization" }`.

### Alt Flow: Delete Blocked — Last Admin Guard

- At flow step 1: if the target is the only active admin, the "Delete" option is **disabled** with tooltip "Cannot remove the last admin".
- UI hint: the API response from `GET /members` includes an `isLastAdmin` flag per member to drive this.
- API guard: if `DELETE` would leave zero admins, API returns `409 Conflict` with `{ error: "last_admin_guard", message: "Organization must retain at least one admin" }`.

### Flow: Restore Member (admin/manager)

1. User enables "Show removed members" checkbox.
2. User clicks "⋮" on a removed member row → dropdown opens with "Restore" option (no "Delete").
3. User clicks "Restore" (no confirmation dialog).
4. System sends `POST /api/organizations/{orgId}/members/{memberId}/restore`.
5. On success: system shows toast "Member restored", refetches the list.
6. On error: system shows error toast.

## API Contracts

### GET /api/organizations/{orgId}/members

Query params:
- `search` (optional, string) — case-insensitive partial match on name or email.
- `showRemoved` (optional, boolean, default `false`) — when `true`, include removed members.

Response `200`:
```json
{
  "members": [
    {
      "id": "uuid",
      "fullName": "Alex Kaminski",
      "email": "alex@acme.com",
      "role": "user",
      "status": "active",
      "joinedAt": "2025-06-01T...",
      "isLastAdmin": false,
      "isSelf": false
    }
  ],
  "callerRole": "admin"
}
```

- `isLastAdmin`: true if this member is the sole active admin (drives delete disable state).
- `isSelf`: true if this member is the authenticated caller (drives self-delete hide).
- `callerRole`: the authenticated caller's role (drives whether Actions column is rendered).

### DELETE /api/organizations/{orgId}/members/{memberId}

Request: no body.

Success `200`: `{ "success": true }`

Errors:
- `403 Forbidden`: caller is `user`/`viewer` — `{ error: "forbidden", message: "You do not have permission to remove members" }`.
- `404 Not Found`: member not found in this org.
- `409 Conflict` (self-delete): `{ error: "cannot_remove_self", message: "You cannot remove yourself from the organization" }`.
- `409 Conflict` (last admin): `{ error: "last_admin_guard", message: "Organization must retain at least one admin" }`.
- `409 Conflict` (already removed): `{ error: "already_removed", message: "Member is already removed" }`.

Side effects on success:
- Set membership status to `removed`.
- Revoke all active sessions for this member.

### POST /api/organizations/{orgId}/members/{memberId}/restore

Request: no body.

Success `200`: `{ "success": true }`

Errors:
- `403 Forbidden`: caller is `user`/`viewer` — `{ error: "forbidden", message: "You do not have permission to restore members" }`.
- `404 Not Found`: member not found.
- `409 Conflict`: `{ error: "not_removed", message: "Member is not in removed status" }`.

Side effects on success:
- Set status to `active`.
- Reset `joinedAt` to current timestamp.
- Clear `jobTitle` to null/empty.
- Retain existing role.

## Validation Rules

1. **Search input**: no validation needed; special characters are safe because the server uses parameterized queries.
2. **Delete target**: must be active, must not be self, must not be last admin.
3. **Restore target**: must be in `removed` status.
4. **Zero-admin guard**: enforced atomically via database transaction — count active admins, reject if change would make count = 0.

## Error Messages

| Context | Message |
|---|---|
| Delete — self | "You cannot remove yourself from the organization" |
| Delete — last admin | "Organization must retain at least one admin" |
| Delete — already removed | "Member is already removed" |
| Delete — forbidden (user/viewer) | "You do not have permission to remove members" |
| Restore — not removed | "Member is not in removed status" |
| Restore — forbidden | "You do not have permission to restore members" |
| Login as removed member | "Your account has been deactivated. Contact your administrator." |
| Network error (any mutation) | "Something went wrong. Please try again." |
| Search — no results | "No members found" (empty state) |
| Delete confirmation body | "Are you sure you want to remove {name}? They will lose access immediately." |
| Delete guard tooltip | "Cannot remove the last admin" |
| Toast — member removed | "Member removed" |
| Toast — member restored | "Member restored" |

## UI Notes

- Header title "Active members"; a "Show removed members" checkbox; a search input; a table with Name, Role, Email columns and an Actions column (Actions column present only for admin/manager).
- Role column shows a static badge — no inline editing.
- Each actions menu offers "Delete" for active rows (except the member's own row and the last admin) and "Restore" for removed rows. Delete opens a confirmation dialog; success shows a toast. Restore has no confirmation.
- Removed rows carry a visible "Removed" status badge.
- Loading state: skeleton rows matching the table layout.
- Empty states: no members match the search → "No members found".
- Data refresh: refetch the full member list from the server after every mutation (delete/restore). No optimistic updates.
- Required `data-testid` attributes:
  - `members-list`, `members-search-input`, `show-removed-checkbox`
  - `member-row-{id}`, `member-name-{id}`, `member-email-{id}`, `member-role-badge-{id}`, `member-status-badge-{id}`
  - `member-row-actions-{id}` (menu trigger), `member-action-delete`, `member-action-restore`
  - `confirm-delete-dialog`, `confirm-delete-button`, `cancel-delete-button`
  - `toast-member-removed`, `toast-member-restored`
  - `members-empty-state`, `delete-guard-message`
  - `members-loading-skeleton`

## Out of Scope

- **Role changes** — handled on the member detail page (spec 05).
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
  1. For each role in {admin, manager, user, viewer} and each capability in {view list, invite, delete/restore}, call the permission-lookup function.
- **Expected Result:**
  1. Every result matches the permission matrix exactly — in particular:
     - `can(admin, *) == true` for all capabilities.
     - `can(manager, "delete/restore") == true`.
     - `can(user, "delete/restore") == false`.
     - `can(viewer, "view list") == true`.

### TC-04-UNIT-06: Debounced search fires after 300 ms pause
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Simulate rapid typing of 5 characters over 100 ms total.
  2. Wait 300 ms after the last keystroke.
- **Expected Result:**
  1. No API call is made during the typing burst.
  2. Exactly one API call fires after the 300 ms debounce window.

### TC-04-INT-01: List visibility per role
- **Level:** Integration
- **Preconditions:** org with members; callers available as `admin`, `manager`, `user`, `viewer`.
- **Steps:**
  1. Fetch the members list as each role.
- **Expected Result:**
  1. All four roles receive the member list with name, role, and email for each member.
  2. The response `callerRole` field matches the requesting user's role.

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
  1. Rejected (HTTP 409) with `{ error: "last_admin_guard" }` and the "organization must retain at least one admin" message; A remains `active` admin.

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
  1. Rejected (HTTP 409) with `{ error: "cannot_remove_self" }`; A1 remains active.

### TC-04-INT-07: Self-delete blocked — manager
- **Level:** Integration
- **Preconditions:** org with `manager` M.
- **Steps:**
  1. As M, call the delete endpoint targeting M (self).
- **Expected Result:**
  1. Rejected (HTTP 409) with `{ error: "cannot_remove_self" }`; M remains active.

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
  1. Exactly one request succeeds. The other is **rejected**, and which rejection it gets
     depends on where the winner's commit lands relative to the loser's authorization:
     - `409 last_admin_guard` — the loser was still an active admin when it was authorized,
       reached the zero-admin guard inside the transaction, and was refused there.
     - `403` — the winner had already committed by the time the loser's membership was read,
       so the loser was no longer a member of the organization at all (a session whose
       membership has been removed can also surface as `401`, since the removal rotates the
       security stamp).
     Both are correct, and neither is a race the guard failed to catch: the loser is refused
     either way. A test must assert *rejection*, not one specific status.
  2. The organization retains at least one `active` admin.

### TC-04-INT-10: Server-side search with query parameters
- **Level:** Integration
- **Preconditions:** org with members "Alex Kaminski" `<alex@acme.com>` and "Pat Owner" `<pat@acme.com>`.
- **Steps:**
  1. `GET /api/organizations/{orgId}/members?search=alex`.
  2. `GET /api/organizations/{orgId}/members?search=zzz`.
- **Expected Result:**
  1. Returns only "Alex Kaminski".
  2. Returns an empty list.

### TC-04-INT-11: showRemoved query parameter includes removed members
- **Level:** Integration
- **Preconditions:** org with 2 active and 1 removed member.
- **Steps:**
  1. `GET /api/organizations/{orgId}/members` (default).
  2. `GET /api/organizations/{orgId}/members?showRemoved=true`.
- **Expected Result:**
  1. Returns 2 members (active only).
  2. Returns 3 members (active + removed).

### TC-04-E2E-01: Search-as-you-type narrows the list (with debounce)
- **Level:** E2E
- **Preconditions:** logged in as `admin`; members include several names starting with "Al".
- **Steps:**
  1. Open the Members list.
  2. Type "Al" into the search input.
  3. Wait for debounce (300 ms) and list to update.
  4. Append "ex" to make "Alex".
  5. Wait for debounce and list to update.
  6. Clear the search input.
- **Expected Result:**
  1. After step 3 only members matching "al" remain.
  2. After step 5 only "Alex …" members remain.
  3. After step 6 the full active list returns.
- **Selectors:** `members-list`, `members-search-input`, `member-row-{id}`.

### TC-04-E2E-02: "Show removed" adds removed rows with a distinct badge
- **Level:** E2E
- **Preconditions:** logged in as `admin`; org has ≥1 active and ≥1 removed member.
- **Steps:**
  1. Open the Members list (default active-only).
  2. Tick the "Show removed members" checkbox.
- **Expected Result:**
  1. After step 2 removed members appear alongside active ones, each removed row carrying a "Removed" status badge; active rows carry no badge.
- **Selectors:** `members-list`, `show-removed-checkbox`, `member-row-{id}`, `member-status-badge-{id}`.

### TC-04-E2E-03: Admin deletes an active member, then restores them
- **Level:** E2E
- **Preconditions:** Logged in as `admin`; org has ≥2 admins (zero-admin guard not in play); target member "Alex Kaminski" exists and is `active`.
- **Steps:**
  1. Open Members list; confirm default view shows active members.
  2. Type "Alex" into the search input.
  3. In the "Alex Kaminski" row, open the row actions menu.
  4. Click "Delete".
  5. Confirm in the delete-confirmation dialog by clicking "Remove".
  6. Clear the search; tick the "Show removed members" checkbox.
  7. In the "Alex Kaminski" row, open the row actions menu and click "Restore".
- **Expected Result:**
  1. After step 2 (and debounce), only rows whose name/email contain "alex" remain.
  2. After step 5, "Alex Kaminski" disappears from the active list and a "Member removed" toast appears.
  3. After step 6, "Alex Kaminski" reappears carrying a "Removed" status badge; their menu shows "Restore" (not "Delete").
  4. After step 7, a "Member restored" toast appears; the badge clears; with "Show removed" unticked the member is back in the active list.
- **Selectors:** `members-search-input`, `member-row-{id}`, `member-row-actions-{id}`, `member-action-delete`, `confirm-delete-dialog`, `confirm-delete-button`, `toast-member-removed`, `show-removed-checkbox`, `member-status-badge-{id}`, `member-action-restore`, `toast-member-restored`.

### TC-04-E2E-04: user/viewer see the list but no actions menu
- **Level:** E2E
- **Preconditions:** logged in as `user` (repeat as `viewer`); org has several members.
- **Steps:**
  1. Open the Members list.
  2. Use the search box to filter.
  3. Inspect any row for an actions menu.
- **Expected Result:**
  1. The list and search work.
  2. No `member-row-actions-*` control exists on any row; no delete/restore affordance is present.
- **Selectors:** `members-list`, `members-search-input`, `member-row-{id}`, `member-row-actions-{id}` (asserted absent).

### TC-04-E2E-05: Self-delete not available in the UI
- **Level:** E2E
- **Preconditions:** logged in as `admin`; org has ≥2 admins.
- **Steps:**
  1. Open the Members list.
  2. Find the logged-in user's own row.
  3. Inspect the row actions menu (or lack thereof).
- **Expected Result:**
  1. The own row has no "Delete" option in the actions menu (either the menu is absent or the delete action is hidden).
- **Selectors:** `member-row-{id}`, `member-row-actions-{id}`, `member-action-delete` (asserted absent on own row).

### TC-04-E2E-06: Member list shows name, role badge, and email columns
- **Level:** E2E
- **Preconditions:** logged in as any role; org has several members.
- **Steps:**
  1. Open the Members list.
- **Expected Result:**
  1. Each row displays the member's full name, role badge, and email address.
- **Selectors:** `members-list`, `member-row-{id}`, `member-name-{id}`, `member-role-badge-{id}`, `member-email-{id}`.

### TC-04-E2E-07: Member row links to detail page
- **Level:** E2E
- **Preconditions:** logged in as any role; org has members.
- **Steps:**
  1. Open the Members list.
  2. Click on a member row.
- **Expected Result:**
  1. Browser navigates to the member detail page (`/org/{orgId}/members/{memberId}`).
- **Selectors:** `member-row-{id}`.

### TC-04-E2E-08: No role-change controls on list page
- **Level:** E2E
- **Preconditions:** logged in as `admin`.
- **Steps:**
  1. Open the Members list.
  2. Inspect all rows.
- **Expected Result:**
  1. Role badges are visible but no `member-role-select-*` controls exist on any row.
- **Selectors:** `member-role-badge-{id}`, `member-role-select-{id}` (asserted absent).

### TC-04-E2E-09: Skeleton loading state shown while fetching
- **Level:** E2E
- **Preconditions:** logged in as any role.
- **Steps:**
  1. Navigate to the Members list.
- **Expected Result:**
  1. Skeleton rows are briefly visible before the member data loads.
- **Selectors:** `members-loading-skeleton`.
