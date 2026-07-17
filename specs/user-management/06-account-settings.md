---
id: "06"
title: Account Settings
routes: ["/account/settings", "/account/confirm-email"]
api: ["GET /api/account/settings", "PUT /api/account/settings", "POST /api/account/change-email", "POST /api/account/confirm-email", "POST /api/account/change-password"]
entities: [PendingEmailChange]
tags: [account-settings, change-email, change-password, profile, phone, timezone, first-day-of-week]
depends-on: ["01", "02"]
---

# 06 — Account Settings (Personal)

## Summary

Every authenticated user has a personal account settings screen where they manage their own credentials and profile: change email (confirmed on the new address before it takes effect, with a notification sent to the old address), change password (requires the current password), and edit personal information — first name, last name, phone number with country code, timezone, and first day of week. This is self-service and available to all roles; it does not depend on the admin member-management surface.

## Actors & Preconditions

- **Actor:** any authenticated user, acting on their **own** account.
- **Preconditions:** the user is logged in.

## User Flow

### Main Flow A: Edit personal information

1. User navigates to `/account/settings` via the account menu. The page is available to all roles.
2. System fetches the user's current settings via `GET /api/account/settings` and displays a loading skeleton while the request is in flight.
3. System populates the Edit Information form with the user's current values: first name, last name, phone country code and number, timezone, and first day of week. The "Change email" and "Change password" buttons are displayed above the form. The Save button is enabled.
4. User edits one or more fields.
5. Client-side validation fires on blur for each field. If a field is invalid, an inline error appears beneath it via `field-error-{fieldName}`.
6. User clicks "Save". The Save button is disabled and a loading indicator is shown to prevent double-submission.
7. System sends the updated fields to `PUT /api/account/settings`. On success, a toast (`toast-account-saved`) shows "Settings saved". The Save button re-enables.

### Main Flow B: Change email

1. On the Account Settings page, user clicks the "Change email" button (`change-email-open-button`).
2. System opens the Change Email modal. The user's current email is displayed as read-only text. The new email input is empty. The submit button is disabled until a valid email is entered.
3. User enters a new email address.
4. Client-side validation fires on blur: required, valid email format, max 254 characters.
5. User clicks "Send confirmation" (`change-email-submit-button`). The submit button is disabled with a loading indicator.
6. System sends the request to `POST /api/account/change-email`. On success, the form is replaced by a confirmation message (`change-email-confirmation-message`): "A confirmation link has been sent to {newEmail}. Please check your inbox." A notification email is also dispatched to the old email address.
7. User opens the confirmation link from the email sent to the new address. The browser navigates to `/account/confirm-email?token={token}`.
8. System validates the token by sending `POST /api/account/confirm-email` with the token on page load. On success, the email is updated and the screen shows "Your email has been updated" with a link to the login page.

### Main Flow C: Change password

1. On the Account Settings page, user clicks the "Change password" button (`change-password-open-button`).
2. System opens the Change Password modal with three empty fields: current password, new password, and confirm new password. The submit button is disabled until all fields are non-empty and pass client-side validation.
3. User enters their current password, a new password, and confirms the new password.
4. Client-side validation fires on blur for each field: current password required; new password must meet the password policy; confirm must match new password.
5. User clicks "Change password" (`change-password-submit-button`). The submit button is disabled with a loading indicator.
6. System sends the request to `POST /api/account/change-password`. On success, the modal shows "Your password has been changed." All sessions except the current one are revoked.

### Alternative Flow D: Edit information validation errors (branches from Main Flow A, step 6)

6a. One or more fields fail client-side validation. Inline errors appear beneath the respective fields. The Save button remains disabled until all required fields are valid.

### Alternative Flow E: Edit information server error (branches from Main Flow A, step 7)

7a. The server returns a 5xx or network error. The error area shows "Something went wrong. Please try again." The Save button re-enables. Fields retain their values.

### Alternative Flow F: Change email — invalid format (branches from Main Flow B, step 4)

4a. The email fails client-side validation (empty, invalid format, or > 254 characters). An inline error appears beneath the email field via `field-error-newEmail`. The submit button remains disabled.

### Alternative Flow G: Change email — same as current (branches from Main Flow B, step 6)

6a. The API returns an error because the new email matches the user's current email (case-insensitive). The modal shows "This is already your email address" in `change-email-error`. The form retains its values and the submit button re-enables.

### Alternative Flow H: Change email — already in use (branches from Main Flow B, step 6)

6b. The API returns an error because the new email is already registered to another account. The modal shows "This email is already in use" in `change-email-error`. The form retains its values and the submit button re-enables.

### Alternative Flow I: Email confirmation — expired token (branches from Main Flow B, step 8)

8a. The token has expired (`ExpiresAt` in the past). The confirmation screen shows "This confirmation link has expired" in `confirm-email-error`. No success message or login link is displayed.

### Alternative Flow J: Email confirmation — invalid/used token (branches from Main Flow B, step 8)

8b. The token is used, invalidated, not found, or malformed. The confirmation screen shows "This confirmation link is no longer valid" in `confirm-email-error`.

### Alternative Flow K: Email confirmation — email already taken (branches from Main Flow B, step 8)

8c. Between the change request and confirmation, another account claimed the email. The confirmation screen shows "This email is already in use" in `confirm-email-error`.

### Alternative Flow L: Change password — wrong current password (branches from Main Flow C, step 6)

6a. The API returns an error because the current password is incorrect. The modal shows "Current password is incorrect" in `change-password-error`. The form retains its values and the submit button re-enables.

### Alternative Flow M: Change password — validation errors (branches from Main Flow C, step 4)

4a. The new password fails the password policy, or the confirmation does not match. Inline errors appear beneath the respective fields via `field-error-newPassword` or `field-error-passwordConfirmation`. The submit button remains disabled until all fields are valid.

### Alternative Flow N: Server error on any modal (branches from any modal submission step)

On 5xx or network error, the relevant error area shows "Something went wrong. Please try again." The submit button re-enables. Form fields retain their values.

## Functional Requirements

