# 02 — Authentication & Login

## Summary

Registered accounts sign in with email and password. Users who forget their password can reset it through a single-use, time-limited link sent to their email. This spec covers the credential model, the login flow, and the forgot/reset-password flow.

## Actors & Preconditions

- **Actor:** a registered account holder (any role).
- **Preconditions:** the account was created via signup. The account's membership status affects login (see requirement 6).

## Functional Requirements

1. A user logs in with email + password. Email lookup is case-insensitive (all emails are normalized to lowercase). On success the system establishes an authenticated session (token/cookie) scoped to the user's current organization and role, and the user lands on the Members list screen.
2. Passwords are never stored in plaintext; they are stored as a salted one-way hash. Verification compares the presented password against the stored hash.
3. **Password policy:** minimum 8 characters, maximum 128 characters, at least one letter and one digit. Empty or policy-violating passwords are rejected at signup, reset, and change-password.
4. Login with an unknown email, or a known email with the wrong password, is rejected with the **same** generic error message ("invalid email or password") to avoid revealing which accounts exist.
5. Login rate limiting / lockout is not implemented in this release.
6. A member whose organization membership status is `removed` (a soft-deleted member who was deactivated by an admin or manager) cannot log in; the attempt is rejected with the distinct message "your account has been deactivated, contact your administrator" — this is intentionally different from the generic invalid-credentials error to help the user understand their situation.
7. **Forgot password:** a user submits their email. The system always responds with the same neutral confirmation ("if an account exists, a reset link has been sent"), regardless of whether the email is registered, to avoid account enumeration. If the email is registered and the member is `active`, a reset email containing a tokenized link is dispatched. If the email belongs to a `removed` member, the neutral confirmation is returned but no email is dispatched.
8. Requesting a new reset token invalidates any prior unused reset tokens for that account. At most one active reset token exists per account at any time.
9. The reset token is single-use and expires 60 minutes after issuance. Using an expired or already-used token is rejected with a clear error.
10. **Reset password:** with a valid token the user sets a new password (subject to the password policy). On success the token is invalidated and all existing sessions for that account are revoked — the user must log in again with the new password.
11. After a successful password reset the user must log in with the new password.

## UI Notes

- **Login screen:** email input, password input, submit button, a "Forgot password?" link, and an error area.
- **Forgot-password screen:** email input, submit button, neutral confirmation message.
- **Reset-password screen** (opened from the emailed link): new-password input, confirm-password input, submit button, and an error area for expired/invalid tokens.
- Required `data-testid` attributes:
  - `login-form`, `login-email-input`, `login-password-input`, `login-submit-button`, `login-error-message`, `login-forgot-link`
  - `forgot-form`, `forgot-email-input`, `forgot-submit-button`, `forgot-confirmation-message`
  - `reset-form`, `reset-password-input`, `reset-password-confirm-input`, `reset-submit-button`, `reset-error-message`

## Out of Scope

- SSO / OAuth / social login.
- Multi-factor authentication (MFA).
- Login rate limiting, brute-force lockout, and CAPTCHA.
- "Remember me" / persistent-session preferences.
- Changing email or password from account settings (separate feature).

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
  2. Evaluate validity at `T + 61 minutes`.
- **Expected Result:**
  1. At +59m the token is still valid.
  2. At +61m the token is expired.

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
  1. Empty → invalid.
  2. Too short → invalid.
  3. Too short → invalid.
  4. Valid (meets minimum, has letter + digit).
  5. Invalid (no digit).
  6. Invalid (no letter).
  7. 128 chars → valid (boundary).
  8. 129 chars → invalid (exceeds maximum).

### TC-02-UNIT-04: Email normalization for login
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Normalize login email `"PAT@ACME.COM"`.
  2. Normalize login email `"Pat.Owner@Acme.Com"`.
- **Expected Result:**
  1. Lookup uses `"pat@acme.com"`.
  2. Lookup uses `"pat.owner@acme.com"`.

### TC-02-INT-01: Successful login
- **Level:** Integration
- **Preconditions:** an `active` account exists with email `pat@acme.com` and password `"Passw0rd"`.
- **Steps:**
  1. Call the login endpoint with `pat@acme.com` / `"Passw0rd"`.
- **Expected Result:**
  1. Response is success (HTTP 2xx) with a session token.
  2. The session carries the user's current organization and role.

### TC-02-INT-02: Wrong password rejected
- **Level:** Integration
- **Preconditions:** account `pat@acme.com` with password `"Passw0rd"`.
- **Steps:**
  1. Call login with `pat@acme.com` / `"nope"`.
- **Expected Result:**
  1. Rejected (HTTP 4xx) with the generic message "invalid email or password" and no session issued.

### TC-02-INT-03: Unknown email rejected with identical message
- **Level:** Integration
- **Preconditions:** no account for `ghost@acme.com`.
- **Steps:**
  1. Call login with `ghost@acme.com` / `"anything"`.
