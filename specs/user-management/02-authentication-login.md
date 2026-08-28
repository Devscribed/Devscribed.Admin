---
id: "02"
title: Authentication & Login
routes: ["/login", "/forgot-password", "/reset-password"]
api: ["POST /api/login", "POST /api/forgot-password", "GET /api/reset-password/validate", "POST /api/reset-password"]
entities: [PasswordResetToken, SecurityStamp]
tags: [login, authentication, session, cookie, forgot-password, reset-password, SecurityStamp, session-revocation]
depends-on: ["01"]
---

# 02 — Authentication & Login

## Summary

Registered accounts sign in with email and password. Users who forget their password can reset it through a single-use, time-limited link sent to their email. This spec covers the credential model, the login flow, the forgot/reset-password flow, and the session revocation mechanism shared with specs 04 and 06.

## Actors & Preconditions

- **Actor:** a registered account holder (any role).
- **Preconditions:** the account was created via signup. The account's membership status affects login (see requirement 6).

## User Flow

### Main Flow: User logs in

1. User navigates to `/login` directly, or is redirected there by the auth middleware when accessing a protected page.
2. System displays the login form with email and password fields empty. The submit button is enabled and stays enabled regardless of validation state.
3. User enters their email and password and clicks "Sign in".
4. Client-side validation passes. System sends the credentials to `POST /api/login`. The submit button is disabled and a loading indicator is shown to prevent double-submission.
5. System authenticates the user, establishes a session cookie, and redirects to the Members list screen (`/members`).

### Alternative Flow A: Invalid credentials (branches from step 4)

4a. The API returns an error. The error area (`login-error-message`) shows "Invalid email or password". The form fields retain their values and the submit button re-enables.

### Alternative Flow B: Deactivated account (branches from step 4)

4b. The account exists but its membership status is `removed`. The error area shows "Your account has been deactivated, contact your administrator". The form fields retain their values and the submit button re-enables.

### Alternative Flow A2: Client-side validation blocks submission (branches from step 3)

3a. The email is empty or malformed, or the password is empty. Every applicable inline error renders at once beneath its field, focus moves to the first invalid field (email → password), and no request is sent. The submit button stays enabled.

### Alternative Flow C: Entry from signup page (branches from step 1)

1a. User is on the signup page and clicks the "Already have an account? Sign in" link. The browser navigates to `/login`.

### Main Flow: User requests a password reset

1. From the login screen, user clicks the "Forgot password?" link (`login-forgot-link`).
2. System navigates to `/forgot-password` and displays the forgot-password form with the email field empty.
3. User enters their email and clicks "Send reset link". The submit button is disabled during the API call to prevent double-submission.
4. System sends the email to `POST /api/forgot-password`.
5. System displays the neutral confirmation message (`forgot-confirmation-message`): "If an account exists, a reset link has been sent." This message is shown regardless of whether the email is registered.

### Alternative Flow D: Back to login from forgot-password (branches from step 2)

2a. User clicks the "Back to login" link (`forgot-back-link`). The browser navigates to `/login`.

### Main Flow: User resets their password

1. User opens the tokenized link from the reset email. The browser navigates to `/reset-password?token={token}`.
2. System validates the token via `GET /api/reset-password/validate?token={token}`, showing a checking indicator (`reset-checking`) while the call is in flight. If the token is valid, the reset form is displayed with new-password and confirm-password fields.
3. User enters the new password in both fields and clicks "Reset password". The submit button is disabled during the API call.
4. System sends the token and new password to `POST /api/reset-password`.
5. System displays a success message (`reset-success-message`) and a "Back to login" link (`reset-login-link`). The password form is hidden.
6. User clicks "Back to login" and signs in with the new password.

### Alternative Flow E: Invalid or expired token (branches from step 2)

2a. The token is missing, malformed, unrecognized, expired, or already used. A missing or malformed token is rejected client-side without a request; anything else is reported by the validate call. The error area (`reset-error-message`) shows "This reset link is invalid or has expired". The password fields and submit button are hidden; only the error and a "Back to login" link are shown.

