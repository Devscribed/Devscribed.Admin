# 07 — Account Settings (Personal)

## Summary

Every authenticated user has a personal account settings screen where they manage their own credentials and profile: change email (confirmed on the new address before it takes effect), change password (requires the current password), and edit personal information — first name, last name, phone number with country code, timezone, and first day of week. This is self-service and available to all roles; it does not depend on the admin member-management surface.

## Actors & Preconditions

- **Actor:** any authenticated user, acting on their **own** account.
- **Preconditions:** the user is logged in ([02-authentication-login](02-authentication-login.md)).

## Functional Requirements

1. The screen is self-service: a user edits only their own account. It is reachable from the account menu and available to all roles.
2. **Change email:** the user requests a new email. The change does not take effect immediately — a confirmation link is sent to the **new** address; the email is updated only after that link is confirmed. The old email remains the login until confirmation completes. The new email must be valid and not already in use by another account.
3. **Change password:** the user must supply their **current** password plus a new password (and confirmation). The new password must satisfy the shared password policy ([02-authentication-login](02-authentication-login.md)). An incorrect current password is rejected. On success, existing sessions may be revoked (same behavior as reset).
4. **Edit Information** — the user can edit:
   - First name (required, non-empty).
   - Last name (required, non-empty).
   - Phone number with a country-code selector; the number is validated for the selected country's format; phone is optional.
   - Timezone (selected from a standard timezone list).
   - First day of week (e.g. Monday/Sunday).
5. A single **Save** action persists the Edit Information fields. Change email and change password are separate actions/flows from the Edit Information save.
6. Validation errors are shown inline per field; server-side failures (e.g. email already in use) show a submit-level error.
7. The timezone and first-day-of-week values chosen here are the source for how dates are displayed to this user elsewhere (e.g. the member detail header in [06-member-detail-about](06-member-detail-about.md) reflects the member's timezone).

## UI Notes

- Mirrors the reference screenshot: top actions "Change email" and "Change password" (each opening its own flow/dialog), then an "Edit Information" section with First name, Last name, Phone number (country-code dropdown + number), Time zone, First day of week, and a primary Save button.
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
- Managing other users' settings (that is the admin surface — [05-member-list-management](05-member-list-management.md) / [06-member-detail-about](06-member-detail-about.md)).

## Test Cases

### TC-07-UNIT-01: Email-format validation
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate `"bad@"`.
  2. Validate `"good@acme.com"`.
- **Expected Result:**
  1. Invalid.
  2. Valid.

### TC-07-UNIT-02: Password confirmation & policy
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate new `"short"` / confirm `"short"`.
  2. Validate new `"NewPass1"` / confirm `"NewPass2"`.
  3. Validate new `"NewPass1"` / confirm `"NewPass1"`.
- **Expected Result:**
  1. Invalid — fails policy (too short / no digit).
  2. Invalid — confirmation mismatch.
  3. Valid.

### TC-07-UNIT-03: Phone format per country code
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

### TC-07-INT-01: Change email requires confirmation before it takes effect
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com`; `new@acme.com` is unused.
- **Steps:**
  1. Call the change-email endpoint requesting `new@acme.com`.
  2. Immediately attempt to log in with `new@acme.com`.
  3. Confirm via the link sent to `new@acme.com`.
  4. Log in with `new@acme.com`; then attempt login with the old `pat@acme.com`.
- **Expected Result:**
  1. Step 1 returns success and dispatches a confirmation email to `new@acme.com`; the account's login email is still `pat@acme.com`.
  2. Step 2 login as `new@acme.com` fails (not yet effective).
  3. After step 3 the login email becomes `new@acme.com`.
  4. Login with `new@acme.com` succeeds; login with `pat@acme.com` fails.

### TC-07-INT-02: Change password requires the correct current password
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

### TC-07-E2E-01: Edit information persists
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

### TC-07-E2E-02: Change-email confirmation flow
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

### TC-07-E2E-03: Change-password with wrong current password shows an error
- **Level:** E2E
- **Preconditions:** logged in as a user with current password `"Passw0rd"`.
- **Steps:**
  1. Open Account settings and click "Change password".
  2. Enter current `"wrong"`, new `"NewPass1"`, confirm `"NewPass1"`, submit.
- **Expected Result:**
  1. The form shows a "current password is incorrect" error and the password is not changed.
- **Selectors:** `change-password-open-button`, `change-password-current-input`, `change-password-new-input`, `change-password-confirm-input`, `change-password-submit-button`, `change-password-error`.

## Open Questions / Assumptions

- Assumes email change is confirmed on the **new** address (not the old) in this release.
- Assumes timezone list and first-day-of-week options come from a standard shared source.
- Assumes phone validation uses a standard per-country format library.