1. The screen is self-service: a user edits only their own account. It is reachable from the account menu at `/account/settings` and available to all roles.
2. **Change email:** the user requests a new email. The new email is normalized to lowercase. The change does not take effect immediately — a confirmation link is sent to the **new** address, and a notification email is sent to the **old** address ("An email change was requested for your account. If this wasn't you, please contact support."). The email is updated only after the confirmation link is clicked. The old email remains the login until confirmation completes. The new email must be valid and not already in use by another account (case-insensitive check). Requesting a change to the user's current email (case-insensitive after normalization) is rejected with "This is already your email address." The confirmation link expires after 24 hours. If the new email is claimed by another account before confirmation, the confirmation fails with "This email is already in use." At most one pending email change exists per account — requesting a new change invalidates the prior confirmation token.
3. **Change password:** the user must supply their **current** password plus a new password and confirmation. The new password and confirmation must match; if they do not, the form shows "Passwords do not match" beneath the confirm field and submission is blocked. **Password policy:** minimum 8 characters, maximum 128 characters, at least one letter and one digit (defined identically in specs 01, 02, 03, and 06; any change must be applied to all four). An incorrect current password is rejected with "Current password is incorrect." On success, the account's `SecurityStamp` is regenerated (spec 02, requirement 12), causing all sessions except the current one to be revoked. The current session is preserved by issuing a new cookie with the updated stamp before the response completes.
4. **Edit Information** — the user can edit:
   - **First name** (required, trimmed, 1–50 characters, letters/hyphens/apostrophes/spaces only).
   - **Last name** (required, trimmed, 1–50 characters, letters/hyphens/apostrophes/spaces only).
   - **Phone number** with a country-code selector; the number is validated for the selected country's format (libphonenumber pattern); phone is optional. Phone numbers are informational only — no uniqueness constraint across accounts. If a phone number is provided, a country code must also be selected.
   - **Timezone** (required; selected from a standard IANA timezone list; auto-detected from browser on account creation via `Intl.DateTimeFormat().resolvedOptions().timeZone`).
   - **First day of week** (options: Monday (default), Sunday).
5. A single **Save** action persists the Edit Information fields atomically. Change email and change password are separate actions/flows from the Edit Information save.
6. The timezone and first-day-of-week values chosen here are the source for how dates are displayed to this user elsewhere in the application.
7. **Email confirmation token security:** the confirmation token is 32 cryptographically random bytes (`RandomNumberGenerator.GetBytes(32)`), encoded as URL-safe base64. Only the SHA-256 hash of the raw token is stored (same approach as `PasswordResetToken` in spec 02 and `Invitation` in spec 03). The confirmation URL includes the raw token as the `token` query parameter: `/account/confirm-email?token={urlSafeBase64Token}`. A token is valid only if `IsInvalidated` is `false`, `UsedAt` is `null`, and the current time is strictly before `ExpiresAt`.
8. **Email confirmation is public:** the confirmation endpoint (`POST /api/account/confirm-email`) does not require authentication — the token alone is sufficient. The user does not need to be logged in. After successful confirmation, the screen shows a success message with a link to the login page.
9. **Field-specific error messages:** each validation rule produces a specific, deterministic error message. The complete set:

    **Edit Information errors:** name validation error messages are identical to those defined in spec 01, requirement 14:

    | Field | Rule | Error message |
    |---|---|---|
    | First name | empty / whitespace-only | "First name is required" |
    | First name | > 50 characters | "First name must be at most 50 characters" |
    | First name | invalid characters | "First name may contain only letters, hyphens, apostrophes, and spaces" |
    | Last name | empty / whitespace-only | "Last name is required" |
    | Last name | > 50 characters | "Last name must be at most 50 characters" |
    | Last name | invalid characters | "Last name may contain only letters, hyphens, apostrophes, and spaces" |
    | Phone number | invalid for selected country | "Enter a valid phone number" |
    | Phone country code | missing when number provided | "Select a country code" |
    | Timezone | empty / not selected | "Timezone is required" |
    | First day of week | not "Monday" or "Sunday" | "Invalid first day of week" |

    **Change Email errors:**

    | Context | Rule | Error message |
    |---|---|---|
    | New email | empty / whitespace-only | "Email is required" |
    | New email | invalid format | "Enter a valid email address" |
    | New email | > 254 characters | "Email must be at most 254 characters" |
    | New email | same as current (case-insensitive) | "This is already your email address" |
    | New email | already in use (server) | "This email is already in use" |

    **Change Password errors:** password policy error messages are identical to those defined in spec 01, requirement 14:

    | Context | Rule | Error message |
    |---|---|---|
    | Current password | empty | "Current password is required" |
    | Current password | incorrect (server) | "Current password is incorrect" |
    | New password | empty | "Password is required" |
    | New password | < 8 characters | "Password must be at least 8 characters" |
    | New password | > 128 characters | "Password must be at most 128 characters" |
    | New password | no letter | "Password must contain at least one letter" |
    | New password | no digit | "Password must contain at least one digit" |
    | Confirm password | empty | "Please confirm your new password" |
    | Confirm password | mismatch | "Passwords do not match" |

    **Email Confirmation errors:**

    | Rule | Error message |
    |---|---|
    | Token expired | "This confirmation link has expired" |
    | Token used, invalidated, or not found | "This confirmation link is no longer valid" |
    | Email already taken at confirmation time | "This email is already in use" |

    **General errors:**

    | Rule | Error message |
    |---|---|
    | Server error (5xx / network) | "Something went wrong. Please try again." |

10. **Inline validation timing:** client-side validation fires on blur (when the user leaves a field) and again on form submission. Errors appear inline beneath the respective field via `field-error-{fieldName}`. Server-side errors (e.g., email already in use, wrong current password) appear in the form-level error area (`change-email-error`, `change-password-error`). Error areas clear when the user modifies any field value after a server error is shown.

## Data Model: PendingEmailChange

The `PendingEmailChange` entity stores email change confirmation tokens:

| Field | Type | Description |
|---|---|---|
| `Id` | Guid | Primary key |
| `AccountId` | Guid | FK → `Account.Id` |
| `NewEmail` | string (max 254) | Normalized (lowercase) target email |
| `TokenHash` | string | SHA-256 hash of the raw token (hex-encoded, lowercase) |
| `CreatedAt` | DateTime | Issuance timestamp (UTC) |
| `ExpiresAt` | DateTime | `CreatedAt` + 24 hours |
| `UsedAt` | DateTime? | Set when the token is consumed; null if unused |
| `IsInvalidated` | bool | Set to `true` when superseded by a new request |