### Alternative Flow F: Password policy violation on reset (branches from step 4)

4a. The new password does not meet the password policy. Inline errors appear beneath the password field (same messages as spec 01, requirement 14). The submit button re-enables.

### Alternative Flow G: Password confirmation mismatch (branches from step 3)

3a. The new password and confirmation do not match. An inline error appears beneath the confirm field: "Passwords do not match". Submission is blocked until the fields match.

## Functional Requirements

1. A user logs in with email + password. Email lookup is case-insensitive (all emails are normalized to lowercase). On success the system establishes an authenticated session (cookie) scoped to the user's current organization and role, and the user lands on the Members list screen. Login retrieves the account's `active` membership specifically; if no active membership exists, the account is treated as deactivated (see requirement 6).
2. Passwords are never stored in plaintext; they are stored as a salted one-way hash. Verification compares the presented password against the stored hash.
3. **Password policy:** minimum 8 characters, maximum 128 characters, at least one letter and one digit. Empty or policy-violating passwords are rejected at signup, reset, and change-password. The password policy is defined identically in specs 01, 02, 03, and 06; any change must be applied to all four. Password validation error messages are identical to those defined in spec 01, requirement 14:

    | Rule | Error message |
    |---|---|
    | empty | "Password is required" |
    | < 8 characters | "Password must be at least 8 characters" |
    | > 128 characters | "Password must be at most 128 characters" |
    | no letter | "Password must contain at least one letter" |
    | no digit | "Password must contain at least one digit" |

4. Login with an unknown email, or a known email with the wrong password, is rejected with the **same** generic error message ("Invalid email or password") to avoid revealing which accounts exist.
5. Login rate limiting / lockout is not implemented in this release.
6. A member whose organization membership status is `removed` (a soft-deleted member who was deactivated by an admin or manager) cannot log in. The removed-member check is performed after finding the account by email but **before** verifying the password. If the member's status is `removed`, the deactivation message "Your account has been deactivated, contact your administrator" is returned regardless of whether the password is correct — this avoids leaking whether a password is correct for deactivated accounts. This message is intentionally different from the generic invalid-credentials error to help the user understand their situation.
7. **Forgot password:** a user submits their email. The system always responds with the same neutral confirmation ("If an account exists, a reset link has been sent"), regardless of whether the email is registered, to avoid account enumeration. If the email is registered and the member is `active`, a reset email containing a tokenized link is dispatched. If the email belongs to a `removed` member, the neutral confirmation is returned but no email is dispatched. Email dispatch failures do not change the API response — the neutral confirmation is always returned. The email service is an injected dependency; integration tests use a test mail sink.
8. Requesting a new reset token invalidates any prior unused reset tokens for that account. At most one active reset token exists per account at any time.
9. The reset token is single-use and expires 60 minutes after issuance. A token at exactly 60 minutes is expired. Using an expired or already-used token is rejected with the error "This reset link is invalid or has expired". If the reset-password page is loaded with a missing, malformed, or unrecognized token, the same error is shown and the password fields are hidden.
10. **Reset password:** with a valid token the user sets a new password (subject to the password policy). The new password and confirmation must match; if they do not, the form shows "Passwords do not match" beneath the confirm field and submission is blocked. On success the token is invalidated and all existing sessions for that account are revoked — the user must log in again with the new password.
11. After a successful password reset the user must log in with the new password.
12. **Session revocation** is implemented via a `SecurityStamp` (random GUID) stored on the `Account` model. The stamp is included in the session cookie claims and validated on each authenticated request (via `CookieAuthenticationEvents.OnValidatePrincipal`). Revoking all sessions means regenerating the stamp, which causes all outstanding cookies to fail validation. This mechanism is shared across specs 02 (password reset), 04 (member removal), and 06 (password change).
13. **Token pre-validation:** `GET /api/reset-password/validate?token={token}` reports whether a reset token is currently usable, so `/reset-password` can show the invalid-link error before the user composes a password they will never get to submit. The check is strictly read-only — it never sets `UsedAt`, never sets `IsInvalidated`, and never mutates the token or the account in any way. A token remains fully usable after any number of validate calls. The endpoint reveals nothing about accounts, because the token itself is the secret; an unrecognized token and an expired one are indistinguishable in the response. Validity uses the same rule as requirement 9 (`IsInvalidated` false, `UsedAt` null, now before `ExpiresAt`).
14. **Client-side validation** applies to all three screens and follows the same rules as spec 01, requirement 16:
    - Validation fires on blur (when the user leaves a field) and again on submission.
    - Errors render inline beneath the respective field via `field-error-{fieldName}`.
    - **The submit button is never disabled for validation.** Submitting an invalid form renders every applicable error at once, moves focus to the first invalid field in top-to-bottom order, and sends no request. The button is disabled only while a request is in flight.
    - Messages are identical to spec 01, requirement 14: "Email is required", "Enter a valid email address", "Password is required", plus the password-policy table in requirement 3 above.
    - Fields validated per screen: `/login` — email (required, format), password (required). `/forgot-password` — email (required, format). `/reset-password` — new password (policy), confirm password (match).
    - Server-side validation is unchanged and remains authoritative. The "Email and password are required" and "Email is required" responses become unreachable through the UI but stay part of the API contract — TC-02-INT-10 and TC-02-INT-11 exercise them directly.

