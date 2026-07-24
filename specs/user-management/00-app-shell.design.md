---
id: "00"
kind: design
title: App Shell — Design
pairs-with: —
routes: ["/org/{orgId}/*"]
design-system: "1_DS for dev"
tags: [app-shell, sidebar, topbar, page-header, navigation, logout, meridian, light-only]
---

# 00 — App Shell · Design

The frame every **signed-in** screen renders inside. It has no paired business spec: the shell owns no rules of its own, it is the surface specs 04–10 hang their screens on. Where a rule here touches behaviour that a business spec owns — role-gated navigation, session revocation — this file points at that spec rather than restating it.

This is the signed-in counterpart to the "signed-out set" in [02-authentication-login.design.md](02-authentication-login.design.md). The two never mix: `AuthLayout` and the shell never appear on the same screen.

**Design system:** Teammerly Meridian, `1_DS for dev/`. The visual reference is [`templates/meridian-app/MeridianApp.dc.html`](../../1_DS%20for%20dev/templates/meridian-app/MeridianApp.dc.html) — the shell's proportions, nav row states, and page header are read from it directly.

**Theme:** light only, no theme toggle. The template's top bar carries a Light/Dark switch; it does not ship. Same exclusion as the signed-out set.

---

## Frame

```
┌──────────────┬────────────────────────────────────────────┐
│ Teammerly●   │                              Pat Owner (PO)│  ← 68px top bar
├──────────────┼────────────────────────────────────────────┤
│ PEOPLE       │  Members                                   │  ← page header
│  ▣ Members   │  ┌──────────────────────────────────────┐  │
│              │  │                                      │  │
│              │  └──────────────────────────────────────┘  │
└──────────────┴────────────────────────────────────────────┘
   252px            content scrolls; the other two do not
```

| Region | Value | Token / source |
|---|---|---|
| Sidebar width | 252px | Meridian layout constant |
| Sidebar head height | 68px | matches the top bar, so the two rules align |
| Top bar height | 68px | Meridian layout constant |
| Sidebar & top bar background | `--bg-panel-2` | |
| Content background | `--bg` | |
| Separating rules | 1px `--border` | |
| Content padding | `28px 32px 48px` | template page body |

Sidebar and top bar are fixed. Only the content column scrolls.

## Sidebar

- **Wordmark** in the head: `Team` in `--text` + `merly` in `--accent` + a 6px `--tracker` pin, Grotesk 600 / `--fs-21`. There is no logo file; never draw one.
- **Section label** — `SectionLabel` (uppercase Grotesk 11px, 1px tracking, `--text-muted`). Today the only section is `People`.
- **Rows** — `NavItem` from the design system. Active is violet ink on `--accent-soft` with `--accent-border`; hover on any inactive row is the universal `--hover-bg-tint`.
- **Active rule** — a row is active when the current path equals its href or is nested beneath it, so a member detail screen keeps `Members` lit.
- **Only real destinations appear.** The template carries seven groups from the wider Teamplay product (Timesheets, Projects, Reports, Time off, Organization). Shipping them as dead or disabled rows would promise screens no spec defines. Rows arrive with their specs.
- **Role gating** — spec 10 requires the future `Requests` row to be invisible to `user` and `viewer`. The shell resolves the session before it renders, precisely so a gated row never flashes into view and back out.

### Planned rows

| Row | Route | Ships with | Visible to |
|---|---|---|---|
| Members | `/org/{orgId}/members` | now | all roles |
| Requests | `/org/{orgId}/requests` | spec 10 | admin, manager |

## Top bar

Right-aligned, and deliberately thin:

- **Account** — full name in Grotesk 500 / `--fs-14`, then a 38px circular avatar: initials in `--accent` on `--accent-soft`. No photograph; the product carries no imagery.
- **Menu** — click opens a card (`--bg-panel`, 1px `--border`, `--radius-lg`, `--shadow-card`) holding **Log out**. Closes on outside click or `Escape`.
- **Log out** calls `POST /api/logout` and then replaces the history entry with `/login`, so the signed-in URL is not sitting behind the back button.
- **Not shipped:** the tracker chip (`00:00:00`) belongs to Timesheets, which no spec covers, and the theme toggle is excluded by the light-only rule.

> **Logout is not session revocation.** It drops this browser's cookie; the signed token itself stays valid until it expires. Revoking every outstanding session is what `SecurityStamp` rotation does (spec 02 requirement 12) — and it is deliberately not wired to logout, which would otherwise sign the account out of every other device too.

## Page header

Every screen inside the shell opens with one: title in Grotesk 600 / `--fs-27` / -.6px tracking, optional subtitle in `--fs-14` `--text-sub`, optional trailing action button. 22px below it, the screen's own content begins.

The organization name is **not** shown anywhere in the shell. One account belongs to exactly one organization, so the name distinguishes nothing; it was removed from the members screen when the shell landed.

## Loading and access

- While `/api/me` is in flight the shell renders **nothing but a centred `Spinner`** on the paper field. A visitor without a session never glimpses the application frame, and role-gated rows never flash.
- 401 → replace with `/login`.
- An `{orgId}` in the URL that disagrees with the session → `notFound()`. This is cosmetic; the boundary that matters is `OrgScopeGuard` in the API, which answers 404 for the same case. The path parameter is compared against the session and is never used as a query key.

## Responsive

Below **1024px** the sidebar keeps its glyphs and drops its words: 252px → 68px, labels and section labels hidden, wordmark reduced to `T●`, the row's `title` carrying the name to a tooltip. There is no toggle and no stored preference — width alone decides, so the server and the hydrated client always agree.

A mobile-specific drawer (burger + overlay + scrim) is **out of scope for this release**, on the same footing as dark mode: the design system defines no such state, and inventing one per screen is exactly what these specs exist to prevent.

## Selectors

| Selector | Element |
|---|---|
| `app-loading` | the pre-resolution spinner |
| `app-sidebar` | sidebar `<nav>` |
| `nav-members` | Members row (carries `aria-current="page"` when active) |
| `topbar-account-button` | account/avatar trigger |
| `topbar-account-name` | account full name |
| `topbar-account-menu` | the open menu |
| `logout-button` | Log out item |
| `page-title` | page header `<h1>` |

## DS gaps

| Gap | Impact | Resolution |
|---|---|---|
| No `AppShell` / `Sidebar` / `Topbar` / `PageHeader` in the bundle — only `NavItem` | The frame had to be built somewhere | Built in `apps/web/src/layout/`, **not** in the design system. A deliberate exception to the "DS gaps go into the DS" rule: the frame is bound to Next.js routing and to role rules, which the DS has no business knowing. The presentational values it uses are all tokens. |
| `NavItem` renders its own `<a>` and takes no `as`/`component` prop | It cannot host a `next/link`, so the app passes `href` for link semantics and intercepts `onClick` for client-side navigation | A `component` prop belongs in the DS |
| No icon export beyond `Eye`/`EyeOff`; glyphs live as raw paths inside the template's `P` dictionary | The People glyph is copied into `apps/web/src/layout/icons.tsx` | Promoting the `P` dictionary to real icon exports is the design-system chore this raises |
