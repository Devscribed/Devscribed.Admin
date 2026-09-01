---
id: "00"
kind: design
title: App Shell — Design
pairs-with: —
routes: ["/org/{orgId}/*"]
design-system: "1_DS for dev"
tags: [app-shell, sidebar, navbar, page-header, navigation, logout, teammerly, light-only]
---

# 00 — App Shell · Design

The frame every **signed-in** screen renders inside. It has no paired business spec: the shell owns no rules of its own, it is the surface specs 04–10 hang their screens on. Where a rule here touches behaviour that a business spec owns — role-gated navigation, session revocation — this file points at that spec rather than restating it.

This is the signed-in counterpart to the "signed-out set" in [02-authentication-login.design.md](02-authentication-login.design.md). The two never mix: `AuthLayout` and the shell never appear on the same screen.

**Design system:** Teammerly Original DS, `1_DS for dev/`. The frame is `AppShell` + `Sidebar` + `Navbar`, which are not a template to copy from but the components themselves — the shell is a measurement of the shipping product, so its proportions are read from the product rather than from a mock. The decisions behind that are in [`specs/design-system/README.md`](../design-system/README.md); divergences from the vendored copy carry numbers in the [ledger](../design-system/ledger.md).

**Theme:** light only, no theme toggle. Blue has no dark palette and the app has no toggle, so the state does not exist. Same exclusion as the signed-out set.

---

## Frame

```
┌──────────────────┬──────────────────────────────────────┐
│ Teammerly✓       │                     Pat Owner (◕) ▾  │  ← 80px navbar
├──────────────────┼──────────────────────────────────────┤
│  ▣ Members       │  Members                             │  ← page header
│  ▤ Vacancies     │  ┌────────────────────────────────┐  │
│  ▥ Candidates    │  │                                │  │
│  ⚙ Settings      │  └────────────────────────────────┘  │
└──────────────────┴──────────────────────────────────────┘
       290px            content scrolls; the other two do not
```

| Region | Value | Token / source |
|---|---|---|
| Sidebar width | 290px | `--layout-sidebar-width` |
| Sidebar head height | 80px | matches the navbar, so the two rules align |
| Navbar height | 80px desktop / 60px below the breakpoint | `--layout-navbar-height-desktop` / `-mobile` |
| Breakpoint | 1200px | `--layout-breakpoint-desktop` |
| Sidebar & navbar background | `--surface-card` (white) | |
| Content well | `#f8fafc`, 25px padding | set by `AppShell`, not by any screen |
| Separating rules | 1px `--border-subtle` | |

Sidebar and navbar are fixed. Only the content column scrolls, and the well is the one place page padding and the page background are set — a screen renders straight into it and owns nothing outside its own content.

> **This is the migration's one deliberate relayout.** 252→290px, 68→80px, 1024→1200px, and a warm `#F7F3EC` well for a cool `#f8fafc` one. Blue is the source of truth including layout ([§D1](../design-system/README.md)), so where it has an answer it wins even when elements move.

## Sidebar

- **Wordmark** in the head: blue's own SVG, the mark the shipping app draws, linking to the members list the way prod's links to its start page. There is no typographic wordmark any more and no `--fs-21` — that token was never defined in the old system either, so the wordmark silently inherited its size for as long as it existed.
- **Rows** — blue's `TopLink`: 16px medium type, a 12px gap to the glyph, `--text-secondary` going `--color-blue` on hover and while active, 36px between rows. There is no uppercase caption above them; blue captions nothing, and the section labels the old shell drew are gone with it.
- **One level, not two.** Blue's `Sidebar` has a second form — a collapsible title with sub-items indented under a rule — and hiring does not use it. Every hiring destination is one level deep, and the link form is the one that keeps its own glyph, because a submenu draws an icon on the parent only. A section deep enough to need one is what the `submenu` form is there for.
- **Active rule** — a row is active when the current path equals its `href` or is nested beneath it, so a candidate card keeps `Candidates` lit. The row carries `aria-current="page"`.
- **Rows are real links.** Each renders an `<a href>` so middle-click, copy-address and open-in-new-tab all work; an unmodified click is handed to the client router.
- **Only real destinations appear.** Blue carries seven groups from the wider Teamplay product (Timesheets, Projects, Reports, Time off, Organization). Those are production *content*, not design language ([§D6](../design-system/README.md)); shipping them as dead or disabled rows would promise screens no spec defines. Rows arrive with their specs.
- **Glyphs are hiring's own**, drawn in blue's icon language — geometric, filled, `currentColor`, no icon font. Same split as the nav items.
- **Role gating** — spec 10 requires the future `Requests` row to be invisible to `user` and `viewer`. The shell resolves the session before it renders, precisely so a gated row never flashes into view and back out.

