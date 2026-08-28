---
id: "01"
title: Organization Creation
routes: ["/signup"]
api: ["POST /api/signup"]
entities: [Account, Organization, Membership]
tags: [signup, registration, org-creation, admin-role, password-policy, name-validation, email-validation]
depends-on: []
---

# 01 — Organization Creation

## Summary

Any new person can sign up for Devscribed.Admin and, as part of signing up, create their own organization. Signup and organization creation are a single flow: the account (login credentials) and the organization are created together, and the creator is automatically made the organization's first `admin`. This is the entry point to the product — no other user-management feature can happen until an account and an organization exist.

## Actors & Preconditions

- **Actor:** an unauthenticated visitor (prospective organization owner).
- **Preconditions:** the visitor has a valid email address that is not already registered to an account.

## User Flow

### Main Flow: Visitor signs up and creates an organization

1. Visitor navigates to `/signup` directly, or clicks the "Create an account" link on the login page (`/login`).
2. System displays the signup form with all fields empty. The "Create account" submit button is enabled.
3. Visitor fills in the fields: organization name, first name, last name, email, password. As the visitor leaves each field (blur), the system runs that field's client-side validation. If the value is invalid, the specific error message appears inline beneath the field immediately.
4. No field errors remain.
5. Visitor clicks "Create account".
6. System re-validates all fields client-side. If any field is invalid, all relevant inline errors are shown at once, keyboard focus moves to the first invalid field in top-to-bottom order, and submission is blocked.
7. System sends the signup payload to the API. The submit button is disabled and a loading indicator is shown to prevent double-submission. The API validates the payload server-side, atomically creates the account, organization, and admin membership, stores the browser-detected timezone, and returns an authenticated session.
8. System redirects the visitor (now authenticated) to the Members list screen. No success toast or intermediate confirmation is shown.

### Alternative Flow A: Duplicate email (branches from step 7)

7a. The API returns a validation error indicating the email is already registered. The system displays the error banner (`signup-error-banner`) with "This email is already registered." The form fields retain their values and the submit button re-enables so the visitor can correct the email.

### Alternative Flow B: Inline validation failure on blur (branches from step 3)

3a. When the visitor tabs or clicks out of a field with an invalid or empty value, the specific error message appears beneath that field in `field-error-{fieldName}`. The submit button stays enabled; submitting with an outstanding error re-runs validation and blocks the request.

### Alternative Flow C: Server error (branches from step 7)

7b. If the API returns a 5xx or network error, the error banner shows "Something went wrong. Please try again." The form fields retain their values and the submit button re-enables.

### Alternative Flow D: Entry from login page (branches from step 1)

1a. Visitor is on the login page and clicks the "Create an account" link. The browser navigates to `/signup` and the signup form is displayed.

## Functional Requirements

