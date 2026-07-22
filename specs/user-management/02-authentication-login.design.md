---
id: "02"
kind: design
title: Authentication & Login — Design
pairs-with: 02-authentication-login.md
routes: ["/login", "/forgot-password", "/reset-password"]
design-system: "1_DS for dev"
tags: [login, forgot-password, reset-password, auth-layout, form-design, meridian, light-only]
---

# 02 — Authentication & Login · Design

Visual and interaction specification for `/login`, `/forgot-password`, and `/reset-password`. Pairs with [02-authentication-login.md](02-authentication-login.md), which owns the business rules, the API contracts, and every validation message. This file owns everything a developer would otherwise have to invent: which design-system component to reach for, which token drives which state, and what the on-screen wording is.

**Design system:** Teammerly Meridian, `1_DS for dev/`. Import components from `1_DS for dev/index.js`; never hardcode a color, size, or font — every value below is a token that already exists in `tokens/*.css`.

**Theme:** light only in this release. The signed-out surface follows the system preference once dark ships; there is no theme toggle on any of these routes.

## The signed-out set

These three screens plus `/signup` (spec 01) are one visual family. They share one shell and one set of rules:

- One `AuthLayout` — paper field (`--bg`), wordmark above, a single card capped at 480px, centred. No sidebar, no top bar, no theme toggle.
- Card chrome is identical on every route: `--radius-2xl` · 1px `--border` · `--shadow-card` · `--bg-panel` · padding `--sp-16`.
- Gap between the title block and the body `--sp-12`; between fields `--sp-7`; above the submit button `--sp-10`.
- **The card title never changes while you are on a route.** Only the card body swaps between states, so the card never jumps under the cursor.
- **The cross-account link always lives in `AuthLayout`'s footer**, outside the card, on the paper field. `/signup` says "Sign in", `/login` says "Create an account", `/forgot-password` and `/reset-password` say "Back to login". A visitor learns one place to look.
- Fields are stacked at every breakpoint. The submit button is full width, `variant="primary"`, `size="lg"`.
- The submit CTA is **never disabled for validation** — see the shared rule in [README.md](README.md). It is disabled only while a request is in flight, via `Button loading`.

---

## `/login`

### Layout

```
       Teammerly●                     ← wordmark, outside the card
  ┌────────────────────────┐
  │ Sign in                 │         ← Grotesk 22, --text
  │ Welcome back.           │         ← Plex 14, --text-muted
  │                         │
  │ [ error banner ]        │         ← only after a server error
  │                         │
  │ EMAIL                   │
  │ [____________________]  │
  │ PASSWORD                │
  │ [_______________] 👁     │
  │ Forgot password?        │         ← left-aligned, --sp-2 below the field
  │                         │
  │ [      Sign in       ]  │         ← full width, primary, size lg
  └────────────────────────┘
   New to Teammerly? Create an account ← outside the card
```

- Field order: email, password. Never two fields on one row.
- The error banner sits inside the card, above the email field, and only exists once a server error has come back.
- "Forgot password?" is its own line directly beneath the password field, left-aligned, `--fs-13`, `--accent`. It sits below the password field's hint slot, so a password error message and the link never collide.

### Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page shell | `AuthLayout` | `title`, `subtitle`, `footer` | — |
| Form element | native `<form>` | — | `login-form` |
| Server error / deactivation | `InfoBanner` | `tone="error"` \| `tone="warning"` | `login-error-message` |
| Email | `Input` | `label`, `placeholder`, `error`, `type="email"` | `login-email-input` |
| Password | `Input` | `label`, `error`, `type`, `trailing` | `login-password-input` |
| Password reveal | `IconButton` + `Eye` / `EyeOff` | `label`, `active`, inside the password field's `trailing` | `login-password-toggle` |
| Forgot link | native `<a>` | — | `login-forgot-link` |
| Submit | `Button` | `variant="primary"`, `size="lg"`, `loading`, full width | `login-submit-button` |
| Create-account link | native `<a>` in `AuthLayout footer` | — | `login-signup-link` |

Inline field errors are rendered by `Input`'s own `error` prop; the message node carries `field-error-email` and `field-error-password`.

### Copy

Validation messages are **not** listed here. They are owned by the business spec and must match its tables exactly.

| Slot | Text |
|---|---|
| Card title | Sign in |
| Card subtitle | Welcome back. |
| Micro-label · email | EMAIL |
| Micro-label · password | PASSWORD |
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
| **Default** | 1.5px `--border-strong`, `--bg-field`, label `--text-muted` | enabled, `--accent` + `--lip-accent` | Both fields empty. |
| **Focus** | border `--accent`, ring `--shadow-glow-accent` (3px violet) | — | No browser default outline anywhere. |
| **Field error** | border + label + message `--error-500`; on focus the ring swaps to `--shadow-glow-error` | enabled | Message is Plex `--fs-12`, `--sp-2` below the field. |
| **Submit-blocked** | every invalid field in its error state at once | enabled | Focus jumps to the first invalid field: email → password. No request goes out. |
| **Loading** | fields read-only, `opacity: .55` | `loading` — spinner leads the label, lip drops to none, cursor `progress`, click blocked | Label changes to "Signing in". |
| **Invalid credentials** | values retained, no field errors added | back to enabled | `InfoBanner tone="error"` above the email field. |
| **Deactivated account** | values retained, no field errors added | back to enabled | Same node, `InfoBanner tone="warning"` — amber, `--amber-800` ink. |
| **Success** | — | — | No toast, no confirmation. Immediate redirect to `/members`. |

