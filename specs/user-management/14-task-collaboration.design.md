---
id: "14"
kind: design
title: Task Collaboration — Design
pairs-with: 14-task-collaboration.md
routes: ["/org/{orgId}/projects/{projectId}/tasks/{taskId}"]
design-system: "1_DS for dev"
tags: [labels, comments, watchers, activity-log, task-detail, board-settings, task-cards, markdown, avatars, meridian, light-only]
---

# 14 — Task Collaboration · Design

Visual and interaction specification for **task collaboration**: project-scoped **labels** (assigned on task cards and the task detail page, managed in Board Settings), threaded **comments** on the task detail page, a **watchers** list with a self-service watch toggle, and a read-only chronological **activity log**. There is no new route — every surface here is a delta on spec 13's board, task cards, task detail page, and Board Settings modal. Pairs with [14-task-collaboration.md](14-task-collaboration.md), which owns every API contract, the permission matrix, the validation and toast **messages**, the empty-state sentences, the discard/delete confirmation strings, and the full `data-testid` roster. This file owns the visual and interaction detail only — layout, DS component mapping, headings, micro-labels, placeholders, states, responsive, and accessibility. Neither restates the other.

**This is a delta on [13-kanban-board.md](13-kanban-board.md)'s task detail page and Board Settings modal.** Spec 13's task detail ASCII (§Screens) already reserves the space: "(Comments, watchers, activity log — see spec 14)" below the Children section, and its Board Settings modal reserves "(Labels section — see spec 14)" below Columns. This spec fills both. If [13-kanban-board.design.md](13-kanban-board.design.md) exists at build time, its task-detail and Board-Settings layout is the base this spec's sections attach to; where it does not yet exist, this spec follows spec 13's own ASCII layout (left column: type badge, title, description, Children, then this spec's Comments/Activity; right side panel: Status/Assignee/Priority/… fields, then this spec's Labels chips and Watchers).

**Visual acceptance target:** [14-task-collaboration.mock.html](14-task-collaboration.mock.html) — a static, token-only render of task cards with labels, the populated/composing/editing comment states, the watchers section in both watch states, a 10+ entry activity log, the Board Settings Labels section, the label picker popover, a delete-comment confirmation, and two mobile states. Every value below is read from that mockup and expressed as a Meridian token or DS component.

**Theme:** light only, no theme toggle. **Tokens:** every value below references a token already in `1_DS for dev/tokens/*.css`; no hex, no px is written by hand for structural chrome. The mock hardcodes `oklch(...)` for each label's own color (labels are free-form per-project colors, not a fixed semantic palette) and for the activity-icon tints — both have **no token yet** and are recorded as DS gaps.

---

## What this surface owns vs. the business spec

| Business spec (14-task-collaboration.md) owns | This design owns |
|---|---|
| Label/comment/watcher/activity API contracts, capability matrix, idempotency rules | Chip anatomy, comment-card anatomy, watcher-stack anatomy, activity-entry anatomy and icon system |
| Permission matrix — who can manage labels, edit/delete comments, watch, view activity | How edit/delete controls, the "+ Add Label" button, and admin/manager delete-any affordance read that gate visually |
| **All** fixed strings (validation, error, toast, discard/delete confirm, empty state) | Section headings, micro-labels, placeholders, button labels, confirmation dialog title styling |
| The full `data-testid` roster | Which DS element each `data-testid` lands on |

Label/comment/watcher CRUD, the activity log's server-side authorship, and the auto-watch triggers are all the business spec's and unchanged. This is a **presentation** onto that data — every list here (labels, comments, watchers, activity) renders exactly what the API returns; nothing is computed or cached client-side beyond the "(edited)" comparison already specified by the business spec (FR-12).

---

## Label chip anatomy

The atomic unit reused across task cards, the task-detail Labels field, the label picker, and Board Settings.