1. A visitor can create an account by providing: email, password, first name, last name, and an organization name.
2. Email must be a syntactically valid email address, is normalized to lowercase before storage and uniqueness checks, and must be unique across all accounts. Attempting to sign up with an email that already has an account (case-insensitive) is rejected with a clear error.
3. **Password policy:** minimum 8 characters, maximum 128 characters, at least one letter and one digit. Empty or policy-violating passwords are rejected.
4. **Name validation:** first name and last name are required, trimmed of surrounding whitespace, must be non-empty after trimming, must be between 1 and 50 characters, and may contain only letters, hyphens, apostrophes, and spaces. Names containing digits or other special characters are rejected.
5. Organization name is required, is trimmed of surrounding whitespace, must be non-empty after trimming, and must not exceed 100 characters.
6. On successful signup the system atomically creates: (a) the account, (b) the organization, and (c) a membership linking the account to the organization with role `admin` and status `active`. If any part fails, none is persisted.
7. The creator is the organization's first `admin`. There is no separate "owner" concept — org control is expressed purely through the `admin` role.
8. A given account belongs to exactly one organization at a time (single-org-per-user model). A newly signed-up account is a member only of the organization it just created.
9. After successful signup the creator is authenticated and lands on the Members list screen.
10. The organization's `createdAt` and the membership's "joined" date are recorded at creation time.
11. The user's timezone is auto-detected from the browser at signup (via `Intl.DateTimeFormat().resolvedOptions().timeZone`) and stored on the account.
12. Email verification of the creator's own address is not required to complete signup in this release.
13. **Email format validation:** email must conform to a standard `local@domain.tld` pattern (at least one character before `@`, a domain with at least one dot, and a TLD). Email must not exceed 254 characters. Validation is enforced both client-side (on blur and on submit) and server-side on the API.
14. **Field-specific error messages:** each validation rule produces a specific, deterministic error message. The complete set:

    | Field | Rule | Error message |
    |---|---|---|
    | Organization name | empty / whitespace-only | "Organization name is required" |
    | Organization name | > 100 characters | "Organization name must be at most 100 characters" |
    | First name | empty / whitespace-only | "First name is required" |
    | First name | > 50 characters | "First name must be at most 50 characters" |
    | First name | invalid characters | "First name may contain only letters, hyphens, apostrophes, and spaces" |
    | Last name | empty / whitespace-only | "Last name is required" |
    | Last name | > 50 characters | "Last name must be at most 50 characters" |
    | Last name | invalid characters | "Last name may contain only letters, hyphens, apostrophes, and spaces" |
    | Email | empty | "Email is required" |
    | Email | invalid format | "Enter a valid email address" |
    | Email | > 254 characters | "Email must be at most 254 characters" |
    | Email | already registered (server) | "This email is already registered" |
    | Password | empty | "Password is required" |
    | Password | < 8 characters | "Password must be at least 8 characters" |
    | Password | > 128 characters | "Password must be at most 128 characters" |
    | Password | no letter | "Password must contain at least one letter" |
    | Password | no digit | "Password must contain at least one digit" |

15. **Submit availability:** the "Create account" button is never disabled for validation reasons. Clicking it with an invalid or empty form runs the full client-side validation, renders every applicable inline error at once, and moves keyboard focus to the first invalid field in top-to-bottom order (organization name → first name → last name → email → password). No request is sent. The button is disabled only while a submission is in flight, to prevent double-submit.
16. **Inline validation timing:** client-side validation fires on blur (when the visitor leaves a field) and again on form submission. Errors appear inline beneath the respective field via `field-error-{fieldName}`. Server-side errors (e.g., duplicate email) appear in the error banner (`signup-error-banner`). The error banner clears when the visitor modifies any field value after a server error is shown.

## UI Description

### Layout

- Single-page form at route `/signup`.
- Entry points: direct navigation to `/signup`, or a "Create an account" link on the login page (`/login`).
- A vertically stacked form card, centered horizontally on the page, with a max-width of approximately 480px.
- Fields in top-to-bottom order: Organization name, First name, Last name, Email, Password.
- A "Create account" submit button below the fields.
- An error banner area above the form for server-side errors (`signup-error-banner`).
- A "Already have an account? Sign in" link below the submit button, navigating to `/login`.

### Components

Each field is a labeled text input with:
- A visible label above the input.
- An inline error message area beneath the input (hidden by default, shown on validation failure via `field-error-{fieldName}`).

**Password field:**
- Input type `password` by default (characters masked).
- A show/hide toggle button (eye icon) at the trailing edge of the input (`signup-password-toggle`).
- Hidden (masked) by default. Clicking the toggle reveals the password text (`type="text"`) and changes the icon to indicate "hide." Clicking again re-masks.

**Submit button ("Create account"):**
- Always enabled, regardless of field state. Clicking with an invalid form surfaces all inline errors and focuses the first invalid field.
- Disabled during API submission (loading state) to prevent double-submit.

### States

| State | Behavior |
|---|---|
| **Default** | All fields empty, no errors shown, submit button enabled. |
| **Partially filled** | Some fields have values. Submit stays enabled; clicking it validates everything and blocks the request if anything fails. |
| **Field error** | After blur on an invalid field, the specific error message appears beneath that field. The field shows a visual error indicator (e.g., red border). Correcting the value and blurring again clears the error. |
| **Submit-blocked** | Submit was clicked with an invalid form: every applicable inline error is shown at once and focus sits in the first invalid field. No request was sent. |
| **Loading** | After submit click, the submit button is disabled with a loading indicator. Form fields are read-only during submission. |
| **Server error** | The error banner appears above the form with the server error message. Form fields retain their values. Submit button re-enables. The banner clears when the visitor edits any field. |
| **Success** | Immediate redirect to the Members list screen. No toast or confirmation message is shown on the signup page. |

