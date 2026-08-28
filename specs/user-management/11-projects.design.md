---
id: "11"
kind: design
title: Projects — Design
pairs-with: 11-projects.md
routes: ["/org/{orgId}/projects", "/org/{orgId}/projects/{projectId}"]
design-system: "1_DS for dev"
tags: [projects-page, project-detail, sidebar, projects-section, status-filter, avatar-stack, archive, restore, member-assignment, table, modal, meridian, light-only]
---

# 11 — Projects · Design

Visual and interaction specification for the **Projects** surface: a role-gated **list** of an organization's projects (`/org/{orgId}/projects`) and a per-project **detail** page (`/org/{orgId}/projects/{projectId}`) where an `admin`/`manager` renames a project, manages its member roster, and archives or restores it. It also adds a new **PROJECTS** sidebar section carrying the **Projects** nav row. Pairs with [11-projects.md](11-projects.md), which owns every API contract, the permission matrix, the validation and toast **messages**, the archive-confirmation string, the empty-state sentence, and the full `data-testid` roster. This file owns the visual and interaction detail only — headings, subtitles, placeholders, micro-labels, layout, DS component mapping, states, and responsive behaviour. Neither restates the other.

**This is a delta on [00-app-shell.design.md](00-app-shell.design.md).** Both pages render inside the existing shell (sidebar, top bar, page header); this spec adds a **new `SectionLabel` ("PROJECTS")** and one role-gated `NavItem` ("Projects") to the shell's nav list and never redraws the frame. 00 already anticipates this: its [Planned rows](00-app-shell.design.md#planned-rows) table lists `PROJECTS → Projects → /org/{orgId}/projects`, shipping with spec 11, visible to admin/manager.

**Visual acceptance target:** [11-projects.mock.html](11-projects.mock.html) — a static, token-only render of all six desktop states (list · active filter, list · archived filter, empty, detail, New Project modal, duplicate-name error) plus the Add Members modal and three mobile states (card list, detail, drawer + centered modals). Every value below is read from that mockup and expressed as a Meridian token or DS component.

**Theme:** light only, no theme toggle. **Tokens:** every value referenced already exists in `1_DS for dev/tokens/*.css`; no hex, no px is written by hand.

---

## What this surface owns vs. the business spec

| Business spec (11-projects.md) owns | This design owns |
|---|---|
| `GET/POST/PUT/PATCH/DELETE` contracts, `status` filter enum, `memberCount`/`totalHours` fields, sort order | Table columns, card layout, avatar-stack presentation, muted-row treatment |
| Validation rules and **all** fixed strings (errors, toasts, archive-confirm, empty-state) | Page titles, subtitles, filter labels, placeholders, column headers, section labels, button labels, member-count microcopy |
| Permission matrix, role gating, redirect on forbidden | How the gated `NavItem` and the two pages read that gate visually |
| `data-testid` roster | Which DS element each `data-testid` lands on |

The project lifecycle, uniqueness rule, cascade behaviour, and money-is-admin/manager rules are all the business spec's and unchanged. This is a **presentation** onto that data.

---

## Sidebar integration

