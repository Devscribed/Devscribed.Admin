---
id: "07"
kind: design
title: Member Financial Settings — Design
pairs-with: 07-vacation-accrual-management.md
routes: ["/org/{orgId}/members/{memberId}"]
design-system: "1_DS for dev"
tags: [vacation-tab, financial-settings, reserve-percent, auto-calculate, currency-select, modal, member-detail, meridian]
---

# 07 — Member Financial Settings · Design

Visual and interaction specification for the **Vacation tab** of the Member Detail screen at `/org/{orgId}/members/{memberId}`. Pairs with [07-vacation-accrual-management.md](07-vacation-accrual-management.md), which owns the business rules, the API contracts, every validation/error message, and the reserve-percent formula. This file owns everything a developer would otherwise have to invent: which design-system component to reach for, which token drives which state, and what the on-screen wording is.

**This is not a new route.** The Vacation tab is the **second tab of the existing Member Detail screen** ([05-member-detail-about.design.md](05-member-detail-about.design.md)), rendered by `apps/web/app/org/[orgId]/members/[memberId]/MemberDetailScreen.tsx`. Spec 05 already lays out the identity header, the tab bar, and the About panel inside one `Card`, and already declares Vacation in its `TABS` array as `{ value: 'vacation', label: 'Vacation', disabled: true, testId: 'member-detail-tab-vacation' }`. This spec turns that permanently-disabled tab into a **conditionally-enabled** one and adds the panel content that renders when it is active. It changes nothing above the tab bar and adds no route.

**Design system:** Teammerly Meridian, `1_DS for dev/`. Import components from `1_DS for dev/index.js` via `apps/web/src/ds.ts`; never hardcode a color, size, or font — every value below is a token that already exists in `tokens/*.css`. This screen reuses the exact `Card`/`Tabs`/`Button`/`Input`/`Modal`/`Select`/`Radio`/`InfoBanner` set and the `useToast()` + `errorNode()` patterns spec 05 established.

**Theme:** light only in this release.

**All balance numbers are zero at this stage.** This spec is the foundation layer — it configures and displays financial settings. Real accrual, the reserve ledger, available/used/pending day math, and the reserve currency balance all arrive in spec 08. Until then the Vacation Balance card renders the shape (labels, layout, currency formatting) with `0` / `0.00` values straight from the API, which returns zeros by contract. The design must not fake or compute any of these numbers client-side.

---

## Tab enablement — the `canViewVacation` contract

Whether the Vacation tab is clickable is **not** decided in the browser. Spec 05's screen already refetches the member-detail response (`GET /api/organizations/{orgId}/members/{memberId}`) as its single source of truth for per-caller flags (`canEditRole`, `canEditJobTitle`, …). This spec adds one more server-computed boolean to that same response:

| Field | Type | Meaning |
|---|---|---|
| `canViewVacation` | `bool` | `true` when the member is `active` **and** ( caller is `admin`/`manager` on any member, **or** caller is `user` viewing their **own** membership ). `false` for `viewer`, for `user` viewing another member, and for any removed member. |

The tab's enabled/disabled state is driven entirely by this flag — the `MemberDetail` type gains `canViewVacation: boolean`, and the `TABS` entry for `vacation` becomes `disabled: !detail.canViewVacation` instead of the hard-coded `disabled: true`. There is **no client-side role/status branching** for tab enablement, matching spec 05's discipline (the API decides; the screen renders). When `canViewVacation` is `false`, the Vacation tab renders with the **identical disabled treatment** spec 05 already ships for Projects/Roles/Payments — a greyed, non-clickable `<span aria-disabled="true">` (spec 05's `Tabs` `disabled` `TabItem`), never a focusable inert `<a>`.

The tab **panel's** data is a *separate* call. `canViewVacation` only governs the tab chrome. When the enabled tab is activated, the panel fetches `GET /api/organizations/{orgId}/members/{memberId}/vacation` (spec 07's own endpoint) to get `financials` / `balance` / `canEdit`. The member-detail response never carries the vacation panel payload.

