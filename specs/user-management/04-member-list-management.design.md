---
id: "04"
kind: design
title: Member List & Management — Design
pairs-with: 04-member-list-management.md
routes: ["/org/{orgId}/members"]
design-system: "1_DS for dev"
tags: [member-list, search, soft-delete, restore, last-admin-guard, meridian]
---

# 04 — Member List & Management · Design

Visual and interaction specification for `/org/{orgId}/members`. Pairs with [04-member-list-management.md](04-member-list-management.md), which owns the business rules, the API contracts, and every validation/error message. This file owns everything a developer would otherwise have to invent: which design-system component to reach for, which token drives which state, and what the on-screen wording is.

**Design system:** Teammerly Meridian, `1_DS for dev/`. Import components from `1_DS for dev/index.js`; never hardcode a color, size, or font — every value below is a token that already exists in `tokens/*.css`.

**Theme:** light only in this release.

**Ground truth.** Unlike specs 01-03, no `04-member-list-management.mock.html` exists. `1_DS for dev/templates/meridian-app/MeridianApp.dc.html` does carry a members-list section explicitly marked `<!-- MEMBERS (spec 04) -->`, and its tokens, spacing, and the row/menu structure below are lifted from it directly — but that template's row also shows About/Projects/Payment columns from specs 05, 07, and 11, which are out of scope here and are not built. This spec's table is Name / Role / Email / Actions, matching the business spec's own wireframe.

