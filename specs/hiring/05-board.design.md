---
id: "05"
kind: design
title: Board — Design
pairs-with: 05-board.md
routes: ["/org/{orgId}/hiring/vacancies/{vacancyId}/board"]
design-system: "1_DS for dev"
tags: [board, kanban, drag-drop, columns, meridian, light-only]
---

# 05 — Board · Design

Visual and interaction specification for the per-vacancy board. Pairs with
[05-board.md](05-board.md), which owns the rules.

**Design system:** Teammerly Meridian. **Theme:** light only. Renders inside `AppShell`.

## Layout

```
  Senior React Engineer                                    [ Details ]   ← PageHeader
  Board · times in Europe/Minsk
  ────────────────────────────────────────────────────────────────────
  ┌ SCHEDULED  4 ┐┌ DIDN'T PASS 7┐┌ MAYBE     2 ┐┌ PASSED   3 ┐┌ OFFER 1 ┐
  │┌────────────┐││┌────────────┐││             ││            ││         │
  ││ Jane Doe   ││││ Ann Lee  ⚑ ││                                       
  ││ 26 Aug 14:00││││ 18 Aug 11:00                                       
  ││ 📄          ││││ 📄                                                 
  │└────────────┘││└────────────┘│
```

- Five equal columns in a `grid-template-columns: repeat(5, minmax(220px, 1fr))`, gap `--sp-6`.
- Column head: `SectionLabel` for the name plus the count in Grotesk 600 `--text-muted`, on
  `--bg-sunken`, `--radius-xl` top corners, sticky within the column.
- Column body: `--bg-panel-2`, 1px `--border`, its own `overflow-y: auto`, `min-height` one card.
- The time zone is stated once in the page-header subtitle, never per card.

## Card

```
┌──────────────────────────┐
│ Jane Doe               ⚑ │   ← Grotesk 500 --fs-15 · marker trailing
│ 26 Aug 2026, 14:00       │   ← Grotesk 400 --fs-13 --text-muted, tabular-nums
│ 📄 CV                    │   ← --fs-12 --text-sub
└──────────────────────────┘
```

- `--bg-panel`, 1px `--border`, `--radius-xl`, `--shadow-card` at rest.
- Hover `--hover-bg-tint`. **Held** — `--shadow-pop`, `translateY(-1px)` and an `--accent-border`
  edge. Only a keyboard-held card ever renders this: a card dragged with a pointer is not drawn at
  all, and what lifts under the cursor is the browser's own drag image.
- **Cancelled** — the whole card at `opacity: .65` with a `Badge tone="inactive"` reading
  "Cancelled". Never removed from its column.
- **Past interview** — the date renders in `--text-faint`. Nothing else changes; the card does not
  move.
- `⚑` is the missing-conclusion marker, `--tracker` amber, only in `Didn't pass` and `Offer`, with
  a tooltip reading "No conclusion recorded". Amber is Meridian's reserved warning hue and this is
  precisely a guarded state, so it is the correct use of it.

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page header | `PageHeader` | `title`, `subtitle`, `action` | `page-title` |
| Column head | `SectionLabel` | — | `board-column-count-{status}` |
| Column | **`BoardColumn`** (new) | `status`, `placeholderIndex`, `placeholderHeight`, `onDragOverIndex`, `onDrop` | `board-column-{status}` |
| Drop placeholder | **`BoardColumn`** (new) | — | `board-placeholder-{status}` |
| Card | **`BoardCard`** (new) | `draggable`, `lifted`, `onDragStart`, `onDragEnd`, `onKeyDown`, `onOpen` | `board-card-{applicationId}` |
| Cancelled mark | `Badge` | `tone="inactive"` | `board-card-cancelled-{applicationId}` |
| Missing conclusion | `Tooltip` + inline glyph | — | `board-card-no-conclusion-{applicationId}` |
| Move failure | `Toast` | `tone="error"` | `toast-move-failed` |
| Loading | `Skeleton` | — | `board-loading-skeleton` |

`Tooltip`, `Toast`, and `Skeleton` are the components introduced in
[01-vacancies.design.md](01-vacancies.design.md).

`BoardColumn` owns the placeholder, because the placeholder is a slot in the column rather than a
state of the card — the card being dragged is not rendered at all while it is in flight. The column
converts a pointer position into a **slot index** and hands it back; which columns exist, what a
slot means, and what a drop writes are all the screen's.

## Copy

| Slot | Text |
|---|---|
| Page subtitle | Board · times in {zone} |
| Column names | SCHEDULED · DIDN'T PASS · MAYBE · PASSED · OFFER |
| Empty column | Nothing here yet. |
| Empty board | No candidates yet. Share the booking link to start. |
| Missing conclusion tooltip | No conclusion recorded |
| Cancelled badge | Cancelled |
| Keyboard hint (visually hidden) | Press Space to pick up, arrow keys to move, Space to drop. |