- **Token generation:** 32 cryptographically random bytes (`RandomNumberGenerator.GetBytes(32)`), encoded as URL-safe base64 (same approach as `PasswordResetToken` in spec 02 and `Invitation` in spec 03).
- **Storage:** only the SHA-256 hash of the raw token is stored. On confirmation, the presented token is hashed and compared against stored hashes. This prevents token theft from a database breach.
- **Lookup:** the confirmation URL includes the raw token as the `token` query parameter: `/account/confirm-email?token={urlSafeBase64Token}`.
- **Validity:** a token is valid only if `IsInvalidated` is `false`, `UsedAt` is `null`, and the current time is strictly before `ExpiresAt`.
- **Indexes:** unique index on `TokenHash` for O(1) lookup. Non-unique index on `(AccountId, IsInvalidated)` filtered to `IsInvalidated = false` for the supersession check.
- **Supersession:** when a new email change is requested for the same account and a pending (non-invalidated, unused) record already exists, the old record's `IsInvalidated` is set to `true` in the same transaction as creating the new one.
- **Email uniqueness at confirmation time:** when processing a confirmation, the system checks whether `NewEmail` is already in use by another account (case-insensitive) at that moment. If it is, the confirmation fails with "This email is already in use" and the token is NOT consumed (remains valid for a retry if the email is freed).

**Account model additions:** the `Account` entity requires these additional fields (referenced by this spec):

| Field | Type | Description |
|---|---|---|
| `PhoneCountryCode` | string? (max 5) | ISO 3166-1 alpha-2 country code for phone (e.g., "US", "GB") |
| `PhoneNumber` | string? (max 20) | Phone number in the selected country's format |
| `FirstDayOfWeek` | string (max 10) | `"Monday"` (default) or `"Sunday"` |

## API Endpoints

### `GET /api/account/settings`

- **Authentication:** required (any role).
- **Success (200):**
  ```json
  {
    "email": "pat@acme.com",
    "firstName": "Pat",
    "lastName": "Owner",
    "phoneCountryCode": "US",
    "phoneNumber": "(555) 123-4567",
    "timezone": "America/New_York",
    "firstDayOfWeek": "Monday"
  }
  ```
  `phoneCountryCode` and `phoneNumber` are `null` if not set.
- **Error (401):** not authenticated.

### `PUT /api/account/settings`

- **Authentication:** required (any role).
- **Request:**
  ```json
  {
    "firstName": "Pat",
    "lastName": "Owner",
    "phoneCountryCode": "US",
    "phoneNumber": "(555) 123-4567",
    "timezone": "America/New_York",
    "firstDayOfWeek": "Monday"
  }
  ```
  `phoneCountryCode` and `phoneNumber` may be `null` (clears the phone number).
- **Success (200):** `{ "message": "Settings saved" }`
- **Error (400):** `{ "errors": { "firstName": "First name is required", ... } }` — field validation failures (same error messages as requirement 9 Edit Information table).
- **Error (401):** not authenticated.

### `POST /api/account/change-email`

- **Authentication:** required (any role).
- **Request:** `{ "newEmail": "new@acme.com" }`
- **Success (200):** `{ "message": "A confirmation link has been sent to your new email address" }` — confirmation email dispatched to the new address; notification email dispatched to the old address.
- **Error (400):** `{ "message": "Email is required" }` — empty or whitespace-only.
- **Error (400):** `{ "message": "Enter a valid email address" }` — invalid email format.
- **Error (400):** `{ "message": "Email must be at most 254 characters" }` — email too long.
- **Error (400):** `{ "message": "This is already your email address" }` — new email matches current (case-insensitive).
- **Error (400):** `{ "message": "This email is already in use" }` — email registered to another account.
- **Error (401):** not authenticated.
- **Side effects:** creates a `PendingEmailChange` record; invalidates any prior pending record for this account; dispatches two emails (confirmation to new, notification to old).

### `POST /api/account/confirm-email`

- **Authentication:** none (public endpoint — token alone is sufficient).
- **Request:** `{ "token": "urlSafeBase64Token" }`
- **Success (200):** `{ "message": "Your email has been updated" }` — account email updated to the new email; `PendingEmailChange` record marked used.
- **Error (400):** `{ "message": "This confirmation link has expired" }` — token past expiry.
- **Error (400):** `{ "message": "This confirmation link is no longer valid" }` — token used, invalidated, not found, or malformed.
- **Error (400):** `{ "message": "This email is already in use" }` — another account claimed the email between request and confirmation.

**Security note — email uniqueness race:** the uniqueness check at confirmation time prevents two users from both confirming the same email. If the check fails, the token is NOT consumed — the user can retry if the email becomes available. This is a deliberate trade-off: the token remains valid until expiry even after a failed confirmation attempt.

### `POST /api/account/change-password`

- **Authentication:** required (any role).
- **Request:** `{ "currentPassword": "oldpass", "newPassword": "NewPass1", "passwordConfirmation": "NewPass1" }`
- **Success (200):** `{ "message": "Your password has been changed" }`
- **Error (400):** `{ "message": "Current password is required" }` — empty current password.
- **Error (400):** `{ "message": "Current password is incorrect" }` — wrong current password.
- **Error (400):** `{ "message": "Password is required" }` — empty new password.
- **Error (400):** `{ "message": "Password must be at least 8 characters" }` — too short.
- **Error (400):** `{ "message": "Password must be at most 128 characters" }` — too long.
- **Error (400):** `{ "message": "Password must contain at least one letter" }` — no letter.
- **Error (400):** `{ "message": "Password must contain at least one digit" }` — no digit.
- **Error (400):** `{ "message": "Passwords do not match" }` — new password and confirmation differ.
- **Error (401):** not authenticated.
- **Side effects:** password hash updated; `SecurityStamp` regenerated (spec 02, requirement 12); all sessions except the current one are invalidated. The current session is preserved by issuing a new cookie with the updated stamp before the response completes.

## UI Description

### Account Settings Page (`/account/settings`)

#### Layout

