---
id: "00"
kind: design
title: App Shell — Design
pairs-with: —
routes: ["/org/{orgId}/*"]
design-system: "@devscribed/ds"
tags: [app-shell, sidebar, navbar, page-header, navigation, logout, teammerly, light-only]
---

# 00 — App Shell · Design

The frame every **signed-in** screen renders inside. It has no paired business spec: the shell owns no rules of its own, it is the surface specs 04–10 hang their screens on. Where a rule here touches behaviour that a business spec owns — role-gated navigation, session revocation — this file points at that spec rather than restating it.

This is the signed-in counterpart to the "signed-out set" in [02-authentication-login.design.md](02-authentication-login.design.md). The two never mix: `AuthLayout` and the shell never appear on the same screen.

**Design system:** [`packages/ds`](../../packages/ds/README.md). The frame is `AppShell` +
`Sidebar` + `Navbar` — not a template to copy from but the components themselves, so the shell's
proportions are read from the system rather than from a mock. The numbered decisions behind it are
in [`decisions.md`](../design-system/decisions.md), cited here as `§n`.

**Theme:** light only, no theme toggle. The system has no dark palette and the app has no toggle, so the state does not exist. Same exclusion as the signed-out set.

---

## Frame

```
┌──────────────────┬──────────────────────────────────────┐
│ Teammerly✓       │                     Pat Owner (◕) ▾  │  ← 80px navbar
├──────────────────┼──────────────────────────────────────┤
│  ▣ People     ▾  │  Members                             │  ← page header
│  │ Members       │  ┌────────────────────────────────┐  │
│  ▣ Hiring     ▴  │  │                                │  │
│                  │  └────────────────────────────────┘  │
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

> **This is a deliberate relayout.** The frame is 290px beside 80px, switching at 1200px, over a cool `--surface-well`. The design system is the source of truth for layout as much as for colour, so where it has an answer it wins even when elements move.

## Sidebar

- **Wordmark** in the head: the system's own SVG, linking to the members list the way a wordmark links to a start page. There is no typographic wordmark any more and no `--fs-21` — that token was never defined in the old system either, so the wordmark silently inherited its size for as long as it existed.
- **Groups** — the system's `SubMenu` title: 16px medium type, a 12px gap to the glyph, a chevron pushed to the right edge, `--text-secondary` going `--color-blue` on hover and while the group is current, 36px between groups. There is no uppercase caption above them; the system captions nothing, and the section labels the old shell drew are gone with it.
- **Rows** — the system's `SubItem`, indented 8px behind a 1px rule in `--text-secondary`: 14px medium, 4px/12px padding, 16px apart, `--color-blue-tint` behind the current one. A sub-item draws **no glyph** — the system puts the icon on the parent title alone.
- **Two levels, not one.** Every destination sits inside a titled group, which reverses what the rail shipped with: four unparented links, on the argument that one level deep needs no second one. That held while hiring was three rows out of four, and it is not what the system does with the same content — `People → Members` is a submenu in the system's default nav, and hiring is a section of the same size beside it. Four flat rows read as four unrelated screens; two titled groups say which of them belong together, which is the fact a reader needs before they need a route.
- **A title is a toggle, not a destination.** `People` and `Hiring` are real `<button aria-expanded>` controls that open and close their group and go nowhere. `Hiring` has no screen behind it — there is no hiring landing page and no reason to invent one — so making the title a link would have promised a route that does not exist.
- **Active rule** — a row is active when the current path equals its `href` or is nested beneath it, so a candidate card keeps `Candidates` lit. The row carries `aria-current="page"`. A **group** is current when one of its rows is, and a group that becomes current opens itself — otherwise arriving at a candidate card by deep link would leave its own section shut. Only that group is open: from Members, hiring is one toggle away.
- **Rows are real links.** Each renders an `<a href>` so middle-click, copy-address and open-in-new-tab all work; an unmodified click is handed to the client router.
- **Only real destinations appear.** `Sidebar` ships a default set of groups, and they are a default rather than a fixture: the navigation is content, not design language ([§13](../design-system/decisions.md)), and shipping a group as a dead or disabled row would promise a screen no spec defines. This product draws `People` and `Hiring`. Rows arrive with their specs.
- **An empty group is not drawn.** A member with no hiring row at all — a `viewer`, or a `user` assigned nothing — gets no `Hiring` title. A titled group announces that it has contents; one that opens onto nothing is worse than an absent section, because it reads as a permission error rather than as a product they are not part of.
- **Glyphs are hiring's own**, drawn in the system's icon language — geometric, filled, `currentColor`, no icon font. Same split as the nav items. `Hiring` reuses `PeopleIcon`, the mark `People` already draws: the icon set has no hiring glyph, the design asks for one, and reusing an existing mark leaves that gap visible where inventing one would hide it in the one place nobody would look.
- **Role gating** — spec 10 requires the future `Requests` row to be invisible to `user` and `viewer`. The shell resolves the session before it renders, precisely so a gated row never flashes into view and back out.

### Rows

| Group | Row | Route | Ships with | Visible to |
|---|---|---|---|---|
| People | Members | `/org/{orgId}/members` | now | all roles |
| Hiring | Vacancies | `/org/{orgId}/hiring/vacancies` | hiring 01 | admin, manager |
| Hiring | Candidates | `/org/{orgId}/hiring/candidates` | hiring 03 | admin, manager, **anyone assigned an interview** |
| Hiring | Libraries | `/org/{orgId}/hiring/settings` | hiring 06 | admin, manager |
| People | Requests | `/org/{orgId}/requests` | spec 10 | admin, manager |

Candidates is the only row gated on assignment as well as role (hiring 03 §06.31) — which is what lets an engineer interview without becoming an org admin. They open the same screen a manager does, resolved to its `Assigned to me` scope; a second row for the same list would have been the rail claiming a difference the screen does not have. A member with neither role nor assignment sees Members alone, under People, with no Hiring group beside it.

**Libraries, on the route `/hiring/settings`.** The row was `Settings` and the path is unchanged. Nothing on that screen is a setting — it is two lists and the maintenance of them (hiring 06) — so the name says what it is, and the URL stays where readers have already bookmarked it. A route rename would have bought nothing and broken every link anybody kept.

There is no **My interviews** row. Its screen is that scope now, and `/org/{orgId}/hiring/my-interviews` redirects to `…/hiring/candidates?scope=mine`.

## Navbar

The system's `Navbar` without its mini tracker, so what is left is right-aligned and deliberately thin:

- **Account** — full name in 14px medium, then the system's `UserIcon` avatar and a chevron. No initials and no photograph: the system draws a generic person glyph, and the product carries no imagery.
- **Menu** — click opens the system's popover (`--shadow-popover`, 6px radius) holding **Log out**. Closes on outside click or `Escape`, which returns focus to the trigger.
- **Log out** calls `POST /api/logout` and then replaces the history entry with `/login`, so the signed-in URL is not sitting behind the back button.
- **Hamburger** — below the breakpoint only, at the left edge. It opens the navigation drawer.
- **Not shipped:** the tracker chip (`00:00:00`) belongs to Timesheets, which no spec covers.

> **Logout is not session revocation.** It drops this browser's cookie; the signed token itself stays valid until it expires. Revoking every outstanding session is what `SecurityStamp` rotation does (spec 02 requirement 12) — and it is deliberately not wired to logout, which would otherwise sign the account out of every other device too.

## Page header

Every screen inside the shell opens with one. The heading is the system's `PageTitle`, whose type steps with the viewport — 16/24 at 500, 20/30 at 450 from 768px, 24/36 at 450 from 1200px — with an optional 14px `--text-tertiary` subtitle and an optional trailing action button. 20px below it, the screen's own content begins.

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

**Width alone decides.** The switch is a media query in the design system's `base.css`, not a `matchMedia` read — so the server and the hydrated client agree at every size, with no stored preference and nothing to flash. That constraint is why the rule lives in a stylesheet at all: a media query cannot be an inline style, which is the same reason the system's `PageTitle` reaches for a class.

**Focus follows the drawer.** It sits before the navbar in document order, so a reader who opened it with the hamburger would otherwise Tab straight past the navigation they just asked for. Focus moves in when it opens and returns to the opener when it closes.

## Selectors

| Selector | Element |
|---|---|
| `app-loading` | the pre-resolution preloader |
| `app-sidebar` | sidebar `<aside>` |
| `nav-members` | Members row (carries `aria-current="page"` when active) |
| `nav-vacancies` · `nav-candidates` · `nav-hiring-settings` | the hiring rows — the last of them is Libraries, keeping the id its route kept |
| `topbar-account-button` | account/avatar trigger |
| `topbar-account-name` | account full name |
| `topbar-account-menu` | the open menu |
| `logout-button` | Log out item |
| `page-title` | page header `<h1>` |
| `members-list` | the members table |
| `member-row-{id}` · `member-name` · `member-role` | a member row and its cells |

The hamburger, the drawer's close button and the two group titles are reached by their accessible names — `Open navigation`, `Close sidebar`, `People`, `Hiring` — rather than by a test id, because those names are what a reader has to navigate by and a test id would not prove they exist. A group title is the one navigation control with no `data-testid` for exactly that reason: it is a `<button>` whose whole job is its label and its `aria-expanded`.

## DS gaps

Every row here is a numbered entry in [decisions](../design-system/decisions.md), and most are the accessibility floor rather than a change of design — the forwarding, the roles and the keyboard a component owes whatever else it does.

| Gap | Impact | Ledger |
|---|---|---|
| `Sidebar` carried a fixed set of groups and no items API | The frame could not carry hiring's navigation at all | [§13](../design-system/decisions.md) |
| Its rows take no `href`, no `testId` and no external `active`; the submenu title is a bare `<li onClick>`; an open submenu never re-syncs with the route | No routing, no test hooks, no keyboard on a submenu | [§13](../design-system/decisions.md) |
| `AppShell` renders the rail unconditionally and never wires the 1200px breakpoint | Every value the switch needs is a token; only the switch was missing | [§14](../design-system/decisions.md) |
| `Navbar` draws `MiniTracker` unconditionally and pins 80px inline | A product with no timesheets has no counter, and 60px cannot be an inline style | [§15](../design-system/decisions.md) |
| `AccountMenu` is a `<div onClick>` wrapping its own popover | Not openable from a keyboard, not announced, no `Escape`, and it re-toggles when an item is clicked | [§16](../design-system/decisions.md) |
| `PageTitle` takes a string and forwards nothing | A heading that tags a name inside it needs children; the `<h1>` needs to be reachable | [§17](../design-system/decisions.md) |
| `Table` takes `string[]` columns and `ReactNode[][]` rows | No per-row test id, no records, and a pointer cursor on rows that go nowhere | [§18](../design-system/decisions.md) |
| No general content surface in the library — the nearest thing was a fixed-width clickable tile with no `children` | 34 call sites across 12 files, and nothing to round an edge-to-edge table's corners | [§12](../design-system/decisions.md) |

One gap here carries **no number**, and the reason is the rule the decisions record states: a number is assigned when code lands, and nothing lands for a glyph that is not drawn. The icon set has no `Hiring` mark, the section reuses `PeopleIcon`, and the design system is untouched — so there is nothing to number, only a want. It is recorded where the want is: in the rail's own comment, and in the design's list of what it had to hand-build.

The other gap that is **not** filled in the design system is the frame's binding to Next.js: `apps/web/src/layout/` holds `AppShell`, `Sidebar`, `Topbar` and `PageHeader` as thin adapters that supply the session, hiring's nav items and the router, and nothing else. That is the same deliberate exception the shell has always carried — routing and role rules are not the design system's business — but it is now four adapters over the system's components rather than a frame built from scratch beside them.
