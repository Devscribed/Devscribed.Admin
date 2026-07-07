# 04 — User Invitation

## Summary

An organization grows by inviting people. An `admin` or `manager` enters an email address and picks the role the invitee will receive, and the system emails a tokenized invitation link that expires after 7 days. When the invitee accepts, they set a password (if they are new) and become an `active` member with the role chosen at invite time. Because an account belongs to exactly one organization at a time, accepting an invitation while already a member of another organization moves the membership to the new organization.

## Actors & Preconditions

- **Actors:** the **inviter** (`admin` or `manager` — see the permission matrix in [03-roles-and-permissions](03-roles-and-permissions.md)) and the **invitee** (email recipient).
- **Preconditions:** the inviter is authenticated in an organization and holds a role permitted to invite. The role picker offering the invitee's role is available only to `admin` (only admins may assign roles, per 03); a `manager` invites at a default non-admin role (see requirement 3).

## Functional Requirements

1. An inviter provides an invitee email and a target role. The email must be syntactically valid; the role must be a member of the role enum.
2. On invite creation the system generates a unique, unguessable token, stores a pending invitation (email, target role, inviting org, issued time, expiry, status `pending`), and dispatches an email containing a link embedding the token.
3. The invitation link expires 7 days after issuance. After expiry the invitation is no longer acceptable.
4. **Role selection authority:** only an `admin` may choose an arbitrary role (including `admin`) for the invitation. A `manager` may invite, but the invitation's role is fixed to a non-admin default (`user`) and the manager cannot escalate it. (This keeps role assignment admin-only per 03.)
5. Accepting a **valid, non-expired, unused** invitation:
   - If the email has no account yet, the invitee sets a first/last name and password (password policy per [02-authentication-login](02-authentication-login.md)), an account is created, and an `active` membership in the inviting org is created with the invitation's role.
   - If the email already has an account, accepting attaches an `active` membership in the inviting org with the invitation's role.
6. **Org-switch on accept (single-org-per-user):** if the accepting account is currently an `active` member of a different organization, that prior membership is removed and the new membership in the inviting org is created. The account ends up in exactly one organization — the inviting one.
7. Accepting marks the invitation `used`; a used or expired invitation cannot be accepted again.
8. Re-inviting an email that already has a `pending` invitation to the same org supersedes/refreshes the prior invitation (the old token is invalidated); there is at most one live pending invitation per (email, org).
9. Inviting an email that is already an `active` member of the **same** organization is rejected with a clear "already a member" error.

## UI Notes

- **Invite control** (on the Members list, admin/manager only): an "Invite member" button opening a form with an email input and — for admins — a role picker.
- **Accept-invitation screen** (opened from the email link): shows the inviting organization name; for new accounts, first/last name + password fields; an accept/submit button; and an error state for expired/used/invalid tokens.
- Required `data-testid` attributes:
  - `invite-open-button`, `invite-form`, `invite-email-input`, `invite-role-select`, `invite-submit-button`, `invite-error-message`, `toast-invite-sent`
  - `accept-invite-screen`, `accept-invite-org-name`, `accept-first-name-input`, `accept-last-name-input`, `accept-password-input`, `accept-submit-button`, `accept-invite-error` (expired/used/invalid)

## Out of Scope

- Bulk / CSV invitations.
- Invitation revocation UI (may be added later; requirement 8 covers supersession).
- Reminder / re-send scheduling.
- Approving join requests initiated by the invitee (invites are inviter-initiated only).

## Test Cases

### TC-04-UNIT-01: Invite payload validation
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate `{ email: "not-an-email", role: "user" }`.
  2. Validate `{ email: "new@acme.com", role: "superuser" }`.
  3. Validate `{ email: "new@acme.com", role: "manager" }`.
- **Expected Result:**
  1. Rejected — invalid email format.
  2. Rejected — role not in enum.
  3. Valid.

### TC-04-UNIT-02: Token expiry is issued time + 7 days
- **Level:** Unit
- **Preconditions:** an invitation issued at time `T`.
- **Steps:**
  1. Evaluate acceptability at `T + 6 days 23 hours`.
  2. Evaluate acceptability at `T + 7 days 1 minute`.
