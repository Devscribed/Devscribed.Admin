---
id: "08"
kind: design
title: Vacation Reserve & Auto-Accrual — Design
pairs-with: 08-vacation-reserve-auto-accrual.md
routes: ["/org/{orgId}/members/{memberId}"]
design-system: "1_DS for dev"
tags: [vacation-tab, reserve-transactions, ledger, signed-amount, auto-accrual, balance, member-detail, meridian]
---

# 08 — Vacation Reserve & Auto-Accrual · Design

Visual and interaction specification for the **Reserve Transactions ledger** added to the Vacation tab, and for turning spec 07's placeholder-zero **Vacation Balance** card into live numbers. Pairs with [08-vacation-reserve-auto-accrual.md](08-vacation-reserve-auto-accrual.md), which owns the ledger rules, the balance math, the accrual engine, the API contract, and every fixed string (the empty-state sentence, the amounts, the descriptions).

**This is a delta on [07-vacation-accrual-management.design.md](07-vacation-accrual-management.design.md).** Everything 07 established holds unchanged: this is still the second tab of the existing Member Detail screen ([05](05-member-detail-about.design.md)), rendered by `apps/web/app/org/[orgId]/members/[memberId]/VacationPanel.tsx`; the tab-enablement `canViewVacation` contract, the panel's `GET .../vacation` fetch, and the four render shapes are all 07's. Spec 08 adds **one new nested block** to the admin/manager panel — the Reserve Transactions ledger — and swaps the balance card's `0` / `$0.00` placeholders for real payload values. It adds no route, no chrome, and **no accrual-trigger control** (see [No accrual UI](#no-accrual-ui)).

**Theme:** light only. **Tokens:** every value below already exists in `1_DS for dev/tokens/*.css`; no hex, no px is written by hand.

---

## What changes vs. 07

| 07 (foundation) | 08 (this delta) |
|---|---|
| Balance card renders `0` / `0.00` from a zero-by-contract payload | Same markup — the payload now returns real `availableDays` / `usedDays` / `pendingDays` / `reserveBalance`; the card is unchanged, the numbers are live |
| Admin/manager panel = Financial Settings card + Balance card | Adds a third nested block below them: **Reserve Transactions** |
| User-own panel = Balance card only (days + "out of {N} per year") | **Unchanged** — no ledger, no money; `transactions` is `null` and `reserveBalance` is `null` for a `user` by contract |

The `VacationPanel` already reads `availableDays` / `usedDays` / `pendingDays` / `reserveBalance` straight from `balance` and renders `vacation-available-days` / `vacation-used-days` / `vacation-pending-days` / `vacation-reserve-amount` (07's `BalanceCard`). Spec 08 requires **no change** to that card's markup — only that the server now sends non-zero numbers. `usedDays` / `pendingDays` stay `0` until spec 09 lands requests, and the card renders whatever the payload holds without client-side math.

---

## Vacation Tab — admin/manager view (with ledger)

### Layout

```
  ┌──────────────────────────────────────────────────────────┐
  │  About   VACATION   Projects   Roles   Payments           │
  │          ───────                                          │
  │                                                            │
  │  ┌─ Financial Settings ─────────────────── [ Edit ] ─┐    │  ← 07, unchanged
  │  └───────────────────────────────────────────────────┘    │
  │                                                            │
  │  ┌─ Vacation Balance ────────────────────────────────┐    │  ← 07 markup,
  │  │    12          0           0                       │    │    live numbers
  │  │  available   used       pending                    │    │
  │  │  Reserve   $1,661.54 USD                           │    │
  │  └────────────────────────────────────────────────────┘   │
  │                                                            │
  │  ┌─ Reserve Transactions ────────────────────────────┐    │  ← 08, new
  │  │  DATE    TYPE     AMOUNT     DESCRIPTION    BY      │    │
  │  │  Jul 1   Credit   +$230.88   June 2025…    System  │    │
  │  │          (auto)                                     │    │
  │  │  Jun 1   Credit   +$230.88   May 2025…     System  │    │
  │  │          (auto)                                     │    │
  │  └────────────────────────────────────────────────────┘   │
  └──────────────────────────────────────────────────────────┘
```

- The Reserve Transactions block is a **third nested `<section>`** stacked into the panel's existing `flex-direction: column; gap: var(--sp-8)` column, below the balance card. It matches the other two cards exactly: `border: 1px solid var(--divider)`, `border-radius: var(--radius-xl)`, `padding: var(--sp-8)` (07's `cardStyle()`), with a `var(--sp-6)`-margin heading row.
- **Heading:** "Reserve Transactions" in the same micro-heading style the other two cards use (`var(--font-display)`, 600, `var(--fs-15)`, `var(--text)`). No Edit affordance, no button — the ledger is read-only.
- **Order:** newest first (the payload arrives ordered; the panel does not re-sort).
- Visible **only** to admin/manager. It renders when `transactions` is a non-null array (`transactions: null` ⇒ user-own view ⇒ not rendered).

