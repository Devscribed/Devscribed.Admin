---
id: "05"
kind: design
title: Member Detail: About — Design
pairs-with: 05-member-detail-about.md
routes: ["/org/{orgId}/members/{memberId}"]
design-system: "1_DS for dev"
tags: [member-detail, role-picker, job-title, zero-admin-guard, avatar, tabs, meridian]
---

# 05 — Member Detail: About · Design

Visual and interaction specification for `/org/{orgId}/members/{memberId}`. Pairs with [05-member-detail-about.md](05-member-detail-about.md), which owns the business rules, the API contracts, and every validation/error message. This file owns everything a developer would otherwise have to invent: which design-system component to reach for, which token drives which state, and what the on-screen wording is.

**Design system:** Teammerly Meridian, `1_DS for dev/`. Import components from `1_DS for dev/index.js` (via `apps/web/src/ds.ts`); never hardcode a color, size, or font — every value below is a token that already exists in `tokens/*.css`.

**Theme:** light only in this release.

**Ground truth, and a deliberate departure from it.** `1_DS for dev/templates/meridian-app/MeridianApp.dc.html` carries a section explicitly marked `<!-- MEMBER DETAIL (spec 05) -->`, and several concrete values below are lifted from it directly: the hue-from-name-sum avatar color hash (`avaEl`), the mail/clock icon paths (`icMail`/`icClock`), and the amber guard-message treatment. However, that template lays the screen out as two columns — a fixed 340px identity card beside a flexible tabs/content column, with the avatar and name sitting side by side. The business spec's own UI Description is explicit and unambiguous on this point: *"Header elements stack vertically at all breakpoints — no side-by-side layout."* That requirement wins. This design uses one centered column (max-width 600px) with the avatar, name, badges, and the Joined/email/timezone lines all stacked vertically — matching the business spec's ASCII wireframe, not the template's two-column layout. The template is treated as a token/value source here, not as a layout decision for this spec.