- **Expected Result:**
  1. Still acceptable at +6d23h.
  2. Expired at +7d1m.

### TC-04-INT-01: Invite creates a pending record and dispatches an email
- **Level:** Integration
- **Preconditions:** authenticated as `admin` of Org A; `new@acme.com` is not a member of Org A.
- **Steps:**
  1. Call the invite endpoint with `new@acme.com` and role `user`.
  2. Inspect stored invitations and the test mail sink.
- **Expected Result:**
  1. A `pending` invitation exists for (`new@acme.com`, Org A, role `user`) with a future expiry.
  2. One email addressed to `new@acme.com` containing the token link was dispatched.

### TC-04-INT-02: Accepting an expired invitation is rejected
- **Level:** Integration
- **Preconditions:** a `pending` invitation for `new@acme.com` whose expiry is in the past.
- **Steps:**
  1. Call the accept endpoint with that token.
- **Expected Result:**
  1. Rejected (HTTP 4xx) with an "invitation expired" error; no account/membership created.

### TC-04-INT-03: Accepting an already-used invitation is rejected
- **Level:** Integration
- **Preconditions:** an invitation that was already accepted once (status `used`).
- **Steps:**
  1. Call the accept endpoint again with the same token.
- **Expected Result:**
  1. Rejected (HTTP 4xx) with an "invitation no longer valid" error; no duplicate membership created.

### TC-04-INT-04: Accepting an invite while already a member of another org moves the membership
- **Level:** Integration
- **Preconditions:** user `u@x.com` is an `active` member of Org A; a valid (non-expired) invite to Org B exists for `u@x.com`.
- **Steps:**
  1. Call the accept-invite endpoint with Org B's token, authenticated as `u@x.com`.
- **Expected Result:**
  1. `u@x.com`'s Org A membership is removed (single-org-per-user honored).
  2. A new `active` membership in Org B is created with the role encoded in the invite.
  3. The Org B invite token is marked used and cannot be reused.

### TC-04-INT-05: Manager cannot invite at admin role
- **Level:** Integration
- **Preconditions:** authenticated as `manager` of Org A.
- **Steps:**
  1. Call the invite endpoint with `new@acme.com` and role `admin`.
- **Expected Result:**
  1. Either rejected (HTTP 403) or coerced to the non-admin default `user`; in no case is a pending invitation for role `admin` created by a manager.

### TC-04-E2E-01: Admin invites, invitee accepts and lands in the org
- **Level:** E2E
- **Preconditions:** logged in as `admin` of "Acme Inc"; `new@acme.com` has no account.
- **Steps:**
  1. On the Members list, click "Invite member".
  2. Enter `new@acme.com`, select role `user`, submit.
  3. Open the invitation link from the mail sink.
  4. On the accept screen, enter first name "New", last name "Hire", a valid password, and submit.
- **Expected Result:**
  1. After step 2 an "invitation sent" confirmation appears.
  2. The accept screen (step 3) shows "Acme Inc" as the inviting organization.
  3. After step 4 the invitee is authenticated inside "Acme Inc"; the Members list now includes "New Hire" as an active `user`.
- **Selectors:** `invite-open-button`, `invite-email-input`, `invite-role-select`, `invite-submit-button`, `toast-invite-sent`, `accept-invite-screen`, `accept-invite-org-name`, `accept-first-name-input`, `accept-last-name-input`, `accept-password-input`, `accept-submit-button`, `members-list`, `member-row-{id}`.

### TC-04-E2E-02: Expired link shows an explicit error
- **Level:** E2E
- **Preconditions:** an expired invitation link for `late@acme.com`.
- **Steps:**
  1. Open the expired invitation link.
- **Expected Result:**
  1. The accept screen shows an explicit "this invitation has expired" error and offers no password/accept fields.
- **Selectors:** `accept-invite-screen`, `accept-invite-error`.

## Open Questions / Assumptions

- Assumes an emailing mechanism / test mail sink shared with [02-authentication-login](02-authentication-login.md).
- Assumes the org-switch on accept is silent for the invitee beyond landing in the new org (no extra "you left Org A" confirmation in this release).
