---
id: "12"
kind: design
title: Time Tracking — Design
pairs-with: 12-time-tracking.md
routes: ["/org/{orgId}/time-tracking"]
design-system: "1_DS for dev"
tags: [time-tracking, timer, time-entry, running-timer, topbar-indicator, calendar-heatmap, time-grid, first-day-of-week, monthly-view, weekly-view, daily-view, entry-modal, member-filter, sidebar, time-section, timezone, meridian, light-only]
---

# 12 — Time Tracking · Design

Visual and interaction specification for the **Time Tracking** surface: a single role-gated page (`/org/{orgId}/time-tracking`) where an `admin`/`manager`/`user` logs time by running a **server-side timer** or adding **manual entries**, and reviews logged time through three views — a **monthly calendar heat-map** (default), a **weekly time grid**, and a **daily time grid**. It also adds a new **TIME** sidebar section carrying the **Time Tracking** nav row, and — as a shell addition — a **topbar timer indicator** that persists on every signed-in page while a timer is running. Pairs with [12-time-tracking.md](12-time-tracking.md), which owns every API contract, the permission matrix, the validation and toast **messages**, the empty-state sentences, the discard/delete confirmation strings, and the full `data-testid` roster. This file owns the visual and interaction detail only — layout, DS component mapping, headings, micro-labels, placeholders, states, responsive, and accessibility. Neither restates the other.

**This is a delta on [00-app-shell.design.md](00-app-shell.design.md).** The page renders inside the existing shell (sidebar, top bar, page header). This spec adds two shell elements: a **new `SectionLabel` ("TIME")** with one role-gated `NavItem` ("Time Tracking") added at the top of the shell's nav list (the TIME group leads it, above PEOPLE/PROJECTS), and a **timer indicator in the top bar** — both anticipated by 00 (its [Planned rows](00-app-shell.design.md#planned-rows) table lists `TIME → Time Tracking → /org/{orgId}/time-tracking`, shipping with spec 12, visible to admin/manager/user; its [Top bar](00-app-shell.design.md#top-bar) already reserves the timer chip "to the left of the account button"). The page never redraws the frame.

**Visual acceptance target:** [12-time-tracking.mock.html](12-time-tracking.mock.html) — a static, token-only render of all desktop states (monthly heat-map, weekly time grid, daily time grid, timer-running, admin member-filter, Add-Entry modal in time-range and duration-only modes, validation errors) plus four mobile states (M-01 daily + timer-running, M-02 centered modal + compact monthly). Every value below is read from that mockup and expressed as a Meridian token or DS component.

> **The mockup is the structural target for the weekly and daily views.** Both are the mock's **Outlook-style time grids** — an hour gutter plus day column(s), timed entries as positioned blocks, duration-only entries in a strip below, a now-line, project-coloured blocks — matching the business spec §Screens and its updated testid roster (`tt-weekly-entry-{id}`, TC-12-E2E-04 asserts the grid, entry blocks, day totals, and week total — no project rows/totals). The mock is likewise followed for the monthly heat-map, the top **quick-actions timer bar**, the Add-Entry modal, and the topbar indicator.

**Theme:** light only, no theme toggle. **Tokens:** every value below references a token already in `1_DS for dev/tokens/*.css`; no hex, no px is written by hand. The mock hardcodes several `oklch(...)` values (the amber running-timer chip, the project-category event colours, the calendar heat-map tints) that have **no token yet** — each is recorded as a DS gap.

---

## What this surface owns vs. the business spec

| Business spec (12-time-tracking.md) owns | This design owns |
|---|---|
| Timer + time-entry API contracts, the two input modes, duration maths, midnight rule | Timer-bar layout (idle/running), the weekly and daily time-grid layout, the heat-map presentation |
| Permission matrix, role gating, `user`-vs-admin visibility, 403/404 boundaries | How the gated `NavItem`, the member filter, and per-entry edit/delete controls read that gate visually |
| **All** fixed strings (validation, error, toast, discard/delete confirm, empty state) | Page title, view-toggle labels, period-label format, quick-bar placeholders, modal field labels, section micro-labels, info-banner microcopy |
| The full `data-testid` roster | Which DS element each `data-testid` lands on |

The timer's server-side integrity (start/stop/discard, one-per-member, `startedAt` authority), the range-query bound, and the cross-member/cross-org rules are all the business spec's and unchanged. This is a **presentation** onto that data — the client's ticking clock is decorative; the server owns duration.

---

## Sidebar integration

The **TIME** section conforms to 00's sidebar rules ([Sidebar](00-app-shell.design.md#sidebar)). It is a DS `SectionLabel` (`1_DS for dev/components/typography/SectionLabel.jsx` — uppercase Grotesk `--fs-11`, 1px tracking, `--text-faint`) followed by one DS `NavItem` (`1_DS for dev/components/navigation/NavItem.jsx`), prepended **before** the `PEOPLE → Members` and `PROJECTS → Projects` groups in `apps/web/src/layout/Sidebar.tsx`. Nav order top-to-bottom is **Time / People / Projects** — the **TIME** group **leads the nav** as the daily-driver surface, above PEOPLE and PROJECTS. Spec 11 already refactored the sidebar into labelled groups; spec 12 adds one more group at the top of the same array.