- **Expected Result:**
  1. Rejected (HTTP 4xx) with the **same** "invalid email or password" message as TC-02-INT-02 (no account-existence leak).

### TC-02-INT-04: Removed member login shows deactivation message
- **Level:** Integration
- **Preconditions:** account `ex@acme.com` with correct password, whose membership status is `removed`.
- **Steps:**
  1. Call login with `ex@acme.com` and the correct password.
- **Expected Result:**
  1. Rejected (HTTP 4xx) with the distinct message "your account has been deactivated, contact your administrator".
  2. No session issued.

### TC-02-INT-05: Forgot-password issues a single-use token and is enumeration-safe
- **Level:** Integration
- **Preconditions:** account `pat@acme.com` exists and is `active`; `ghost@acme.com` does not exist.
- **Steps:**
  1. Call forgot-password with `pat@acme.com`.
  2. Call forgot-password with `ghost@acme.com`.
  3. Use the token issued in step 1 to reset the password.
  4. Attempt to reuse the same token from step 1 again.
- **Expected Result:**
  1. Both step 1 and step 2 return the same neutral confirmation response.
  2. A reset token/email is generated for `pat@acme.com` only.
  3. The first reset succeeds.
  4. The second use of the token is rejected as already-used.

### TC-02-INT-06: Removed member forgot-password — no email dispatched
- **Level:** Integration
- **Preconditions:** account `ex@acme.com` exists with status `removed`.
- **Steps:**
  1. Call forgot-password with `ex@acme.com`.
  2. Inspect the test mail sink.
- **Expected Result:**
  1. Response is the same neutral confirmation ("if an account exists…").
  2. No reset email was dispatched to `ex@acme.com`.

### TC-02-INT-07: New reset request invalidates prior token
- **Level:** Integration
- **Preconditions:** account `pat@acme.com` exists and is `active`.
- **Steps:**
  1. Call forgot-password with `pat@acme.com` → token T1 issued.
  2. Call forgot-password with `pat@acme.com` again → token T2 issued.
  3. Attempt to reset password using T1.
  4. Reset password using T2.
- **Expected Result:**
  1. T1 is invalidated when T2 is issued.
  2. Step 3 is rejected (token invalid / superseded).
  3. Step 4 succeeds; password is updated.

### TC-02-INT-08: Login is case-insensitive on email
- **Level:** Integration
- **Preconditions:** account exists for `pat@acme.com` with password `"Passw0rd"`.
- **Steps:**
  1. Call login with `PAT@ACME.COM` / `"Passw0rd"`.
  2. Call login with `Pat@Acme.Com` / `"Passw0rd"`.
- **Expected Result:**
  1. Both succeed — email lookup is case-insensitive.

### TC-02-INT-09: Password reset revokes all existing sessions
- **Level:** Integration
- **Preconditions:** account `pat@acme.com` is `active` and has two active sessions S1 and S2.
- **Steps:**
  1. Request and complete a password reset for `pat@acme.com`.
  2. Attempt to use session S1.
  3. Attempt to use session S2.
- **Expected Result:**
  1. Password reset succeeds.
  2. S1 is rejected (revoked).
  3. S2 is rejected (revoked).
  4. The user must log in again with the new password.

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
  1. Remains on the login screen; the error area shows "invalid email or password".
- **Selectors:** `login-form`, `login-email-input`, `login-password-input`, `login-submit-button`, `login-error-message`.

### TC-02-E2E-03: Forgot password → reset → login with new password
- **Level:** E2E
- **Preconditions:** active account `pat@acme.com` / `"Passw0rd"`.
- **Steps:**
  1. From the login screen, click "Forgot password?".
  2. Enter `pat@acme.com` and submit.
  3. Open the reset link delivered to the mailbox (test mail sink).
  4. Enter a new password `"NewPass1"` twice and submit.
  5. Return to login and sign in with `pat@acme.com` / `"NewPass1"`.
  6. Attempt to sign in with the old password `"Passw0rd"`.
- **Expected Result:**
  1. After step 2 the neutral confirmation message is shown.
  2. After step 4 a success state is shown and the user is directed to log in.
  3. Step 5 succeeds.
  4. Step 6 fails with "invalid email or password".
- **Selectors:** `login-forgot-link`, `forgot-email-input`, `forgot-submit-button`, `forgot-confirmation-message`, `reset-password-input`, `reset-password-confirm-input`, `reset-submit-button`, `login-email-input`, `login-password-input`, `login-submit-button`, `login-error-message`.

### TC-02-E2E-04: Removed member login shows deactivation message
- **Level:** E2E
- **Preconditions:** account `ex@acme.com` with correct password, whose membership status is `removed`.
- **Steps:**
  1. Open the login screen.
  2. Enter `ex@acme.com` and the correct password.
  3. Submit.
- **Expected Result:**
  1. The error area shows "your account has been deactivated, contact your administrator" (not the generic "invalid email or password").
- **Selectors:** `login-form`, `login-email-input`, `login-password-input`, `login-submit-button`, `login-error-message`.
