---
id: "02"
kind: design
title: Authentication & Login — Design
pairs-with: 02-authentication-login.md
routes: ["/login", "/forgot-password", "/reset-password"]
design-system: "1_DS for dev"
tags: [login, forgot-password, reset-password, auth-layout, form-design, teammerly-original, light-only]
---

# 02 — Authentication & Login · Design

Visual and interaction specification for `/login`, `/forgot-password`, and `/reset-password`. Pairs with [02-authentication-login.md](02-authentication-login.md), which owns the business rules, the API contracts, and every validation message. This file owns everything a developer would otherwise have to invent: which design-system component to reach for, which token drives which state, and what the on-screen wording is.

**Design system:** Teammerly Original DS, `1_DS for dev/`. Import components from `1_DS for dev/index.js`; never hardcode a color, size, or font — every value below is a token that already exists in `tokens/*.css`. Divergences from upstream are numbered in [`specs/design-system/ledger.md`](../design-system/ledger.md) and cited here as `§n`.

**Theme:** light only. Blue has no dark palette and the app has no toggle, so there is nothing on these routes to switch.

## The signed-out set

These three screens plus `/signup` (spec 01) are one visual family. They share one shell and one set of rules:

- One `AuthLayout` (§11) — the `#f8fafc` well, wordmark above, a single card capped at 480px, centred. No sidebar, no top bar, no theme toggle.
- Card chrome is identical on every route: `--radius-l` · 1px `--border-default` · `--surface-card` · padding `--space-10`. **No shadow** — blue reserves shadow for things that float above content, and separates static surfaces with a border.
- Gap between the title block and the body `--space-8`; between fields `--space-7`; above the submit button `--space-7`.
- **`--space-7` (20px) is load-bearing.** `TextInput` pins its message 16px below the field instead of pushing the field below it (§4), so every field needs that much clearance underneath. It is also blue's own form rhythm.
- **The card title never changes while you are on a route.** Only the card body swaps between states, so the card never jumps under the cursor.
- **The cross-account link always lives in `AuthLayout`'s footer**, outside the card, on the well. `/signup` says "Sign in", `/login` says "Create an account", `/forgot-password` and `/reset-password` say "Back to login". A visitor learns one place to look.
- Fields are stacked at every breakpoint. Submit buttons are `variant="primary"` and pass `style={{ width: '100%' }}` — blue ships one 44px height and no `size` prop, and §1 removed the hardcoded full-bleed width, so full width is now asked for rather than assumed.
- The submit CTA is **never disabled for validation** — see the shared rule in [README.md](README.md). It is not disabled while in flight either: blue's `preloader` shows the spinner and sets `aria-busy` (§2), and the submit handler guards re-entry.
- Field labels are **sentence case**. Blue's only uppercase is `PageTabs`; its field labels are 12px `--text-secondary`, set by the global `.input-label` rule.

---

## `/login`

### Layout

```
       Teammerly                       ← wordmark, outside the card
  ┌─────────────────────────┐
  │ Sign in                 │         ← headline-5, --text-primary
  │ Welcome back.           │         ← body-s, --text-secondary
  │                         │
  │ [ error banner ]        │         ← only after a server error
  │                         │
  │ Email                   │
  │ [____________________]  │
  │ Password           👁    │
  │ [____________________]  │
  │ Forgot password?        │         ← --space-6 below the field
  │                         │
  │ [      Sign in       ]  │         ← full width, primary
  └─────────────────────────┘
   New to Teammerly? Create an account ← outside the card
```

- Field order: email, password. Never two fields on one row.
- The error banner sits inside the card, above the email field, and only exists once a server error has come back.
- "Forgot password?" is its own line beneath the password field, left-aligned, `--font-size-s`, `--text-link`. Its `--space-6` (16px) top margin is exactly the reach of the field's message slot — any less and a password error would draw on top of the link.

### Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page shell | `AuthLayout` (§11) | `title`, `subtitle`, `footer` | — |
| Form element | native `<form>` | — | `login-form` |
| Server error | `InfoBanner` | `variant="error"` (§7) | `login-error-message` |
| Email | `TextInput` | `label`, `id`, `name`, `placeholder`, `error`, `errorId`, `type="email"` | `login-email-input` |
| Password | `TextInput` | `label`, `id`, `name`, `error`, `errorId`, `type`, `trailing` (§5) | `login-password-input` |
| Password reveal | `IconButton` (§10) + `Eye` / `EyeOff` (§9) | `label`, `active`, `size={28}`, inside the password field's `trailing` | `login-password-toggle` |
| Forgot link | native `<a>` | — | `login-forgot-link` |
| Submit | `Button` | `variant="primary"`, `preloader`, `style={{ width: '100%' }}` | `login-submit-button` |
| Create-account link | native `<a>` in `AuthLayout footer` | — | `login-signup-link` |

