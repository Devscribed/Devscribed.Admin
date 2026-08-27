---
id: "03"
kind: design
title: User Invitation — Design
pairs-with: 03-user-invitation.md
routes: ["/accept-invite", "/members"]
design-system: "1_DS for dev"
tags: [invite, invitation, token, accept-invite, role-picker, onboarding, org-switch, meridian]
---

# 03 — User Invitation · Design

Visual and interaction specification for the invite modal on the Members screen and for `/accept-invite`. Pairs with [03-user-invitation.md](03-user-invitation.md), which owns the business rules, the API contracts, and every validation message. This file owns everything a developer would otherwise have to invent: which design-system component to reach for, which token drives which state, and what the on-screen wording is.

**Design system:** Teammerly Meridian, `1_DS for dev/`. Import components from `1_DS for dev/index.js`; never hardcode a color, size, or font — every value below is a token that already exists in `tokens/*.css`.

**Theme:** light only in this release.

**CTA rule — deliberately different from specs 01/02.** The README's shared rule ("submit CTA is never disabled for validation") is explicitly *not yet* applied to this spec. Both submit buttons here are disabled-until-valid: the invite modal's "Send invitation" stays disabled until the email passes format validation, and the accept screen's "Accept invitation" stays disabled until every visible field (and, for a new account, all three fields; for an org-switch, the confirmation checkbox too) is valid. This is a known inconsistency with the signed-out family's usual pattern, carried forward verbatim from the business spec rather than corrected here — see the README's Design Layer note. The "I understand" checkbox gate is not a validation gate at all; it stays disabled-until-checked regardless of which CTA rule a future pass adopts, because it is a deliberate confirmation step, not a correctness check.

---

## Invite Modal (on `/org/{orgId}/members`)

### Layout

```
  Members                                    [ Invite member ]   ← page header, admin/manager only

  ┌ Invite member ─────────────────────── ✕ ┐
  │                                          │
  │  EMAIL ADDRESS                           │
  │  [ you@company.com______________ ]       │
  │  FIELD-ERROR-EMAIL, if invalid           │
  │                                          │
  │  ROLE                                    │
  │  [ User                            ▾ ]   │
  │                                          │
  │  [ error banner ]                        │  ← only after a server error
  │                                          │
  │  [   Cancel   ] [   Send invitation   ]  │
  └──────────────────────────────────────────┘
```