- **Shape.** A pill: `--radius-pill` (20px), `--fs-13` Grotesk 500, height 24px (cards) / 26px (task detail chips), padding `4px 10px 4px 8px`.
- **Color derivation.** Each `TaskLabel.color` (a `#RRGGBB` hex from the business spec) is converted client-side to an OKLCH background/border/ink triad at render time: background = the hex lightened toward `--bg-panel` (≈94% lightness, same chroma/hue), border = the hex at ≈65% lightness, ink = the hex darkened to ≈35% lightness for AA contrast on the tinted background. This mirrors the mock's `.lbl-*` swatches, which hardcode six example triads (`--lbl-red`, `--lbl-blue`, `--lbl-violet`, `--lbl-green`, `--lbl-amber`, `--lbl-pink`) — see [DS gaps](#ds-gaps) for the derivation-vs-token tradeoff.
- **Anatomy.** A small filled dot (8px circle, the raw label color, no derivation) + the label name, truncated at ~18 chars with an ellipsis + native `title` tooltip for the full name.
- **Hover (task-detail chip only).** Darkens border to the swatch's border-strength tone; cursor stays default (chips are not clickable on cards — read-only per business spec FR-8).
- **Remove control (task-detail chip only).** A trailing 14px ✕ glyph button, `currentColor` at 60% opacity, hover to full opacity + `--hover-bg-tint` circular backdrop; `aria-label="Remove label {name}"`.
- **Overflow (cards only).** Cards show the first 2 chips; a third "+N" chip in `--bg-sunken` / `--text-muted` (no color swatch) closes the row when more exist, `title` lists the remaining names.

---

## Task cards — labels