## Data Model: Password Reset Token

The `PasswordResetToken` entity stores reset tokens:

| Field | Type | Description |
|---|---|---|
| `Id` | Guid | Primary key |
| `AccountId` | Guid | FK → `Account.Id` |
| `TokenHash` | string | SHA-256 hash of the raw token (hex-encoded) |
| `CreatedAt` | DateTime | Issuance timestamp (UTC) |
| `ExpiresAt` | DateTime | `CreatedAt` + 60 minutes |
| `UsedAt` | DateTime? | Set when the token is consumed; null if unused |
| `IsInvalidated` | bool | Set to `true` when a newer token supersedes this one |

- **Token generation:** 32 cryptographically random bytes (`RandomNumberGenerator.GetBytes(32)`), encoded as URL-safe base64.
- **Storage:** only the SHA-256 hash of the raw token is stored. On reset, the presented token is hashed and compared against stored hashes. This prevents token theft from a database breach.
- **Lookup:** the reset URL includes the raw token as the `token` query parameter: `/reset-password?token={urlSafeBase64Token}`.
- **Validity:** a token is valid only if `IsInvalidated` is `false`, `UsedAt` is `null`, and the current time is before `ExpiresAt`.

## API Endpoints

### `POST /api/login`

- **Request:** `{ "email": string, "password": string }`
- **Success (200):** `{ "accountId": guid }` — sets an authentication cookie.
- **Error (400):** `{ "message": "Invalid email or password" }` — unknown email or wrong password.
- **Error (400):** `{ "message": "Your account has been deactivated, contact your administrator" }` — removed member (returned before password check).
- **Error (400):** `{ "message": "Email and password are required" }` — empty or whitespace-only email or password.

### `POST /api/forgot-password`

- **Request:** `{ "email": string }`
- **Success (200):** `{ "message": "If an account exists, a reset link has been sent" }` — always returned regardless of email existence.
- **Error (400):** `{ "message": "Email is required" }` — empty or whitespace-only email.

### `GET /api/reset-password/validate`

- **Request:** `?token={urlSafeBase64Token}`
- **Success (200):** `{ "valid": true }` — the token exists, is unused, is not invalidated, and has not expired. The token is **not** consumed.
- **Success (200):** `{ "valid": false }` — token missing, malformed, unrecognized, expired, used, or invalidated. All six cases return the same body.

Always returns HTTP 200; validity is carried in the body, not the status code, so a bad token is not an error condition to be logged or retried.

### `POST /api/reset-password`

- **Request:** `{ "token": string, "password": string, "passwordConfirmation": string }`
- **Success (200):** `{ "message": "Your password has been reset" }`
- **Error (400):** `{ "message": "This reset link is invalid or has expired" }` — token not found, expired, used, or invalidated.
- **Error (400):** `{ "message": "Passwords do not match" }` — password and confirmation differ.
- **Error (400):** `{ "message": "..." }` — password policy violation (same messages as requirement 3 table).