- Route: `/account/settings`. Entry point: account menu (available to all roles).
- A vertically stacked layout, centered horizontally on the page, with a max-width of approximately 600px.
- Top area: "Change email" and "Change password" buttons displayed side by side.
- Below: an "Edit Information" form section with fields in top-to-bottom order: First name, Last name, Phone number (country selector + number input), Timezone, First day of week.
- A primary "Save" button at the bottom of the form.

#### Components

**Change email button (`change-email-open-button`):**
- Text: "Change email". Opens the Change Email modal on click.

**Change password button (`change-password-open-button`):**
- Text: "Change password". Opens the Change Password modal on click.

**First name input (`edit-first-name-input`):**
- A labeled text input. Label: "First name".
- Inline error area beneath the input (`field-error-firstName`).
- Pre-filled with the user's current first name.

**Last name input (`edit-last-name-input`):**
- A labeled text input. Label: "Last name".
- Inline error area beneath the input (`field-error-lastName`).
- Pre-filled with the user's current last name.

**Phone country selector (`edit-phone-country-select`):**
- A labeled dropdown/select. Label: "Country".
- Shows a flag emoji/icon + dial code for each country (e.g., "🇺🇸 +1").
- Inline error area beneath the selector (`field-error-phoneCountryCode`).
- Pre-selected with the user's current country code, or empty if not set.

**Phone number input (`edit-phone-number-input`):**
- A labeled text input. Label: "Phone number".
- Inline error area beneath the input (`field-error-phoneNumber`).
- Pre-filled with the user's current phone number, or empty if not set.

**Timezone select (`edit-timezone-select`):**
- A labeled dropdown/select. Label: "Timezone".
- Options: standard IANA timezone list with GMT offset labels (e.g., "(GMT-7:00) America/Los_Angeles").
- Pre-selected with the user's current timezone.

**First day of week select (`edit-first-day-select`):**
- A labeled dropdown/select. Label: "First day of week".
- Options: "Monday", "Sunday".
- Pre-selected with the user's current setting (default: "Monday").

**Save button (`account-save-button`):**
- Text: "Save".
- Disabled during API submission (loading state).
- Disabled if any required field (first name, last name, timezone) is empty or invalid.

#### States

| State | Behavior |
|---|---|
| **Loading** | Skeleton/shimmer while `GET /api/account/settings` is in flight. Form fields and Save button are not displayed. |
| **Default** | Fields pre-filled with current values. Save button enabled. |
| **Field error** | After blur on an invalid field, inline error appears beneath it. Save blocked if required fields are invalid. |
| **Saving** | Save button disabled with loading indicator. Fields read-only. |
| **Saved** | Toast (`toast-account-saved`) shows "Settings saved". Fields retain new values. Save button re-enables. |
| **Server error** | Error message shows "Something went wrong. Please try again." Save re-enables. Fields retain values. |

#### Interactions

- **Blur on text fields:** runs client-side validation for that field (name rules from spec 01, phone format for selected country). If invalid, shows the specific error message in `field-error-{fieldName}`. If valid, clears any existing error.
- **Save click:** re-validates all fields client-side. If valid, sends `PUT /api/account/settings`.
- **Error clearing:** inline field errors clear when the user corrects the value and blurs. Server error messages clear when any field value changes.

#### Responsive Behavior

- The form has a max-width of ~600px and is horizontally centered on desktop.
- On narrow viewports the form spans the available width with horizontal padding.
- Field stacking remains vertical at all breakpoints — no side-by-side field layout.
- Phone country selector and number input are stacked vertically on narrow viewports.

### Change Email Modal

#### Layout

- Triggered by clicking the "Change email" button on the Account Settings page.
- A centered overlay modal with a backdrop. Max-width approximately 480px.
- Title: "Change email".
- The user's current email is displayed as read-only text above the input: "Current email: {currentEmail}".
- A single new email input field.
- A "Send confirmation" submit button below the field.
- An error message area (`change-email-error`) for server-returned errors.
- A confirmation message area (`change-email-confirmation-message`) for the success state.
- A close/cancel affordance (X button or "Cancel" link) to dismiss the modal.

#### Components

**Current email display:**
- Read-only text showing the user's current email address. Not editable.

**New email input (`change-email-new-input`):**
- A labeled text input. Label: "New email address".
- Inline error area beneath the input (`field-error-newEmail`).
- Client-side validation on blur: required, valid email format, max 254 characters.

**Submit button (`change-email-submit-button`):**
- Text: "Send confirmation".
- Disabled until the new email field is non-empty and passes client-side email format validation.
- Disabled during API submission (loading state).

#### States

| State | Behavior |
|---|---|
| **Default** | New email field empty, submit disabled. Current email displayed as read-only. |
| **Email invalid** | After blur on invalid email, inline error shown beneath the field. Submit disabled. |
| **Ready** | Valid email entered. Submit enabled. |
| **Loading** | After submit click, submit button disabled with loading indicator. Field read-only. |
| **Success** | Form fields and submit button are replaced by confirmation message: "A confirmation link has been sent to {newEmail}. Please check your inbox." Close/cancel still available. |
| **Server error** | Error message shown in `change-email-error`. Field retains value. Submit re-enables. Modal stays open. |

#### Interactions

- **Blur on email field:** runs email format validation. If invalid, shows the specific error message in `field-error-newEmail`. If valid, clears any existing error.
- **Submit click:** re-validates email client-side. If valid, sends `POST /api/account/change-email`.
- **Close/Cancel:** dismisses the modal, no API call. Form state is reset on next open.
- **Error message dismissal:** the error message in `change-email-error` clears when the user modifies the email field after a server error.

#### Responsive Behavior

- The modal has a max-width of ~480px and is horizontally centered via the overlay.
- On narrow viewports the modal spans the available width with horizontal padding, matching the form card pattern from specs 01 and 02.

### Change Password Modal

#### Layout

- Triggered by clicking the "Change password" button on the Account Settings page.
- A centered overlay modal with a backdrop. Max-width approximately 480px.
- Title: "Change password".
- Three password fields in top-to-bottom order: current password, new password, confirm new password.
- A "Change password" submit button below the fields.
- An error message area (`change-password-error`) for server-returned errors.
- A close/cancel affordance (X button or "Cancel" link) to dismiss the modal.

