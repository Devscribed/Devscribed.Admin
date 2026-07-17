---
id: "03"
title: User Invitation
routes: ["/accept-invite", "/members"]
api: ["POST /api/invitations", "GET /api/invitations/{token}/validate", "POST /api/invitations/accept"]
entities: [Invitation, JobTitle]
tags: [invite, invitation, token, accept-invite, role-picker, onboarding, org-switch, supersede]
depends-on: ["01", "02"]
---

# 03 — User Invitation

## Summary

An organization grows by inviting people. An `admin` or `manager` enters an email address and picks the role the invitee will receive, and the system emails a tokenized invitation link that expires after 7 days. When the invitee accepts, they confirm their identity (password for existing accounts, or create credentials for new accounts) and become an `active` member with the role chosen at invite time. Because an account belongs to exactly one organization at a time, accepting an invitation while already a member of another organization hard-deletes all data from the old organization.

## Actors & Preconditions

- **Actors:** the **inviter** (`admin` or `manager`) and the **invitee** (email recipient).
- **Preconditions:** the inviter is authenticated in an organization and holds a role permitted to invite.

## User Flow

### Main Flow A: Admin/Manager invites a member

1. Inviter navigates to the Members screen (`/members`). The "Invite member" button (`invite-open-button`) is visible because the inviter's role is `admin` or `manager`.
2. Inviter clicks "Invite member". System displays the invite modal with an email input and a role picker. The role picker shows all four roles if the inviter is `admin`, or `manager`/`user`/`viewer` if the inviter is `manager`. The default selected role is `user`. The "Send invitation" submit button is disabled until the email field is non-empty and passes client-side email format validation.
3. Inviter enters the invitee's email address and selects a role.
4. Inviter clicks "Send invitation". The submit button is disabled and a loading indicator is shown to prevent double-submission.
5. System normalizes the email to lowercase, validates the payload server-side, generates a cryptographic token, stores the pending invitation, and dispatches an invitation email containing a tokenized link.
6. System closes the modal and shows a success toast (`toast-invite-sent`): "Invitation sent to {email}".

### Main Flow B: New user accepts invitation

1. Invitee opens the tokenized link from their email. The browser navigates to `/accept-invite?token={token}`.
2. System validates the token. The token is valid, non-expired, unused, and not invalidated. The response indicates no existing account for this email. System displays the new-account accept form showing the inviting organization name, the invited role, first name, last name, and password fields. The submit button is disabled until all fields pass client-side validation.
3. Invitee enters their first name, last name, and a password.
4. Invitee clicks "Accept invitation". The submit button is disabled with a loading indicator.
5. System sends the acceptance request with the token, first name, last name, password, and browser-detected timezone. The API atomically creates the account and the membership (role from the invitation, status `active`), marks the invitation `used`, and establishes an authenticated session.
6. System redirects the invitee to the Members list screen (`/members`). No intermediate confirmation screen is shown.

### Main Flow C: Existing user accepts invitation

1. Invitee opens the tokenized link. The browser navigates to `/accept-invite?token={token}`.
2. System validates the token. The response indicates an existing account for this email. System displays the existing-account accept form showing the inviting organization name, a greeting ("Welcome back! Enter your password to confirm your identity."), and a password field. The submit button is enabled once the password field is non-empty.
3. Invitee enters their current password.
4. Invitee clicks "Accept invitation". The submit button is disabled with a loading indicator.
5. System sends the acceptance request with the token and password. The API verifies the password, handles org-switch (hard-deleting old membership) or same-org restoration as applicable, creates/restores the membership with the invitation's role, marks the invitation `used`, and establishes an authenticated session.
6. System redirects the invitee to the Members list screen.

### Alternative Flow D: Invite creation validation errors (branches from Main Flow A, step 5)

5a. The API returns a validation error (invalid email format, invalid role, etc.). The modal remains open. The error message appears in `invite-error-message`. The form fields retain their values and the submit button re-enables.

### Alternative Flow E: Self-invitation (branches from Main Flow A, step 5)

5b. The inviter's own email (after normalization) matches the invitee email. The API returns an error. The modal shows "You cannot invite yourself" in `invite-error-message`. The form retains its values and the submit button re-enables.

### Alternative Flow F: Already a member (branches from Main Flow A, step 5)

5c. The invitee email matches an `active` member of the same organization. The API returns an error. The modal shows "This person is already a member of your organization" in `invite-error-message`.

### Alternative Flow G: Expired token (branches from Main Flow B/C, step 2)

2a. The token has expired (`ExpiresAt` in the past). The accept screen shows the error message "This invitation has expired" in `accept-invite-error`. No form fields or submit button are displayed.

### Alternative Flow H: Used or invalidated token (branches from Main Flow B/C, step 2)

2b. The token has already been used (status `used`) or was invalidated (superseded by a re-invite, or inviter removed from the org). The accept screen shows "This invitation is no longer valid" in `accept-invite-error`. No form fields or submit button are displayed.

### Alternative Flow I: Invalid or unrecognized token (branches from Main Flow B/C, step 2)

2c. The token is missing, malformed, or not found in the database. The accept screen shows "This invitation is no longer valid" in `accept-invite-error`. No form fields or submit button are displayed.

### Alternative Flow J: Org-switch (branches from Main Flow C, step 2)

2d. The existing account has a membership (active or removed) in a different organization. The validate response returns org-switch metadata including the old organization name. The accept form displays a warning banner (`accept-org-switch-warning`): "Accepting this invitation will remove you from {oldOrgName}. All your data in that organization will be permanently deleted." An "I understand" checkbox (`accept-org-switch-confirm`) must be checked before the submit button enables.