## UI Description

Visual and interaction detail — layout, tokens, component choices, headings, placeholders and hints — lives in [02-authentication-login.design.md](02-authentication-login.design.md). This section defines only the structure and behaviour the tests depend on.

All three screens share one signed-out shell: a vertically stacked card, centered horizontally, with a max-width of approximately 480px, and a single cross-account link below the card.

### Login Screen (`/login`)

- Fields in top-to-bottom order: Email, Password. The password field carries a reveal toggle (`login-password-toggle`) that switches the input between masked and plain text without altering the value or moving focus out of the field.
- A "Sign in" submit button below the fields. It is enabled at all times except while a request is in flight, when it is disabled and shows a loading indicator to prevent double-submission.
- Inline validation errors appear beneath their fields in `field-error-email` and `field-error-password`.
- An error area above the fields (`login-error-message`) for server-returned errors. This is a single element whose text content changes based on the error type (generic credentials error or deactivation message). The error clears when the user modifies any field value.
- A "Forgot password?" link (`login-forgot-link`) below the password field, navigating to `/forgot-password`.
- A "Create an account" link (`login-signup-link`) below the card, navigating to `/signup`.

### Forgot-Password Screen (`/forgot-password`)

- A single email input field with a "Send reset link" submit button. The button is disabled only during API submission, to prevent duplicate requests.
- Inline validation errors appear beneath the field in `field-error-email`.
- After a successful submission, the form is replaced by the neutral confirmation message (`forgot-confirmation-message`): "If an account exists, a reset link has been sent."
- In the confirmation state, a "Use a different email" link (`forgot-retry-link`) restores the form with an empty field. This is a client-side reset only — it sends no request and issues no new token.
- A "Back to login" link (`forgot-back-link`) below the card, navigating to `/login`.

### Reset-Password Screen (`/reset-password?token={token}`)

The screen has four states. The "Back to login" link (`reset-login-link`) is present in all four.

- **Checking state:** on page load the token is read from the URL query parameter and sent to `GET /api/reset-password/validate`. While the call is in flight, a checking indicator (`reset-checking`) is shown in place of the form. A missing or malformed token skips the request and goes straight to the invalid state.
- **Valid token state:** a form with new-password and confirm-password fields, and a "Reset password" submit button. The new-password field carries a reveal toggle (`reset-password-toggle`); the confirm field deliberately does not, since a readable confirmation field defeats the purpose of confirming. The submit button is disabled only during API submission. Password validation errors appear inline beneath the respective field using `field-error-password` and `field-error-password-confirm` (same pattern as spec 01). Token-related errors appear in the `reset-error-message` area.
- **Invalid/expired token state:** the password fields and submit button are hidden. The error area (`reset-error-message`) shows "This reset link is invalid or has expired". A token that expires between page load and submission drops the screen into this state from the POST response.
- **Success state:** after a successful reset, the form is replaced by a success message (`reset-success-message`): "Your password has been reset."

### Required `data-testid` attributes

Login screen:
- `login-form`, `login-email-input`, `login-password-input`, `login-password-toggle`, `login-submit-button`, `login-error-message`, `login-forgot-link`, `login-signup-link`

Forgot-password screen:
- `forgot-form`, `forgot-email-input`, `forgot-submit-button`, `forgot-confirmation-message`, `forgot-retry-link`, `forgot-back-link`

Reset-password screen:
- `reset-checking`, `reset-form`, `reset-password-input`, `reset-password-toggle`, `reset-password-confirm-input`, `reset-submit-button`, `reset-error-message`, `reset-success-message`, `reset-login-link`

Inline validation (shared pattern with spec 01):
- `field-error-email`, `field-error-password`, `field-error-password-confirm`

## Out of Scope

- SSO / OAuth / social login.
- Multi-factor authentication (MFA).
- Login rate limiting, brute-force lockout, and CAPTCHA.
- "Remember me" / persistent-session preferences.
- Changing email or password from account settings (separate feature — spec 06).
- Email service implementation — the email sender is an injected dependency; this spec defines the contract, not the transport.

