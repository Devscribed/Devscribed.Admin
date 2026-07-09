# 06 — Account Settings (Personal)

## Summary

Every authenticated user has a personal account settings screen where they manage their own credentials and profile: change email (confirmed on the new address before it takes effect, with a notification sent to the old address), change password (requires the current password), and edit personal information — first name, last name, phone number with country code, timezone, and first day of week. This is self-service and available to all roles; it does not depend on the admin member-management surface.

## Actors & Preconditions

- **Actor:** any authenticated user, acting on their **own** account.
- **Preconditions:** the user is logged in.

## Functional Requirements

1. The screen is self-service: a user edits only their own account. It is reachable from the account menu and available to all roles.
2. **Change email:** the user requests a new email. The new email is normalized to lowercase. The change does not take effect immediately — a confirmation link is sent to the **new** address, and a notification email is sent to the **old** address ("an email change was requested — if this wasn't you, contact support"). The email is updated only after the confirmation link is clicked. The old email remains the login until confirmation completes. The new email must be valid and not already in use by another account (case-insensitive check). The confirmation link expires after 24 hours. If the new email is claimed by another account before confirmation, the confirmation fails with "email already in use." At most one pending email change exists per account — requesting a new change invalidates the prior confirmation token.
3. **Change password:** the user must supply their **current** password plus a new password (and confirmation). **Password policy:** minimum 8 characters, maximum 128 characters, at least one letter and one digit. An incorrect current password is rejected. On success, all sessions except the current one are revoked (the user stays logged in on the device where they changed the password).
4. **Edit Information** — the user can edit:
   - **First name** (required, trimmed, 1–50 characters, letters/hyphens/apostrophes/spaces only).
   - **Last name** (required, trimmed, 1–50 characters, letters/hyphens/apostrophes/spaces only).
   - **Phone number** with a country-code selector; the number is validated for the selected country's format; phone is optional. Phone numbers are informational only — no uniqueness constraint across accounts.
   - **Timezone** (selected from a standard timezone list; auto-detected from browser on account creation via `Intl.DateTimeFormat().resolvedOptions().timeZone`).
   - **First day of week** (options: Monday (default), Sunday).
5. A single **Save** action persists the Edit Information fields. Change email and change password are separate actions/flows from the Edit Information save.
6. Validation errors are shown inline per field; server-side failures (e.g. email already in use) show a submit-level error.
7. The timezone and first-day-of-week values chosen here are the source for how dates are displayed to this user elsewhere in the application.

## UI Notes

- Top actions "Change email" and "Change password" (each opening its own flow/dialog), then an "Edit Information" section with First name, Last name, Phone number (country-code dropdown + number), Time zone, First day of week, and a primary Save button.
- Phone country selector shows a flag + dial code; the number field is prefixed accordingly.
- Empty/invalid states: Save is disabled until required fields are valid; per-field errors appear beneath fields.
- Required `data-testid` attributes:
  - `account-settings`
  - `change-email-open-button`, `change-email-form`, `change-email-new-input`, `change-email-submit-button`, `change-email-confirmation-message`, `change-email-error`
  - `change-password-open-button`, `change-password-form`, `change-password-current-input`, `change-password-new-input`, `change-password-confirm-input`, `change-password-submit-button`, `change-password-error`
  - `edit-first-name-input`, `edit-last-name-input`, `edit-phone-country-select`, `edit-phone-number-input`, `edit-timezone-select`, `edit-first-day-select`, `account-save-button`
  - `field-error-{fieldName}`, `toast-account-saved`

## Out of Scope

- Deleting one's own account.
- Avatar/photo upload.
- Notification / email preferences.
- Managing other users' settings (that is the admin surface via Member List and Member Detail).

## Test Cases

### TC-06-UNIT-01: Email-format validation
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate `"bad@"`.
  2. Validate `"good@acme.com"`.
  3. Validate `"GOOD@ACME.COM"`.
- **Expected Result:**
  1. Invalid.
  2. Valid (stored as `"good@acme.com"`).
  3. Valid (normalized to `"good@acme.com"`).

### TC-06-UNIT-02: Password confirmation & policy
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate new `"short"` / confirm `"short"`.
  2. Validate new `"NewPass1"` / confirm `"NewPass2"`.
  3. Validate new `"NewPass1"` / confirm `"NewPass1"`.
  4. Validate new (129 chars) / confirm (same 129 chars).