### Rows

| Row | Route | Ships with | Visible to |
|---|---|---|---|
| Members | `/org/{orgId}/members` | now | all roles |
| Vacancies | `/org/{orgId}/hiring/vacancies` | hiring 01 | admin, manager |
| Candidates | `/org/{orgId}/hiring/candidates` | hiring 03 | admin, manager, **anyone assigned an interview** |
| Settings | `/org/{orgId}/hiring/settings` | hiring 06 | admin, manager |
| Requests | `/org/{orgId}/requests` | spec 10 | admin, manager |

Candidates is the only row gated on assignment as well as role (hiring 03 §06.31) — which is what lets an engineer interview without becoming an org admin. They open the same screen a manager does, resolved to its `Assigned to me` scope; a second row for the same list would have been the rail claiming a difference the screen does not have. A member with neither role nor assignment sees Members alone.

There is no **My interviews** row. Its screen is that scope now, and `/org/{orgId}/hiring/my-interviews` redirects to `…/hiring/candidates?scope=mine`.

## Navbar

Blue's `Navbar` without its mini tracker, so what is left is right-aligned and deliberately thin:

- **Account** — full name in 14px medium, then blue's `UserIcon` avatar and a chevron. No initials and no photograph: prod draws a generic person glyph, and the product carries no imagery.
- **Menu** — click opens blue's popover (`--shadow-popover`, 6px radius) holding **Log out**. Closes on outside click or `Escape`, which returns focus to the trigger.
- **Log out** calls `POST /api/logout` and then replaces the history entry with `/login`, so the signed-in URL is not sitting behind the back button.
- **Hamburger** — below the breakpoint only, at the left edge. It opens the navigation drawer.
- **Not shipped:** the tracker chip (`00:00:00`) belongs to Timesheets, which no spec covers.

> **Logout is not session revocation.** It drops this browser's cookie; the signed token itself stays valid until it expires. Revoking every outstanding session is what `SecurityStamp` rotation does (spec 02 requirement 12) — and it is deliberately not wired to logout, which would otherwise sign the account out of every other device too.

## Page header

Every screen inside the shell opens with one. The heading is blue's `PageTitle`, whose type steps with the viewport — 16/24 at 500, 20/30 at 450 from 768px, 24/36 at 450 from 1200px — with an optional 14px `--text-tertiary` subtitle and an optional trailing action button. 20px below it, the screen's own content begins.

The organization name is **not** shown anywhere in the shell. One account belongs to exactly one organization, so the name distinguishes nothing; it was removed from the members screen when the shell landed.

## Members

The one screen this spec owns outright, and the shell's landing destination. A `Card` with `padded={false}` holding a `Table`: Name, Email, Role, Status. The table is edge-to-edge and draws no frame of its own, so the card is what gives it a border and what rounds its first and last rows — `clip`, left at its default.

Rows go nowhere. The member detail screen is spec 04, so the table is told of no destination and its rows keep the default cursor rather than promising one.

## Loading and access

- While `/api/me` is in flight the shell renders **nothing but a centred `Preloader`** on the page field. A visitor without a session never glimpses the application frame, and role-gated rows never flash.
- 401 → replace with `/login?next=…`, so signing in returns the visitor to where they were headed.
- An `{orgId}` in the URL that disagrees with the session → `notFound()`. This is cosmetic; the boundary that matters is `OrgScopeGuard` in the API, which answers 404 for the same case. The path parameter is compared against the session and is never used as a query key.

## Responsive