## Test Cases

### TC-02-UNIT-01: Password hashing and verification
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Hash the password `"Passw0rd"`.
  2. Verify `"Passw0rd"` against the produced hash.
  3. Verify `"wrongpass"` against the produced hash.
  4. Hash `"Passw0rd"` a second time.
- **Expected Result:**
  1. The hash is not equal to the plaintext.
  2. Verification of the correct password returns true.
  3. Verification of the wrong password returns false.
  4. The second hash differs from the first (per-hash salt).

### TC-02-UNIT-02: Reset-token expiry calculation
- **Level:** Unit
- **Preconditions:** a token issued at time `T`.
- **Steps:**
  1. Evaluate validity at `T + 59 minutes`.
  2. Evaluate validity at `T + 60 minutes` (exact boundary).
  3. Evaluate validity at `T + 61 minutes`.
- **Expected Result:**
  1. At +59m the token is still valid.
  2. At +60m the token is expired (expiry is exclusive).
  3. At +61m the token is expired.

### TC-02-UNIT-03: Password policy edge cases
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate `""` (empty).
  2. Validate `"Pass1"` (5 chars).
  3. Validate `"Seven77"` (7 chars — boundary below minimum).
  4. Validate `"Eightt88"` (8 chars — exactly minimum).
  5. Validate `"abcdefgh"` (8 chars, no digit).
  6. Validate `"12345678"` (8 chars, no letter).
  7. Validate a 128-character string with letters and digits.
  8. Validate a 129-character string with letters and digits.
- **Expected Result:**
  1. Empty → invalid ("Password is required").
  2. Too short → invalid ("Password must be at least 8 characters").
  3. Too short → invalid ("Password must be at least 8 characters").
  4. Valid (meets minimum, has letter + digit).
  5. Invalid ("Password must contain at least one digit").
  6. Invalid ("Password must contain at least one letter").
  7. 128 chars → valid (boundary).
  8. 129 chars → invalid ("Password must be at most 128 characters").

### TC-02-UNIT-04: Email normalization for login
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Normalize login email `"PAT@ACME.COM"`.
  2. Normalize login email `"Pat.Owner@Acme.Com"`.
- **Expected Result:**
  1. Lookup uses `"pat@acme.com"`.
  2. Lookup uses `"pat.owner@acme.com"`.

### TC-02-UNIT-05: Password confirmation mismatch
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Submit reset with password `"NewPass1"` and confirmation `"NewPass1"`.
  2. Submit reset with password `"NewPass1"` and confirmation `"NewPass2"`.
  3. Submit reset with password `"NewPass1"` and confirmation `""`.
- **Expected Result:**
  1. Confirmation passes.
  2. Confirmation fails with "Passwords do not match".
  3. Confirmation fails with "Passwords do not match".

### TC-02-INT-01: Successful login
- **Level:** Integration
- **Preconditions:** an `active` account exists with email `pat@acme.com` and password `"Passw0rd"`.
- **Steps:**
  1. Call `POST /api/login` with `pat@acme.com` / `"Passw0rd"`.
- **Expected Result:**
  1. Response is success (HTTP 200) with a session cookie.
  2. The session carries the user's current organization and role.

### TC-02-INT-02: Wrong password rejected
- **Level:** Integration
- **Preconditions:** account `pat@acme.com` with password `"Passw0rd"`, membership status `active`.
- **Steps:**
  1. Call `POST /api/login` with `pat@acme.com` / `"nope"`.
- **Expected Result:**
  1. Rejected (HTTP 400) with the generic message "Invalid email or password" and no session issued.

### TC-02-INT-03: Unknown email rejected with identical message
- **Level:** Integration
- **Preconditions:** no account for `ghost@acme.com`.
- **Steps:**
  1. Call `POST /api/login` with `ghost@acme.com` / `"anything"`.
- **Expected Result:**
  1. Rejected (HTTP 400) with the **same** "Invalid email or password" message as TC-02-INT-02 (no account-existence leak).