This screen replaces the spec-01 placeholder list (`apps/web/app/org/[orgId]/members/page.tsx`'s original docstring: *"Minimal landing screen for spec 01 … Search, the removed filter and the row actions belong to spec 04"*) while keeping spec 03's invite integration (`invite-open-button`, `InviteModal`) exactly as it was.

---

## Members List — admin/manager view

### Layout

```
  Active members                                    [ Invite member ]   ← page header

  [🔍 Search members...]                     ☐ Show removed members

  ┌─────────────────────────────────────────────────────────────────┐
  │ NAME                    │ ROLE     │ EMAIL              │ ⋯     │
  ├──────────────────────────┼──────────┼─────────────────────┼───────┤
  │ ⓐ Alex Kaminski          │  user    │ alex@co.com         │  ⋮   │
  │ ⓟ Pat Owner (you)        │  admin   │ pat@co.com          │      │
  │ ⓢ Sam Manager  Removed   │  admin   │ sam@co.com          │  ⋮   │
  └─────────────────────────────────────────────────────────────────┘
```

- Title "Active members" — `PageHeader`, unchanged regardless of the search term or the removed filter (business spec requirement: literal, not a dynamic count).
- The `invite-open-button` stays in `PageHeader`'s trailing action slot exactly as spec 03 built it — this spec does not touch that wiring, only the row markup below it.
- Search field and the "Show removed members" checkbox sit on one row beneath the header, search leading (max-width 320px so it doesn't stretch the full content width), checkbox trailing — `justify-content: space-between`, wrapping on narrow viewports.
- The table sits below, full width, in the DS `Table` shell (14px radius, 1px border, warm shadow, uppercase Grotesk header row).
- Each row: a 32px violet-soft initials avatar, the full name (`+ " (you)"` for the caller's own row, verbatim from the business spec's wireframe), an inline "Removed" badge when the row is removed, then Role/Email/Actions in their own columns.

### Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page title | `PageHeader` | `title="Active members"` | `page-title` |
| Invite trigger | `Button` | `variant="primary"` — unchanged from spec 03 | `invite-open-button` |
| Search | `SearchField` | `placeholder="Search members..."`, `value`, `onChange` | `members-search-input` |
| Removed filter | `Checkbox` | `checked`, `onChange`, `label="Show removed members"` | `show-removed-checkbox` |
| Table | `Table` (extended — see [DS gaps](#ds-gaps)) | `columns`, `rows`, `onRowClick` | `members-list` |
| Name cell | native, inside `Table`'s `render` | avatar + name span + conditional `Badge` | `member-name-{id}` |
| Status badge | `Badge` | `tone="inactive"` (removed rows only) | `member-status-badge-{id}` |
| Role badge | `Badge` | `tone="info"`, `outline`, `dot={false}` | `member-role-badge-{id}` |
| Email cell | native `<span>` | muted, truncates | `member-email-{id}` |
| Row actions trigger | `IconButton` + a local dots glyph (`DotsIcon`, `apps/web/src/layout/icons.tsx`) | `label="Actions"`, `aria-haspopup="menu"`, `aria-expanded` | `member-row-actions-{id}` |
| Row actions menu | local `MemberRowActions` (no DS primitive — see [DS gaps](#ds-gaps)) | open/outside-click/Escape, same pattern as `Topbar`'s account menu | — |
| Delete menu item | native `<button role="menuitem">` | disabled + `title` tooltip when `isLastAdmin` | `member-action-delete` |
| Delete guard note | native `<span>` inside the disabled Delete item | always visible once disabled, not hover-only | `delete-guard-message` |
| Restore menu item | native `<button role="menuitem">` | no confirmation, fires immediately | `member-action-restore` |
| Empty state | `Card` (`padded={false}`) + native `<div>` | centred, one line | `members-empty-state` |
| Loading skeleton | local `MembersLoadingSkeleton` (no DS `Skeleton` — see [DS gaps](#ds-gaps)) | static token-colored bars | `members-loading-skeleton` |
| Delete dialog | `Modal` (extended — see [DS gaps](#ds-gaps)) | `title="Remove member"`, `actions` | `confirm-delete-dialog` |
| Delete cancel | `Button` | `variant="secondary"` | `cancel-delete-button` |
| Delete confirm | `Button` | `variant="danger"`, `loading` | `confirm-delete-button` |
| Success toasts | `InfoBanner tone="success"` via `useToast()` (spec 03's mechanism) | — | `toast-member-removed`, `toast-member-restored` |

The Actions column itself (header cell and every row's cell) is present only when `can(callerRole, 'delete-restore')` is true — `callerRole` is read from the freshest `GET /members` response, per the business spec's own note that this field "drives whether Actions column is rendered." `MembersTable` renders nothing in the Actions cell for the caller's own row (no menu, not a disabled one — the business spec is explicit that the row "has no actions menu shown," not a menu missing one item).

### Copy

Validation/error messages are **not** listed here — they are owned by the business spec's Error Messages table and must match it verbatim.

| Slot | Text |
|---|---|
| Page title | Active members |
| Search placeholder | Search members... |
| Removed checkbox | Show removed members |
| Table header · name | Name |
| Table header · role | Role |
| Table header · email | Email |
| Table header · actions | Actions |
| Own row suffix | (you) |
| Status badge (removed row) | Removed |
| Row menu · active row | Delete |
| Row menu · removed row | Restore |
| Delete guard tooltip / `delete-guard-message` | Cannot remove the last admin |
| Empty state | No members found |
| Delete dialog title | Remove member |
| Delete dialog body | Are you sure you want to remove {member.fullName}? They will lose access immediately. |
| Delete dialog · cancel | Cancel |
| Delete dialog · confirm | Remove |
| Delete dialog · confirm, in flight | Removing |
| Toast · delete success | Member removed |
| Toast · restore success | Member restored |

"Cannot remove the last admin" is distinct from the business spec's `MEMBER_MESSAGES.lastAdminGuard` string ("Organization must retain at least one admin") — the Error Messages table lists them as two separate rows (`Delete — last admin` vs. `Delete guard tooltip`) for two different surfaces: the guard string is what the API returns if the call is somehow still made; the tooltip string is what the UI shows to explain why the control is already disabled. Neither is exported from `@devscribed/validation` (the tooltip is UI-only copy, never sent over the wire), so it is hardcoded once in `MemberRowActions.tsx` with a comment pointing at this table.

### States

| State | Table | Search / checkbox | Actions column | Notes |
|---|---|---|---|---|
| **Loading** | `MembersLoadingSkeleton` replaces the table | enabled, keeps whatever the visitor typed | — | Shown on first paint *and* on every subsequent fetch (search debounce, removed-filter toggle, post-mutation refetch) — the business spec's "shown while fetching" is read literally, not "first load only." |
| **Loaded, has rows** | `Table` with data rows | enabled | present iff `can(callerRole,'delete-restore')` | — |
| **Loaded, zero rows** | `Card` empty state, `members-empty-state` | enabled | — | Only reachable via search/removed-filter mismatch — the precondition (≥1 admin) means the unfiltered active list is never empty. |
| **Row · active, not self** | — | — | Delete enabled | `member-action-delete` |
| **Row · active, not self, last admin** | — | — | Delete disabled, `title` + `delete-guard-message` | Menu still opens; only the one item is inert. |
| **Row · active, self** | — | — | no menu at all | `MembersTable` skips rendering `MemberRowActions`. |
| **Row · removed** | inline `Removed` badge | — | Restore only | No Delete option exists in this row's menu. |
| **Delete dialog · open** | — | — | — | `confirm-delete-dialog`, body names the target by `fullName`. |
| **Delete dialog · submitting** | — | — | — | Cancel disabled; Confirm `loading`, label "Removing"; the scrim/X close is a no-op (`onCancel` early-returns while submitting). |
| **Delete · success** | refetches | — | — | Dialog closes, `toast-member-removed`. |
| **Delete · error** | refetches anyway (no optimistic state to roll back) | — | — | Dialog closes, error toast carries the API's `message` verbatim. |
| **Restore · click** | — | — | — | No dialog; fires immediately. |
| **Restore · success** | refetches | — | — | `toast-member-restored`; the row's badge disappears once the refetch lands (or the row leaves the visible set if "Show removed" is off). |
| **Restore · error** | refetches anyway | — | — | Error toast with the API's `message`. |

### Interactions

- **Typing in search** — every keystroke updates the input's own state immediately (so the field never feels laggy); a separate debounced value updates 300ms after the last keystroke, and *that* value is what the fetch effect depends on. No request fires until the visitor pauses (TC-04-UNIT-06 / TC-04-E2E-01). Clearing the box is not special-cased — it debounces through the same path and lands on an empty `search` param.
- **Toggling "Show removed members"** — fires an immediate refetch (no debounce; a checkbox click is already a single discrete action, unlike keystrokes). Search and the filter compose server-side: both params are always sent together.
- **Clicking a row** — anywhere except the actions menu navigates to `/org/{orgId}/members/{memberId}` (spec 05). The actions menu's own wrapper `stopPropagation`s every click inside it (the trigger and every menu item), so opening the menu or picking an item never also fires the row's navigation.
- **Opening a row's menu** — closes on outside click or Escape, identical to `Topbar`'s existing account menu. Opening a second row's menu closes the first automatically, because the first's outside-click listener treats the second row's trigger as "outside."
- **Clicking Delete (enabled)** — closes the menu, opens `confirm-delete-dialog`. Clicking it while disabled (last admin) does nothing; the click handler itself no-ops in addition to the native `disabled` attribute.
- **Confirming delete** — `DELETE .../members/{id}`; the dialog closes and the list refetches regardless of outcome (success or error) — the business spec's flows only call out a refetch on success, but refetching unconditionally costs one extra idle-network request on the rare error path and keeps the UI honest about server state (e.g. a concurrent last-admin change) without adding a second code path.
- **Clicking Restore** — `POST .../restore` immediately, no dialog, per the business spec's explicit "no confirmation dialog."
- **Every mutation** — no optimistic local list edits. The rendered list always comes from the most recent successful `GET`, per the business spec's Concurrency note and this spec's own instruction to avoid a second source of truth.

### Responsive

- The search/checkbox row wraps (`flex-wrap: wrap`) below the point where both no longer fit — search keeps its 320px cap, the checkbox drops to its own line.
- Table columns use flex ratios, not fixed pixel widths, so the layout compresses gracefully; Name (2.2) and Email (1.8) truncate with an ellipsis before Role (1) or Actions (0.6) ever have to shrink.
- The row-actions dropdown is `position: absolute; right: 0`, so it never overflows the table's right edge regardless of viewport width.
- `Modal`'s existing responsive behavior (`width: 100%, maxWidth` with scrim padding) covers the delete dialog with no screen-specific work.

---

## Members List — user/viewer view

Identical layout, minus:
- No Actions column header, no per-row menu, no `member-row-actions-*` node anywhere in the DOM (TC-04-E2E-04) — `MembersTable` only pushes the Actions column definition when `canManage` is true, so there is nothing to hide with CSS; it is simply never rendered.
- Search and the removed checkbox behave identically — both roles can filter and reveal removed members, they just cannot act on any row.
- Rows still navigate to the (read-only) detail page.

No separate component exists for this variant — it is the same `MembersTable`/`MembersLoadingSkeleton`/empty-state with one boolean (`canManage`) turned off.

---

## Delete Confirmation Dialog

### Layout

```
  ┌ Remove member ──────────────────────────── ✕ ┐
  │                                                │
  │  Are you sure you want to remove Alex          │
  │  Kaminski? They will lose access immediately.  │
  │                                                │
  │              [ Cancel ]   [ Remove ]           │
  └────────────────────────────────────────────────┘
```

`Modal` at its default 420px width (the business spec gives no explicit width for this dialog, unlike spec 03's 480px invite modal) — a two-sentence confirmation does not need the wider card. Footer buttons are `flex: 1` each, matching spec 03's Cancel/Submit split.

### States

| State | Body | Cancel | Confirm |
|---|---|---|---|
| **Open** | names the target by `fullName` | enabled | enabled, `variant="danger"`, label "Remove" |
| **Submitting** | unchanged | disabled | `loading`, label "Removing" |
| **Closed (any outcome)** | dialog unmounts; the list/toast reflect the result | — | — |

### Interactions

- Cancel, the modal's own X, and clicking the scrim all route through the same `onCancel`, which early-returns while a delete is in flight — mirroring `InviteModal`'s `handleClose` guard.
- Confirm always closes the dialog before the toast appears, whether the call succeeded or failed — there is no in-dialog error banner (unlike `InviteModal`, which keeps its modal open on error). The business spec's flow is explicit: "closes the dialog, shows error toast," not "keeps the dialog open."

---

## Loading & Empty States

- **`members-loading-skeleton`** — a static block matching the table's chrome (header bar + N row-shaped bars: an avatar circle, a name bar, a role-pill bar, an email bar). No animation, since no `Skeleton` primitive with a defined pulse/shimmer exists in the design system yet (see [DS gaps](#ds-gaps)) and this spec is not the place to invent one.
- **`members-empty-state`** — a `Card` with one centred line, "No members found," in Grotesk 16px on `--text-faint` — the same wording and register as the DS README's own empty-state guidance ("a single flat statement, no illustration, no pep").

## Accessibility

- The row-actions trigger is a real `<button>` (`IconButton`) with `aria-label="Actions"`, `aria-haspopup="menu"`, and `aria-expanded`; the menu itself carries `role="menu"`, each item `role="menuitem"`.
- The disabled Delete item carries both a native `title` (a real hover tooltip) and a permanently-rendered `delete-guard-message` span — the reason is available to a screen reader without requiring a hover gesture, not only to a mouse user.
- `Modal`'s dialog surface now always carries `role="dialog"` / `aria-modal="true"` (see [DS gaps](#ds-gaps)) — `confirm-delete-dialog` gets this for free.
- Toasts reuse spec 03's `ToastProvider`, already `role="status"` / `aria-live="polite"`.
- Focus is never trapped or moved into the delete dialog automatically beyond the browser's own default; this matches spec 03's `InviteModal`, which does the same (no new pattern introduced here).
- Colour is never the only signal for "removed": the row also carries the literal word "Removed" in its badge, not just a dimmed tint.

## DS gaps

| Gap | Resolution | Status |
|---|---|---|
| `Table` had no way to make a row clickable, tag a row with `data-testid`, or forward `data-testid`/aria attributes to its own root — all three needed for `member-row-{id}`, row-click-to-navigate, and `members-list` | Added `onRowClick` and a per-row `testId` field to `Table`'s row type; added a `...rest` spread on `Table`'s root `<div>` (`1_DS for dev/components/data/Table.jsx`/`.d.ts`/`.prompt.md`) | done |
| `Modal` didn't forward any props besides its named ones — `confirm-delete-dialog` had nowhere to attach | Added a `...rest` spread onto the dialog surface `<div>`, plus `role="dialog"`/`aria-modal="true"` unconditionally (`1_DS for dev/components/surfaces/Modal.jsx`/`.d.ts`/`.prompt.md`) | done |
| No dropdown/menu primitive exists under `components/navigation/` or `components/actions/` for a per-row "⋮" menu with open/outside-click/Escape behavior | Built `MemberRowActions.tsx` locally in the app, following the exact same open/outside-click/Escape pattern `Topbar.tsx` already uses for the account menu — not promoted into the DS by this task, per the pragmatic allowance in this task's own instructions, but it is now the second hand-rolled instance of the identical pattern (`Topbar`'s account menu, this row menu) and should become a real `Menu`/`Dropdown` DS component before a third one is needed | open, flagged for promotion |
| No `Skeleton` primitive exists in the design system | Approximated in `MembersLoadingSkeleton.tsx` with static, token-colored placeholder bars (`--bg-header` fills) — no shimmer/pulse, since the DS has not specified one | open |
| `Badge` has no role-specific tone (admin/manager/user/viewer each a different color), unlike the Meridian template's `data-role="..."` CSS-attribute styling | Used the existing `outline` + `tone="info"` treatment uniformly for every role — the business spec only requires "a static badge," not per-role color-coding, so this does not block the spec; a `tone` per `MembershipRole` would need new tokens if a future spec wants it | open, not blocking |

Carried forward from specs 01-03, still true here:

`InfoBanner` hardcodes its four tone triplets as literal `oklch(...)` values rather than tokens — this spec's toasts (`toast-member-removed`, `toast-member-restored`) are two more `tone="success"` instances of the same unpromoted colors. `Checkbox` still spreads `...rest` (including `data-testid`) onto the outer `<label>`, not the `<input>` — `show-removed-checkbox` resolves to the label, same as spec 03's `accept-org-switch-confirm`. `_adherence.oxlintrc.json`'s exhaustive prop declarations still flag pass-through native attributes (`data-testid`, `title`, etc.) on DS components; unchanged from specs 01-03's note.

## Reference mockup

No `04-member-list-management.mock.html` exists. This spec's implementation was verified against `apps/api/src/members/` directly — `GET /api/organizations/{orgId}/members`, `DELETE .../{memberId}`, and `POST .../{memberId}/restore` were exercised live (fresh signup, two accepted invitations, delete/restore/last-admin-guard/forbidden-role cases) and every response shape matched this doc and the frontend's types byte-for-byte. A mockup can be added later following `02-authentication-login.mock.html`'s pattern if one becomes useful; `1_DS for dev/templates/meridian-app/MeridianApp.dc.html`'s members section serves the same purpose today for tokens and spacing (see the note at the top of this file for what it does and does not cover for spec 04 specifically).