---

## Vacation Tab — admin/manager view (financials configured)

### Layout

```
                    ← Back to members

                        ┌────┐
                        │ AK │            (spec 05 header — unchanged)
                        └────┘
                    Alex Kaminski
                     [ user ]

                    Joined Jun 1, 2025
                    ✉ alex@acme.com
                    🕐 America/New_York

  ┌──────────────────────────────────────────────────────────┐
  │  About   VACATION   Projects   Roles   Payments           │
  │          ───────                                          │
  │                                                            │
  │  ┌─ Financial Settings ─────────────────── [ Edit ] ─┐    │
  │  │  Monthly salary      $3,000.00  USD               │    │
  │  │  Client hourly rate  $40.00                       │    │
  │  │  Reserve percentage  3.33% (auto)                 │    │
  │  │  Vacation days/year  20                           │    │
  │  └───────────────────────────────────────────────────┘    │
  │                                                            │
  │  ┌─ Vacation Balance ────────────────────────────────┐    │
  │  │                                                    │    │
  │  │    0            0           0                      │    │
  │  │  available    used       pending                  │    │
  │  │                                                    │    │
  │  │  Reserve   $0.00 USD                               │    │
  │  └────────────────────────────────────────────────────┘   │
  └──────────────────────────────────────────────────────────┘
```

- Everything above the tab bar (back link, identity header, the outer `Card`) is spec 05's, untouched. The Vacation panel occupies the same content region the About panel does — below the tab bar, `padding-top: var(--sp-10)`.
- The two cards stack vertically with `gap: var(--sp-8)`. Because they live inside spec 05's outer `Card` (`max-width: 600px`, centered), they are rendered as **nested bordered blocks** — a `<section>` with `border: 1px solid var(--divider)`, `border-radius: 12px`, `padding: var(--sp-8)` — not a second DS `Card` primitive (nesting `Card`'s full padded chrome inside itself double-frames). This matches the business spec's nested-box wireframe.
- **Financial Settings card** heading row is a flex row: heading on the left, the `Edit` button pushed right (`justify-content: space-between`).
- Each financial row is a label/value pair: muted micro-label on the left (`--text-muted`, `--fs-13`), value right-aligned in `--text` at `--fs-15`.

### Vacation Tab — user view (own profile)

```
  ┌──────────────────────────────────────────────────────────┐
  │  About   VACATION   Projects   Roles   Payments           │
  │          ───────                                          │
  │                                                            │
  │  ┌─ Vacation Balance ────────────────────────────────┐    │
  │  │                                                    │    │
  │  │    0            0           0                      │    │
  │  │  available    used       pending                  │    │
  │  │                                                    │    │
  │  │  out of 20 per year                                │    │
  │  └────────────────────────────────────────────────────┘   │
  └──────────────────────────────────────────────────────────┘
```

- **No Financial Settings card** at all — the `financials` object is `null` for a `user` by contract, so there is nothing to render and no Edit affordance.
- **No money** anywhere: `reserveBalance` is `null` in the user payload, so `vacation-reserve-amount` is not rendered. Instead the balance card shows the `out of {totalDaysPerYear} per year` line under the day stats.

### Vacation Tab — empty state (no financials configured)

```
  ┌──────────────────────────────────────────────────────────┐
  │  About   VACATION   Projects   Roles   Payments           │
  │                                                            │
  │            ┌───────────────────────────────────┐          │
  │            │                                   │          │
  │            │   Vacation tracking has not been   │          │
  │            │   set up for this member yet.      │          │
  │            │                                    │          │
  │            │        [ Set up financials ]       │          │
  │            │                                    │          │
  │            └────────────────────────────────────┘          │
  └──────────────────────────────────────────────────────────┘
```

- Reached when the GET returns `balance: null` (and `financials: null`) — no financials record exists yet.
- **admin/manager** (`canEdit: true`): centered message + a primary `Set up financials` button that opens the Edit Financial Settings modal in create mode.
- **user own profile** (`canEdit: false`): the contact-your-manager message only, **no button**. The two audiences are distinguished by `canEdit` from the payload, not by re-deriving the caller's role.