**Why the tone swaps.** `login-error-message` is one element, as the business spec requires, but the two messages mean different things. "Invalid email or password" is a correctable mistake — red, retry. "Your account has been deactivated" is a state no amount of retyping will change — amber, stop. Red on the deactivation message would invite the visitor to keep guessing their password. The wording still carries the full meaning on its own; the tone is reinforcement, never the sole signal.

### Interactions

- **Blur on a field** — runs that field's validation. Invalid → the field enters its error state and the message appears in `field-error-{fieldName}`. Valid → any existing error clears.
- **Submit click** — re-runs every validation. If anything fails, all applicable errors render at once, focus moves to the first invalid field (email → password), and no request goes out. If everything passes, the button enters `loading` and the request is sent.
- **Enter key** inside either field submits the form — same path as clicking the button.
- **Password toggle** — flips the input between `type="password"` and `type="text"`. The glyph swaps `Eye` ⇄ `EyeOff` and the button's `active` prop tints it `--accent` while the password is visible. Toggling never moves focus out of the password field and never alters the value.
- **Server-error dismissal** — the banner disappears as soon as the visitor edits either field value. This applies to both tones.
- **Arriving from a redirect** — when the auth middleware bounced the visitor here from a protected page, nothing on the screen changes. No "please sign in" banner; the login card is self-explanatory and a banner would compete with the real error slot.

---

## `/forgot-password`

### Layout