### Alternative Flow K: Org-switch with last-admin warning (extends Alternative Flow J)

2e. The existing account is the last `admin` of its current organization. In addition to the org-switch warning, the banner includes: "You are the last administrator of {oldOrgName}. Leaving will mean that organization has no administrator." The same "I understand" checkbox must be checked before proceeding.

### Alternative Flow L: Wrong password on accept (branches from Main Flow C, step 5)

5a. The existing account's password does not match. The accept screen shows "Incorrect password" beneath the password field via `field-error-password`. The submit button re-enables. The invitation token is NOT consumed.

### Alternative Flow M: Name/password validation failure on new-account accept (branches from Main Flow B, step 5)

5a. For new accounts, the first name, last name, or password fails validation. Inline errors appear beneath the respective fields using `field-error-{fieldName}` (same messages as spec 01, requirement 14). The submit button re-enables. The invitation token is NOT consumed.

### Alternative Flow N: Server error (branches from any submission step)

On 5xx or network error, the relevant error area shows "Something went wrong. Please try again." The submit button re-enables. Form fields retain their values.

## Functional Requirements

1. An inviter provides an invitee email and a target role. The email must be syntactically valid and is normalized to lowercase. The role must be a member of the role enum (`admin`, `manager`, `user`, `viewer`). Self-invitation (inviter's own email, case-insensitive after normalization) is rejected with a clear error.
2. On invite creation the system generates a unique, unguessable token, stores a pending invitation (email, target role, inviting org, inviter's membership ID, issued time, expiry, status `pending`), and dispatches an email containing a link embedding the token.
3. The invitation link expires 7 days after issuance. After expiry the invitation is no longer acceptable. A token at exactly 7 days is expired (expiry is exclusive).
4. **Role selection authority:** an `admin` may choose any role (including `admin`) for the invitation. A `manager` sees a role picker with `manager`/`user`/`viewer` (no `admin` option). A `manager` cannot select or submit `admin` as the invitation role — the API rejects it.
5. Accepting a **valid, non-expired, unused** invitation:
   - **New account (no existing account for that email):** the invitee sets a first/last name and password, an account is created, and an `active` membership in the inviting org is created with the invitation's role. **Name validation:** first name and last name are required, trimmed, 1–50 characters, letters/hyphens/apostrophes/spaces only (defined identically in specs 01, 03, and 06). **Password policy:** minimum 8 characters, maximum 128 characters, at least one letter and one digit (defined identically in specs 01, 02, 03, and 06). Timezone is auto-detected from the browser.
   - **Existing account:** the invitee enters their password to confirm identity. On correct password, an `active` membership in the inviting org is created with the invitation's role.
   - **Removed member of the same org:** if the email has an account with a `removed` membership in the inviting org, accepting the invitation restores the membership to `active` with the invitation's role (not the original role), clears the job title, and resets the joined date to the acceptance time.
6. **Org-switch on accept (single-org-per-user):** if the accepting account is currently a member (active or removed) of a different organization, that prior membership and all associated data (job title, etc.) are **hard-deleted** — not soft-deleted. The account ends up in exactly one organization — the inviting one. An org-switch warning is shown and an explicit "I understand" confirmation is required for all org-switches. If the accepting user was the last `admin` of their old organization, the warning additionally states that the old organization will have no administrator. Acceptance is still allowed after confirmation. The old org is left intact but admin-less — other members remain but cannot manage it.
7. Accepting marks the invitation `used`; a used or expired invitation cannot be accepted again.
8. Re-inviting an email that already has a `pending` invitation to the same org supersedes/refreshes the prior invitation (the old token is invalidated); there is at most one live pending invitation per (email, org).
9. Inviting an email that is already an `active` member of the **same** organization is rejected with a clear "already a member" error.
10. **Inviter removal invalidation:** if the inviter is removed from the organization (their membership status becomes `removed`), all their pending invitations are eagerly invalidated (status set to `invalidated`). The invitee receives an error if they try to accept an invalidated invitation.
11. **Field-specific error messages:** each validation rule produces a specific, deterministic error message. The complete set:

    **Invite creation errors:**

    | Context | Rule | Error message |
    |---|---|---|
    | Email | empty / whitespace-only | "Email is required" |
    | Email | invalid format | "Enter a valid email address" |
    | Email | > 254 characters | "Email must be at most 254 characters" |
    | Role | empty / missing | "Role is required" |
    | Role | not in enum | "Invalid role" |
    | Self-invitation | inviter email == invitee email | "You cannot invite yourself" |
    | Already member | email is active member of same org | "This person is already a member of your organization" |
    | Role authority | manager selects admin | "You do not have permission to assign the admin role" |
    | Permission | user/viewer attempts invite | "You do not have permission to invite members" |

    **Token validation errors (accept screen):**

    | Rule | Error message |
    |---|---|
    | Token expired | "This invitation has expired" |
    | Token used, invalidated, or not found | "This invitation is no longer valid" |

    **Accept invitation errors — new account:** name and password validation error messages are identical to those defined in spec 01, requirement 14:

    | Field | Rule | Error message |
    |---|---|---|
    | First name | empty / whitespace-only | "First name is required" |
    | First name | > 50 characters | "First name must be at most 50 characters" |
    | First name | invalid characters | "First name may contain only letters, hyphens, apostrophes, and spaces" |
    | Last name | empty / whitespace-only | "Last name is required" |
    | Last name | > 50 characters | "Last name must be at most 50 characters" |
    | Last name | invalid characters | "Last name may contain only letters, hyphens, apostrophes, and spaces" |
    | Password | empty | "Password is required" |
    | Password | < 8 characters | "Password must be at least 8 characters" |
    | Password | > 128 characters | "Password must be at most 128 characters" |
    | Password | no letter | "Password must contain at least one letter" |
    | Password | no digit | "Password must contain at least one digit" |

    **Accept invitation errors — existing account:**

    | Rule | Error message |
    |---|---|
    | Wrong password | "Incorrect password" |

    **General errors:**

    | Rule | Error message |
    |---|---|
    | Server error (5xx / network) | "Something went wrong. Please try again." |

12. **Inline validation timing:** client-side validation fires on blur (when the user leaves a field) and again on form submission. Errors appear inline beneath the respective field via `field-error-{fieldName}`. Server-side errors (e.g., self-invitation, already a member) appear in the error area (`invite-error-message` on the invite modal, `accept-invite-error` on the accept screen). Error areas clear when the user modifies any field value after a server error is shown.

## Data Model: Invitation

The `Invitation` entity stores invitation tokens:

| Field | Type | Description |
|---|---|---|
| `Id` | Guid | Primary key |
| `Email` | string (max 254) | Normalized (lowercase) invitee email |
| `Role` | string (max 20) | Target role: `admin`, `manager`, `user`, or `viewer` |
| `OrganizationId` | Guid | FK → `Organization.Id` — the inviting organization |
| `InviterMembershipId` | Guid | FK → `Membership.Id` — the membership of the person who sent the invite |
| `TokenHash` | string | SHA-256 hash of the raw token (hex-encoded, lowercase) |
| `CreatedAt` | DateTime | Issuance timestamp (UTC) |
| `ExpiresAt` | DateTime | `CreatedAt` + 7 days |
| `Status` | string (max 20) | `pending`, `used`, or `invalidated` |
| `UsedAt` | DateTime? | Set when the invitation is accepted; null if unused |

- **Token generation:** 32 cryptographically random bytes (`RandomNumberGenerator.GetBytes(32)`), encoded as URL-safe base64 (same approach as `PasswordResetToken` in spec 02).
- **Storage:** only the SHA-256 hash of the raw token is stored. On validation/acceptance, the presented token is hashed and compared against stored hashes. This prevents token theft from a database breach.
- **Lookup:** the invitation URL includes the raw token as the `token` query parameter: `/accept-invite?token={urlSafeBase64Token}`.
- **Validity:** a token is valid only if `Status` is `pending`, the current time is strictly before `ExpiresAt`, and the inviter's membership status is `active` (checked at validation time via the `InviterMembershipId` FK).
- **Indexes:** unique index on `TokenHash` for O(1) lookup. Non-unique index on `(Email, OrganizationId, Status)` filtered to `Status = 'pending'` for the supersession lookup.
- **Supersession:** when a new invitation is created for the same `(Email, OrganizationId)` and a `pending` invitation already exists, the old invitation's `Status` is set to `invalidated` in the same transaction as creating the new one.
- **Inviter-removal invalidation:** when a membership's status transitions to `removed`, all `Invitation` records with `InviterMembershipId` equal to that membership's `Id` and `Status = 'pending'` are eagerly set to `Status = 'invalidated'`.

**Membership model addition:** the `Membership` entity requires a `JobTitle` field (referenced by this spec's requirement 5 and spec 05):

| Field | Type | Description |
|---|---|---|
| `JobTitle` | string? (max 100) | Optional job title; cleared on membership restoration via invitation acceptance |

## API Endpoints

### `POST /api/invitations`

- **Authentication:** required. Caller must be `admin` or `manager` with an `active` membership.
- **Request:** `{ "email": string, "role": string }`
- **Success (200):** `{ "message": "Invitation sent" }` — invitation created and email dispatched.
- **Error (400):** `{ "message": "Email is required" }` — empty or whitespace-only email.
- **Error (400):** `{ "message": "Enter a valid email address" }` — invalid email format.
- **Error (400):** `{ "message": "Email must be at most 254 characters" }` — email too long.
- **Error (400):** `{ "message": "Role is required" }` — empty or missing role.
- **Error (400):** `{ "message": "Invalid role" }` — role not in enum.
- **Error (400):** `{ "message": "You cannot invite yourself" }` — self-invitation.
- **Error (400):** `{ "message": "This person is already a member of your organization" }` — active member of same org.
- **Error (403):** `{ "message": "You do not have permission to assign the admin role" }` — manager attempting admin invite.
- **Error (403):** `{ "message": "You do not have permission to invite members" }` — caller is `user` or `viewer`.

### `GET /api/invitations/{token}/validate`

- **Authentication:** none (public endpoint — invitee may not be logged in).
- **Success (200):** `{ "organizationName": string, "email": string, "role": string, "accountExists": bool, "orgSwitch": bool, "oldOrganizationName": string | null, "lastAdmin": bool }`
- **Error (400):** `{ "message": "This invitation has expired" }` — token past expiry.
- **Error (400):** `{ "message": "This invitation is no longer valid" }` — token used, invalidated, not found, or inviter removed.

**Security note — account existence:** this endpoint reveals whether an account exists for the invited email (via `accountExists`). This is acceptable because the token is a 256-bit unguessable secret — only someone who received the invitation email can call this endpoint. The inviter already knows the email they invited, so there is no incremental information leakage. This is the same trust model as password-reset links.

### `POST /api/invitations/accept`

- **Authentication:** none (public endpoint).
- **Request (new account):** `{ "token": string, "firstName": string, "lastName": string, "password": string, "timezone": string? }`
- **Request (existing account):** `{ "token": string, "password": string, "orgSwitchConfirmed": bool }`
- The server determines which variant applies by checking whether an account exists for the invitation's email. The `firstName`/`lastName`/`timezone` fields are ignored for existing accounts.
- **Success (200):** `{ "accountId": guid, "redirectTo": "/members" }` — sets an authentication cookie.
- **Error (400):** `{ "message": "This invitation has expired" }` — expired token.
- **Error (400):** `{ "message": "This invitation is no longer valid" }` — used, invalidated, or not-found token.
- **Error (400):** `{ "message": "Incorrect password" }` — existing account, wrong password.
- **Error (400):** `{ "errors": { "firstName": "...", "lastName": "...", "password": "..." } }` — new account, field validation failures (same error messages as requirement 11 table).
- **Error (409):** `{ "message": "org_switch_confirmation_required", "oldOrganizationName": string, "lastAdmin": bool }` — org-switch where `orgSwitchConfirmed` is not `true`. Client must re-submit with `orgSwitchConfirmed: true`.

## UI Description

### Invite Modal (on Members screen)

#### Layout

- Triggered by clicking the "Invite member" button (`invite-open-button`) on the Members screen. The button is visible only to `admin` and `manager` roles.
- A centered overlay modal with a backdrop. Max-width approximately 480px.
- Title: "Invite member".
- Fields in top-to-bottom order: Email input, Role picker (dropdown/select).
- A "Send invitation" submit button (`invite-submit-button`) below the fields.
- An error message area above the submit button (`invite-error-message`) for server-returned errors.
- A close/cancel affordance (X button or "Cancel" link) to dismiss the modal.

#### Components

**Email input (`invite-email-input`):**
- A labeled text input. Label: "Email address".
- Inline error area beneath the input (`field-error-email`).
- Client-side validation on blur: required, valid email format.

**Role picker (`invite-role-select`):**
- A labeled dropdown/select. Label: "Role".
- Options depend on the inviter's role:
  - `admin`: `Admin`, `Manager`, `User`, `Viewer`.
  - `manager`: `Manager`, `User`, `Viewer`.
- Default selection: `User`.

**Submit button (`invite-submit-button`):**
- Text: "Send invitation".
- Disabled until the email field is non-empty and passes client-side email format validation.
- Disabled during API submission (loading state).

#### States

| State | Behavior |
|---|---|
| **Default** | Email empty, role defaulted to `User`, submit disabled. |
| **Email invalid** | After blur on invalid email, inline error shown beneath email field. Submit disabled. |
| **Ready** | Valid email entered, role selected. Submit enabled. |
| **Loading** | After submit click, submit button disabled with loading indicator. Fields read-only. |
| **Server error** | Error message shown in `invite-error-message`. Fields retain values. Submit re-enables. Modal stays open. |
| **Success** | Modal closes. Toast (`toast-invite-sent`) shows "Invitation sent to {email}". |

#### Interactions

- **Blur on email field:** runs email format validation. If invalid, shows the specific error message in `field-error-email`. If valid, clears any existing error.
- **Submit click:** re-validates email client-side. If valid, sends `POST /api/invitations`.
- **Close/Cancel:** dismisses the modal, no API call. Form state is reset on next open.
- **Error message dismissal:** the error message in `invite-error-message` clears when the user modifies the email field after a server error.

#### Responsive Behavior

- The modal has a max-width of ~480px and is horizontally centered via the overlay.
- On narrow viewports the modal spans the available width with horizontal padding, matching the form card pattern from specs 01 and 02.

### Accept Invitation Screen (`/accept-invite?token={token}`)

#### Layout

- Public page (no authentication required). Route: `/accept-invite?token={token}`.
- A vertically stacked card, centered horizontally on the page, with a max-width of approximately 480px.
- The inviting organization name is displayed prominently at the top (`accept-invite-org-name`): "You've been invited to join {organizationName}".
- The invited role is displayed beneath (`accept-invite-role`): "as a {role}".
- The form fields depend on the accept-flow variant (new account vs. existing account), determined by the token validation response.
- An error area for token-level errors (`accept-invite-error`).
- An "Accept invitation" submit button (`accept-submit-button`).

#### Components — New Account Variant

Displayed when `accountExists` is `false` from the validation response:

**First name input (`accept-first-name-input`):**
- A labeled text input. Label: "First name".
- Inline error area beneath the input (`field-error-firstName`).

**Last name input (`accept-last-name-input`):**
- A labeled text input. Label: "Last name".
- Inline error area beneath the input (`field-error-lastName`).

**Password input (`accept-password-input`):**
- A labeled password input. Label: "Password".
- Input type `password` by default (characters masked).
- A show/hide toggle button (`accept-password-toggle`) at the trailing edge of the input, same behavior as spec 01.
- Inline error area beneath the input (`field-error-password`).

#### Components — Existing Account Variant

Displayed when `accountExists` is `true`:

A greeting line: "Welcome back! Enter your password to confirm your identity."

**Password input (`accept-password-input`):**
- A labeled password input. Label: "Password".
- Inline error area beneath the input (`field-error-password`).

No name fields are shown.

#### Components — Org-Switch Warning

Displayed when `orgSwitch` is `true` (applies to existing accounts with a membership in a different organization):

**Warning banner (`accept-org-switch-warning`):**
- Displayed below the password field and above the submit button.
- Text: "Accepting this invitation will remove you from {oldOrganizationName}. All your data in that organization will be permanently deleted."
- When `lastAdmin` is `true`, an additional line is appended: "You are the last administrator of {oldOrganizationName}. Leaving will mean that organization has no administrator."

**Confirmation checkbox (`accept-org-switch-confirm`):**
- An "I understand" checkbox that must be checked before the submit button enables. Required for all org-switches, not just last-admin scenarios.

#### States

| State | Behavior |
|---|---|
| **Loading (validate)** | Spinner/skeleton while the token is being validated on page load. |
| **Token invalid** | Error shown in `accept-invite-error`. No form fields or submit button displayed. |
| **New account form** | Organization name, role, first name, last name, password fields displayed. Submit disabled until all fields pass client-side validation. |
| **Existing account form** | Organization name, role, greeting, password field displayed. Submit enabled once password is non-empty. |
| **Org-switch warning** | Warning banner and "I understand" checkbox visible. Submit disabled until checkbox is checked. |
| **Loading (accept)** | Submit button disabled with loading indicator. Fields read-only. |
| **Field validation error** | Inline field errors shown beneath respective fields. Submit re-enables. |
| **Server error** | Error shown in `accept-invite-error` or inline per field. Submit re-enables. |
| **Success** | Redirect to `/members`. No intermediate confirmation screen. |

#### Interactions

- **Page load:** validates the token via `GET /api/invitations/{token}/validate`. Determines the form variant and org-switch state.
- **Blur on fields (new account):** runs client-side validation for that field (name rules from spec 01, password policy from spec 01).
- **Submit click:** re-validates all fields client-side. If valid, sends `POST /api/invitations/accept`.
- **"I understand" checkbox:** toggles submit button enabled/disabled for org-switch scenarios.
- **Password toggle (new account):** same behavior as spec 01 — toggles between `type="password"` and `type="text"`.
- **Error clearing:** inline field errors clear when the user corrects the value and blurs. Server error messages clear when any field value changes.

#### Responsive Behavior

- The card has a max-width of ~480px and is horizontally centered on desktop.
- On narrow viewports the card spans the available width with horizontal padding.
- Field stacking remains vertical at all breakpoints — no side-by-side field layout.

### Required `data-testid` Attributes

Invite modal:
- `invite-open-button`, `invite-form`, `invite-email-input`, `invite-role-select`, `invite-submit-button`, `invite-error-message`, `toast-invite-sent`
- `field-error-email` (inline validation on invite modal)

Accept invitation screen:
- `accept-invite-screen`, `accept-invite-org-name`, `accept-invite-role`
- `accept-first-name-input`, `accept-last-name-input`, `accept-password-input`, `accept-password-toggle`, `accept-submit-button`
- `accept-invite-error` (token-level errors: expired/used/invalid)
- `accept-org-switch-warning`, `accept-org-switch-confirm`
- `field-error-firstName`, `field-error-lastName`, `field-error-password` (inline validation on accept form)

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
  1. Rejected — "Enter a valid email address".
  2. Rejected — "Invalid role".
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
  1. Rejected — "You cannot invite yourself".
  2. Rejected — same email after normalization, "You cannot invite yourself".

### TC-03-UNIT-04: Email normalization for invitations
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Invite email `NEW@ACME.COM`.
  2. Invite email `New.User@Acme.Com`.
- **Expected Result:**
  1. Stored as `new@acme.com`.
  2. Stored as `new.user@acme.com`.

### TC-03-UNIT-05: Invite email and role validation edge cases
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate `{ email: "", role: "user" }`.
  2. Validate `{ email: "   ", role: "user" }`.
  3. Validate `{ email: "new@acme.com", role: "" }`.
  4. Validate `{ email: "new@acme.com", role: "   " }`.
  5. Validate an email of 255 characters with role `"user"`.
  6. Validate an email of 254 characters with role `"user"`.
- **Expected Result:**
  1. Rejected — "Email is required".
  2. Rejected — "Email is required".
  3. Rejected — "Role is required".
  4. Rejected — "Role is required".
  5. Rejected — "Email must be at most 254 characters".
  6. Valid (boundary).

### TC-03-UNIT-06: New-account accept name and password validation
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate accept payload with `firstName: ""`, `lastName: "Hire"`, `password: "Passw0rd"`.
  2. Validate accept payload with `firstName: "New"`, `lastName: ""`, `password: "Passw0rd"`.
  3. Validate accept payload with `firstName: "New"`, `lastName: "Hire"`, `password: ""`.
  4. Validate accept payload with `firstName: "New2"`, `lastName: "Hire"`, `password: "Passw0rd"`.
  5. Validate accept payload with `firstName: "New"`, `lastName: "Hire"`, `password: "short1"`.
  6. Validate accept payload with `firstName: "New"`, `lastName: "Hire"`, `password: "abcdefgh"`.
  7. Validate accept payload with `firstName: "New"`, `lastName: "Hire"`, `password: "Passw0rd"`.
- **Expected Result:**
  1. Rejected — "First name is required".
  2. Rejected — "Last name is required".
  3. Rejected — "Password is required".
  4. Rejected — "First name may contain only letters, hyphens, apostrophes, and spaces".
  5. Rejected — "Password must be at least 8 characters".
  6. Rejected — "Password must contain at least one digit".
  7. Valid.

### TC-03-INT-01: Invite creates a pending record and dispatches an email
- **Level:** Integration
- **Preconditions:** authenticated as `admin` of Org A; `new@acme.com` is not a member of Org A.
- **Steps:**
  1. Call `POST /api/invitations` with `{ "email": "new@acme.com", "role": "user" }`.
  2. Inspect stored invitations and the test mail sink.
- **Expected Result:**
  1. Response is success (HTTP 200) with `{ "message": "Invitation sent" }`.
  2. A `pending` invitation exists for (`new@acme.com`, Org A, role `user`) with `ExpiresAt` = `CreatedAt` + 7 days.
  3. One email addressed to `new@acme.com` containing the token link was dispatched.

### TC-03-INT-02: Accepting an expired invitation is rejected
- **Level:** Integration
- **Preconditions:** a `pending` invitation for `new@acme.com` whose `ExpiresAt` is in the past.
- **Steps:**
  1. Call `POST /api/invitations/accept` with that token.
- **Expected Result:**
  1. Rejected (HTTP 400) with `{ "message": "This invitation has expired" }`; no account/membership created.

### TC-03-INT-03: Accepting an already-used invitation is rejected
- **Level:** Integration
- **Preconditions:** an invitation that was already accepted once (status `used`).
- **Steps:**
  1. Call `POST /api/invitations/accept` again with the same token.
- **Expected Result:**
  1. Rejected (HTTP 400) with `{ "message": "This invitation is no longer valid" }`; no duplicate membership created.

### TC-03-INT-04: Accepting an invite while already a member of another org hard-deletes old data
- **Level:** Integration
- **Preconditions:** user `u@x.com` is an `active` member of Org A with job title "Engineer"; a valid invite to Org B exists for `u@x.com`.
- **Steps:**
  1. Call `POST /api/invitations/accept` with Org B's token, `u@x.com`'s password, and `orgSwitchConfirmed: true`.
  2. Query Org A's membership table.
- **Expected Result:**
  1. `u@x.com` is now an `active` member of Org B with the invite's role.
  2. No membership record (active or removed) exists for `u@x.com` in Org A — hard-deleted.
  3. The Org B invite token is marked `used`.

### TC-03-INT-05: Manager cannot invite at admin role
- **Level:** Integration
- **Preconditions:** authenticated as `manager` of Org A.
- **Steps:**
  1. Call `POST /api/invitations` with `{ "email": "new@acme.com", "role": "admin" }`.
- **Expected Result:**
  1. Rejected (HTTP 403) with `{ "message": "You do not have permission to assign the admin role" }`; no pending invitation created.

### TC-03-INT-06: Invite to removed member of same org — restores with invitation's role and clears job title
- **Level:** Integration
- **Preconditions:** `ex@acme.com` has a `removed` membership in Org A with role `user` and job title "Engineer"; authenticated as `admin` of Org A.
- **Steps:**
  1. Call `POST /api/invitations` with `{ "email": "ex@acme.com", "role": "manager" }`.
  2. Accept the invitation (provide password for existing account).
  3. Query `ex@acme.com`'s membership.
- **Expected Result:**
  1. Invitation created successfully.
  2. Membership restored: status `active`, role `manager` (from invitation, not original `user`).
  3. Joined date is reset to the acceptance time (not original join date).
  4. Job title is cleared (empty/null).

### TC-03-INT-07: Manager invites with non-admin roles
- **Level:** Integration
- **Preconditions:** authenticated as `manager` of Org A.
- **Steps:**
  1. Call `POST /api/invitations` with `new1@acme.com` and role `manager`.
  2. Call `POST /api/invitations` with `new2@acme.com` and role `user`.
  3. Call `POST /api/invitations` with `new3@acme.com` and role `viewer`.
  4. Call `POST /api/invitations` with `new4@acme.com` and role `admin`.
- **Expected Result:**
  1. Steps 1–3 succeed (HTTP 200); pending invitations created with the respective roles.
  2. Step 4 rejected (HTTP 403) with "You do not have permission to assign the admin role".

### TC-03-INT-08: Self-invitation rejected at API level
- **Level:** Integration
- **Preconditions:** authenticated as `admin@acme.com` of Org A.
- **Steps:**
  1. Call `POST /api/invitations` with `{ "email": "admin@acme.com", "role": "user" }`.
  2. Call `POST /api/invitations` with `{ "email": "ADMIN@ACME.COM", "role": "user" }`.
- **Expected Result:**
  1. Both rejected (HTTP 400) with `{ "message": "You cannot invite yourself" }`.

### TC-03-INT-09: Existing account accepts invitation with correct password
- **Level:** Integration
- **Preconditions:** account `pat@other.com` exists with password `"Passw0rd"`; valid invite to Org B for `pat@other.com`.
- **Steps:**
  1. Call `POST /api/invitations/accept` with the token and password `"Passw0rd"`.
- **Expected Result:**
  1. Succeeds (HTTP 200); `pat@other.com` is now an `active` member of Org B with the invitation's role.

### TC-03-INT-10: Existing account accepts invitation with wrong password — rejected
- **Level:** Integration
- **Preconditions:** account `pat@other.com` exists with password `"Passw0rd"`; valid invite to Org B for `pat@other.com`.
- **Steps:**
  1. Call `POST /api/invitations/accept` with the token and password `"WrongPass1"`.
- **Expected Result:**
  1. Rejected (HTTP 400) with `{ "message": "Incorrect password" }`; no membership created.
  2. The invitation token remains `pending` (not consumed by a failed attempt).

### TC-03-INT-11: Org-switch as last admin — old org data hard-deleted
- **Level:** Integration
- **Preconditions:** `admin@orgA.com` is the sole `admin` of Org A (with other non-admin members). Valid invite to Org B for `admin@orgA.com`.
- **Steps:**
  1. Call `POST /api/invitations/accept` with correct password and `orgSwitchConfirmed: true`.
  2. Query Org A's memberships.
  3. Query Org B's memberships.
- **Expected Result:**
  1. Acceptance succeeds (HTTP 200).
  2. No membership for `admin@orgA.com` exists in Org A (hard-deleted).
  3. `admin@orgA.com` is an `active` member of Org B with the invitation's role.
  4. Org A now has zero admins (orphaned — accepted consequence).

### TC-03-INT-12: Inviter removal invalidates pending invitations
- **Level:** Integration
- **Preconditions:** `admin` A of Org A created a pending invitation for `new@acme.com`.
- **Steps:**
  1. Remove A from the org (set A's membership status to `removed`).
  2. Verify the invitation's status in the database.
  3. Attempt to accept the invitation for `new@acme.com`.
- **Expected Result:**
  1. A is removed successfully.
  2. The invitation's status is `invalidated`.
  3. Acceptance is rejected (HTTP 400) with `{ "message": "This invitation is no longer valid" }`.

### TC-03-INT-13: Re-invitation supersedes prior pending invitation
- **Level:** Integration
- **Preconditions:** authenticated as `admin` of Org A. A `pending` invitation (token T1) exists for `new@acme.com` to Org A with role `user`.
- **Steps:**
  1. Call `POST /api/invitations` with `{ "email": "new@acme.com", "role": "manager" }` → token T2 issued.
  2. Attempt to accept using token T1.
  3. Accept using token T2.
- **Expected Result:**
  1. New invitation created successfully. T1's status is set to `invalidated`.
  2. T1 is rejected with "This invitation is no longer valid".
  3. T2 succeeds; membership created with role `manager`.

### TC-03-INT-14: Org-switch without confirmation is rejected with 409
- **Level:** Integration
- **Preconditions:** `user@x.com` is an `active` member of Org A. Valid invite to Org B for `user@x.com`.
- **Steps:**
  1. Call `POST /api/invitations/accept` with the token, correct password, and `orgSwitchConfirmed: false` (or omitted).
- **Expected Result:**
  1. Rejected (HTTP 409) with `{ "message": "org_switch_confirmation_required", "oldOrganizationName": "Org A", "lastAdmin": false }`.
  2. No membership changes made. Invitation remains `pending`.

### TC-03-INT-15: Inviting an active member of the same org is rejected
- **Level:** Integration
- **Preconditions:** authenticated as `admin` of Org A. `member@acme.com` is an `active` member of Org A.
- **Steps:**
  1. Call `POST /api/invitations` with `{ "email": "member@acme.com", "role": "user" }`.
- **Expected Result:**
  1. Rejected (HTTP 400) with `{ "message": "This person is already a member of your organization" }`.
  2. No pending invitation created.

### TC-03-INT-16: User or viewer cannot create invitations
- **Level:** Integration
- **Preconditions:** authenticated as `user` of Org A.
- **Steps:**
  1. Call `POST /api/invitations` with `{ "email": "new@acme.com", "role": "user" }`.
- **Expected Result:**
  1. Rejected (HTTP 403) with `{ "message": "You do not have permission to invite members" }`.

### TC-03-INT-17: Accepting with an unrecognized token is rejected
- **Level:** Integration
- **Preconditions:** no invitation exists for the token value `"fabricated-token-value"`.
- **Steps:**
  1. Call `POST /api/invitations/accept` with token `"fabricated-token-value"` and a password.
- **Expected Result:**
  1. Rejected (HTTP 400) with `{ "message": "This invitation is no longer valid" }`.

### TC-03-INT-18: New account accepts invitation with valid name and password
- **Level:** Integration
- **Preconditions:** no account exists for `new@acme.com`; valid invite to Org A for `new@acme.com` with role `user`.
- **Steps:**
  1. Call `POST /api/invitations/accept` with the token, `firstName: "New"`, `lastName: "Hire"`, `password: "Passw0rd"`, `timezone: "America/New_York"`.
  2. Query the database for the account and membership.
- **Expected Result:**
  1. Succeeds (HTTP 200) with an authenticated session.
  2. Account exists for `new@acme.com` with first name "New", last name "Hire", timezone "America/New_York".
  3. Membership exists: Org A, role `user`, status `active`, joinedAt set to acceptance time.
  4. Invitation is marked `used`.

### TC-03-INT-19: New account accept with invalid name — rejected without consuming token
- **Level:** Integration
- **Preconditions:** no account exists for `new@acme.com`; valid invite to Org A for `new@acme.com`.
- **Steps:**
  1. Call `POST /api/invitations/accept` with the token, `firstName: ""`, `lastName: "Hire"`, `password: "Passw0rd"`.
  2. Query the invitation status.
  3. Call `POST /api/invitations/accept` again with corrected data: `firstName: "New"`, `lastName: "Hire"`, `password: "Passw0rd"`.
- **Expected Result:**
  1. Rejected (HTTP 400) with `{ "errors": { "firstName": "First name is required" } }`.
  2. Invitation remains `pending` (not consumed).
  3. Second attempt succeeds; account and membership created.

### TC-03-E2E-01: Admin invites, invitee accepts and lands in the org
- **Level:** E2E
- **Preconditions:** logged in as `admin` of "Acme Inc"; `new@acme.com` has no account.
- **Steps:**
  1. On the Members screen, click "Invite member".
  2. Enter `new@acme.com`, select role `user`, submit.
  3. Open the invitation link from the mail sink.
  4. On the accept screen, enter first name "New", last name "Hire", a valid password, and submit.
- **Expected Result:**
  1. After step 2 an "invitation sent" confirmation toast appears.
  2. The accept screen (step 3) shows "Acme Inc" as the inviting organization.
  3. After step 4 the invitee is authenticated inside "Acme Inc"; the Members list now includes "New Hire" as an active `user`.
- **Selectors:** `invite-open-button`, `invite-email-input`, `invite-role-select`, `invite-submit-button`, `toast-invite-sent`, `accept-invite-screen`, `accept-invite-org-name`, `accept-first-name-input`, `accept-last-name-input`, `accept-password-input`, `accept-submit-button`, `members-list`, `member-row-{id}`.

### TC-03-E2E-02: Expired link shows an explicit error
- **Level:** E2E
- **Preconditions:** an expired invitation link for `late@acme.com`.
- **Steps:**
  1. Open the expired invitation link.
- **Expected Result:**
  1. The accept screen shows "This invitation has expired" in `accept-invite-error`.
  2. No password/accept fields are visible.
- **Selectors:** `accept-invite-screen`, `accept-invite-error`.

### TC-03-E2E-03: Manager invites with non-admin role picker
- **Level:** E2E
- **Preconditions:** logged in as `manager` of "Acme Inc".
- **Steps:**
  1. On the Members screen, click "Invite member".
  2. Open the role picker.
- **Expected Result:**
  1. The role picker shows `Manager`, `User`, `Viewer` as options.
  2. The `Admin` role is NOT present in the picker.
- **Selectors:** `invite-open-button`, `invite-form`, `invite-role-select`.

### TC-03-E2E-04: Existing user accepts invitation with password confirmation
- **Level:** E2E
- **Preconditions:** account `pat@other.com` exists; valid invitation to "Acme Inc" for `pat@other.com`.
- **Steps:**
  1. Open the invitation link.
  2. Verify the accept screen shows "Acme Inc" and a password field (not name/create-account fields).
  3. Enter the correct password and submit.
- **Expected Result:**
  1. The accept screen shows the greeting and password field for identity confirmation.
  2. After submission, the user is authenticated in "Acme Inc".
- **Selectors:** `accept-invite-screen`, `accept-invite-org-name`, `accept-password-input`, `accept-submit-button`.

### TC-03-E2E-05: Last admin accepts invite to another org — warning and confirmation shown
- **Level:** E2E
- **Preconditions:** logged in as sole `admin` of "Old Corp"; valid invitation to "New Corp" for the admin's email.
- **Steps:**
  1. Open the invitation link.
  2. Enter password and observe the warning.
  3. Verify the submit button is disabled until "I understand" is checked.
  4. Check the "I understand" checkbox and submit.
- **Expected Result:**
  1. The org-switch warning is shown, including the last-admin message.
  2. The "I understand" checkbox is required before the submit button enables.
  3. After confirming and submitting, the user is in "New Corp".
- **Selectors:** `accept-invite-screen`, `accept-org-switch-warning`, `accept-org-switch-confirm`, `accept-password-input`, `accept-submit-button`.

### TC-03-E2E-06: Org-switch (non-last-admin) shows warning and requires confirmation
- **Level:** E2E
- **Preconditions:** account `user@orgA.com` is a `user` of "Org A" (Org A has other admins); valid invitation to "Org B" for `user@orgA.com`.
- **Steps:**
  1. Open the invitation link.
  2. Verify the org-switch warning banner is displayed.
  3. Verify the submit button is disabled until "I understand" is checked.
  4. Check the checkbox, enter password, and submit.
- **Expected Result:**
  1. The warning states the user will be removed from "Org A" and data will be deleted.
  2. No last-admin warning is shown (Org A has other admins).
  3. After confirming, the user is in "Org B".
- **Selectors:** `accept-invite-screen`, `accept-org-switch-warning`, `accept-org-switch-confirm`, `accept-password-input`, `accept-submit-button`.

### TC-03-E2E-07: New-account accept with inline validation errors
- **Level:** E2E
- **Preconditions:** `new@acme.com` has no account; valid invitation to "Acme Inc" for `new@acme.com`.
- **Steps:**
  1. Open the invitation link.
  2. Verify the accept screen shows "Acme Inc" and the new-account form (first name, last name, password fields).
  3. Leave all fields empty and verify the submit button is disabled.
  4. Enter first name "New2" (invalid digit), last name "Hire", password "short".
  5. Tab through all fields to trigger blur validation.
- **Expected Result:**
  1. `field-error-firstName` shows "First name may contain only letters, hyphens, apostrophes, and spaces".
  2. `field-error-password` shows "Password must be at least 8 characters".
  3. Submit button remains disabled until all fields are valid.
- **Selectors:** `accept-invite-screen`, `accept-invite-org-name`, `accept-first-name-input`, `accept-last-name-input`, `accept-password-input`, `accept-submit-button`, `field-error-firstName`, `field-error-password`.

### TC-03-E2E-08: Invite modal shows server error for already-a-member
- **Level:** E2E
- **Preconditions:** logged in as `admin` of "Acme Inc"; `member@acme.com` is already an active member of "Acme Inc".
- **Steps:**
  1. Click "Invite member" on the Members screen.
  2. Enter `member@acme.com`, select role `user`, and submit.
- **Expected Result:**
  1. The modal remains open.
  2. `invite-error-message` shows "This person is already a member of your organization".
  3. Form fields retain their values; submit button re-enables.
- **Selectors:** `invite-open-button`, `invite-email-input`, `invite-role-select`, `invite-submit-button`, `invite-error-message`.

### TC-03-E2E-09: Used invitation link shows explicit error
- **Level:** E2E
- **Preconditions:** an invitation link that has already been accepted (status `used`).
- **Steps:**
  1. Open the used invitation link.
- **Expected Result:**
  1. The accept screen shows "This invitation is no longer valid" in `accept-invite-error`.
  2. No password/accept fields are visible.
- **Selectors:** `accept-invite-screen`, `accept-invite-error`.
