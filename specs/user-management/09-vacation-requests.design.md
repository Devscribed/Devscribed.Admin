---
id: "09"
kind: design
title: Vacation Requests — Design
pairs-with: 09-vacation-requests.md
routes: ["/org/{orgId}/members/{memberId}"]
design-system: "1_DS for dev"
tags: [vacation-tab, vacation-requests, status-badge, request-modal, reject-modal, confirm-dialog, debit, refund, member-detail, meridian]
---

# 09 — Vacation Requests · Design

Visual and interaction specification for the **Vacation Requests** lifecycle added to the Vacation tab: the request list, the status badges, the per-row action buttons, the Request Vacation modal, the Reject Request modal, and the two cancel confirmation dialogs. Pairs with [09-vacation-requests.md](09-vacation-requests.md), which owns the lifecycle rules, the working-days/balance math, the permission matrix, the API contracts, and **every fixed string** — all validation messages, all toasts, and the empty-state sentence.

**This is a delta on [08-vacation-reserve-auto-accrual.design.md](08-vacation-reserve-auto-accrual.design.md) and [07-vacation-accrual-management.design.md](07-vacation-accrual-management.design.md).** Everything 07 + 08 established holds unchanged: this is still the second tab of the existing Member Detail screen ([05](05-member-detail-about.design.md)), rendered by `apps/web/app/org/[orgId]/members/[memberId]/VacationPanel.tsx`; the `canViewVacation` tab-enablement contract, the panel's single `GET .../vacation` fetch, 07's `cardStyle()` nested-`<section>` blocks, 07's `formatCurrency`, the `useToast()` + `errorNode()` / `focusByTestId()` patterns, and the `VacationFinancialsModal` shell are all inherited. Spec 09 adds **one new nested block** to the panel (the Requests list), **two new modals**, **two confirm dialogs**, and extends the balance card and the ledger with live/new values. It adds no route and no chrome.

**Theme:** light only. **Tokens:** every value below already exists in `1_DS for dev/tokens/*.css`; no hex, no px is written by hand.

---

## What changes vs. 08

| 08 (foundation) | 09 (this delta) |
|---|---|
| Balance card renders live `availableDays` / `reserveBalance`; `usedDays` / `pendingDays` are `0` by contract until requests exist | **Same markup** — `usedDays` / `pendingDays` now carry real values; the card is unchanged, the numbers are live |
| Admin/manager panel = Financial Settings + Balance + Reserve Transactions | Adds a **new block** between Balance and Transactions: **Vacation Requests** (list + per-row actions) |
| User-own panel = Balance card only (days + "out of {N} per year") | Adds a **"Request vacation" button** and a **My Requests** list below the balance card |
| Reserve Transactions renders `credit` (green `+`) / `expiry` (red `−`) | Same signed-amount treatment now also renders `debit` (red `−`) and `refund` (green `+`) — two more `TransactionType` values, **no new markup** |
| No mutation originates from the panel (ledger is read-only) | Panel now originates **five mutations** (submit / approve / reject / cancel-pending / cancel-approved), each refetching `GET .../vacation` on success |