#### Components

**Current password input (`change-password-current-input`):**
- A labeled password input. Label: "Current password".
- Input type `password` (characters masked).
- Inline error area beneath the input (`field-error-currentPassword`).

**New password input (`change-password-new-input`):**
- A labeled password input. Label: "New password".
- Input type `password` (characters masked).
- Inline error area beneath the input (`field-error-newPassword`).

**Confirm password input (`change-password-confirm-input`):**
- A labeled password input. Label: "Confirm new password".
- Input type `password` (characters masked).
- Inline error area beneath the input (`field-error-passwordConfirmation`).

**Submit button (`change-password-submit-button`):**
- Text: "Change password".
- Disabled until all three fields are non-empty and pass client-side validation (password policy + confirmation match).
- Disabled during API submission (loading state).

#### States

| State | Behavior |
|---|---|
| **Default** | All fields empty. Submit disabled. |
| **Field error** | After blur, inline errors beneath respective fields (policy violations, confirmation mismatch). Submit disabled until resolved. |
| **Ready** | All fields non-empty and valid. Submit enabled. |
| **Loading** | After submit click, submit button disabled with loading indicator. Fields read-only. |
| **Success** | Form replaced by message: "Your password has been changed." Close/cancel still available. |
| **Server error** | Error message shown in `change-password-error`. Fields retain values. Submit re-enables. Modal stays open. |

#### Interactions

- **Blur on current password:** validates non-empty. If empty, shows "Current password is required" in `field-error-currentPassword`.
- **Blur on new password:** validates against password policy. If invalid, shows the specific policy error message in `field-error-newPassword`.
- **Blur on confirm password:** validates match with new password. If mismatch, shows "Passwords do not match" in `field-error-passwordConfirmation`.
- **Submit click:** re-validates all fields client-side. If valid, sends `POST /api/account/change-password`.
- **Close/Cancel:** dismisses the modal, no API call. Form state is reset on next open.
- **Error message dismissal:** the error message in `change-password-error` clears when the user modifies any field after a server error.

#### Responsive Behavior

- The modal has a max-width of ~480px and is horizontally centered via the overlay.
- On narrow viewports the modal spans the available width with horizontal padding.

### Email Confirmation Screen (`/account/confirm-email?token={token}`)

#### Layout

- Public page (no authentication required). Route: `/account/confirm-email?token={token}`.
- A vertically stacked card, centered horizontally on the page, with a max-width of approximately 480px.
- On page load, the system extracts the token from the URL query parameter and sends `POST /api/account/confirm-email` with the token.

#### Components

**Confirmation screen container (`confirm-email-screen`):**
- The wrapper element for the entire confirmation screen.

**Success message (`confirm-email-success-message`):**
- Text: "Your email has been updated."
- Displayed on successful confirmation.

**Login link (`confirm-email-login-link`):**
- Text: "Go to login". Navigates to `/login`.
- Displayed below the success message.

**Error message (`confirm-email-error`):**
- Displays the specific error message (expired, invalid, or email taken).
- No login link is displayed in the error state.

#### States

| State | Behavior |
|---|---|
| **Loading** | Spinner/skeleton while the token is being validated on page load. |
| **Success** | "Your email has been updated." displayed in `confirm-email-success-message`. "Go to login" link displayed. |
| **Error — expired** | "This confirmation link has expired" displayed in `confirm-email-error`. |
| **Error — invalid** | "This confirmation link is no longer valid" displayed in `confirm-email-error`. |
| **Error — email taken** | "This email is already in use" displayed in `confirm-email-error`. |

#### Responsive Behavior

- The card has a max-width of ~480px and is horizontally centered on desktop.
- On narrow viewports the card spans the available width with horizontal padding.

### Required `data-testid` Attributes

Account Settings page:
- `account-settings`
- `change-email-open-button`, `change-password-open-button`
- `edit-first-name-input`, `edit-last-name-input`, `edit-phone-country-select`, `edit-phone-number-input`, `edit-timezone-select`, `edit-first-day-select`
- `account-save-button`, `toast-account-saved`
- `field-error-firstName`, `field-error-lastName`, `field-error-phoneNumber`, `field-error-phoneCountryCode`, `field-error-timezone`, `field-error-firstDayOfWeek` (inline validation on settings page)

Change Email modal:
- `change-email-form`, `change-email-new-input`, `change-email-submit-button`
- `change-email-confirmation-message`, `change-email-error`
- `field-error-newEmail` (inline validation on change email modal)

Change Password modal:
- `change-password-form`, `change-password-current-input`, `change-password-new-input`, `change-password-confirm-input`
- `change-password-submit-button`, `change-password-error`
- `field-error-currentPassword`, `field-error-newPassword`, `field-error-passwordConfirmation` (inline validation on change password modal)

Email Confirmation screen:
- `confirm-email-screen`, `confirm-email-success-message`, `confirm-email-error`, `confirm-email-login-link`

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
  1. Invalid — fails policy ("Password must be at least 8 characters").
  2. Invalid — confirmation mismatch ("Passwords do not match").
  3. Valid.
  4. Invalid — exceeds 128-character maximum ("Password must be at most 128 characters").

### TC-06-UNIT-03: Phone format per country code
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate `"+1 (555) 123-4567"` with country US.
  2. Validate `"12345"` with country US.
  3. Validate empty phone (no number entered).
- **Expected Result:**
  1. Valid for US.
  2. Invalid — "Enter a valid phone number".
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
  1. Invalid — "First name is required".
  2. Invalid — "First name must be at most 50 characters".
  3. Invalid — "First name may contain only letters, hyphens, apostrophes, and spaces".
  4. Invalid — "First name may contain only letters, hyphens, apostrophes, and spaces".
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
  3. Invalid — "Invalid first day of week".
  4. Invalid — "Invalid first day of week".

### TC-06-UNIT-07: Password confirmation mismatch variations
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate new `"NewPass1"` / confirm `""`.
  2. Validate new `"NewPass1"` / confirm `"newpass1"` (case differs).
  3. Validate new `"NewPass1"` / confirm `"NewPass1"` (exact match).
- **Expected Result:**
  1. Invalid — "Please confirm your new password".
  2. Invalid — "Passwords do not match".
  3. Valid.