## Interactions

- **Drag** — the card being dragged is **not rendered**. In its place a single card-sized
  placeholder — `--bg-sunken`, `--radius-xl`, 1px dashed `--accent-border` — opens the gap the drop
  would land in, and **travels** to follow the pointer between and within columns.

  There is one mark on the board at a time, never two. An earlier revision of this spec paired a
  placeholder at the *source* with a 2px insertion line at the target; two grey marks for one card
  read as two cards in flight, and the line was too slight to say what size the gap would be. The
  travelling placeholder shows the shape of the result instead of pointing at it.

  Its height is **measured from the card at pick-up**, so the gap is exactly the size of the thing
  going into it and the column does not resize as the card leaves it.
- **Optimistic move** — the card renders in its new place before the request resolves. On failure
  it animates back and `toast-move-failed` appears.
- **Drop into `Didn't pass` or `Offer`** — the move completes, then the card page opens with
  Conclusion focused. The navigation happens *after* the move is confirmed, so a failed move never
  navigates.
- **Keyboard drag** — `Space` picks up, arrows move between positions and columns, `Space` drops,
  `Escape` cancels and returns the card. Each step is announced.

  A card held by the keyboard **stays where it is**, lifted, and only the placeholder travels —
  unlike a pointer drag, where the card is not drawn at all. Moving it would re-parent the element
  between columns, and a focused node moved to a new parent is blurred, which would take the arrow
  keys, `Escape` and the drop itself with it one keystroke into the drag.
- **No drop animation longer than `--duration-base`.** Meridian's motion rule is fast and
  unstyled; a board that eases slowly reads as sluggish under repeated use.
- `prefers-reduced-motion` removes the lift and the return animation, keeping the placeholder,
  which carries the information.

**Two mechanics of HTML5 drag that this design depends on**, recorded because both are invisible
until they break:

- The browser rasterizes the drag image at the end of the `dragstart` handler, and React flushes a
  discrete event's state update *before* that handler returns. The card must therefore be removed
  one frame later, not synchronously — otherwise the element being photographed is already gone and
  the pointer drags a blank.
- Because the source element is unmounted for the length of the drag, `dragend` is delivered to a
  node that is no longer in the document, where it bubbles to nothing. The listener that ends the
  drag has to be bound to that node itself. Without it, a release over no column at all — the only
  case `onDrop` never covers — leaves the placeholder on screen for good, and the next drag begins
  on a board still holding the last one.

## Responsive

| Width | Layout |
|---|---|
| ≥ 1200px | Five columns, scrolling as a group only if they do not fit |
| 768–1199px | The column group scrolls horizontally **inside its own container**; the page body does not |
| < 768px | Columns become a `Tabs` strip — one column at a time, the tab label carrying the count. Drag is replaced by the status control on the card page, which the board links to |

The first row is about the viewport, but the columns live inside the shell: with the 252px sidebar
and the page's own padding, five columns at their 220px minimum need roughly **1464px of viewport**
before they all fit. Between 1200px and that, the group still scrolls. This is deliberate rather
than a breakpoint to add — the invariant that matters is the one the middle row states, and it
holds at every width: the group scrolls inside its own container and the page body never does.

Below 768px, drag-and-drop is deliberately not attempted: a touch drag across a horizontally
scrolling container is unreliable, and the card's own status control does the same job.

## Accessibility

- Each column is a labelled region whose accessible name includes its count.
- Cards are `role="button"` with an accessible name of "{name}, {status}, {date}".
- Drag is fully keyboard operable, with pick-up, target, and drop announced through a polite live
  region.
- The placeholder is paired with the announcement — position is never conveyed by the gap alone.
  It is `aria-hidden`: it is the visible half of something the live region already says, and a
  reader that met it as an element would hear an empty node between two cards.
- The missing-conclusion marker's meaning lives in its tooltip text, referenced by
  `aria-describedby`, not in the amber alone.
- Focus returns to the moved card after a drop, so a keyboard user does not lose their place.

## DS gaps

| Gap | Resolution |
|---|---|
| **`BoardColumn` / `BoardCard`** | `components/data/Board*.jsx`. Presentational and drag-mechanical only — the five statuses, the ordering rule, and every permission live in the app |
| No drag-and-drop primitive anywhere in Meridian | The pick-up/gap/drop visual language above becomes part of the design system with these components, so a second board would not invent its own |
| `Tabs` was not a `tablist` | Its tabs were anchors to `#`, which a screen reader announces as links to nowhere, and the mobile board makes it the control that chooses which column is shown. They are buttons now, with `aria-selected`, `aria-controls`, roving focus and arrow-key movement, plus a `testId` per item |
| `Tabs` has no count slot | `TabItem`'s object form takes a `label: ReactNode`, so the count composes without a DS change — recorded so nobody adds a `count` prop |