Inline field errors are rendered by `TextInput`'s `error` prop and tagged by `errorId` (§4): `field-error-email`, `field-error-password`.

### Copy

Validation messages are **not** listed here. They are owned by the business spec and must match its tables exactly.

| Slot | Text |
|---|---|
| Card title | Sign in |
| Card subtitle | Welcome back. |
| Label · email | Email |
| Label · password | Password |
| Placeholder · email | you@company.com |
| Placeholder · password | — (none; masked fields take no placeholder) |
| Forgot link | Forgot password? |
| Submit button | Sign in |
| Submit button, in flight | Signing in |
| Footer | New to Teammerly? **Create an account** |

No password hint on this screen. `/signup` states the policy because the visitor is composing a password; here they are recalling one, and restating the rule reads as an accusation.

### States

| State | Field | Submit | Notes |
|---|---|---|---|
| **Default** | 1.5px `--border-default`, white, 44px min-height, label `--text-secondary` | enabled, `--action-primary` fill | Both fields empty. |
| **Focus** | border `--color-blue`, `--shadow-focus-input` | — | No browser default outline anywhere. |
| **Field error** | border `--status-error`, `--shadow-error-glow`; message `*`-prefixed, 8px, `--status-error`, pinned 16px below | enabled | Positioned, not in flow — the field below never moves. |
| **Submit-blocked** | every invalid field in its error state at once | enabled | Focus jumps to the first invalid field: email → password. No request goes out. |
| **Loading** | fields read-only, `opacity: .55` | `preloader` spinner, `aria-busy`, label "Signing in" | Not disabled; the handler guards re-entry. |
| **Invalid credentials** | values retained, no field errors added | stays enabled | `InfoBanner variant="error"` above the email field. |
| **Deactivated account** | values retained, no field errors added | stays enabled | The **same** banner and the same tone — see below. |
| **Success** | — | — | No toast, no confirmation. Immediate redirect to `/members`. |

**The tone no longer swaps, and that is a deliberate reversal.** `login-error-message` used to paint amber for a deactivated account and red for a wrong password, on the reasoning that amber says "retrying will not help" where red invites another guess. Blue paints one banner for anything that went wrong: its `InfoBanner` has exactly two measured variants, `info` and a red one, because that is all production has. Amber exists in blue's palette (`--status-warning`) but has never been a banner, so keeping the distinction would have meant inventing a treatment and calling it measured.

The argument for dropping it is in the note that introduced it: *the wording carries the full meaning on its own; the tone is reinforcement, never the sole signal*. "Your account has been deactivated" does not read as a retry prompt whatever colour sits behind it. The distinction was reinforcement, and reinforcement is what a measurement is allowed to take away.

This is the one place on the signed-out surface where blue removed something rather than repainting it. It is recorded here, in [`specs/design-system/README.md`](../design-system/README.md) under the reversals, and in `LoginForm.tsx` at the banner itself.

### Interactions

- **Blur on a field** — runs that field's validation. Invalid → the field enters its error state and the message appears in `field-error-{fieldName}`. Valid → any existing error clears.
- **Submit click** — re-runs every validation. If anything fails, all applicable errors render at once, focus moves to the first invalid field (email → password), and no request goes out. If everything passes, the button enters its `preloader` state and the request is sent.
- **Enter key** inside either field submits the form — same path as clicking the button.
- **Password toggle** — flips the input between `type="password"` and `type="text"`. The glyph swaps `Eye` ⇄ `EyeOff` and the button's `active` prop tints it `--action-primary` while the password is visible. `onMouseDown` is prevented, so toggling never moves focus out of the password field and never alters the value.
- **Server-error dismissal** — the banner disappears as soon as the visitor edits either field value.
- **Arriving from a redirect** — when the auth middleware bounced the visitor here from a protected page, nothing on the screen changes. No "please sign in" banner; the login card is self-explanatory and a banner would compete with the real error slot.

---

## `/forgot-password`

### Layout

