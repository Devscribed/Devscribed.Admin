---
id: "13"
kind: design
title: Kanban Board & Tasks — Design
pairs-with: 13-kanban-board.md
routes: ["/org/{orgId}/projects/{projectId}/board", "/org/{orgId}/projects/{projectId}/list", "/org/{orgId}/projects/{projectId}/tasks/{taskId}"]
design-system: "1_DS for dev"
tags: [kanban, board, tasks, task-detail, drag-and-drop, list-view, board-settings, create-task, project-key, epic, subtask, priority, meridian, light-only]
---

# 13 — Kanban Board & Tasks · Design

Visual and interaction specification for the **Kanban Board & Tasks** surface: three routes nested under a project — a drag-and-drop **Board view** (`/org/{orgId}/projects/{projectId}/board`), a filterable **List view** (`/org/{orgId}/projects/{projectId}/list`), and a two-column **Task detail page** (`/org/{orgId}/projects/{projectId}/tasks/{taskId}`) — plus the **Board Settings** and **Create Task** modals, and a **Project Key** addition to spec 11's project create/detail surfaces. Pairs with [13-kanban-board.md](13-kanban-board.md), which owns every API contract, the permission matrix, the validation and toast **messages**, the empty-state sentences, and the full `data-testid` roster. This file owns the visual and interaction detail only — layout, DS component mapping, headings, micro-labels, placeholders, states, responsive, and accessibility. Neither restates the other.

**This is a delta on [00-app-shell.design.md](00-app-shell.design.md) and [11-projects.design.md](11-projects.design.md).** Board/List/Task-detail render inside the existing shell (sidebar, top bar) but **not** as a sidebar row of their own — they are reached by drilling into a project from the **PROJECTS → Projects** row (spec 11), so the shell frame is unchanged; only the content column and the browser back-stack move. The project detail page (spec 11) gains a "Board"/"List" entry point once a `key` is set.

**Visual acceptance target:** [13-kanban-board.mock.html](13-kanban-board.mock.html) — a static, token-only render of the desktop states (board populated/empty, list populated, task detail populated, Create Task default/validation-error, Board Settings, archived project read-only, no-permission) plus mobile states (board single-column tabs, task detail collapsed side panel). Every value below is read from that mockup and expressed as a Meridian token or DS component.

---

## What this surface owns vs. the business spec

| Business spec (13-kanban-board.md) owns | This design owns |
|---|---|
| Board/task/column API contracts, hierarchy rules, fractional-position DnD semantics, project-key format | Column anatomy, task-card anatomy, the DnD visual behaviour (lift, placeholder, overlay, snap-back) |
| Permission matrix, role + project-membership gating, archived-project read-only rule | How the gated buttons (Create Task, Board Settings, delete) and the read-only cues read that gate visually |
| **All** fixed strings (validation, error, toast, empty-state, delete-confirmation) | Page/section headings, view-toggle labels, filter/sort labels, placeholders, modal field labels, micro-labels |
| The full `data-testid` roster | Which DS element each `data-testid` lands on |

The hierarchy validation (epic/task/bug/story/subtask parent rules), the fractional-indexing move contract, and the project-key uniqueness/immutability rules are all the business spec's and unchanged. This is a **presentation** onto that data — client-side reordering during drag is optimistic; the server position is authoritative.

---

## Sidebar integration

No new sidebar row. The **PROJECTS → Projects** group (spec 11) is unchanged; Board/List/Task-detail are reached only by navigating into a project. `apps/web/src/layout/Sidebar.tsx` requires no edit for this spec — a carried-forward note, not a gap.