- **Expected Result:**
  1. Invalid — fails policy (too short / no digit).
  2. Invalid — confirmation mismatch.
  3. Valid.
  4. Invalid — exceeds 128-character maximum.

### TC-06-UNIT-03: Phone format per country code
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate `"+1 (555) 123-4567"` with country US.
  2. Validate `"12345"` with country US.
  3. Validate empty phone (no number entered).
- **Expected Result:**
  1. Valid for US.
  2. Invalid — not a valid US number.
  3. Valid — phone is optional.

### TC-06-UNIT-04: First and last name validation
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate `""` (empty).
  2. Validate a 51-character name.
  3. Validate `"John2"` (contains digit).
  4. Validate `"John@"` (contains special character).
  5. Validate `"Mary-Jane"` (hyphen).
  6. Validate `"O'Brien"` (apostrophe).
  7. Validate `"  Pat  "` (with whitespace padding).
- **Expected Result:**
  1. Invalid (required).
  2. Invalid (exceeds 50 chars).
  3. Invalid (digits not allowed).
  4. Invalid (special characters not allowed).
  5. Valid.
  6. Valid.
  7. Valid (trimmed to `"Pat"`).

### TC-06-UNIT-05: Email normalization
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Request change to `"NEW@ACME.COM"`.
  2. Request change to `"New.Email@Acme.Com"`.
- **Expected Result:**
  1. Stored/checked as `"new@acme.com"`.
  2. Stored/checked as `"new.email@acme.com"`.

### TC-06-UNIT-06: First day of week validation
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate `"Monday"`.
  2. Validate `"Sunday"`.
  3. Validate `"Saturday"`.
  4. Validate `"Wednesday"`.
- **Expected Result:**
  1. Valid.
  2. Valid.
  3. Invalid (not an allowed option).
  4. Invalid (not an allowed option).

### TC-06-INT-01: Change email requires confirmation before it takes effect and notifies old address
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com`; `new@acme.com` is unused.
- **Steps:**
  1. Call the change-email endpoint requesting `new@acme.com`.
  2. Inspect the test mail sink.
  3. Immediately attempt to log in with `new@acme.com`.
  4. Confirm via the link sent to `new@acme.com`.
  5. Log in with `new@acme.com`; then attempt login with the old `pat@acme.com`.
- **Expected Result:**
  1. Step 1 returns success and dispatches a confirmation email to `new@acme.com` AND a notification email to `pat@acme.com`; the account's login email is still `pat@acme.com`.
  2. Step 2 shows two emails: confirmation to new address, notification to old address.
  3. Step 3 login as `new@acme.com` fails (not yet effective).
  4. After step 4 the login email becomes `new@acme.com`.
  5. Login with `new@acme.com` succeeds; login with `pat@acme.com` fails.

### TC-06-INT-02: Change password requires the correct current password
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com` with current password `"Passw0rd"`.
- **Steps:**
  1. Call change-password with current `"wrong"`, new `"NewPass1"`.
  2. Call change-password with current `"Passw0rd"`, new `"NewPass1"`.
  3. Log in with the new password.
- **Expected Result:**
  1. Step 1 rejected (HTTP 4xx) — current password incorrect; password unchanged.
  2. Step 2 succeeds; password updated.
  3. Login with `"NewPass1"` succeeds.

### TC-06-INT-03: Email change token expires after 24 hours
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com`; `new@acme.com` is unused; email change requested with token T.
- **Steps:**
  1. Wait (or simulate) 25 hours after token issuance.
  2. Attempt to confirm with token T.
- **Expected Result:**
  1. Confirmation rejected — token expired.
  2. Account email remains `pat@acme.com`.

### TC-06-INT-04: Email change fails if new email is taken before confirmation
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com`; email change to `new@acme.com` requested with token T.
- **Steps:**
  1. Another user signs up with `new@acme.com` (or claims it via their own email change).
  2. Attempt to confirm with token T.
- **Expected Result:**
  1. Confirmation rejected with "email already in use" error.
  2. Account email remains `pat@acme.com`.