### Interactions

- **Blur on any field:** runs that field's client-side validation. If invalid, shows the field-specific error message in `field-error-{fieldName}`. If valid, clears any existing error for that field.
- **Submit click:** re-runs all field validations. If any fail, shows all relevant inline errors, moves focus to the first invalid field, and blocks submission. If all pass, sends the API request and enters the loading state.
- **Password toggle click:** toggles the password input between `type="password"` (masked) and `type="text"` (visible). The icon changes to reflect the current state.
- **Error banner dismissal:** the error banner clears automatically when the visitor modifies any field value after a server error.

### Responsive Behavior

- The form card has a max-width of ~480px and is horizontally centered on desktop.
- On narrow viewports the form spans the available width with horizontal padding.
- Field stacking remains vertical at all breakpoints — no side-by-side field layout.

### Required `data-testid` Attributes

- `signup-form`
- `signup-org-name-input`
- `signup-first-name-input`
- `signup-last-name-input`
- `signup-email-input`
- `signup-password-input`
- `signup-password-toggle`
- `signup-submit-button`
- `signup-error-banner`
- `signup-login-link` — the "Sign in" link on `/signup`. The reverse link, on `/login`, is `login-signup-link` (spec 02).
- `field-error-{fieldName}` (e.g. `field-error-email`, `field-error-orgName`, `field-error-firstName`, `field-error-lastName`, `field-error-password`)

## Out of Scope

- Inviting other members.
- Multiple organizations per account.
- Organization-level settings/branding beyond the name.
- Email verification of the creator's address at signup time.

## Test Cases

### TC-01-UNIT-01: Organization-name validation
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate an empty string `""`.
  2. Validate a whitespace-only string `"   "`.
  3. Validate a 101-character string.
  4. Validate a normal name `"Acme Inc"`.
  5. Validate a padded name `"  Acme Inc  "`.
  6. Validate a 100-character string (boundary).
- **Expected Result:**
  1. Empty → invalid ("Organization name is required").
  2. Whitespace-only → invalid (trimmed to empty → "Organization name is required").
  3. 101 chars → invalid ("Organization name must be at most 100 characters").
  4. `"Acme Inc"` → valid.
  5. `"  Acme Inc  "` → valid, normalized to `"Acme Inc"`.
  6. 100 chars → valid (boundary).

### TC-01-UNIT-02: Creator is assigned the admin role
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Build a new-organization creation input for a fresh account and invoke the creator-membership factory/logic.
- **Expected Result:**
  1. The produced membership has role `admin` and status `active`.

### TC-01-UNIT-03: First and last name validation
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate an empty string `""`.
  2. Validate a whitespace-only string `"   "`.
  3. Validate a 51-character name.
  4. Validate a name with digits `"John2"`.
  5. Validate a name with special characters `"John@Doe"`.
  6. Validate a simple name `"Pat"`.
  7. Validate a hyphenated name `"Mary-Jane"`.
  8. Validate a name with apostrophe `"O'Brien"`.
  9. Validate a name with spaces `"Mary Jane"`.
  10. Validate a padded name `"  Pat  "`.
  11. Validate a 50-character name (boundary).
  12. Validate a single-character name `"X"`.
- **Expected Result:**
  1. Empty → invalid ("First name is required" / "Last name is required").
  2. Whitespace-only → invalid (trimmed to empty).
  3. 51 chars → invalid ("First name must be at most 50 characters" / "Last name must be at most 50 characters").
  4. Digits → invalid ("First name may contain only letters, hyphens, apostrophes, and spaces").
  5. Special chars → invalid (same message as step 4).
  6. `"Pat"` → valid.
  7. `"Mary-Jane"` → valid.
  8. `"O'Brien"` → valid.
  9. `"Mary Jane"` → valid.
  10. `"  Pat  "` → valid, normalized to `"Pat"`.
  11. 50 chars → valid (boundary).
  12. `"X"` → valid.

### TC-01-UNIT-04: Email normalization
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Normalize `"PAT@ACME.COM"`.
  2. Normalize `"Pat.Owner@Acme.Com"`.
  3. Normalize `"pat@acme.com"` (already lowercase).
- **Expected Result:**
  1. → `"pat@acme.com"`.
  2. → `"pat.owner@acme.com"`.
  3. → `"pat@acme.com"` (unchanged).