### TC-06-UNIT-08: Same-as-current email guard
- **Level:** Unit
- **Preconditions:** user's current email is `"pat@acme.com"`.
- **Steps:**
  1. Request change to `"pat@acme.com"`.
  2. Request change to `"PAT@ACME.COM"`.
  3. Request change to `"new@acme.com"`.
- **Expected Result:**
  1. Rejected — "This is already your email address".
  2. Rejected — "This is already your email address" (case-insensitive match after normalization).
  3. Accepted (different email).

### TC-06-UNIT-09: Email change token expiry calculation
- **Level:** Unit
- **Preconditions:** a token issued at time `T`.
- **Steps:**
  1. Evaluate validity at `T + 23 hours`.
  2. Evaluate validity at `T + 24 hours` (exact boundary).
  3. Evaluate validity at `T + 25 hours`.
- **Expected Result:**
  1. At +23h the token is still valid.
  2. At +24h the token is expired (expiry is exclusive).
  3. At +25h the token is expired.

### TC-06-UNIT-10: Phone number with missing country code
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate phone number `"(555) 123-4567"` with no country code selected.
  2. Validate phone number `""` with no country code selected.
  3. Validate phone number `"(555) 123-4567"` with country code `"US"`.
- **Expected Result:**
  1. Invalid — "Select a country code".
  2. Valid — both empty, phone is optional.
  3. Valid.

### TC-06-UNIT-11: Empty password fields
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate current password `""` (empty).
  2. Validate new password `""` (empty) / confirm `""`.
  3. Validate current password `"Passw0rd"`, new password `"NewPass1"`, confirm `"NewPass1"`.
- **Expected Result:**
  1. Invalid — "Current password is required".
  2. Invalid — "Password is required".
  3. Valid.

### TC-06-UNIT-12: Timezone validation
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate timezone `""` (empty / not selected).
  2. Validate timezone `"America/New_York"`.
  3. Validate timezone `"Europe/London"`.
- **Expected Result:**
  1. Invalid — "Timezone is required".
  2. Valid.
  3. Valid.

### TC-06-UNIT-13: Email max-length boundary
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate a new email of 254 characters (valid format).
  2. Validate a new email of 255 characters (valid format).
- **Expected Result:**
  1. Valid (boundary — 254 is the maximum).
  2. Invalid — "Email must be at most 254 characters".

### TC-06-INT-01: Change email requires confirmation before it takes effect and notifies old address
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com`; `new@acme.com` is unused.
- **Steps:**
  1. Call `POST /api/account/change-email` with `{ "newEmail": "new@acme.com" }`.
  2. Inspect the test mail sink.
  3. Immediately attempt to log in with `new@acme.com`.
  4. Call `POST /api/account/confirm-email` with the token from the confirmation email.
  5. Log in with `new@acme.com`; then attempt login with the old `pat@acme.com`.
- **Expected Result:**
  1. Step 1 returns success (HTTP 200) with `{ "message": "A confirmation link has been sent to your new email address" }`; the account's login email is still `pat@acme.com`.
  2. Step 2 shows two emails: confirmation to `new@acme.com`, notification to `pat@acme.com`.
  3. Step 3 login as `new@acme.com` fails (not yet effective).
  4. After step 4 the login email becomes `new@acme.com`.
  5. Login with `new@acme.com` succeeds; login with `pat@acme.com` fails.

### TC-06-INT-02: Change password requires the correct current password
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com` with current password `"Passw0rd"`.
- **Steps:**
  1. Call `POST /api/account/change-password` with `{ "currentPassword": "wrong", "newPassword": "NewPass1", "passwordConfirmation": "NewPass1" }`.
  2. Call `POST /api/account/change-password` with `{ "currentPassword": "Passw0rd", "newPassword": "NewPass1", "passwordConfirmation": "NewPass1" }`.
  3. Log in with the new password.
- **Expected Result:**
  1. Step 1 rejected (HTTP 400) with `{ "message": "Current password is incorrect" }`; password unchanged.
  2. Step 2 succeeds (HTTP 200); password updated.
  3. Login with `"NewPass1"` succeeds.

### TC-06-INT-03: Email change token expires after 24 hours
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com`; `new@acme.com` is unused; email change requested with token T.
- **Steps:**
  1. Wait (or simulate) 25 hours after token issuance.
  2. Call `POST /api/account/confirm-email` with token T.
- **Expected Result:**
  1. Confirmation rejected (HTTP 400) with `{ "message": "This confirmation link has expired" }`.
  2. Account email remains `pat@acme.com`.

### TC-06-INT-04: Email change fails if new email is taken before confirmation
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com`; email change to `new@acme.com` requested with token T.
- **Steps:**
  1. Another user signs up with `new@acme.com` (or claims it via their own email change).
  2. Call `POST /api/account/confirm-email` with token T.
- **Expected Result:**
  1. Confirmation rejected (HTTP 400) with `{ "message": "This email is already in use" }`.
  2. Account email remains `pat@acme.com`.
  3. Token is NOT consumed — remains valid for retry if the email is freed.

### TC-06-INT-05: Second email change request invalidates first token
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com`.
- **Steps:**
  1. Call `POST /api/account/change-email` with `{ "newEmail": "new1@acme.com" }` → token T1 issued.
  2. Call `POST /api/account/change-email` with `{ "newEmail": "new2@acme.com" }` → token T2 issued.
  3. Call `POST /api/account/confirm-email` with T1.
  4. Call `POST /api/account/confirm-email` with T2.
- **Expected Result:**
  1. T1 is invalidated when T2 is issued.
  2. Step 3 rejected (HTTP 400) with `{ "message": "This confirmation link is no longer valid" }`.
  3. Step 4 succeeds; email becomes `new2@acme.com`.

### TC-06-INT-06: Change password revokes other sessions but keeps current
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com` on device A (session S1) and device B (session S2); changing password from device A.
- **Steps:**
  1. Call `POST /api/account/change-password` from session S1 with correct current password.
  2. Make a request using session S1 (current device).
  3. Make a request using session S2 (other device).
