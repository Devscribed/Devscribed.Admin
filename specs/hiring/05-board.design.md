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
- Hover `--hover-bg-tint`; grabbing lifts to `--shadow-pop` and `translateY(-1px)`.
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
| Column | **`BoardColumn`** (new) | `status`, `onDrop` | `board-column-{status}` |
| Card | **`BoardCard`** (new) | `draggable`, `onPickUp`, `onDrop` | `board-card-{applicationId}` |
| Cancelled mark | `Badge` | `tone="inactive"` | `board-card-cancelled-{applicationId}` |
| Missing conclusion | `Tooltip` + inline glyph | — | `board-card-no-conclusion-{applicationId}` |
| Move failure | `Toast` | `tone="error"` | `toast-move-failed` |
| Loading | `Skeleton` | — | `board-loading-skeleton` |

`Tooltip`, `Toast`, and `Skeleton` are the components introduced in
[01-vacancies.design.md](01-vacancies.design.md).

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

- **Drag** — the card lifts, the source position collapses to a `--bg-sunken` placeholder at
  `--radius-xl`, and the hovered drop target shows a 2px `--accent-border` insertion line between
  cards.
- **Optimistic move** — the card renders in its new place before the request resolves. On failure
  it animates back and `toast-move-failed` appears.
- **Drop into `Didn't pass` or `Offer`** — the move completes, then the card page opens with
  Conclusion focused. The navigation happens *after* the move is confirmed, so a failed move never
  navigates.
- **Keyboard drag** — `Space` picks up, arrows move between positions and columns, `Space` drops,
  `Escape` cancels and returns the card. Each step is announced.
- **No drop animation longer than `--duration-base`.** Meridian's motion rule is fast and
  unstyled; a board that eases slowly reads as sluggish under repeated use.
- `prefers-reduced-motion` removes the lift and the return animation, keeping the placeholder and
  the insertion line, which carry the information.

## Responsive

| Width | Layout |
|---|---|
| ≥ 1200px | Five columns visible |
| 768–1199px | The column group scrolls horizontally **inside its own container**; the page body does not |
| < 768px | Columns become a `Tabs` strip — one column at a time, the tab label carrying the count. Drag is replaced by the status control on the card page, which the board links to |

Below 768px, drag-and-drop is deliberately not attempted: a touch drag across a horizontally
scrolling container is unreliable, and the card's own status control does the same job.

## Accessibility

- Each column is a labelled region whose accessible name includes its count.
- Cards are `role="button"` with an accessible name of "{name}, {status}, {date}".
- Drag is fully keyboard operable, with pick-up, target, and drop announced through a polite live
  region.
- The insertion line is paired with the announcement — position is never conveyed by the line alone.
- The missing-conclusion marker's meaning lives in its tooltip text, referenced by
  `aria-describedby`, not in the amber alone.
- Focus returns to the moved card after a drop, so a keyboard user does not lose their place.

## DS gaps

| Gap | Resolution |
|---|---|
| **`BoardColumn` / `BoardCard`** | `components/data/Board*.jsx`. Presentational and drag-mechanical only — the five statuses, the ordering rule, and every permission live in the app |
| No drag-and-drop primitive anywhere in Meridian | The pick-up/insertion/drop visual language above becomes part of the design system with these components, so a second board would not invent its own |
| `Tabs` has no count slot | `TabItem`'s object form takes a `label: ReactNode`, so the count composes without a DS change — recorded so nobody adds a `count` prop |