Below **1200px** the rail leaves the flow and becomes a drawer: a 340px panel against the right edge, under the now-60px navbar, with `--shadow-drawer` and a 0.3s slide. A hamburger in the navbar opens it; the close button in the sidebar head — which the shipping app draws and then hides — closes it, as does the scrim, as does `Escape`. Arriving at a new screen closes it too, since the drawer is covering the screen it just navigated to.

**The drawer is the rail, not a copy of it.** One node holds the navigation at every width; below the breakpoint it changes position, width and shadow. A second copy inside a real `MenuDrawer` would put two of every nav row in the document, and with them two of every `data-testid` and two of every `aria-current`.

**Width alone decides.** The switch is a media query in the design system's `base.css`, not a `matchMedia` read — so the server and the hydrated client agree at every size, with no stored preference and nothing to flash. That constraint is why the rule lives in a stylesheet at all: a media query cannot be an inline style, which is the same reason blue's `PageTitle` reaches for a class.

**Focus follows the drawer.** It sits before the navbar in document order, so a reader who opened it with the hamburger would otherwise Tab straight past the navigation they just asked for. Focus moves in when it opens and returns to the opener when it closes.

## Selectors

| Selector | Element |
|---|---|
| `app-loading` | the pre-resolution preloader |
| `app-sidebar` | sidebar `<aside>` |
| `nav-members` | Members row (carries `aria-current="page"` when active) |
| `nav-vacancies` · `nav-candidates` · `nav-hiring-settings` | the hiring rows |
| `topbar-account-button` | account/avatar trigger |
| `topbar-account-name` | account full name |
| `topbar-account-menu` | the open menu |
| `logout-button` | Log out item |
| `page-title` | page header `<h1>` |
| `members-list` | the members table |
| `member-row-{id}` · `member-name` · `member-role` | a member row and its cells |

The hamburger and the drawer's close button are reached by their accessible names — `Open navigation` and `Close sidebar` — rather than by a test id, because those names are what a reader has to navigate by and a test id would not prove they exist.

## DS gaps

Every row here is a numbered entry in the [ledger](../design-system/ledger.md), and each is an omission rather than a decision: blue is a measurement of production, and production never had to answer these ([§D2](../design-system/README.md)).

| Gap | Impact | Ledger |
|---|---|---|
| `Sidebar` hardcodes Teamplay's seven groups and has no items API | The frame could not carry hiring's navigation at all | [§13](../design-system/ledger.md) |
| Its rows take no `href`, no `testId` and no external `active`; the submenu title is a bare `<li onClick>`; an open submenu never re-syncs with the route | No routing, no test hooks, no keyboard on a submenu | [§13](../design-system/ledger.md) |
| `AppShell` renders the rail unconditionally and never wires the 1200px breakpoint | Every value the switch needs is a token; only the switch was missing | [§14](../design-system/ledger.md) |
| `Navbar` draws `MiniTracker` unconditionally and pins 80px inline | A product with no timesheets has no counter, and 60px cannot be an inline style | [§15](../design-system/ledger.md) |
| `AccountMenu` is a `<div onClick>` wrapping its own popover | Not openable from a keyboard, not announced, no `Escape`, and it re-toggles when an item is clicked | [§16](../design-system/ledger.md) |
| `PageTitle` takes a string and forwards nothing | A heading that tags a name inside it needs children; the `<h1>` needs to be reachable | [§17](../design-system/ledger.md) |
| `Table` takes `string[]` columns and `ReactNode[][]` rows | No per-row test id, no records, and a pointer cursor on rows that go nowhere | [§18](../design-system/ledger.md) |
| No `Card` in the library — `NavigationCard` is a 250px clickable tile with no `children` | 34 call sites across 12 files, and nothing to round an edge-to-edge table's corners | [§12](../design-system/ledger.md) |

The one gap that is **not** filled in the design system is the frame's binding to Next.js: `apps/web/src/layout/` holds `AppShell`, `Sidebar`, `Topbar` and `PageHeader` as thin adapters that supply the session, hiring's nav items and the router, and nothing else. That is the same deliberate exception the shell has always carried — routing and role rules are not the design system's business — but it is now four adapters over blue's components rather than a frame built from scratch beside them.
