---
id: "01"
kind: design
title: Organization Creation — Design
pairs-with: 01-organization-creation.md
routes: ["/signup"]
design-system: "@devscribed/ds"
tags: [signup, auth-layout, form-design, teammerly-original, light-only]
---

# 01 — Organization Creation · Design

Visual and interaction specification for `/signup`. Pairs with [01-organization-creation.md](01-organization-creation.md), which owns the business rules, the API contract, and every validation message. This file owns everything a developer would otherwise have to invent: which design-system component to reach for, which token drives which state, and what the on-screen wording is.

**Design system:** [`packages/ds`](../../packages/ds/README.md). Import from `@devscribed/ds`;
never hardcode a colour, size or font — every value below is a token that already exists. The
numbered decisions behind it are in [`decisions.md`](../design-system/decisions.md), cited here
as `§n`.

**Theme:** light only. The system has no dark palette and the app has no toggle, so there is nothing on `/signup` to switch.

## Layout

The screen is one `AuthLayout` (§11) — the signed-out shell, with no sidebar and no top bar.

```
       Teammerly                       ← wordmark, outside the card
  ┌─────────────────────────┐
  │ Create your organization│         ← headline-5, --text-primary
  │ One account, one org…   │         ← body-s, --text-secondary
  │                         │
  │ [ error banner ]        │         ← only after a server error
  │                         │
  │ Organization name       │
  │ [____________________]  │
  │ First name              │
  │ [____________________]  │
  │ Last name               │
  │ [____________________]  │
  │ Email                   │
  │ [____________________]  │
  │ Password           👁    │
  │ [____________________]  │
  │ At least 8 characters…  │
  │                         │
  │ [   Create account   ]  │         ← full width, primary
  └─────────────────────────┘
   Already have an account? Sign in   ← outside the card
```

- Card: `--radius-l` · 1px `--border-default` · `--surface-card`, capped at 480px and centred. **No shadow** — the system separates static surfaces with a border and reserves shadow for things that float.
- The page well is `#f8fafc`, the same value `AppShell` paints behind every signed-in screen. It is hardcoded in the system and absent from `tokens/colors.css`; the decision record notes it as un-tokenised.
- Card padding `--space-10` (30px); gap between the title block and the form `--space-8`; gap between fields `--space-7`; gap above the submit button `--space-7`.
- **`--space-7` (20px) is not decoration.** `TextInput` pins its message 16px under the field rather than pushing the field below it (§4), so anything under a field has to leave that much room. 20px is also the system's own form rhythm. The 14px this screen used before does not clear the slot.
- Field order matches the business spec: organization name, first name, last name, email, password. Vertical stack at every breakpoint — never two fields on one row.
- The error banner sits inside the card, above the first field, and only exists once a server error has come back.
- The "Already have an account?" line sits below the card, on the well — not inside it.

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page shell | `AuthLayout` (§11) | `title`, `subtitle`, `footer` | — |
| Form element | native `<form>` | — | `signup-form` |
| Server error banner | `InfoBanner` | `variant="error"` (§7) | `signup-error-banner` |
| Organization name | `TextInput` | `label`, `id`, `name`, `placeholder`, `error`, `errorId` | `signup-org-name-input` |
| First name | `TextInput` | as above | `signup-first-name-input` |
| Last name | `TextInput` | as above | `signup-last-name-input` |
| Email | `TextInput` | as above, `type="email"` | `signup-email-input` |
| Password | `TextInput` | `label`, `hint`, `hintId`, `error`, `errorId`, `type`, `trailing` (§5) | `signup-password-input` |
| Password reveal | `IconButton` (§10) + `Eye` / `EyeOff` (§9) | `label`, `active`, `size={28}`, inside the password field's `trailing` | `signup-password-toggle` |
| Submit | `Button` | `variant="primary"`, `preloader`, `style={{ width: '100%' }}` | `signup-submit-button` |
| Sign-in link | native `<a>` | — | `signup-login-link` |

Inline field errors are rendered by `TextInput`'s own `error` prop, tagged by `errorId` (§4): `field-error-orgName`, `field-error-firstName`, `field-error-lastName`, `field-error-email`, `field-error-password`.

**The system has no `size` on `Button` and no `loading`.** It ships one 44px height, and its in-flight prop is `preloader`. Full width is passed as a style rather than assumed, because §1 removed the hardcoded `width: '100%'`.

## Copy

Validation messages are **not** listed here. They are owned by the business spec and must match its table exactly.

| Slot | Text |
|---|---|
| Card title | Create your organization |
| Card subtitle | One account, one organization. You'll be its first admin. |
| Label · org name | Organization name |
| Label · first name | First name |
| Label · last name | Last name |
| Label · email | Email |
| Label · password | Password |
| Placeholder · org name | Acme Inc |
| Placeholder · first name | Pat |
| Placeholder · last name | Owner |
| Placeholder · email | you@company.com |
| Placeholder · password | — (none; masked fields take no placeholder) |
| Hint · password | At least 8 characters, with one letter and one digit. |
| Submit button | Create account |
| Submit button, in flight | Creating account |
| Footer | Already have an account? **Sign in** |

**Labels are sentence case, not uppercase.** The system capitalises exactly one thing — `PageTabs`, via `text-transform` — and its field labels are 12px `--text-secondary` in sentence case, set by the global `.input-label` rule. The uppercase micro-labels this screen used before were the earlier design's idiom and do not survive the reskin.

Voice: sentence case in prose, no exclamation marks, no emoji, errors terse and factual. The password hint states the policy up front rather than waiting for the visitor to fail it — it is the same rule as the business spec's password errors, phrased as guidance.

## States

Every value below is a token; nothing here is a literal.

