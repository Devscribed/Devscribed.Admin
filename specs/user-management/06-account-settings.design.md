---
id: "06"
kind: design
title: Account Settings — Design
pairs-with: 06-account-settings.md
routes: ["/account/settings", "/account/confirm-email"]
design-system: "1_DS for dev"
tags: [account-settings, change-email, change-password, profile, phone, timezone, first-day-of-week, meridian, light-only]
---

# 06 — Account Settings · Design

Visual and interaction specification for `/account/settings` (signed-in) and `/account/confirm-email` (public). Pairs with [06-account-settings.md](06-account-settings.md), which owns the business rules, the API contracts, and every validation/error message. This file owns everything a developer would otherwise have to invent: which design-system component to reach for, which token drives which state, and what the on-screen wording is.

**Design system:** Teammerly Meridian, `1_DS for dev/`. Import components from `1_DS for dev/index.js` (via `apps/web/src/ds.ts`); never hardcode a color, size, or font — every value below is a token that already exists in `tokens/*.css`.

**Theme:** light only in this release. No theme toggle on any of these routes.

## Two shells, one spec

This spec spans both surfaces the design system already knows how to dress, and each screen goes into the shell its access model dictates — there is no third chrome invented here.

- **`/account/settings` is a signed-in screen** and renders inside the existing **`AppShell`** (`apps/web/src/layout/AppShell.tsx`) — sidebar, top bar, page header — exactly like every route under `/org/{orgId}/`. It is *not* under the `/org/{orgId}/` segment, so it does not inherit `apps/web/app/org/[orgId]/layout.tsx`. Instead the account route replicates that layout's gate itself: on mount it fetches `GET /api/me`, renders the shared `app-loading` `Spinner` while the request is in flight, `router.replace('/login')` on 401 (or a null body), and on success renders `<AppShell session={…}>` around the settings content. The account belongs to exactly one organization (single-org-per-user), so the sidebar — which needs the org id — is built from `session.organization.id` off that same resolved session, never from a URL parameter. This is the one deviation from spec 00's frame: the frame is reused verbatim, but the resolution that feeds it lives in the account route rather than in an `[orgId]` layout above it.
- **`/account/confirm-email` is public** (no auth — the token alone is sufficient, business spec requirement 8) and joins the **signed-out set** defined in [02-authentication-login.design.md](02-authentication-login.design.md): one `AuthLayout`, paper field, wordmark above, a single card capped at 480px, centred. It matches the `/reset-password` token-screen pattern exactly (`apps/web/app/reset-password/ResetPasswordScreen.tsx`), down to the `useSearchParams` read and the `Suspense` boundary in its `page.tsx`.

**Entry point.** The top bar's account menu (`apps/web/src/layout/Topbar.tsx`) gains one new item, **"Account settings"**, sitting **above** "Log out" in the same menu card. It is a `next/link` to `/account/settings` (`role="menuitem"`), carrying `data-testid="account-settings-menu-link"`. This is a spec-00 / app-shell touch — recorded in [DS gaps](#ds-gaps).

