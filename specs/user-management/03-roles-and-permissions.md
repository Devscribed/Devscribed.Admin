# 03 — Roles & Permissions

## Summary

Every membership in an organization carries exactly one role from a fixed set: `admin`, `manager`, `user`, `viewer`. This spec defines those roles, the permission matrix governing the user-management surface, who may change roles, and the invariant that an organization must always retain at least one `admin`. All role-gated behavior in later specs (invitation, member list, member detail) references the rules defined here.

## Actors & Preconditions

- **Actors:** members of an organization, distinguished by role.
- **Preconditions:** an organization exists with at least one `admin` (guaranteed by [01-organization-creation](01-organization-creation.md)).

## Functional Requirements

1. The role set is a closed enum with exactly four values: `admin`, `manager`, `user`, `viewer`. Every active membership has exactly one role.
2. Role purposes:
   - `admin` — full control of the organization and its members, including role assignment.
   - `manager` — operational management of members (invite, delete, restore) but **cannot** change roles.
   - `user` — internal team member; read-only access to the member directory.
   - `viewer` — client-facing role; read-only, intended to eventually be scoped to a single project's members/reports.
3. **Permission matrix** for the user-management surface:

   | Capability | admin | manager | user | viewer |
   |---|---|---|---|---|
   | View members list, search, filter removed | ✅ | ✅ | ✅ (read-only) | ✅ (read-only) |
   | View member detail (About) | ✅ | ✅ | ✅ (read-only) | ✅ (read-only) |
   | Edit own Job title / own Account settings | ✅ | ✅ | ✅ | ✅ |
   | Invite members | ✅ | ✅ | ❌ | ❌ |
   | Delete / Restore members | ✅ | ✅ | ❌ | ❌ |
   | Assign / change member roles | ✅ | ❌ | ❌ | ❌ |

4. Only an `admin` may assign or change another member's role. This includes selecting the role attached to an invitation (see [04-user-invitation](04-user-invitation.md)).
5. An organization may have any number of `admin` members simultaneously.
6. **Zero-admin guard:** the system must reject any operation that would leave the organization with zero `active` members holding the `admin` role. This applies to: demoting the last admin, and deleting/removing the last admin (see [05-member-list-management](05-member-list-management.md)).
7. Permission checks are enforced on the server (API) for every gated action; hiding a control in the UI is a convenience, not the security boundary. A `user`/`viewer` calling a delete/restore/role endpoint directly is rejected.
8. `viewer` behaves identically to `user` on the user-management surface in this release. The project-scoping restriction for `viewer` is a known future extension and is not enforced here.

## UI Notes

- Role is displayed wherever a member is shown (list rows and member detail). Role selection controls (invite role picker, change-role control) are visible only to `admin`.
- The role-change control is disabled (with an explanatory tooltip) when using it would violate the zero-admin guard — e.g. the sole admin cannot demote themselves.
- Required `data-testid` attributes:
  - `member-role-badge-{id}` — the role shown on a member row / detail
  - `member-role-select-{id}` — the admin-only role picker
  - `role-change-guard-message` — the "must retain at least one admin" explanation

## Out of Scope

- Fine-grained permissions for domains other than user-management (projects, reports, payments) — deferred to those future specs.
- Custom / user-defined roles.
- Project-scoped visibility for `viewer` (named as future work here).

## Test Cases

### TC-03-UNIT-01: Permission-matrix lookup for every cell
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. For each role in {admin, manager, user, viewer} and each capability in {view list, view detail, edit own settings, invite, delete/restore, change roles}, call the permission-lookup function `can(role, capability)`.
- **Expected Result:**
  1. Every result matches the matrix in requirement 3 exactly — in particular: `can(manager, "delete/restore") == true`, `can(manager, "change roles") == false`, `can(user, "delete/restore") == false`, `can(viewer, "view list") == true`, `can(admin, *) == true`.

### TC-03-INT-01: Only admin may change roles
- **Level:** Integration
- **Preconditions:** org with an `admin` (A), a `manager` (M), and a `user` (U); a target member T.
- **Steps:**
  1. As M, call the role-change endpoint to set T's role to `manager`.
  2. As U, call the role-change endpoint to set T's role to `manager`.
  3. As A, call the role-change endpoint to set T's role to `manager`.
- **Expected Result:**
  1. Step 1 rejected (HTTP 403); T unchanged.
  2. Step 2 rejected (HTTP 403); T unchanged.
  3. Step 3 succeeds; T's role is now `manager`.

### TC-03-INT-02: Last admin cannot remove their own admin rights (zero-admin guard)
- **Level:** Integration
- **Preconditions:** org has exactly one `admin` (the caller) and ≥1 non-admin member.
- **Steps:**
  1. Call the role-change endpoint as the sole admin, setting the caller's own role to `manager`.
- **Expected Result:**
  1. Request rejected with a validation error (HTTP 4xx) whose code/message indicates "organization must retain at least one admin".
  2. The persisted role is unchanged (`admin`).

### TC-03-INT-03: Demoting a non-last admin is allowed
- **Level:** Integration
- **Preconditions:** org has two admins A1 and A2.
- **Steps:**
  1. As A1, change A2's role to `manager`.
- **Expected Result:**
  1. Succeeds; A2 is now `manager`; A1 remains the sole `admin`.

### TC-03-E2E-01: Non-admin does not see role-change controls
- **Level:** E2E
- **Preconditions:** logged in as `manager`; org has several members.
- **Steps:**
  1. Open the Members list and a member's detail.
- **Expected Result:**
  1. Role badges are visible, but no role-select control is present anywhere for the manager.
- **Selectors:** `members-list`, `member-role-badge-{id}`, `member-role-select-{id}` (asserted absent).

### TC-03-E2E-02: Admin changes another member's role and it persists
- **Level:** E2E
- **Preconditions:** logged in as `admin`; target member "Alex Kaminski" is currently `user`.
- **Steps:**
  1. Open Alex Kaminski's detail (or the list row control).
  2. Change the role to `manager` via the role picker.
  3. Reload the page.
- **Expected Result:**
  1. After step 2 a success indication appears and the role badge updates to `manager`.
  2. After reload the role badge still reads `manager`.
- **Selectors:** `member-role-select-{id}`, `member-role-badge-{id}`.

## Open Questions / Assumptions

- Assumes role is a single value per membership (not a set of roles).
- Assumes the zero-admin guard counts only `active` admins (a `removed` admin does not satisfy the invariant).