### TC-06-INT-05: Second email change request invalidates first token
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com`.
- **Steps:**
  1. Request email change to `new1@acme.com` → token T1 issued.
  2. Request email change to `new2@acme.com` → token T2 issued.
  3. Attempt to confirm with T1.
  4. Confirm with T2.
- **Expected Result:**
  1. T1 is invalidated when T2 is issued.
  2. Step 3 rejected (token invalid / superseded).
  3. Step 4 succeeds; email becomes `new2@acme.com`.

### TC-06-INT-06: Change password revokes other sessions but keeps current
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com` on device A (session S1) and device B (session S2); changing password from device A.
- **Steps:**
  1. Call change-password from session S1 with correct current password.
  2. Make a request using session S1 (current device).
  3. Make a request using session S2 (other device).
- **Expected Result:**
  1. Password change succeeds.
  2. S1 is still valid (current session preserved).
  3. S2 is rejected (revoked).

### TC-06-INT-07: Email change to uppercase normalizes correctly
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com`; `NEW@ACME.COM` is unused.
- **Steps:**
  1. Call change-email requesting `NEW@ACME.COM`.
  2. Confirm the change.
  3. Log in with `new@acme.com`.
- **Expected Result:**
  1. Confirmation email sent to the address; stored as `new@acme.com`.
  2. After confirmation, login email is `new@acme.com`.
  3. Login succeeds.

### TC-06-E2E-01: Edit information persists
- **Level:** E2E
- **Preconditions:** logged in as any user.
- **Steps:**
  1. Open Account settings.
  2. Change First name to "Dima", Last name to "Bezzubenkov".
  3. Set Time zone to "(GMT-7:00) America/Los_Angeles".
  4. Set First day of week to "Monday".
  5. Click Save.
  6. Reload the page.
- **Expected Result:**
  1. After step 5 a "saved" confirmation appears.
  2. After reload all edited values are retained.
- **Selectors:** `account-settings`, `edit-first-name-input`, `edit-last-name-input`, `edit-timezone-select`, `edit-first-day-select`, `account-save-button`, `toast-account-saved`.

### TC-06-E2E-02: Change-email confirmation flow
- **Level:** E2E
- **Preconditions:** logged in as `pat@acme.com`; `new@acme.com` unused.
- **Steps:**
  1. Open Account settings and click "Change email".
  2. Enter `new@acme.com` and submit.
  3. Open the confirmation link from the mail sink for `new@acme.com`.
  4. Log out and log in with `new@acme.com`.
- **Expected Result:**
  1. After step 2 a "confirmation sent" message appears.
  2. After step 3 the change is confirmed.
  3. Step 4 login with the new email succeeds.
- **Selectors:** `change-email-open-button`, `change-email-new-input`, `change-email-submit-button`, `change-email-confirmation-message`, `login-email-input`, `login-password-input`, `login-submit-button`.

### TC-06-E2E-03: Change-password with wrong current password shows an error
- **Level:** E2E
- **Preconditions:** logged in as a user with current password `"Passw0rd"`.
- **Steps:**
  1. Open Account settings and click "Change password".
  2. Enter current `"wrong"`, new `"NewPass1"`, confirm `"NewPass1"`, submit.
- **Expected Result:**
  1. The form shows a "current password is incorrect" error and the password is not changed.
- **Selectors:** `change-password-open-button`, `change-password-current-input`, `change-password-new-input`, `change-password-confirm-input`, `change-password-submit-button`, `change-password-error`.

### TC-06-E2E-04: Edit phone number with country code
- **Level:** E2E
- **Preconditions:** logged in as any user.
- **Steps:**
  1. Open Account settings.
  2. Select country code "US (+1)" from the country selector.
  3. Enter phone number "(555) 123-4567".
  4. Click Save.
  5. Reload the page.
- **Expected Result:**
  1. After step 4 a "saved" confirmation appears.
  2. After reload the country is US and the phone number is retained.
- **Selectors:** `account-settings`, `edit-phone-country-select`, `edit-phone-number-input`, `account-save-button`, `toast-account-saved`.

### TC-06-E2E-05: First name validation error shown inline
- **Level:** E2E
- **Preconditions:** logged in as any user.
- **Steps:**
  1. Open Account settings.
  2. Change First name to "Pat2" (contains digit).
  3. Attempt to save (or trigger client-side validation).
- **Expected Result:**
  1. An inline error appears beneath the first name field indicating digits are not allowed.
  2. Save is blocked until the error is corrected.
- **Selectors:** `account-settings`, `edit-first-name-input`, `field-error-firstName`, `account-save-button`.