```
       Teammerly
  ┌────────────────────────┐          ┌────────────────────────┐
  │ Forgot your password?   │         │ Forgot your password?   │
  │ Enter the email you…    │         │                         │
  │                         │   ──►   │ [ info banner ]         │
  │ Email                   │         │ Check your inbox — the  │
  │ [____________________]  │         │ link expires in 60 min. │
  │                         │         │                         │
  │ [  Send reset link   ]  │         │ Use a different email   │
  └────────────────────────┘          └────────────────────────┘
      Back to login                        Back to login
```

The card title is identical in both states — only the body swaps, so the card does not jump when the confirmation lands.

### Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page shell | `AuthLayout` (§11) | `title`, `subtitle`, `footer` | — |
| Form element | native `<form>` | — | `forgot-form` |
| Email | `TextInput` | `label`, `id`, `name`, `placeholder`, `error`, `errorId`, `type="email"` | `forgot-email-input` |
| Submit | `Button` | `variant="primary"`, `preloader`, `style={{ width: '100%' }}` | `forgot-submit-button` |
| Confirmation | `InfoBanner` | `variant="info"` | `forgot-confirmation-message` |
| Re-entry link | native `<button>` styled as a link | — | `forgot-retry-link` |
| Back-to-login link | native `<a>` in `AuthLayout footer` | — | `forgot-back-link` |

### Copy

| Slot | Text |
|---|---|
| Card title | Forgot your password? |
| Card subtitle | Enter the email you sign in with and we'll send you a link. |
| Label · email | Email |
| Placeholder · email | you@company.com |
| Submit button | Send reset link |
| Submit button, in flight | Sending |
| Confirmation banner | — owned by the business spec (requirement 7) |
| Supporting line under the banner | Check your inbox — the link expires in 60 minutes. |
| Re-entry link | Use a different email |
| Footer | Back to login |

The confirmation wording is fixed by the business spec and must not be softened, decorated, or personalised — it is engineered to reveal nothing about whether the address is registered.

### States

| State | Field | Submit | Notes |
|---|---|---|---|
| **Default** | as `/login` | enabled | Email empty. |
| **Field error** | `--status-error` border and glow, `*`-prefixed message | enabled | `field-error-email`. |
| **Submit-blocked** | email in its error state | enabled | Focus jumps to the email field. No request goes out. |
| **Loading** | field read-only, `opacity: .55` | `preloader`, label "Sending" | — |
| **Confirmed** | form removed from the DOM | removed | `InfoBanner variant="info"` + supporting line + re-entry link. Subtitle is removed with the form. |

**Why info, not success.** Green asserts "we sent it". The system deliberately refuses to confirm that — it does not know, and will not say, whether that address exists. Blue's `info` (the cyan tint, `--status-info`) is the honest register: here is what happens next, not here is what happened. It is also the one variant on this screen that is measured rather than added.

**Why a re-entry link.** The confirmation replaces the form, as the business spec requires. Without a way back, a visitor who mistyped their address is stranded on a screen with nothing to act on. "Use a different email" restores the form client-side — no request, no new token, nothing on the server changes.

### Interactions

- **Blur / submit validation** — identical to `/login`, one field.
- **Submit success** — the form unmounts and the confirmation body mounts in its place. The card title stays put.
- **Use a different email** — remounts the form with the field empty and focused. The confirmation body unmounts. No API call.
- **Repeat submissions** — each successful request invalidates the previous token (business spec requirement 8). The design does not offer a "resend" button for that reason; re-entry is deliberately framed as correcting the address, not as retrying.

---

## `/reset-password`

### Layout

Four bodies under one unchanging title:

```
  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
  │ Set a new password│  │ Set a new password│  │ Set a new password│  │ Set a new password│
  │                   │  │                   │  │                   │  │                   │
  │      ● ● ●        │  │ New password    👁 │  │ [ error banner ]  │  │ [ success banner ]│
  │   Checking your   │  │ [_______________] │  │                   │  │ You've been signed│
  │   reset link…     │  │ At least 8 chars… │  │                   │  │ out everywhere…   │
  │                   │  │ Confirm password  │  │                   │  │                   │
  │                   │  │ [_______________] │  │                   │  │                   │
  │                   │  │ [ Reset password ]│  │                   │  │                   │
  └───────────────────┘  └───────────────────┘  └───────────────────┘  └───────────────────┘
     Back to login          Back to login          Back to login          Back to login
       1 · CHECKING            2 · VALID             3 · INVALID            4 · SUCCESS
```