**Two modals, no toast for their outcome.** Change email and Change password are DS `Modal`s (`width={480}`) opened from buttons on the settings page. On success each modal **replaces its form body with a confirmation message** (per the business spec's States tables), not a toast — the toast is reserved for the Edit Information Save. Server errors go to the modal's own `change-email-error` / `change-password-error` `InfoBanner`; field errors render inline via the shared `field-error.tsx` `errorNode` helper, identical to every other form in the app.

---

## `/account/settings` — Account Settings page

### Layout

```
  Account settings                                       ← PageHeader, above the card

  ┌──────────────────────────────────────────────────────────┐   ← Card, max-width 600px, centred
  │  [ Change email ]   [ Change password ]                  │   ← two buttons, side by side, above the form
  │                                                            │
  │  EDIT INFORMATION                                         │   ← section label
  │                                                            │
  │  [ server error banner ]                                 │   ← only after a 5xx / network error
  │                                                            │
  │  FIRST NAME                                              │
  │  [ Pat______________________________________ ]          │
  │  LAST NAME                                               │
  │  [ Owner____________________________________ ]          │
  │  COUNTRY                                                 │
  │  [ 🇺🇸 United States +1                       ▾ ]        │
  │  PHONE NUMBER                                            │
  │  [ (555) 123-4567___________________________ ]          │
  │  TIMEZONE                                                │
  │  [ (GMT-5:00) America/New_York               ▾ ]        │
  │  FIRST DAY OF WEEK                                       │
  │  [ Monday                                     ▾ ]        │
  │                                                            │
  │  [ Save ]                                                │   ← primary, full width of the field column
  └──────────────────────────────────────────────────────────┘
```

- The `PageHeader` (title **"Account settings"**, no subtitle) sits above the card, outside it — the same `PageHeader` / `Card` separation the Members list uses (`apps/web/app/org/[orgId]/members/page.tsx`).
- One `Card` (`padded=true`) holds everything below the header. Container: `max-width: 600px`, centred (`margin: 0 auto`), full width with the shell's own content padding below that.
- **Change email** and **Change password** buttons sit at the top of the card, side by side in a row (`display: flex`, `gap: var(--sp-5)`), above the Edit Information section. Below a spec-00-consistent row of secondary actions, a `SectionLabel` "EDIT INFORMATION" opens the form.
- **The Edit Information fields are a single vertical stack at every breakpoint** — first name, last name, country, phone number, timezone, first day of week, then Save. There is no side-by-side field layout anywhere, and the phone country selector and number input stack vertically (they never share a row), matching the business spec's Responsive section explicitly.
- Fields are spaced `--sp-7` apart, matching the auth forms; the Save button sits `--sp-10` below the last field.

### Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Session gate spinner | `Spinner` (shared with spec 00) | `size={28}`, centred on the paper field | `app-loading` (reused; the same node spec 00's `OrgLayout` renders) |
| App frame | `AppShell` | `session` from the resolved `GET /api/me` | — |
| Page header | local `PageHeader` (`@/layout/PageHeader`) | `title="Account settings"` | `page-title` (spec 00's shell selector) |
| Screen wrapper | native `<div>` | wraps the whole settings surface inside the shell content | `account-settings` |
| Outer card | `Card` | default (`padded=true`) | — |
| Change-email button | `Button` | `variant="secondary"`, opens the Change Email modal | `change-email-open-button` |
| Change-password button | `Button` | `variant="secondary"`, opens the Change Password modal | `change-password-open-button` |
| Section label | `SectionLabel` | text "EDIT INFORMATION" | — |
| Settings server error | `InfoBanner` | `tone="error"`, `role="alert"`, `aria-live="polite"`; rendered only after a 5xx / network error | `account-error-message` (added; not in the business spec's required list — the spec's States table names an "error area" but no test id, so one is provided for parity with the modal error banners) |
| First name | `Input` | `label="First name"`, `error`, live/blur validation | `edit-first-name-input` |
| First name inline error | `field-error.tsx`'s `errorNode('firstName', …)` | — | `field-error-firstName` |
| Last name | `Input` | `label="Last name"`, `error` | `edit-last-name-input` |
| Last name inline error | `errorNode('lastName', …)` | — | `field-error-lastName` |
| Phone country selector | `Select` | `label="Country"`, `options` = app-owned country table (see [DS gaps](#ds-gaps)); each option's `value` is the ISO alpha-2 code and its `label` is a ReactNode "🇺🇸 United States +1" | `edit-phone-country-select` |
| Phone country inline error | `errorNode('phoneCountryCode', …)` | — | `field-error-phoneCountryCode` |
| Phone number | `Input` | `label="Phone number"`, `type="tel"`, `error` | `edit-phone-number-input` |
| Phone number inline error | `errorNode('phoneNumber', …)` | — | `field-error-phoneNumber` |
| Timezone select | `Select` | `label="Timezone"`, `options` = app-owned IANA-zone table with GMT-offset labels (see [DS gaps](#ds-gaps)) | `edit-timezone-select` |
| Timezone inline error | `errorNode('timezone', …)` | — | `field-error-timezone` |
| First day of week select | `Select` | `label="First day of week"`, `options=[{value:'Monday',label:'Monday'},{value:'Sunday',label:'Sunday'}]` | `edit-first-day-select` |
| First day inline error | `errorNode('firstDayOfWeek', …)` | — | `field-error-firstDayOfWeek` |
| Save button | `Button` | `variant="primary"`, `size="lg"`, `loading`, `disabled` when required fields invalid or in flight, full width | `account-save-button` |
| Saved toast | `InfoBanner tone="success"` via `useToast()` | message "Settings saved" | `toast-account-saved` |
| Loading skeleton | local `LoadingSkeleton` (inline in the settings screen) | static token-colored blocks, no shimmer — same "no `Skeleton` primitive exists" gap specs 04/05 recorded | `account-settings-loading-skeleton` (added; not in the business spec's required list — the States table names a "skeleton/shimmer" state but no test id) |

Two loading gates stack here and must not be confused: `app-loading` covers the `GET /api/me` session resolution (blank shell), while `account-settings-loading-skeleton` covers the `GET /api/account/settings` form fetch *inside* an already-rendered shell. The screen wrapper `account-settings` is present in both the skeleton and loaded states so an E2E selector can wait on it before the fields exist.

### Copy

Validation/error messages are **not** listed here — they are owned by the business spec's requirement 9 tables and must match verbatim (`ACCOUNT_MESSAGES` / `MESSAGES` in `@devscribed/validation`).

| Slot | Text |
|---|---|
| Page header title | Account settings |
| Change-email button | Change email |
| Change-password button | Change password |
| Section label | EDIT INFORMATION |
| Micro-label · first name | First name |
| Micro-label · last name | Last name |
| Micro-label · country | Country |
| Micro-label · phone | Phone number |
| Micro-label · timezone | Timezone |
| Micro-label · first day | First day of week |
| Save button | Save |
| Save button, in flight | Saving |
| Toast · save success | Settings saved |
| Loading skeleton (assistive) | Loading your account settings |

Country option label is a ReactNode composed as `{flag} {countryName} +{dialCode}` (e.g. "🇺🇸 United States +1"); the timezone option label is `(GMT{±h:mm}) {IANA zone}` (e.g. "(GMT-7:00) America/Los_Angeles"). Both are app-owned data (see [DS gaps](#ds-gaps)); the labels above are the shapes, not restatements of business copy.

### States

Mirrors the business spec's Account Settings States table.

| State | Behavior |
|---|---|
| **Loading** | `account-settings-loading-skeleton` while `GET /api/account/settings` is in flight. Form fields and Save button are not rendered. |
| **Default** | Fields pre-filled with current values from the GET. Save enabled. Phone country/number pre-selected/filled, or empty when `phoneCountryCode`/`phoneNumber` are `null`. |
| **Field error** | After blur on an invalid field, its `Input`/`Select` enters the DS error state and the message renders in `field-error-{fieldName}`. Save is disabled while any required field (first name, last name, timezone) is invalid. |
| **Saving** | Save `loading` (spinner leads the label, label becomes "Saving"), Save disabled; fields read-only. |
| **Saved** | `toast-account-saved` shows "Settings saved". Fields keep their new values. Save re-enables. |
| **Server error** | `account-error-message` `InfoBanner tone="error"` shows the business spec's generic message. Save re-enables. Fields retain their values. |

### Interactions

- **Blur on a text field** — runs that field's client-side validator (name rules from spec 01 via `@devscribed/validation`; phone via `libphonenumber-js` for the selected country). Invalid → the field's error state + `field-error-{fieldName}`; valid → the error clears.
- **Country change** — updates local state; re-validates the phone number against the newly selected country. Selecting a country while a number is present but was invalid can clear or re-raise `field-error-phoneNumber`. A number present with no country selected raises `field-error-phoneCountryCode` ("Select a country code" — business spec).
- **Save click** — re-validates all fields client-side; if valid, sends `PUT /api/account/settings` with the current field values (`phoneCountryCode`/`phoneNumber` sent as `null` when both cleared). On success → toast + re-enable; on 400 with per-field `errors`, the messages route to their `field-error-{fieldName}` nodes; on 5xx / network → `account-error-message`.
- **Error clearing** — inline field errors clear when the visitor corrects the value and blurs; the `account-error-message` server banner clears as soon as any field value changes (business spec requirement 10).
- **Save disabled derivation** — the business spec's States table has Save disabled while required fields are invalid or a submit is in flight. This is the one screen in this spec where the CTA *is* gated on validity; it follows the business spec's own table rather than the signed-out set's "never disabled for validation" rule (that rule governs the auth family, not this signed-in form).

### Responsive

- `max-width: 600px`, centred, per the business spec's explicit sizing. Below that width the card spans the available content width with the shell's own padding; nothing is full-bleed.
- Field stacking stays vertical at every breakpoint — no side-by-side layout, and the phone country selector and number input stay stacked, never sharing a row.
- The two top-of-card action buttons stay side by side; on a very narrow card they may wrap to two rows via `flex-wrap`, each button keeping its intrinsic width.
- `Input`/`Select` are 100%-width by default, so every field reflows with the card.

---

## Change Email modal

### Layout

```
  ┌────────────────────────────────────────────┐   ← Modal, width={480}
  │  Change email                          ✕   │
  │                                            │
  │  Current email: pat@acme.com               │   ← read-only line
  │                                            │
  │  NEW EMAIL ADDRESS                        │
  │  [ new@acme.com________________________ ]  │
  │                                            │
  │  [ server error banner ]                  │   ← change-email-error, only after a server error
  │                                            │
  │              [ Cancel ]  [ Send confirmation ]
  └────────────────────────────────────────────┘

  success body (replaces the form):
  ┌────────────────────────────────────────────┐
  │  Change email                          ✕   │
  │                                            │
  │  A confirmation link has been sent to      │   ← change-email-confirmation-message
  │  new@acme.com. Please check your inbox.     │
  │                                            │
  │                            [ Close ]        │
  └────────────────────────────────────────────┘
```

- A DS `Modal` (`width={480}`, title "Change email"), opened from `change-email-open-button`. Same composition as `InviteModal` (`apps/web/app/org/[orgId]/members/InviteModal.tsx`): a `<form>` in the body, buttons in the `Modal actions` footer row.
- The current email is a read-only line above the input: "Current email: {currentEmail}".
- **On success the entire form (input + footer submit) is replaced by `change-email-confirmation-message`**, leaving only a Close affordance — not a toast. The modal stays open on that success body until dismissed.

### Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Modal shell | `Modal` | `open`, `title="Change email"`, `onClose`, `width={480}`, `actions` | — |
| Current email line | native `<div>` | muted, read-only text "Current email: {email}" | — |
| Form element | native `<form id="change-email-form">` | — | `change-email-form` |
| New email input | `Input` | `label="New email address"`, `type="email"`, `error` | `change-email-new-input` |
| New email inline error | `errorNode('newEmail', …)` | — | `field-error-newEmail` |
| Server error | `InfoBanner` | `tone="error"`, `role="alert"`, `aria-live="polite"` | `change-email-error` |
| Submit button | `Button` | `variant="primary"`, `size="lg"`, `loading`, `disabled` until a valid email is entered, `form="change-email-form"` | `change-email-submit-button` |
| Cancel button | `Button` | `variant="secondary"`, `size="lg"`, `disabled` while submitting | — |
| Success confirmation | native `<div>` (replaces the form) | renders the business spec's confirmation copy | `change-email-confirmation-message` |

### Copy

| Slot | Text |
|---|---|
| Modal title | Change email |
| Read-only line | Current email: {currentEmail} |
| Micro-label · new email | New email address |
| Submit button | Send confirmation |
| Submit button, in flight | Sending |
| Cancel button | Cancel |
| Confirmation message | A confirmation link has been sent to {newEmail}. Please check your inbox. |
| Close (success body) | Close |

The confirmation wording is fixed above (business copy is owned by this design doc per the spec's copy-ownership split, since the API's own message differs slightly — the API returns "…sent to your new email address", the on-screen message names the address the visitor just typed). The server-returned validation messages ("This is already your email address", "This email is already in use", etc.) are the business spec's and are not restated.

### States

Mirrors the business spec's Change Email modal States table.

| State | Behavior |
|---|---|
| **Default** | New email empty, submit disabled. Current email shown read-only. |
| **Email invalid** | After blur on an invalid email, `field-error-newEmail` shown; submit stays disabled. |
| **Ready** | Valid email entered; submit enabled. |
| **Loading** | Submit `loading` + disabled ("Sending"); field read-only. |
| **Success** | Form + submit replaced by `change-email-confirmation-message`; Cancel/Close still available. |
| **Server error** | `change-email-error` `InfoBanner tone="error"` shows the API message; field retains its value; submit re-enables; modal stays open. |

### Interactions

- **Blur on the email field** — runs `validateEmail`; invalid → `field-error-newEmail`, valid → clears.
- **Submit click** — re-validates client-side; if valid, sends `POST /api/account/change-email`. On success → swap to the confirmation body; on 400 → `change-email-error` with the API message; on 5xx / network → `change-email-error` with the generic message.
- **Server-error dismissal** — `change-email-error` clears the moment the visitor edits the email field (business spec requirement 10), matching `InviteModal`'s banner-clear-on-edit behavior.
- **Close / Cancel** — dismisses the modal, no API call; form state resets on next open. Disabled while a request is in flight.

### Responsive

- `width={480}`, centred by the overlay. On narrow viewports the modal spans the available width with the DS `Modal`'s own horizontal padding, matching the card pattern from specs 01/02.

---

## Change Password modal

### Layout

```
  ┌────────────────────────────────────────────┐   ← Modal, width={480}
  │  Change password                       ✕   │
  │                                            │
  │  CURRENT PASSWORD                         │
  │  [ ••••••••••••••••••••••••••••••••••••• ] │
  │  NEW PASSWORD                             │
  │  [ ••••••••••••••••••••••••••••••••••••• ] │
  │  CONFIRM NEW PASSWORD                     │
  │  [ ••••••••••••••••••••••••••••••••••••• ] │
  │                                            │
  │  [ server error banner ]                  │   ← change-password-error
  │                                            │
  │              [ Cancel ]  [ Change password ]
  └────────────────────────────────────────────┘

  success body (replaces the form):
  ┌────────────────────────────────────────────┐
  │  Change password                       ✕   │
  │                                            │
  │  Your password has been changed.           │
  │                                            │
  │                            [ Close ]        │
  └────────────────────────────────────────────┘
```

- A DS `Modal` (`width={480}`, title "Change password"), opened from `change-password-open-button`. Three masked password fields top-to-bottom; submit in the `actions` footer.
- **On success the form is replaced by "Your password has been changed."** — not a toast; the modal stays open on that success body until dismissed. (The business side revokes all other sessions and preserves the current one via a fresh cookie — business spec requirement 3; nothing on-screen changes for the current session.)

### Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Modal shell | `Modal` | `open`, `title="Change password"`, `onClose`, `width={480}`, `actions` | — |
| Form element | native `<form id="change-password-form">` | — | `change-password-form` |
| Current password | `Input` | `label="Current password"`, `type="password"`, `error` | `change-password-current-input` |
| Current password inline error | `errorNode('currentPassword', …)` | — | `field-error-currentPassword` |
| New password | `Input` | `label="New password"`, `type="password"`, `hint`, `error` | `change-password-new-input` |
| New password inline error | `errorNode('newPassword', …)` | — | `field-error-newPassword` |
| Confirm password | `Input` | `label="Confirm new password"`, `type="password"`, `error` | `change-password-confirm-input` |
| Confirm inline error | `errorNode('passwordConfirmation', …)` | — | `field-error-passwordConfirmation` |
| Server error | `InfoBanner` | `tone="error"`, `role="alert"`, `aria-live="polite"` | `change-password-error` |
| Submit button | `Button` | `variant="primary"`, `size="lg"`, `loading`, `disabled` until all fields valid, `form="change-password-form"` | `change-password-submit-button` |
| Cancel button | `Button` | `variant="secondary"`, `size="lg"`, `disabled` while submitting | — |
| Success confirmation | native `<div>` (replaces the form) | renders "Your password has been changed." | — (no dedicated test id in the business spec; the modal title and Close remain) |

**No reveal toggles on the password fields.** Unlike `/login` and `/reset-password`, this modal deliberately omits the `Eye`/`EyeOff` toggle. The new-password/confirm pairing exists precisely to catch a typo the eye cannot see (the same reasoning `/reset-password`'s confirm field records), and the current-password field is a recall, not a composition — a reveal there would expose a live credential on a signed-in screen for no validation benefit.

### Copy

| Slot | Text |
|---|---|
| Modal title | Change password |
| Micro-label · current | Current password |
| Micro-label · new | New password |
| Micro-label · confirm | Confirm new password |
| Hint · new password | At least 8 characters, with one letter and one digit. |
| Submit button | Change password |
| Submit button, in flight | Saving |
| Cancel button | Cancel |
| Success message | Your password has been changed. |
| Close (success body) | Close |

The password-policy hint copy is shared verbatim with `/reset-password`'s new-password hint. All validation/error messages ("Current password is incorrect", policy violations, "Passwords do not match", etc.) are the business spec's and are not restated.

### States

Mirrors the business spec's Change Password modal States table.

| State | Behavior |
|---|---|
| **Default** | All three fields empty; submit disabled. |
| **Field error** | After blur, inline errors beneath the offending fields (policy violation on new, mismatch on confirm, empty on current); submit stays disabled until resolved. |
| **Ready** | All fields non-empty and valid; submit enabled. |
| **Loading** | Submit `loading` + disabled; fields read-only. |
| **Success** | Form replaced by "Your password has been changed."; Cancel/Close still available. |
| **Server error** | `change-password-error` `InfoBanner tone="error"` shows the API message (e.g. "Current password is incorrect"); fields retain values; submit re-enables; modal stays open. |

### Interactions

- **Blur on current password** — validates non-empty → `field-error-currentPassword`.
- **Blur on new password** — validates against the password policy (`validatePassword`) → `field-error-newPassword`.
- **Blur on confirm password** — validates it matches the new password (only once the new-password field is non-empty, matching `/reset-password`'s guard) → `field-error-passwordConfirmation`.
- **Editing the new-password field after a mismatch** — re-runs the match check live, so the confirm error clears the moment the two agree (same live-recheck the reset screen does).
- **Submit click** — re-validates all three; if valid, sends `POST /api/account/change-password`. On success → swap to the success body; on 400 with a field-specific message → the matching `field-error-{fieldName}`; on a form-level 400 ("Current password is incorrect") → `change-password-error`; on 5xx / network → `change-password-error` with the generic message.
- **Server-error dismissal** — `change-password-error` clears when the visitor modifies any field after a server error (business spec requirement 10).
- **Close / Cancel** — dismisses, no API call; form state resets on next open. Disabled while a request is in flight.

### Responsive

- `width={480}`, centred by the overlay; spans the available width with the `Modal`'s own padding on narrow viewports.

---

## `/account/confirm-email` — Email Confirmation screen

### Layout

Four bodies under one unchanging title, in the signed-out `AuthLayout` (like `/reset-password`):

```
       Teammerly●                              ← wordmark, outside the card
  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
  │ Confirm your email│  │ Confirm your email│  │ Confirm your email│
  │                   │  │                   │  │                   │
  │       ◜◝          │  │ [ success banner ]│  │ [ error banner ]  │
  │  Confirming your  │  │ Your email has    │  │ This confirmation │
  │  email change…    │  │ been updated.     │  │ link has expired  │
  │                   │  │                   │  │                   │
  │                   │  │ Go to login       │  │                   │
  └───────────────────┘  └───────────────────┘  └───────────────────┘
      1 · CHECKING           2 · SUCCESS            3 · ERROR (×3)
```

- On mount the screen reads the `token` query parameter (`useSearchParams`) and **auto-POSTs** `POST /api/account/confirm-email` with it — no button, no user action. A missing/empty token skips the request and renders the invalid-link error directly, exactly as `/reset-password` does for an empty token.
- The whole surface is wrapped by `confirm-email-screen`. The card title "Confirm your email" is stable across all four bodies, so the card never jumps.
- **The login link appears only in the success body** (`confirm-email-login-link`, inside the card). The business spec is explicit that "No login link is displayed in the error state" — so this screen intentionally does **not** carry a persistent "Back to login" link in `AuthLayout`'s footer, departing from the signed-out set's "cross-account link always in the footer" rule. Putting it in the footer would contradict the spec's requirement that error states show no login link. This is the deliberate exception, recorded here so the next reader does not "fix" it back to the family default.

### Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page shell | `AuthLayout` | `title="Confirm your email"` (no `footer`) | — |
| Screen wrapper | native `<div>` | wraps every state below the title | `confirm-email-screen` |
| Checking indicator | `Spinner` + muted line | `size={28}`, `role="status"` | — (reuses the `/reset-password` `reset-checking` pattern; no dedicated test id in the business spec) |
| Success message | `InfoBanner` | `tone="success"`, `role="alert"`, `aria-live="polite"` | `confirm-email-success-message` |
| Login link | `next/link` `<a>` | `href="/login"`, below the success banner | `confirm-email-login-link` |
| Error message | `InfoBanner` | `tone="error"`, `role="alert"`, `aria-live="polite"`; carries the expired / invalid / email-taken message | `confirm-email-error` |

A single `Suspense` boundary wraps the screen in its `page.tsx` (because of `useSearchParams`), fallback empty — the checking body takes over the instant it mounts, identical to `apps/web/app/reset-password/page.tsx`.

### Copy

| Slot | Text |
|---|---|
| Card title | Confirm your email |
| Checking line | Confirming your email change… |
| Login link | Go to login |
| Success banner | — the business spec's `POST /api/account/confirm-email` success message ("Your email has been updated") |
| Error banner | — the business spec's expired / invalid / email-taken messages, verbatim |

Only the title, the checking line, and the "Go to login" label are owned here; the success and error banner text is the business spec's and is not restated.

### States

Mirrors the business spec's Email Confirmation States table.

| State | Behavior |
|---|---|
| **Loading** | `Spinner size={28}` in `--accent`, centred, with the muted "Confirming your email change…" line beneath; rendered from first paint until `POST /api/account/confirm-email` answers. `role="status"`. |
| **Success** | `confirm-email-success-message` shows "Your email has been updated"; `confirm-email-login-link` ("Go to login" → `/login`) shown beneath it. |
| **Error — expired** | `confirm-email-error` shows "This confirmation link has expired". No success message, no login link. |
| **Error — invalid** | `confirm-email-error` shows "This confirmation link is no longer valid" (token used, invalidated, not found, or malformed). |
| **Error — email taken** | `confirm-email-error` shows "This email is already in use". |

### Interactions

- **Page load** — read `token` from the query string; empty/missing → render the invalid-link error without a request. Otherwise POST it once. The response message is matched against the business spec's set to pick the error variant; anything unrecognised falls back to the generic invalid-link message.
- **Go to login** — `next/link` navigation to `/login`. No confirmation.
- There are no form fields and no re-submit on this screen — it is a one-shot token exchange, so there is no blur/submit/dismissal interaction to describe.

### Responsive

- Identical to the rest of the signed-out set: ≥ 520px the card sits at its 480px cap, centred, wordmark above; < 520px the card spans the available width with `AuthLayout`'s horizontal padding. Radius, border, and shadow stay — no full-bleed.

---

## Accessibility

- Every `Input` / `Select` carries a real visible micro-label rendered by the component itself — the same pattern every other screen uses (see spec 02's DS gap about `Input` having no first-class `errorId`/`hintId`, unchanged here).
- Every field in error carries `aria-invalid="true"` and `aria-describedby` pointing at its `field-error-{fieldName}` node, via the shared `field-error.tsx` `errorNode` helper — identical to every other form field in the app.
- The new-password hint in the Change Password modal is referenced by `aria-describedby`, so the policy is announced before the visitor types (matching `/reset-password`).
- Every banner — `account-error-message`, `change-email-error`, `change-email-confirmation-message`, `change-password-error`, `confirm-email-success-message`, `confirm-email-error`, and the `toast-account-saved` toast — is `role="alert"` (or `role="status"` for the success toast) with `aria-live="polite"`, announced without stealing focus.
- The confirm-email checking body is `role="status"` with the visible line as its text, so a screen reader hears "Confirming your email change" rather than silence; the `Spinner` itself is `aria-hidden`.
- When a modal swaps its form body for a success/confirmation body, focus moves to that body's heading/message region so a keyboard user is not left focused on a control that no longer exists (same rule the signed-out set applies when a form is replaced by a banner).
- The `Modal`'s own focus trap, `Escape`-to-close, and scrim-click-to-close come from the DS `Modal` (as used by `InviteModal`); nothing here overrides them, except that Close/Cancel is inert while a request is in flight.
- The new **account-settings-menu-link** is a real `<a role="menuitem">` inside the existing `topbar-account-menu`, reachable by keyboard through the same menu that already holds Log out; the menu's outside-click / `Escape` dismissal (already in `Topbar.tsx`) covers it unchanged.
- Colour is never the only signal: each error state carries the full message text, and the success/error tone on every banner reinforces wording that already stands on its own.
- Save is disabled on invalid required fields, but the reason is always visible as the inline field error(s), never conveyed by the disabled state alone.

## DS gaps

| Gap | Resolution | Status |
|---|---|---|
| The top bar's account menu had only a Log out item; this spec adds an "Account settings" entry above it | Add a `next/link` `role="menuitem"` (`account-settings-menu-link`) to `apps/web/src/layout/Topbar.tsx`, above the existing Log out button, styled with the same menu-item treatment. A spec-00 / app-shell touch, not a DS-component change | done (app layer, like spec 00's other shell additions) |
| `/account/settings` is a signed-in screen but lives outside the `/org/{orgId}/` segment, so it cannot inherit `app/org/[orgId]/layout.tsx`'s session gate | The account route replicates the gate (`GET /api/me` → `app-loading` Spinner → `router.replace('/login')` on 401 → `<AppShell session>`), reusing `AppShell` verbatim. No new chrome; the resolution just lives in the account route rather than an `[orgId]` layout | done (app layer) |
| No phone-country data or flag glyphs exist in the design system | The country option list (ISO alpha-2 `value`, "🇺🇸 United States +1" ReactNode `label`) is **app-owned data**, built from `libphonenumber-js` `getCountries()` / `getCountryCallingCode()`; the flag emoji is derived in-app from the alpha-2 code via the two regional-indicator code points (a pure helper, e.g. `flagFromAlpha2('US') → 🇺🇸`). This is application data feeding a standard `Select`, **not** a DS component to add — recorded here only so the frontend agent builds the table rather than hunting for a DS export | app data, not a DS gap to fix |
| No timezone data exists in the design system | The timezone option list (IANA `value`, "(GMT-7:00) America/Los_Angeles" `label`) is likewise **app-owned data** — a curated IANA list with computed GMT offsets. Same status: app data feeding a standard `Select`, not a DS component | app data, not a DS gap to fix |
| `Select` has no inline `error` slot wired to `field-error-{fieldName}` the way `Input` does | `SelectProps` already declares `error?: string`; the phone-country and timezone/first-day errors reuse the same `errorNode` cast the whole app uses for `Input`. If `Select`'s `error` render does not tag its message node, the `field-error-{fieldName}` id rides along the `errorNode` span exactly as it does for `Input` (spec 02's open DS gap) — no new gap, same workaround | open (unchanged from spec 02) |
| `Modal` has no built-in "success replaces body" affordance | Handled in the app: each modal holds a local phase and conditionally renders either the `<form>` or the confirmation body inside the same `Modal`. No DS change — the `Modal` is a passive shell, as `InviteModal` already treats it | not a gap |

Carried forward from specs 01–05, still true here: `InfoBanner` hardcodes its four tone triplets as literal `oklch(...)` values rather than tokens — this spec's settings error banner, both modal error banners, the two modal/confirm success banners, and the saved toast are further untouched instances. Promoting those tones to tokens remains the outstanding design-system chore. `_adherence.oxlintrc.json`'s exhaustive prop declarations still flag pass-through native attributes (`data-testid`, `type`, `title`, etc.) on DS components.

## Reference mockup

No `06-account-settings.mock.html` exists. As with spec 05, this design's implementation is verified against the running API/UI rather than a static mock: a fresh signup, `GET /api/account/settings`, a successful `PUT`, the per-field `400`s (name / phone / timezone / first-day), the change-email happy path plus the same-as-current and already-in-use `400`s, the change-password happy path plus the wrong-current-password and mismatch `400`s, and the four `POST /api/account/confirm-email` outcomes (success, expired, invalid, email-taken) are all exercised live against the running API, and every response shape is checked against this doc and the business spec byte-for-byte. `1_DS for dev/templates/meridian-app/MeridianApp.dc.html` carries no `spec 06` section, so unlike spec 05 there is no template block to lift values from — the settings page composes the same `Card`/`Input`/`Select`/`Button` primitives the Members and auth screens already use, at the tokens they already use. A mock can be added later following `02-authentication-login.mock.html`'s pattern if one becomes useful.
