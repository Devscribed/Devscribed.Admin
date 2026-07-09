# 03 — User Invitation

## Summary

An organization grows by inviting people. An `admin` or `manager` enters an email address and picks the role the invitee will receive, and the system emails a tokenized invitation link that expires after 7 days. When the invitee accepts, they confirm their identity (password for existing accounts, or create credentials for new accounts) and become an `active` member with the role chosen at invite time. Because an account belongs to exactly one organization at a time, accepting an invitation while already a member of another organization hard-deletes all data from the old organization.

## Actors & Preconditions

- **Actors:** the **inviter** (`admin` or `manager`) and the **invitee** (email recipient).
- **Preconditions:** the inviter is authenticated in an organization and holds a role permitted to invite.

## Functional Requirements

1. An inviter provides an invitee email and a target role. The email must be syntactically valid and is normalized to lowercase. The role must be a member of the role enum (`admin`, `manager`, `user`, `viewer`). Self-invitation (inviter's own email, case-insensitive after normalization) is rejected with a clear error.
2. On invite creation the system generates a unique, unguessable token, stores a pending invitation (email, target role, inviting org, inviter's membership ID, issued time, expiry, status `pending`), and dispatches an email containing a link embedding the token.
3. The invitation link expires 7 days after issuance. After expiry the invitation is no longer acceptable.
4. **Role selection authority:** an `admin` may choose any role (including `admin`) for the invitation. A `manager` sees a role picker with `manager`/`user`/`viewer` (no `admin` option). A `manager` cannot select or submit `admin` as the invitation role — the API rejects it.
5. Accepting a **valid, non-expired, unused** invitation:
   - **New account (no existing account for that email):** the invitee sets a first/last name and password, an account is created, and an `active` membership in the inviting org is created with the invitation's role. **Name validation:** first name and last name are required, trimmed, 1–50 characters, letters/hyphens/apostrophes/spaces only. **Password policy:** minimum 8 characters, maximum 128 characters, at least one letter and one digit. Timezone is auto-detected from the browser.
   - **Existing account:** the invitee enters their password to confirm identity. On correct password, an `active` membership in the inviting org is created with the invitation's role.
   - **Removed member of the same org:** if the email has an account with a `removed` membership in the inviting org, accepting the invitation restores the membership to `active` with the invitation's role (not the original role), clears the job title, and resets the joined date to the acceptance time.
6. **Org-switch on accept (single-org-per-user):** if the accepting account is currently a member (active or removed) of a different organization, that prior membership and all associated data (job title, etc.) are **hard-deleted** — not soft-deleted. The account ends up in exactly one organization — the inviting one. If the accepting user was the last `admin` of their old organization, a warning is displayed ("your old organization will have no administrator") and an explicit "I understand" confirmation is required, but acceptance is still allowed. The old org is left intact but admin-less — other members remain but cannot manage it.
7. Accepting marks the invitation `used`; a used or expired invitation cannot be accepted again.
8. Re-inviting an email that already has a `pending` invitation to the same org supersedes/refreshes the prior invitation (the old token is invalidated); there is at most one live pending invitation per (email, org).
9. Inviting an email that is already an `active` member of the **same** organization is rejected with a clear "already a member" error.
10. **Inviter removal invalidation:** if the inviter is removed from the organization (their membership status becomes `removed`), all their pending invitations are invalidated. The invitee receives an error if they try to accept an invalidated invitation.

## UI Notes

- **Entry point:** an "Invite member" button on the Members screen, visible to `admin` and `manager` only.
- **Invite form:** email input and a role picker. `admin` sees all four roles (`admin`, `manager`, `user`, `viewer`); `manager` sees `manager`/`user`/`viewer` (no `admin`).
- **Accept-invitation screen** (opened from the email link): shows the inviting organization name. For new accounts: first/last name + password fields. For existing accounts: password field to confirm identity. An accept/submit button. An error state for expired/used/invalid tokens. An org-switch warning with "I understand" confirmation if applicable.
- Required `data-testid` attributes:
  - `invite-open-button`, `invite-form`, `invite-email-input`, `invite-role-select`, `invite-submit-button`, `invite-error-message`, `toast-invite-sent`
  - `accept-invite-screen`, `accept-invite-org-name`, `accept-first-name-input`, `accept-last-name-input`, `accept-password-input`, `accept-submit-button`, `accept-invite-error` (expired/used/invalid)
  - `accept-org-switch-warning`, `accept-org-switch-confirm` (the "I understand" confirmation for org-switch with last-admin warning)

## Out of Scope

- Bulk / CSV invitations.
- Invitation revocation UI (requirement 8 covers supersession).
- Reminder / re-send scheduling.
- Approving join requests initiated by the invitee (invites are inviter-initiated only).
- Invitation limits (no cap on pending invitations in this release).

## Test Cases

### TC-03-UNIT-01: Invite payload validation
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

### TC-03-UNIT-02: Token expiry is issued time + 7 days
- **Level:** Unit
- **Preconditions:** an invitation issued at time `T`.
- **Steps:**
  1. Evaluate acceptability at `T + 6 days 23 hours`.
  2. Evaluate acceptability at `T + 7 days 1 minute`.
- **Expected Result:**
  1. Still acceptable at +6d23h.
  2. Expired at +7d1m.

### TC-03-UNIT-03: Self-invitation rejected
- **Level:** Unit
- **Preconditions:** inviter has email `admin@acme.com`.
- **Steps:**
  1. Validate invite with email `admin@acme.com`.
  2. Validate invite with email `ADMIN@ACME.COM` (case variant).
- **Expected Result:**
  1. Rejected — cannot invite yourself.
  2. Rejected — same email after normalization.

### TC-03-UNIT-04: Email normalization for invitations
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Invite email `NEW@ACME.COM`.
  2. Invite email `New.User@Acme.Com`.
- **Expected Result:**
  1. Stored as `new@acme.com`.
  2. Stored as `new.user@acme.com`.

### TC-03-INT-01: Invite creates a pending record and dispatches an email
- **Level:** Integration
- **Preconditions:** authenticated as `admin` of Org A; `new@acme.com` is not a member of Org A.
- **Steps:**
  1. Call the invite endpoint with `new@acme.com` and role `user`.
  2. Inspect stored invitations and the test mail sink.
- **Expected Result:**
  1. A `pending` invitation exists for (`new@acme.com`, Org A, role `user`) with a future expiry.
  2. One email addressed to `new@acme.com` containing the token link was dispatched.

### TC-03-INT-02: Accepting an expired invitation is rejected
- **Level:** Integration
- **Preconditions:** a `pending` invitation for `new@acme.com` whose expiry is in the past.
- **Steps:**
  1. Call the accept endpoint with that token.
- **Expected Result:**
  1. Rejected (HTTP 4xx) with an "invitation expired" error; no account/membership created.

### TC-03-INT-03: Accepting an already-used invitation is rejected
- **Level:** Integration
- **Preconditions:** an invitation that was already accepted once (status `used`).
- **Steps:**
  1. Call the accept endpoint again with the same token.
- **Expected Result:**
  1. Rejected (HTTP 4xx) with an "invitation no longer valid" error; no duplicate membership created.

### TC-03-INT-04: Accepting an invite while already a member of another org hard-deletes old data
- **Level:** Integration
- **Preconditions:** user `u@x.com` is an `active` member of Org A with job title "Engineer"; a valid invite to Org B exists for `u@x.com`.
- **Steps:**
  1. Call the accept-invite endpoint with Org B's token and `u@x.com`'s password.
  2. Query Org A's membership table.
- **Expected Result:**
  1. `u@x.com` is now an `active` member of Org B with the invite's role.
  2. No membership record (active or removed) exists for `u@x.com` in Org A — hard-deleted.
  3. The Org B invite token is marked used.

### TC-03-INT-05: Manager cannot invite at admin role
- **Level:** Integration
- **Preconditions:** authenticated as `manager` of Org A.
- **Steps:**
  1. Call the invite endpoint with `new@acme.com` and role `admin`.
- **Expected Result:**
  1. Rejected (HTTP 403); no pending invitation for role `admin` created.

### TC-03-INT-06: Invite to removed member of same org — restores with invitation's role and clears job title
- **Level:** Integration
- **Preconditions:** `ex@acme.com` has a `removed` membership in Org A with role `user` and job title "Engineer"; authenticated as `admin` of Org A.
- **Steps:**
  1. Call the invite endpoint with `ex@acme.com` and role `manager`.
  2. Accept the invitation (provide password for existing account).
  3. Query `ex@acme.com`'s membership.
- **Expected Result:**
  1. Invitation created successfully.
  2. Membership restored: status `active`, role `manager` (from invitation, not original `user`).
  3. Joined date is reset to the acceptance time (not original join date).
  4. Job title is cleared (empty).

### TC-03-INT-07: Manager invites with non-admin roles
- **Level:** Integration
- **Preconditions:** authenticated as `manager` of Org A.
- **Steps:**
  1. Call invite with `new1@acme.com` and role `manager`.
  2. Call invite with `new2@acme.com` and role `user`.
  3. Call invite with `new3@acme.com` and role `viewer`.
  4. Call invite with `new4@acme.com` and role `admin`.
- **Expected Result:**
  1. Steps 1–3 succeed; pending invitations created with the respective roles.
  2. Step 4 rejected (HTTP 403).

### TC-03-INT-08: Self-invitation rejected at API level
- **Level:** Integration
- **Preconditions:** authenticated as `admin@acme.com` of Org A.
- **Steps:**
  1. Call the invite endpoint with `admin@acme.com` and role `user`.
  2. Call the invite endpoint with `ADMIN@ACME.COM` and role `user`.
- **Expected Result:**
  1. Both rejected with a "cannot invite yourself" error.

### TC-03-INT-09: Existing account accepts invitation with correct password
- **Level:** Integration
- **Preconditions:** account `pat@other.com` exists with password `"Passw0rd"`; valid invite to Org B for `pat@other.com`.
- **Steps:**
  1. Call accept-invite with the token and password `"Passw0rd"`.
- **Expected Result:**
  1. Succeeds; `pat@other.com` is now an `active` member of Org B.

### TC-03-INT-10: Existing account accepts invitation with wrong password — rejected
- **Level:** Integration
- **Preconditions:** account `pat@other.com` exists with password `"Passw0rd"`; valid invite to Org B for `pat@other.com`.
- **Steps:**
  1. Call accept-invite with the token and password `"WrongPass1"`.
- **Expected Result:**
  1. Rejected (HTTP 4xx) with "incorrect password" error; no membership created.

### TC-03-INT-11: Org-switch as last admin — old org data hard-deleted
- **Level:** Integration
- **Preconditions:** `admin@orgA.com` is the sole `admin` of Org A (with other non-admin members). Valid invite to Org B for `admin@orgA.com`.
- **Steps:**
  1. Accept the invitation with correct password and "I understand" confirmation.
  2. Query Org A's memberships.
  3. Query Org B's memberships.
- **Expected Result:**
  1. Acceptance succeeds (with last-admin warning and confirmation).
  2. No membership for `admin@orgA.com` exists in Org A (hard-deleted).
  3. `admin@orgA.com` is an `active` member of Org B with the invitation's role.
  4. Org A now has zero admins (orphaned — accepted consequence).

### TC-03-INT-12: Inviter removal invalidates pending invitations
- **Level:** Integration
- **Preconditions:** `admin` A of Org A created a pending invitation for `new@acme.com`.
- **Steps:**
  1. Remove A from the org (set A's status to `removed`).
  2. Attempt to accept the invitation for `new@acme.com`.
- **Expected Result:**
  1. A is removed successfully.
  2. The invitation acceptance is rejected — the invitation was invalidated when A was removed.

### TC-03-E2E-01: Admin invites, invitee accepts and lands in the org
- **Level:** E2E
- **Preconditions:** logged in as `admin` of "Acme Inc"; `new@acme.com` has no account.
- **Steps:**
  1. On the Members screen, click "Invite member".
  2. Enter `new@acme.com`, select role `user`, submit.
  3. Open the invitation link from the mail sink.
  4. On the accept screen, enter first name "New", last name "Hire", a valid password, and submit.
- **Expected Result:**
  1. After step 2 an "invitation sent" confirmation appears.
  2. The accept screen (step 3) shows "Acme Inc" as the inviting organization.
  3. After step 4 the invitee is authenticated inside "Acme Inc"; the Members list now includes "New Hire" as an active `user`.
- **Selectors:** `invite-open-button`, `invite-email-input`, `invite-role-select`, `invite-submit-button`, `toast-invite-sent`, `accept-invite-screen`, `accept-invite-org-name`, `accept-first-name-input`, `accept-last-name-input`, `accept-password-input`, `accept-submit-button`, `members-list`, `member-row-{id}`.

### TC-03-E2E-02: Expired link shows an explicit error
- **Level:** E2E
- **Preconditions:** an expired invitation link for `late@acme.com`.
- **Steps:**
  1. Open the expired invitation link.
- **Expected Result:**
  1. The accept screen shows an explicit "this invitation has expired" error and offers no password/accept fields.
- **Selectors:** `accept-invite-screen`, `accept-invite-error`.

### TC-03-E2E-03: Manager invites with non-admin role picker
- **Level:** E2E
- **Preconditions:** logged in as `manager` of "Acme Inc".
- **Steps:**
  1. On the Members screen, click "Invite member".
  2. Open the role picker.
- **Expected Result:**
  1. The role picker shows `manager`, `user`, `viewer` as options.
  2. The `admin` role is NOT present in the picker.
- **Selectors:** `invite-open-button`, `invite-form`, `invite-role-select`.

### TC-03-E2E-04: Existing user accepts invitation with password confirmation
- **Level:** E2E
- **Preconditions:** account `pat@other.com` exists; valid invitation to "Acme Inc" for `pat@other.com`.
- **Steps:**
  1. Open the invitation link.
  2. Verify the accept screen shows "Acme Inc" and a password field (not name/create-account fields).
  3. Enter the correct password and submit.
- **Expected Result:**
  1. The accept screen shows the password field for identity confirmation.
  2. After submission, the user is authenticated in "Acme Inc".
- **Selectors:** `accept-invite-screen`, `accept-invite-org-name`, `accept-password-input`, `accept-submit-button`.

### TC-03-E2E-05: Last admin accepts invite to another org — warning and confirmation shown
- **Level:** E2E
- **Preconditions:** logged in as sole `admin` of "Old Corp"; valid invitation to "New Corp" for the admin's email.
- **Steps:**
  1. Open the invitation link.
  2. Enter password and observe the warning.
  3. Click "I understand" confirmation and submit.
- **Expected Result:**
  1. A warning is shown: the old organization will have no administrator.
  2. An "I understand" confirmation is required before proceeding.
  3. After confirming, the user is in "New Corp"; all data from "Old Corp" is deleted.
- **Selectors:** `accept-invite-screen`, `accept-org-switch-warning`, `accept-org-switch-confirm`, `accept-password-input`, `accept-submit-button`.
