---
id: "01"
kind: design
title: Organization Creation — Design
pairs-with: 01-organization-creation.md
routes: ["/signup"]
design-system: "1_DS for dev"
tags: [signup, auth-layout, form-design, meridian, light-only]
---

# 01 — Organization Creation · Design

Visual and interaction specification for `/signup`. Pairs with [01-organization-creation.md](01-organization-creation.md), which owns the business rules, the API contract, and every validation message. This file owns everything a developer would otherwise have to invent: which design-system component to reach for, which token drives which state, and what the on-screen wording is.

**Design system:** Teammerly Meridian, `1_DS for dev/`. Import components from `1_DS for dev/index.js`; never hardcode a color, size, or font — every value below is a token that already exists in `tokens/*.css`.

**Theme:** light only in this release. The signed-out surface follows the system preference once dark ships; there is no theme toggle on `/signup`.

## Layout

The screen is one `AuthLayout` — the signed-out shell, with no sidebar and no top bar.

```
       Teammerly●                     ← wordmark, outside the card
  ┌────────────────────────┐
  │ Create your organization│         ← Grotesk 22, --text
  │ One account, one org…   │         ← Plex 14, --text-muted
  │                         │
  │ [ error banner ]        │         ← only after a server error
  │                         │
  │ ORGANIZATION NAME       │
  │ [____________________]  │
  │ FIRST NAME              │
  │ [____________________]  │
  │ LAST NAME               │
  │ [____________________]  │
  │ EMAIL                   │
  │ [____________________]  │
  │ PASSWORD                │
  │ [_______________] 👁     │
  │ At least 8 characters…  │
  │                         │
  │ [   Create account   ]  │         ← full width, primary, size lg
  └────────────────────────┘
   Already have an account? Sign in   ← outside the card
```

- Card: `--radius-2xl` · 1px `--border` · `--shadow-card` · `--bg-panel`, capped at 480px and centred. On the paper field (`--bg`).
- Card padding `--sp-16`; gap between title block and the form `--sp-12`; gap between fields `--sp-7`; gap above the submit button `--sp-10`.
- Field order matches the business spec: organization name, first name, last name, email, password. Vertical stack at every breakpoint — never two fields on one row.
- The error banner sits inside the card, above the first field, and only exists once a server error has come back.
- The "Already have an account?" line sits below the card, on the paper field — not inside it.

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page shell | `AuthLayout` | `title`, `subtitle`, `footer` | — |
| Form element | native `<form>` | — | `signup-form` |
| Server error banner | `InfoBanner` | `tone="error"` | `signup-error-banner` |
| Organization name | `Input` | `label`, `placeholder`, `error` | `signup-org-name-input` |
| First name | `Input` | `label`, `placeholder`, `error` | `signup-first-name-input` |
| Last name | `Input` | `label`, `placeholder`, `error` | `signup-last-name-input` |
| Email | `Input` | `label`, `placeholder`, `error`, `type="email"` | `signup-email-input` |
| Password | `Input` | `label`, `hint`, `error`, `type`, `trailing` | `signup-password-input` |
| Password reveal | `IconButton` + `Eye` / `EyeOff` | `label`, `active`, inside the password field's `trailing` | `signup-password-toggle` |
| Submit | `Button` | `variant="primary"`, `size="lg"`, `loading`, full width | `signup-submit-button` |
| Sign-in link | native `<a>` | — | `signup-login-link` |

Inline field errors are rendered by `Input`'s own `error` prop — the message node underneath the field carries `field-error-{fieldName}`: `field-error-orgName`, `field-error-firstName`, `field-error-lastName`, `field-error-email`, `field-error-password`.

