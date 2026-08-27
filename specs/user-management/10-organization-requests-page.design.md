---
id: "10"
kind: design
title: Organization Requests Page — Design
pairs-with: 10-organization-requests-page.md
routes: ["/org/{orgId}/requests"]
design-system: "1_DS for dev"
tags: [requests-page, sidebar, badge, pending-requests, status-filter, request-card, avatar, approve, reject, cancel, meridian, light-only]
---

# 10 — Organization Requests · Design

Visual and interaction specification for the org-wide **Requests** page and its **sidebar nav item + pending-count badge**: a role-gated destination where `admin`/`manager` see every vacation request across the organization as a stack of rich cards, filter by status, and act on them without opening each member's profile. Pairs with [10-organization-requests-page.md](10-organization-requests-page.md), which owns the `GET .../requests` contract, the status/sort rules, the permission matrix, the redirect, and **every fixed string** (the forbidden message and both empty-state sentences).

**This is a delta on [09-vacation-requests.design.md](09-vacation-requests.design.md).** Spec 10 changes no request behaviour and invents no new action: the card's **Approve / Reject / Cancel** buttons drive the **same** spec-09 review/cancel APIs, open the **same** [Reject Request modal](09-vacation-requests.design.md#reject-request-modal) and [cancel-confirm dialog](09-vacation-requests.design.md#confirm-dialogs-cancel), and paint status with the **same** [Badge tone map](09-vacation-requests.design.md#status-badges). Those are referenced, not restated. What 10 adds is a new **route**, a new **sidebar row + badge**, a **status-filter dropdown**, and a **card** layout — chrome and reused pieces excluded.

**This is also a delta on [00-app-shell.design.md](00-app-shell.design.md).** The page renders inside the existing shell (sidebar, top bar, page header); 10 adds exactly one `NavItem` to the sidebar's nav list and never redraws the frame. 00 already anticipates this row — its [Planned rows](00-app-shell.design.md#planned-rows) table lists `Requests → /org/{orgId}/requests`, ships with spec 10, visible to admin/manager.

**Theme:** light only. **Tokens:** every value below already exists in `1_DS for dev/tokens/*.css`; no hex, no px written by hand.

---

## What changes vs. 09 / 00

| Earlier (foundation) | 10 (this delta) |
|---|---|
| 09 renders requests **per member**, inside the Vacation tab's nested `<section>` (`VacationPanel`) | 10 renders requests **org-wide**, on a **dedicated route** as a centered card stack |
| 09's rows key off one member's `canReviewRequests` / `canSubmitRequest` payload flags | 10 is reviewer-only by construction (page is admin/manager-gated); each card acts on its own `member.membershipId` |
| 00's sidebar carries a single `Members` row, section-less beyond `People`, no role gating in the built `Sidebar.tsx` | 10 appends a **role-gated `Requests` row** after Members, carrying a **pending-count badge** |
| Reject modal / cancel dialog are opened by `VacationPanel` for the viewed member | The **same** two components are opened by the Requests page, parameterized by each card's `member.membershipId` |

The request lifecycle, the review/cancel endpoints, the toasts, the status semantics, and the money-is-admin/manager rule are all 09's and unchanged. 10 is a second **surface** onto the same data.

---

## Sidebar integration