### TC-02-INT-04: Removed member login with correct password shows deactivation message
- **Level:** Integration
- **Preconditions:** account `ex@acme.com` with password `"Passw0rd"`, whose membership status is `removed`.
- **Steps:**
  1. Call `POST /api/login` with `ex@acme.com` / `"Passw0rd"`.
- **Expected Result:**
  1. Rejected (HTTP 400) with the distinct message "Your account has been deactivated, contact your administrator".
  2. No session issued.

### TC-02-INT-04b: Removed member login with wrong password still shows deactivation message
- **Level:** Integration
- **Preconditions:** account `ex@acme.com` with password `"Passw0rd"`, whose membership status is `removed`.
- **Steps:**
  1. Call `POST /api/login` with `ex@acme.com` / `"wrongpassword"`.
- **Expected Result:**
  1. Rejected (HTTP 400) with the same deactivation message "Your account has been deactivated, contact your administrator" (password is not checked for removed members).
  2. No session issued.

### TC-02-INT-05: Forgot-password issues a single-use token and is enumeration-safe
- **Level:** Integration
- **Preconditions:** account `pat@acme.com` exists and is `active`; `ghost@acme.com` does not exist.
- **Steps:**
  1. Call `POST /api/forgot-password` with `pat@acme.com`.
  2. Call `POST /api/forgot-password` with `ghost@acme.com`.
  3. Use the token issued in step 1 to reset the password via `POST /api/reset-password`.
  4. Attempt to reuse the same token from step 1 again.
- **Expected Result:**
  1. Both step 1 and step 2 return the same neutral confirmation response (HTTP 200).
  2. A reset token/email is generated for `pat@acme.com` only.
  3. The first reset succeeds.
  4. The second use of the token is rejected with "This reset link is invalid or has expired".

### TC-02-INT-06: Removed member forgot-password — no email dispatched
- **Level:** Integration
- **Preconditions:** account `ex@acme.com` exists with status `removed`.
- **Steps:**
  1. Call `POST /api/forgot-password` with `ex@acme.com`.
  2. Inspect the test mail sink.
- **Expected Result:**
  1. Response is the same neutral confirmation ("If an account exists, a reset link has been sent").
  2. No reset email was dispatched to `ex@acme.com`.

### TC-02-INT-07: New reset request invalidates prior token
- **Level:** Integration
- **Preconditions:** account `pat@acme.com` exists and is `active`.
- **Steps:**
  1. Call `POST /api/forgot-password` with `pat@acme.com` → token T1 issued.
  2. Call `POST /api/forgot-password` with `pat@acme.com` again → token T2 issued.
  3. Attempt to reset password using T1.
  4. Reset password using T2.
- **Expected Result:**
  1. T1 is invalidated when T2 is issued.
  2. Step 3 is rejected with "This reset link is invalid or has expired".
  3. Step 4 succeeds; password is updated.

### TC-02-INT-08: Login is case-insensitive on email
- **Level:** Integration
- **Preconditions:** account exists for `pat@acme.com` with password `"Passw0rd"`.
- **Steps:**
  1. Call `POST /api/login` with `PAT@ACME.COM` / `"Passw0rd"`.
  2. Call `POST /api/login` with `Pat@Acme.Com` / `"Passw0rd"`.
- **Expected Result:**
  1. Both succeed — email lookup is case-insensitive.

### TC-02-INT-09: Password reset revokes all existing sessions
- **Level:** Integration
- **Preconditions:** account `pat@acme.com` is `active` and has two active sessions S1 and S2 (security stamp is included in both session cookies).
- **Steps:**
  1. Request and complete a password reset for `pat@acme.com`.
  2. Attempt to use session S1 to access a protected endpoint.
  3. Attempt to use session S2 to access a protected endpoint.
- **Expected Result:**
  1. Password reset succeeds and the account's `SecurityStamp` is regenerated.
  2. S1 is rejected (stamp mismatch).
  3. S2 is rejected (stamp mismatch).
  4. The user must log in again with the new password.