- **Route / href:** `/org/{orgId}/time-tracking`; label **"Time Tracking"**; `data-testid="nav-time-tracking"`; icon a new clock glyph added to `apps/web/src/layout/icons.tsx` (the DS ships no icon beyond `Eye`/`EyeOff` — 00's carried gap). The mock draws a stroked circle-with-hands at 20px (`<circle r=7>` + `M10 6v4l3 2`).
- **Active rule.** Active when the current path equals its href or is nested beneath it (00's active-when-nested rule) — Time Tracking has no child routes today, so it lights only on its own path. Active paints `--accent` ink on `--accent-soft` with `--accent-border`; inactive hover is the universal `--hover-bg-tint`.
- **Role gating.** Visible to `admin`/`manager`/`user`; **invisible to `viewer`**. This differs from Projects (admin/manager only) — Time Tracking is the first row a plain `user` sees — the TIME group leads the nav, so it sits above Members for every role that can see it. The shell resolves the session before it renders (00's "role-gated rows never flash" rule), so the `NavItem` — and, when only Members/Time are visible, its `SectionLabel` — is omitted from the nav array when the role lacks `ViewTimeTracking`, never rendered-then-hidden. TC-12-E2E-09 asserts the row **absent** for `viewer`, with a direct navigation redirected/forbidden.
- **No badge.** The row carries no count pill (`NavItem`'s `badge` prop is left unset); the running-timer signal lives in the top bar, not the sidebar.

---

## Topbar timer indicator

A shell addition living in 00's [Top bar](00-app-shell.design.md#top-bar), to the **left of the account button**, visible **only** while the caller has a running timer. The mock (state 04) renders it as an amber pill: a pulsing dot, the elapsed time in mono, the project name behind a hairline divider, and a red square stop button.

> **Amended by the design-system merge, ruling E2/D1 — the system wins including layout.** This
> section describes **one** control; the system draws **two**, and every statement below about
> the chip's anatomy is split between them.
>
> - The bar's element is the system's `MiniTracker` — a 144px pill holding a glyph, the clock,
>   and a chevron. `topbar-timer-indicator` names it, unchanged. It is a real
>   `<button aria-expanded>` (decisions §92), and it **discloses** rather than navigates.
> - The project name and the stop button move into the system's `Tracker` (§89), the floating
>   panel that pill opens: a 380px card at the top-right in `--color-tracker-blue`, carrying a
>   circular **STOP**, the project, the clock, and the task under them.
>     `topbar-timer-project`, `topbar-timer-elapsed` and `topbar-timer-stop-btn` are unchanged in
>   meaning and now live there, so a case that reads one opens the panel first
>   (`openTracker(page)`).
>
> The pill was never going to hold them: this document's own next bullets truncate the project
> to fifteen characters and drop it below 768px, which is a 144px control saying so.
>
> **The amber goes with it.** `--color-tracker-blue` was reserved in the system for exactly this
> widget before anything rendered it, and the DS-gap row below asking for `--timer-*` tokens is
> answered by that token rather than by new ones. The stop control is the panel's white circle
> on the blue field, not a red square: red is `--status-error`, which this grid already spends
> on the now-line.

- **Data + provider.** A **`RunningTimerProvider`** wraps the shell content, exactly as spec 10 seeded the requests badge from a shell-level context. On shell mount — **after `/api/me` resolves** — it fires `GET /api/organizations/{orgId}/timer` once (no polling). If `timer` is non-null it seeds `{ id, projectId, projectName, task, description, startedAt }`; the provider owns a single `setInterval` ticking once per second, deriving elapsed = `now − startedAt`. Both the topbar indicator and the [TT-page timer bar](#timer-bar-idle--running) subscribe to this one provider, so the two clocks never drift and starting/stopping in one place updates the other with no refetch.
- **Anatomy** (`data-testid="topbar-timer-indicator"`):
  - Pulsing status dot (amber; DS gap — no timer-amber token, see [DS gaps](#ds-gaps)).
  - **Elapsed** `HH:MM:SS` in `--font-mono`, `data-testid="topbar-timer-elapsed"`; carries `aria-live="polite"` updating at **minute** granularity for screen readers (per business spec §Accessibility), while the visible text still ticks every second.
  - **Project name** truncated (~15 chars) with ellipsis, or the literal **"No project"** when `projectId` is null, `data-testid="topbar-timer-project"`. A left hairline separates it from the elapsed time.
  - **Stop button**, a small square-icon control, `data-testid="topbar-timer-stop-btn"`, `aria-label="Stop timer"`.
- **Interactions.**
  - Clicking the elapsed time or project name navigates to `/org/{orgId}/time-tracking` (the running timer bar is in view there).
  - Clicking stop calls `POST .../timer/stop`, clears the provider state (indicator disappears), and toasts the business spec's **"Timer stopped — {duration} logged"** (`toast-timer-stopped`).
- **Chip surface.** The mock uses hardcoded amber `oklch(...)` for background/border/ink and a `--error-500`-adjacent red for the stop button. Shipped over tokens once the timer-amber tokens land (DS gap); the stop button reuses `--error-500`.
- **Mobile.** Collapses to a compact pill — dot + elapsed only, no project name (mock `.m-topbar-timer`), tapping navigates to the page. Same `data-testid`s.

---

## Time Tracking page

### Page anatomy

```
  ┌──────────────┬────────────────────────────────────────────┐
  │ Teammerly●   │   [⏱ 01:23:45 · Alpha ■]   Alex K.  (AK)   │  ← 00 top bar + timer chip
  ├──────────────┼────────────────────────────────────────────┤
  │ TIME         │  Time Tracking                              │  ← 00 page header (no action)
  │  ▣ Time      │                                             │
  │ PEOPLE       │  ┌─ quick-actions bar ────────────────────┐ │  ← timer (idle/running)
  │  ▣ Members   │  │ [Project ▾][What are you on?] +Add ▶St │ │
  │ PROJECTS     │  └────────────────────────────────────────┘ │
  │  ▣ Projects  │  [Member ▾] [Daily|Weekly|●Monthly]  [Today <  Aug 2026  >] │  ← toolbar
  │              │  ┌────────────────────────────────────────┐ │
  │              │  │            active view                  │ │
  │              │  └────────────────────────────────────────┘ │
  └──────────────┴────────────────────────────────────────────┘
```

- **Route / access.** `/org/{orgId}/time-tracking`, rendered inside the shell, wrapper `data-testid="tt-page"`. The route's server component checks the session and, lacking `ViewTimeTracking` (i.e. `viewer`), redirects to `/org/{orgId}/members`; the API's own `403`/`404` (messages owned by the business spec) is the real boundary. Loading follows 00 (centred `Spinner` until `/api/me` resolves).
- **Page header.** 00's page header. Title **"Time Tracking"** (`data-testid="tt-page-title"`, Grotesk 600 / `--fs-27` / -.6px tracking). **No subtitle, no trailing action button** — every action (Add entry, Start timer) lives in the quick-actions bar below, per the mock.
- **Quick-actions bar (the timer).** A full-width `--bg-panel` card (1px `--border`, `--radius-2xl`) directly under the header, holding the timer in its idle or running state — see [Timer bar](#timer-bar-idle--running). This is the mock's placement; it is the same element the business-spec roster calls `tt-timer-panel`.
- **Toolbar.** Below the timer, one flex row (`flex-wrap`): on the left the [member filter](#member-filter-adminmanager) (admin/manager only) then the [view toggle](#view-toggle); on the right the [period navigation](#period-navigation). Wraps to two rows when the viewport narrows.
- **Active view.** The monthly / weekly / daily view fills the remaining content column.

### Member filter (admin/manager)

The mock (state 05) renders a pill button — a small avatar + the member's name + a caret — that opens a member picker. Shipped as a DS `Select` (`1_DS for dev/components/forms/Select.jsx`), `data-testid="tt-member-filter"` (spread through `...rest` onto the trigger). Options are the org's `active` members; the default option is the design-owned **"My time"** (the caller). Selecting a member re-fetches `GET .../time-entries?...&membershipId=…` and re-renders the active view.

- **Leading avatar in the trigger.** The mock shows a 22px initials avatar inside the trigger; DS `Select` renders a plain text trigger only. Treated as a small DS gap — either extend `Select` to accept a leading node or build an app-level filter trigger reusing `AvatarInitials` (see [DS gaps](#ds-gaps)).
- **Admin context banner.** When a member other than "My time" is selected, an `--accent-soft` info strip (1px `--accent-border`, `--radius-lg`) appears above the view with the design-owned line **"Viewing {name}'s entries. You can edit or delete any block by clicking it."** — a presentation cue that admin/manager edit rights are active on every entry. Not shown for "My time". No `data-testid` in the roster (internal microcopy).
- **Not rendered for `user`/`viewer`.** A `user`'s `membershipId` param is silently ignored server-side (business spec §Security 8 / TC-12-INT-25), but the control is simply absent from their UI.

### View toggle

A **segmented pill** — the mock's `.seg` control, which is the DS `Toggle` (`1_DS for dev/components/navigation/Toggle.jsx`: `--bg-sunken` track, `--radius-pill`, active segment on `--bg-panel` with `--shadow-toggle`). Three options **Daily / Weekly / Monthly**; **Monthly** is the default on first visit. Segments carry `data-testid="tt-view-daily"`, `tt-view-weekly`, `tt-view-monthly`.

> The orchestrator's read-list named DS `Tabs` for this toggle, but the mock draws a segmented pill, which is precisely `Toggle`. This design ships `Toggle` as the closer visual match; `Tabs` (underline) is the wrong affordance here. Recorded in [DS gaps](#ds-gaps).

Switching views **preserves the period context** — switching from a specific day to weekly shows the week containing that day; to monthly, the month containing it. Keyboard `1`/`2`/`3` switch daily/weekly/monthly (business spec §Accessibility).

### Period navigation

Right side of the toolbar, in the mock's order: a **"Today"** reset button, a **prev** arrow, the **period label**, a **next** arrow.

- **Today button.** `today-btn`, resets the period to the current day/week/month for the active view. **No `data-testid` in the roster** — recommend `tt-period-today` (flagged for the business spec to adopt, [DS gaps](#ds-gaps)).
- **Prev / next arrows.** DS `IconButton`-style chevrons, `data-testid="tt-period-prev"` / `tt-period-next`, stepping one day/week/month by the active view. Keyboard `←`/`→` do the same (business spec §Accessibility).
- **Period label.** `data-testid="tt-period-label"`, Grotesk 600 `--fs-16`, design-owned format per view:
  - Monthly → **"August 2026"**.
  - Weekly → **"Aug 24 – 30, 2026"**.
  - Daily → **"Tue, Aug 25, 2026"**, with a **" · Today"** suffix when the day is today (mock).

---

## Monthly view (default)

A calendar **heat-map grid** (`data-testid="tt-calendar-grid"`) inside a `--bg-panel` card, matching mock state 01.

- **Header row.** Seven day-name cells on `--bg-header`, uppercase Grotesk `--fs-11`, 1.2px tracking, `--text-muted`. The header **order and the grid's first column follow the caller's `firstDayOfWeek`** (spec 06 — **Mon Tue Wed Thu Fri Sat Sun** by default, or **Sun Mon … Sat** when set to "Sunday"); `/api/me` carries `firstDayOfWeek` so the shell resolves it on load. Which 6-week window is shown shifts with the same preference (`weekStartsOn` → `monthGrid`).
- **Grid.** `repeat(7, 1fr)` weeks-as-rows; each cell `aspect-ratio ~1.4/1`. A cell (`data-testid="tt-calendar-cell-{YYYY-MM-DD}"`, keyed by ISO date) shows the **day number** top-left (`--fs-13`) and the **total hours** bottom-right (`data-testid="tt-calendar-hours-{YYYY-MM-DD}"`, Grotesk 600 `--fs-18`, `Xh Ym` e.g. **"8h 0m"**), or an em-dash **"—"** in `--text-faint` when zero.
- **Heat-map intensity.** Background deepens with logged hours — the mock's three tiers `h-low` / `h-med` / `h-high` (progressively saturated violet tints). These are **hardcoded `oklch` in the mock with no token** (DS gap). App-side: bucket the day's total (e.g. ≤4h / ≤7h / >7h → tiers 1–3) and paint a `--heat-1/2/3` token background; intensity is **never the sole signal** — the numeric hours always accompany it (accessibility).
- **Today marker.** The current day's cell carries a 2px `--accent` outline (`outline-offset: -2px`) and its day number turns `--accent` 600 (mock `.cal-cell.today`).
- **Weekend + adjacent-month.** Weekend cells (Sat/Sun) are **not** muted — they render as regular available days on `--bg-panel` (some members work weekends); the weekday name is the only weekend cue. Days from the previous/next month still render greyed on `--bg-panel-2` with `--text-faint` and always show "—" (see [Resolved data notes](#resolved-data-notes) — a single ≤31-day fetch covers the current month; adjacent-month cells are not fetched and stay empty).
- **Month total.** Below the grid, right-aligned: **"Total this month "** + a Grotesk 600 value **"150h 0m"**, `data-testid="tt-month-total"`.
- **Click behaviour.** Clicking any cell switches to the **daily view** for that date (business spec + TC-12-E2E-03). Cells are `<button>`s with an `aria-label` describing the date and total (accessibility).

---

## Weekly view

An **Outlook-style time grid** (`data-testid="tt-weekly-grid"`) — an app-built grid (shared `TimeGrid`, see [DS gaps](#ds-gaps)) inside a `--bg-panel` card, matching mock state 02. A left **hour gutter** plus **seven day columns**; timed entries render as **positioned blocks** on the hour rows, duration-only entries drop to a **strip below the grid**, and a **now-line** marks the current time in today's column. The gutter's corner label shows the viewer's timezone as a GMT offset (`gmtLabel(tz)`, e.g. "GMT+2", or "UTC" when the offset is 0), and all blocks/times are projected into that zone (see [Resolved data notes](#resolved-data-notes)). Every total is client-derived from `entries[]` (see [Resolved data notes](#resolved-data-notes)).

- **Column order + week range follow `firstDayOfWeek`.** The seven columns are ordered from the caller's spec-06 preference (Mon-first by default, Sun-first when set to "Sunday"); the period label's week range shifts with it. `/api/me` carries `firstDayOfWeek`. **Weekend columns (Sat/Sun) are not muted** — they render as regular available days on `--bg-panel`, like weekdays (some members work weekends); the weekday name is the only weekend cue.
- **Column headers** carry the weekday + date and that day's **total** (`data-testid="tt-weekly-day-total-{YYYY-MM-DD}"`, `Xh Ym` or "—"); the current day's header tints `--accent`.
- **Entry block** (`data-testid="tt-weekly-entry-{id}"`): a `<button>` positioned by its start/end (top/height from the start/end projected into the viewer's account timezone — see [Resolved data notes](#resolved-data-notes)), lane-packed so overlapping entries sit side-by-side. It shows the time range, the project name (or **"(no project)"**), and the task, and drills into the **daily view** for its date on click. The block is **colour-coded per project** (a hashed palette over inline `oklch` — DS gap, no `--project-*` tokens) with a 3px left rail; the project name is always present as text, so **colour is never the sole signal**.
- **Duration-only strip.** Entries with no start/end render as chips in a `--bg-panel-2` strip below the grid under a **"Duration-only"** label, each labelled with its weekday and carrying the same `tt-weekly-entry-{id}` and drill-into-day click.
- **Now-line.** A 2px `--error-500` line (with a dot) at the current time in the viewer's account timezone, shown only when today is a visible column and the time is within the grid's hour window. `role="separator"`, `aria-label="Current time, HH:MM"`.
- **Week total.** Below the grid, right-aligned: **"Total this week "** + a Grotesk 600 value, `data-testid="tt-week-total"`.
- **Empty week** → the grid still renders (seven day columns, empty, day totals **"0h 0m"**) with a modest [empty-state](#states) note beneath it — not a full-view replacement. On a narrow viewport the grid scrolls inside its own `overflow-x:auto`/`overflow-y:auto` container — the page body never scrolls sideways.

---

## Daily view

An **Outlook-style time grid** for one day (`data-testid="tt-daily-list"`) inside a `--bg-panel` card, matching mock states 03–04. A left **hour gutter** plus a **single wide day column** over the same `TimeGrid` the weekly view uses. Timed entries render as **positioned blocks**; **duration-only** entries (no start/end) drop to a **strip below the grid** under a design-owned **"Duration-only (no time set)"** label; a **now-line** marks the current time when viewing today. The gutter's corner label shows the viewer's timezone as a GMT offset (`gmtLabel(tz)`), and all blocks/times are projected into that zone (see [Resolved data notes](#resolved-data-notes)).

- **Column header.** The day label (weekday + date, with **" · Today"** when today) and the **day total** — **"Total logged {Xh Ym}"**, `data-testid="tt-day-total"`.
- **Entry block** (`data-testid="tt-entry-row-{id}"`): a `<button>` positioned by its start/end (top/height from the start/end projected into the viewer's account timezone — see [Resolved data notes](#resolved-data-notes)), lane-packed for overlaps. It shows the **time range · duration** ("09:00 – 11:30 · 2h 30m"), the **project name** or **"(no project)"** · **task**, and a **truncated description** line. Clicking the block opens the [modal](#addedit-time-entry-modal) pre-filled. The block is **colour-coded per project** (hashed `oklch` palette — DS gap; 3px left rail) with the project name always present as text — **colour is never the sole signal**.
- **Edit/delete controls.** Hover/focus reveals a trailing DS `IconButton` pencil (`label="Edit entry"`, `data-testid="tt-entry-edit-{id}"`) and trash (`label="Delete entry"`, `data-testid="tt-entry-delete-{id}"`, danger hover) layered on the block; duration-only chips carry the same pair. **Visibility:** own entries for **every** role; **any** entry for admin/manager (`canManage`, paired with the member-filter context banner). Delete → `Modal`-composed confirm with the business spec's **"Delete this time entry? This action cannot be undone."**; confirm → `DELETE .../time-entries/{id}`, toast **"Time entry deleted"** (`toast-entry-deleted`).
- **Now-line.** A 2px `--error-500` line at the current time in the viewer's account timezone, shown only when viewing today and the time is within the grid's hour window. `role="separator"`, `aria-label="Current time, HH:MM"`.
- **Empty.** Today → the business spec's **"No time logged today. Start a timer or add an entry."**; another day → **"No time entries for this period."** (`tt-empty-state`).
- **Keyboard.** Each block is focusable; `Enter` opens edit; the pencil/trash are discrete tab stops (business spec §Accessibility).

---

## Timer bar (idle / running)

The quick-actions card under the header **is** the timer (`data-testid="tt-timer-panel"`). It has two states, both full-width, matching mock states 01 (idle) and 04 (running).

### Idle

A horizontal row: a project `Select` (`data-testid="tt-timer-project-select"`, placeholder **"Select project…"**, options filtered by assignment for `user`), a task `Input` (`data-testid="tt-timer-task-input"`, placeholder **"What are you working on?"**), a hairline divider, then two actions — a DS `Button variant="ghost"` **"+ Add entry"** (`data-testid="tt-add-entry-btn"`, opens the [modal](#addedit-time-entry-modal)) and an **amber** **"▶ Start timer"** primary (`data-testid="tt-timer-start-btn"`; calls `POST .../timer/start`, toast `toast-timer-started`).

- **Description input.** The roster requires `tt-timer-description-input`, but the mock's compact idle bar shows **only** project + task. This design includes the description field (a third input, or a secondary expand) to satisfy the roster and match the running state's editable metadata — flagged as a minor mock omission in [DS gaps](#ds-gaps).
- **Amber primary.** "Start timer" is amber, not accent-violet (mock `.btn-amber`) — no amber-button token yet (DS gap); reuses the timer-amber tokens once they land.

### Running

The bar switches to a highlighted state (mock `.quick-bar.running`, near-white amber tint + amber border): a large **elapsed chip** on the left (pulsing dot + `HH:MM:SS` in `--font-mono` `--fs-18`, `data-testid="tt-timer-elapsed"`, fed by the shared `RunningTimerProvider`), the **editable** project `Select` and task `Input` (and description), a divider, then **"Discard"** (`Button variant="ghost"`, `data-testid="tt-timer-discard-btn"`) and a red **"■ Stop & save"** (`Button variant="danger"`, `data-testid="tt-timer-stop-btn"`).

- **Editing while running.** Changing project / task / description calls `PUT .../timer` on blur; `startedAt` is untouched and the topbar indicator's project name updates via the provider (business spec Alt Flow B).
- **Stop & save.** `POST .../timer/stop` → bar returns to idle, topbar indicator clears, toast **"Timer stopped — {duration} logged"** (`toast-timer-stopped`), the new entry appears in the active view.
- **Discard.** Opens a confirm dialog with the business spec's **"Discard this timer? No time entry will be saved."**; confirm calls `DELETE .../timer`, toast **"Timer discarded"** (`toast-timer-discarded`). No `ConfirmDialog` primitive — composed from `Modal` (carried gap from 09).

> **Placement divergence — flagged.** The business spec §UI puts the "Timer panel" at the **bottom** of the content, above an "Add entry" button. The mock puts it at the **top** as the quick-actions bar with "Add entry" beside "Start timer". This design ships the mock's top placement; the same `tt-timer-*` and `tt-add-entry-btn` testids apply. Recorded in [DS gaps](#ds-gaps).

---

## Add/Edit Time Entry modal

A DS `Modal` (`1_DS for dev/components/surfaces/Modal.jsx`), `data-testid="tt-entry-modal"`, `width={520}` (mock), focus-trapped, closing on Esc / backdrop / Cancel, focus returning to the trigger. Matches mock states 06 (time-range), 07 (duration-only), 08 (validation).

| Mode | Title | Primary button |
|---|---|---|
| Create | **Add Time Entry** | **Save entry** (`data-testid="tt-entry-save-btn"`) |
| Edit | **Edit Time Entry** | **Save changes** (`tt-entry-save-btn`) |

Fields, top to bottom:

- **Project** — DS `Select`, label **"Project"**, `data-testid="tt-entry-project-select"`, placeholder **"Select project…"**. Options are active projects the caller can log to — filtered by assignment for `user` (business spec FR-8); includes a **"— No project —"** option. Inline error node `data-testid="field-error-projectId"`.
- **Task** — DS `Input`, label **"Task"**, `data-testid="tt-entry-task-input"`, placeholder **"e.g. API development"**. Error `field-error-task`.
- **Date** — DS `Input type="date"`, label **"Date"**, `data-testid="tt-entry-date-input"`. Defaults to **today** for new entries, or the **currently viewed day** when opened from the daily view. Error `field-error-date` (future / >90-days-past / required, business spec messages).
- **Mode toggle** — a DS `RadioGroup` (`1_DS for dev/components/forms/Radio.jsx`, `direction="row"`) with **"Time range"** (default) and **"Duration only"**, `data-testid="tt-entry-mode-timerange"` / `tt-entry-mode-duration`. On mobile this becomes a segmented control (mock M-02) — a DS `Toggle`.
- **Time range mode** (default): two `Input type="time"` in a 2-col row — **Start time** (`tt-entry-start-time`, error `field-error-startTime`) and **End time** (`tt-entry-end-time`, error `field-error-endTime`) — followed by a **computed-duration readout** **"Duration: 2h 30m (computed)"**, `data-testid="tt-entry-duration-computed"`, auto-recomputed on change (client-side; server recomputes authoritatively).
- **Duration-only mode**: the time inputs are replaced by a 2-col **Hours** / **Minutes** pair — `Input type="number"`, `data-testid="tt-entry-duration-hours"` / `tt-entry-duration-minutes`, error `field-error-durationMinutes`.
- **Description** — DS `Input`, label **"Description"**, `data-testid="tt-entry-description-input"`, placeholder **"Optional notes…"**. Error `field-error-description`.
- **Footer.** DS `Button variant="ghost"` **"Cancel"** (`data-testid="tt-entry-cancel-btn"`) + the mode's primary, which shows `loading` and blocks the click while the POST/PUT is in flight (fields go read-only). On success: modal closes, toast **"Time entry saved"** (`toast-entry-saved`), the entry appears/updates in the active view.

Admin/manager creating for another member: `membershipId` is taken from the current member-filter selection (business spec FR-31), not a modal field.

---

## Component map

Only what this spec adds or reuses; 00's shell chrome and the DS primitives are referenced, not repeated.

| Screen element | DS / app component | Props / build | `data-testid` |
|---|---|---|---|
| Sidebar Time section label | DS `SectionLabel` | "TIME" | — |
| Sidebar Time row | DS `NavItem` (in `Sidebar.tsx`) | `href`, `label="Time Tracking"`, role-gated (not viewer), no badge | `nav-time-tracking` |
| Topbar timer chip | app element in `apps/web/src/layout/` topbar | fed by `RunningTimerProvider`; amber pill | `topbar-timer-indicator` |
| Topbar elapsed | app `<span>` mono, `aria-live="polite"` (minute) | ticks 1s | `topbar-timer-elapsed` |
| Topbar project | app `<span>` truncated / "No project" | — | `topbar-timer-project` |
| Topbar stop | app icon `<button>` | `POST .../timer/stop` | `topbar-timer-stop-btn` |
| Page wrapper | native `<div>` inside shell content | — | `tt-page` |
| Page title | 00 page header | "Time Tracking" | `tt-page-title` |
| Member filter | DS `Select` (+leading avatar, gap) | admin/manager only; "My time" default | `tt-member-filter` |
| View toggle | DS `Toggle` | Daily/Weekly/Monthly; Monthly default | `tt-view-daily` · `tt-view-weekly` · `tt-view-monthly` |
| Today reset | app `<button>` | resets period | *(no roster testid — rec. `tt-period-today`)* |
| Period prev/next | DS `IconButton` chevrons | step by view | `tt-period-prev` · `tt-period-next` |
| Period label | native `<div>` | per-view format | `tt-period-label` |
| Timer bar | native card (`--bg-panel`) | idle/running; = "Timer panel" | `tt-timer-panel` |
| Timer project | DS `Select` | assignment-filtered for `user` | `tt-timer-project-select` |
| Timer task | DS `Input` | placeholder "What are you working on?" | `tt-timer-task-input` |
| Timer description | DS `Input` | (mock omits in bar — gap) | `tt-timer-description-input` |
| Start timer | DS `Button` (amber, gap) | `POST .../timer/start` | `tt-timer-start-btn` |
| Stop & save | DS `Button variant="danger"` | `POST .../timer/stop` | `tt-timer-stop-btn` |
| Discard | DS `Button variant="ghost"` | confirm → `DELETE .../timer` | `tt-timer-discard-btn` |
| Timer elapsed | native `<span>` mono | from provider | `tt-timer-elapsed` |
| Add entry | DS `Button variant="ghost"` | opens modal | `tt-add-entry-btn` |
| Monthly grid | app calendar heat-map (gap) | 7-col weeks; token heat tiers | `tt-calendar-grid` |
| Month day cell | app cell `<button>` | day# + hours/"—" | `tt-calendar-cell-{YYYY-MM-DD}` |
| Month day hours | native `<span>` | `Xh Ym` | `tt-calendar-hours-{YYYY-MM-DD}` |
| Month total | native `<div>` | "Total this month {n} hours" | `tt-month-total` |
| Weekly grid | app `TimeGrid` (gap) | hour gutter × 7 day cols; blocks + now-line; `firstDayOfWeek`-ordered | `tt-weekly-grid` |
| Weekly entry block | app `<button>` (positioned) | time range / project / task; project colour + text; click → daily | `tt-weekly-entry-{id}` |
| Weekly day total | native `<span>` (col header) | that day's total, `Xh Ym` | `tt-weekly-day-total-{YYYY-MM-DD}` |
| Week total | native `<div>` | "Total this week {n} hours" | `tt-week-total` |
| Daily grid | app `TimeGrid` (gap) | hour gutter × 1 day col; blocks + now-line | `tt-daily-list` |
| Daily entry block | app `<button>` (positioned) | time·dur / project·task / desc + hover actions | `tt-entry-row-{id}` |
| Entry edit | DS `IconButton` (pencil) | opens edit modal | `tt-entry-edit-{id}` |
| Entry delete | DS `IconButton` (trash) | confirm → `DELETE` | `tt-entry-delete-{id}` |
| Day total | native `<div>` | "Total: Xh Ym" | `tt-day-total` |
| Entry modal | DS `Modal` | `width={520}` | `tt-entry-modal` |
| Modal project | DS `Select` | assignment-filtered | `tt-entry-project-select` |
| Modal task | DS `Input` | — | `tt-entry-task-input` |
| Modal date | DS `Input type="date"` | defaults today/viewed day | `tt-entry-date-input` |
| Mode radios | DS `RadioGroup direction="row"` | Time range / Duration only | `tt-entry-mode-timerange` · `tt-entry-mode-duration` |
| Start/End | DS `Input type="time"` ×2 | 2-col | `tt-entry-start-time` · `tt-entry-end-time` |
| Hours/Minutes | DS `Input type="number"` ×2 | 2-col | `tt-entry-duration-hours` · `tt-entry-duration-minutes` |
| Computed duration | native `<div>` | "Duration: {x} (computed)" | `tt-entry-duration-computed` |
| Modal description | DS `Input` | — | `tt-entry-description-input` |
| Modal save | DS `Button primary` | `loading` in flight | `tt-entry-save-btn` |
| Modal cancel | DS `Button variant="ghost"` | close | `tt-entry-cancel-btn` |
| Field errors | `Input`/`Select` `error` nodes | business spec messages | `field-error-{date,durationMinutes,startTime,endTime,task,description,projectId}` |
| Discard confirm | DS `Modal` composition (gap) | business spec discard string; danger confirm | *(internal; no roster testid)* |
| Delete confirm | DS `Modal` composition (gap) | business spec delete string; danger confirm | *(internal; no roster testid)* |
| Loading skeleton | native `<div>` (`--bg-sunken` blocks) | view-shaped placeholders | `tt-loading-skeleton` |
| Empty state | native `<div>` | business spec sentences | `tt-empty-state` |
| Toasts | `useToast()` | business spec strings | `toast-entry-saved` · `toast-entry-deleted` · `toast-timer-started` · `toast-timer-stopped` · `toast-timer-discarded` |

---

## Copy

Validation, error, toast, discard/delete-confirm, and empty-state **messages** are owned by [12-time-tracking.md](12-time-tracking.md) (§Error Messages, §Validation Rules) and quoted where used, never restated. Design owns the titles, labels, placeholders, formats, and microcopy below.

| Slot | Owner | Text |
|---|---|---|
| Sidebar section label | design | TIME |
| Sidebar row | design | Time Tracking |
| Page title | design | Time Tracking |
| Topbar "no project" | design | No project |
| Member filter default | design | My time |
| Admin context banner | design | Viewing {name}'s entries. You can edit or delete any block by clicking it. |
| View toggle | design | Daily / Weekly / Monthly |
| Today button | design | Today |
| Period label — monthly | design | August 2026 |
| Period label — weekly | design | Aug 24 – 30, 2026 |
| Period label — daily | design | Tue, Aug 25, 2026 (· Today) |
| Timer project placeholder | design | Select project… |
| Timer task placeholder | design | What are you working on? |
| Start timer button | design | ▶ Start timer |
| Stop button | design | ■ Stop & save |
| Discard button | design | Discard |
| Add entry button | design | + Add entry |
| Month total prefix | design | Total this month |
| Daily total label | design | Total logged {Xh Ym} |
| Week total prefix | design | Total this week |
| Grid gutter header | design | `gmtLabel(tz)` — the viewer's zone as a GMT offset, e.g. GMT+2 (or UTC when the offset is 0) |
| Duration-only strip label | design | Duration-only (weekly) / Duration-only (no time set) (daily) |
| "no project" / "no time" tokens | design | (no project) / (no time) / — No project — |
| Modal title — create | design | Add Time Entry |
| Modal title — edit | design | Edit Time Entry |
| Modal field labels | design | Project / Task / Date / Start time / End time / Hours / Minutes / Description |
| Mode radios | design | Time range / Duration only |
| Task placeholder | design | e.g. API development |
| Description placeholder | design | Optional notes… |
| Computed duration | design | Duration: {Xh Ym} (computed) |
| Save button — create/edit | design | Save entry / Save changes |
| Cancel button | design | Cancel |
| Validation / error / toast / confirm / empty-state messages | **business spec** | owned at [12-time-tracking.md](12-time-tracking.md#error-messages); not restated |

---

## States

| State | Trigger | Rendering |
|---|---|---|
| **Loading** | `GET .../time-entries` (or `/timer`) in flight | `tt-loading-skeleton`: static `--bg-sunken` blocks shaped to the active view (calendar cells / grid rows) — no `Skeleton` primitive (carried gap). |
| **Empty — period** | range returns no entries | The active view still renders (calendar / weekly / daily grid, empty days, **"0h 0m"** totals); a modest `tt-empty-state` note sits beneath it with the business spec's **"No time entries for this period."** — not a full-view replacement. |
| **Empty — today** | daily view of today, no entries | business spec's **"No time logged today. Start a timer or add an entry."** |
| **Default** | entries present | Active view populated; totals derived client-side. |
| **Timer idle** | no running timer | Quick-actions bar in idle state; no topbar indicator. |
| **Timer running** | `RunningTimerProvider` has a timer | Bar in running state (amber); topbar indicator visible; clock ticks 1s from `startedAt`. |
| **Saving (modal/timer)** | Save/Start/Stop/PUT in flight | Button `loading` + click blocked; fields read-only. |
| **Success** | mutation `2xx` | Toast (business spec string); modal/dialog closes; active view refetches. Server response is authoritative — never hand-patched. |
| **Confirm (discard/delete)** | Discard / entry delete | `Modal`-composed confirm with business spec string; danger confirm shows `loading`. |
| **Error — field** | validation `4xx` | `field-error-*` under the field; modal stays open; button re-enables (mock state 08). |
| **Error — network/server** | any mutation `4xx`/`5xx` | Error toast with business spec's "Something went wrong…"; modal/form retains values; buttons re-enable. |
| **Timer conflict** | `409` on start | Error toast "A timer is already running…"; existing timer continues (business spec Alt Flow G). |
| **Forbidden** | `viewer` navigates to route | Server redirect to `/org/{orgId}/members` (or API 403/404); the sidebar row was never shown. |

---

## Responsive behaviour

Breakpoints follow 00 and the business spec's detailed §Responsive Behavior, which this design visualizes. The desktop mockup is the ≥1024px acceptance target; the mobile mock states (M-01, M-02) are the <768px target. **No native chrome, no sticky bars, no iOS bottom sheets** — a responsive web app in a mobile browser (business spec is explicit).

- **Desktop (≥1024px).** Full 252px sidebar with section labels. Quick-actions bar on one row (project + task + Add entry + Start timer). Weekly grid shows all 7 day columns at natural width with the hour gutter on the left. Daily grid spans the content width; blocks show task + description. Monthly cells square-ish with day number + hours. Modal centered at 520px.
- **Tablet (768–1023px).** Sidebar collapses to the 68px icon rail (00's rule); labels/words hidden, the Time glyph carries its name to a `title` tooltip. Quick-actions bar wraps: project + task on top, actions below. Weekly grid keeps its 7 columns with trimmed widths (scrolls horizontally if tight). Daily blocks show task + one description line. Monthly cells smaller. Modal centered at 480–520px.
- **Mobile (<768px).**
  - **Sidebar** hidden; a hamburger in the top bar opens a left **overlay drawer** with scrim (closes on scrim tap / Escape) — the **same deferred shell drawer spec 11 first required**, not a spec-12 invention (see [DS gaps](#ds-gaps)).
  - **Quick-actions card** sits inline at the top of the content, **not sticky** (mock M-01): project select (40px) / task input (40px) / a two-button row **+ Add entry** (ghost) and **Start** (amber, 44px). It scrolls away with the page; the running timer stays reachable via the topbar pill.
  - **Timer running** turns the card amber with a large mono elapsed chip on top, editable project/task below, and **Discard** / **Stop & save** as equal-width 44px buttons (mock M-01 second phone). Still not sticky.
  - **Daily** grid keeps its hour gutter + single day column; blocks shrink to show time + project + task on one line, description hidden until edit. The pencil/trash icon buttons keep 44px hit boxes.
  - **Weekly** grid scrolls (horizontally across day columns, vertically through hours) inside its own `overflow:auto` container; the page body never scrolls sideways.
  - **Monthly** shrinks to 7 columns; each cell shows the day number and a thin **colour bar** proportional to hours (no numeric text until tapped) — mock `.m-mbar` b3/b5/b8 (hardcoded oklch → the same heat tokens as desktop).
  - **Topbar indicator** → compact pill (dot + elapsed only); tap navigates to the page.
  - **Member filter** (admin/manager) becomes a full-width selector on its own row above the view toggle.
  - **Modals** render as standard centered/near-top web dialogs (56px from top, 12px side margins, scrim behind); the mode toggle becomes a **segmented control** (`Toggle`, 44px targets); Save/Cancel are equal-width 44px buttons. No drag handle, no swipe-to-dismiss (mock M-02).
  - **Touch targets** ≥ 44×44px everywhere (icon buttons pad a 32px glyph to a 44px hit box).

**Timer across devices.** The server-side `RunningTimer` is the single source of truth; the client computes elapsed from `startedAt` on load and every second thereafter. Switching devices mid-timer shows the same elapsed everywhere; timezone changes do not affect elapsed (it is a duration, not a wall-clock display).

---

## Accessibility

- **Entries as controls.** Calendar cells are `<button>`s with descriptive `aria-label`s (date + total hours). Weekly and daily grid blocks are `<button>`s with an `aria-label` composed of time range, project, task, and spoken duration ("09:00 to 11:30, Project Alpha, API development, 2 hours 30 minutes"); the daily block adds discrete pencil/trash tab stops. Both the calendar heat-map tint and the per-project block colour are **always** paired with text (numeric hours / the project name) — colour is never the sole signal.
- **Live regions.** The topbar elapsed carries `aria-live="polite"` at **minute** granularity (avoids per-second screen-reader spam); the visible text still ticks each second.
- **Keyboard.** `←`/`→` step the period; `1`/`2`/`3` switch daily/weekly/monthly; `Enter` on a weekly block opens that day; `Enter` on a daily block opens edit. Logical tab order: page header → timer bar → member filter → view toggle → period nav → the active view's cells/blocks → per-entry actions.
- **Focus trap.** The entry modal and both confirm dialogs trap focus (`Modal`'s behaviour); Escape closes; focus returns to the trigger.
- **Contrast.** All Meridian tokens are pre-validated to WCAG 2.1 AA; the new heat-map and timer-amber tokens must be validated to the same bar when added.

---

## DS gaps

| Gap | Resolution | Status |
|---|---|---|
| **No calendar / month-grid primitive.** The monthly view is a 7-col heat-map with day totals. | Build an app-level `TimeCalendarGrid` over tokens (grid cells, today outline, adjacent-month greying — weekends render as regular days, no muted fill). A first-class DS `Calendar` is arguable but calendar semantics are app/routing-bound (like the shell) — recommend app-level. | new (12); not blocking |
| **No time-grid primitive.** The weekly and daily views are Outlook-style hour grids (gutter + day columns, positioned blocks, lane-packing, now-line). | Build a shared app-level `TimeGrid` over tokens — the two views differ only in column set / block content / duration-only strip. No DS primitive; app-level like the calendar. | new (12); not blocking |
| **No now-line treatment.** A current-time indicator crossing today's column. | App-drawn 2px `--error-500` line + dot, `role="separator"` with an `aria-label`; rendered only when today is visible and the time is in the grid's hour window. | new (12); not blocking |
| **No project-colour palette tokens.** Blocks are colour-coded per project; the mock hardcodes `oklch` event colours (`.ev-*`). | A deterministic hashed `oklch` palette in `TimeGrid` (neutral grey for "(no project)") until `--project-*` semantic tokens land. **Colour is always paired with the project-name text** — never the sole signal (a11y). | new (12); token chore |
| **No heat-map intensity tokens.** Mock hardcodes `oklch` violet tints (`h-low/med/high`) and mobile bars (`b3/b5/b8`). | Add `--heat-1/2/3` (or a scale) tokens; bucket a day's total → tier. Numeric hours always accompany the tint (a11y). | new (12); token chore |
| **No timer-amber semantic tokens.** The topbar chip, running quick-bar, live block, and "Start timer" button all hardcode amber `oklch`. | Add `--timer-*` (bg/border/ink/dot) semantic tokens and, if kept, an amber `Button` treatment; until then reuse `--amber-500` + the literals. | new (12); token chore |
| **View toggle component.** Orchestrator named DS `Tabs`; the mock draws a segmented pill. | Ship DS `Toggle` (segmented) — the correct visual match; `Tabs` (underline) is not used here. | resolved (existing `Toggle`) |
| **`Select` trigger cannot host a leading avatar.** The member-filter trigger shows an avatar + name. | Extend `Select` to accept a leading node, or build an app-level filter trigger reusing `AvatarInitials`. Non-blocking; a plain-text `Select` trigger is an acceptable fallback. | new (12); not blocking |
| **Timer description omitted from the mock quick-bar** though the roster requires `tt-timer-description-input`. | Include the description field (third input or secondary expand) in the bar, matching the running state's editable metadata. | new (12); mock omission |
| **Timer panel placement** (mock top vs business-spec bottom). | Ship the mock's top quick-actions placement; same `tt-timer-panel` / `tt-add-entry-btn` testids. | resolved by mock precedence |
| **No `ConfirmDialog` primitive** (carried from 09). | Discard-timer and delete-entry confirmations composed from `Modal` (one-line body + Cancel/danger-Confirm), per `DeleteConfirmDialog.tsx` precedent. | carried from 09; not blocking |
| **No `Skeleton` primitive** (carried from 04/05/09/11). | `tt-loading-skeleton` uses static `--bg-sunken` view-shaped blocks. | carried; not blocking |
| **`Modal` has no <480px full-screen variant** (carried from 07). | Mobile modals use the standard centered/near-top shell at near-full width (mock M-02), not a drawer. | carried; open chore |
| **Mobile drawer is not yet a shell state** (00 lists it out of scope; spec 11 first required it). | Shell wiring in `apps/web/src/layout/` (burger + overlay + scrim, role-gating the same nav array) — **the same deferred work spec 11 flagged, not a spec-12 invention.** Owned by the shell. | carried from 11; shell wiring |
| **`Input`/`Select` lack a first-class error-testid pass-through** (carried). | `field-error-*` nodes attach the testid to the `error` node explicitly. | carried; not blocking |
| **Icon exports** — clock (nav), play, stop-square, pencil, trash, chevrons, hamburger are not DS exports. | Add to `apps/web/src/layout/icons.tsx` (00's carried icon gap). | carried; not blocking |
| **`NavItem` cannot host a `next/link`** (00's gap). | The Time row passes `href` + intercepted `onClick`, as Members/Projects do. | carried from 00; not blocking |
| **"Today" reset button has no roster testid.** | Recommend `tt-period-today`; flagged for the business spec to adopt. | new (12); roster addition |

### Resolved data notes

The earlier open data dependencies have been resolved by the orchestrator. Recorded here so the frontend builds against settled contracts — no new endpoints are introduced.

1. **Weekly structure = time grid; project totals dropped — resolved.** The weekly view is the mock's **Outlook-style time grid** (not a project×day table). Its roster testids are `tt-weekly-grid`, `tt-weekly-entry-{id}` (per block), `tt-weekly-day-total-{date}` (per day-column header), and `tt-week-total`. The former project-row testids — `tt-weekly-cell-{projectId}-{date}` and `tt-weekly-project-total-{projectId}` — **no longer exist** (a time grid has no project rows or per-project totals) and are removed from the roster.
2. **Entry times render in the viewer's account timezone — resolved (shipped).** `startTime`/`endTime` are stored as absolute UTC instants; the **effective timezone** is the viewer's `Account.timezone` (spec 06), falling back to `'UTC'` when unset (resolved from `/api/me`). Manual `HH:MM` input is interpreted as wall-clock in that zone and converted to a UTC instant on save (`zonedWallClockToUtc`); the grid blocks derive their position and rendered **HH:MM** by projecting the stored instant into the effective zone (`formatWallClockInTz` / `minutesOfDayInTz`), the now-line and the timer-stop `date` / validation "today" use the zone-local date (`localDateInTz`), and the gutter label shows the zone as a GMT offset (`gmtLabel(tz)`, e.g. "GMT+2", or "UTC" when 0). Isomorphic tz helpers (`tzOffsetMinutes`, `zonedWallClockToUtc`, `formatWallClockInTz`, `minutesOfDayInTz`, `localDateInTz`, `gmtLabel`) live in `@devscribed/validation`.
3. **Totals are client-side — resolved.** The list endpoint returns `entries[]` plus a single `totalMinutes`; all calendar-cell, day-, week-, and month-totals are **aggregated on the client** from `entries[]`. No summary endpoint.
4. **Monthly fetch window — resolved.** Fetch the current month's days (1st–last, ≤31 days) in **one** `GET .../time-entries?from=&to=` call; the leading/trailing adjacent-month cells of the 6-week grid render "—" and are **not** fetched.
5. **Member-filter option source — resolved.** The admin/manager member dropdown reuses spec 04's `GET /api/organizations/{orgId}/members`.
6. **Assignable-project source — resolved.** The timer and modal project selectors reuse spec 11's `GET /api/organizations/{orgId}/projects?status=active` — which already returns only the caller's assigned active projects for `user`, and all active projects for admin/manager. No new endpoint.

---

## Required `data-testid` attributes

Single source of the business spec's §Required data-testid Attributes, mapped to the element each lands on.

| `data-testid` | Element | Origin |
|---|---|---|
| `nav-time-tracking` | Sidebar Time `NavItem` | **new (12)** |
| `tt-page` | Page wrapper | **new (12)** |
| `tt-page-title` | Page header `<h1>` | **new (12)** |
| `tt-view-daily` · `tt-view-weekly` · `tt-view-monthly` | View toggle segments | **new (12)** |
| `tt-period-prev` · `tt-period-next` · `tt-period-label` | Period nav | **new (12)** |
| `tt-member-filter` | Member filter `Select` | **new (12)** |
| `tt-calendar-grid` | Monthly heat-map grid | **new (12)** |
| `tt-calendar-cell-{YYYY-MM-DD}` | Month day cell `<button>` | **new (12)** |
| `tt-calendar-hours-{YYYY-MM-DD}` | Month day hours span | **new (12)** |
| `tt-month-total` | Month total line | **new (12)** |
| `tt-weekly-grid` | Weekly time-grid container | **new (12)** |
| `tt-weekly-entry-{id}` | Weekly positioned entry block / duration-only chip | **new (12)** |
| `tt-weekly-day-total-{YYYY-MM-DD}` | Weekly day-total (in the day-column header) | **new (12)** |
| `tt-week-total` | Weekly grand-total line | **new (12)** |
| `tt-daily-list` | Daily time-grid container | **new (12)** |
| `tt-entry-row-{id}` | Daily positioned entry block | **new (12)** |
| `tt-entry-edit-{id}` · `tt-entry-delete-{id}` | Inline edit/delete `IconButton` on a row | **new (12)** |
| `tt-day-total` | Daily "Total:" line | **new (12)** |
| `tt-timer-panel` | Quick-actions/timer bar | **new (12)** |
| `tt-timer-project-select` | Timer project `Select` | **new (12)** |
| `tt-timer-task-input` | Timer task `Input` | **new (12)** |
| `tt-timer-description-input` | Timer description `Input` | **new (12)** |
| `tt-timer-start-btn` | Start timer button | **new (12)** |
| `tt-timer-stop-btn` | Stop & save button | **new (12)** |
| `tt-timer-discard-btn` | Discard button | **new (12)** |
| `tt-timer-elapsed` | Timer elapsed span | **new (12)** |
| `topbar-timer-indicator` | Topbar timer chip | **new (12)** |
| `topbar-timer-elapsed` · `topbar-timer-project` | Topbar elapsed / project | **new (12)** |
| `topbar-timer-stop-btn` | Topbar stop | **new (12)** |
| `tt-entry-modal` | Add/Edit `Modal` | **new (12)** |
| `tt-entry-project-select` | Modal project | **new (12)** |
| `tt-entry-task-input` | Modal task | **new (12)** |
| `tt-entry-date-input` | Modal date | **new (12)** |
| `tt-entry-mode-timerange` · `tt-entry-mode-duration` | Mode radios | **new (12)** |
| `tt-entry-start-time` · `tt-entry-end-time` | Time-range inputs | **new (12)** |
| `tt-entry-duration-hours` · `tt-entry-duration-minutes` | Duration inputs | **new (12)** |
| `tt-entry-duration-computed` | Computed-duration readout | **new (12)** |
| `tt-entry-description-input` | Modal description | **new (12)** |
| `tt-entry-save-btn` · `tt-entry-cancel-btn` | Modal footer | **new (12)** |
| `field-error-date` · `-durationMinutes` · `-startTime` · `-endTime` · `-task` · `-description` · `-projectId` | Modal inline error nodes | **new (12)** |
| `tt-add-entry-btn` | Add entry button | **new (12)** |
| `tt-loading-skeleton` | Loading skeleton | **new (12)** |
| `tt-empty-state` | Empty-state panel | **new (12)** |
| `toast-entry-saved` · `toast-entry-deleted` | Entry toasts | **new (12)** |
| `toast-timer-started` · `toast-timer-stopped` · `toast-timer-discarded` | Timer toasts | **new (12)** |
| `app-sidebar`, `page-title`, `topbar-account-button` | Shell chrome | reused (00) |
| *(recommended)* `tt-period-today` | Today reset button | **proposed (12)** |

---

## Reference mockup

[12-time-tracking.mock.html](12-time-tracking.mock.html) is the visual acceptance target for every part this design adopts from it — the **monthly heat-map**, the **weekly and daily time grids** (hour gutter, positioned blocks, duration-only strip, now-line, project colours), the **quick-actions timer bar** (idle + running), the **topbar indicator**, and the **Add-Entry modal** (time-range, duration-only, validation) — at desktop plus the M-01 / M-02 phone states at <768px. The weekly/daily grids are verified against the mock and the e2e cases (TC-12-E2E-04 weekly grid + entry blocks + day/week totals, TC-12-E2E-05 daily edit/delete). `1_DS for dev/templates/meridian-app/MeridianApp.dc.html` remains the token/value reference for the Meridian look. Behavioural verification (start/stop/discard timer, manual entry create/edit/delete, month/week/day navigation, admin member filter, viewer gating, timer persistence across reload) runs against the business spec's Test Cases (TC-12-*) and the running API/UI.