- **Entry point.** On the project detail page (spec 11), once `project.key` is set, two new tabs — **"Board"** and **"List"** — appear beside the existing detail tabs (`data-testid="project-board-tab"` / `project-list-tab"`, proposed additions to spec 11's roster since 13 introduces them). Without a key, the tabs are absent and, for admin/manager, an inline **"Add Key"** prompt appears instead (business spec Alt Flow C, spec 11's [`project-add-key-btn`](13-kanban-board.md#required-data-testid-attributes)).
- **Back navigation.** Board/List/Task-detail all carry a **"← Back"** link at the top-left of the content column (the mock's `.back-link`, `--accent` ink, reused from 11's `back-link` pattern): Board/List go back to the project detail page; Task detail goes back to whichever of Board/List it was opened from (browser history — no explicit state needed).
- **Active nav row.** The **Projects** `NavItem` stays visually active (`--accent` ink on `--accent-soft`) while any of these three routes is open, per 00's "active while nested" rule — Board/List/Task-detail are all nested under `/projects/{projectId}`.

---

## Board view (`/org/{orgId}/projects/{projectId}/board`)

### Page anatomy

```
  ┌──────────────┬────────────────────────────────────────────────┐
  │ Teammerly●   │                                Alex K.  (AK)   │  ← 00 top bar
  ├──────────────┼────────────────────────────────────────────────┤
  │ PEOPLE       │  ← Mobile App                                   │  ← back-link
  │  ▣ Members   │  Mobile App  MOB    [Board | List]      [⚙]    │  ← header + view toggle + settings
  │ PROJECTS     │  ┌─ filter bar ──────────────────────────────┐ │
  │  ▣ Projects  │  │ [+ Create Task]  [Type▾][Priority▾][Assignee▾]  [Search____] │ │
  │              │  └──────────────────────────────────────────┘ │
  │              │  ┌────────┬────────┬────────┬───────────────┐ │
  │              │  │To Do(3)│In Prog.│Done (1)│ + Column       │ │
  │              │  │ [card] │ [card] │ [card] │               │ │
  │              │  │ [card] │ [card] │        │               │ │
  │              │  └────────┴────────┴────────┴───────────────┘ │
  └──────────────┴────────────────────────────────────────────────┘
```

- **Route / access.** `data-testid="board-view"`. The route's server component resolves the session and, for `viewer` or a `user` outside the project's membership, renders the [no-permission state](#states-1) rather than redirecting — the business spec's message is a **page**, not a toast, matching mock state 09. Loading follows 00 (centred `Spinner` until data resolves), then the [skeleton](#states-1) for the board fetch itself.
- **Header row.** Back-link, then the project name (Grotesk 600 `--fs-22`, matching 11's `project-detail-name` weight) with its **key** beside it as a muted mono chip (`--font-mono`, `--text-muted`, `--bg-sunken`, `--radius-sm` — e.g. "MOB"), then the **view toggle** (`data-testid="board-view-toggle"`, DS `Toggle` segmented pill, options **Board** / **List**, Board selected), then — admin/manager only — a DS `IconButton` gear (`data-testid="board-settings-btn"`, `label="Board settings"`) opening the [Board Settings modal](#board-settings-modal).
- **Filter bar.** One row below the header: **"+ Create Task"** primary `Button` (`data-testid="board-create-task-btn"`, hidden for archived projects — business spec Alt Flow D) on the left, then three DS `Select` filters — **Type**, **Priority**, **Assignee** (`board-filter-type` / `board-filter-priority` / `board-filter-assignee`, all multi-select `Select` variants) — then a DS `SearchField` on the right (`data-testid="board-search"`, placeholder **"Search tasks…"**). Filters combine with AND logic (business spec TC-13-E2E-17); active filters show a small count badge on the trigger.
- **Column lanes.** A horizontally-scrolling flex row, each column a `--bg-panel-2` lane (`data-testid="board-column-{id}"`) with a sticky header (`data-testid="board-column-header-{id}"`: column name, Grotesk 600 `--fs-14`, plus a task count in a muted pill `data-testid="board-column-count-{id}"`) and a vertically-scrolling card stack below. Lane width 300px, fixed; gap `--sp-4` between lanes. Category-tinted header rule: a 3px top border in `--accent` (in_progress), `--success-500` (done), or `--border-strong` (todo/custom) — informational only, from the column's `category` field.
- **Add-column affordance.** A trailing lane, admin/manager only, containing a dashed-border ghost button **"+ Column"** (`data-testid="board-column-add"`) that opens the same inline-name affordance as [Board Settings](#board-settings-modal)'s "+ Add Column" (typing + Enter, no separate modal).

### Task card anatomy

`data-testid="board-task-card-{id}"`, a `--bg-panel` card, `--radius-xl`, 1px `--border`, with a **4px left rail** colored per [type](#task-type-icon-system):

- **Top row.** Type icon (16px, `currentColor` in the type's ink color) + task key in `--font-mono` `--fs-12` `--text-muted` (e.g. "MOB-5").
- **Title.** `--fs-14` `--text`, IBM Plex Sans, 2-line clamp with ellipsis (`-webkit-line-clamp:2`).
- **Bottom row.** Priority icon (if set, 14px, [priority ink color](#priority-icon-system)) on the left; on the right, in order: story-points badge (if set — a small `--bg-sunken` pill, Grotesk 600 `--fs-11`, e.g. "5"), assignee avatar (if set — 22px `AvatarInitials` circle), due-date text (if set — `--fs-11`, `--error-500` if overdue else `--text-muted`).
- **Child indicator.** If `childCount > 0`, a small subtask-icon + count appears beside the key (e.g. "⌐ 2"), `--text-faint`.
- **Hover / focus.** `--shadow-pop` lift + `filter:brightness(0.99)`; the card is a `<button>`-equivalent (`role="button"`, `tabindex="0"`), `Enter` navigates to detail.

### Drag and drop

- **Library.** `@dnd-kit` (per business spec §UI), rendered visually as: press-and-hold lifts the card (`--shadow-modal`, `scale(1.02)`, slight rotate `-1deg`), a **drop placeholder** (dashed `--accent-border` outline, `--accent-soft` fill, card-shaped) shows at the candidate insertion point — between cards or at a lane's top/bottom.
- **Drag overlay.** A semi-transparent (`opacity:.9`) floating copy of the card follows the pointer; the origin slot collapses to the placeholder.
- **Drop-zone highlight.** The hovered lane's background shifts to `--hover-bg-tint` for the duration of the drag.
- **Optimistic move.** On drop, the card re-renders in place immediately; `PATCH .../tasks/{id}/move` fires in the background. Success: silent (no toast per business spec — only cross-column moves toast **"Task moved"**). Failure: card animates back to its origin slot (`250ms`, `--easing-standard`) and an error toast fires (business spec's generic error message).
- **Archived / no-permission.** Cards render with `cursor:default` (no `grab` cursor) and are not draggable — `draggable=false`, no drag listeners attached — matching the business spec's "no grab cursor" cue (TC-13-E2E-15).

### States

| State | Behaviour |
|---|---|
| Loading | `board-loading-skeleton` (proposed testid): 3 skeleton lanes, each with 2–3 `--bg-sunken` placeholder card blocks, no shimmer animation (matches 12's static-skeleton convention — no `Skeleton` primitive) |
| Empty board (no tasks) | Centred within the lanes: a `--text-muted` line **"No tasks yet. Create your first task to get started."** (business spec) + a **"+ Create Task"** `Button` (mock state 02) |
| Empty column | A single centred `--text-faint` line **"No tasks in this column."** (business spec), no button |
| Error on load | Full-width `InfoBanner` (danger tone) with the business spec's generic error message + a **"Retry"** ghost button |
| Archived project | Header carries a muted `--bg-sunken` strip below it reading **"This project is archived — the board is read-only."** (design-owned banner text; the business spec's archived-state *behaviour* — create hidden, DnD off, task fields read-only — is what's gated, this sentence is presentation only); "+ Create Task" and "+ Column" hidden, gear hidden (mock state 08) |
| No permission | Board chrome (header, filters, lanes) is not rendered at all; the content column shows a centred `InfoBanner`-style panel with the business spec's **"You do not have permission to view this board"** and a link back to Projects (mock state 09) |

### Responsive

- **Desktop (≥1280px).** All lanes visible, horizontal scroll if the project has more columns than fit.
- **Tablet (768–1279px).** Lanes narrow to 260px, same horizontal scroll; filter bar wraps to two rows if needed.
- **Mobile (<768px).** One column visible at a time; a **column-tab strip** (the mock's `.seg`-style scrollable row of pill tabs, one per column + count) replaces the lane headers — tapping a tab swaps the visible card stack. Swipe left/right between columns is a stretch enhancement, not required. "+ Create Task" becomes a full-width bar button pinned above the tab strip.

---

## List view (`/org/{orgId}/projects/{projectId}/list`)

`data-testid="list-view"`. Same header row as Board (back-link, project name + key, view toggle with **List** selected, no gear — column management is board-only). Filter bar adds a **Status** filter (`data-testid="list-filter-status"`, options = the board's column names) and a **Sort** `Select` (`data-testid="list-sort"`) after Search; options **Created (newest)** *(default)*, **Created (oldest)**, **Priority (high→low)**, **Priority (low→high)**, **Due date (earliest)**, **Due date (latest)**, **Story points (high→low)**, **Title (A→Z)** — mapped to the business spec's `sort` query values.

### Table

A DS `Table` (11's convention: `--bg-panel` card, `--radius-2xl`, 1px `--border`, `--bg-header` head row) with columns:

| Column | Content | Notes |
|---|---|---|
| Key | mono `--text-muted` | fixed 90px |
| Type | icon only, 18px | fixed 44px, centered |
| Title | `--text`, `--fs-14` | flex, truncates with ellipsis |
| Status | column name in a small `--bg-sunken` pill | fixed 140px |
| Priority | icon only, 16px | fixed 60px, centered |
| Assignee | 22px avatar; name appears in a tooltip on hover | fixed 60px |
| SP | story points number, `--text-sub` | fixed 48px, right-aligned |
| Due | date `M d`, `--error-500` if overdue else `--text-muted` | fixed 100px |

Each `<tr>` is `data-testid="list-task-row-{id}"`; row hover uses `--hover-bg-tint`; click navigates to task detail. No inline editing (business spec explicit). Header cells for Priority/Due/SP are not independently sortable — the single Sort dropdown drives ordering (matches the business spec's single `sort` param, not per-column sort).

### States

Mirrors Board's states with list-shaped equivalents: loading → 5 skeleton rows; empty (no tasks at all) → business spec's board-empty sentence reused; **empty (filtered)** → business spec's **"No tasks match your filters."** with a "Clear filters" ghost link (design-owned control, no roster testid — internal).

### Responsive

Desktop: full 8-column table. Tablet: SP and Due columns hidden (data still reachable via row → detail). Mobile: table collapses to a stacked card list — each row becomes a compact `--bg-panel` card (key + type icon on top, title below, priority icon + avatar on the bottom row), same click-through to detail.

---

## Task detail page (`/org/{orgId}/projects/{projectId}/tasks/{taskId}`)

`data-testid="task-detail"`. Back-link returns to Board or List (whichever the user came from). Two-column layout, **60/40 split** on desktop, right column sticky on scroll (`position:sticky;top:20px`).

### Header

Task key (`data-testid="task-key"`, mono `--fs-14` `--text-muted`) + type badge (`data-testid="task-type-badge"`: type icon + type name in a `--bg-sunken` pill, e.g. "🔵-icon Task") sit above the title, left column.

### Left column

- **Title.** Rendered as `--fs-27` Grotesk 600 text (`data-testid="task-title"`). Click swaps to an `Input` (`data-testid="task-title-input"`) at the same visual size; `Enter`/blur saves (`PUT` with `{title}`), `Escape` reverts. Read-only (no click handler, `cursor:default`) when the project is archived.
- **Description.** A section labelled **"Description"** (uppercase micro-label) with a DS `IconButton` pencil (`data-testid="task-description-edit-btn"`, `label="Edit description"`, hidden when archived) at the right. Default: rendered markdown (sanitized renderer — business spec §Security) in a `--bg-panel-2` block, or **"No description"** in `--text-faint` italics when null. Edit mode: a monospace `textarea` (`data-testid="task-description-input"`, tab-key inserts a literal tab) replaces the block, with **Save** (`task-description-save-btn`) / **Cancel** (`task-description-cancel-btn`) `Button`s below it.
- **Children section.** A divider row labelled **"Children ({n})"** (uppercase micro-label + count, `data-testid="task-children-section"`). Each child is a compact row (`data-testid="task-child-{id}"`): a checkbox-style done indicator (checked/`--success-500` check-icon if the child's column has `category="done"`, empty square otherwise — read-only, reflects state, not an input), key (mono, muted), title, type icon, assignee avatar. Rows are clickable, navigating to the child's detail page. Below the list, a ghost **"+ Add subtask"** `Button` (`data-testid="task-add-subtask-btn"`, hidden when archived) opens the [Create Task modal](#create-task-modal) pre-set to `type=subtask`, `parentId=<this task>`.
- **Reserved slots.** Two placeholders, each a `--text-faint` note in a dashed-border box, marking future content owned by later specs: **"Comments and activity — spec 14"** and **"Time logged — spec 15"**. Not interactive; purely a layout reservation so this page doesn't need re-flowing later. (Watchers and Labels are spec-14 additions to the [side panel](#right-column-side-panel), not the left column — see spec 14 for placement.)

### Right column (side panel)

Each field label is the uppercase micro-label convention (Grotesk `--fs-11`, `--ls-wider`, `--text-muted`); each control triggers its own `PUT` on change (debounced ~500ms for text/number inputs, immediate for selects/dates) and shows a subtle inline "Saving…"/"Saved" flash (design-owned micropattern, no roster testid — folds into the business spec's general "Toast: task updated" on completion).

| Field | Control | `data-testid` |
|---|---|---|
| Status | DS `Select`, options = board's column names | `task-status-select` |
| Assignee | DS `Select`, searchable, org members with avatar + name, includes "Unassigned" | `task-assignee-select` |
| Priority | DS `Select`, options None/Low/Medium/High/Critical with their icons inline | `task-priority-select` |
| Type | DS `Select`, options epic/task/bug/story/subtask with icons inline | `task-type-select` |
| Story Points | DS `Input type="number"` | `task-story-points-input` |
| Due Date | DS `Input type="date"` | `task-due-date-input` |
| Parent | read-only link (key + title) or **"None"** | `task-parent-link` |
| Reporter | read-only, avatar + name, no control | `task-reporter` |
| Created | read-only formatted date (`M d, yyyy`) | `task-created-date` |

At the bottom, separated by a divider: a red text `Button variant="ghost"` **"Delete task"** (`data-testid="task-delete-btn"`, hidden when archived) opening a `Modal`-composed confirm (`task-delete-confirm` / `task-delete-cancel`) with the business spec's delete-confirmation string (task key + title interpolated).

**Archived / read-only.** All side-panel controls render `disabled`; the description edit pencil, title click-to-edit, and "+ Add subtask" are hidden; "Delete task" is hidden (business spec TC-13-E2E-15).

### Responsive

Desktop: two columns as above. Tablet: side panel collapses into a horizontal wrapping bar directly below the title/type-badge row (fields as compact label+value pairs in a flex-wrap row), above the description. Mobile: side panel becomes a collapsed **accordion** — a **"Details"** disclosure row (chevron, closed by default) above the description; tapping it expands the same fields stacked full-width. Delete stays pinned at the very bottom regardless.

---

## Board Settings modal

DS `Modal` (`data-testid="board-settings-modal"`, `width={480}`), title **"Board Settings"**, opened by the gear icon.

- **Columns section.** Micro-label **"Columns"**, then a vertical list of rows (`data-testid="board-settings-column-{id}"`), each: a drag handle (≡, `--text-faint`, `cursor:grab`), the column name (`data-testid="board-settings-column-name-{id}"` — plain text by default, becomes an inline `Input` on edit), an edit pencil `IconButton` (`board-settings-column-edit-{id}`), and a trash `IconButton` (`board-settings-column-delete-{id}`, disabled + `title="Column has tasks"` tooltip when non-empty per business spec FR-5 — disabled rather than erroring, though the API's `column_not_empty` toast still fires as a fallback if a race occurs).
- **Reorder.** Rows drag-reorder via the same `@dnd-kit` pattern as the board (placeholder gap between rows, no full drag-overlay copy needed at this scale — a simple lift shadow suffices). On drop, `PUT .../board/columns/reorder` fires with the full ordered id list.
- **Add column.** A ghost **"+ Add Column"** button (`data-testid="board-settings-column-add"`) at the bottom of the list swaps itself for an inline `Input` (`data-testid="board-settings-column-name-input"`, placeholder **"Column name"**, autofocus); `Enter` submits (`POST .../board/columns`), `Escape` cancels.
- **Reserved slot.** A dashed-border note **"Labels — spec 14"** below the columns section, same reservation pattern as the task-detail page.
- **Accessibility.** Full keyboard support: `Tab` cycles rows and their edit/delete buttons; `Enter` on a row's name enters edit mode; `Escape` cancels an in-progress edit or add; delete asks for confirmation via a nested `Modal` composition (reachable and dismissible by keyboard) rather than a bare `confirm()`.

---

## Create Task modal

DS `Modal` (`data-testid="create-task-modal"`, `width={520}`), title **"Create Task"**, opened from **"+ Create Task"** (board/list) or **"+ Add subtask"** (task detail, which pre-fills `type=subtask` + `parentId` and **hides** the Type field — the business spec's flow step 11 pre-sets both, so re-picking type would break the parent constraint).

Fields, top to bottom, each with the business spec's inline error node beneath it on blur/submit:

| Field | Control | `data-testid` | Notes |
|---|---|---|---|
| Type | DS `Select`, epic/task/bug/story/subtask with icons | `create-task-type` | default **Task**; changing type re-filters the Parent options live |
| Title | DS `Input`, placeholder **"Task title"** | `create-task-title` / error `create-task-title-error` | required, autofocus |
| Description | DS `textarea`, placeholder **"Markdown supported…"** | `create-task-description` | optional |
| Parent | DS `Select`, placeholder **"None"** | `create-task-parent` | **hidden** entirely when type=epic; shows epics when type=task/bug/story; shows tasks/bugs/stories when type=subtask (required in that case, per FR-10 — client mirrors server rule) |
| Priority + Story Points | 2-col row: `Select` (None/Low/Medium/High/Critical) + `Input type="number"` | `create-task-priority` / `create-task-story-points` | both optional |
| Assignee + Due Date | 2-col row: `Select` (Unassigned + org members) + `Input type="date"` | `create-task-assignee` / `create-task-due-date` | both optional |
| Status | DS `Select`, options = board's column names | `create-task-status` | default = first column by position |

Footer: **Cancel** (`create-task-cancel`, ghost) + **Create Task** (`create-task-submit`, primary, `loading` while the `POST` is in flight). Modal body scrolls (`max-height` capped, `overflow-y:auto`) if content overflows — matches 12's convention. Server-side hierarchy errors (e.g. `epic_cannot_have_parent`) surface as an error toast per business spec Alt Flow A9b, modal stays open with entered values intact.

---

## Project Key (delta on spec 11)

- **Create Project modal.** Gains a **"Project Key"** field (`data-testid="project-key-input"`) directly below Name. Auto-suggested from the name's initials as the user types (e.g. "Mobile App" → "MOB" — first letters of each word, uppercased, capped at 10 chars), editable at any point; suggestion logic never overwrites a value the user has manually edited. Placeholder **"e.g. MOB"**, helper text **"2–10 uppercase letters. Enables the board once set."** (design-owned helper copy — the business spec owns the actual validation error strings shown on blur/submit).
- **Project detail page.** If `key` is set: a read-only mono chip badge beside the project name (`data-testid="project-key-badge"`, same visual as the board header's key chip). If not set: admin/manager sees a small ghost button **"Add Key"** (`data-testid="project-add-key-btn"`) that expands an inline `Input` + Save/Cancel (`project-key-input` reused) in place of the badge. `user`/`viewer` see neither the badge nor the button when no key is set — the board simply isn't reachable for them either way.

---

## Task type icon system

Five fixed types, each a 16-20px inline SVG (geometric, `currentColor`), each with a dedicated ink/rail color used on cards, badges, list-view icons, and selects.

| Type | Icon shape | Color token |
|---|---|---|
| Epic | a filled diamond / lightning-bolt glyph | `--accent` (violet — epics are the top-level "big rock", reusing the house accent) |
| Task | a rounded checkmark-square | `--ev-teal` ink (DS gap, see [below](#ds-gaps) — teal, reused from spec 12's project-color palette for visual family continuity) |
| Bug | a six-legged bug/ladybug glyph | `--error-500` (red) |
| Story | a bookmark/flag glyph | `--success-500` (green) |
| Subtask | a small nested checkbox glyph | `--text-muted` (neutral gray — subtasks are the least prominent level) |

Business spec's own UI Description names "task=blue"; **overridden here** — Meridian's house rule is no blue anywhere (`1_DS for dev/README.md` §Visual foundations). Task uses the teal ink instead, matching the design's DS-gap resolution below.

---

## Priority icon system

Four fixed priorities plus "none" (no icon, dash), each a small chevron/flag glyph, `currentColor`:

| Priority | Icon shape | Color token |
|---|---|---|
| Low | single down-chevron | `--success-500` (green) |
| Medium | a level dash/equals glyph | `--amber-700` (amber) |
| High | single up-chevron | `--error-400` (light red) |
| Critical | double up-chevron | `--error-500` (red) |
| None | em-dash "—" | `--text-faint` |

Priority is never color-only: the select and any tooltip always pair the icon with the word (Low/Medium/High/Critical); on cards the icon alone is acceptable only because the same information is one click away on the detail page and is not the sole means of identifying a task (accessibility note carried into [Accessibility](#accessibility) below).

---

## Component map

| Screen element | DS / app component | Props / build | `data-testid` |
|---|---|---|---|
| Board wrapper | native `<div>` | — | `board-view` |
| View toggle | DS `Toggle` | Board/List | `board-view-toggle` |
| Board settings gear | DS `IconButton` | admin/manager only | `board-settings-btn` |
| Create task (board) | DS `Button` | opens Create Task modal | `board-create-task-btn` |
| Board filters | DS `Select` ×3 (multi-select) | Type/Priority/Assignee | `board-filter-type` · `board-filter-priority` · `board-filter-assignee` |
| Board search | DS `SearchField` | — | `board-search` |
| Column lane | app `<div>` (`--bg-panel-2`) | drag-drop target | `board-column-{id}` |
| Column header | app `<div>` | name + count | `board-column-header-{id}` |
| Column count | native `<span>` (pill) | taskCount | `board-column-count-{id}` |
| Add column | app ghost `<button>` | inline name input | `board-column-add` |
| Task card | app `<button>`-role card | draggable | `board-task-card-{id}` |
| List wrapper | native `<div>` | — | `list-view` |
| Create task (list) | DS `Button` | opens modal | `list-create-task-btn` |
| List filters | DS `Select` ×4 | Type/Priority/Assignee/Status | `list-filter-type` · `list-filter-priority` · `list-filter-assignee` · `list-filter-status` |
| List search | DS `SearchField` | — | `list-search` |
| List sort | DS `Select` | 8 options | `list-sort` |
| Table | DS `Table` | 8 columns | — |
| Table row | native `<tr>` | click → detail | `list-task-row-{id}` |
| Task detail wrapper | native `<div>` | 60/40 grid | `task-detail` |
| Task key | native `<span>` mono | — | `task-key` |
| Type badge | app pill (icon+label) | — | `task-type-badge` |
| Title (view/edit) | native text / DS `Input` | click-to-edit | `task-title` / `task-title-input` |
| Description (view/edit) | markdown block / `textarea` | sanitized render | `task-description` / `task-description-input` |
| Description edit/save/cancel | DS `IconButton` / `Button` ×2 | — | `task-description-edit-btn` · `task-description-save-btn` · `task-description-cancel-btn` |
| Children section | native `<div>` | count in label | `task-children-section` |
| Child row | app `<button>` row | click → child detail | `task-child-{id}` |
| Add subtask | DS `Button variant="ghost"` | opens Create Task, prefilled | `task-add-subtask-btn` |
| Status/Assignee/Priority/Type selects | DS `Select` ×4 | `PUT` on change | `task-status-select` · `task-assignee-select` · `task-priority-select` · `task-type-select` |
| Story points / Due date | DS `Input` ×2 | debounced `PUT` | `task-story-points-input` · `task-due-date-input` |
| Parent link | native `<a>`-style `<button>` | read-only | `task-parent-link` |
| Reporter | native `<div>` (avatar+name) | read-only | `task-reporter` |
| Created date | native `<span>` | read-only | `task-created-date` |
| Delete task | DS `Button variant="ghost"` (danger ink) | confirm → `DELETE` | `task-delete-btn` |
| Delete confirm/cancel | `Modal` composition | — | `task-delete-confirm` · `task-delete-cancel` |
| Create Task modal | DS `Modal` | `width={520}` | `create-task-modal` |
| Modal type/title/description | `Select` / `Input` / `textarea` | — | `create-task-type` · `create-task-title` (+`-error`) · `create-task-description` |
| Modal parent/priority/SP/assignee/due/status | `Select` ×4, `Input` ×2 | filtered per FR-10 | `create-task-parent` · `create-task-priority` · `create-task-story-points` · `create-task-assignee` · `create-task-due-date` · `create-task-status` |
| Modal submit/cancel | DS `Button` ×2 | `loading` in flight | `create-task-submit` · `create-task-cancel` |
| Board Settings modal | DS `Modal` | `width={480}` | `board-settings-modal` |
| Settings column row | app row (drag handle + name + actions) | reorderable | `board-settings-column-{id}` |
| Settings column name | native `<span>`/`Input` | inline edit | `board-settings-column-name-{id}` |
| Settings edit/delete | DS `IconButton` ×2 | — | `board-settings-column-edit-{id}` · `board-settings-column-delete-{id}` |
| Settings add column | ghost `<button>` + `Input` | — | `board-settings-column-add` · `board-settings-column-name-input` |
| Project key (create/detail) | DS `Input` / read-only chip / ghost button | spec-11 delta | `project-key-input` · `project-key-badge` · `project-add-key-btn` |

---

## Copy

Validation, error, toast, and delete-confirmation **messages** are owned by [13-kanban-board.md](13-kanban-board.md) (§Error Messages, §Validation Rules) and quoted where used, never restated. Design owns the titles, labels, placeholders, and microcopy below.

| Slot | Owner | Text |
|---|---|---|
| Board/List view toggle | design | Board / List |
| Board key chip | design | (project.key, e.g. MOB) |
| Filter labels | design | Type / Priority / Assignee / Status |
| Search placeholder | design | Search tasks… |
| Create task button | design | + Create Task |
| Add column button | design | + Column / + Add Column |
| Add subtask button | design | + Add subtask |
| List sort options | design | Created (newest) / Created (oldest) / Priority (high→low) / Priority (low→high) / Due date (earliest) / Due date (latest) / Story points (high→low) / Title (A→Z) |
| Archived board banner | design | This project is archived — the board is read-only. |
| Description edit label | design | Description |
| Children section label | design | Children ({n}) |
| Reserved-slot notes | design | Comments, watchers, and activity — spec 14 / Time logged — spec 15 / Labels — spec 14 |
| Side panel field labels | design | Status / Assignee / Priority / Type / Story Points / Due Date / Parent / Reporter / Created |
| Delete task button | design | Delete task |
| Task type badge | design | Epic / Task / Bug / Story / Subtask |
| Modal titles | design | Create Task / Board Settings |
| Modal field labels | design | Type / Title / Description / Parent / Priority / Story Points / Assignee / Due Date / Status |
| Modal placeholders | design | Task title / Markdown supported… / None |
| Modal submit | design | Create Task |
| Project key field | design | Project Key |
| Project key placeholder/helper | design | e.g. MOB / 2–10 uppercase letters. Enables the board once set. |
| Add Key button | design | Add Key |
| No-permission back link | design | ← Back to Projects |
| Validation / error / toast / confirm / empty-state messages | **business spec** | owned at [13-kanban-board.md](13-kanban-board.md#error-messages); not restated |

---

## States

| State | Trigger | Rendering |
|---|---|---|
| **Loading** | Board/List/Task-detail fetch in flight | Static `--bg-sunken` skeleton blocks shaped to the view (3 lanes / 5 rows / two-column skeleton) — no `Skeleton` primitive (carried gap) |
| **Empty — board** | Project has no tasks | Board's lanes render empty; centred message + Create Task button (business spec string) |
| **Empty — column** | Column has no tasks | Muted one-line note inside the lane (business spec string) |
| **Empty — list (filtered)** | Filters/search return nothing | Table area shows the business spec's "No tasks match your filters." + a Clear-filters link |
| **Default** | Data present | Populated board/list/detail |
| **Saving** | Any field `PUT`/`POST`/`PATCH`/`DELETE` in flight | Button `loading`; side-panel field shows a brief inline "Saving…" flash; modal fields go read-only during submit |
| **Success** | Mutation `2xx` | Toast (business spec string) where specified; UI reflects the server response — never hand-patched beyond the optimistic DnD move |
| **Error — field** | Client/server validation `4xx` | Inline `*-error` node under the field; modal/form stays open, values retained |
| **Error — network/server** | Any mutation `4xx`/`5xx` | Toast with the business spec's generic error message; DnD reverts (see [DnD](#drag-and-drop)) |
| **Confirm (delete task / delete column)** | Delete click | `Modal`-composed confirm with the business spec's string; danger confirm shows `loading` |
| **Archived** | `project.status === "archived"` | Read-only cues throughout (see per-section notes above); create/settings/delete hidden |
| **No permission** | `viewer`, or `user` outside project membership | Board/List: full-page message (mock state 09); Task detail: same pattern, business spec's "manage-tasks" denial string on write attempts if reached via direct link |

---

## Responsive behaviour

Breakpoints follow 00 and the business spec's own responsive notes per screen (§UI Description), which this design visualizes.

- **Desktop (≥1280px).** Full 252px sidebar. Board shows all lanes with horizontal scroll only if columns exceed viewport. List is the full 8-column table. Task detail is the 60/40 two-column layout, side panel sticky.
- **Tablet (768–1279px).** Sidebar collapses to the 68px icon rail (00's rule). Board lanes narrow to 260px. List hides SP/Due columns. Task detail's side panel collapses to a horizontal wrapping bar under the title.
- **Mobile (<768px).**
  - **Sidebar** hidden behind the hamburger/overlay-drawer pattern (carried from spec 11's deferred shell work, not a 13 invention).
  - **Board** shows one column at a time via a scrollable pill-tab strip (column name + count per tab); "+ Create Task" becomes a full-width bar above the tabs.
  - **List** collapses to stacked cards (key/type/title/priority/avatar), same click-through.
  - **Task detail** side panel becomes a closed-by-default "Details" accordion above the description; delete stays pinned at the page bottom.
  - **Modals** (Create Task, Board Settings) render as standard centered/near-top web dialogs (56px from top, 12px side margins) at near-full width — no drawer, no bottom sheet (carried convention from 12).
  - **Touch targets** ≥44×44px throughout (icon buttons, tabs, card tap targets).

---

## Accessibility

- **Cards and rows as controls.** Board task cards and list rows are focusable (`tabindex="0"`, `role="button"`/native `<tr>` click handler) with `Enter` navigating to detail; drag handles in Board Settings are separately focusable with `Enter`/`Space` picking up a row for **keyboard reordering** (arrow keys move it, `Enter` drops, `Escape` cancels — the accessible equivalent of pointer DnD, since `@dnd-kit` ships keyboard sensors).
- **Color is never the sole signal.** Type and priority icons always pair with text elsewhere on the same view (the type badge spells "Task"/"Bug"/etc.; the select and detail page always show the word alongside the icon) — the color-coded rail/icon on a card is a secondary cue, not the only one.
- **Live status.** Toasts use the shared `useToast()` `aria-live="polite"` region (carried from 00/12); no page-specific live region is needed since DnD moves are visually confirmed by the card's new position, not an audio/live announcement (a text alternative — "Task moved to {column}" — is offered via the toast on cross-column moves only, per business spec).
- **Focus management.** Both modals trap focus and return it to the trigger on close (`Modal`'s built-in behaviour). The description edit textarea, on entering edit mode, receives focus automatically; `Escape` cancels and returns focus to the pencil button.
- **Contrast.** All existing Meridian tokens are pre-validated to WCAG 2.1 AA; the new type/priority ink colors below must be validated to the same bar before shipping (flagged in DS gaps).

---

## DS gaps

| Gap | Resolution | Status |
|---|---|---|
| **No task-type category color tokens.** Cards/badges/selects need 5 distinct type inks (epic/task/bug/story/subtask); only `--accent`, `--error-500`, `--success-500`, `--text-muted` exist as semantic tokens — "task" has no non-blue token. | Reuse spec 12's already-hardcoded `oklch(0.55 0.11 180)` teal ink (its `.ev-teal` project-color) for "task", giving the two specs one shared teal rather than inventing a second ad hoc hue. Record as `--type-task` pending a real token. | new (13); token chore, shared with 12 |
| **No priority ink tokens for the 4-tier scale.** Low/Medium/High/Critical map onto `--success-500`/`--amber-700`/`--error-400`/`--error-500` — workable today, but "Medium=amber" borrows the timer-amber hue for an unrelated meaning. | Ship the mapping above; if `--timer-*` tokens land per spec 12's gap, re-evaluate whether Medium should move off amber to avoid a semantic clash with the running-timer chip. | new (13); not blocking |
| **No DnD ghost/placeholder tokens.** The drop placeholder (`--accent-soft` fill + dashed `--accent-border`) and the drag-overlay opacity (`.9`) are composed from existing tokens, not new hardcoded values — no gap in practice, but flagged since 12 and 11 didn't need DnD visuals and this is the first spec that does. | No new tokens needed — `--accent-soft`/`--accent-border` already cover it. | new (13); resolved with existing tokens |
| **No `Table` support for a fixed-width mixed-icon/text column set.** List view needs icon-only, pill, avatar, and numeric columns side by side; the DS `Table` primitive (11's usage) is a generic wrapper without per-column width/align props documented. | Extend `Table` usage with app-level column config (width, align, render) the way 11 already does for its Status/Actions columns — not a new component, just a documented pattern. | carried from 11; not blocking |
| **No `ConfirmDialog` primitive** (carried from 09/12). | Task-delete and column-delete confirmations composed from `Modal`, per the `DeleteConfirmDialog.tsx` precedent. | carried; not blocking |
| **No `Skeleton` primitive** (carried from 04/05/09/11/12). | Loading states use static `--bg-sunken` view-shaped blocks. | carried; not blocking |
| **Mobile drawer is not yet a shell state** (carried from 11/12). | Shell wiring in `apps/web/src/layout/` — not a 13 invention. | carried; shell wiring |
| **Icon exports** — epic/task/bug/story/subtask type icons, priority chevrons, drag handle (≡), gear, plus, edit pencil, trash, chevrons, back arrow, checkbox glyph are not DS exports. | Add to `apps/web/src/layout/icons.tsx` (00's carried icon gap), consistent with 12's clock-icon addition. | carried; not blocking |
| **`Select` has no native multi-select variant documented.** Board/List type/priority/assignee filters need multi-select with a count badge on the trigger. | Extend `Select` with a `multiple` mode (checkboxes in the popover, trigger shows "Type (2)"), or compose an app-level `MultiSelectFilter` over the existing popover primitive. | new (13); not blocking |
| **`NavItem`/tab pattern for the project-detail Board/List entry tabs** — spec 11's project detail page has no tab strip today. | Add a simple `Tabs`-based (or `Toggle`-based, matching Board's own view toggle) tab row to the project detail page when `key` is set — a small spec-11 delta this spec introduces. | new (13); spec-11 delta |

---

## Reference mockup

[13-kanban-board.mock.html](13-kanban-board.mock.html) is the visual acceptance target for the **Board view** (populated + empty + archived), **List view**, **Task detail page**, the **Create Task** modal (default + validation-error), the **Board Settings** modal, and the **no-permission** state, at desktop plus mobile (board tab strip, task detail collapsed accordion). `1_DS for dev/templates/meridian-app/MeridianApp.dc.html` remains the token/value reference for the Meridian look. Behavioural verification (DnD, hierarchy creation, column CRUD, filters/sort, archived read-only, permission gating) runs against the business spec's Test Cases (TC-13-*) and the running API/UI.