### TC-02-INT-10: Empty or whitespace-only login credentials rejected
- **Level:** Integration
- **Preconditions:** none.
- **Steps:**
  1. Call `POST /api/login` with `""` / `""`.
  2. Call `POST /api/login` with `"  "` / `"  "`.
  3. Call `POST /api/login` with `"pat@acme.com"` / `""`.
- **Expected Result:**
  1. All three are rejected (HTTP 400) with "Email and password are required".

### TC-02-INT-11: Forgot-password with empty email rejected
- **Level:** Integration
- **Preconditions:** none.
- **Steps:**
  1. Call `POST /api/forgot-password` with `""`.
  2. Call `POST /api/forgot-password` with `"  "`.
- **Expected Result:**
  1. Both are rejected (HTTP 400) with "Email is required".

### TC-02-INT-12: Reset with valid token but policy-violating password
- **Level:** Integration
- **Preconditions:** account `pat@acme.com` is `active` with a valid, unused reset token.
- **Steps:**
  1. Call `POST /api/reset-password` with the valid token and password `"short"` (matching confirmation).
  2. Call `POST /api/reset-password` with the valid token and password `"12345678"` (matching confirmation).
- **Expected Result:**
  1. Rejected (HTTP 400) with "Password must be at least 8 characters".
  2. Rejected (HTTP 400) with "Password must contain at least one letter".
  3. The token is NOT consumed by failed attempts — it remains valid for a subsequent correct reset.

### TC-02-INT-13: Reset with password confirmation mismatch
- **Level:** Integration
- **Preconditions:** account `pat@acme.com` is `active` with a valid, unused reset token.
- **Steps:**
  1. Call `POST /api/reset-password` with the valid token, password `"NewPass1"`, and confirmation `"NewPass2"`.
- **Expected Result:**
  1. Rejected (HTTP 400) with "Passwords do not match".
  2. The token is NOT consumed.

### TC-02-INT-14: Token validation endpoint is read-only
- **Level:** Integration
- **Preconditions:** account `pat@acme.com` is `active` with a valid, unused reset token T.
- **Steps:**
  1. Call `GET /api/reset-password/validate?token=T`.
  2. Call `GET /api/reset-password/validate?token=T` twice more.
  3. Reset the password using T via `POST /api/reset-password`.
  4. Call `GET /api/reset-password/validate?token=T` again.
  5. Call `GET /api/reset-password/validate` with an unrecognized token, an expired token, an invalidated token, a malformed token, and no token at all.
- **Expected Result:**
  1. Steps 1 and 2 return HTTP 200 `{ "valid": true }`; the token's `UsedAt` is still null and `IsInvalidated` is still false after all three calls.
  2. Step 3 succeeds — repeated validation did not consume the token.
  3. Step 4 returns `{ "valid": false }` (the token is now used).
  4. All five cases in step 5 return HTTP 200 `{ "valid": false }` with identical bodies.

### TC-02-E2E-01: Login happy path
- **Level:** E2E
- **Preconditions:** active account `pat@acme.com` / `"Passw0rd"`.
- **Steps:**
  1. Open the login screen.
  2. Enter `pat@acme.com` and `"Passw0rd"`.
  3. Submit.
- **Expected Result:**
  1. The user is authenticated and lands on the Members list.
- **Selectors:** `login-form`, `login-email-input`, `login-password-input`, `login-submit-button`.

### TC-02-E2E-02: Wrong-password error message
- **Level:** E2E
- **Preconditions:** active account `pat@acme.com` / `"Passw0rd"`.
- **Steps:**
  1. Open the login screen.
  2. Enter `pat@acme.com` and `"wrong"`.
  3. Submit.
- **Expected Result:**
  1. Remains on the login screen; the error area shows "Invalid email or password".
- **Selectors:** `login-form`, `login-email-input`, `login-password-input`, `login-submit-button`, `login-error-message`.

