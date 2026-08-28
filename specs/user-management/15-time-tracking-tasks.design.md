---
id: "15"
kind: design
title: Time Tracking ↔ Tasks Integration — Design
pairs-with: 15-time-tracking-tasks.md
routes: ["/org/{orgId}/time-tracking", "/org/{orgId}/projects/{projectId}/tasks/{taskId}"]
design-system: "1_DS for dev"
tags: [time-tracking, tasks, kanban, task-selector, task-linking, time-logged, start-timer, timer-panel, entry-modal, task-detail, meridian, light-only]
---

# 15 — Time Tracking ↔ Tasks Integration · Design

Visual and interaction specification for the delta that spec 15 introduces on top of two already-shipped surfaces. It adds a **task selector** to the Timer panel and the Add/Edit Time Entry modal on `/org/{orgId}/time-tracking` (a delta on [12-time-tracking.design.md](12-time-tracking.design.md)), and a **"Time Logged" section** plus a **"Start Timer"** shortcut on the task detail page at `/org/{orgId}/projects/{projectId}/tasks/{taskId}` (a delta on spec 13's Kanban Board — no `13-kanban-board.design.md` exists yet, so this file also establishes the task-type iconography and detail-page anatomy needed to place these two additions, taking spec 13's ASCII "Task Detail Page" screen in [13-kanban-board.md](13-kanban-board.md#screens) as the layout it renders inside). Pairs with [15-time-tracking-tasks.md](15-time-tracking-tasks.md), which owns every API contract, the permission matrix, validation/error/toast/empty-state **messages**, and the full `data-testid` roster. This file owns the visual and interaction detail only — layout, DS component mapping, headings, micro-labels, placeholders, states, responsive, and accessibility. Neither restates the other.

**Theme:** light only, no theme toggle. **Tokens:** every value below references a token already in `1_DS for dev/tokens/*.css`, or a token/hardcoded-`oklch` value already recorded as a DS gap by [12-time-tracking.design.md](12-time-tracking.design.md#ds-gaps) (the project-event-colour palette, the timer-amber literals). This spec introduces one new hardcoded-colour family — a per-task-type icon palette — recorded fresh in [DS gaps](#ds-gaps).

**Visual acceptance target:** [15-time-tracking-tasks.mock.html](15-time-tracking-tasks.mock.html) — a static, token-only render of all desktop states (timer bar with/without task selector, the search popover, a task-locked timer, the entry modal with the selector integrated, the task-detail Time Logged section populated/empty/timer-running, filtered/empty search) plus two mobile states (task selector as a fullscreen sheet, Time Logged stacked under a mobile task detail header).

---

## What this surface owns vs. the business spec

| Business spec (15-time-tracking-tasks.md) owns | This design owns |
|---|---|
| `taskId` linking rules, snapshot/recompute semantics, project-match validation, orphaning on task delete | Task selector anatomy (trigger, popover, chip, clear), where it sits relative to the project selector, and how "locked" reads visually |
| Task search API contract, result cap/ordering, debounce timing (~250ms, business spec) | The popover's list-row layout (type icon + key + title), loading/empty states, and how many rows are visible before scrolling |
| Time Logged aggregation rules, per-role visibility, 10-entry cap, sort order | Time Logged section layout: total placement, entry-row anatomy, empty/loading states, "Start Timer" placement in the side panel |
| All fixed strings (validation, error, toast, empty-state, placeholders quoted verbatim from the business spec) | Section headings, non-quoted micro-labels, and the task-type icon/colour mapping (not specified by the business spec) |
| The full `data-testid` roster | Which DS element each `data-testid` lands on |

---

## Task-type iconography

Spec 13 defines five task `type` values (`epic`, `story`, `task`, `bug`, `subtask`) but no design.md yet assigns them icons or colours. This spec fixes a small set, reused everywhere a type icon appears (task selector rows, the locked chip, and — carried forward for spec 13 to adopt on cards/lists — the task detail header). Each is a 14px inline SVG glyph on a 1.5px-stroke or filled fill, paired with a hardcoded `oklch` ink (no `--task-type-*` tokens exist — [DS gaps](#ds-gaps)):

| Type | Glyph | Colour (oklch) | Meaning |
|---|---|---|---|
| `task` | filled circle | `0.55 0.16 292` (violet) | default unit of work |
| `bug` | bug body (rounded rect + legs) | `0.55 0.19 25` (red, `--error-500`-adjacent) | defect |
| `story` | bookmark/ribbon | `0.55 0.11 180` (teal) | user story |
| `epic` | diamond/chevron-stack | `0.55 0.13 74` (amber) | epic |
| `subtask` | small checkbox/branch tick | `var(--text-muted)` (neutral) | child of a task |

The glyph is always paired with the task's **key** as text (e.g. "MOB-5") — colour and shape are never the sole signal for type (accessibility, consistent with 12's colour rules).

---

## Task selector — shared anatomy

One control, reused in two hosts (the Timer panel and the Add/Edit Time Entry modal), always positioned **directly below the project selector**. It exists only when the selected project has a `key` (FR-10/FR-15); otherwise the host falls back exactly to spec 12's plain `task` text input, unchanged.

### Unselected (search) state

Renders as a bordered field matching the host's other inputs (`--border-strong` 1.5px, `--radius-lg`, `--bg-field`, `44px` height in the Timer panel / DS `Input` height in the modal) with a leading 14px search-magnifier glyph and placeholder **"Search tasks in {projectName}…"** (business spec, quoted verbatim). Below it, the original free-text `task` input remains visible and usable (per the business spec's UI description) — a member who prefers to type never has to touch the selector.

### Popover (open, typing)

On focus/typing the field grows a popover directly beneath it: `--bg-panel` surface, 1px `--border`, `--radius-lg`, `--shadow-pop`, `max-height` ~260px with internal `overflow-y:auto` past 6 rows. Debounced at the business spec's ~250ms.

- **Row** (`data-testid="tt-timer-task-option-{id}"` / `tt-entry-task-option-{id}`): a `<button>` full-width, `40px`–`48px` tall, flex row — the 14px type glyph, then the **key** in `--font-mono` `--fs-13` `--text-muted`, then the **title** `--fs-14` `--text` truncated with ellipsis. Hover/focus paints `--hover-bg-tint`. Up to 20 rows per the business spec's cap; the popover scrolls internally past 6 visible rows rather than growing unbounded.
- **Loading.** A centred `Spinner` row while the request is in flight (no rows shown yet).
- **No results.** A single non-interactive row, `--text-muted`, business spec's **"No matching tasks."**
- **Empty query (no project key state N/A — this is "no `q`" browse mode).** Same row layout, showing the project's most-recently-updated tasks (business spec default), no special empty styling — it's just a populated list.

### Selected (locked chip)

Once a task is chosen, the search input and popover are replaced by a **compact read-only chip** occupying the same field slot: same field height/border/radius as the search input, `--bg-panel-2` fill (a visibly "settled/locked" tint distinct from the editable `--bg-field`), containing the type glyph, the key in `--font-mono` `--text-muted`, a `·` or `:` separator, the title in `--text` `--fw-medium`, and a trailing **✕** clear button (`icon-btn`, `20px` glyph in a `32px` hit target, `--text-muted` default / `--error-500` on hover) — `data-testid="tt-timer-task-clear-btn"` / `tt-entry-task-clear-btn`. The chip is not a button itself (no click-to-reopen); clearing is the only interaction, matching FR-13's "clear reverts to search."

Simultaneously the free-text `task` input becomes **read-only** (`--bg-panel-2`, `--text-muted`, no focus ring, `cursor:not-allowed`) showing the same computed label as inert confirmation text beneath/alongside the chip in the modal (the Timer panel's task field **is** the chip — there is no separate free-text row once locked, since the chip already renders the label). See [Timer bar states](#timer-bar-with-task-selector) and [modal states](#addedit-time-entry-modal-with-task-selector) below for exact placement per host.

### Clearing

Clicking ✕ removes the chip, restores the search input (empty, ready to type again), and restores the free-text `task` input as **editable**, pre-filled with the just-cleared computed label (FR-6/FR-13) — a plain `--bg-field` input the member can now edit freely.

### No-project / keyless-project state

When no project is selected, or the selected project has no `key`, the task selector is **not rendered at all** — the host reverts to spec 12's baseline (project selector + plain `task` text input only). No placeholder, no disabled state; the row simply isn't there, keeping the panel's vertical rhythm identical to spec 12 when tasks aren't in play.

---

## Timer bar with task selector

A delta on [12-time-tracking.design.md § Timer bar](12-time-tracking.design.md#timer-bar-idle--running). Three states, matching mock 01/02/03/04:

1. **No project selected.** Baseline spec-12 idle bar — project `Select` (placeholder "Select project…") + task `Input` (placeholder "What are you working on?") + divider + "+ Add entry" / "▶ Start timer". No task selector row at all (mock state 04).
2. **Project selected, project has no `key`.** Same as spec 12 baseline — the bar's layout is unchanged from today; the task selector still doesn't appear.
3. **Project selected, project has a `key`, no task chosen yet.** The bar grows a second row beneath the project selector: the task selector in its unselected/search state (`data-testid="tt-timer-task-selector"`, wrapping `tt-timer-task-search-input`), full-width under the project `Select`. The task free-text `Input` sits directly below it (mock 01). Opening the popover (mock 02) shows up to 6 visible rows with type icon + key + title.
4. **Task chosen.** The selector collapses to the locked chip (mock 03); the bar's task free-text input disappears from view (the chip already carries the label) — the running variant shows the chip inline within the amber running card alongside the elapsed clock, project name, and description field, plus "Discard" / "■ Stop & save" per spec 12.

Editing while running (business spec Alt Flow B / spec 12 pattern): choosing a different task from the still-visible selector (chip retains its ✕, clicking it reopens search) calls `PUT .../timer` with the new `taskId` on selection; clearing calls the same endpoint with `taskId: null`.

**Changing project after a task is chosen** (FR-14): the chip is replaced by the search input reset to the new project's placeholder — same visual transition as a fresh unselected state, not an error or a flash.

---

## Add/Edit Time Entry modal with task selector

A delta on [12-time-tracking.design.md § Add/Edit Time Entry modal](12-time-tracking.design.md#addedit-time-entry-modal). Same `Modal`, `width={520}`, same field order, with one insertion: the task selector field sits directly below **Project** and above **Date**, labelled **"Task"** (reusing the label spec 12 already put on the free-text field — this insertion doesn't add a second "Task" label, it relabels the same slot).

- **No task selected** (mock "without a task selected" state): label **"Task"** over the search input (`data-testid="tt-entry-task-selector"` wrapping `tt-entry-task-search-input`, placeholder "Search tasks in {projectName}…"), and beneath it a second, smaller unlabelled row — the original free-text `task` `Input` (`tt-entry-task-input`, placeholder "e.g. API development", per spec 12) for members who'd rather type. Both are visible at once; selecting from the popover replaces this pair with the chip below.
- **Task selected**: the label **"Task"** now sits over the locked chip alone (`tt-entry-task-clear-btn` for its ✕) — the free-text `Input` is hidden entirely while a task is linked (business spec: "the free-text task input is hidden while a task is selected").
- **Project has no key, or no project chosen**: only the plain "Task" `Input` shows, byte-identical to spec 12 — no selector row, no second field.

Changing the project field (FR-14) clears any chosen task and collapses back to the unselected pair, exactly as in the timer bar.

---

## Time Logged section — Task Detail Page

Placed per spec 13's task-detail ASCII layout: left column, below "Children," above the spec-14 comments/activity placeholder — see [13-kanban-board.md § Screens](13-kanban-board.md#screens). Wrapper `data-testid="task-time-logged-section"`.

```
─── Time Logged ──────────────────
Total: 4h 15m
┌─────────────────────────────────┐
│ Aug 27, 2026 · 2h 30m · Alex K. │
│ Aug 26, 2026 · 1h 45m · Jane D. │
└─────────────────────────────────┘
```

- **Heading.** "Time Logged" in the side-content section-heading style already used for "Children" on the task detail page (Grotesk 600, `--fs-16`, a thin `--divider` rule trailing it, matching spec 13's `─── Children (2) ───` treatment).
- **Total.** `data-testid="task-time-logged-total"`, design label **"Total:"** + the value in Grotesk 600 `--fs-18` `--text` (`Xh Ym`, business spec format), directly under the heading.
- **Entry list.** A `--bg-panel-2` list inside a `1px --border` / `--radius-lg` container, one row per entry, up to 10 (business spec cap). Each row (`data-testid="task-time-logged-entry-{id}"`) is an anchor/`<button>`: **date** (`--fs-13` `--text`) · **duration** (`--fs-13` `--fw-medium` `--text`) · a 18px `AvatarInitials` + **member name** (`--fs-13` `--text-sub`), left-to-right, separated by `·`. Hover paints `--hover-bg-tint`; the whole row is the click target, navigating to `/org/{orgId}/time-tracking?view=daily&date={date}` (business spec FR-17). Rows are dividers-only (`--divider` 1px between rows, none on the container edges) — a plain list, not individually bordered cards.
- **Loading.** Three skeleton rows (`--bg-sunken` blocks shaped like the populated row) — no `Skeleton` primitive, same carried DS gap as spec 12's `tt-loading-skeleton`.
- **Empty.** `data-testid="task-time-logged-empty"`, business spec's **"No time logged on this task yet."** in `--text-muted`, replacing the total + list entirely (no zero total shown above it — the empty sentence is the whole section body).

---

## Start Timer — Task Detail Page

Lives in the right side panel per the business spec's placement note ("near the top… must be visible without scrolling on desktop"). Placed as the first control in the side panel, above the "Status" field (mock: a full-width button directly under the `[← Board] MOB-5` header row, before the Status/Assignee/Priority stack).

- **Available.** `data-testid="task-start-timer-btn"`, DS `Button` primary-accent width-100%-of-panel, label **"▶ Start Timer"** (design-owned, mirrors the Timer panel's "▶ Start timer" verb but Title Case here since it's a standalone panel action, not an inline bar control), `36px`–`44px` height. Click → same loading/disabled pattern as spec 12's Start button (label swaps to a `Spinner` + "Starting…" while the request is in flight); on success, toast "Timer started" (business spec, unchanged) and the button swaps to the running-link state.
- **Timer already running (caller's own).** Button is replaced by `data-testid="task-timer-running-link"` — a smaller pill-style link, `--accent-soft` background, `--accent` ink, pulsing-dot + **"⏱ Timer running →"** (design copy), navigating to `/org/{orgId}/time-tracking`. Never a second enabled Start button (business spec FR-23/Alt Flow D).
- **No `UseTimer` capability.** Neither control renders — the panel simply starts at "Status" as it does today, no placeholder gap left behind.
- **Archived project.** Unaffected — Start Timer stays available exactly as on a non-archived project's task (business spec is explicit this is not gated by the archive read-only rule).

---

## Component map

Only what this spec adds; 12's and 13's own component maps are referenced, not repeated.

| Screen element | DS / app component | Props / build | `data-testid` |
|---|---|---|---|
| Task selector (timer) | app control (search `Input` + popover) | shown only when project has `key` | `tt-timer-task-selector` |
| Task search input (timer) | DS `Input` (leading search icon) | placeholder "Search tasks in {projectName}…" | `tt-timer-task-search-input` |
| Task option row (timer) | app `<button>` (list row) | type icon + key + title | `tt-timer-task-option-{id}` |
| Task clear (timer) | DS `IconButton` (✕) | reverts to search | `tt-timer-task-clear-btn` |
| Task selector (modal) | app control | shown only when project has `key` | `tt-entry-task-selector` |
| Task search input (modal) | DS `Input` | placeholder "Search tasks in {projectName}…" | `tt-entry-task-search-input` |
| Task option row (modal) | app `<button>` | type icon + key + title | `tt-entry-task-option-{id}` |
| Task clear (modal) | DS `IconButton` (✕) | reverts to search | `tt-entry-task-clear-btn` |
| Task type glyph | app inline SVG (5 variants, gap) | 14px, paired with key text | — |
| Time Logged section | native `<div>` (side-content) | heading + total + list/empty | `task-time-logged-section` |
| Time Logged total | native `<div>` | "Total: Xh Ym" | `task-time-logged-total` |
| Time Logged entry row | app `<a>`/`<button>` | date · duration · avatar + name | `task-time-logged-entry-{id}` |
| Time Logged empty | native `<div>` | business spec sentence | `task-time-logged-empty` |
| Start Timer | DS `Button` (accent, full-width) | panel-top; loading on click | `task-start-timer-btn` |
| Timer running link | app pill `<a>` | `--accent-soft`; "⏱ Timer running →" | `task-timer-running-link` |

---

## Copy

Validation, error, toast, and empty-state **messages** are owned by [15-time-tracking-tasks.md](15-time-tracking-tasks.md#error-messages) and quoted verbatim where used. Design owns the headings, placeholders, and micro-labels below.

| Slot | Owner | Text |
|---|---|---|
| Task selector placeholder | business spec (quoted) | Search tasks in {projectName}... |
| Task selector no-match row | business spec (quoted) | No matching tasks. |
| Time Logged section heading | design | Time Logged |
| Time Logged total label | design | Total: |
| Time Logged empty | business spec (quoted) | No time logged on this task yet. |
| Start Timer button | design | ▶ Start Timer |
| Timer running link | design | ⏱ Timer running → |
| Timer started/stopped/saved toasts | business spec (unchanged from 12) | Timer started / Timer stopped — {duration} logged / Time entry saved |

---

## States

| State | Trigger | Rendering |
|---|---|---|
| **Selector — hidden** | no project, or project without a `key` | No selector row; plain `task` text input only (spec 12 baseline). |
| **Selector — unselected** | project with `key`, no task chosen | Search input + free-text input both visible (timer panel) / search input + free-text input both visible (modal). |
| **Selector — loading** | query in flight | Spinner row in the popover. |
| **Selector — results** | query resolves, ≥1 match | Up to 20 rows, 6 visible before internal scroll. |
| **Selector — no results** | query resolves, 0 matches | "No matching tasks." non-interactive row. |
| **Selector — locked** | task chosen | Chip replaces search input; free-text input hidden (modal) or represented by the chip alone (timer bar); ✕ visible. |
| **Selector — project changed while locked** | project field changes | Chip clears; reverts to unselected state for the new project; free-text value retained and editable. |
| **Time Logged — loading** | `GET .../tasks/{id}` in flight | 3 skeleton rows. |
| **Time Logged — empty** | 0 visible entries for caller | `task-time-logged-empty` sentence, no total shown. |
| **Time Logged — populated** | ≥1 visible entry | Total + up to 10 rows, each linking to the daily view. |
| **Start Timer — available** | `UseTimer`, no running timer | Enabled accent button. |
| **Start Timer — running (caller's)** | caller already has a running timer | Replaced by "⏱ Timer running →" link; button never shown alongside it. |
| **Start Timer — starting** | click, request in flight | Button shows `Spinner` + "Starting…", disabled. |
| **Start Timer — no capability** | caller lacks `UseTimer` | Neither control renders. |

---

## Responsive behaviour

Follows [12-time-tracking.design.md § Responsive](12-time-tracking.design.md#responsive-behaviour) and spec 13's task-detail responsive rules; this spec adds only the task-selector and Time-Logged-specific notes.

- **Desktop (≥1024px).** Task selector popover anchors directly under its field, `max-width` matching the field, `--shadow-pop`. Time Logged section keeps its two-column placement inside the left content column; Start Timer stays pinned at the top of the (sticky, per spec 13) right side panel, visible without scrolling.
- **Tablet (768–1023px).** Same layout; the modal narrows to 480–520px per spec 12's existing rule, the task selector field narrows with it. Side panel collapses to spec 13's horizontal bar below the title — Start Timer moves to the leading position in that bar.
- **Mobile (<768px).** The task selector's popover becomes a **fullscreen sheet** (not the docked popover): a `--bg-panel` full-viewport-height overlay, its own header with the search input + a "Cancel" close, and a scrollable list of full-width 48px rows (44px+ touch targets) — this is the one departure from 12/13's "no bottom sheets" rule, justified because a docked 6-row popover cannot fit usably at 375px width; it is a page-level sheet with a header and Cancel, not an iOS action sheet. The locked chip and its ✕ keep 44px hit targets. Time Logged stacks full-width below the task title/description (spec 13's mobile accordion/tab placement), each entry row full-width with wrapped date/duration/avatar. Start Timer becomes a full-width 44px button pinned at the top of whichever panel/tab holds the side-panel fields on mobile.

---

## Accessibility

- **Selector as combobox.** The task search input carries `role="combobox"` / `aria-expanded` / `aria-controls` pointing at the popover listbox; each option row is `role="option"`, arrow keys move selection, `Enter` selects, `Escape` closes the popover without clearing an existing selection. The clear (✕) button carries `aria-label="Clear task"`.
- **Locked chip.** Rendered as a labelled, non-interactive region (`aria-live="off"`, plain text) except for the ✕, which is a discrete, always-reachable tab stop.
- **Type glyph + text pairing.** Every task-type icon is always accompanied by the key/title text — colour and shape are never the sole signal (consistent with 12's project-colour rule).
- **Time Logged rows.** Each entry row is a real link/button with an `aria-label` composed of date, duration, and member name ("August 27, 2026, 2 hours 30 minutes, logged by Alex Kaminski").
- **Start Timer / running link.** Both carry accessible names matching their visible text; the running-link's pulsing dot is decorative (`aria-hidden="true"`), not the sole "running" signal — the link text says so.

---

## DS gaps

| Gap | Resolution | Status |
|---|---|---|
| **No task-type icon/colour tokens.** Five types (`epic/story/task/bug/subtask`) need a consistent glyph + colour, undefined anywhere in the DS or in spec 13. | Ship five inline SVG glyphs with hardcoded `oklch` inks (this file's [Task-type iconography](#task-type-iconography) table) until `--task-type-*` tokens land; recommend spec 13 adopt the same mapping for board cards/lists. | new (15); token chore |
| **No combobox/autocomplete primitive.** The task selector is a search input + popover listbox with keyboard nav — no DS `Combobox`/`Autocomplete` component exists. | Build an app-level `TaskSelector` (search `Input` + `role="listbox"` popover) reusing `Input` styling; same shape could later back a generic DS `Combobox`. | new (15); not blocking |
| **No fullscreen-sheet primitive for mobile selectors** (distinct from 07's Modal-has-no-full-screen-variant gap — this is a *non-modal* full-page overlay for a single field's options). | App-level `TaskSelectorSheet` — full `--bg-panel` overlay with its own header/Cancel; the one exception to 12/13's "no bottom sheets" rule, scoped narrowly to the task popover. | new (15); mobile-only |
| **`AvatarInitials` reused at 18px** in the Time Logged row (smaller than the sidebar's default sizes). | Same component, smaller `size` prop — no new component. | new (15); not blocking |
| **No `Spinner`-in-popover precedent** for the task selector's loading row. | Reuses the existing DS `Spinner` centred in a 40px row — same primitive as elsewhere, just a new placement. | new (15); not blocking |
| **Side panel "pinned to top, no scroll" placement for Start Timer** presumes spec 13's side panel is a sticky column (business spec says "implementation may place it wherever fits… must be visible without scrolling"). | This design fixes it as the first element, above Status — recommend spec 13's own design.md (not yet written) adopt the same position when it ships. | new (15); coordination note |

---

## Reference mockup

[15-time-tracking-tasks.mock.html](15-time-tracking-tasks.mock.html) is the visual acceptance target for the task selector (unselected, popover-open, locked, filtered, no-results) in both the Timer panel and the Add/Edit Time Entry modal, and for the Time Logged section plus Start Timer states on the task detail page, at desktop plus two mobile states. `12-time-tracking.mock.html` remains the acceptance target for everything this spec does not modify (the calendar/weekly/daily views, the topbar indicator, spec-12's idle/running bar chrome). Behavioural verification runs against the business spec's Test Cases (TC-15-*) and the running API/UI.