The **PROJECTS** section conforms to 00's sidebar rules ([Sidebar](00-app-shell.design.md#sidebar)). It is a DS `SectionLabel` (`1_DS for dev/components/typography/SectionLabel.jsx` — uppercase Grotesk `--fs-11`, 1px tracking, `--text-faint`) followed by one DS `NavItem` (`1_DS for dev/components/navigation/NavItem.jsx`), appended **after** the existing `PEOPLE → Members` group in the shell's `apps/web/src/layout/Sidebar.tsx` nav list. It renders **above** the `TIME → Time Tracking` row that spec 12 will add (People / Projects / Time, top to bottom — matching the mockup's nav order).

- **Route / href:** `/org/{orgId}/projects`; label **"Projects"**; `data-testid="nav-projects"`; icon a new folder/tray glyph added to `apps/web/src/layout/icons.tsx` (the DS ships no icon export beyond `Eye`/`EyeOff` — 00's carried icon gap). The mockup uses a filled folder-with-tab path at 20px.
- **Active rule.** Active when the current path equals its href **or is nested beneath it** — so the project **detail** route `/org/{orgId}/projects/{projectId}` keeps the Projects row lit (00's active-when-nested rule). Active paints `--accent` ink on `--accent-soft` with `--accent-border`; inactive hover is the universal `--hover-bg-tint`.
- **Role gating.** Visible to `admin`/`manager` only, invisible to `user`/`viewer`. The shell resolves the session **before** it renders (00's "role-gated rows never flash" rule), so the `NavItem` — and its `SectionLabel` — are simply omitted from the nav array when the role lacks `ManageProjects`, never rendered-then-hidden. TC-11-E2E-03 asserts the Projects row **absent** for `user`, and a direct navigation to the route is redirected/forbidden.
- **No badge.** Unlike spec 10's Requests row, the Projects row carries no count pill (`NavItem`'s `badge` prop is left unset).

---

## Projects list page

### Page anatomy

```
  ┌──────────────┬────────────────────────────────────────────┐
  │ Teammerly●   │                              Pat Owner (PO) │  ← 00 top bar
  ├──────────────┼────────────────────────────────────────────┤
  │ PEOPLE       │  Projects              [ + New project ]    │  ← 00 page header
  │  ▣ Members   │  Manage projects and assign members…        │     + trailing action
  │ PROJECTS     │                                             │
  │  ▣ Projects  │  [ Active ▾ ]                               │  ← Select filter
  │ TIME         │  ┌────────────────────────────────────────┐ │
  │  ▣ Time      │  │ NAME       MEMBERS    HOURS  STATUS  ⋯ │ │  ← Table
  │              │  │ Project…  (●●●) 3     142.5h ●Active ✎ │ │
  │              │  │ Project…  (●●) 2       87.0h ●Active ✎ │ │
  │              │  └────────────────────────────────────────┘ │
  └──────────────┴────────────────────────────────────────────┘
```

- **Route / access.** `/org/{orgId}/projects`, rendered inside the shell. The route's server component checks the session role and, lacking `ManageProjects`, redirects to `/org/{orgId}/members` (the same "resolve-then-route" discipline 00 uses); the API's own `403`/`404` (messages owned by the business spec) is the real boundary. The page content wrapper carries `data-testid="projects-page"`.
- **Page header.** 00's page header. Title **"Projects"** (`data-testid="projects-page-title"`, Grotesk 600 / `--fs-27` / -.6px tracking). Subtitle (design-owned): **"Manage projects and assign members. Assignment controls who can log time."** — shown on the populated list; the mockup drops it on the archived and empty states, and the design follows that (subtitle is optional per 00's page header). Trailing action: a DS `Button` `variant="primary"`, label **"+ New project"**, `data-testid="projects-new-btn"`, opening the [Create Project modal](#createedit-project-modal).
- **Status filter.** A DS `Select` (`1_DS for dev/components/forms/Select.jsx`), `data-testid="projects-status-filter"` (spread through `...rest` onto the trigger button), sitting in a toolbar row below the header. Options **Active** (default) / **Archived** / **All**; changing it re-fetches `GET .../projects?status=…` and re-renders the table (business spec §API). The trigger reads its selected value ("Active"); the `Select`'s existing `max-height: 280px` popover (spec 07's fix) is inherited but irrelevant for three short options.
- **Table.** Below the filter — see [Project table](#project-table).

### Project table

A DS `Table` (`1_DS for dev/components/data/Table.jsx`), `data-testid="projects-table"`, one row per project keyed `data-testid="projects-row-{id}"` (via the row's `testId` field). `onRowClick` navigates to `/org/{orgId}/projects/{projectId}`. Rows are server-sorted by name ascending; the page does not re-sort. Column geometry is read from the mockup's flex ratios.

| Column | Header copy (design) | Content | DS component / token | Align |
|---|---|---|---|---|
| Name | **Name** | `{name}` | `Table` cell, `--font-display` 500 `--fs-15` `--text` | flex 2, start |
| Members | **Members** | avatar stack (max shown, overlapping) + count label | app `AvatarStack` (see [DS gaps](#ds-gaps)) + `--fs-13` `--text-sub` count | flex 1.3, start |
| Hours | **Hours logged** | `{totalHours} h` (one decimal) | `Table` cell `mono`, `--font-display` 600 `--fs-14` | flex 1, end |
| Status | **Status** | Active / Archived pill | DS `Badge` (tones below) | flex .9, start |
| Actions | (no header text / "Actions") | row action control | DS `IconButton` or `Button` (below) | fixed ~80px, end |

- **Column header copy** is design-owned: the business spec §UI calls the third column "Hours"; the header label shipped is the mockup's fuller **"Hours logged"**.
- **Member cell.** The **avatar stack** shows overlapping 26px initials circles (`--accent-soft` fill, `--accent` ink, 2px `--bg-panel` ring, -6px overlap) followed by the count microcopy **"{n} members"** (singular **"1 member"**). Initials are the member's first+last initial. This is a new presentation — see [DS gaps](#ds-gaps).
- **Status badge.** Active → DS `Badge tone="active"` (green tint + dot), label **"Active"**. Archived → DS `Badge tone="inactive"` (grey tint + dot), label **"Archived"**. Both carry the 6px dot **and** the text, so status is never colour-only (accessibility).
- **Actions column.**
  - *Active rows:* a DS `IconButton` (pencil glyph, `label="Rename project"`) opening the [Edit Project modal](#createedit-project-modal) in edit mode. It stops row-click propagation so editing does not also navigate.
  - *Archived rows:* a DS `Button` `variant="secondary"` `size="sm"`, label **"Restore"**, firing `PATCH .../restore` inline (business spec Alt Flow C), toast `toast-project-restored`, then refetch.
- **Archived-row treatment.** On the Archived (or All) filter, archived rows render **muted** via `Table`'s per-row `dim` flag (the mockup uses `opacity: .75`) — no hand-rolled dimming. The whole row stays clickable to the detail page.

### List states

- **Empty (`data-testid="projects-empty-state"`).** Shown when the Active filter returns no projects. A centered panel (`--bg-panel`, 1px `--border`, `--radius-2xl`): a 64px `--accent-soft` rounded tile holding the folder glyph, the title **"No projects yet"** (Grotesk 600 `--fs-18`), the business spec's verbatim empty-state sentence **"No projects yet. Create your first project to start tracking time."** rendered as the supporting line (the mockup expands it with the design-owned tail "You can assign members to control who can log hours against it." — the **business spec string is authoritative**; the fuller mockup copy is the design's optional elaboration), and a primary **"+ New project"** button. The page header keeps its title but drops the subtitle.
- **Loading (`data-testid="projects-loading-skeleton"`).** Static `--bg-sunken` blocks matching the table chrome — a header bar plus N row-shaped bars (an avatar circle, a name bar, a count bar, an hours bar, a pill bar). No animation: the DS ships no `Skeleton` primitive (carried gap from 04/05/09).
- **Default / populated.** The table as described. Filter change refetches and may flash the skeleton between renders.

---

## Project detail page

### Anatomy

```
  ┌──────────────┬────────────────────────────────────────────┐
  │  PROJECTS    │  ← Back to projects                         │
  │  ▣ Projects  │  ┌────────────────────────────────────────┐ │
  │              │  │ Project Alpha   ●Active   ✎             │ │  ← title + badge + pencil
  │              │  │                                        │ │
  │              │  │ Members (3)            [ + Add member ] │ │
  │              │  │ ┌────────────────────────────────────┐ │ │
  │              │  │ │ (AK) Alex Kaminski   [user] [Remove]│ │ │
  │              │  │ │ (JS) Jane Smith    [manager][Remove]│ │ │
  │              │  │ └────────────────────────────────────┘ │ │
  │              │  │ Statistics                             │ │
  │              │  │ [ Total 142.5 · This month 42.0 · … ]  │ │
  │              │  │ ──────────────────────  [ Archive ]    │ │
  │              │  └────────────────────────────────────────┘ │
  └──────────────┴────────────────────────────────────────────┘
```

- **Route / access.** `/org/{orgId}/projects/{projectId}`, same role gate and redirect as the list. Wrapper `data-testid="project-detail-page"`. A cross-org or missing id resolves to the business spec's `404` (byte-for-byte with "does not exist").
- **Back link.** Above the detail card, a `back-link` (`--accent` ink, Grotesk 500 `--fs-14`, leading `←`), copy **"← Back to projects"**, `data-testid="project-back-link"`, navigating to `/org/{orgId}/projects`.
- **Detail card.** A single DS `Card` (14px radius, 1px `--border`, warm `--shadow-card`) holding the whole page body.
- **Title row.** The project name (`data-testid="project-detail-name"`, Grotesk 600 `--fs-22`), the status `Badge` beside it (`data-testid="project-status-badge"`, `tone="active"`/`"inactive"` as on the list), then a DS `IconButton` (pencil, `label="Rename project"`, `data-testid="project-edit-name-btn"`) opening the [Edit Project modal](#createedit-project-modal).
- **Members section.** A section header **"Members ({n})"** (Grotesk 600 `--fs-16`) with a trailing DS `Button` `variant="secondary"` `size="sm"`, label **"+ Add member"**, `data-testid="project-add-member-btn"`, opening the [Add Members modal](#add-members-modal). Below it the roster (`data-testid="project-members-list"`) — see [Member row](#member-row). Members are server-sorted by last then first name.
- **Statistics section.** A section header **"Statistics"** over a `--bg-sunken` `--radius-lg` panel of stat tiles, each an uppercase Grotesk `--fs-11` micro-label over a Grotesk 600 `--fs-24` value: **"Total hours"** (`totalHours`), **"This month"**, **"Created"** (`createdAt`, formatted `Aug 1, 2026`). *Data note:* only **Total hours** and **Created** are backed by spec 11's `GET .../projects` contract; **"This month"** has no field in the business spec's API and is flagged as an open data dependency in [DS gaps](#ds-gaps) — ship the two backed tiles, defer or thread a new field for the third. This whole section is design-owned detail beyond the business spec's ASCII wireframe (which shows only the member list and status line).
- **Status / archive line.** A right-aligned action row separated by a 1px `--divider` top border. When the project is **active**: a DS `Button` `variant="secondary"`, label **"Archive"**, `data-testid="project-archive-btn"`, opening the [archive-confirm dialog](#archive-confirm-dialog). When **archived**: a DS `Button` `variant="secondary"`, label **"Restore"**, `data-testid="project-restore-btn"`, firing `PATCH .../restore` directly (non-destructive, no confirm) then toasting `toast-project-restored`.

### Member row

Each roster row (`data-testid="project-member-row-{membershipId}"`) is a two-line composition inside the bordered `member-list`: a 32px initials avatar, a stacked **name** (Grotesk 500 `--fs-14`) over **email** (`--fs-12` `--text-muted`), a role chip, and a trailing DS `Button` `variant="secondary"` `size="sm"`, label **"Remove"**, `data-testid="project-member-remove-{membershipId}"` (fires `DELETE .../members/{membershipId}`, toast `toast-member-removed`, refetch).

- **Role chip.** Role display maps to the DS `Badge` using specs 04/05's established treatment — `tone="info"`, `outline`, `dot={false}`, raw lowercase role value with `text-transform: capitalize` — so a role reads identically here, on the member list (04), and on the member-detail header (05). The mockup renders per-role tints (admin=violet, manager=amber, user=neutral); the design **does not** adopt per-role colouring, keeping the single info/outline badge and recording per-role tones as the carried-forward DS gap (see [DS gaps](#ds-gaps)).
- **Email line.** The `member@…` line is design layout; note the member roster payload (`GET .../projects/{id}/members`) returns `firstName`/`lastName`/`role`, **not** email — flagged as an open data dependency in [DS gaps](#ds-gaps).

---

## Create/Edit Project modal

A DS `Modal` (`1_DS for dev/components/surfaces/Modal.jsx`), `data-testid="projects-modal"`, `width={480}`, focus-trapped, closing on Esc / backdrop / Cancel.

| Mode | Title | Field state | Primary button | `data-testid` |
|---|---|---|---|---|
| Create | **New Project** | empty | **Create project** | `projects-create-btn` |
| Edit | **Edit Project** | pre-filled with current name | **Save changes** | `projects-save-btn` |

- **Field.** One DS `Input`, `label="Project name"` (uppercase Grotesk `--fs-11` micro-label), placeholder **"e.g. Client Website Redesign"**, `data-testid="projects-name-input"`.
- **Inline error.** The business spec's validation/duplicate **messages** render beneath the field via `Input`'s `error` prop; the error node carries `data-testid="field-error-projectName"`. (`Input` still lacks a first-class `errorId` pass-through — carried gap; the error node gets the testid explicitly.) Duplicate name keeps the modal open with the field in error, matching the mockup's state 06.
- **Footer.** DS `Button` `variant="secondary"` **"Cancel"** (`data-testid="projects-cancel-btn"`) + the mode's primary button. The primary button shows `loading` and blocks the click while the POST/PUT is in flight; fields go read-only. On success the modal closes, toasts (`toast-project-created` / `toast-project-updated`), and — for **create** — the page navigates to the new project's detail (business spec Main Flow step 7).

## Add Members modal

A DS `Modal`, `data-testid="projects-add-members-modal"`, `width={520}` (the mockup widens this one over the name modal), focus-trapped.

- **Title** **"Add Members"**.
- **Search.** A DS `Input` (or `SearchField`) `label="Search"`, placeholder **"Search by name..."**, `data-testid="projects-member-search"`, filtering the list client-side by name.
- **Picker.** A scrollable checkbox list (`max-height` ~280px, `overflow-y: auto`, 1px `--divider`, `--radius-lg`) of all `active` org members. Each row is a DS `Checkbox` (`data-testid="projects-member-checkbox-{membershipId}"`) + a 28px avatar + name + role chip.
  - **Already-assigned** members render **disabled** (`opacity: .5`, checkbox checked + disabled) with the label **"Already added"** beneath the name (design microcopy) — the mockup's greyed rows. They cannot be toggled.
- **Footer.** DS `Button` `variant="secondary"` **"Cancel"** (`data-testid="projects-add-members-cancel-btn"`) + DS `Button` `variant="primary"` **"Add selected"** with a live count suffix — **"Add selected ({n})"** — `data-testid="projects-add-members-btn"`, disabled when no new member is selected. On success the modal closes, toasts `toast-members-added`, and the roster refetches (business spec Main Flow steps 10–12; already-assigned selections are silently skipped server-side).

## Archive-confirm dialog

Archive is destructive-adjacent (it hides the project from time selectors), so `project-archive-btn` opens a small confirmation before the `PATCH .../archive`. There is no first-class `ConfirmDialog` in the DS — this is composed from `Modal` following the `apps/web/app/org/[orgId]/members/DeleteConfirmDialog.tsx` precedent (carried gap from 09), a one-line body plus a Cancel / Confirm footer. The **body copy is the business spec's** archive-confirmation string ("Archive this project? Members will no longer be able to log time against it."), quoted, not restated. The confirm button uses `variant="danger"` and shows `loading` while the PATCH is in flight; on success it closes, toasts `toast-project-archived`, and navigates back to the list (business spec Alt Flow B). Restore has no confirm dialog.

---

## Component map

Only what this spec adds or reuses; 00's shell chrome and the DS primitives are referenced, not repeated.

| Screen element | DS / app component | Props / build | `data-testid` |
|---|---|---|---|
| Sidebar Projects section label | DS `SectionLabel` | "PROJECTS" | — |
| Sidebar Projects row | DS `NavItem` (in `Sidebar.tsx`) | `href`, `label="Projects"`, role-gated, active-when-nested, no badge | `nav-projects` |
| Page wrapper (list) | native `<div>` inside shell content | — | `projects-page` |
| Page title | 00 page header | "Projects" | `projects-page-title` |
| New project button | DS `Button` `primary` | opens Create modal | `projects-new-btn` |
| Status filter | DS `Select` | options Active/Archived/All; `onChange` → refetch | `projects-status-filter` |
| Project table | DS `Table` | columns Name/Members/Hours/Status/Actions; `onRowClick` → detail | `projects-table` |
| Project row | `Table` row `testId` | one per project; `dim` when archived | `projects-row-{id}` |
| Row member cell | app `AvatarStack` + count span | overlapping 26px initials + "{n} members" | — |
| Row status badge | DS `Badge` | `tone="active"` / `"inactive"` | — |
| Row edit action (active) | DS `IconButton` | pencil, `label="Rename project"`; opens Edit modal | *(no business testid — see below)* |
| Row restore action (archived) | DS `Button` `secondary sm` | inline `PATCH .../restore` | *(no business testid — see below)* |
| Empty state | native `<div>` | business spec's verbatim string | `projects-empty-state` |
| Loading skeleton | native `<div>` (`--bg-sunken` blocks) | table-shaped placeholders | `projects-loading-skeleton` |
| Detail wrapper | native `<div>` | — | `project-detail-page` |
| Back link | `next/link` | "← Back to projects" | `project-back-link` |
| Detail card | DS `Card` | whole page body | — |
| Project name | native heading | Grotesk 600 `--fs-22` | `project-detail-name` |
| Detail status badge | DS `Badge` | `tone` by status | `project-status-badge` |
| Rename pencil | DS `IconButton` | opens Edit modal | `project-edit-name-btn` |
| Add member button | DS `Button` `secondary sm` | opens Add Members modal | `project-add-member-btn` |
| Members list | native `<div>` | bordered roster | `project-members-list` |
| Member row | native `<div>` | avatar + name/email + role chip + Remove | `project-member-row-{membershipId}` |
| Member role chip | DS `Badge` | `tone="info"` `outline` `dot={false}` (04/05 treatment) | — |
| Member remove | DS `Button` `secondary sm` | `DELETE .../members/{id}` | `project-member-remove-{membershipId}` |
| Archive button | DS `Button` `secondary` | opens archive-confirm dialog | `project-archive-btn` |
| Restore button (detail) | DS `Button` `secondary` | direct `PATCH .../restore` | `project-restore-btn` |
| Create/Edit modal | DS `Modal` | `width={480}` | `projects-modal` |
| Name input | DS `Input` | `label="Project name"`, placeholder | `projects-name-input` |
| Name error | `Input` `error` node | business spec messages | `field-error-projectName` |
| Create button | DS `Button` `primary` | `loading` in flight | `projects-create-btn` |
| Save button | DS `Button` `primary` | `loading` in flight | `projects-save-btn` |
| Modal cancel | DS `Button` `secondary` | close | `projects-cancel-btn` |
| Add Members modal | DS `Modal` | `width={520}` | `projects-add-members-modal` |
| Member search | DS `Input`/`SearchField` | placeholder "Search by name..." | `projects-member-search` |
| Member checkbox | DS `Checkbox` | disabled when already assigned | `projects-member-checkbox-{membershipId}` |
| Add selected button | DS `Button` `primary` | "Add selected ({n})", disabled at 0 | `projects-add-members-btn` |
| Add Members cancel | DS `Button` `secondary` | close | `projects-add-members-cancel-btn` |
| Archive-confirm dialog | DS `Modal` composition | body = business spec's confirm string; danger confirm | *(internal; no business testid listed)* |
| Toasts | `useToast()` | business spec strings | `toast-project-created`, `toast-project-updated`, `toast-project-archived`, `toast-project-restored`, `toast-members-added`, `toast-member-removed` |

---

## Copy

Validation, error, duplicate, archive-confirm, and empty-state **messages** are owned by [11-projects.md](11-projects.md) (§Error Messages, §Validation Rules) and quoted where used, never restated. Design owns the titles, labels, placeholders, and microcopy below.

| Slot | Owner | Text |
|---|---|---|
| Sidebar section label | design | PROJECTS |
| Sidebar row | design | Projects |
| List page title | design | Projects |
| List page subtitle | design | Manage projects and assign members. Assignment controls who can log time. |
| New project button | design | + New project |
| Filter options | design | Active (default) / Archived / All |
| Column header — name | design | Name |
| Column header — members | design | Members |
| Column header — hours | design | Hours logged |
| Column header — status | design | Status |
| Member-count microcopy | design | {n} members · 1 member |
| Hours cell | design | {totalHours} h |
| Status badge labels | design | Active / Archived |
| Row restore button | design | Restore |
| Empty-state title | design | No projects yet |
| Empty-state body | **business spec** | "No projects yet. Create your first project to start tracking time." |
| Back link | design | ← Back to projects |
| Members section header | design | Members ({n}) |
| Add member button | design | + Add member |
| Member remove button | design | Remove |
| Role chip label | design (via 04/05) | capitalized role value |
| Statistics header | design | Statistics |
| Stat tile labels | design | Total hours · This month · Created |
| Archive button | design | Archive |
| Restore button (detail) | design | Restore |
| Create modal title | design | New Project |
| Edit modal title | design | Edit Project |
| Name field label | design | Project name |
| Name field placeholder | design | e.g. Client Website Redesign |
| Create button | design | Create project |
| Save button | design | Save changes |
| Cancel button | design | Cancel |
| Add Members modal title | design | Add Members |
| Search field label / placeholder | design | Search / Search by name... |
| Already-assigned label | design | Already added |
| Add-selected button | design | Add selected ({n}) |
| Validation / duplicate / archive-confirm / toast messages | **business spec** | owned at [11-projects.md](11-projects.md#error-messages); not restated |

---

## States

| State | Trigger | Rendering |
|---|---|---|
| **Loading** | `GET .../projects` in flight | `projects-loading-skeleton`: static `--bg-sunken` table-shaped blocks (no `Skeleton` primitive — carried gap). |
| **Empty** | `projects: []` on Active filter | `projects-empty-state`, centered panel + folder glyph + business spec's sentence + "+ New project". |
| **Default** | `projects` non-empty | Table in payload order (name ascending; the page does not re-sort). Archived rows `dim`. |
| **Filter change** | `Select` `onChange` | Refetch `?status=…`; table re-renders; skeleton may flash between. |
| **Saving (modal)** | Create/Save/Add in flight | Primary button `loading` + click blocked; fields read-only. |
| **Success** | mutation `2xx` | Modal/dialog closes, toast fires (business spec string), page refetches; create navigates to detail. Never hand-patched — the server response is authoritative. |
| **Inline restore** | list-row Restore `2xx` | `toast-project-restored`, refetch; row leaves the Active list / un-mutes on All. |
| **Error (field)** | duplicate/validation `4xx` | `field-error-projectName` under the input; modal stays open; button re-enables. |
| **Error (network/server)** | any mutation `4xx`/`5xx` | Error toast with the business spec's "Something went wrong…" string; modal/dialog stays open; form retains values; buttons re-enable. |
| **Forbidden** | `user`/`viewer` navigates to route | Server redirect to `/org/{orgId}/members` (or the API's 403/404); the sidebar row was never shown. |

---

## Responsive behaviour

Breakpoints follow 00 and the business spec's detailed §Responsive Behavior, which this design visualizes and does not contradict. The desktop mockup is the ≥1024px acceptance target; the mobile mockup states (M-01, M-02) are the <768px target.

- **Desktop (≥1024px).** Full 252px sidebar with section labels visible. Table shows all columns at their designed flex widths; modals centered at 480px (name) / 520px (add members); detail uses the full content column, member rows at natural height.
- **Tablet (768–1023px).** Sidebar collapses to the 68px icon rail (00's rule): section labels and words hidden, the Projects glyph carries its name to a `title` tooltip. The table keeps all columns with trimmed padding; the Hours column stays right-aligned. Add-member modal at 480px.
- **Mobile (<768px).** A responsive web layout — no native chrome, no bottom sheets, no sticky bars (business spec is explicit).
  - **Sidebar** hidden by default; a hamburger in the top bar opens it as a left **overlay drawer** with an ink scrim, closing on scrim tap or the drawer's close button (mockup M-02). *Note:* 00 currently lists a mobile drawer as out of scope; spec 11's §Responsive and mockup require it, so this design treats the drawer as a **shell-level addition that spec 11 introduces** — see [DS gaps](#ds-gaps).
  - **Table → card list.** Each project is a `--bg-panel` card: name, then a meta row (avatar stack max 3 + "+N", "{n} members", hours), then a footer with the status badge and a "Tap to open →" affordance. The card body is tap-targetable to the detail; a **kebab (⋮)** button top-right opens row actions (Edit / Archive) — see [DS gaps](#ds-gaps) for the menu primitive.
  - **Primary action** ("New project") sits **inline in the page header** as a compact 36px "+ New" button — no FAB, no sticky bar.
  - **Filter** becomes a full-width selector on its own row above the list (trigger may read the fuller "Active projects").
  - **Detail** stacks vertically: back link → title + status badge → stat tiles → member list → an Archive button rendered inline at the bottom of the content flow (not sticky).
  - **Member rows** become vertically-stacked mini-cards: avatar + name + email on top, role chip + Remove on the bottom; every touch target ≥ 44×44px (icon buttons pad a 32px glyph to a 44px hit box).
  - **Modals** render as standard centered/near-top web dialogs (56px from top, 12px side margins), scrim behind, closing on scrim tap / Esc / Cancel — no drag handle, no swipe-to-dismiss.

---

## Accessibility

- **Keyboard order.** Logical tab order across page header → filter → table rows → row actions; on detail, back link → rename → add member → each member's Remove → archive/restore. All interactive elements are reachable.
- **Focus trap.** Both modals and the archive-confirm dialog trap focus (`Modal`'s existing behaviour) and return focus to the trigger on close.
- **Icon buttons.** The rename pencil (`label="Rename project"`), the mobile kebab (`aria-label="Actions"`), and the hamburger (`aria-label="Menu"`) carry accessible names — they are glyph-only.
- **Status is text + colour.** Active/Archived badges and role chips always pair the dot/tint with the word; colour is never the sole signal.
- **Row semantics.** A clickable table row does not swallow its inner action buttons — Restore / rename stop propagation so keyboard and pointer users can act on them independently of the row's navigate.
- **Destructive intent.** The archive-confirm's confirm button uses `variant="danger"` so the consequence reads as more than a tint. Contrast passes WCAG 2.1 AA (Meridian tokens are pre-validated).

---

## DS gaps

| Gap | Resolution | Status |
|---|---|---|
| **No avatar-stack primitive.** The Members column overlaps several initials avatars with a ring + count — the DS ships no `Avatar` at all, and no stacked variant. | Build an app-level **`AvatarStack`** composing the existing `AvatarInitials` at `size≈26` with a -6px overlap and a 2px `--bg-panel` ring, plus the "{n} members" count span. A first-class DS `Avatar` + `AvatarStack` (initials, optional image, size, overlap) would consolidate this with the member-list (04), member-detail (05), topbar (00), and requests-card (10) avatar call sites. | resolved for this screen (app `AvatarStack` over `AvatarInitials`); DS `Avatar`/`AvatarStack` open, not blocking |
| **`AvatarInitials` hardcodes its `data-testid`** (carried from 10). | Reuse `AvatarInitials` for the detail/member/picker avatars; it needs a `data-testid` (and it already takes `size`) pass-through so per-row avatars can be identified. | carried from 10; not blocking |
| **Muted / archived table row.** The mockup dims archived rows. | **DS already covers it** — `Table`'s per-row `dim` flag applies the muted treatment; no hand-rolled opacity, no new component. | resolved (existing `Table` `dim`) |
| **Row-level action controls in a `Table` cell.** The Actions column holds a pencil `IconButton` (active) or a Restore `Button` (archived). | **DS already covers it** — `Table`'s `render(row)` accepts arbitrary nodes, so `IconButton`/`Button` drop straight in. | resolved (existing `Table` render) |
| **Per-role `Badge` tones.** The mockup tints role chips per role (admin=violet, manager=amber, user=neutral). | The design **does not** adopt per-role colouring — role chips reuse 04/05's `Badge tone="info" outline dot={false}` so a role reads identically across list/detail/roster. Per-role semantic tones stay the carried-forward, open DS chore. | carried from 04/05; not blocking |
| **No `ConfirmDialog` primitive** (carried from 09). | The archive confirmation is composed from `Modal` following `DeleteConfirmDialog.tsx` (one-line body + Cancel/Confirm, danger + `loading` confirm). A first-class DS `ConfirmDialog` would collapse the fourth hand-rolled instance. | carried from 09; not blocking |
| **`Input` lacks a first-class error-testid** (carried). | `field-error-projectName` is attached to the `Input` `error` node explicitly; a DS `errorId`/error-testid pass-through on `Input`/`Select` is the tidy fix. | carried; not blocking |
| **No `Skeleton` primitive** (carried from 04/05/09). | `projects-loading-skeleton` uses static `--bg-sunken` table-shaped blocks. | carried; not blocking |
| **No dropdown/menu primitive for the mobile kebab.** The mobile card's ⋮ opens an Edit / Archive action menu; the DS ships no `Menu`/`DropdownMenu`. | Build the kebab menu as a small app-level popover (anchored, Esc/outside-click to close) for this release; a first-class DS `Menu` is the chore this raises. Desktop has no kebab (row-inline actions), so this is mobile-only. | new (11); not blocking |
| **Mobile drawer is not yet a shell state.** 00 lists the burger + overlay + scrim drawer as out of scope; spec 11's §Responsive and mockup require it. | Not a DS-component gap: the drawer is **shell** wiring in `apps/web/src/layout/` (like 00's `AppShell` exception). Spec 11 is the first surface to require it, so the mobile drawer graduates from "out of scope" and is built in the shell, role-gating the same nav array. App-shell integration, tracked here, owned by the shell. | new (11); shell wiring, not a DS change |
| **"This month" hours have no API field.** The detail Statistics panel shows a Total / This month / Created triple; spec 11's `GET .../projects` returns only `totalHours` and `createdAt`. | Ship the two backed tiles (Total hours, Created); **defer "This month"** or thread a month-scoped field through the business spec's contract. Not a DS gap — an open data dependency flagged for spec 11 / spec 12 reconciliation. | open data dependency; ship two tiles |
| **Member email has no API field in the roster payload.** The two-line member row and Add-Members picker show `member@…`; `GET .../projects/{id}/members` returns `firstName`/`lastName`/`role` only. | Thread `email` into the members response, or drop the email line. Flagged for business-spec reconciliation; the row layout works with or without it. | open data dependency |

Carried forward, still true: the DS ships no `AppShell`/`Sidebar`/`Topbar`/`PageHeader` (built in `apps/web/src/layout/`, 00's deliberate exception); `NavItem` cannot host a `next/link` (00's gap — `href` + intercepted `onClick`), which the Projects row inherits; the DS exports no icon beyond `Eye`/`EyeOff`, so the Projects folder glyph and the kebab/pencil glyphs are added to `apps/web/src/layout/icons.tsx`; `Modal` still lacks a `<480px` full-screen-drawer breakpoint (mobile modals use the standard centered shell at near-full width, matching the mockup rather than a drawer).

### `data-testid` values not covered by the business spec

The business spec's roster does not name a testid for two controls the mockup shows: the **list-row edit pencil** (active rows) and the **list-row inline Restore** (archived rows). Recommend `projects-edit-{id}` and `projects-restore-{id}` respectively, and the mobile **kebab** `projects-kebab-{id}`; these are flagged for the business spec to adopt so the frontend/e2e agents share one mapping. `project-restore-btn` in the roster is the **detail-page** restore, distinct from the list-row control.

---

## Required `data-testid` attributes

Single source of the business spec's §Required data-testid Attributes, mapped to the element each lands on.

| `data-testid` | Element | Origin |
|---|---|---|
| `nav-projects` | Sidebar Projects `NavItem` | **new (11)** |
| `projects-page` | List page wrapper | **new (11)** |
| `projects-page-title` | Page header `<h1>` ("Projects") | **new (11)** |
| `projects-status-filter` | Status filter `Select` | **new (11)** |
| `projects-table` | Project `Table` | **new (11)** |
| `projects-row-{id}` | One project row | **new (11)** |
| `projects-new-btn` | "+ New project" button | **new (11)** |
| `projects-empty-state` | Empty-state panel | **new (11)** |
| `projects-loading-skeleton` | Loading skeleton | **new (11)** |
| `project-detail-page` | Detail page wrapper | **new (11)** |
| `project-detail-name` | Project name heading | **new (11)** |
| `project-edit-name-btn` | Rename pencil `IconButton` | **new (11)** |
| `project-members-list` | Roster container | **new (11)** |
| `project-member-row-{membershipId}` | One member row | **new (11)** |
| `project-member-remove-{membershipId}` | Member Remove button | **new (11)** |
| `project-add-member-btn` | "+ Add member" button | **new (11)** |
| `project-archive-btn` | Detail Archive button | **new (11)** |
| `project-restore-btn` | Detail Restore button | **new (11)** |
| `project-back-link` | "← Back to projects" link | **new (11)** |
| `project-status-badge` | Detail status `Badge` | **new (11)** |
| `projects-modal` | Create/Edit `Modal` | **new (11)** |
| `projects-name-input` | Name `Input` | **new (11)** |
| `projects-create-btn` | Create button | **new (11)** |
| `projects-save-btn` | Save button (edit) | **new (11)** |
| `projects-cancel-btn` | Modal cancel | **new (11)** |
| `field-error-projectName` | Name inline error node | **new (11)** |
| `projects-add-members-modal` | Add Members `Modal` | **new (11)** |
| `projects-member-search` | Member search input | **new (11)** |
| `projects-member-checkbox-{membershipId}` | Picker checkbox | **new (11)** |
| `projects-add-members-btn` | "Add selected ({n})" button | **new (11)** |
| `projects-add-members-cancel-btn` | Add Members cancel | **new (11)** |
| `toast-project-created` | Create success toast | **new (11)** |
| `toast-project-updated` | Rename success toast | **new (11)** |
| `toast-project-archived` | Archive success toast | **new (11)** |
| `toast-project-restored` | Restore success toast | **new (11)** |
| `toast-members-added` | Members-added toast | **new (11)** |
| `toast-member-removed` | Member-removed toast | **new (11)** |
| `app-sidebar`, `page-title` | Shell chrome | reused (00) |

## Reference mockup

[11-projects.mock.html](11-projects.mock.html) is the visual acceptance target: verify the list (active + archived filters), the empty state, the detail page, and both modals against it at desktop, and the M-01 / M-02 phone states at <768px. `1_DS for dev/templates/meridian-app/MeridianApp.dc.html` remains the token/value reference for the Meridian look and the avatar hue formula. Behavioural verification (create → add members → archive → restore, duplicate-name rejection, user/viewer role gating) runs against the business spec's Test Cases and the running API/UI.