- **Expected Result:**
  1. Password change succeeds (HTTP 200).
  2. S1 is still valid (current session preserved).
  3. S2 is rejected (revoked — SecurityStamp mismatch).

### TC-06-INT-07: Email change to uppercase normalizes correctly
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com`; `NEW@ACME.COM` is unused.
- **Steps:**
  1. Call `POST /api/account/change-email` with `{ "newEmail": "NEW@ACME.COM" }`.
  2. Confirm the change via token.
  3. Log in with `new@acme.com`.
- **Expected Result:**
  1. Confirmation email sent to the address; stored as `new@acme.com`.
  2. After confirmation, login email is `new@acme.com`.
  3. Login succeeds.

### TC-06-INT-08: Change email to current email rejected
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com`.
- **Steps:**
  1. Call `POST /api/account/change-email` with `{ "newEmail": "pat@acme.com" }`.
  2. Call `POST /api/account/change-email` with `{ "newEmail": "PAT@ACME.COM" }`.
- **Expected Result:**
  1. Rejected (HTTP 400) with `{ "message": "This is already your email address" }`.
  2. Rejected (HTTP 400) with `{ "message": "This is already your email address" }` (case-insensitive match).

### TC-06-INT-09: Confirm email — public endpoint, no auth required
- **Level:** Integration
- **Preconditions:** `pat@acme.com` requested email change to `new@acme.com` with token T.
- **Steps:**
  1. Call `POST /api/account/confirm-email` with token T **without** an authentication cookie.
- **Expected Result:**
  1. Succeeds (HTTP 200) with `{ "message": "Your email has been updated" }`.
  2. Account email is now `new@acme.com`.

### TC-06-INT-10: Change password with confirmation mismatch rejected
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com` with current password `"Passw0rd"`.
- **Steps:**
  1. Call `POST /api/account/change-password` with `{ "currentPassword": "Passw0rd", "newPassword": "NewPass1", "passwordConfirmation": "NewPass2" }`.
- **Expected Result:**
  1. Rejected (HTTP 400) with `{ "message": "Passwords do not match" }`; password unchanged.

### TC-06-INT-11: Change password with policy-violating new password rejected
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com` with current password `"Passw0rd"`.
- **Steps:**
  1. Call `POST /api/account/change-password` with `{ "currentPassword": "Passw0rd", "newPassword": "short", "passwordConfirmation": "short" }`.
  2. Call `POST /api/account/change-password` with `{ "currentPassword": "Passw0rd", "newPassword": "nDigits!", "passwordConfirmation": "nDigits!" }`.
  3. Call `POST /api/account/change-password` with `{ "currentPassword": "Passw0rd", "newPassword": "12345678", "passwordConfirmation": "12345678" }`.
- **Expected Result:**
  1. Rejected (HTTP 400) with `{ "message": "Password must be at least 8 characters" }`.
  2. Rejected (HTTP 400) with `{ "message": "Password must contain at least one digit" }`.
  3. Rejected (HTTP 400) with `{ "message": "Password must contain at least one letter" }`.

### TC-06-INT-12: Edit information — phone validation per country at API level
- **Level:** Integration
- **Preconditions:** logged in as any user.
- **Steps:**
  1. Call `PUT /api/account/settings` with `phoneCountryCode: "US"`, `phoneNumber: "(555) 123-4567"` and valid name/timezone fields.
  2. Call `PUT /api/account/settings` with `phoneCountryCode: "US"`, `phoneNumber: "12345"` and valid name/timezone fields.
  3. Call `PUT /api/account/settings` with `phoneCountryCode: null`, `phoneNumber: null` and valid name/timezone fields.
- **Expected Result:**
  1. Succeeds (HTTP 200).
  2. Rejected (HTTP 400) with `{ "errors": { "phoneNumber": "Enter a valid phone number" } }`.
  3. Succeeds (HTTP 200) — phone cleared.

### TC-06-INT-13: Edit information — name validation at API level
- **Level:** Integration
- **Preconditions:** logged in as any user.
- **Steps:**
  1. Call `PUT /api/account/settings` with `firstName: ""`, valid last name, and valid timezone.
  2. Call `PUT /api/account/settings` with `firstName: "Pat2"`, valid last name, and valid timezone.
  3. Call `PUT /api/account/settings` with valid first name, `lastName: ""`, and valid timezone.
- **Expected Result:**
  1. Rejected (HTTP 400) with `{ "errors": { "firstName": "First name is required" } }`.
  2. Rejected (HTTP 400) with `{ "errors": { "firstName": "First name may contain only letters, hyphens, apostrophes, and spaces" } }`.
  3. Rejected (HTTP 400) with `{ "errors": { "lastName": "Last name is required" } }`.

### TC-06-INT-14: Unauthenticated access to account settings rejected
- **Level:** Integration
- **Preconditions:** no authentication cookie.
- **Steps:**
  1. Call `GET /api/account/settings` without authentication.
  2. Call `PUT /api/account/settings` without authentication.
  3. Call `POST /api/account/change-email` without authentication.
  4. Call `POST /api/account/change-password` without authentication.
- **Expected Result:**
  1. All four requests rejected (HTTP 401).

### TC-06-INT-15: Edit information persists and returns on GET
- **Level:** Integration
- **Preconditions:** logged in as any user.
- **Steps:**
  1. Call `PUT /api/account/settings` with `{ "firstName": "Dima", "lastName": "Bezzubenkov", "phoneCountryCode": "US", "phoneNumber": "(555) 123-4567", "timezone": "America/Los_Angeles", "firstDayOfWeek": "Sunday" }`.
  2. Call `GET /api/account/settings`.
- **Expected Result:**
  1. Step 1 succeeds (HTTP 200).
  2. Step 2 returns all values as set: `firstName: "Dima"`, `lastName: "Bezzubenkov"`, `phoneCountryCode: "US"`, `phoneNumber: "(555) 123-4567"`, `timezone: "America/Los_Angeles"`, `firstDayOfWeek: "Sunday"`.

### TC-06-INT-16: Change email to an email already in use at request time
- **Level:** Integration
- **Preconditions:** logged in as `pat@acme.com`; `taken@acme.com` is registered to another account.
- **Steps:**
  1. Call `POST /api/account/change-email` with `{ "newEmail": "taken@acme.com" }`.