### TC-01-UNIT-05: Password policy at signup
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate `""` (empty).
  2. Validate `"Pass1"` (5 chars — too short).
  3. Validate `"Passwor1"` (exactly 8 chars, has letter + digit).
  4. Validate `"abcdefgh"` (8 chars, letters only, no digit).
  5. Validate `"12345678"` (8 chars, digits only, no letter).
  6. Validate a 128-character password with letters and digits (boundary).
  7. Validate a 129-character password.
- **Expected Result:**
  1. Empty → invalid ("Password is required").
  2. Too short → invalid ("Password must be at least 8 characters").
  3. Valid.
  4. Invalid ("Password must contain at least one digit").
  5. Invalid ("Password must contain at least one letter").
  6. 128 chars → valid (boundary).
  7. 129 chars → invalid ("Password must be at most 128 characters").

### TC-01-UNIT-06: Email format and length validation
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate `""` (empty).
  2. Validate `"not-an-email"` (no `@`).
  3. Validate `"missing@"` (no domain).
  4. Validate `"@nodomain.com"` (no local part).
  5. Validate `"user@example"` (no TLD dot).
  6. Validate `"user@example.com"` (valid).
  7. Validate a 254-character email (boundary — valid).
  8. Validate a 255-character email (over limit).
- **Expected Result:**
  1. Empty → invalid ("Email is required").
  2. No `@` → invalid ("Enter a valid email address").
  3. No domain → invalid ("Enter a valid email address").
  4. No local part → invalid ("Enter a valid email address").
  5. No TLD → invalid ("Enter a valid email address").
  6. `"user@example.com"` → valid.
  7. 254 chars → valid (boundary).
  8. 255 chars → invalid ("Email must be at most 254 characters").

### TC-01-UNIT-07: Password error messages are rule-specific
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate `""`.
  2. Validate `"short1"` (6 chars, has letter + digit).
  3. Validate `"abcdefgh"` (8 chars, no digit).
  4. Validate `"12345678"` (8 chars, no letter).
  5. Validate a 129-character password with letters and digits.
- **Expected Result:**
  1. Error message is exactly "Password is required".
  2. Error message is exactly "Password must be at least 8 characters".
  3. Error message is exactly "Password must contain at least one digit".
  4. Error message is exactly "Password must contain at least one letter".
  5. Error message is exactly "Password must be at most 128 characters".

### TC-01-INT-01: Signup creates account + org + admin membership atomically
- **Level:** Integration
- **Preconditions:** email `owner@acme.com` is not registered; empty database (or clean tenant).
- **Steps:**
  1. Call the signup endpoint with a valid org name, name, `owner@acme.com`, and a valid password.
  2. Query the database for the account, the organization, and the membership.
- **Expected Result:**
  1. Response is success (HTTP 2xx) and returns an authenticated session/token.
  2. Exactly one account exists for `owner@acme.com` (stored lowercase).
  3. Exactly one organization exists with the supplied name.
  4. Exactly one membership exists linking that account to that organization with role `admin`, status `active`, and a recorded joined date.

### TC-01-INT-02: Duplicate email is rejected without partial writes
- **Level:** Integration
- **Preconditions:** an account already exists for `owner@acme.com`.
- **Steps:**
  1. Call the signup endpoint with `owner@acme.com` and an otherwise-valid payload (different org name).
  2. Query the database for organizations.
- **Expected Result:**
  1. Response is a validation error (HTTP 4xx) with error message "This email is already registered".
  2. No new organization and no new membership were created.

### TC-01-INT-03: Duplicate email is case-insensitive
- **Level:** Integration
- **Preconditions:** an account already exists for `owner@acme.com`.
- **Steps:**
  1. Call the signup endpoint with `OWNER@ACME.COM` and an otherwise-valid payload.
  2. Call the signup endpoint with `Owner@Acme.Com` and an otherwise-valid payload.
- **Expected Result:**
  1. Both rejected with "This email is already registered" — case-insensitive match.
  2. No new accounts, organizations, or memberships created.

### TC-01-INT-04: Timezone auto-detected and stored on signup
- **Level:** Integration
- **Preconditions:** browser reports timezone `America/New_York`.
- **Steps:**
  1. Call the signup endpoint with a valid payload, including the browser-detected timezone.
  2. Query the created account.