Below the priority/assignee row on the board card (and as a compact inline row on the list view row), a `flex-wrap:wrap` row of read-only label chips per [chip anatomy](#label-chip-anatomy), `data-testid="task-card-label-{id}"` per chip. No management affordance on the card — clicking a chip does nothing; managing labels happens only on the task detail page and Board Settings.

---

## Task detail — Labels field (side panel)

A "Labels" field in spec 13's side panel field stack (positioned after Story Points / Due Date, before Parent, matching the mock), `data-testid="task-labels-section"`:

- **Populated.** A wrapping row of removable chips (`task-label-chip-{id}`, remove button `task-label-remove-{id}`) per [chip anatomy](#label-chip-anatomy), followed by a small **"+ Add label"** ghost button (`task-label-add-btn`, plus-icon + text, `--text-sub`, hover `--hover-bg-tint`).
- **Empty.** Just the "+ Add label" button — no placeholder chip.
- **Click "+ Add label"** opens the [label picker popover](#label-picker-popover) anchored below the button.

---

## Label picker popover

`data-testid="task-label-picker"`, a DS `Modal`-adjacent popover — since the DS ships no anchored-popover primitive, this is built as a small floating panel (`--bg-panel`, `--border`, `--radius-xl`, `--shadow-modal`, width 260px) positioned below the trigger, closing on outside-click/Escape (carried gap, see [DS gaps](#ds-gaps)). *Amended by the main merge, Phase 6: **the gap is closed** — the design system ships `Popover` (§22), an anchored `role="menu"` with arrow keys, `Home`/`End`, `Escape`, focus return and a portal that escapes a scrolling panel (§55). The hand-built panel and its test id are gone; see the roster note in [14-task-collaboration.md](14-task-collaboration.md).*

- **Header.** Micro-label **"Add label"**, Grotesk 600 `--fs-11` uppercase, `--text-faint`.
- **List.** One row per project label not yet assigned to the task, `data-testid="task-label-picker-option-{id}"`: an 8px color dot + name, whole row clickable (no explicit checkbox — clicking assigns immediately via `POST .../tasks/{taskId}/labels` and the row disappears from the list, chip appears on the task). Row height 36px, hover `--hover-bg-tint`.
- **Empty (all labels assigned).** A single muted row: **"All labels assigned."**
- **Footer.** A hairline divider then **"+ Create new label"** (ghost row, plus icon), which — for `manage-labels` roles only — opens an inline name+color mini-form in the same popover (same fields as [Board Settings' add-label form](#board-settings--labels-section)); for `user` role (who lacks `manage-labels` but can still assign labels per FR-6) this footer row is omitted entirely, matching the picker to their capability.

---

## Board Settings — Labels section

Extends spec 13's Board Settings modal, appended below the Columns section (per spec 13's ASCII placeholder), `data-testid="board-settings-labels-section"`, visible to all roles that can open Board Settings but read-only (no "+ Add Label", no edit/delete) for roles lacking `manage-labels` (`user`) — TC-14-E2E-13.

- **Heading.** **"Labels"**, Grotesk 600 `--fs-16`, `-.2px` tracking, same weight as "Columns" above it.
- **Row** (`data-testid="board-settings-label-{id}"`), 44px height, `1px` `--divider` between rows:
  - Leading 12px color swatch (`board-settings-label-color-{id}`, a filled circle in the raw label hex — the one place raw, undreived hex renders directly, since this is the color's own reference chip).
  - Label name (`board-settings-label-name-{id}`, `--fs-14` Grotesk 500).
  - Hex code, muted, `--font-mono` `--fs-12` `--text-faint` (e.g. `#E11D48`).
  - Trailing icon-button pair: pencil (`board-settings-label-edit-{id}`, `aria-label="Edit label {name}"`) and trash (`board-settings-label-delete-{id}`, `aria-label="Delete label {name}"`, danger hover → `--error-500`).
- **Edit mode.** Clicking pencil swaps the row's name text for a DS `Input` (`board-settings-label-name-input`, pre-filled) and the swatch for a small color-swatch picker (8 preset dots + a hex `Input` fallback, `board-settings-label-color-input`), with the pencil replaced by a checkmark (save) and the trash by an ✕ (cancel). Inline, not a separate modal — matches the mock's expanded-row treatment.
- **Add row.** **"+ Add Label"** (`board-settings-label-add`), a ghost button below the list that expands the same inline name+color form at the bottom of the list (not a modal), with **"Save"** / **"Cancel"** replacing the icon pair while open.
- **Delete confirmation.** Clicking trash opens a `Modal`-composed confirm using the business spec's exact string (**"Delete label "{name}"? It will be removed from {count} task(s). This cannot be undone."**), danger-styled confirm button.
- **Color picker.** A row of 8 fixed preset swatches (each a 22px circle button, selected state gets a 2px `--accent` ring) plus a free-text hex `Input` (`--font-mono`, placeholder `#RRGGBB`) for custom colors — matches business spec FR-2/UI Description. Presets are the mock's `.lbl-*` set; recorded as a DS gap (no `--label-preset-*` tokens yet).

---

## Comments section

Positioned below spec 13's Children section (or below Description if the task has no children), `data-testid="task-comments-section"`. Heading **"Comments ({n})"**, Grotesk 600 `--fs-16`.

### Comment card

`data-testid="task-comment-{id}"`, a `--bg-panel` card (`1px` `--border`, `--radius-xl`, `padding: 14px 16px`), stacked with `--sp-3` gap, oldest-first (FR-14).

- **Header row.** A 32px `AvatarInitials` circle, the author's name (`task-comment-author-{id}`, Grotesk 600 `--fs-14`) — **"You"** literal for the caller's own comments (matches the mock and spec 13's ASCII), the actual first+last name otherwise — then a middle-dot, then the timestamp in `--text-faint` `--fs-12` (absolute format, e.g. **"Aug 26, 10:03 AM"**), then, when `updatedAt` meaningfully differs from `createdAt` (FR-12), an **"(edited)"** tag (`task-comment-edited-badge-{id}`, `--text-faint` italic).
- **Body.** Rendered, sanitized markdown (`task-comment-content-{id}`) in `--font-text` `--fs-14` `line-height: var(--lh-loose)`. Supported elements render with house styling: `**bold**` → `--fw-semibold`; headings (`##`) → Grotesk 600, one size step down from body context; ordered/unordered lists → standard indent with `--text-sub` markers; inline code (`` `code` ``) → `--font-mono` on a `--bg-sunken` chip, `2px 6px`, `--radius-xs`. No image embeds, no tables (out of scope — markdown subset only, matching the business spec's "sanitizing markdown renderer" note).
- **Own-comment controls.** Top-right of the header row, a pencil (`task-comment-edit-btn-{id}`) and trash (`task-comment-delete-btn-{id}`) icon-button pair, visible only on hover/focus of the card (desktop) or always-visible on touch, per **own** comments for every role (FR-11).
- **Others'-comment controls (admin/manager only).** Same trash icon-button only (no pencil — edit is author-only, FR-11/TC-14-INT-32); regular members see no controls on others' comments (TC-14-E2E-07).

### Composer (bottom of section)

`data-testid="task-comment-composer"`, a DS `Input`-family multiline textarea, `min-height: 88px`, placeholder **"Write a comment… (Markdown supported)"**, resizable vertically, `--radius-lg`, `1.5px` `--border-strong`, focus → `--accent` border + `--shadow-glow-accent`. Below it, right-aligned, a DS `Button primary` **"Comment"** (`task-comment-submit-btn`), disabled (and 50% opacity) while the textarea is empty/whitespace-only, `loading` state while the POST is in flight (fields read-only). On success: textarea clears, new card appends at the bottom, toast **"Comment posted"**.

### Edit mode (inline)

Clicking a comment's pencil swaps its rendered body for the same textarea treatment in place (`task-comment-edit-composer-{id}`), pre-filled with the raw markdown source, author/timestamp header unchanged above it. Footer row switches to **"Cancel"** (ghost, `task-comment-edit-cancel-{id}`) and **"Save"** (primary, `task-comment-edit-save-{id}`), `loading` while the PUT is in flight. On success: card returns to rendered mode with the "(edited)" tag now shown, toast **"Comment updated"**.

### Delete confirmation

Trash click opens a `Modal`-composed confirm, `data-testid="task-comment-delete-confirm"` (danger confirm) / `task-comment-delete-cancel` (ghost cancel), body text is the business spec's exact **"Delete this comment? This action cannot be undone."** On confirm: card removed from the list, toast **"Comment deleted"**.

---

## Watchers section

A compact card below the Comments section (or, on desktop, the last item in the side panel field stack — see [Component map](#component-map); the mock places it in the side panel, matching spec 13's field-stack rhythm), `data-testid="task-watchers-section"`.

- **Header row.** Micro-label **"Watchers ({n})"** (Grotesk 600 `--fs-11` uppercase, `--text-muted`, `task-watchers-count` holds the `{n}`) on the left; the toggle button on the right.
- **Toggle button — watching.** `data-testid="task-watch-toggle-btn"`, ghost `Button`-style pill with a filled-eye icon + **"Watching"** label, `--accent-soft` background / `--accent` ink / `--accent-border` border (an "active" treatment distinct from a plain ghost button, since this is a persistent state indicator as much as a control). Click → `DELETE .../watchers`, toast **"You stopped watching this task"**.
- **Toggle button — not watching.** Same control, neutral `--bg-panel` / `--border-strong` / `--text-sub`, an open-eye-with-slash icon + **"Watch"** label. Click → `POST .../watchers`, toast **"You are now watching this task"**.
- **Avatar stack.** Below the header row, a horizontally-overlapping row of 26px `AvatarInitials` circles (`task-watcher-avatar-{id}`, `-8px` overlap, `2px` `--bg-panel` ring per avatar so they read as separate discs), each with a `title` tooltip of the watcher's name; up to 5 shown, a **"+N"** neutral circle closes the row when more exist (same tooltip pattern, lists remaining names). The caller's own avatar appears in the stack when they are watching, styled identically to others (no special self-highlight — the toggle button already communicates that state).
- **Empty.** No stack — just the header row and the business spec's **"No one is watching this task yet."** in `--text-faint`, toggle button still fully functional.

---

## Activity log

An **oldest-first** vertical timeline at the bottom of the left column (below Comments), `data-testid="task-activity-section"`, inside a `max-height: 400px` `overflow-y:auto` panel once the list exceeds that height (business spec UI Description "Task Detail — Activity Section"). Heading **"Activity"**, Grotesk 600 `--fs-16`.

### Entry anatomy

`data-testid="task-activity-entry-{id}"`, a row: a 24px `AvatarInitials` circle on a thin vertical connector line (the mock's timeline rail, `1px` `--divider`, running behind each avatar to the next), then a two-line text block:

- **Line 1.** Actor name (Grotesk 600) + one-line human-readable action description (`--font-text` `--fs-14`, `--text-sub`), formatted per the action-type table below.
- **Line 2.** Timestamp, `--fs-12` `--text-faint`, absolute format (e.g. **"Aug 25, 2:30 PM"**).

### Icon system per event type

Each entry additionally carries a small (16px) tinted icon badge to the left of the avatar-and-rail column, one per `TaskActivityAction`, giving the log a scannable left rail independent of reading the text:

| Action | Icon | Tint |
|---|---|---|
| `created` | plus-in-circle | `--accent` on `--accent-soft` |
| `field_changed` | pencil | `--text-muted` on `--bg-sunken` |
| `comment_added` | comment bubble | `--accent` on `--accent-soft` |
| `comment_deleted` | comment bubble w/ slash | `--error-500` on `--error-100` |
| `label_added` | tag | label's own color (raw hex) on the derived-light chip background |
| `label_removed` | tag w/ slash | `--text-muted` on `--bg-sunken` |
| `watcher_added` | eye | `--success-700` on `--success-100` |
| `watcher_removed` | eye-off | `--text-muted` on `--bg-sunken` |

These 8 tint pairs are **not** existing semantic tokens beyond `--accent-soft`/`--error-100`/`--success-100` (already defined) — the `field_changed`/`watcher_removed`/`label_removed` neutral tint reuses `--bg-sunken`/`--text-muted` directly, no new tokens needed there; only the label-color tint is a per-row runtime derivation (same formula as [chip anatomy](#label-chip-anatomy)), recorded in [DS gaps](#ds-gaps).

### Field-changed formatting

Per FR-23, a `field_changed` entry's line 1 reads **"changed {Field Label}"** and line 2 becomes **"{oldValue display} → {newValue display} · {timestamp}"** — display-formatted client-side (column IDs → column names, membership IDs → "First L." names, `null` → **"Unassigned"** for assignee / **"—"** for other nullable fields), matching TC-14-UNIT-11's expected phrasing ("changed Priority: Medium → High" collapses to this design's two-line "changed Priority" / "Medium → High · Aug 25, 2:30 PM"). `description` field changes (FR-27, `oldValue`/`newValue` both `null`) render line 2 as just the timestamp, no arrow.

### Non-field actions

Fixed phrases per TC-14-UNIT-12: `created` → **"created this task"**; `comment_added` → **"commented"**; `comment_deleted` → **"deleted a comment"**; `label_added` → **"added label "{name}""**; `label_removed` → **"removed label "{name}""**; `watcher_added` → **"started watching"**; `watcher_removed` → **"stopped watching"**.

### Empty / loading

Empty (business spec: effectively unreachable, but rendered defensively) → **"No activity yet."** in `--text-faint`. Loading → 3 skeleton rows (`--bg-sunken` blocks shaped as avatar+two-line-text), matching the [States table](#states).

---

## Component map

Only what this spec adds or reuses; spec 13's task detail/board-settings chrome and the DS primitives are referenced, not repeated.

| Screen element | DS / app component | Props / build | `data-testid` |
|---|---|---|---|
| Task card label chips | app `<span>` pill (derived color) | read-only, max 2 + overflow | `task-card-label-{id}` |
| Task detail Labels field | native `<div>` field | chips + Add-label button | `task-labels-section` |
| Task detail label chip | app `<span>` pill | removable | `task-label-chip-{id}` |
| Chip remove | app icon `<button>` | `DELETE .../labels/{labelId}` | `task-label-remove-{id}` |
| Add label trigger | DS `Button variant="ghost"` sm | opens picker | `task-label-add-btn` |
| Label picker popover | app floating panel (gap) | checkbox-free select list | `task-label-picker` |
| Picker option row | app `<button>` row | `POST .../tasks/{taskId}/labels` | `task-label-picker-option-{id}` |
| Board Settings Labels section | native `<div>` (extends spec-13 Modal) | — | `board-settings-labels-section` |
| Label row | native `<div>` row | swatch + name + hex + edit/delete | `board-settings-label-{id}` |
| Label row name | native `<span>` / inline `Input` (edit mode) | — | `board-settings-label-name-{id}` |
| Label row swatch | native `<span>` circle | raw hex | `board-settings-label-color-{id}` |
| Label row edit | DS `IconButton` (pencil) | inline edit toggle | `board-settings-label-edit-{id}` |
| Label row delete | DS `IconButton` (trash) | confirm → `DELETE` | `board-settings-label-delete-{id}` |
| Add label | DS `Button variant="ghost"` | expands inline form | `board-settings-label-add` |
| Label name input | DS `Input` | inline add/edit form | `board-settings-label-name-input` |
| Label color input | app swatch-picker + `Input` (gap) | preset dots + hex fallback | `board-settings-label-color-input` |
| Comments section | native `<div>` | heading "Comments (n)" | `task-comments-section` |
| Comment card | native `<div>` card | oldest-first list | `task-comment-{id}` |
| Comment author | native `<span>` | "You" for own | `task-comment-author-{id}` |
| Comment body | app sanitized-markdown renderer (gap) | — | `task-comment-content-{id}` |
| Edited badge | native `<span>` | when `updatedAt` ≠ `createdAt` (+buffer) | `task-comment-edited-badge-{id}` |
| Comment edit | DS `IconButton` (pencil) | own only | `task-comment-edit-btn-{id}` |
| Comment delete | DS `IconButton` (trash) | own, or admin/manager any | `task-comment-delete-btn-{id}` |
| Composer | DS `Input`-family textarea | placeholder w/ markdown hint | `task-comment-composer` |
| Post button | DS `Button primary` | disabled empty; `loading` in flight | `task-comment-submit-btn` |
| Edit composer | DS `Input`-family textarea (inline) | pre-filled raw markdown | `task-comment-edit-composer-{id}` |
| Edit save | DS `Button primary` sm | `PUT .../comments/{id}` | `task-comment-edit-save-{id}` |
| Edit cancel | DS `Button variant="ghost"` sm | discard edit | `task-comment-edit-cancel-{id}` |
| Delete confirm | DS `Modal` composition (gap) | business spec delete string | `task-comment-delete-confirm` |
| Delete cancel | DS `Button variant="ghost"` | close dialog | `task-comment-delete-cancel` |
| Watchers section | native `<div>` | header + stack | `task-watchers-section` |
| Watch toggle | app `<button>` (two states) | Watch / Watching | `task-watch-toggle-btn` |
| Watcher avatar | app `AvatarInitials` (26px, overlapped) | `title` tooltip | `task-watcher-avatar-{id}` |
| Watchers count | native `<span>` (in header) | "{n}" | `task-watchers-count` |
| Activity section | native `<div>` (max-height 400px, internal scroll) | heading "Activity" | `task-activity-section` |
| Activity entry | native `<div>` row | icon + avatar/rail + 2-line text | `task-activity-entry-{id}` |
| Loading skeleton | native `<div>` (`--bg-sunken` blocks) | per-section shape | *(no roster testid — internal)* |
| Toasts | `useToast()` | business spec strings | (see [Copy](#copy)) |

---

## Copy

Validation, error, toast, discard/delete-confirm, and empty-state **messages** are owned by [14-task-collaboration.md](14-task-collaboration.md) (§Error Messages) and quoted where used, never restated. Design owns the headings, labels, placeholders, and phrasing below.

| Slot | Owner | Text |
|---|---|---|
| Comments heading | design | Comments ({n}) |
| Comment author (self) | design | You |
| Composer placeholder | design | Write a comment… (Markdown supported) |
| Post button | design | Comment |
| Edit save / cancel | design | Save / Cancel |
| Labels field (side panel) | design | Labels |
| Add label button | design | + Add label |
| Label picker header | design | Add label |
| Label picker empty | design | All labels assigned. |
| Label picker create-new | design | + Create new label |
| Board Settings heading | design | Labels |
| Board Settings add | design | + Add Label |
| Watchers heading | design | Watchers ({n}) |
| Watch button (off) | design | Watch |
| Watch button (on) | design | Watching |
| Activity heading | design | Activity |
| Activity phrase — created | design | created this task |
| Activity phrase — field_changed | design | changed {Field Label} |
| Activity phrase — comment_added | design | commented |
| Activity phrase — comment_deleted | design | deleted a comment |
| Activity phrase — label_added | design | added label "{name}" |
| Activity phrase — label_removed | design | removed label "{name}" |
| Activity phrase — watcher_added | design | started watching |
| Activity phrase — watcher_removed | design | stopped watching |
| Field-changed nullable display | design | Unassigned (assignee) / — (other fields) |
| Duration-only-style N/A | — | not applicable to this spec |
| Validation / error / toast / confirm / empty-state messages | **business spec** | owned at [14-task-collaboration.md](14-task-collaboration.md#error-messages); not restated |

---

## States

| State | Trigger | Rendering |
|---|---|---|
| **Loading** (comments/watchers/activity) | section fetch in flight | 2–3 skeleton rows per section, `--bg-sunken` blocks shaped to that section's row anatomy — no `Skeleton` primitive (carried gap). |
| **Empty — comments** | no comments | business spec's **"No comments yet. Be the first to comment."** above the composer. |
| **Empty — watchers** | no watchers | business spec's **"No one is watching this task yet."**; toggle still available. |
| **Empty — activity** | no entries (effectively unreachable) | business spec's **"No activity yet."** |
| **Default** | data present | sections populated as specified above. |
| **Composing** | textarea has content | Post button enabled, `--accent` styling. |
| **Submitting** (comment/edit) | POST/PUT in flight | Button `loading`; textarea read-only. |
| **Editing own comment** | pencil clicked | rendered body replaced by inline textarea; Save/Cancel footer. |
| **Confirm (delete comment / delete label)** | trash clicked | `Modal`-composed confirm, business spec string, danger confirm shows `loading`. |
| **Error — field** (label name/color) | validation `4xx` | inline error node under the field; form stays open. |
| **Error — network/server** | any mutation `4xx`/`5xx` | error toast with business spec's generic message; form/list retains prior state. |
| **Picker open** | "+ Add label" clicked | popover renders current unassigned labels; closes on outside-click/Escape/assignment. |
| **Watch toggling** | toggle clicked | button briefly shows a subtle pressed state (1px translate, house press rule); no separate loading spinner given the sub-second round trip. |

---

## Responsive behaviour

Breakpoints follow spec 13's task-detail layout (single content column with a right side panel on desktop, stacked on mobile) and 00's shell rules.

- **Desktop (≥1024px).** Side panel (Status/Assignee/…/Labels/Watchers) fixed-width column on the right; Comments and Activity fill the remaining left column below Description/Children, matching the mock. Label picker is a floating popover anchored to its trigger. Comment cards run full column width.
- **Tablet (768–1023px).** Same two-column layout at trimmed widths; side panel narrows before wrapping. Comment cards and activity rows keep single-line author/timestamp headers.
- **Mobile (<768px).** Task detail stacks vertically per spec 13's mobile pattern. **Comments** render as a normal stacked section (not an accordion — comments are usually the reason someone opens a task on mobile, so they stay expanded); the composer sticks to the bottom of the section, not the viewport. **Watchers** becomes a collapsible accordion row (`▸ Watchers (3)`) that expands to the avatar stack + toggle button, saving vertical space above Comments/Activity. **Activity** stays a normal (non-accordion) stacked section beneath Comments, since it is typically shorter and read top-to-bottom once. The label picker becomes a bottom-anchored panel (not the desktop floating popover) at ≥90% width, closing on scrim tap. Touch targets (chip remove ✕, watch toggle, edit/delete icon buttons) are ≥44×44px hit boxes even though the visible glyph stays 16-20px.

---

## Accessibility

- **Comments as a live thread.** New comments append with `aria-live="polite"` on the list container so screen-reader users hear "Comment posted" context without a full re-announce of the whole thread. Composer textarea has an explicit `<label>` (visually hidden, "Comment") in addition to its placeholder.
- **Markdown output.** Rendered comment bodies use semantic HTML from the sanitizer (`<strong>`, `<ul>/<ol>`, `<code>`, headings) — never raw spans — so assistive tech gets real structure, not styled `<div>`s.
- **Label color never the sole signal.** Every chip always carries the label name as text alongside its color dot; the activity log's label-tinted icon is always paired with the "added/removed label "{name}"" text.
- **Watch toggle.** `aria-pressed` reflects watching state; `aria-label` is the full phrase ("Watch this task" / "Stop watching this task"), not just the visible short label, since "Watch"/"Watching" alone reads ambiguously out of visual context.
- **Activity entries.** Each entry's icon is `aria-hidden`; the row's accessible name is the plain-text line-1 + line-2 concatenation ("Alex K. changed Priority. Medium to High. Aug 25, 2:30 PM").
- **Keyboard.** Comment edit/delete and label add/remove are all discrete tab stops in reading order (header controls after body). The label picker traps focus while open and returns focus to its trigger on close (Escape or outside-click), matching `Modal`'s convention even though it is not a `Modal` instance.
- **Focus.** Delete confirmations (comment, label) trap focus per `Modal`'s standard behavior; Escape closes, focus returns to the trigering trash icon.
- **Contrast.** Derived label chip triads (background/border/ink) must independently clear WCAG 2.1 AA at render time — since the source hex is arbitrary per-project input, the derivation formula in [chip anatomy](#label-chip-anatomy) is a floor, not a guarantee; out-of-gamut/near-white or near-black custom hexes are an accepted v1 edge case (business spec places no contrast constraint on label color input).

---

## DS gaps

| Gap | Resolution | Status |
|---|---|---|
| **No label-color-derivation utility.** Labels store one arbitrary hex; chips need a background/border/ink triad. | App-level `deriveLabelPalette(hex)` (lighten-to-bg / mid-border / darken-to-ink in OKLCH), shared by cards, task-detail chips, the picker, activity icons, and Board Settings' reference swatch (which uses the raw hex directly, not derived). | new (14); token-adjacent chore |
| **No label-preset-palette tokens.** The color picker in Board Settings offers 8 fixed swatches; the mock hardcodes six example `oklch` triads (`.lbl-red/blue/violet/green/amber/pink`). | Define an app-level (non-DS) preset array of 8 hex values shown as picker swatches; not a DS token since label color is free-form user data, not a semantic system color. | new (14); not blocking |
| **No anchored-popover primitive.** The label picker is a small floating panel, not a `Modal`. | Build an app-level `Popover` (position, outside-click, Escape, focus trap) over DS tokens (`--bg-panel`/`--border`/`--radius-xl`/`--shadow-modal`); reusable candidate for a future DS promotion. | new (14); not blocking |
| **No sanitized-markdown renderer.** Comment bodies need markdown → sanitized HTML (bold, lists, headings, inline code). | App-level utility (e.g. wrapping a markdown lib with an allow-listed sanitizer), identical approach to task descriptions carried from spec 13. | carried from 13; not blocking |
| **No `AvatarInitials` overlap/stack pattern.** Watchers render as an overlapping avatar row with a "+N" overflow circle. | App-level composition over the existing avatar circle style (2px `--bg-panel` ring, negative margin) — no new DS component, just a layout pattern. | new (14); not blocking |
| **No activity-icon tint tokens.** 8 action types each carry a tinted icon badge; most reuse existing semantic tokens (`--accent-soft`, `--error-100`, `--success-100`, `--bg-sunken`) but the label-color tint is a runtime derivation, not a token. | Reuse existing semantic pairs where the action maps to an existing meaning (create/comment → accent, delete/remove → error or neutral, watch → success/neutral); label-tinted entries reuse the same `deriveLabelPalette` utility above. | new (14); not blocking |
| **No `ConfirmDialog` primitive** (carried from 09/12). | Comment-delete and label-delete confirmations composed from `Modal` (one-line body + Cancel/danger-Confirm). | carried; not blocking |
| **No `Skeleton` primitive** (carried from 04/05/09/11/12). | Comments/watchers/activity loading states use static `--bg-sunken` row-shaped blocks. | carried; not blocking |
| **`Modal` has no <480px bottom-sheet variant** (carried from 07/12). | Mobile label picker uses a bottom-anchored panel at ≥90% width rather than the desktop floating popover — a one-off app-level treatment, not a `Modal` variant. | carried; open chore |
| **Icon exports** — comment bubble, watch (eye), unwatch (eye-off), activity/clock, tag/label, plus, trash, edit pencil, remove ✕, color swatch are not DS exports. | Add to `apps/web/src/layout/icons.tsx` (00's carried icon gap, extended by 11/12). | carried; not blocking |
| **`Input`/`Select` lack a first-class error-testid pass-through** (carried). | Label name/color inline errors attach the testid to the `error` node explicitly, same pattern as 11/12. | carried; not blocking |

---

## Required `data-testid` attributes

Single source of the business spec's §Required data-testid Attributes, mapped to the element each lands on.

| `data-testid` | Element | Origin |
|---|---|---|
| `board-settings-labels-section` | Board Settings Labels section | **new (14)** |
| `board-settings-label-{id}` | Label row | **new (14)** |
| `board-settings-label-name-{id}` | Label row name | **new (14)** |
| `board-settings-label-color-{id}` | Label row swatch | **new (14)** |
| `board-settings-label-edit-{id}` · `board-settings-label-delete-{id}` | Row edit/delete `IconButton`s | **new (14)** |
| `board-settings-label-add` | Add-label button | **new (14)** |
| `board-settings-label-name-input` · `board-settings-label-color-input` | Inline add/edit form fields | **new (14)** |
| `task-card-label-{id}` | Read-only chip on board/list cards | **new (14)** |
| `task-labels-section` | Side panel Labels field | **new (14)** |
| `task-label-chip-{id}` · `task-label-remove-{id}` | Task-detail chip + its remove button | **new (14)** |
| `task-label-add-btn` | "+ Add label" trigger | **new (14)** |
| `task-label-picker` · `task-label-picker-option-{id}` | Picker popover + option rows | **new (14)** |
| `task-comments-section` | Comments section wrapper | **new (14)** |
| `task-comment-{id}` | Comment card | **new (14)** |
| `task-comment-author-{id}` · `task-comment-content-{id}` | Comment header name / body | **new (14)** |
| `task-comment-edited-badge-{id}` | "(edited)" tag | **new (14)** |
| `task-comment-edit-btn-{id}` · `task-comment-delete-btn-{id}` | Own/admin controls | **new (14)** |
| `task-comment-composer` · `task-comment-submit-btn` | New-comment composer + Post | **new (14)** |
| `task-comment-edit-composer-{id}` · `task-comment-edit-save-{id}` · `task-comment-edit-cancel-{id}` | Inline edit mode | **new (14)** |
| `task-comment-delete-confirm` · `task-comment-delete-cancel` | Delete confirm dialog | **new (14)** |
| `task-watchers-section` | Watchers section | **new (14)** |
| `task-watch-toggle-btn` | Watch/Watching toggle | **new (14)** |
| `task-watcher-avatar-{id}` | Avatar-stack item | **new (14)** |
| `task-watchers-count` | "{n}" in the section header | **new (14)** |
| `task-activity-section` | Activity section wrapper | **new (14)** |
| `task-activity-entry-{id}` | Activity row | **new (14)** |

---

## Reference mockup

[14-task-collaboration.mock.html](14-task-collaboration.mock.html) is the visual acceptance target for every part this design adopts from it — **task cards with labels**, the **populated / composing / editing** comment states, the **watchers section** in both watch states, a **10+ entry activity log**, the **Board Settings Labels section**, the **label picker popover**, a **comment delete confirmation**, and two mobile states (comments stacked, watchers as an accordion). `1_DS for dev/templates/meridian-app/MeridianApp.dc.html` remains the token/value reference for the Meridian look. Behavioural verification (label CRUD and assignment, comment CRUD and edit-authorization, watch/unwatch and auto-watch triggers, activity-log population as a side effect of every mutation) runs against the business spec's Test Cases (TC-14-*) and the running API/UI.