### TC-02-E2E-03: Forgot password → reset → login with new password
- **Level:** E2E
- **Preconditions:** active account `pat@acme.com` / `"Passw0rd"`.
- **Steps:**
  1. From the login screen, click "Forgot password?".
  2. Enter `pat@acme.com` and submit.
  3. Open the reset link delivered to the mailbox (test mail sink) and wait for the checking indicator to resolve.
  4. Enter a new password `"NewPass1"` in both fields and submit.
  5. Click "Back to login" and sign in with `pat@acme.com` / `"NewPass1"`.
  6. Sign out and attempt to sign in with the old password `"Passw0rd"`.
- **Expected Result:**
  1. After step 1 the forgot-password form is displayed.
  2. After step 2 the forgot-password form is no longer present and the neutral confirmation message is shown.
  3. After step 3 `reset-checking` resolves and `reset-form` becomes visible.
  4. After step 4 a success message is shown with a "Back to login" link.
  5. Step 5 succeeds.
  6. Step 6 fails with "Invalid email or password".
- **Selectors:** `login-forgot-link`, `forgot-form`, `forgot-email-input`, `forgot-submit-button`, `forgot-confirmation-message`, `reset-checking`, `reset-form`, `reset-password-input`, `reset-password-confirm-input`, `reset-submit-button`, `reset-success-message`, `reset-login-link`, `login-email-input`, `login-password-input`, `login-submit-button`, `login-error-message`.

### TC-02-E2E-04: Removed member login shows deactivation message
- **Retired.** Covered by TC-02-INT-10 (a removed member is refused before the password is even checked, and an account with no active membership reads as deactivated) and TC-04-INT-02, which asserts the deactivation message itself. The message text lives in `packages/validation`.

### TC-02-E2E-05: Expired reset link shows error
- **Retired.** Covered by TC-02-INT-14 — one indistinguishable body for every unusable token — over the twelve token states `reset-token.spec.ts` enumerates. Which of the reset page’s two branches renders is a single conditional, and TC-02-E2E-03 walks the other one end to end.

### TC-02-E2E-06: Reset password with confirmation mismatch
- **Retired.** Covered by TC-02-INT-13, which also asserts the token is not spent on a mismatch. Marking only the offending field is the shared form mechanism TC-01-E2E-03 proves once.

### TC-02-E2E-07: Login submit with an invalid form shows every error and focuses the first
- **Level:** E2E
- **Preconditions:** none.
- **Steps:**
  1. Open the login screen and confirm the submit button is enabled.
  2. Click "Sign in" with both fields empty.
  3. Enter `not-an-email` in the email field and `"Passw0rd"` in the password field, then click "Sign in".
- **Expected Result:**
  1. The submit button is enabled in step 1 and stays enabled throughout.
  2. After step 2 both inline errors are shown ("Email is required", "Password is required"), focus is in `login-email-input`, and no request is sent.
  3. After step 3 only `field-error-email` shows "Enter a valid email address", focus is in `login-email-input`, and no request is sent.
- **Selectors:** `login-form`, `login-email-input`, `login-password-input`, `login-submit-button`, `field-error-email`, `field-error-password`.

### TC-02-E2E-08: Forgot-password validates the email client-side
- **Retired.** Covered by TC-02-INT-11 (an empty or whitespace-only email is rejected) and TC-02-INT-05, which pins that the endpoint answers identically either way.

### TC-02-E2E-09: Password reveal toggle
- **Level:** E2E
- **Preconditions:** none.
- **Steps:**
  1. Open the login screen and type `"Passw0rd"` into the password field.
  2. Click `login-password-toggle`.
  3. Click it again.
- **Expected Result:**
  1. The field starts as `type="password"` with `aria-pressed="false"` on the toggle.
  2. After step 2 the field is `type="text"`, the value is unchanged, `aria-pressed` is `"true"`, and focus is still in the password field.
  3. After step 3 the field is masked again with the value unchanged.
- **Selectors:** `login-password-input`, `login-password-toggle`.

### TC-02-E2E-10: Forgot-password re-entry restores the form
- **Retired.** Retired without replacement. That the forgot-password form repopulates when the screen is re-entered is a convenience, not a rule: nothing depends on it, no spec requirement is lost if it regresses, and it cost a browser to assert.