### The ledger table

Columns, left to right:

| Column | Content | Alignment / treatment |
|---|---|---|
| **Date** | `createdAt` formatted `Jul 1` (Grotesk numeral date) | left; `var(--font-display)` 600 |
| **Type** | `Credit` / `Expiry` (Title-cased display of the payload's lowercase `type`); auto rows show a muted **`(auto)`** tag on a second line | left; tag in `var(--fs-13)`, `var(--text-muted)` |
| **Amount** | signed money: credit `+$230.88` in **green** (`var(--success-700)`), expiry `−$120.00` in **red** (`var(--error-600)`); formatted with 07's `formatCurrency` | right; `var(--font-display)` 600 numerals |
| **Description** | `description` verbatim from the payload (e.g. "June 2025 accrual") | left; `var(--font-text)`, `var(--fs-15)`, `min-width: 0` so it wraps/truncates and never forces body scroll |
| **Created by** | **`System`** when `createdBy` is `null` (auto credit); the actor's display name otherwise (manual expiry) | left; `var(--text-sub)`, `var(--fs-13)` |

> **Column reconciliation.** The business spec's wireframe draws four visible columns; its UI Description prose additionally specifies a CreatedBy column showing "System", and TC-08-E2E-01 asserts "System" in the created-by column. This design honours the prose — five columns — with `(auto)` carried as a Type sub-tag and `System` in the Created-by column, so both assertions are satisfiable.

**Colour is never the only signal.** The sign character (`+` / `−`) and the Type label carry the credit-vs-expiry meaning independently of the green/red tint, so the amount reads correctly without colour perception.

---

## No accrual UI

Per the business spec (§Manual Accrual Trigger, and Out of Scope: "Manual credit entry"), the accrual trigger is an **API-only** endpoint — `POST /api/admin/accrual/run`, an ops/admin call. **There is deliberately no button, menu item, or control anywhere on the Vacation tab** to run accrual, add a credit, or create an expiry. The ledger is presentation-only. Do not build one. The only writes that reach this ledger come from the background job, the API endpoint, and (later) spec 09's request lifecycle.

---

## Component map

Spec 07's Financial Settings card, Balance card, empty state, and modal are all unchanged and not repeated here. This table covers only what 08 adds or reuses.

| Screen element | DS component | Props / build | `data-testid` |
|---|---|---|---|
| Reserve Transactions block | native `<section>` (nested bordered block, **not** a DS `Card` — same anti-double-frame reason as 07) | 07's `cardStyle()`: `1px solid var(--divider)`, `var(--radius-xl)`, `var(--sp-8)` | `vacation-transactions-table` (on the section/table wrapper) |
| Block heading | native `<div>` | "Reserve Transactions", `var(--font-display)` 600 `var(--fs-15)` | — |
| Ledger table | semantic token-styled `<table>` (**not** the DS `Table` primitive — see [DS gaps](#ds-gaps)) | header: uppercase Grotesk `var(--fs-11)` / `var(--ls-wider)` in `var(--text-muted)`; rows separated by `1px solid var(--divider)`, `var(--font-text)` `var(--fs-15)` cells | — (inside `vacation-transactions-table`) |
| Amount cell (signed) | native `<span>` | `+`/`−` prefix; `var(--success-700)` credit / `var(--error-600)` expiry; `var(--font-display)` 600 | — |
| `(auto)` tag | native `<span>` | `var(--fs-13)`, `var(--text-muted)`; rendered only when `isAutoGenerated` | — |
| Empty-state row | native `<tr>`/`<td>` (or single flat `<div>`) | full-width row; copy is the business spec's fixed string | `vacation-no-transactions` |
| Balance card (live) | native `<section>` — 07's `BalanceCard`, **unchanged markup** | now fed real `balance` numbers | `vacation-balance-card` |
| Available-days stat | native `<div>` — 07's `Stat`, unchanged | live `balance.availableDays` | `vacation-available-days` |
| Reserve amount | native `<div>` — 07's, unchanged | live `balance.reserveBalance`, admin/manager, rendered only when `!= null` | `vacation-reserve-amount` |
| Loading skeleton | 07's local `VacationSkeleton`, **extended** | add a third block: a header bar + 3–4 row lines in `var(--bg-sunken)` | `vacation-loading-skeleton` |

Reused from earlier specs, unchanged bindings: `member-detail-tab-vacation` (05's `TABS`), `vacation-used-days` / `vacation-pending-days` (07; stay `0` until spec 09).

---

## Copy

Validation and fixed business strings are **not** restated here — they are owned by the business spec (§Error Messages, §Screens). Design owns the structural labels and micro-copy below.

| Slot | Owner | Text |
|---|---|---|
| Block heading | design | Reserve Transactions |
| Column header · date | design | Date |
| Column header · type | design | Type |
| Column header · amount | design | Amount |
| Column header · description | design | Description |
| Column header · created-by | design | Created by |
| Type value display | design (casing) | Credit / Expiry (Title-cased from payload `credit` / `expiry`) |
| Auto tag | design | (auto) |
| Created-by literal (when `createdBy` is null) | design | System |
| Signed amount prefix | design | `+` (credit) / `−` (expiry) |
| Empty state — no transactions | **business spec** | "No reserve transactions yet." (verbatim, `1_DS for dev` voice guide lists this exact string — quoted, not re-typed) |
| Amounts, dates, descriptions | **business spec / payload** | e.g. "June 2025 accrual", `$230.88` — rendered from the response, never composed client-side |

Money uses 07's `formatCurrency` helper unchanged (Intl currency style with a bare-number-plus-code fallback); the sign prefix is prepended, the colour applied by type.

---

## States

Additions to 07's state table (07's tab-disabled / loading / empty-financials / configured / modal states all still apply).

| State | Trigger | Rendering |
|---|---|---|
| **Ledger loading** | Vacation tab activated, `GET .../vacation` in flight | 07's `vacation-loading-skeleton`, extended with a third table-shaped placeholder block. |
| **Ledger — no transactions** | admin/manager, `transactions: []` | `vacation-transactions-table` renders (heading + header row) with a single `vacation-no-transactions` row showing "No reserve transactions yet." |
| **Ledger — populated** | admin/manager, `transactions` non-empty | Rows newest-first; credits green `+`, expiries red `−`; auto rows show `(auto)` + `System`. |
| **Ledger absent (user-own)** | `transactions: null` | Neither `vacation-transactions-table` nor `vacation-no-transactions` renders; balance card only (days + "out of {N} per year"), exactly as 07. |
| **Balance — live numbers** | `balance` present | Same card as 07, now showing real `availableDays` / `usedDays` / `pendingDays` and, for admin/manager, real `vacation-reserve-amount`. |

The panel refetches `GET .../vacation` on the same triggers 07 defines (tab activation, and after a financials `PUT`); there is no 08-specific mutation from this screen, so no new refetch path.

---

## Responsive & accessibility

- The ledger inherits 07's container (spec 05's `max-width: 600px`, centered, page-level scroll). A long list simply lengthens the page and scrolls with it — **no inner scroll container**, matching the DS rule that content scrolls while chrome doesn't; pagination is out of scope. The five columns are flex/`min-width: 0` cells that squeeze, with Description wrapping, so a narrow viewport never forces horizontal **body** scroll.
- The table is a **semantic `<table>`** (`<thead>` / `<tbody>` / `<th scope="col">`), so assistive tech announces the ledger as tabular data — a genuine gain over the DS `Table`'s flex-div markup for a data grid.
- Amount meaning is conveyed by the `+` / `−` character and the Type label, not colour alone.
- Rows are inert (no click, no hover affordance) — the ledger is read-only, so nothing implies interactivity.

## DS gaps

| Gap | Resolution | Status |
|---|---|---|
| A DS `Table` primitive **exists** (`1_DS for dev/components/data/Table.jsx`) but is built for top-level, navigable tables: it renders its own card chrome (`var(--bg-panel)`, `1px var(--border)`, `var(--radius-2xl)`, `overflow: hidden`) and attaches an always-on `--hover-bg-tint` row hover (plus optional row-click cursor). Nested inside the panel's bordered `<section>` it **double-frames** (border-in-border) — the exact problem 07 avoided by using `<section>` blocks instead of nested `Card`s — and its hover implies clickable rows on a read-only ledger. | Render the ledger as a **semantic token-styled `<table>`** inside the section, reusing the same tokens the DS `Table` itself uses (uppercase Grotesk `var(--fs-11)`/`var(--ls-wider)` header in `var(--text-muted)`, `var(--font-display)` 600 numerals, `1px var(--divider)` row rules). This follows 07's established precedent precisely. A **flat/embedded, non-interactive `Table` variant** (no self-border, no hover, no row cursor, semantic `<table>` output) would let a future ledger reuse the DS primitive — recorded for the DS to own. | resolved for this screen (token-built table); DS variant open, not blocking |
| No DS signed-amount / money treatment (a `+`/`−` prefixed, currency-formatted, semantically-coloured value). | Composed inline from existing tokens: `var(--success-700)` (credit) / `var(--error-600)` (expiry) — the same ink tokens `Badge`'s active/inactive tones resolve to — plus `var(--font-display)` 600 numerals and 07's `formatCurrency`. A first-class `Amount`/`Money` helper (sign + format + semantic colour) would remove the per-cell composition. | open, not blocking (candidate DS addition) |
| Scroll treatment for a potentially long ledger. | **None needed.** The panel lives in the page's normal scroll region; a long list lengthens the page and scrolls with it, and pagination is explicitly out of scope. Flex/`min-width: 0` columns with a wrapping Description keep the table within the container width on narrow viewports. | none |

Carried forward from specs 01–07, still true: `_adherence.oxlintrc.json`'s exhaustive prop declarations flag pass-through native attributes (`data-testid`, `title`) on DS components; no `Skeleton` primitive exists, so the extended `vacation-loading-skeleton` uses static `var(--bg-sunken)` blocks; `InfoBanner` still hardcodes its tone triplets as `oklch(...)` literals (untouched here — 08 adds no banners).

## Required `data-testid` attributes

| `data-testid` | Element | Origin |
|---|---|---|
| `vacation-transactions-table` | Reserve Transactions section / table wrapper (admin/manager only) | **new (08)** |
| `vacation-no-transactions` | Empty-state row inside the table when `transactions: []` | **new (08)** |
| `vacation-balance-card` | Balance card — now live numbers | reused (07) |
| `vacation-available-days` | Available-days stat — now live | reused (07) |
| `vacation-reserve-amount` | Reserve currency amount — now live (admin/manager, `reserveBalance != null`) | reused (07) |
| `member-detail-tab-vacation` | Vacation tab item — unchanged | reused (05) |

Also reused unchanged: `vacation-used-days`, `vacation-pending-days` (07; render `0` until spec 09).

## Reference mockup

No `08-…mock.html` exists and none is required — following 07's precedent, verify against the running API and UI directly: exercise `GET .../vacation` in each shape (admin/manager with a populated ledger, admin/manager with `transactions: []`, user-own with `transactions: null`), confirming the ledger renders credits green `+` / expiries red `−`, `(auto)` + `System` on auto rows, the empty row's exact string, and the balance card's live numbers byte-for-byte against this doc and the vacation types. `1_DS for dev/templates/meridian-app/MeridianApp.dc.html` remains the token/value reference for the Meridian look.