The footer link is present in all four states, so it is never the thing that moves.

### Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page shell | `AuthLayout` (§11) | `title`, `footer` | — |
| Checking indicator | `Preloader` + muted line | none — blue's page loader is its default (`size=12 margin=7`) | `reset-checking` |
| Form element | native `<form>` | — | `reset-form` |
| New password | `TextInput` | `label`, `id`, `name`, `hint`, `hintId`, `error`, `errorId`, `type`, `trailing` (§5) | `reset-password-input` |
| Password reveal | `IconButton` (§10) + `Eye` / `EyeOff` (§9) | `label`, `active`, `size={28}` | `reset-password-toggle` |
| Confirm password | `TextInput` | `label`, `id`, `name`, `error`, `errorId`, `type="password"` | `reset-password-confirm-input` |
| Submit | `Button` | `variant="primary"`, `preloader`, `style={{ width: '100%' }}` | `reset-submit-button` |
| Token error | `InfoBanner` | `variant="error"` (§7) | `reset-error-message` |
| Success | `InfoBanner` | `variant="success"` (§7) | `reset-success-message` |
| Back-to-login link | native `<a>` in `AuthLayout footer` | — | `reset-login-link` |

Inline field errors carry `field-error-password` and `field-error-password-confirm`.

**The loader is three pulsing dots, not an arc, and it does not take a size or a colour.** Blue's `Preloader` is production's `PulseLoader` — three `#0168fa` dots on a 0.75s cubic-bezier cycle staggered 0.12s apart. Its `size` is the dot diameter, not the widget's; passing 28 would draw three 28px circles. The page loader is the default, and the in-table load-more row is the only place that overrides it (`size=8 margin=5`).

**No reveal toggle on the confirm field.** If both fields can be read at once, confirming is theatre — the second field exists precisely to catch a typo the eye cannot see. The toggle on the new-password field is enough to check what was typed.

### Copy

| Slot | Text |
|---|---|
| Card title | Set a new password |
| Checking line | Checking your reset link… |
| Label · new password | New password |
| Label · confirm | Confirm password |
| Hint · new password | At least 8 characters, with one letter and one digit. |
| Placeholder · both | — (none; masked fields take no placeholder) |
| Submit button | Reset password |
| Submit button, in flight | Resetting |
| Success banner | — owned by the business spec (`POST /api/reset-password` success response) |
| Supporting line under the success banner | You've been signed out everywhere else. Sign in with your new password. |
| Footer | Back to login |

The success supporting line is the only place the visitor is told their other sessions were revoked (business spec requirement 10). Without it, being logged out on their phone an hour later reads as a bug.

### States

| State | Body | Submit | Notes |
|---|---|---|---|
| **Checking** | `Preloader` centred, with the muted line beneath | absent | Rendered from first paint until `GET /api/reset-password/validate` answers. Node is `reset-checking`, `role="status"`. |
| **Valid — default** | both fields empty | enabled | Hint under the new-password field. |
| **Focus** | border `--color-blue`, `--shadow-focus-input` | — | — |
| **Policy violation** | new-password field in error | enabled | `field-error-password`, message from the business spec's table. |
| **Confirmation mismatch** | confirm field in error | enabled | Message goes in `field-error-password-confirm`. The new-password field is *not* marked — it may well be the correct one. |
| **Submit-blocked** | every invalid field in its error state at once | enabled | Focus jumps to the first invalid field: new password → confirm. No request goes out. |
| **Loading** | fields read-only, `opacity: .55` | `preloader`, label "Resetting" | — |
| **Invalid / expired token** | fields and submit removed from the DOM | removed | `InfoBanner variant="error"` in `reset-error-message`. Only the banner and the footer link remain. |
| **Success** | form removed from the DOM | removed | `InfoBanner variant="success"` + supporting line. |

**Why a checking state at all.** `GET /api/reset-password/validate` is what lets an expired link show its error before the visitor types a password they will never get to use. It is usually sub-100ms, but rendering nothing during it means a slow connection looks broken, and rendering a skeleton form means watching a form assemble that is about to be thrown away. A loader and a sentence are honest in both outcomes.

**`success` is the one variant on these screens with no production behind it.** Blue's banner has two measured treatments and neither is green; prod has no success banner because prod never tells you something worked in a banner. This screen does — a password reset is the one moment where "it worked" is the entire message. The green follows blue's own 10%-of-status tint rule rather than being picked, and §7 records it as designed rather than measured.