The `Requests` row conforms to 00's sidebar rules ([Sidebar](00-app-shell.design.md#sidebar)) — it is a DS `NavItem` (`1_DS for dev/components/navigation/NavItem.jsx`) appended **after** `Members` in the shell's `apps/web/src/layout/Sidebar.tsx` nav list, active-when-nested (a card's member-detail link does not light Requests — only `/org/{orgId}/requests` does), hover on `--hover-bg-tint`, active on `--accent-soft` + `--accent-border`. 00 lists it section-less, so it renders directly beneath the Members row with **no new `SectionLabel`**.

- **Route / href:** `/org/{orgId}/requests`; label "Requests"; `data-testid="sidebar-requests-link"`; icon a new inbox/tray glyph added to `apps/web/src/layout/icons.tsx` (the DS ships no icon export beyond `Eye`/`EyeOff` — 00's carried icon gap).
- **Role gating.** Visible to `admin`/`manager` only, invisible to `user`/`viewer`. The shell resolves the session **before** it renders (00's "role-gated rows never flash" rule), so the row is simply omitted from the nav array when the role lacks `ViewRequests` — never rendered-then-hidden. TC-10-E2E-03 asserts `sidebar-requests-link` **absent** for user/viewer.
- **Badge.** `NavItem` already owns a count-pill (`badge` prop → `--accent` bg, `--on-accent` ink, `--radius-md`, Grotesk `--fs-11`, right-aligned via `marginLeft: auto`), and renders it **only when `badge != null`** — so passing `badge={pendingCount || undefined}` gives the "hidden at 0" rule for free. `data-testid="sidebar-requests-badge"` must land on that pill span (see [DS gaps](#ds-gaps) — `NavItem` needs a small `badgeTestId` pass-through; today `...rest` lands on the `<a>`, not the pill).

### Badge count — data path

The badge lives in the shell and shows on **every** route, but its number is the `pendingCount` field the business spec returns from `GET /api/organizations/{orgId}/requests`. So the count is sourced independently of the page being open:

- On shell mount, **for admin/manager only** (same role gate as the row's visibility, so `user`/`viewer` never fire it), a lightweight fetch of `GET .../requests?status=pending` reads `pendingCount` into a shared shell value (a small `RequestsBadgeContext` alongside `session-context`, mirroring how spec 12's topbar timer is fetched on shell mount in 00).
- The **Requests page reads and writes that same value**: it already fetches `GET .../requests` for its list, so it seeds/refreshes `pendingCount` from that response, and after any in-place action (approve/reject/cancel) its refetch updates the badge — satisfying TC-10-E2E-01 ("badge shows 2") and the tail of the flow ("badge updates to 0 or disappears"). No optimistic patching; the server's `pendingCount` is authoritative, consistent with 09's refetch-on-mutation discipline.

---

## Page anatomy

```
  ┌──────────────┬────────────────────────────────────────────┐
  │ Teammerly●   │                              Pat Owner (PO) │  ← 00 top bar
  ├──────────────┼────────────────────────────────────────────┤
  │ PEOPLE       │  Requests                                   │  ← 00 page header
  │  ▣ Members   │                                             │
  │  ▣ Requests 2│  [ Pending ▾ ]                              │  ← Select filter
  │              │  ┌────────────────────────────────────────┐ │
  │              │  │ (AK)  Alex Kaminski        ● Pending    │ │  ← request card
  │              │  │       Jul 14 – Jul 25, 2025             │ │    (max-w ~700px,
  │              │  │       10 working days · 12 days available│ │     centered)
  │              │  │       [ $1,384.62 ]                     │ │
  │              │  │                    [ Approve ] [ Reject ]│ │
  │              │  └────────────────────────────────────────┘ │
  │              │  ┌────────────────────────────────────────┐ │
  │              │  │ (JS)  Jane Smith           ● Pending    │ │
  │              │  └────────────────────────────────────────┘ │
  └──────────────┴────────────────────────────────────────────┘
```

- **Route / access.** `/org/{orgId}/requests`, rendered inside the shell. The route's server component checks the session role and, lacking `ViewRequests`, `redirect()`s to `/org/{orgId}/members` — the same "resolve-then-route" discipline 00 uses for an `{orgId}` mismatch (`notFound()`); the API's own `403` (message owned by the business spec) is the real boundary. The content wrapper carries `data-testid="requests-page"`.
- **Page header.** 00's page header, title **"Requests"** (`page-title`, Grotesk 600 / `--fs-27`), no subtitle, no trailing action. The screen owns only its title copy; it draws no chrome.
- **Status filter.** DS `Select` (`1_DS for dev/components/forms/Select.jsx`), `data-testid="requests-status-filter"` (spread through `...rest` onto the trigger button), sitting below the header. Options **Pending** (default) / **Approved** / **Rejected** / **Cancelled** / **All**; changing it re-fetches `GET .../requests?status=…` and re-renders the stack (business spec §Page Layout). The 42-item scroll fix from spec 07 is irrelevant here (five short options) but inherited.
- **Card stack.** Vertical `flex` column, `gap: var(--sp-6)`, **`max-width` ~700px, centered** in the content column (a page-level container wider than 05's 600px member-detail column — design-owned for this list). Page-level scroll only, no inner scroll container; pagination is out of scope (business spec).
- **Responsive.** At the ~700px cap the stack is centered; on narrower viewports it goes full-width with the shell's content padding (00's `28px 32px 48px`). Cards always stack vertically; card internals use `flex`/`min-width: 0` wrapping so the body never scrolls horizontally, matching 09's row-wrap rule. The `<1024px` sidebar collapse and the `Modal` `<480px` drawer gap are 00/09's carried behaviours, unchanged.

---

## Request card anatomy

Each card is a DS `Card` (`1_DS for dev/components/surfaces/Card.jsx` — 14px radius, 1px `--border`, warm `--shadow-card`, paper body) with `data-testid="requests-card-{id}"`. Unlike 09's nested `<section>` rows (which avoid double-framing inside the Vacation tab's outer `Card`), the Requests page has **no outer card**, so a real DS `Card` per request is correct here. Internal layout is a `flex` header row (avatar + name + status badge) over stacked detail lines and a trailing action row.

| Element | Content | DS component / token | `data-testid` |
|---|---|---|---|
| Initials avatar | `member.initials` (e.g. `AK`); `avatarUrl` is `null` this release | app `AvatarInitials` (`…/[memberId]/AvatarInitials.tsx`) at `size≈40`; name-hashed `oklch` tint over `--font-display` 600 — see [DS gaps](#ds-gaps) | `requests-card-avatar-{id}` |
| Member name (link) | `{firstName} {lastName}`, clickable → `/org/{orgId}/members/{membershipId}` | `next/link`, `var(--font-display)` 500, `--fs-15`, `--text`; hover `--accent` | `requests-card-member-name-{id}` |
| Status badge | Pending / Approved / Rejected / Cancelled | DS `Badge`, tone via **09's map** (`warning`/`active`/`inactive`/`neutral`) — not restated | `requests-card-status-{id}` |
| Date range | `Jul 14 – Jul 25, 2025` | 09's `formatDateRange` (en-dash, UTC-parsed), `--font-display` 600 `--fs-15` | `requests-card-dates-{id}` |
| Working days | `10 working days` | native `<span>`, `--font-text` `--fs-13` `--text-muted` (card-specific label — see [Copy](#copy)) | `requests-card-days-{id}` |
| Available balance | `12 days available` from `memberBalance.availableDays` | native `<span>`, `--fs-13` `--text-muted` | `requests-card-balance-{id}` |
| Deduction amount | `$1,384.62` from `deductionAmount`, admin/manager only | 09's `formatCurrency`; `--font-display` 600 `--fs-15` `--text`, subtle bordered chip (`1px --divider`, `--radius-md`) reading the wireframe's `[ … ]` | `requests-card-deduction-{id}` |
| Reviewer comment | rejected rows, when present: quoted comment | native `<div>`, `--fs-13` `--text-sub`, `&ldquo;…&rdquo;` (09's treatment) | `requests-card-reviewer-comment-{id}` |
| Reviewed-by line | reviewed rows: `Reviewed by {name}` | native `<div>`, `--fs-13` `--text-sub` (design microcopy; `{name}` from payload) | `requests-card-reviewed-by-{id}` |
| Approve button | pending only | DS `Button` `variant="primary"` `size="sm"`; fires 09's `PUT .../review {decision:"approved"}` immediately, toast `toast-request-approved` | `requests-card-approve-{id}` |
| Reject button | pending only | DS `Button` `variant="secondary"` `size="sm"`; opens 09's **Reject Request modal** | `requests-card-reject-{id}` |
| Cancel button | approved only | DS `Button` `variant="danger"` `size="sm"`; opens 09's **cancel-confirm dialog** (approved variant → refund notice) | `requests-card-cancel-{id}` |

**Action wiring — same components, per-card member.** The page holds one `rejectTarget` / `cancelTarget` at a time and renders a **single** shared `RejectRequestModal` (`…/[memberId]/RejectRequestModal.tsx`) and cancel-confirm dialog (09's `CancelRequestDialog` composition), each parameterized with the acted card's `member.membershipId` as `memberId` and the member's full name as `requesterName`. Because those two components already take `orgId` / `memberId` / `request` props and are pure, they are **imported and reused as-is** across the route boundary; a small shared-location move (out of the `[memberId]/` folder) is an optional refactor, not a redesign. On success each closes, toasts (09's strings), and the page **refetches `GET .../requests`** — the card updates in place (status flips, buttons removed) and `pendingCount` (hence the badge) updates. Rejected/cancelled cards are terminal (no buttons). Reviewer-vs-owner gating from 09 is moot: the page never shows a viewer their own request with Approve/Reject because it is a reviewer surface, and the review buttons still key off request `status`, not role.

---

## Component map

Only what 10 adds or reuses; 09's modals/dialogs and 00's shell are referenced, not repeated.

| Screen element | DS component | Props / build | `data-testid` |
|---|---|---|---|
| Sidebar Requests row | DS `NavItem` (in `Sidebar.tsx`) | `href`, `label="Requests"`, role-gated, `badge={pendingCount \|\| undefined}` | `sidebar-requests-link` |
| Sidebar pending badge | `NavItem` `badge` pill | count; hidden at 0 (NavItem renders only when `badge != null`); needs `badgeTestId` pass-through | `sidebar-requests-badge` |
| Page wrapper | native `<div>` inside shell content | — | `requests-page` |
| Page title | 00 page header | "Requests" | `page-title` (reused, 00) |
| Status filter | DS `Select` | options Pending/Approved/Rejected/Cancelled/All; `onChange` → refetch | `requests-status-filter` |
| Request card | DS `Card` | one per request; flex header + detail lines + action row | `requests-card-{id}` |
| Card avatar | app `AvatarInitials` | `initials`, `fullName`, `size≈40`; needs `data-testid` override ([DS gaps](#ds-gaps)) | `requests-card-avatar-{id}` |
| Card member name | `next/link` | → `/org/{orgId}/members/{membershipId}` | `requests-card-member-name-{id}` |
| Card status badge | DS `Badge` | 09 tone map | `requests-card-status-{id}` |
| Card date range | native `<span>` | 09's `formatDateRange` | `requests-card-dates-{id}` |
| Card working-days | native `<span>` | `{n} working days` | `requests-card-days-{id}` |
| Card balance | native `<span>` | `{n} days available` | `requests-card-balance-{id}` |
| Card deduction | native `<span>`/chip | 09's `formatCurrency`; admin/manager only | `requests-card-deduction-{id}` |
| Card reviewer comment | native `<div>` | quoted; rejected + comment only | `requests-card-reviewer-comment-{id}` |
| Card reviewed-by | native `<div>` | `Reviewed by {name}`; reviewed rows | `requests-card-reviewed-by-{id}` |
| Approve button | DS `Button` | `primary` `sm`; 09 approve API | `requests-card-approve-{id}` |
| Reject button | DS `Button` | `secondary` `sm`; opens 09 reject modal | `requests-card-reject-{id}` |
| Cancel button | DS `Button` | `danger` `sm`; opens 09 cancel dialog | `requests-card-cancel-{id}` |
| Empty state | native `<div>` | centered; business spec's verbatim string | `requests-empty-state` |
| Loading skeleton | native `<div>` (static `--bg-sunken` blocks) | card-shaped placeholders; no `Skeleton` primitive | `requests-loading-skeleton` |
| Reject Request modal | 09 `RejectRequestModal` (reused) | per-card `memberId`/`requesterName` | `vacation-reject-modal` (09) |
| Cancel-confirm dialog | 09 `CancelRequestDialog` (reused) | approved variant → refund notice | `vacation-cancel-confirm-dialog` (09) |
| Approve/reject/cancel toasts | `useToast()` (09) | 09's success/error strings | `toast-request-approved`, `toast-request-rejected`, `toast-request-cancelled` |

---

## Copy

The **forbidden message** and both **empty-state strings** are owned by the business spec (§Error Messages) and quoted where used, never restated. Design owns the page title, filter option labels, the card microcopy, and layout labels below.

| Slot | Owner | Text |
|---|---|---|
| Page title | design | Requests |
| Filter option · pending (default) | design | Pending |
| Filter option · approved | design | Approved |
| Filter option · rejected | design | Rejected |
| Filter option · cancelled | design | Cancelled |
| Filter option · all | design | All |
| Card working-days label | design | {n} working days |
| Card balance label | design | {n} days available |
| Card reviewed-by line | design | Reviewed by {name} |
| Card deduction | design | 09's `formatCurrency` output (bracket chip illustrative) |
| Status badge labels | design (via 09) | Pending / Approved / Rejected / Cancelled |
| Approve / Reject / Cancel buttons | design (via 09) | Approve / Reject / Cancel |
| Empty state — pending filter | **business spec** | "No pending requests." |
| Empty state — other filters | **business spec** | "No {status} requests." |
| Forbidden (API 403 / 403 page) | **business spec** | "You do not have permission to view requests" |
| Reject modal / cancel dialog / toast copy | **business spec + 09 design** | owned at [09](09-vacation-requests.design.md#copy); not restated |

Dates use 09's en-dash `formatDateRange`; money uses 09's `formatCurrency`; the card working-days label is **"{n} working days"** (business wireframe §Request Card), deliberately fuller than 09's row-level "{n} days" — a card-specific microcopy variant, design-owned.

---

## States

| State | Trigger | Rendering |
|---|---|---|
| **Loading** | `GET .../requests` in flight | `requests-loading-skeleton`: two-to-three card-shaped static `--bg-sunken` blocks (no `Skeleton` primitive — carried gap). |
| **Empty · pending filter** | `requests: []`, filter = Pending | `requests-empty-state`, centered, business spec's "No pending requests." |
| **Empty · other filter** | `requests: []`, filter ≠ Pending | `requests-empty-state`, centered, business spec's "No {status} requests." |
| **Populated** | `requests` non-empty | Card stack in **payload order** (server sorts: pending oldest-first, others newest-first — the page does not re-sort, matching 09's ledger discipline). Each card badge + status-gated buttons; rejected cards show the quoted reviewer comment + reviewed-by line. |
| **Filter change** | `Select` `onChange` | Refetch `GET .../requests?status=…`; stack re-renders; loading skeleton may flash between. |
| **After action (in-place)** | approve/reject/cancel `2xx` | Modal/dialog closes, toast fires, page **refetches**; the acted card updates in place (status badge flips, action buttons removed), `pendingCount`/badge update. Never hand-patched. |
| **Action error** | review/cancel `4xx`/`5xx` | 09's error handling — error toast with the API `message`; modal/dialog stays open where applicable. |
| **Forbidden** | `user`/`viewer` navigates to route | Server redirect to `/org/{orgId}/members` (or 403 with the business message); the sidebar row was never shown. |

---

## DS gaps

| Gap | Resolution | Status |
|---|---|---|
| **No initials-avatar primitive in the DS.** The DS ships no `Avatar`; initials circles are hand-built three ways in the app — `AvatarInitials.tsx` (64px, name-hashed `oklch` hue) for member detail, and flat `--accent-soft`/`--accent` inline spans in `MembersTable` (32px) and `Topbar` (38px). | **Reuse `AvatarInitials`** for the card (the name-hashed hue reads richest with many distinct members stacked), at `size≈40`. It currently **hardcodes `data-testid="member-detail-avatar"`**, so it needs a `data-testid` (and it already takes `size`) pass-through to carry `requests-card-avatar-{id}`. A first-class DS `Avatar`/`AvatarInitials` (initials + optional image + size + tint strategy) would consolidate all three call sites and remove the per-screen restyle. | resolved for this screen (reuse app `AvatarInitials` + testid pass-through); DS `Avatar` open, not blocking |
| **Sidebar count badge — visual exists, testid hook missing.** `NavItem` **already** renders a count pill via its `badge` prop (`--accent`/`--on-accent`, `--radius-md`, `--fs-11`) and shows it only when `badge != null`, so "hidden at 0" and the pill styling need **no new component**. But the pill `<span>` takes no id, and `NavItem`'s `...rest` spreads onto the `<a>`, so `sidebar-requests-badge` cannot be attached today. | Use `NavItem`'s `badge` for the pill; extend `NavItem` with a small **`badgeTestId`** (or accept a `badge` ReactNode) pass-through so the pill carries `sidebar-requests-badge`. No token invented, no pill hand-built. A DS `NavItem` that already threads a badge testid is the tidy fix. | resolved for this screen (existing `badge` pill + one-prop pass-through); DS chore open, not blocking |
| **Shell must role-gate the row and source the badge count.** Not a DS-component gap: `Sidebar.tsx` currently hardcodes one Members entry with no role gating, and no shell-level `pendingCount` source exists. | Add the role-gated `Requests` entry to the shell nav array (00 already resolves the session before render, so no flash), and source `pendingCount` via a shell-mount fetch of `GET .../requests` behind the same admin/manager gate (a small `RequestsBadgeContext` beside `session-context`, mirroring 00's spec-12 topbar-timer fetch). App-shell integration, tracked here, owned by the shell not the DS. | resolved for this screen (shell wiring); no DS change |
| **No confirmation-dialog / textarea primitive** (carried from 09). | The reused Reject modal and cancel dialog already resolve these as `Modal` compositions + native `<textarea>`; 10 adds no new instance. | carried from 09; not blocking |
| **`Badge` reuses `active`/`inactive` tones for approved/rejected** (carried from 09). | 10 uses 09's tone map unchanged; the semantic-alias (`success`/`danger`) DS addition stays open. | carried from 09; not blocking |
| **No `Skeleton` primitive** (carried from 05/09). | `requests-loading-skeleton` uses static `--bg-sunken` card-shaped blocks, matching 05/09's `LoadingSkeleton`/`VacationSkeleton`. | carried; not blocking |

Carried forward from specs 00–09, still true: the DS ships no `AppShell`/`Sidebar`/`Topbar`/`PageHeader` (built in `apps/web/src/layout/`, 00's deliberate exception) and `NavItem` cannot host a `next/link` (00's gap — `href` + intercepted `onClick` remain the workaround, and the same interception applies to the Requests row); the DS exports no icon beyond `Eye`/`EyeOff`, so the Requests glyph is added to `apps/web/src/layout/icons.tsx`; `Select`/`Input` still lack a first-class `errorId`; `Modal` still lacks the `<480px` full-screen-drawer breakpoint (governs the reused reject modal); `InfoBanner` still hardcodes its tone triplets as `oklch(...)` literals (the reused toasts are further instances).

---

## Required `data-testid` attributes

| `data-testid` | Element | Origin |
|---|---|---|
| `sidebar-requests-link` | Sidebar Requests `NavItem` | **new (10)** |
| `sidebar-requests-badge` | Sidebar pending-count pill (hidden at 0) | **new (10)** |
| `requests-page` | Page content wrapper | **new (10)** |
| `requests-status-filter` | Status filter `Select` | **new (10)** |
| `requests-card-{id}` | One request card (`Card`) | **new (10)** |
| `requests-card-avatar-{id}` | Card initials avatar | **new (10)** |
| `requests-card-member-name-{id}` | Card member name link | **new (10)** |
| `requests-card-status-{id}` | Card status `Badge` | **new (10)** |
| `requests-card-dates-{id}` | Card date range | **new (10)** |
| `requests-card-days-{id}` | Card working-days line | **new (10)** |
| `requests-card-balance-{id}` | Card available-balance line | **new (10)** |
| `requests-card-deduction-{id}` | Card deduction amount | **new (10)** |
| `requests-card-approve-{id}` | Card Approve button | **new (10)** |
| `requests-card-reject-{id}` | Card Reject button | **new (10)** |
| `requests-card-cancel-{id}` | Card Cancel button | **new (10)** |
| `requests-card-reviewer-comment-{id}` | Card reviewer comment (rejected) | **new (10)** |
| `requests-card-reviewed-by-{id}` | Card "Reviewed by {name}" line | **new (10)** |
| `requests-empty-state` | Empty-state message | **new (10)** |
| `requests-loading-skeleton` | Loading skeleton cards | **new (10)** |
| `vacation-reject-modal`, `vacation-reject-comment-input`, `vacation-reject-confirm-btn`, `vacation-reject-cancel-btn`, `field-error-reviewerComment` | Reused Reject Request modal | reused (09) |
| `vacation-cancel-confirm-dialog`, `vacation-cancel-confirm-btn`, `vacation-cancel-dismiss-btn` | Reused cancel-confirm dialog | reused (09) |
| `toast-request-approved`, `toast-request-rejected`, `toast-request-cancelled` | Action toasts | reused (09) |
| `page-title`, `app-sidebar`, `nav-members` | Shell chrome | reused (00) |

## Reference mockup

No `10-…mock.html` exists and none is required — following 07/08/09's precedent, verify against the running API and UI: exercise `GET .../requests` at each filter (Pending default, Approved, Rejected, Cancelled, All) and confirm sort order (pending oldest-first, others newest-first), card fields (avatar/name-link/dates/working-days/balance/deduction/status badge), the badge count and its hide-at-0, the role redirect for user/viewer, and each in-place action (Approve, Reject-with-comment via the reused modal, Cancel-approved via the reused refund dialog) updating the card and the sidebar badge. `1_DS for dev/templates/meridian-app/MeridianApp.dc.html` remains the token/value reference for the Meridian look and the avatar hue formula.