- Trigger: `invite-open-button` in the Members `PageHeader`'s trailing action slot, `Button variant="primary"`. Rendered only when `useSession().role` is `admin` or `manager` — never rendered disabled, simply absent for `user`/`viewer`, matching how `Sidebar` gates nav entries.
- `Modal` at `width={480}`, matching the business spec's "max-width approximately 480px." Its own X close button is the "close/cancel affordance"; the footer also carries an explicit "Cancel" button because the Meridian `Modal.prompt.md` reference usage always pairs a secondary Cancel with the primary action in `actions`.
- Field order top to bottom: email, role — exactly the business spec's order. The error banner sits between the fields and the action row, matching the business spec's "error message area above submit button," which places it after the role field rather than at the top of the card (the placement spec 01/02 use for their own banners is not repeated here — this modal's error is scoped to one small form, not a full card).

### Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Trigger | `Button` | `variant="primary"` | `invite-open-button` |
| Modal shell | `Modal` | `title="Invite member"`, `width={480}`, `onClose`, `actions` | — |
| Form element | native `<form>` | `id="invite-form"` (so the footer's submit button can target it via the `form` attribute, since Meridian's `Modal` renders `actions` as a sibling of `children`, not nested inside them) | `invite-form` |
| Email | `Input` | `label`, `placeholder`, `type="email"`, `error` | `invite-email-input` |
| Role | `Select` | `label`, `value`, `onChange`, `options` | `invite-role-select` |
| Server error banner | `InfoBanner` | `tone="error"` | `invite-error-message` |
| Cancel | `Button` | `variant="secondary"`, in `Modal actions` | — |
| Submit | `Button` | `variant="primary"`, `loading`, `disabled`, `form="invite-form"`, in `Modal actions` | `invite-submit-button` |
| Success toast | `InfoBanner` inside a fixed toast layer (see [Toast](#toast)) | `tone="success"` | `toast-invite-sent` |

Inline field error carries `field-error-email`, rendered the same way as every other screen — see `apps/web/src/field-error.tsx` and the DS gap recorded in spec 02's design doc (`Input`'s `error`/`hint` prop has no first-class id).

### Copy

Validation messages are **not** listed here — they are owned by the business spec (requirement 11) and must match its tables exactly.

| Slot | Text |
|---|---|
| Trigger button | Invite member |
| Modal title | Invite member |
| Micro-label · email | EMAIL ADDRESS |
| Micro-label · role | ROLE |
| Placeholder · email | you@company.com |
| Cancel button | Cancel |
| Submit button | Send invitation |
| Submit button, in flight | Sending |
| Toast | Invitation sent to {email} — verbatim from the business spec |

Role option labels are the role names, capitalized: Admin, Manager, User, Viewer. The option set itself is not copy — it is `ROLE_VALUES` from `@devscribed/validation`, filtered by `canAssignRole`'s admin/manager split (business spec requirement 4).

### States

| State | Field | Submit | Notes |
|---|---|---|---|
| **Default** | email empty, role defaulted to `User` | disabled | Matches the business spec's default state exactly. |
| **Email invalid** | border/label/message `--error-500` after blur | disabled | `field-error-email`. |
| **Ready** | valid email, role selected | enabled | Live check on every keystroke, not just on blur — the button must reflect validity immediately once the visitor finishes typing a valid address, without requiring a blur first. |
| **Loading** | fields read-only, `opacity: .55`; role `Select` `disabled` | `loading`, label "Sending" | — |
| **Server error** | values retained | back to enabled | `InfoBanner tone="error"` in `invite-error-message`. Modal stays open. |
| **Success** | — | — | Modal closes, list refetches, `toast-invite-sent` appears bottom-right for 4s. |

### Interactions

- **Blur on email** — runs `validateEmail`. Invalid → `field-error-email`. Valid → clears.
- **Every keystroke in email** — recomputes live validity to drive the submit button's `disabled` prop (see the CTA rule note above). Also clears the server-error banner, per the business spec's Interactions section ("clears when the user modifies the email field").
- **Role change** — does not clear the server-error banner; only editing the email does, matching the business spec literally (it names only the email field for this rule).
- **Cancel / X** — resets the form (email, role, both error states) and closes. No request.
- **Submit** — re-validates email defensively, then `POST /api/invitations`. Success closes the modal, refetches the member list, and fires the toast. Failure keeps the modal open with the message in `invite-error-message` and the fields retaining their values, per Alternative Flows D/E/F.

### Responsive

- `Modal` is already responsive: `width: '100%', maxWidth: 480` with `padding: 20` on the scrim, so it naturally gains side margins on narrow viewports without any screen-specific work.
- Fields stay stacked; the action row's two buttons are `flex: 1` each so Cancel and Send invitation split the footer evenly at every width.

---

## Accept Invitation Screen (`/accept-invite?token={token}`)

### Layout

This screen joins the signed-out set (README: "spec 03's accept-invite screen also belongs to the signed-out set and should adopt the shell rules"). One `AuthLayout`, one 480px card, the card title never changes across phases — same discipline as `/reset-password`'s four bodies.

```
       Teammerly●
  ┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐
  │ You're invited          │  │ You're invited          │  │ You're invited          │
  │                          │  │                          │  │                          │
  │       ◜◝                │  │ You've been invited to  │  │ [ error banner ]         │
  │   Checking your          │  │ join Acme Inc            │  │                          │
  │   invitation…            │  │ as a user                │  │                          │
  │                          │  │                          │  │                          │
  │                          │  │ FIRST NAME               │  │                          │
  │                          │  │ [_____________]          │  │                          │
  │                          │  │ LAST NAME                │  │                          │
  │                          │  │ [_____________]          │  │                          │
  │                          │  │ PASSWORD                 │  │                          │
  │                          │  │ [___________] 👁          │  │                          │
  │                          │  │ [ Accept invitation ]    │  │                          │
  └────────────────────────┘  └────────────────────────┘  └────────────────────────┘
      Back to login              Back to login                Back to login
       1 · CHECKING                2 · NEW ACCOUNT               3 · TOKEN INVALID

  ┌────────────────────────┐
  │ You're invited          │
  │                          │
  │ You've been invited to  │
  │ join New Corp            │
  │ as an admin               │
  │                          │
  │ Welcome back! Enter your │
  │ password to confirm your │
  │ identity.                │
  │                          │
  │ PASSWORD                 │
  │ [___________]            │
  │                          │
  │ [ warning banner ]        │
  │ ☐ I understand            │
  │                          │
  │ [ Accept invitation ]    │
  └────────────────────────┘
       4 · EXISTING ACCOUNT, ORG-SWITCH
```

The footer link is present in every phase, so it is never the thing that moves.

### Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page shell | `AuthLayout` | `title="You're invited"`, `footer` | — |
| Checking indicator | `Spinner` + muted line | `size={28}` | `accept-invite-checking` |
| Screen wrapper | native `<div>` | wraps org name/role/form/error once the token has resolved | `accept-invite-screen` |
| Token error | `InfoBanner` | `tone="error"` | `accept-invite-error` |
| Org name | native `<p>` | — | `accept-invite-org-name` |
| Role | native `<p>` | — | `accept-invite-role` |
| Form element | native `<form>` | — | `accept-form` |
| First name (new account) | `Input` | `label`, `error` | `accept-first-name-input` |
| Last name (new account) | `Input` | `label`, `error` | `accept-last-name-input` |
| Password | `Input` | `label`, `error`, `type`, `trailing` (new account only) | `accept-password-input` |
| Password reveal (new account only) | `IconButton` + `Eye` / `EyeOff` | `label`, `active` | `accept-password-toggle` |
| Org-switch warning | `InfoBanner` | `tone="warning"` | `accept-org-switch-warning` |
| Org-switch confirm | `Checkbox` | `checked`, `onChange`, `label="I understand"` | `accept-org-switch-confirm` |
| Submit-time error | `InfoBanner` | `tone="error"` | `accept-invite-error` (same testid as the token error — see States) |
| Submit | `Button` | `variant="primary"`, `size="lg"`, `loading`, `disabled`, full width | `accept-submit-button` |
| Back-to-login link | native `<a>` in `AuthLayout footer` | — | `accept-back-link` |

Inline field errors carry `field-error-firstName`, `field-error-lastName`, `field-error-password` — the new-account variant's three, and the existing-account variant's one (`field-error-password`, reused for both "required" and "incorrect password").

**No reveal toggle on the existing-account password field.** The business spec's Components section places the toggle only under the new-account variant; the existing-account variant's password field has no such line. A returning member is re-typing a password they already know and can verify by successfully signing in — reveal exists on the new-account field to help a person confirm what they just composed, the same reasoning spec 01 uses for `/signup`.

### Copy

Validation messages are **not** listed here — they are owned by the business spec.

| Slot | Text |
|---|---|
| Card title (all phases) | You're invited |
| Checking line | Checking your invitation… |
| Org name | You've been invited to join {organizationName} |
| Role | as a {role} |
| Existing-account greeting | Welcome back! Enter your password to confirm your identity. |
| Micro-label · first name | First name |
| Micro-label · last name | Last name |
| Micro-label · password | Password |
| Org-switch warning | Owned by the business spec (requirement 6 / UI Description) — rendered verbatim, including the last-admin addendum when `lastAdmin` is `true`. |
| Confirm checkbox | I understand |
| Submit button | Accept invitation |
| Submit button, in flight | Accepting |
| Token error | Owned by the business spec (requirement 11's token-validation table) |
| Footer | Back to login |

"As a {role}" is rendered literally from the business spec's copy, including for `admin` — the business spec's exact string is "as a {role}," not "as an {role}," so the copy is not corrected for the admin case here. This is flagged rather than silently fixed because the business spec owns this wording.

### States

| State | Body | Submit | Notes |
|---|---|---|---|
| **Checking** | `Spinner size={28}`, centred, with the muted line beneath | absent | `accept-invite-checking`, `role="status"`. Runs from first paint until `GET /api/invitations/{token}/validate` answers. |
| **Token invalid / expired / used** | org name, role, and form removed; only the error remains | absent | `InfoBanner tone="error"` in `accept-invite-error`, inside `accept-invite-screen`. |
| **New-account form** | org name, role, three empty fields | disabled | `newAccountValid` recomputed live from `validateInviteAcceptNewAccount`. |
| **Existing-account form** | org name, role, greeting, one empty field | disabled until password is non-empty | No name fields. |
| **Org-switch warning** | warning banner + unchecked "I understand" | disabled regardless of password | Applies only to the existing-account variant — a brand-new account has no prior membership to switch from. |
| **Field validation error (new account)** | offending field(s) in error state | disabled | Re-runs on blur and on submit; submit re-enables once every field passes. |
| **Loading** | fields read-only, `opacity: .55`; checkbox `disabled` | `loading`, label "Accepting" | — |
| **Wrong password** | password field in error | re-enabled | `field-error-password`: "Incorrect password." Token is not consumed (business spec Alt Flow L). |
| **Org-switch confirmation raced away** | warning banner (re)appears, checkbox resets to unchecked | re-enabled, still gated by the checkbox | Only reachable if the account's membership changed between `validate()` and submit — the accept call's `409` is treated as "the warning we should have shown," not a generic error. |
| **Server error** | values retained | re-enabled | `InfoBanner tone="error"` in `accept-invite-error`, now rendered alongside the form rather than in place of it. |
| **Success** | — | — | Redirect to `/org/{orgId}/members` (see [API contract note](#api-contract-note-redirectto) below). No intermediate confirmation screen. |

### Interactions

- **Page load** — `token` is read from the `token` query parameter and sent to `GET /api/invitations/{token}/validate`. A missing token skips the request and goes straight to the invalid state, mirroring `/reset-password`'s treatment of a missing token.
- **Blur on a new-account field** — runs that field's validator (`validateFirstName` / `validateLastName` / `validatePassword`, the same functions spec 01 uses).
- **Every keystroke (new account)** — recomputes `newAccountValid` live to drive the submit button, per this spec's disabled-until-valid CTA rule.
- **"I understand" checkbox** — toggles independently of password validity; the submit button requires both a non-empty password and (when `orgSwitch` is true) a checked box.
- **Password toggle (new account only)** — identical behavior to `/signup`: flips `type`, swaps `Eye`/`EyeOff`, never moves focus or the value.
- **Submit (new account)** — re-validates all three fields client-side; on failure, every applicable error renders at once and focus moves to the first invalid field (business spec's field order: firstName → lastName → password), no request goes out. On success, `POST /api/invitations/accept` with `{ token, firstName, lastName, password, timezone }`.
- **Submit (existing account)** — `POST /api/invitations/accept` with `{ token, password, orgSwitchConfirmed }`. `orgSwitchConfirmed` is sent as `true` only when the warning was shown and checked; the field is always present in the payload (`false` otherwise) since the API's own gate is `dto.orgSwitchConfirmed !== true`, not "field absent."
- **Token dies between page load and submit** — if `accept` responds with the same two token-level messages `validate` uses (expired / no-longer-valid), the screen drops out of the form entirely and re-renders the invalid state, the same defensive pattern `/reset-password` uses for a token that expires mid-visit.
- **Error clearing** — inline field errors clear on the next successful blur of that field. The submission-level error (`accept-invite-error`) clears the moment any field value changes, mirroring every other screen's server-error-dismissal rule.

### Responsive

- Card at its 480px cap, centred, wordmark above; below 520px the card spans the available width with `AuthLayout`'s horizontal padding, identical to `/signup`, `/login`, `/forgot-password`, `/reset-password`.
- Fields stay stacked at every breakpoint — no side-by-side layout, per the business spec's explicit responsive note.
- The password field's `trailing` slot is fixed-width, matching every other password field in the signed-out set.

## Accessibility

- Every `Input`/`Select`/`Checkbox` has a real, associated label.
- A field in error carries `aria-invalid="true"` and `aria-describedby` pointing at its `field-error-{fieldName}` node, via the same `field-error.tsx` helper every other screen uses.
- `accept-invite-checking` and `reset-checking` share the same pattern: `role="status"`, visible text, `Spinner` itself `aria-hidden`.
- Every `InfoBanner` on both surfaces — `invite-error-message`, `accept-invite-error`, `accept-org-switch-warning`, and the `toast-invite-sent` toast — is `role="alert"` (`role="status"` for the toast, since it is not blocking) with `aria-live="polite"`.
- Submit buttons carry `aria-busy` while loading (built into `Button`).
- The password reveal toggle is a real `<button type="button">` with an action-phrased `aria-label` and `aria-pressed`, identical to `/signup` and `/login`.
- Focus is visible everywhere — the 3px violet ring, never suppressed.
- Colour is never the sole signal: the org-switch banner's amber tone reinforces wording that already states the consequence in full sentences.

## Toast

No toast mechanism existed anywhere in `apps/web` before this spec (spec 04 will need `toast-member-removed` / `toast-member-restored` on the same primitive, so it is built once, not per-modal). `apps/web/src/toast.tsx` exports a `ToastProvider` (mounted once, in the root layout, so every route can call it) and a `useToast()` hook returning `showToast(testId, message)`. A toast is an `InfoBanner tone="success"` inside a fixed bottom-right stack, auto-dismissing after four seconds. It intentionally does not queue, animate, or persist across reloads — nothing in spec 03 needs more than that, and spec 04 can extend it if it does.

## API contract note — `redirectTo`

`POST /api/invitations/accept`'s success response is `{ accountId, redirectTo: "/members" }` (`apps/api/src/invitations/invitations.controller.ts`). That path does not exist as a route — every signed-in screen lives under `/org/{orgId}/members` (`apps/web/app/org/[orgId]/layout.tsx`), and the response carries no organization id for the client to build that URL from. The business spec's own UI Description also says "redirects the invitee to the Members list screen (`/members`)," so this is not a frontend bug — the literal string is what the running server returns. The accept screen resolves this the same way the app shell itself does: after a successful accept (the session cookie is already set), it calls `GET /api/me` and routes to `/org/{organization.id}/members` — the same pattern `LoginForm` and `SignupForm` already use for their own post-auth redirect, just via `/api/me` instead of a field already present in their response bodies. Not recorded as a DS gap — it is an API/route contract mismatch, not a design-system one — but noted here because it materially changed how "Success" behaves versus the business spec's literal text.

## DS gaps

| Gap | Resolution | Status |
|---|---|---|
| No toast/inline-notification-stack primitive anywhere in the app | `apps/web/src/toast.tsx` — `ToastProvider` + `useToast()`, built on the existing `InfoBanner` rather than a new DS component | done, app-level (not promoted into `1_DS for dev/` — it composes an existing DS component rather than adding one) |
| `Modal`'s `actions` prop renders as a sibling of `children`, not nested inside them, so a submit button placed in `actions` cannot be a native descendant of the `<form>` in `children` | the form carries `id="invite-form"`; the footer's submit button uses the standard HTML `form="invite-form"` attribute to associate across the DOM boundary | open — a first-class `Modal` behavior (rendering `<form>` as the outer element when the caller wants one) would remove the need for this attribute, but the attribute is standard HTML, not a hack, so this is a minor convenience gap rather than a blocker |
| `Checkbox` spreads `...rest` (including `data-testid`) onto the outer `<label>`, not onto the actual `<input type="checkbox">` | `accept-org-switch-confirm` resolves to the label element; acceptable since the label wraps the input and both are always in sync, but a first-class `inputProps`/`data-testid`-on-input passthrough would be more precise | open |

Carried forward from specs 01 and 02, still true here:

`InfoBanner` hardcodes its four tone triplets as literal `oklch(...)` values rather than tokens. This spec is the third to hit all four tones (`invite-error-message`, `accept-invite-error`, `accept-org-switch-warning`'s `warning`, and the toast's `success`) without promoting them — the README named this as "the outstanding design-system chore before spec 03 adds more banners," and it remains outstanding after this spec too. Recorded again rather than fixed, so the next spec does not have to rediscover it.

`_adherence.oxlintrc.json`'s exhaustive prop declarations still flag pass-through native attributes (`placeholder`, `type`, `data-testid`) on `Input`/`Select`/`Checkbox`. Unchanged from specs 01/02's note.

## Reference mockup

No `03-user-invitation.mock.html` exists yet. Specs 01 and 02 each ship a static mockup as the visual acceptance target; this spec's implementation was verified against the running API's real request/response shapes instead (`apps/api/src/invitations/`), and against this design doc's States tables directly in the component code. A mockup can be added later following the same pattern as `01-organization-creation.mock.html` / `02-authentication-login.mock.html` if one becomes useful.
