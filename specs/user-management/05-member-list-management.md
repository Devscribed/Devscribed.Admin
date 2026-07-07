# 05 — Member List & Management

## Summary

The Members screen lists an organization's members. `admin` and `manager` roles get a management view where they can search, reveal removed members, soft-delete a member, and restore a previously removed member. `user` and `viewer` roles get the same list read-only, with no per-row actions. Members have exactly two states: `active` and `removed`. Deleting is a soft-delete (moves to `removed`, blocks login); restoring returns a removed member directly to `active` without a new invitation. The last remaining `admin` cannot be removed.

## Actors & Preconditions

- **Actors:** `admin`/`manager` (full actions) and `user`/`viewer` (read-only), per the permission matrix in [03-roles-and-permissions](03-roles-and-permissions.md).
- **Preconditions:** an organization with one or more members exists (created by [01-organization-creation](01-organization-creation.md) and grown via [04-user-invitation](04-user-invitation.md)).

## Functional Requirements

1. The screen lists members of the current organization. Each row shows at least the member's full name and (for `admin`/`manager`) a per-row actions menu. Rows link to the member's detail (see [06-member-detail-about](06-member-detail-about.md)).
2. **Default view:** only `active` members are shown, sorted by name.
3. **Search:** a single search box filters the list live (on each keystroke) by case-insensitive partial match against the member's full name **or** email. Clearing the box restores the unfiltered list.
4. **"Show removed members" checkbox:** unchecked (default) shows `active` members only; checked shows `active` **and** `removed` members together in one list, with removed rows visually marked by a status badge. It is an additive reveal, not a replace-toggle.
5. Search and the removed filter compose: with "Show removed" checked, the search term filters across the combined active+removed set.
6. **Delete (soft-delete)** — available to `admin`/`manager` only, on `active` members: sets the member's status to `removed`. A removed member can no longer log in (enforced in [02-authentication-login](02-authentication-login.md)) and disappears from the default view. A confirmation dialog precedes the delete.
7. **Restore** — available to `admin`/`manager` only, on `removed` members (visible via the removed filter): sets status back to `active`. No new invitation is required, and the member's prior role is retained. There is no separate "disabled" state — only `active` and `removed`.
8. **Zero-admin guard:** deleting a member is rejected if it would leave the organization with zero `active` admins (consistent with the guard in [03-roles-and-permissions](03-roles-and-permissions.md)). The delete control for the last admin is disabled with an explanatory message, and the API rejects the call if attempted directly.
9. **Read-only for user/viewer:** `user` and `viewer` see the list, search, and the removed filter, but no actions menu and no delete/restore controls. The delete/restore endpoints reject calls from these roles (HTTP 403).
10. Role changes are **not** performed from this screen; assigning/changing roles is admin-only and handled per [03-roles-and-permissions](03-roles-and-permissions.md).

## UI Notes

- Header tab/title "Active members"; a "Show removed members" checkbox; a search input; a table with a Name column and an Actions column (Actions column present only for admin/manager).
- Each actions menu offers "Delete" for active rows and "Restore" for removed rows. A delete opens a confirmation dialog; success shows a toast.
- Removed rows carry a visible "Removed" status badge.
- Empty states: no members match the search → "No members found"; removed filter on with no removed members → active list only.
- Required `data-testid` attributes:
  - `members-list`, `members-search-input`, `show-removed-checkbox`
  - `member-row-{id}`, `member-name-{id}`, `member-status-badge-{id}`
  - `member-row-actions-{id}` (menu trigger), `member-action-delete`, `member-action-restore`
  - `confirm-delete-dialog`, `confirm-delete-button`, `cancel-delete-button`
  - `toast-member-removed`, `toast-member-restored`
  - `members-empty-state`, `delete-guard-message` (last-admin explanation)

## Out of Scope

- Bulk selection / bulk delete.
- Column sorting/pagination controls beyond default name sort (may be added later).
- Editing member fields from the list (done on the detail screen, [06-member-detail-about](06-member-detail-about.md)).
- Hard/permanent deletion of members.

## Test Cases

### TC-05-UNIT-01: Search matching (name/email, partial, case-insensitive)
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

### TC-05-UNIT-02: Removed-filter combination logic
- **Level:** Unit
- **Preconditions:** members: 2 active, 1 removed.
- **Steps:**
  1. Compute the visible set with `showRemoved = false`.
  2. Compute the visible set with `showRemoved = true`.
- **Expected Result:**
  1. Only the 2 active members.
  2. All 3 members (active + removed), with the removed one flagged.

### TC-05-INT-01: List visibility per role
- **Level:** Integration
- **Preconditions:** org with members; callers available as `admin`, `manager`, `user`, `viewer`.
- **Steps:**
  1. Fetch the members list as each role.
- **Expected Result:**
  1. All four roles receive the member list.
  2. The response for `admin`/`manager` indicates actions are permitted; for `user`/`viewer` it indicates read-only (no action affordances).

### TC-05-INT-02: Delete is a soft-delete that blocks login
- **Level:** Integration
- **Preconditions:** as `admin`; target `active` member M who is not the last admin; M has valid credentials.
- **Steps:**
  1. Call the delete endpoint for M.
  2. Query M's membership status.
  3. Attempt to log in as M (cross-check with 02).
- **Expected Result:**
  1. Success (HTTP 2xx).
  2. M's status is `removed`.
  3. Login as M is rejected.

### TC-05-INT-03: Restore returns a removed member to active without a new invite
- **Level:** Integration
- **Preconditions:** as `admin`; member M is `removed` and previously had role `user`.
- **Steps:**
  1. Call the restore endpoint for M.
  2. Query M's membership.
- **Expected Result:**
  1. Success (HTTP 2xx).
  2. M's status is `active` and role is still `user`; no invitation record was created.

### TC-05-INT-04: Delete blocked when it would remove the last admin
- **Level:** Integration
- **Preconditions:** org has exactly one `active` admin A and other non-admin members.
- **Steps:**
  1. As A, call the delete endpoint targeting A (self) — or another admin attempts to delete the sole admin.
- **Expected Result:**
  1. Rejected (HTTP 4xx) with the "organization must retain at least one admin" error; A remains `active` admin.

### TC-05-INT-05: user/viewer cannot delete or restore
- **Level:** Integration
- **Preconditions:** callers as `user` and `viewer`; a deletable active member M and a removed member R exist.
- **Steps:**
  1. As `user`, call delete for M; call restore for R.
  2. As `viewer`, call delete for M; call restore for R.
- **Expected Result:**
  1. All four calls rejected (HTTP 403); M stays active, R stays removed.

### TC-05-E2E-01: Search-as-you-type narrows the list
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

### TC-05-E2E-02: "Show removed" adds removed rows with a distinct badge
- **Level:** E2E
- **Preconditions:** logged in as `admin`; org has ≥1 active and ≥1 removed member.
- **Steps:**
  1. Open the Members list (default active-only).
  2. Tick the "Show removed members" checkbox.
- **Expected Result:**
  1. After step 2 removed members appear alongside active ones, each removed row carrying a "Removed" status badge; active rows keep no badge.
- **Selectors:** `members-list`, `show-removed-checkbox`, `member-row-{id}`, `member-status-badge-{id}`.

### TC-05-E2E-03: Admin deletes an active member, then restores them
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

### TC-05-E2E-04: user/viewer see the list but no actions menu
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

## Open Questions / Assumptions

- Assumes name sort is by full name ascending; pagination is deferred.
- Assumes "Removed" is the only non-active state (delete/enable both operate on the active↔removed axis).