**Also carried forward from spec 04, not the template:** the header's role badge reuses spec 04's exact `Badge tone="info" outline dot={false}` treatment (`04-member-list-management.design.md`'s Component map) rather than the template's per-role hard-coded color pairs, so the role badge reads identically on the list row and on this detail header. Spec 04's own DS gaps table flagged per-role Badge tones as "open, not blocking" — this spec does not pick that up either, for the same reason: the business spec only requires "a role badge," not per-role color-coding.

---

## Member Detail — admin/manager view (editable)

### Layout

```
                    ← Back to members

                        ┌────┐
                        │ AK │            (initials avatar, 64px)
                        └────┘
                    Alex Kaminski
                     [ user ]              (role badge — info/outline)

                    Joined Jun 1, 2025
                    ✉ alex@acme.com
                    🕐 America/New_York

  ┌──────────────────────────────────────────────────────────┐
  │  ABOUT   Vacation   Projects   Roles   Payments           │
  │  ────                                                     │
  │                                                            │
  │  ROLE                                                     │
  │  [ user                                        ▾ ]        │
  │                                                            │
  │  JOB TITLE                                                │
  │  [ Enter a job title                             ]        │
  │                                                            │
  │  [ Save changes ]                                         │
  └──────────────────────────────────────────────────────────┘
```

- Everything below the back link — header, tab bar, and the About panel — sits inside one `Card`, matching the business spec's single bordered wireframe box. The back link itself sits above the card, outside it, following the same separation `PageHeader`/`Card` already use on the Members list (`apps/web/app/org/[orgId]/members/page.tsx`) rather than boxing it in in.
- Container: `max-width: 600px`, centered (`margin: 0 auto`), full width with the shell's own horizontal padding below that.
- Header block: avatar, name, role badge (+ "Removed" badge when applicable), then Joined/email/timezone — all centered, `flex-direction: column`, `align-items: center`, `text-align: center`. This is true at every viewport; there is no breakpoint where it switches to a row.
- Tab bar sits directly below the header, full width of the card; the About panel sits below the tab bar with `padding-top: var(--sp-10)`.

### Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Outer card | `Card` | default (`padded=true`) | — |
| Back link | native `next/link` `<a>` | `href="/org/{orgId}/members"` | `member-detail-back-link` |
| Avatar | local `AvatarInitials` (`./AvatarInitials.tsx`) | `fullName`, `initials` | `member-detail-avatar` |
| Name | native `<div>` | Grotesk 600, `--fs-20` | `member-detail-name` |
| Role badge | `Badge` | `tone="info"`, `outline`, `dot={false}` — same as spec 04's list-row role badge | `member-detail-role-badge` |
| Removed badge | `Badge` | `tone="inactive"` (removed member only) | `member-detail-removed-badge` |
| Joined | native `<div>` | "Joined {date}", viewer-local via `toLocaleDateString` | `member-detail-joined` |
| Email | native `<div>` + local `MailIcon` (`./icons.tsx`) | — | `member-detail-email` |
| Timezone | native `<div>` + local `ClockIcon` (`./icons.tsx`) | falls back to "—" when `timezone` is `null` | `member-detail-timezone` |
| Tab bar | `Tabs` (extended — see [DS gaps](#ds-gaps)) | `items` (one enabled, four `disabled`), `value="about"` | `member-detail-tab-about`, `member-detail-tab-vacation`, `member-detail-tab-projects`, `member-detail-tab-roles`, `member-detail-tab-payments` |
| Role picker | local `RoleSelect` (`./RoleSelect.tsx`) wrapping `Select` | `options` from `availableRoles`, `disabled` when guarded, `title` tooltip when guarded | `member-role-select-{id}` |
| Zero-admin guard message | `InfoBanner` | `tone="warning"`, `role="status"`, `aria-live="polite"` | `role-change-guard-message` |
| Job title input | `Input` | `label="Job title"`, `placeholder="Enter a job title"` | `job-title-input` |
| Job title inline error | `field-error.tsx`'s `errorNode` helper, same pattern as every other screen | — | `field-error-jobTitle` |
| Job title read-only | native `<div>` (micro-label + value) | rendered only when the value is non-empty | `job-title-readonly` |
| Save button | `Button` | `variant="primary"`, `loading`, `disabled` | `job-title-save-button` |
| Saved toast | `InfoBanner tone="success"` via `useToast()` | — | `toast-member-saved` |
| Save-error toast | `InfoBanner tone="error"` via `useToast()`'s new `tone` param — see [DS gaps](#ds-gaps) | — | `toast-member-save-error` (new; not in the business spec's required list, added for parity with the success toast) |
| Loading skeleton | local `LoadingSkeleton` (inline in `MemberDetailScreen.tsx`) | static token-colored blocks, no shimmer — same "no `Skeleton` primitive exists" gap spec 04 already recorded | `member-detail-loading-skeleton` |
| Not-found / error message | native `<div>` | renders the API's `message` (typically `MEMBER_MESSAGES.memberNotFound`) | `member-detail-not-found` (added; not in the business spec's required list) |

### Copy

Validation/error messages are **not** listed here — they are owned by the business spec's Error Messages table and must match it verbatim (`MEMBER_MESSAGES` in `@devscribed/validation`).

| Slot | Text |
|---|---|
| Back link | Back to members |
| Micro-label · role (editable) | Role |
| Micro-label · job title (editable and read-only) | Job title |
| Placeholder · job title | Enter a job title |
| Tab labels | About, Vacation, Projects, Roles, Payments |
| Save button | Save changes |
| Save button, in flight | Saving |
| Toast · save success | Changes saved |
| Toast · save error | the API's `message` (falls back to `MESSAGES.generic`, "Something went wrong. Please try again.") |
| Zero-admin guard (tooltip + inline message) | Organization must retain at least one admin — `MEMBER_MESSAGES.lastAdminGuard`, reused verbatim, not re-typed |
| Not-found / view-forbidden | the API's `message` (`MEMBER_MESSAGES.memberNotFound` / `MEMBER_MESSAGES.viewForbidden`) |
| Joined line | Joined {date} |

Role picker option labels are capitalized role names (Admin/Manager/User/Viewer), identical to spec 03's `InviteModal` convention; the header's role badge shows the raw lowercase role value with `text-transform: capitalize` applied via CSS, matching spec 04's list row exactly.

### States

| State | Header | Tab bar | Panel | Notes |
|---|---|---|---|---|
| **Loading** | absent | absent | `LoadingSkeleton` replaces everything below the back link | Shown from mount until the `GET` resolves. |
| **Not found / forbidden** | absent | absent | one line of text, no `Card` | `member-detail-not-found`. |
| **Editable, no guard** | full | About active, four disabled | role picker (if `canEditRole`) + job title input (if `canEditJobTitle`) + Save | — |
| **Editable, zero-admin guard** | full | as above | role picker rendered but `disabled`, `title` tooltip + `role-change-guard-message` banner beneath it; job title input and Save stay enabled | Only reachable when `isLastAdmin` and the member's current role is `admin`. |
| **Read-only (user/viewer, any target)** | full, role only in header badge | as above | `job-title-readonly` if non-empty, otherwise nothing; no picker, no input, no Save | Driven entirely by `canEditRole`/`canEditJobTitle` both being `false` — no client-side role/status branching. |
| **Read-only (removed member, any caller)** | full + `member-detail-removed-badge` | as above | same read-only panel as above | Same code path as the row above — a removed target's `canEditRole`/`canEditJobTitle` are `false` regardless of caller role. |
| **Saving** | unchanged | unchanged | Save disabled + spinner (`Button loading`); role picker and job title input `disabled` | — |
| **Save success** | role badge/joined-adjacent values refresh from a refetch | unchanged | Save re-enables | `toast-member-saved`; values persist because they come from the server's own response, not a locally-guessed patch. |
| **Save error** | unchanged | unchanged | job-title-length errors surface inline (`field-error-jobTitle`); every other error surfaces as `toast-member-save-error` | Form retains whatever the visitor typed; Save re-enables. |

### Interactions

- **Back link click** — `next/link` navigation to `/org/{orgId}/members`, no confirmation, no guard against unsaved changes (the business spec does not ask for one).
- **Disabled tab click** — no-op; the tab renders as a `<span>`, not an `<a>`, so there is nothing to click through to (see [DS gaps](#ds-gaps)).
- **Role picker change** — updates local state only; no request until Save. The Save button's `disabled` state is derived from a `dirty` check (role changed from the server's last-known value, or job title changed from it) — the business spec does not mandate this, but it mirrors the reference template's own `saveDisabled = !!jobErr || !dirty` and avoids a no-op `PUT` when nothing changed.
- **Job title input** — every keystroke re-validates against `validateJobTitle` from `@devscribed/validation` and updates `field-error-jobTitle` live, not only on blur (TC-05-E2E-11).
- **Save click** — sends `PUT { role, jobTitle }` (role always the current selection, even when the picker is hidden or guarded — read from local state, defaulting to the server's last-known role). On success, the screen **refetches** `GET` rather than hand-computing the next `canEditRole`/`canEditJobTitle`/`isLastAdmin`/`availableRoles` locally, since those four fields can legitimately change after a role edit and the server is their only source of truth. On failure: a `jobTitle`-keyed validation error goes to the inline field; every other error (`role_authority`, `last_admin_guard`, `member_removed`, `forbidden`, network/5xx) goes to the new error-toned toast.

### Responsive

- `max-width: 600px`, centered, per the business spec's explicit sizing.
- Below that width, the card spans the available content width with the shell's own padding; nothing here is full-bleed.
- The header never switches to a row layout at any breakpoint — this is the one explicit responsive rule the business spec states for this screen, and it holds uniformly rather than only "on mobile."
- Role picker and job title input are full-width blocks (`Select`/`Input` are already 100%-width by default), so they reflow naturally with the card.

---

## Member Detail — user/viewer view (read-only)

Same `Card`/header/tab-bar chrome. The panel differs only in what the API tells the client to render — no client-side role branching:

- No role picker (`canEditRole: false`).
- No job title input, no Save button (`canEditJobTitle: false`).
- `job-title-readonly` shows the current value if non-empty; nothing renders if it is empty (not even the "Job title" micro-label).
- The role is visible only as the header's `member-detail-role-badge` — it is not repeated in the panel, even though the internal reference template does repeat it there. The business spec is explicit ("Role is displayed as a static badge in the header only"), so this design intentionally does not follow the template on that point.

## Member Detail — removed member view

Visually identical to the read-only view above, plus the `member-detail-removed-badge` next to the role badge in the header. This is not a distinct code path — a removed member's `canEditRole`/`canEditJobTitle` are `false` from the API regardless of caller role (TC-05-INT-13), so the same read-only panel renders for an admin viewing a removed member as for a viewer viewing an active one.

---

## Loading & Not-found states

- **`member-detail-loading-skeleton`** — a static, token-colored (`--bg-sunken`) block layout roughly matching the header + tab bar + two-field form, centered like the loaded state. No shimmer/pulse animation, for the same reason spec 04 recorded: no `Skeleton` primitive with a defined animation exists in the design system yet, and this is not the spec to invent one.
- **`member-detail-not-found`** — a single line of muted text (`--text-muted`, `--fs-15`) where the header/card would be, carrying the API's message (`"Member not found"` on a `404`, `"You do not have permission to view this member"` on a `403`, `MESSAGES.generic` on anything else). No `Card`, no back-link duplication — the back link above it is always present regardless of this state.

## Accessibility

- `Input`/`Select` labels follow the same pattern every other screen in this app uses (a visible micro-label rendered by the component itself — see spec 02's design doc DS gap about `Input` having no first-class `errorId`/`hintId`, unchanged here).
- The job title field carries `aria-invalid`/`aria-describedby` pointing at `field-error-jobTitle`, via the shared `field-error.tsx` helper (`errorNode`) — identical to every other form field in the app.
- The zero-admin guard is exposed two ways at once: a native `title` tooltip on the `Select`'s trigger button (mouse-only) and the always-visible `role-change-guard-message` `InfoBanner` (`role="status"`, `aria-live="polite"`) — so the reason a control is disabled is available without a hover gesture, matching spec 04's same reasoning for its own delete-guard message.
- Disabled tabs carry `aria-disabled="true"` and render as a `<span>`, not a focusable, inert `<a>` — a screen reader or keyboard user cannot tab into a control that does nothing.
- The save-error toast is `role="alert"`/`aria-live="polite"` (vs. the success toast's `role="status"`) — see [DS gaps](#ds-gaps), since an error is the one case in this screen worth interrupting an assistive-technology user for.
- Colour is never the only signal: the "Removed" badge carries the literal word, not just a dimmed tint; the guard message states the reason in a full sentence, not just an amber tint on the picker.

## DS gaps

| Gap | Resolution | Status |
|---|---|---|
| `Tabs` had no way to render a placeholder item as disabled (non-interactive, greyed, no click) or to tag an individual tab with its own `data-testid` — both needed for the four always-disabled tabs (Projects/Roles/Payments, and Vacation until spec 07) | Added `disabled?: boolean` and `testId?: string` to `TabItem`; a disabled item now renders as a `<span aria-disabled="true">` instead of a clickable `<a>` (`1_DS for dev/components/navigation/Tabs.jsx`/`.d.ts`/`.prompt.md`) | done |
| `Select`'s JS implementation already forwards unknown props (including `title`) onto its trigger `<button>` via `...rest`, but `SelectProps` had no `title` field, so passing one was a type error despite working at runtime | Added `title?: string` to `SelectProps` (`1_DS for dev/components/forms/Select.d.ts`) — a type-only fix, no behavior change | done |
| No tooltip primitive exists anywhere in the design system | Used `Select`'s native `title` pass-through for the zero-admin guard, backed by an always-visible `InfoBanner` for the same message (see Accessibility) rather than inventing a new component for one screen | open, not blocking |
| `useToast()` only ever rendered `InfoBanner tone="success"` — this spec's save failures need an error-toned toast (business spec's Interactions section: "shows error toast with the API error message") | Added an optional third `tone: 'success' \| 'error' = 'success'` parameter to `showToast`; the toast stack now renders `InfoBanner tone={tone}` with `role="alert"` for errors / `role="status"` for success (`apps/web/src/toast.tsx`) | done |
| `Badge` has no role-specific tone (carried forward from spec 04's own DS gap, left "open, not blocking") | Not resolved here either — the header role badge reuses spec 04's `tone="info" outline dot={false}` treatment verbatim rather than introducing per-role colors, so the list and the detail header read identically | open, not blocking (unchanged from spec 04) |
| No mail/clock icon components exist under `components/icons/` (only `Eye`/`EyeOff`) | Added local `MailIcon`/`ClockIcon` in the route folder (`apps/web/app/org/[orgId]/members/[memberId]/icons.tsx`), paths lifted verbatim from the Meridian product template's icon dictionary (`icMail`, `P.timesheets`/`icClock`) rather than invented, so they match the rest of the product | open — a `components/icons/Mail.jsx`/`Clock.jsx` promotion would let a future screen reuse them without copy-pasting SVG paths again |

Carried forward from specs 01-04, still true here: `InfoBanner` hardcodes its four tone triplets as literal `oklch(...)` values rather than tokens — this spec's guard message and both toasts are three more untouched instances. `_adherence.oxlintrc.json`'s exhaustive prop declarations still flag pass-through native attributes (`data-testid`, `title`, etc.) on DS components.

## Reference mockup

No `05-member-detail-about.mock.html` exists. This spec's implementation was verified against `apps/api/src/members/members.service.ts`'s real `getDetail`/`updateDetail` directly — a fresh signup, `GET`, a successful `PUT`, the zero-admin-guard `409`, the job-title-length `400`, and a nonexistent-member `404` were all exercised live via curl against the running API, and every response shape matched this doc and the frontend's `MemberDetail` type byte-for-byte. `1_DS for dev/templates/meridian-app/MeridianApp.dc.html`'s member-detail section serves as the token/value reference today (see the "Ground truth, and a deliberate departure from it" note above for what was and was not taken from it). A mockup can be added later following `02-authentication-login.mock.html`'s pattern if one becomes useful.