| State | Field | Submit | Notes |
|---|---|---|---|
| **Default** | 1.5px `--border-default`, white, 44px min-height, `--radius-l`, label `--text-secondary` | enabled, `--action-primary` fill, 550 weight | Card as described above. |
| **Focus** | border `--color-blue`, `--shadow-focus-input` (inset 2px + a 7px blue glow) | — | No browser default outline anywhere. |
| **Field error** | border `--status-error`, `--shadow-error-glow`; message `*`-prefixed, 8px, `--status-error`, pinned 16px below the field | enabled | The message is positioned, not in flow — it never moves the field below it. |
| **Submit-blocked** | every invalid field in its error state at once | enabled | Focus jumps to the first invalid field, top to bottom. |
| **Loading** | fields read-only, `opacity: .55` | `preloader` — a spinner in the trailing slot, `aria-busy` set, label swaps to "Creating account" | The button is *not* disabled; the handler guards re-entry. |
| **Server error** | values retained, no field errors added | stays enabled | `InfoBanner variant="error"` above the first field. |
| **Success** | — | — | No toast, no confirmation. Immediate redirect to the Members list. |

Hover on the submit button: `filter: brightness(90%)` over `--duration-hover` — the system brightens its solid buttons rather than swapping to a darker hex. Hover on the reveal toggle: `scale(1.1)`, the same treatment the system gives the Modal close button. **There is no press state**: the system's source has no shrink, lip or translate on any control, and inventing one would be the only motion in the system that is not measured.

## Interactions

- **Blur on a field** — runs that field's validation. Invalid → the field enters its error state and the message appears in `field-error-{fieldName}`. Valid → any existing error clears.
- **Submit click** — re-runs every validation. If anything fails, all applicable errors render at once, focus moves to the first invalid field (organization name → first name → last name → email → password), and no request goes out. If everything passes, the button enters its `preloader` state and the request is sent.
- **Enter key** inside any field submits the form — same path as clicking the button.
- **Password toggle** — flips the input between `type="password"` and `type="text"`. The glyph swaps `Eye` ⇄ `EyeOff` and the button's `active` prop tints it `--action-primary` while the password is visible. `onMouseDown` is prevented, so toggling never moves focus out of the password field and never alters the value.
- **Server-error dismissal** — the banner disappears as soon as the visitor edits any field value.

## Responsive

- ≥ 520px: card sits at its 480px cap, centred, wordmark above.
- < 520px: card spans the available width; `AuthLayout`'s horizontal padding (`--space-6`) keeps it off the edge. Radius and border stay — the card does not go full-bleed.
- Fields stay stacked at every width. The submit button is full-width at every width.
- The password field's `trailing` slot is fixed-width and the field carries matching right padding (§5), so the input's usable area shrinks with the card rather than the toggle overlapping the text.

## Accessibility

- Every `TextInput` renders a real `<label for>` bound to the field's `id` (§3). The system's own label is associated with nothing.
- A field in error carries `aria-invalid="true"` and `aria-describedby` pointing at its `field-error-{fieldName}` node, which exists because of `errorId` (§4).
- The password hint is referenced by `aria-describedby` through `hintId`, so the policy is announced before the visitor types. Hint and error share one slot, so only one of the two is ever a describedby target.
- The error banner is `role="alert"` / `aria-live="polite"` so a server error is announced without stealing focus — it reaches the DOM because of §6.
- The password toggle is a real `<button type="button">` with an `aria-label` that reflects the *action* ("Show password" / "Hide password") and `aria-pressed` reflecting the current state.
- The submit button carries `aria-busy` while its `preloader` is set (§2).
- Focus is visible everywhere — the system's `--shadow-focus-input`, never `outline: none` without a replacement.
- Colour is never the only error signal: the message text carries the meaning, and the `*` prefix marks it without relying on hue.
- Contrast: `--text-primary` (#1B1B1B) on `--surface-card` and `--action-primary-text` on `--action-primary` (#007AFF) both clear AA. `--text-secondary` (#64748B) is used for supporting copy and labels only.

**One regression, recorded rather than hidden.** The system pins its field message at 8px, which §4 preserves — and it is below the size at which a hint or an error is comfortable to read. The wording is carried to screen readers by `aria-describedby` regardless, and the field's own red border and glow carry the error state visually. Raising it is a change to the system's own geometry, so it belongs in the system rather than in a shim here.

## Divergences used by this screen

This screen was the first signed-out surface in the product, so it needed more of the system opened than most. Each of these is numbered in [decisions](../design-system/decisions.md); none is a local workaround.

| § | What it adds | Kind |
|---|---|---|
| 1 | `Button` sizes to its content instead of always filling its parent | `omission` |
| 2 | `Button` forwards rest props, `ref` and `style`, and sets `aria-busy` | `omission` |
| 3 | `TextInput` forwards rest props and `ref`, and gives its label a real `htmlFor` | `omission` |
| 4 | `TextInput` gains `errorId` / `hintId` and a hint that shares the error's slot | `omission` |
| 5 | `TextInput` gains the `trailing` slot the reveal toggle sits in | `omission` |
| 6 | `InfoBanner` forwards rest props, so `role`/`aria-live`/`data-testid` reach the DOM | `omission` |
| 9 | `Eye` / `EyeOff` glyphs, drawn to the system's stated icon rules | `packaging` |
| 10 | `IconButton`, the treatment the system's readme specifies but never promoted | `packaging` |
| 11 | `AuthLayout` — the signed-out shell; there was no other signed-out screen to draw from | `designed` |

## Reference mockup

[01-organization-creation.mock.html](01-organization-creation.mock.html) — static, token-driven, every state on one page. Open it in a browser; it is the visual acceptance target for this screen.
