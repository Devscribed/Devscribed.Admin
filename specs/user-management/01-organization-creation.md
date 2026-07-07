# 01 — Organization Creation

## Summary

Any new person can sign up for Devscribed.Admin and, as part of signing up, create their own organization. Signup and organization creation are a single flow: the account (login credentials) and the organization are created together, and the creator is automatically made the organization's first `admin`. This is the entry point to the product — no other user-management feature can happen until an account and an organization exist.

## Actors & Preconditions

- **Actor:** an unauthenticated visitor (prospective organization owner).
- **Preconditions:** the visitor has a valid email address that is not already registered to an account. (See [03-roles-and-permissions](03-roles-and-permissions.md) for the `admin` role, and [04-user-invitation](04-user-invitation.md) for how additional members join afterwards.)

## Functional Requirements

1. A visitor can create an account by providing: email, password, first name, last name, and an organization name.
2. Email must be a syntactically valid email address and must be unique across all accounts. Attempting to sign up with an email that already has an account is rejected with a clear error.
3. Password must meet the strength rules defined in [02-authentication-login](02-authentication-login.md) (shared password policy).
4. Organization name is required, is trimmed of surrounding whitespace, must be non-empty after trimming, and must not exceed 100 characters.
5. On successful signup the system atomically creates: (a) the account, (b) the organization, and (c) a membership linking the account to the organization with role `admin` and status `active`. If any part fails, none is persisted.
6. The creator is the organization's first `admin`. There is no separate "owner" concept — org control is expressed purely through the `admin` role.
7. A given account belongs to exactly one organization at a time (single-org-per-user model). A newly signed-up account is a member only of the organization it just created.
8. After successful signup the creator is authenticated and lands in their new organization's context.
9. The organization's `createdAt` and each membership's "joined" date are recorded at creation time for later display (see [06-member-detail-about](06-member-detail-about.md)).

## UI Notes

- **Signup form** fields: organization name, first name, last name, email, password.
- Inline validation errors appear beneath each field; a submit-level error banner shows server-side failures (e.g. duplicate email).
- Empty/invalid states: submit is disabled until all required fields are non-empty and client-side-valid.
- Required `data-testid` attributes:
  - `signup-form`
  - `signup-org-name-input`
  - `signup-first-name-input`
  - `signup-last-name-input`
  - `signup-email-input`
  - `signup-password-input`
  - `signup-submit-button`
  - `signup-error-banner`
  - `field-error-{fieldName}` (e.g. `field-error-email`, `field-error-orgName`)

## Out of Scope

- Inviting other members (see [04-user-invitation](04-user-invitation.md)).
- Multiple organizations per account.
- Organization-level settings/branding beyond the name.
- Email verification of the creator's own address at signup time (may be added later).

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
- **Expected Result:**
  1. Empty → invalid ("organization name is required").
  2. Whitespace-only → invalid (trimmed to empty).
  3. 101 chars → invalid ("must be at most 100 characters").
  4. `"Acme Inc"` → valid.
  5. `"  Acme Inc  "` → valid, normalized to `"Acme Inc"`.

### TC-01-UNIT-02: Creator is assigned the admin role
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Build a new-organization creation input for a fresh account and invoke the creator-membership factory/logic.
- **Expected Result:**
  1. The produced membership has role `admin` and status `active`.

### TC-01-INT-01: Signup creates account + org + admin membership atomically
- **Level:** Integration
- **Preconditions:** email `owner@acme.com` is not registered; empty database (or clean tenant).
- **Steps:**
  1. Call the signup endpoint with a valid org name, name, `owner@acme.com`, and a valid password.
  2. Query the database for the account, the organization, and the membership.
- **Expected Result:**
  1. Response is success (HTTP 2xx) and returns an authenticated session/token.
  2. Exactly one account exists for `owner@acme.com`.
  3. Exactly one organization exists with the supplied name.
  4. Exactly one membership exists linking that account to that organization with role `admin`, status `active`, and a recorded joined date.

### TC-01-INT-02: Duplicate email is rejected without partial writes
- **Level:** Integration
- **Preconditions:** an account already exists for `owner@acme.com`.
- **Steps:**
  1. Call the signup endpoint with `owner@acme.com` and an otherwise-valid payload (different org name).
  2. Query the database for organizations.
- **Expected Result:**
  1. Response is a validation error (HTTP 4xx) indicating the email is already in use.
  2. No new organization and no new membership were created.

### TC-01-E2E-01: Sign up and land in the new organization as sole admin
- **Level:** E2E
- **Preconditions:** email `owner@acme.com` is not registered.
- **Steps:**
  1. Open the signup form.
  2. Fill organization name "Acme Inc", first name "Pat", last name "Owner", email `owner@acme.com`, and a valid password.
  3. Submit the form.
  4. Navigate to the Members list.
- **Expected Result:**
  1. After step 3 the user is authenticated and lands in the "Acme Inc" context.
  2. After step 4 the Members list shows exactly one active member, "Pat Owner", with role `admin`.
- **Selectors:** `signup-form`, `signup-org-name-input`, `signup-first-name-input`, `signup-last-name-input`, `signup-email-input`, `signup-password-input`, `signup-submit-button`, `members-list`, `member-row-{id}`.

## Open Questions / Assumptions

- Assumes email verification of the creator is **not** required to complete signup at this stage.
- Assumes a single global signup entry point (no per-organization signup subdomains yet).