```
       Teammerly●
  ┌────────────────────────┐          ┌────────────────────────┐
  │ Forgot your password?   │         │ Forgot your password?   │
  │ Enter the email you…    │         │                         │
  │                         │   ──►   │ [ info banner ]         │
  │ EMAIL                   │         │ Check your inbox — the  │
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
| Page shell | `AuthLayout` | `title`, `subtitle`, `footer` | — |
| Form element | native `<form>` | — | `forgot-form` |
| Email | `Input` | `label`, `placeholder`, `error`, `type="email"` | `forgot-email-input` |
| Submit | `Button` | `variant="primary"`, `size="lg"`, `loading`, full width | `forgot-submit-button` |
| Confirmation | `InfoBanner` | `tone="info"` | `forgot-confirmation-message` |
| Re-entry link | native `<a>` | — | `forgot-retry-link` |
| Back-to-login link | native `<a>` in `AuthLayout footer` | — | `forgot-back-link` |

### Copy

| Slot | Text |
|---|---|
| Card title | Forgot your password? |
| Card subtitle | Enter the email you sign in with and we'll send you a link. |
| Micro-label · email | EMAIL |
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
| **Field error** | `--error-500` border, label, and message | enabled | `field-error-email`. |
| **Submit-blocked** | email in its error state | enabled | Focus jumps to the email field. No request goes out. |
| **Loading** | field read-only, `opacity: .55` | `loading`, label "Sending" | — |
| **Confirmed** | form removed from the DOM | removed | `InfoBanner tone="info"` + supporting line + re-entry link. Subtitle is removed with the form. |

**Why info, not success.** Green asserts "we sent it". The system deliberately refuses to confirm that — it does not know, and will not say, whether that address exists. Violet `tone="info"` is the honest register: here is what happens next, not here is what happened.

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
  │       ◜◝          │  │ NEW PASSWORD      │  │ [ error banner ]  │  │ [ success banner ]│
  │   Checking your   │  │ [__________] 👁    │  │                   │  │ You've been signed│
  │   reset link…     │  │ At least 8 chars… │  │                   │  │ out everywhere…   │
  │                   │  │ CONFIRM PASSWORD  │  │                   │  │                   │
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
| Page shell | `AuthLayout` | `title`, `footer` | — |
| Checking indicator | `Spinner` + muted line | `size={28}` | `reset-checking` |
| Form element | native `<form>` | — | `reset-form` |
| New password | `Input` | `label`, `hint`, `error`, `type`, `trailing` | `reset-password-input` |
| Password reveal | `IconButton` + `Eye` / `EyeOff` | `label`, `active` | `reset-password-toggle` |
| Confirm password | `Input` | `label`, `error`, `type="password"` | `reset-password-confirm-input` |
| Submit | `Button` | `variant="primary"`, `size="lg"`, `loading`, full width | `reset-submit-button` |
| Token error | `InfoBanner` | `tone="error"` | `reset-error-message` |
| Success | `InfoBanner` | `tone="success"` | `reset-success-message` |
| Back-to-login link | native `<a>` in `AuthLayout footer` | — | `reset-login-link` |

Inline field errors carry `field-error-password` and `field-error-password-confirm`.

**No reveal toggle on the confirm field.** If both fields can be read at once, confirming is theatre — the second field exists precisely to catch a typo the eye cannot see. The toggle on the new-password field is enough to check what was typed.

### Copy

| Slot | Text |
|---|---|
| Card title | Set a new password |
| Checking line | Checking your reset link… |
| Micro-label · new password | NEW PASSWORD |
| Micro-label · confirm | CONFIRM PASSWORD |
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
| **Checking** | `Spinner size={28}` in `--accent`, centred, with the muted line beneath | absent | Rendered from first paint until `GET /api/reset-password/validate` answers. Node is `reset-checking`, `role="status"`. |
| **Valid — default** | both fields empty | enabled | Hint under the new-password field. |
| **Focus** | border `--accent`, ring `--shadow-glow-accent` | — | — |
| **Policy violation** | new-password field in error | enabled | `field-error-password`, message from the business spec's table. |
| **Confirmation mismatch** | confirm field in error | enabled | Message goes in `field-error-password-confirm`. The new-password field is *not* marked — it may well be the correct one. |
| **Submit-blocked** | every invalid field in its error state at once | enabled | Focus jumps to the first invalid field: new password → confirm. No request goes out. |
| **Loading** | fields read-only, `opacity: .55` | `loading`, label "Resetting" | — |
| **Invalid / expired token** | fields and submit removed from the DOM | removed | `InfoBanner tone="error"` in `reset-error-message`. Only the banner and the footer link remain. |
| **Success** | form removed from the DOM | removed | `InfoBanner tone="success"` + supporting line. |

**Why a checking state at all.** `GET /api/reset-password/validate` is what lets an expired link show its error before the visitor types a password they will never get to use. It is usually sub-100ms, but rendering nothing during it means a slow connection looks broken, and rendering a skeleton form means watching a form assemble that is about to be thrown away. A spinner and a sentence are honest in both outcomes.

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
- < 520px: card spans the available width; `AuthLayout`'s horizontal padding (`--sp-8`) keeps it off the edge. Radius, border, and shadow stay — the card does not go full-bleed.
- Fields stay stacked at every width. Submit buttons are full width at every width.
- The password fields' `trailing` slot is fixed-width, so the input's usable area shrinks with the card rather than the toggle overlapping the text.

## Accessibility

- Every `Input` has a real `<label>`; the uppercase micro-label is the label, not decoration.
- A field in error carries `aria-invalid="true"` and `aria-describedby` pointing at its `field-error-{fieldName}` node.
- The new-password hint is also referenced by `aria-describedby`, so the policy is announced before the visitor types.
- Every banner — `login-error-message`, `forgot-confirmation-message`, `reset-error-message`, `reset-success-message` — is `role="alert"` / `aria-live="polite"`, announced without stealing focus.
- `reset-checking` is `role="status"` with the visible line as its text, so a screen reader hears "Checking your reset link" rather than silence. The `Spinner` itself is `aria-hidden`.
- Password toggles are real `<button type="button">` elements with an `aria-label` reflecting the *action* ("Show password" / "Hide password") and `aria-pressed` reflecting the current state.
- Submit buttons carry `aria-busy` while loading.
- Focus is visible everywhere — the 3px violet ring, never `outline: none` without a replacement.
- When a body swaps (confirmation replaces a form, invalid state replaces the reset form), focus moves to the new body's heading region so a keyboard user is not left focused on a node that no longer exists.
- Colour is never the only signal: the error/warning distinction on `/login` is carried by the wording; the tone only reinforces it.
- Contrast: `--text` on `--bg-panel`, `--on-accent` on `--accent`, and `--amber-800` on the warning banner's field all clear AA.

## DS gaps

| Gap | Resolution | Status |
|---|---|---|
| The only spinner in Meridian was a private const inside `Button.jsx` — not exported, fixed at 15px, unreachable for a page-level wait | extracted to `components/feedback/Spinner.jsx` with a `size` prop; `Button` imports it, rendering unchanged | done |
| `Input` renders its `error` and `hint` props as the message node but gives no way to tag that node, so `field-error-{fieldName}` has to be smuggled in as a React element cast to `string` | worked around in `apps/web/src/field-error.tsx`; a first-class `errorId` / `hintId` prop belongs in the DS | open |

Known rough edges, carried forward from spec 01 and now more expensive:

`InfoBanner` hardcodes its four tone triplets as literal `oklch(...)` values instead of tokens. Spec 01 hit one of them; these three screens hit all four (info, warning, error, success). Those are the only colors in this design that cannot be pointed at a `--variable`. The mockup mirrors the component verbatim rather than inventing substitutes. Promoting the tones to tokens is now the highest-value design-system chore outstanding — spec 03 will hit them again.

`_adherence.oxlintrc.json` declares each component's props exhaustively, which flags pass-through native attributes such as `placeholder`, `type`, and `data-testid` on `<Input>`. When the frontend lands, that rule needs the native-attribute allowance before the linter can be switched on without noise.

## Reference mockup

[02-authentication-login.mock.html](02-authentication-login.mock.html) — static, token-driven, every state of all three screens on one page. Open it in a browser; it is the visual acceptance target for this spec.