- **Expected Result:**
  1. The account's timezone is stored as `America/New_York`.

### TC-01-E2E-01: Sign up and land in the new organization as sole admin
- **Level:** E2E
- **Preconditions:** email `owner@acme.com` is not registered.
- **Steps:**
  1. Open the signup form.
  2. Fill organization name "Acme Inc", first name "Pat", last name "Owner", email `owner@acme.com`, and a valid password.
  3. Submit the form.
  4. Verify the user lands on the Members list.
- **Expected Result:**
  1. After step 3 the user is authenticated and lands on the Members list.
  2. After step 4 the Members list shows exactly one active member, "Pat Owner", with role `admin`.
- **Selectors:** `signup-form`, `signup-org-name-input`, `signup-first-name-input`, `signup-last-name-input`, `signup-email-input`, `signup-password-input`, `signup-submit-button`, `members-list`, `member-row-{id}`.

### TC-01-E2E-02: Signup with validation errors shows inline errors with specific messages
- **Retired.** Covered by TC-01-INT-04, which asserts the same per-field errors from the endpoint that decides them. The message strings themselves live in `packages/validation` and are unit-tested there; a browser re-reading them proves only that the shared copy was imported.

### TC-01-E2E-03: Inline validation fires on blur and clears on correction
- **Level:** E2E
- **Preconditions:** none.
- **Steps:**
  1. Open the signup form.
  2. Click into the email field, type nothing, then tab out (blur).
  3. Verify `field-error-email` shows "Email is required".
  4. Click into the email field, type `"bad"`, then tab out.
  5. Verify `field-error-email` shows "Enter a valid email address".
  6. Clear the email field, type `"user@example.com"`, then tab out.
  7. Verify `field-error-email` is not visible.
- **Expected Result:**
  1. Empty email on blur → "Email is required" shown.
  2. Invalid email on blur → "Enter a valid email address" shown.
  3. Valid email on blur → error clears.
- **Selectors:** `signup-form`, `signup-email-input`, `field-error-email`.

### TC-01-E2E-04: Password show/hide toggle
- **Retired.** Duplicate mechanism. The password reveal toggle is one component used on both signed-out screens, and TC-02-E2E-09 proves it on the login form — including that the value survives the toggle and focus returns to the input.

### TC-01-E2E-05: Duplicate email shows server error in banner
- **Retired.** Covered by TC-01-INT-02 for the rule (a duplicate email is rejected with no partial write). That a server error reaches the form at all is the browser half, and TC-02-E2E-02 is the one case kept to prove it.

### TC-01-E2E-06: Submitting an invalid form surfaces every error and focuses the first one
- **Retired.** Duplicate mechanism. "Submit is never disabled, clicking an invalid form shows every error and focuses the first" is one repository-wide rule; TC-02-E2E-07 proves it once, on the cheapest form in the product.

### TC-01-E2E-07: The login and signup pages link to each other
- **Level:** E2E
- **Preconditions:** none.
- **Steps:**
  1. Open the login page (`/login`).
  2. Click the "Create an account" link.
  3. Verify the browser navigates to `/signup` and the signup form is displayed.
  4. Click the "Sign in" link on the signup page.
  5. Verify the browser navigates back to `/login` and the login form is displayed.
- **Expected Result:**
  1. After clicking the link, the URL is `/signup`.
  2. The signup form (`signup-form`) is visible with all expected fields.
  3. After clicking "Sign in", the URL is `/login` and `login-form` is visible.
- **Selectors:** `login-signup-link`, `signup-form`, `signup-org-name-input`, `signup-first-name-input`, `signup-last-name-input`, `signup-email-input`, `signup-password-input`, `signup-submit-button`, `signup-login-link`, `login-form`.

> Step 4 was added when the reverse leg's own E2E test was retired: it is the same "no dead
> links" rule on a page this case has already loaded, so proving it here costs three
> assertions instead of a second browser.

> The "Create an account" link on `/login` carries `login-signup-link`, not `signup-login-link`. The `signup-` prefix means "on the signup screen", so the reverse link needed the reverse prefix; spec 02 named it correctly and this spec was corrected to match. `signup-login-link` still names the "Sign in" link on `/signup`.