### Edit Financial Settings modal

```
┌───────────── Edit Financial Settings ─────────────┐
│                                                    │
│  Monthly salary *                                  │
│  [ 3000.00                             ]           │
│                                                    │
│  Client hourly rate *                              │
│  [ 40.00                               ]           │
│                                                    │
│  Currency *                                        │
│  [ USD                                ▾ ]          │
│                                                    │
│  Vacation days per year *                          │
│  [ 20                                  ]           │
│                                                    │
│  Reserve percentage                                │
│  ( ) Auto-calculate   (●) Set manually             │
│  [ 3.33                               ] %          │
│                                                    │
│  Auto-calculated: 3.33%       (auto mode only)     │
│                                                    │
│            [ Cancel ]   [ Save changes ]           │
└────────────────────────────────────────────────────┘
```

- DS `Modal` (`title="Edit Financial Settings"`, `width={480}`), same shell `InviteModal.tsx` uses. Fields stack in a `<form>` with `gap: var(--sp-7)`.
- **Reserve percentage** is a two-part control: a mode toggle (two radios), then either the manual percent input (manual mode) or the live auto-calc preview (auto mode).

---

## Component map

Every `data-testid` the business spec requires for spec 07 appears here. Spec 05 already owns `member-detail-tab-vacation` (it is in spec 05's `TABS`); this spec only changes its `disabled` binding — the row is repeated here to record that change.

### Tab bar

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Vacation tab item | `Tabs` `TabItem` (spec 05's array) | `disabled: !detail.canViewVacation` (was hard-coded `true`); `testId` unchanged | `member-detail-tab-vacation` |

### Vacation panel — shared

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Panel loading skeleton | local `VacationSkeleton` (inline in the panel component, same static-block style as spec 05's `LoadingSkeleton`) | token-colored `--bg-sunken` blocks, no shimmer | `vacation-loading-skeleton` |
| Panel error line | native `<div>` | renders the API `message` (falls back to `MESSAGES.generic`) | — (reuses spec 05's `member-detail-not-found` pattern only if the whole detail 404s; a panel-only fetch error renders inline text) |

### Vacation panel — admin/manager

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Financial Settings card | native `<section>` (nested bordered block, not a DS `Card`) | `border: 1px solid var(--divider)`, `border-radius: 12px`, `padding: var(--sp-8)` | `vacation-financials-card` |
| Edit button | `Button` | `variant="secondary"`, `size="sm"` | `vacation-financials-edit-btn` |
| Salary / rate / reserve% / days / currency rows | native `<div>` label-value rows | — | — (values live inside `vacation-financials-card`) |
| Vacation Balance card | native `<section>` (nested bordered block) | as above | `vacation-balance-card` |
| Available days (large stat) | native `<div>` | Grotesk 600, `--fs-32` | `vacation-available-days` |
| Used days stat | native `<div>` | — | `vacation-used-days` |
| Pending days stat | native `<div>` | — | `vacation-pending-days` |
| Reserve amount (currency) | native `<div>` | rendered only when `balance.reserveBalance != null` | `vacation-reserve-amount` |

### Vacation panel — user (own profile)

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Vacation Balance card | native `<section>` (nested bordered block) | as above | `vacation-balance-card` |
| Available / used / pending stats | native `<div>` | — | `vacation-available-days`, `vacation-used-days`, `vacation-pending-days` |
| "out of {N} per year" line | native `<div>` | `--text-sub`, `--fs-13`; `{N}` = `balance.totalDaysPerYear` | — (inside `vacation-balance-card`) |
| Reserve amount | — | **not rendered** (`reserveBalance` is `null`) | — |

### Vacation panel — empty state

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Empty state container | native `<div>` (centered) | — | `vacation-empty-state` |
| Empty state message | native `<p>` | `--text-sub`; admin/manager vs user copy chosen by `canEdit` | — (inside `vacation-empty-state`) |
| Set up financials button | `Button` | `variant="primary"`; **rendered only when `canEdit === true`** | `vacation-setup-btn` |

### Edit Financial Settings modal

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Modal shell | `Modal` | `title="Edit Financial Settings"`, `width={480}`, `open`, `onClose` | `vacation-financials-modal` |
| Monthly salary input | `Input` | `label="Monthly salary"`, `type="text"` inputMode numeric; `error={errorNode('monthlySalary', …)}` | `vacation-salary-input` |
| Client hourly rate input | `Input` | `label="Client hourly rate"`; `error={errorNode('clientHourlyRate', …)}` | `vacation-rate-input` |
| Currency select | `Select` | `label="Currency"`, `options` = ISO 4217 code strings from `@devscribed/validation` (see [DS gaps](#ds-gaps)); `error={errorNode('currency', …)}` | `vacation-currency-select` |
| Vacation days per year input | `Input` | `label="Vacation days per year"`; `error={errorNode('vacationDaysPerYear', …)}` | `vacation-days-input` |
| Reserve mode — Auto radio | `Radio` (individual, **not** `RadioGroup` — see [DS gaps](#ds-gaps)) | `label="Auto-calculate"`, `checked={!manual}`, `onChange` sets manual=false | `vacation-reserve-mode-auto` |
| Reserve mode — Manual radio | `Radio` (individual) | `label="Set manually"`, `checked={manual}`, `onChange` sets manual=true | `vacation-reserve-mode-manual` |
| Reserve percent input | `Input` | `label` visually-hidden / suffix `%`; `disabled` unless manual mode; `error={errorNode('vacationReservePercent', …)}` | `vacation-reserve-percent-input` |
| Auto-calc preview | native `<div>` | shown only in **auto** mode; text = `Auto-calculated: {pct}%` from `calculateReservePercent(...)`; live-updates on salary/rate/days change | `vacation-reserve-preview` |
| Save button | `Button` | `variant="primary"`, `loading={saving}` | `vacation-financials-save-btn` |
| Cancel button | `Button` | `variant="secondary"` | `vacation-financials-cancel-btn` |
| Field errors | `field-error.tsx`'s `errorNode(field, msg)` helper, same as every other form | — | `field-error-monthlySalary`, `field-error-clientHourlyRate`, `field-error-vacationDaysPerYear`, `field-error-currency`, `field-error-vacationReservePercent` |
| Saved toast | `InfoBanner tone="success"` via `useToast()` | `showToast('toast-financials-saved', 'Financial settings saved')` | `toast-financials-saved` |
| Save-error toast | `InfoBanner tone="error"` via `useToast()`'s `tone` param (spec 05's addition) | `showToast('toast-financials-error', MESSAGES.generic, 'error')` | `toast-financials-error` (added; not in the business spec's required list — parity with spec 05's error toast) |

**All 27 business-spec `data-testid`s are mapped.** Nothing is intentionally omitted. `vacation-reserve-amount` is present but conditionally rendered (admin/manager only, and only when `reserveBalance != null`), matching the business spec's own note that a `user` sees no monetary amount.

---

## Copy

Validation/error messages are **not** listed here — they are owned by the business spec's Error Messages table and `Validation Rules` section, and must match `FINANCIALS_MESSAGES` in `@devscribed/validation` verbatim (the validation agent owns that constant). The two empty-state sentences and the "financials saved" toast text are also **fixed verbatim by the business spec** and referenced, not restated, below.

| Slot | Text |
|---|---|
| Tab label | Vacation (unchanged from spec 05) |
| Financial Settings card heading | Financial Settings |
| Vacation Balance card heading | Vacation Balance |
| Financials row · salary | Monthly salary |
| Financials row · rate | Client hourly rate |
| Financials row · reserve | Reserve percentage |
| Financials row · days | Vacation days per year |
| Reserve % auto suffix | (auto) |
| Reserve % manual suffix | (manual) |
| Edit button | Edit |
| Set up button (empty state, admin/manager) | Set up financials |
| Balance stat label · available | available |
| Balance stat label · used | used |
| Balance stat label · pending | pending |
| Balance · user allowance line | out of {N} per year |
| Balance · reserve label (admin/manager) | Reserve |
| Modal title | Edit Financial Settings |
| Modal field label · salary | Monthly salary |
| Modal field label · rate | Client hourly rate |
| Modal field label · currency | Currency |
| Modal field label · days | Vacation days per year |
| Modal group label · reserve | Reserve percentage |
| Reserve radio · auto | Auto-calculate |
| Reserve radio · manual | Set manually |
| Reserve percent input suffix | % |
| Auto-calc preview | Auto-calculated: {pct}% |
| Save button | Save changes |
| Save button, in flight | Saving |
| Cancel button | Cancel |
| Empty state (admin/manager) | the business spec's fixed text — "Vacation tracking has not been set up for this member yet." (`FINANCIALS_MESSAGES`), reused verbatim, not re-typed |
| Empty state (user, own) | the business spec's fixed text — "Vacation tracking has not been set up for your account yet. Please contact your manager." reused verbatim |
| Toast · saved | Financial settings saved (business spec's fixed text) |
| Toast · save error | the API's `message` (falls back to `MESSAGES.generic`, "Something went wrong. Please try again.") |

Currency values render as the raw uppercase ISO code (e.g. `USD`) alongside amounts; amounts render with two decimals and thousands separators via `toLocaleString` (e.g. `$3,000.00`) — the leading currency symbol is best-effort from `Intl.NumberFormat` with the `currency` style, falling back to the bare number + code when the runtime lacks the symbol.

---

## States

| State | Trigger | Rendering |
|---|---|---|
| **Tab disabled** | `canViewVacation === false` (`viewer`; `user` on another member; any removed member) | Greyed non-clickable `<span aria-disabled="true">` — identical to Projects/Roles/Payments. Panel never fetched. |
| **Tab enabled, not yet clicked** | `canViewVacation === true`, About still active | Vacation tab clickable; panel inert until selected. |
| **Panel loading** | Vacation tab activated, `GET .../vacation` in flight | `vacation-loading-skeleton` (static token blocks, no shimmer). |
| **Empty (admin/manager)** | `balance: null`, `canEdit: true` | `vacation-empty-state` message + `vacation-setup-btn`. |
| **Empty (user, own)** | `balance: null`, `canEdit: false` | `vacation-empty-state` message only, no button. |
| **Configured (admin/manager)** | `financials` present, `canEdit: true` | `vacation-financials-card` (with Edit) + `vacation-balance-card` (with `vacation-reserve-amount`). All numbers zero. |
| **Configured (user, own)** | `financials: null`, `balance` present | `vacation-balance-card` only (days + "out of {N} per year"), no money, no financials card. |
| **Modal — create** | `Set up financials` clicked | Modal opens with empty fields, **Auto-calculate preselected**, preview shows `Auto-calculated: 0%` until inputs are valid. |
| **Modal — edit** | `Edit` clicked | Modal opens pre-filled from `financials`; mode reflects `isReservePercentManual`. |
| **Modal saving** | Save clicked | Save button `loading`, label "Saving"; fields `disabled`/read-only during submit. |
| **Modal validation error** | `PUT` returns `400` `{ errors }` | Each keyed error surfaces beneath its field via `errorNode`; modal stays open, buttons re-enable, typed values retained. |
| **Modal server/network error** | `PUT` 5xx / removed-member `400` / thrown fetch | `toast-financials-error` toast; modal stays open, values retained, buttons re-enable. |
| **Save success** | `PUT` `200` | Modal closes, `toast-financials-saved` toast, panel **refetches** `GET .../vacation` (never hand-patches — the server owns `vacationReservePercent` and the snapshot side-effect). |

---

## Interactions

- **Vacation tab click** — only reachable when enabled. Selecting it triggers the panel's `GET .../vacation` and shows `vacation-loading-skeleton` until it resolves. The tab is a controlled selection in `MemberDetailScreen`'s local state; the About panel and Vacation panel are sibling render branches keyed off the active tab.
- **Set up financials / Edit click** — opens the same `Modal`. Create mode starts empty with Auto-calculate selected; Edit mode pre-fills from the current `financials` and sets the radio from `isReservePercentManual`.
- **Reserve mode toggle** —
  - Selecting **Auto-calculate**: disables `vacation-reserve-percent-input`, shows `vacation-reserve-preview`, and immediately (re)computes the preview from the current salary/rate/days via `calculateReservePercent` (the formula is owned by the business spec — do not restate the math).
  - Selecting **Set manually**: enables `vacation-reserve-percent-input`, hides the preview; the entered value is what gets saved.
- **Live auto-calc preview** — while in auto mode, every change to `vacation-salary-input`, `vacation-rate-input`, or `vacation-days-input` re-runs `calculateReservePercent` and updates `vacation-reserve-preview` in real time. When any of the three inputs is empty/invalid, the preview shows a neutral placeholder (`Auto-calculated: —`) rather than a wrong number.
- **Field validation** — numeric fields validate on change/blur against the business spec's `Validation Rules` (via the validation package's field validators); errors clear as the visitor corrects them, same live pattern spec 05 uses for job title.
- **Save click** — sends `PUT /api/organizations/{orgId}/members/{memberId}/vacation/financials` with `{ monthlySalary, clientHourlyRate, vacationDaysPerYear, currency, isReservePercentManual, vacationReservePercent }` (the percent is sent only for manual mode; ignored server-side in auto). On `200` → close, success toast, refetch. On `400 { errors }` → inline field errors. On any other error → error toast, modal stays open.
- **Cancel / backdrop / Esc** — closes the modal with no request; typed values are discarded. Disabled while a save is in flight (matching `InviteModal`'s `handleClose` guard).

---

## Responsive

- The panel inherits spec 05's container: `max-width: 600px`, centered, full content width below that with the shell's own horizontal padding. The two nested cards are full-width blocks that reflow naturally.
- Balance stats sit in a row (`available | used | pending`) on desktop; on narrow viewports they wrap but stay readable — they are a `flex` row with `flex-wrap: wrap`, not a fixed grid.
- **The modal becomes a full-screen drawer below 480px width** (business spec's Responsive Behavior). See [DS gaps](#ds-gaps) — the DS `Modal` does not currently implement this breakpoint behavior, so it is recorded as a gap for the DS to own rather than improvised inline.

---

## Accessibility

- The disabled Vacation tab carries `aria-disabled="true"` and renders as a non-focusable `<span>`, not an inert `<a>` — spec 05's `Tabs` extension already guarantees this; `canViewVacation` just decides which members get it.
- Every modal field uses the shared `field-error.tsx` `errorNode` helper, so each carries `aria-invalid` / `aria-describedby` pointing at its `field-error-{field}` node — identical to every other form in the app.
- The reserve-mode radios are two `Radio`s sharing one `name` (`reserve-mode`), so arrow-key navigation and single-selection semantics come from native radio behavior; the currently-disabled percent input is announced via its own `disabled` state, and the reason (auto mode) is visible as the adjacent preview line rather than hidden.
- `Modal` traps focus and closes on Esc/backdrop (its existing behavior, as used by `InviteModal`); the save-error toast is `role="alert"` while the success toast is `role="status"` (spec 05's toast `tone` split), so a screen-reader user is interrupted only on failure.
- Colour is never the only signal: the `(auto)`/`(manual)` suffix is literal text next to the reserve percentage, not a tint; the empty state states its full sentence; disabled controls read their disabled state, not just a dimmed color.
- Currency and numeric amounts are plain text content, legible to assistive tech without relying on the visual symbol.

## DS gaps

| Gap | Resolution | Status |
|---|---|---|
| The member-detail response has no per-caller flag for vacation-tab visibility | Backend adds **`canViewVacation: boolean`** to `GET /members/{memberId}` (spec 05's response); the frontend `MemberDetail` type gains the field and the `TABS` `vacation` entry binds `disabled: !detail.canViewVacation`. This is the contract addition this spec depends on — no client-side role logic. | done (contract) — backend owns the computation |
| Reserve-mode needs a `data-testid` on **each** radio (`vacation-reserve-mode-auto` / `-manual`); DS `RadioGroup` renders its radios from an `options` array and cannot tag individual options | Use two **individual** `Radio` components (both exported from `@/ds`, `1_DS for dev/components/forms/Radio.{jsx,d.ts}`) sharing one `name`; `Radio` forwards `...rest` onto its `<label>`, so `data-testid` lands correctly. `Radio`/`RadioGroup` confirmed present and usable — no DS change needed. | resolved — no DS change |
| Currency `Select` needs its option set | Options are the ISO 4217 code strings exposed by `@devscribed/validation` (the validation agent is adding this alongside `calculateReservePercent` / `FINANCIALS_MESSAGES`). This is app-owned data sourced from the validation package, fed straight into `Select`'s `options` (which already accepts `string[]`, per `Select.d.ts`). No DS change — `Select` handles a long option list via its popover. | open — depends on the validation package export landing |
| DS `Select`'s dropdown had no max-height and `overflow: hidden`, so a long option list (the 42-item ISO 4217 currency picker) rendered as one tall block clipped inside the DS `Modal` — options far down the list (e.g. USD) were unreachable | The dropdown container in `1_DS for dev/components/forms/Select.jsx` now sets `max-height: 280px` + `overflow-y: auto` (replacing `overflow: hidden` with `overflow-x: hidden` to keep rounded corners and horizontal clipping), so long lists scroll inside the popover. Strictly-improving for every `Select` (role, timezone, country, currency, first-day); short lists stay below the max-height and don't scroll. | done |
| `Modal` does not become a full-screen drawer below 480px | The business spec requires the modal to render as a full-screen drawer under 480px. The DS `Modal` (`1_DS for dev/components/surfaces/Modal.d.ts`) has a fixed `width` prop and centered-dialog geometry with no responsive breakpoint. Recorded as a DS gap: the drawer behavior belongs in `Modal` itself (a `@media (max-width: 480px)` full-bleed variant), added to the DS rather than overridden per-screen. | open — DS `Modal` needs a mobile-drawer breakpoint before this is fully satisfied |
| `Select` has no `error`-node tagging like `Input` | `Select.d.ts` exposes `error?: string`; to carry `field-error-currency` we pass `errorNode('currency', …)` through it the same cast-to-string way `Input` consumers do (`field-error.tsx`). Works at runtime; a first-class `errorId` on both `Input` and `Select` remains the standing DS chore spec 02/05 already flagged. | open, not blocking (carried forward) |
| `InfoBanner` hardcodes its four tone triplets as literal `oklch(...)` values rather than tokens | Unchanged here — the two toasts (`tone="success"` / `tone="error"`) and any inline banner are more untouched instances. Promoting those to tokens stays the outstanding DS chore carried from specs 01–05. | open, not blocking (carried forward) |

Carried forward from specs 01–05, still true: `_adherence.oxlintrc.json`'s exhaustive prop declarations flag pass-through native attributes (`data-testid`, `title`, etc.) on DS components; no `Skeleton` primitive with a defined animation exists, so `vacation-loading-skeleton` uses static token-colored blocks like every other loading state in the app.

## Reference mockup

No `07-vacation-accrual-management.mock.html` exists, and none is required. Following spec 05's precedent, this design is to be verified against the **running API and UI directly** rather than a static mock: exercise a fresh `GET .../vacation` in each of its shapes (admin/manager configured, user own, empty), a successful `PUT .../vacation/financials` (auto and manual reserve modes), the validation `400`, the removed-member `400`, and the `viewer` / cross-member `403`, confirming each response shape matches this doc and the frontend's vacation types byte-for-byte. `1_DS for dev/templates/meridian-app/MeridianApp.dc.html` remains the token/value reference for the Meridian look; a mockup can be added later following `02-authentication-login.mock.html`'s pattern if one becomes useful.