`AuthLayout`, `IconButton`, `Eye` / `EyeOff`, `Input trailing`, and `Button loading` were added to the design system for this screen — see [DS gaps](#ds-gaps).

## Copy

Validation messages are **not** listed here. They are owned by the business spec and must match its table exactly.

| Slot | Text |
|---|---|
| Card title | Create your organization |
| Card subtitle | One account, one organization. You'll be its first admin. |
| Micro-label · org name | ORGANIZATION NAME |
| Micro-label · first name | FIRST NAME |
| Micro-label · last name | LAST NAME |
| Micro-label · email | EMAIL |
| Micro-label · password | PASSWORD |
| Placeholder · org name | Acme Inc |
| Placeholder · first name | Pat |
| Placeholder · last name | Owner |
| Placeholder · email | you@company.com |
| Placeholder · password | — (none; masked fields take no placeholder) |
| Hint · password | At least 8 characters, with one letter and one digit. |
| Submit button | Create account |
| Submit button, in flight | Creating account |
| Footer | Already have an account? **Sign in** |

Voice: sentence case in prose, `UPPERCASE` + `--ls-wider` for the micro-labels, no exclamation marks, no emoji. The password hint states the policy up front rather than waiting for the visitor to fail it — it is the same rule as the business spec's password errors, phrased as guidance.

## States

Every value below is a token; nothing here is a literal.

| State | Field | Submit | Notes |
|---|---|---|---|
| **Default** | 1.5px `--border-strong`, `--bg-field`, label `--text-muted` | enabled, `--accent` + `--lip-accent` | Card as described above. |
| **Focus** | border `--accent`, ring `--shadow-glow-accent` (3px violet) | — | No browser default outline anywhere. |
| **Field error** | border + label + message `--error-500`; on focus the ring swaps to `--shadow-glow-error` | enabled | Message is Plex `--fs-12`, `--sp-2` below the field. |
| **Submit-blocked** | every invalid field in its error state at once | enabled | Focus jumps to the first invalid field, top to bottom. |
| **Loading** | fields read-only, `opacity: .55` | `loading` — spinner leads the label, lip drops to none, cursor `progress`, click blocked | Label changes to "Creating account". |
| **Server error** | values retained, no field errors added | back to enabled | `InfoBanner tone="error"` above the first field, `--error-500` ink on the tone's soft red field. |
| **Success** | — | — | No toast, no confirmation. Immediate redirect to the Members list. |

Press on the submit button: `translateY(1px)` and the lip shrinks to `--lip-accent-press`. Hover on the sign-in link and the password toggle uses the universal `--hover-bg-tint`. Transitions run at `--duration-base` on `--easing-standard`; nothing bounces.

## Interactions

- **Blur on a field** — runs that field's validation. Invalid → the field enters its error state and the message appears in `field-error-{fieldName}`. Valid → any existing error clears.
- **Submit click** — re-runs every validation. If anything fails, all applicable errors render at once, focus moves to the first invalid field (organization name → first name → last name → email → password), and no request goes out. If everything passes, the button enters `loading` and the request is sent.
- **Enter key** inside any field submits the form — same path as clicking the button.
- **Password toggle** — flips the input between `type="password"` and `type="text"`. The glyph swaps `Eye` ⇄ `EyeOff` and the button's `active` prop tints it `--accent` while the password is visible. Toggling never moves focus out of the password field and never alters the value.
- **Server-error dismissal** — the banner disappears as soon as the visitor edits any field value.

## Responsive

- ≥ 520px: card sits at its 480px cap, centred, wordmark above.
- < 520px: card spans the available width; `AuthLayout`'s horizontal padding (`--sp-8`) keeps it off the edge. Radius, border, and shadow stay — the card does not go full-bleed.
- Fields stay stacked at every width. The submit button is full-width at every width.
- The password field's `trailing` slot is fixed-width, so the input's usable area shrinks with the card rather than the toggle overlapping the text.

## Accessibility

- Every `Input` has a real `<label>`; the uppercase micro-label is the label, not decoration.
- A field in error carries `aria-invalid="true"` and `aria-describedby` pointing at its `field-error-{fieldName}` node.
- The password field's hint is also referenced by `aria-describedby`, so it is announced before the visitor types.
- The error banner is `role="alert"` / `aria-live="polite"` so a server error is announced without stealing focus.
- The password toggle is a real `<button type="button">` with an `aria-label` that reflects the *action* ("Show password" / "Hide password") and `aria-pressed` reflecting the current state.
- The submit button carries `aria-busy` while loading.
- Focus is visible everywhere — the 3px violet ring, never `outline: none` without a replacement.
- Colour is never the only error signal: the message text carries the meaning.
- Contrast: `--text` on `--bg-panel` and `--on-accent` on `--accent` both clear AA; `--text-muted` is used for supporting copy only, never for a control label that carries meaning alone.

## DS gaps

Everything in this list has been added to `1_DS for dev/` — this is the record of what changed for this screen, not an open to-do.

| Gap | Resolution | Status |
|---|---|---|
| No signed-out shell anywhere in the Meridian build | `components/surfaces/AuthLayout.jsx` | done |
| `Input` had no trailing adornment, so the eye toggle had nowhere to sit | `trailing` prop on `Input` | done |
| No glyph-only button | `components/actions/IconButton.jsx` | done |
| No `eye` / `eye-off` glyphs in the icon dictionary | `components/icons/Eye.jsx` | done |
| `Button` had no in-flight state | `loading` prop, SVG spinner (no CSS keyframes exist in the DS) | done |
| `no-restricted-imports` pointed at an `index.js` that did not exist | `1_DS for dev/index.js` re-exports every component | done |

Known rough edges, not fixed here:

`InfoBanner` hardcodes its four tone triplets as literal `oklch(...)` values instead of tokens, so the error banner's soft red field and border are the one pair of colors on this screen that cannot be pointed at a `--variable`. The mockup mirrors the component verbatim rather than inventing a substitute. Promoting those tones to tokens is a design-system chore worth doing before the second screen adopts banners.

`_adherence.oxlintrc.json` declares each component's props exhaustively, which flags pass-through native attributes such as `placeholder`, `type`, and `data-testid` on `<Input>`. When the frontend lands, that rule needs the native-attribute allowance before the linter can be switched on without noise.

## Reference mockup

[01-organization-creation.mock.html](01-organization-creation.mock.html) — static, token-driven, every state on one page. Open it in a browser; it is the visual acceptance target for this screen.