The `VacationPanel` already reads `availableDays` / `usedDays` / `pendingDays` / `reserveBalance` straight from `balance` and renders them without client math (08's `BalanceCard`). Spec 09 requires **no change** to that card's markup — only that the server now sends non-zero `usedDays` / `pendingDays`. Likewise the ledger's signed-amount cell already keys colour + sign off `type === 'credit'`; adding `debit`/`refund` is a data change (`refund` reads as a positive/green credit-shaped row, `debit` as a negative/red expiry-shaped row), not a layout change — see [Ledger extension](#ledger-extension).

---

## Vacation Tab — admin/manager view (with requests)

### Layout

```
  ┌──────────────────────────────────────────────────────────┐
  │  About   VACATION   Projects   Roles   Payments           │
  │          ───────                                          │
  │  ┌─ Financial Settings ─────────────────── [ Edit ] ─┐    │  ← 07, unchanged
  │  └───────────────────────────────────────────────────┘    │
  │  ┌─ Vacation Balance ────────────────────────────────┐    │  ← 07/08 markup,
  │  │   12 available   5 used   3 pending                │    │    live used/pending
  │  │   Reserve  $1,661.54 USD                           │    │
  │  └────────────────────────────────────────────────────┘   │
  │  ┌─ Vacation Requests ───────────────────────────────┐    │  ← 09, new
  │  │  Jul 14 – Jul 25, 2025 · 10 days · ●Pending        │    │
  │  │  $1,384.62            [ Approve ]  [ Reject ]      │    │
  │  │  ───────────────────────────────────────────────  │    │
  │  │  Mar 3 – Mar 7, 2025 · 5 days · ✓Approved         │    │
  │  │  $692.31                          [ Cancel ]      │    │
  │  └────────────────────────────────────────────────────┘   │
  │  ┌─ Reserve Transactions ────────────────────────────┐    │  ← 08 markup,
  │  │  Mar 7  Debit   −$692.31  Vacation 3/3–3/7  System │    │    +debit/+refund
  │  │  Jul 1  Credit  +$230.88  June 2025 accrual System │    │
  │  └────────────────────────────────────────────────────┘   │
  └──────────────────────────────────────────────────────────┘
```

- **Vacation Requests** is a **fourth nested `<section>`** stacked into the panel's existing `flex-direction: column; gap: var(--sp-8)` column, positioned **between** the Balance card and the Reserve Transactions table (business spec §UI Description). It matches the other blocks exactly: 07's `cardStyle()` (`1px solid var(--divider)`, `var(--radius-xl)`, `var(--sp-8)`) with a `var(--sp-6)`-margin heading row.
- **Heading:** "Vacation Requests" in the same micro-heading style the other cards use (`var(--font-display)`, 600, `var(--fs-15)`, `var(--text)`). No Edit affordance on the section itself; actions live per-row.
- **Order:** newest first (payload-ordered; the panel does not re-sort — same discipline as the ledger).
- Visible whenever `requests` is a non-null array. For admin/manager the block title is "Vacation Requests"; for the user-own view it is "My Requests" (same component, different heading — see [User view](#vacation-tab--user-view-own-profile)).

### A request row (`vacation-request-row-{id}`)

Each row is a flex column inside the section, separated from the next by 08's `1px solid var(--divider)` top rule (identical to the ledger row rule). Contents:

| Element | Content | Treatment | `data-testid` |
|---|---|---|---|
| Date range | `Jul 14 – Jul 25, 2025` — 07's Grotesk-numeral date, en-dash range (DS voice) | `var(--font-display)` 600, `var(--fs-15)`, `var(--text)`; `white-space: nowrap` | `vacation-request-dates-{id}` |
| Working-days count | `10 days` (singular `1 day`) | `var(--font-text)`, `var(--fs-13)`, `var(--text-muted)` | `vacation-request-days-{id}` |
| Status badge | see [Status badges](#status-badges) | DS `Badge` | `vacation-request-status-{id}` |
| Deduction amount | `$692.31` via 07's `formatCurrency` — **admin/manager only** (`deductionAmount` present) | `var(--font-display)` 600, `var(--fs-15)`, `var(--text)` | — (inside the row) |
| Action buttons | per the [action matrix](#per-row-action-matrix) | DS `Button` `size="sm"` | see matrix |
| Reviewer comment | `rejected` rows only, when a comment exists: the comment text on its own line | `var(--font-text)`, `var(--fs-13)`, `var(--text-sub)`, quoted | `vacation-request-reviewer-comment-{id}` |

The deduction amount is **omitted entirely** for the user-own view (the payload carries it, but design suppresses money for `user` exactly as 07/08 suppress the reserve amount — money is an admin/manager signal). Ownership/role for that suppression is read from the payload's `canReviewRequests` / `canSubmitRequest` flags, never re-derived from the caller's role.

### Status badges

Mapped to DS `Badge` tones (`1_DS for dev/components/feedback/Badge.jsx`), which already exists with a soft-tint + 6px dot pattern. The `status-inactive` tone resolves to **red** (`--status-inactive-bg` = `--error-100`, ink `--error-600`), so all four statuses have a distinct DS tone — **no token invented, no pill hand-built**:

| Status | Badge `tone` | Resolves to | Label |
|---|---|---|---|
| `pending` | `warning` | amber (`--amber-100` / `--amber-800` / dot `--amber-500`) | Pending |
| `approved` | `active` | green (`--status-active-*` → `--success-*`) | Approved |
| `rejected` | `inactive` | red (`--status-inactive-*` → `--error-*`) | Rejected |
| `cancelled` | `neutral` | grey (`--paper-200` / `--ink-500`) | Cancelled |

`Badge` renders its tone dot (the wireframe's `●` for pending, `○` for cancelled read as the tinted/grey dot). The wireframe's `✓` / `✗` glyphs are **illustrative only** — meaning is carried by the label text + tone + dot, so colour is never the sole signal, matching 08's rule. A dedicated `success` / `danger` tone alias would read more honestly than reusing `active` / `inactive` for a request status; recorded in [DS gaps](#ds-gaps), not blocking.

### Per-row action matrix

Buttons are DS `Button` `size="sm"`; the destructive ones use `variant="danger"` (the same variant `DeleteConfirmDialog` uses), Approve uses `variant="primary"`, Reject/Cancel use `variant="secondary"`. Visibility is derived purely from the payload's `canReviewRequests` / `canSubmitRequest` flags + the request `status` (never from re-deriving the caller's role):

| Viewer / context | Request status | Buttons | `data-testid` |
|---|---|---|---|
| admin/manager, **not** own request (`canReviewRequests: true`) | `pending` | Approve, Reject | `vacation-request-approve-{id}`, `vacation-request-reject-{id}` |
| admin/manager, **not** own request (`canReviewRequests: true`) | `approved` | Cancel | `vacation-request-cancel-{id}` |
| owner (own-profile view, `canSubmitRequest: true`) | `pending` | Cancel | `vacation-request-cancel-{id}` |
| any viewer | `rejected` / `cancelled` | none (terminal) | — |

**Self-approval in the UI (TC-09-E2E-06):** when the viewer is looking at their **own** profile (`canSubmitRequest: true`), a pending request shows only **Cancel** — never Approve/Reject — even for an admin, because the review buttons key off "reviewing someone else's request", not off role. This satisfies the business rule that a reviewer cannot approve their own request without restating the 403 client-side. Where a viewer is both reviewer and owner of the same request (admin on own profile), the own-profile/owner treatment wins.

---

## Vacation Tab — user view (own profile)

```
  ┌──────────────────────────────────────────────────────────┐
  │  ┌─ Vacation Balance ────────────────────────────────┐    │
  │  │   12 available   5 used   3 pending                │    │
  │  │   out of 20 per year                               │    │
  │  └────────────────────────────────────────────────────┘   │
  │                                                            │
  │  [ Request vacation ]                                      │  ← 09, new
  │                                                            │
  │  ┌─ My Requests ─────────────────────────────────────┐    │  ← 09, new
  │  │  Jul 14 – Jul 25, 2025 · 10 days · ●Pending        │    │
  │  │                                   [ Cancel ]      │    │
  │  │  ───────────────────────────────────────────────  │    │
  │  │  Jan 6 – Jan 10, 2025 · 5 days · ✗Rejected        │    │
  │  │  "Team availability conflict"                     │    │
  │  └────────────────────────────────────────────────────┘   │
  └──────────────────────────────────────────────────────────┘
```

- **No Financial Settings card, no Reserve Transactions, no money** — exactly as 07/08 for a `user`. The request rows omit the deduction amount.
- The **"Request vacation" button** sits between the balance card and the request list, full-panel-width, `variant="primary"`. Visible to admin/manager/user **on their own profile** (`canSubmitRequest: true`). Disabled when `balance.availableDays === 0`, carrying `title="No vacation days available"` (native `title` tooltip — a pass-through attribute, flagged by oxlint, carried forward from 07/08). Clicking opens the Request Vacation modal.
- The request block heading reads **"My Requests"** in the own-profile view (vs. "Vacation Requests" for admin/manager) — same component, heading chosen by `canSubmitRequest`.
- Rejected rows show the reviewer comment quoted beneath the row (`vacation-request-reviewer-comment-{id}`).

---

## Request Vacation modal

```
┌─────────────── Request Vacation ──────────────────┐
│  Start date *                                      │
│  [ 2025-07-14                       📅 ]           │
│  End date *                                        │
│  [ 2025-07-25                       📅 ]           │
│                                                    │
│  Working days: 10                                  │
│  Available balance: 12 days                        │
│                                                    │
│            [ Cancel ]   [ Submit request ]         │
└────────────────────────────────────────────────────┘
```

- DS `Modal` (`title="Request Vacation"`, `width={440}`), the exact shell `VacationFinancialsModal` uses — footer `actions`, `noValidate` `<form>`, `flex-direction: column; gap: var(--sp-7)`.
- **Start / End date** are native `<input type="date">` styled to match the DS `Input` (46px height, `var(--radius-md)`, `1px solid var(--border)`, 3px violet focus ring) — see [DS gaps](#ds-gaps) (the DS has no date field). Each carries a `label` micro-header and an `errorNode('startDate' | 'endDate', …)` slot, same wiring as every other form.
- **Working-days preview** (`vacation-working-days-preview`) and **Available-balance display** (`vacation-available-days-preview`): two `var(--fs-13)` `var(--text-sub)` lines below the fields, recomputed **client-side in real time** on every date change (working-days = weekday count; the balance figure is read from `balance.availableDays`, not recomputed). When either date is empty/invalid the working-days line shows a neutral placeholder (`Working days: —`), mirroring 07's auto-calc-preview placeholder discipline.
- **Cross-year check** is client-side: when start and end fall in different calendar years, the inline error (business spec's verbatim "Start and end dates must be within the same calendar year") renders in `vacation-request-error` and the **Submit button is disabled** — the only client-side gate that disables submit.
- Server-side `400`s (insufficient balance, overlap, past date, no financials) surface via `errorNode` / the shared `vacation-request-error` node; the modal stays open, values retained, buttons re-enable — 07's error-handling contract.
- Submit (`vacation-request-submit-btn`, `variant="primary"`, `loading` while in flight, label "Submit request") POSTs `.../vacation/requests`; on `201` → close, toast `toast-request-submitted`, panel refetch. Cancel (`vacation-request-cancel-btn`, `variant="secondary"`).

---

## Reject Request modal

```
┌──────────────── Reject Request ───────────────────┐
│  Rejecting: Jul 14 – Jul 25, 2025 · 10 days        │
│  Requested by: Alex Kaminski                       │
│                                                    │
│  Comment (optional)                                │
│  [ Team availability conflict                    ] │
│  [                                               ] │
│                                                    │
│            [ Cancel ]   [ Reject ]                 │
└────────────────────────────────────────────────────┘
```

- DS `Modal` (`title="Reject Request"`, `width={440}`), same shell.
- **Summary line** (date range · working days) + **requester name**: two read-only `var(--fs-15)` / `var(--fs-13)` lines at the top, composed from the request payload.
- **Comment field** (`vacation-reject-comment-input`) is a native `<textarea>` styled to match the DS `Input` (border, radius, focus ring, `var(--font-text)`, `var(--fs-15)`, ~3 rows, `resize: vertical`) — see [DS gaps](#ds-gaps) (the DS has no textarea). Optional, max 500 chars; an over-length value surfaces the business spec's verbatim "Comment must be at most 500 characters" via `errorNode('reviewerComment', …)` → `field-error-reviewerComment`.
- Reject (`vacation-reject-confirm-btn`, `variant="danger"`, `loading` while in flight, label "Reject") PUTs `.../review` with `{ decision: "rejected", comment }`; on `200` → close, toast `toast-request-rejected`, refetch. Cancel (`vacation-reject-cancel-btn`, `variant="secondary"`).

**Approve has no modal** — clicking Approve fires the `PUT .../review` `{ decision: "approved" }` call immediately (business spec §Interactions), toast `toast-request-approved` on success. A self-approval `403` (should be unreachable via the [action matrix](#per-row-action-matrix), but enforced server-side) surfaces as an error toast with the API `message`.

---

## Confirm dialogs (cancel)

Both are small `Modal` compositions following the existing `apps/web/app/org/[orgId]/members/DeleteConfirmDialog.tsx` precedent — the DS has no first-class `ConfirmDialog` primitive ([DS gaps](#ds-gaps)). Each is a `Modal` with a one-line body `<p>` and a Cancel / Confirm footer (`variant="secondary"` + `variant="danger"`), the confirm button `loading` while the PUT is in flight.

| Trigger | Title | Body copy (design-owned) | Confirm → |
|---|---|---|---|
| Cancel a **pending** request | Cancel request | "Cancel this vacation request?" | PUT `.../cancel`; toast `toast-request-cancelled` ("Request cancelled") |
| Cancel an **approved** request (admin/manager) | Cancel request | "Cancel this approved vacation? The reserve will be refunded." | PUT `.../cancel`; toast `toast-request-cancelled` ("Request cancelled and reserve refunded") |

The refund-notice copy in the approved variant is design-owned micro-copy; the resulting toast strings are the business spec's. `refunded` in the response distinguishes which toast string to show. The confirm dialog reuses the row's `vacation-request-cancel-{id}` as its trigger; the dialog itself needs no new business-spec testid (none is listed), so it carries an internal `vacation-cancel-confirm-dialog` for tests.

---

## Ledger extension

No markup change to 08's `TransactionsTable`. The signed-amount cell already colours + signs off a credit-vs-not test; spec 09 adds two `TransactionType` values that slot into the same rule:

| Type | Sign / colour | Reads as |
|---|---|---|
| `debit` | `−` red (`var(--error-600)`) | a vacation deduction (approval) — same treatment as `expiry` |
| `refund` | `+` green (`var(--success-700)`) | a reserve refund (approved-cancel) — same treatment as `credit` |

Type label is the Title-cased payload value (`Debit` / `Refund`); the `+`/`−` prefix and label carry meaning independently of colour. Debit/refund rows are **not** auto-generated (they carry a `createdBy` actor — the reviewer/canceller — rather than `System`), so the `(auto)` tag does not appear on them. The existing `isCredit ? ... : ...` binary must widen to a **sign-by-type** map (`credit`/`refund` → `+`/green, `expiry`/`debit` → `−`/red); this is a data-mapping change inside the existing cell, no new component.

---

## Component map

07's Financial Settings card, Balance card, financials modal, and 08's ledger are unchanged and not repeated. This table covers only what 09 adds or reuses.

| Screen element | DS component | Props / build | `data-testid` |
|---|---|---|---|
| Vacation Requests / My Requests block | native `<section>` (nested bordered block, **not** a DS `Card` — 07/08 anti-double-frame reason) | 07's `cardStyle()`; heading "Vacation Requests" or "My Requests" by `canSubmitRequest` | `vacation-requests-list` |
| Request row | native `<div>` (flex column, `1px solid var(--divider)` top rule between rows) | — | `vacation-request-row-{id}` |
| Row date range | native `<span>` | `var(--font-display)` 600, `var(--fs-15)`, en-dash range | `vacation-request-dates-{id}` |
| Row working-days | native `<span>` | `var(--fs-13)` `var(--text-muted)`; `{n} day(s)` | `vacation-request-days-{id}` |
| Row status badge | DS `Badge` | `tone` per [mapping](#status-badges); label = status | `vacation-request-status-{id}` |
| Row deduction amount | native `<span>` | 07's `formatCurrency`; admin/manager only | — (inside row) |
| Row reviewer comment | native `<div>` | `var(--fs-13)` `var(--text-sub)`, quoted; `rejected` + comment present only | `vacation-request-reviewer-comment-{id}` |
| Approve button | DS `Button` | `variant="primary"`, `size="sm"` | `vacation-request-approve-{id}` |
| Reject button | DS `Button` | `variant="secondary"`, `size="sm"` | `vacation-request-reject-{id}` |
| Cancel button (row) | DS `Button` | `variant="danger"`, `size="sm"` | `vacation-request-cancel-{id}` |
| Empty-state row | native `<div>` | full-width; business spec's verbatim string | `vacation-no-requests` |
| "Request vacation" button | DS `Button` | `variant="primary"`; disabled when `availableDays === 0` + `title="No vacation days available"` | `vacation-request-btn` |
| Request Vacation modal | DS `Modal` | `title="Request Vacation"`, `width={440}` | `vacation-request-modal` |
| Start date input | native `<input type="date">` styled with `Input` tokens ([DS gaps](#ds-gaps)) | `label="Start date"`; `errorNode('startDate', …)` | `vacation-start-date-input` |
| End date input | native `<input type="date">` styled with `Input` tokens | `label="End date"`; `errorNode('endDate', …)` | `vacation-end-date-input` |
| Working-days preview | native `<div>` | `var(--fs-13)` `var(--text-sub)`; real-time; `Working days: —` placeholder | `vacation-working-days-preview` |
| Available-balance preview | native `<div>` | `var(--fs-13)` `var(--text-sub)`; from `balance.availableDays` | `vacation-available-days-preview` |
| Request submit button | DS `Button` | `variant="primary"`, `loading={saving}`; disabled on cross-year | `vacation-request-submit-btn` |
| Request cancel button | DS `Button` | `variant="secondary"` | `vacation-request-cancel-btn` |
| Request inline error | native `<div>` | cross-year + server errors | `vacation-request-error` |
| Request field errors | `field-error.tsx` `errorNode(field, msg)` | — | `field-error-startDate`, `field-error-endDate` |
| Reject Request modal | DS `Modal` | `title="Reject Request"`, `width={440}` | `vacation-reject-modal` |
| Reject summary + requester | native `<div>` | read-only, from payload | — |
| Comment textarea | native `<textarea>` styled with `Input` tokens ([DS gaps](#ds-gaps)) | `label="Comment (optional)"`; max 500; `errorNode('reviewerComment', …)` | `vacation-reject-comment-input` |
| Reject confirm button | DS `Button` | `variant="danger"`, `loading` | `vacation-reject-confirm-btn` |
| Reject cancel button | DS `Button` | `variant="secondary"` | `vacation-reject-cancel-btn` |
| Reject field error | `field-error.tsx` `errorNode` | — | `field-error-reviewerComment` |
| Cancel-pending confirm dialog | DS `Modal` (like `DeleteConfirmDialog`) | body "Cancel this vacation request?" | `vacation-cancel-confirm-dialog` |
| Cancel-approved confirm dialog | DS `Modal` | body "Cancel this approved vacation? The reserve will be refunded." | `vacation-cancel-confirm-dialog` |
| Submitted / approved / rejected / cancelled toasts | `InfoBanner` via `useToast()` (07/08 pattern) | success tone; error tone for failures | `toast-request-submitted`, `toast-request-approved`, `toast-request-rejected`, `toast-request-cancelled` |

Reused from earlier specs, unchanged bindings: `member-detail-tab-vacation` (05), `vacation-balance-card` / `vacation-available-days` / `vacation-used-days` / `vacation-pending-days` / `vacation-reserve-amount` (07/08; `used`/`pending` now live), `vacation-transactions-table` / `vacation-no-transactions` (08; now also render debit/refund rows).

---

## Copy

Validation messages, all toasts, and the empty-state sentence are **owned by the business spec** (§Error Messages, §States) and quoted where shown, never restated. Design owns the structural labels, headings, button text, preview labels, confirm-dialog copy, status-badge labels, and modal titles below.

| Slot | Owner | Text |
|---|---|---|
| Requests block heading (admin/manager) | design | Vacation Requests |
| Requests block heading (user own) | design | My Requests |
| Row working-days label | design | {n} day / {n} days |
| Status badge label · pending | design | Pending |
| Status badge label · approved | design | Approved |
| Status badge label · rejected | design | Rejected |
| Status badge label · cancelled | design | Cancelled |
| Request-vacation button | design | Request vacation |
| Request-vacation disabled tooltip | design | No vacation days available |
| Approve button | design | Approve |
| Reject button (row) | design | Reject |
| Cancel button (row) | design | Cancel |
| Request modal title | design | Request Vacation |
| Field label · start date | design | Start date |
| Field label · end date | design | End date |
| Working-days preview | design | Working days: {n} · placeholder `Working days: —` |
| Available-balance preview | design | Available balance: {n} days |
| Submit button | design | Submit request · in-flight "Submitting" |
| Cancel button (modals) | design | Cancel |
| Reject modal title | design | Reject Request |
| Reject summary prefix | design | Rejecting: {range} · {n} days |
| Reject requester prefix | design | Requested by: {name} |
| Comment field label | design | Comment (optional) |
| Reject button (modal) | design | Reject |
| Confirm dialog title | design | Cancel request |
| Confirm — pending body | design | Cancel this vacation request? |
| Confirm — approved body | design | Cancel this approved vacation? The reserve will be refunded. |
| Ledger type label · debit / refund | design (casing) | Debit / Refund (Title-cased from payload) |
| Signed amount prefix · debit / refund | design | `−` (debit) / `+` (refund) |
| Empty state — no requests | **business spec** | "No vacation requests yet." (verbatim; `1_DS for dev` voice guide lists this exact string — quoted, not re-typed) |
| All validation / error messages | **business spec** | §Error Messages / §Validation Rules — e.g. "Start and end dates must be within the same calendar year", "Insufficient vacation balance. You have {N} day(s) available.", "Comment must be at most 500 characters" (quoted at use site, never restated) |
| Toast · submitted | **business spec** | "Vacation request submitted" |
| Toast · approved | **business spec** | "Request approved" |
| Toast · rejected | **business spec** | "Request rejected" |
| Toast · cancelled (pending) | **business spec** | "Request cancelled" |
| Toast · cancelled (approved) | **business spec** | "Request cancelled and reserve refunded" |

Money uses 07's `formatCurrency` unchanged; dates render with 07's Grotesk-numeral formatter, en-dash range per DS voice.

---

## States

Additions to 07 + 08's state tables (all of which still apply).

| State | Trigger | Rendering |
|---|---|---|
| **Requests loading** | Vacation tab activated, `GET .../vacation` in flight | 07/08's `vacation-loading-skeleton`, extended with a request-list-shaped placeholder block. |
| **No requests** | `requests: []` | `vacation-requests-list` renders (heading only) with a single `vacation-no-requests` row: "No vacation requests yet." |
| **Requests populated** | `requests` non-empty | Rows newest-first; each with status badge + role/status-gated actions; rejected rows show the reviewer comment. |
| **Badge · pending** | `status: "pending"` | `Badge tone="warning"` (amber) "Pending". |
| **Badge · approved** | `status: "approved"` | `Badge tone="active"` (green) "Approved". |
| **Badge · rejected** | `status: "rejected"` | `Badge tone="inactive"` (red) "Rejected" + reviewer comment line if present. |
| **Badge · cancelled** | `status: "cancelled"` | `Badge tone="neutral"` (grey) "Cancelled"; terminal, no actions. |
| **Request button disabled** | `availableDays === 0` | `vacation-request-btn` disabled + `title="No vacation days available"`. |
| **Modal submitting / rejecting / cancelling** | submit/reject/confirm clicked | The action button `loading`; fields `readOnly` / disabled during the in-flight PUT/POST; Cancel disabled — 07's modal-saving contract. |
| **Cross-year (client)** | start/end in different years | Inline `vacation-request-error` with the business spec's cross-year string; Submit disabled. |
| **Server 400 (balance / overlap / past)** | POST/PUT `400` | Message routed to `vacation-request-error` / `errorNode`; modal stays open, values retained, buttons re-enable. |
| **Mutation success** | POST/PUT `2xx` | Modal/dialog closes, matching toast fires, panel **refetches** `GET .../vacation` — never hand-patches (server owns balance, ledger, and status). |
| **Network / server error** | 5xx / thrown fetch | Error toast with the API `message` (falls back to `MESSAGES.generic`); modal/dialog stays open, buttons re-enable. |

Every mutation from this panel (submit / approve / reject / cancel) refetches on success — 09 introduces the panel's first write paths; there is no optimistic patching.

---

## Responsive & accessibility

- The request list inherits 07's container (spec 05's `max-width: 600px`, centered, page-level scroll). A long list lengthens the page and scrolls with it — **no inner scroll container**; pagination is out of scope. Row content is a `flex`/`min-width: 0` layout that wraps (date range on one line, actions dropping below on narrow viewports) so the body never scrolls horizontally.
- The two modals reuse the DS `Modal`; the **full-screen-drawer-below-480px** behaviour remains the open DS-`Modal` gap carried from 07 (the business spec's Responsive rule is satisfied once `Modal` gains the breakpoint, not per-screen).
- **Colour is never the only signal** for status: the badge label text ("Pending" / "Approved" / "Rejected" / "Cancelled") carries meaning independent of the tone tint, and ledger debit/refund carry the `−`/`+` sign + Title-cased type label.
- Native `<input type="date">` gives keyboard entry, a platform date picker, and correct `aria` for free; the `<textarea>` and both date inputs use the shared `field-error.tsx` `errorNode` so each carries `aria-invalid` / `aria-describedby` → its `field-error-{field}` node, identical to every other form.
- `Modal` traps focus and closes on Esc/backdrop (its existing behaviour); the confirm dialogs inherit that. Destructive confirm/reject buttons use `variant="danger"` so the action reads as consequential, not just tinted.
- The disabled "Request vacation" button announces its `disabled` state; the reason ("No vacation days available") is a real `title` tooltip, not colour alone.

## DS gaps

| Gap | Resolution | Status |
|---|---|---|
| **No date field.** The DS has no date picker / date input — `Input` (`1_DS for dev/components/forms/Input.jsx`) wraps a text `<input>` only; there is no calendar/`type="date"` variant. | Use a **native `<input type="date">`** styled to the DS `Input` shape (46px height, `var(--radius-md)`, `1px solid var(--border)`, 3px violet focus ring, `var(--font-text)` `var(--fs-15)`), wrapped with the same `label` + `errorNode` scaffolding as `Input`. Native gives a platform picker, keyboard entry, and `aria` for free. A first-class DS `DateInput` (token-styled wrapper over `type="date"`, optionally a custom calendar popover) would remove the per-screen restyle — recorded for the DS to own. | resolved for this screen (native date input); DS `DateInput` open, not blocking |
| **No textarea.** The DS has no multi-line text component; `Input` is single-line `<input>` only. | Use a **native `<textarea>`** styled with the same `Input` tokens (border, radius, 3px focus ring, `var(--font-text)` `var(--fs-15)`, padding, ~3 rows, `resize: vertical`), carrying `label` + `errorNode` like `Input`. A first-class DS `Textarea` (auto-grow optional, char-count slot for the 500-char limit) would remove the composition — recorded for the DS to own. | resolved for this screen (native textarea); DS `Textarea` open, not blocking |
| **No confirmation-dialog primitive.** The DS `Modal` exists but there is no `ConfirmDialog` — the app already composes cancel/confirm dialogs from `Modal` by hand (`apps/web/app/org/[orgId]/members/DeleteConfirmDialog.tsx`). | Build both cancel confirmations as small `Modal` compositions following that exact precedent (one-line body `<p>` + Cancel/Confirm footer, confirm `variant="danger"` + `loading`). A first-class DS `ConfirmDialog` (title, body, confirm/cancel labels, danger flag, async-loading confirm) would collapse the third hand-rolled instance — recorded for the DS to own. | resolved for this screen (Modal composition); DS `ConfirmDialog` open, not blocking |
| **`Badge` has no request-status tone names.** The DS `Badge` **exists** with `active` / `inactive` / `warning` / `info` / `neutral`; `inactive` resolves to red, so pending→`warning`, approved→`active`, rejected→`inactive`, cancelled→`neutral` all map with **no token invented and no pill hand-built**. But reusing `inactive` (semantically "inactive member") for `rejected` and `active` for `approved` is a naming stretch. | Use the existing `Badge` with the tone mapping above for this screen (fully covered, no DS change needed to ship). A DS improvement — semantic aliases `success` / `danger` (or a `status` prop accepting request-status names) resolving to the same green/red tokens — would let the badge read honestly. | resolved for this screen (existing Badge tones); semantic-alias DS addition open, not blocking |
| **No signed-amount / money treatment.** (Carried from 08.) The ledger's `+`/`−`, currency-formatted, semantically-coloured cell is still composed inline; 09 widens it from a credit-vs-expiry binary to a **sign-by-type map** over four types (`credit`/`refund` → `+`/green, `expiry`/`debit` → `−`/red). | Keep the inline composition (07's `formatCurrency` + `var(--success-700)` / `var(--error-600)` + `var(--font-display)` 600), widened to the four-type map. A first-class `Amount`/`Money` helper (sign + format + semantic colour by ledger type) would remove the per-cell logic. | open, not blocking (candidate DS addition, carried from 08) |

Carried forward from specs 01–08, still true: the DS `Table` primitive double-frames + adds row hover inside the panel's `<section>`, so the requests list stays a token-styled `<div>`/`<section>` layout (not `Table`), matching the ledger's precedent; `Modal` still lacks the `<480px` full-screen-drawer breakpoint (the responsive gap that governs both new modals); `Select`/`Input` still lack a first-class `errorId` (the `errorNode` cast-through remains the workaround); no `Skeleton` primitive exists, so the extended `vacation-loading-skeleton` uses static `var(--bg-sunken)` blocks; `_adherence.oxlintrc.json`'s exhaustive prop declarations flag pass-through native attributes (`data-testid`, `title`) on DS components — the "Request vacation" `title` tooltip is one more instance; `InfoBanner` still hardcodes its tone triplets as `oklch(...)` literals (the request toasts are further instances, untouched here).

## Required `data-testid` attributes

| `data-testid` | Element | Origin |
|---|---|---|
| `vacation-request-btn` | "Request vacation" button (own profile) | **new (09)** |
| `vacation-requests-list` | Requests / My Requests section wrapper | **new (09)** |
| `vacation-request-row-{id}` | One request row | **new (09)** |
| `vacation-request-dates-{id}` | Row date range | **new (09)** |
| `vacation-request-days-{id}` | Row working-days count | **new (09)** |
| `vacation-request-status-{id}` | Row status `Badge` | **new (09)** |
| `vacation-request-reviewer-comment-{id}` | Reviewer comment (rejected rows) | **new (09)** |
| `vacation-request-approve-{id}` | Row Approve button | **new (09)** |
| `vacation-request-reject-{id}` | Row Reject button | **new (09)** |
| `vacation-request-cancel-{id}` | Row Cancel button | **new (09)** |
| `vacation-no-requests` | Empty-state row | **new (09)** |
| `vacation-request-modal` | Request Vacation modal shell | **new (09)** |
| `vacation-start-date-input` | Start date field | **new (09)** |
| `vacation-end-date-input` | End date field | **new (09)** |
| `vacation-working-days-preview` | Real-time working-days line | **new (09)** |
| `vacation-available-days-preview` | Available-balance line | **new (09)** |
| `vacation-request-submit-btn` | Submit request button | **new (09)** |
| `vacation-request-cancel-btn` | Request modal cancel button | **new (09)** |
| `vacation-request-error` | Request modal inline error node | **new (09)** |
| `field-error-startDate` | Start-date field error | **new (09)** |
| `field-error-endDate` | End-date field error | **new (09)** |
| `vacation-reject-modal` | Reject Request modal shell | **new (09)** |
| `vacation-reject-comment-input` | Comment textarea | **new (09)** |
| `vacation-reject-confirm-btn` | Reject button | **new (09)** |
| `vacation-reject-cancel-btn` | Reject modal cancel button | **new (09)** |
| `field-error-reviewerComment` | Comment field error | **new (09)** |
| `vacation-cancel-confirm-dialog` | Cancel confirmation dialog (pending & approved) | **new (09)** — internal, not in business list |
| `toast-request-submitted` | Submit success toast | **new (09)** |
| `toast-request-approved` | Approve success toast | **new (09)** |
| `toast-request-rejected` | Reject success toast | **new (09)** |
| `toast-request-cancelled` | Cancel success toast | **new (09)** |
| `vacation-balance-card` | Balance card — `used`/`pending` now live | reused (07/08) |
| `vacation-used-days`, `vacation-pending-days` | Now live values | reused (07) |
| `vacation-transactions-table`, `vacation-no-transactions` | Ledger — now also debit/refund rows | reused (08) |
| `member-detail-tab-vacation` | Vacation tab item — unchanged | reused (05) |

## Reference mockup

No `09-…mock.html` exists and none is required — following 07/08's precedent, verify against the running API and UI directly: exercise `GET .../vacation` with a populated `requests` array in each shape (admin/manager with pending + approved + rejected rows and their action buttons; user-own with "My Requests" and no money), then drive each mutation — POST a request (happy path, cross-year client-block, insufficient-balance/overlap `400`), Approve, Reject-with-comment, Cancel-pending, Cancel-approved — confirming badges resolve to the right tones, the ledger renders new `debit` red-`−` / `refund` green-`+` rows, the confirm-dialog copy and toast strings match byte-for-byte, and the balance card's `used`/`pending` update after each refetch. `1_DS for dev/templates/meridian-app/MeridianApp.dc.html` remains the token/value reference for the Meridian look.