- **Expected Result:**
  1. Rejected (HTTP 400) with `{ "message": "This email is already in use" }`.
  2. No `PendingEmailChange` record created; no emails dispatched.

### TC-06-INT-17: Edit information — timezone and first-day-of-week validation at API level
- **Level:** Integration
- **Preconditions:** logged in as any user.
- **Steps:**
  1. Call `PUT /api/account/settings` with valid name fields, `timezone: ""`, `firstDayOfWeek: "Monday"`.
  2. Call `PUT /api/account/settings` with valid name fields, `timezone: "America/New_York"`, `firstDayOfWeek: "Saturday"`.
  3. Call `PUT /api/account/settings` with valid name fields, `timezone: "America/New_York"`, `firstDayOfWeek: "Monday"`.
- **Expected Result:**
  1. Rejected (HTTP 400) with `{ "errors": { "timezone": "Timezone is required" } }`.
  2. Rejected (HTTP 400) with `{ "errors": { "firstDayOfWeek": "Invalid first day of week" } }`.
  3. Succeeds (HTTP 200).

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
  1. After step 5 a "Settings saved" toast appears.
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
  1. After step 2 the modal shows "A confirmation link has been sent to new@acme.com. Please check your inbox."
  2. After step 3 the confirmation screen shows "Your email has been updated."
  3. Step 4 login with the new email succeeds.
- **Selectors:** `change-email-open-button`, `change-email-new-input`, `change-email-submit-button`, `change-email-confirmation-message`, `confirm-email-screen`, `confirm-email-success-message`, `confirm-email-login-link`, `login-email-input`, `login-password-input`, `login-submit-button`.

### TC-06-E2E-03: Change-password with wrong current password shows an error
- **Level:** E2E
- **Preconditions:** logged in as a user with current password `"Passw0rd"`.
- **Steps:**
  1. Open Account settings and click "Change password".
  2. Enter current `"wrong"`, new `"NewPass1"`, confirm `"NewPass1"`, submit.
- **Expected Result:**
  1. The modal shows "Current password is incorrect" in `change-password-error`. The password is not changed.
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
  1. After step 4 a "Settings saved" toast appears.
  2. After reload the country is US and the phone number is retained.
- **Selectors:** `account-settings`, `edit-phone-country-select`, `edit-phone-number-input`, `account-save-button`, `toast-account-saved`.

### TC-06-E2E-05: First name validation error shown inline
- **Level:** E2E
- **Preconditions:** logged in as any user.
- **Steps:**
  1. Open Account settings.
  2. Change First name to "Pat2" (contains digit).
  3. Tab away from the first name field to trigger blur validation.
- **Expected Result:**
  1. An inline error appears beneath the first name field: "First name may contain only letters, hyphens, apostrophes, and spaces".
  2. Save is blocked until the error is corrected.
- **Selectors:** `account-settings`, `edit-first-name-input`, `field-error-firstName`, `account-save-button`.

### TC-06-E2E-06: Email confirmation screen — valid token
- **Level:** E2E
- **Preconditions:** `pat@acme.com` requested email change to `new@acme.com`; confirmation email sent.
- **Steps:**
  1. Navigate to `/account/confirm-email?token={validToken}` (from the confirmation email link).
- **Expected Result:**
  1. The screen shows "Your email has been updated" in `confirm-email-success-message`.
  2. A "Go to login" link (`confirm-email-login-link`) is displayed.
- **Selectors:** `confirm-email-screen`, `confirm-email-success-message`, `confirm-email-login-link`.

### TC-06-E2E-07: Email confirmation screen — expired token
- **Level:** E2E
- **Preconditions:** an email change confirmation token that has expired (> 24 hours old).
- **Steps:**
  1. Navigate to `/account/confirm-email?token={expiredToken}`.
- **Expected Result:**
  1. The screen shows "This confirmation link has expired" in `confirm-email-error`.
  2. No success message or login link is displayed.
- **Selectors:** `confirm-email-screen`, `confirm-email-error`.

### TC-06-E2E-08: Email confirmation screen — invalid token
- **Level:** E2E
- **Preconditions:** none (using a fabricated/invalid token).
- **Steps:**
  1. Navigate to `/account/confirm-email?token=invalid-garbage-token`.
- **Expected Result:**
  1. The screen shows "This confirmation link is no longer valid" in `confirm-email-error`.
  2. No success message or login link is displayed.
- **Selectors:** `confirm-email-screen`, `confirm-email-error`.

### TC-06-E2E-09: Change password happy path
- **Level:** E2E
- **Preconditions:** logged in as a user with current password `"Passw0rd"`.
- **Steps:**
  1. Open Account settings and click "Change password".
  2. Enter current `"Passw0rd"`, new `"NewPass1"`, confirm `"NewPass1"`.
  3. Click "Change password".
- **Expected Result:**
  1. The modal shows "Your password has been changed."
  2. Logging out and back in with `"NewPass1"` succeeds.
- **Selectors:** `change-password-open-button`, `change-password-current-input`, `change-password-new-input`, `change-password-confirm-input`, `change-password-submit-button`.

### TC-06-E2E-10: Change password — confirmation mismatch shows inline error
- **Level:** E2E
- **Preconditions:** logged in as any user.
- **Steps:**
  1. Open Account settings and click "Change password".
  2. Enter current password, new `"NewPass1"`, confirm `"NewPass2"`.
  3. Tab away from the confirm field to trigger blur validation.
- **Expected Result:**
  1. `field-error-passwordConfirmation` shows "Passwords do not match".
  2. Submit button remains disabled.
- **Selectors:** `change-password-open-button`, `change-password-new-input`, `change-password-confirm-input`, `change-password-submit-button`, `field-error-passwordConfirmation`.

### TC-06-E2E-11: Change email — same as current email shows error
- **Level:** E2E
- **Preconditions:** logged in as `pat@acme.com`.
- **Steps:**
  1. Open Account settings and click "Change email".
  2. Enter `pat@acme.com` as the new email and submit.
- **Expected Result:**
  1. The modal shows "This is already your email address" in `change-email-error`.
  2. No confirmation email is sent.
- **Selectors:** `change-email-open-button`, `change-email-new-input`, `change-email-submit-button`, `change-email-error`.