### Interactions

- **Page load** — the token is read from the `token` query parameter and sent to `GET /api/reset-password/validate`. Missing or malformed → the invalid state renders without a request. The validate call never consumes the token.
- **Blur on the new-password field** — runs the policy check.
- **Blur on the confirm field** — runs the match check, but only if the new-password field is non-empty; nagging about a mismatch against an empty field is noise.
- **Editing the new-password field after a mismatch** — re-runs the match check live, so the error clears the moment the two agree.
- **Submit click** — re-runs both checks. Failures render at once, focus moves to the first invalid field, no request goes out.
- **Password toggle** — as `/login`, on the new-password field only.
- **Token rejected on submit** — a token that expired between page load and submit comes back rejected. The form unmounts and the invalid state renders, so the visitor is never left staring at a form that cannot succeed.

---

## Responsive

Identical across all three routes, and identical to `/signup`:

- ≥ 520px: card at its 480px cap, centred, wordmark above, footer link below.
- < 520px: card spans the available width; `AuthLayout`'s horizontal padding (`--space-6`) keeps it off the edge. Radius and border stay — the card does not go full-bleed.
- Fields stay stacked at every width. Submit buttons are full width at every width.
- The password fields' `trailing` slot is fixed-width and the field carries matching right padding (§5), so the input's usable area shrinks with the card rather than the toggle overlapping the text.

## Accessibility

- Every `TextInput` renders a real `<label for>` bound to the field's `id` (§3).
- A field in error carries `aria-invalid="true"` and `aria-describedby` pointing at its `field-error-{fieldName}` node, which exists because of `errorId` (§4).
- The new-password hint is referenced by `aria-describedby` through `hintId`, so the policy is announced before the visitor types. Hint and error share one slot, so exactly one of them is ever a describedby target.
- Every banner — `login-error-message`, `forgot-confirmation-message`, `reset-error-message`, `reset-success-message` — is `role="alert"` / `aria-live="polite"`, announced without stealing focus. Those attributes reach the DOM because of §6.
- `reset-checking` is `role="status"` with the visible line as its text, so a screen reader hears "Checking your reset link" rather than silence. `Preloader` renders decorative spans with no text of their own.
- Password toggles are real `<button type="button">` elements with an `aria-label` reflecting the *action* ("Show password" / "Hide password") and `aria-pressed` reflecting the current state.
- Submit buttons carry `aria-busy` while their `preloader` is set (§2).
- Focus is visible everywhere — blue's `--shadow-focus-input`, never `outline: none` without a replacement.
- When a body swaps (confirmation replaces a form, invalid state replaces the reset form), focus moves to the new body's heading region so a keyboard user is not left focused on a node that no longer exists.
- Colour is never the only signal: the wording carries the meaning, and the `*` prefix marks a field error without relying on hue. This matters more than it did — the login banner no longer distinguishes a deactivation from a wrong password by tone, so the sentence is now the whole signal.
- Contrast: `--text-primary` on `--surface-card`, `--action-primary-text` on `--action-primary`, and `--text-tertiary` (#54595E) on every banner tint all clear AA.

**One regression, recorded rather than hidden.** Blue pins its field message at 8px — what production renders, and what §4 preserves. It is below the size at which a hint or an error is comfortable to read; the wording reaches screen readers through `aria-describedby` regardless, and the field's red border and glow carry the state visually. Raising it is a change to blue's measured geometry and belongs upstream.

## Divergences used by these screens

Every one is numbered in the [ledger](../design-system/ledger.md); none is a local workaround. Spec 01 uses §1–§6 and §9–§11; these three routes add:

| § | What it adds | Kind |
|---|---|---|
| 7 | `InfoBanner` gains `error` and `success`. `error` is blue's own red under the name that says what it is; `success` is green and **designed, not measured** | `designed` |
| 8 | `Modal` gains a dialog role, `Escape`, a focus trap, focus return and `initialFocusRef` | `omission` |

§8 has no call site on the signed-out surface — there is no dialog on any of these four screens. It lands here because it is the same omissions pass as the rest, and because the first screen that opens a dialog should find the component already correct rather than discover the gap under a deadline. Its first end-to-end coverage is in Phase 3, with `VacancyDialog`.

## Reference mockup

[02-authentication-login.mock.html](02-authentication-login.mock.html) — static, token-driven, every state of all three screens on one page. Open it in a browser; it is the visual acceptance target for this spec.
