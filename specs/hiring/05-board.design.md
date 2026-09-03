---
id: "05"
kind: design
title: Board — Design
pairs-with: 05-board.md
routes: ["/org/{orgId}/hiring/vacancies/{vacancyId}/board"]
design-system: "@devscribed/ds"
tags: [board, kanban, drag-drop, columns, teammerly, light-only]
---

# 05 — Board · Design

Visual and interaction specification for the per-vacancy board. Pairs with
[05-board.md](05-board.md), which owns the rules.

**Design system:** [`packages/ds`](../../packages/ds/README.md). The numbered decisions behind it
are in [`decisions.md`](../design-system/decisions.md), cited here as `§n`.
**Theme:** light only. Renders inside `AppShell`.

This is the one surface with **nothing in the app to draw from** — no other screen is a board — so
both of its primitives were designed from the system's own
vocabulary rather than found in it, and [decisions](../design-system/decisions.md) says so. "Designed" is not the same as "invented": every value below is taken from something the system
already draws, and the sections that follow say which.

## Layout

```
  ‹ Vacancies                                             ← the vacancy's header (01 design)
  Senior React Engineer  [Open]        [ Copy booking link ]  [⋮]
  ▌React ▌Senior · Pat Owner · 60 min · times in Europe/Berlin
  We're looking for…   View more
  ────────────────────────────────────────────────────────────────────
  ┌ Scheduled  4 ┐┌ Didn't pass 7┐┌ Maybe     2 ┐┌ Passed   3 ┐┌ Offer 1 ┐
  │┌────────────┐││┌────────────┐││             ││            ││         │
  ││ Jane Doe   ││││ Ann Lee  ⚑ ││                                       
  ││ 26 Aug 14:00││││ 18 Aug 11:00                                       
  │└────────────┘││└────────────┘│
```

- Five equal columns in a `grid-template-columns: repeat(5, minmax(220px, 1fr))`, gap `--space-5`.
- **Columns stretch to a common height**, which is the region the vacancy's header leaves them.
  They were top-aligned while the board was a page of its own, on the argument that a board with
  one long column would otherwise paint four screen-tall wells of nothing — and that argument only
  held because the columns had no honest height to take. They do now: the screen owns the viewport
  ([05 §08.28](05-board.md)), and a kanban whose columns stop at different heights reads as four
  lists that happen to be side by side rather than as one board. The empty wells are the point —
  they are where a card can be dropped, and a 40px `Maybe` is a target nobody can hit.
- The time zone is stated once in the vacancy's meta line, never per card.

## The column

**`BoardColumn` is the well.** That is the system's one answer to "a container of things", and it is
`AppShell`'s own arrangement one level down: a recessed ground with white panels on it. The column
is `--surface-sunken` at `--radius-l`, and the only white on the board is the cards.

*Revised.* It was first drawn as a `Card` ([§12](../design-system/decisions.md))
*containing* that well — five bordered white boxes each holding a grey box, with a 24px heading over
a 14px card, which is a container drawn twice. A column is not a card; it is the ground the cards
are on, and its name is a label on that ground rather than a title above it.

| Part | Treatment |
|---|---|
| Head | Inside the well, `0 var(--space-4)` padding, no rule and no second surface |
| Column name | A real `<h2>` at `--font-size-s` / `--font-weight-medium` — the same weight a card's own name takes — **sentence case** |
| Count | `--font-size-xs`, `--text-secondary`, tabular-nums, **beside** the name and not pushed to the far edge: five columns of one word each, and a count 200px from what it counts reads as a column of its own |
| Body | `--space-2` / `--space-3` padding, `--space-3` gap, its own `overflow-y: auto`, `min-height: 76` — one card's worth, so an empty column is still worth aiming at |
| Head, narrow | **Absent.** Below 768px the column *is* the panel the tab strip chose, and that tab already carries both facts (`hideHeader`) |

The column names were uppercase in the earlier design and are not any more. The system's content rule is
explicit — *"Sentence case for everything except nav section titles… Tab labels (`PageTabs`) are the
one place text is fully UPPERCASE"*, since amended to name a panel `Card`'s micro-label `title`
([§66](../design-system/decisions.md)) as the other — and the narrow board's tab strip **is**
`PageTabs`, so the uppercase this screen may paint is already spent. `SectionLabel` → headings (D4) supplies the rest: the
name is the column's own `<h2>` in the outline under `PageTitle`'s `<h1>`, not a caption.

## The card

```
┌──────────────────────────┐
│ Jane Doe               ⚑ │   ← --font-size-s / medium / --text-primary
│ Fri, Aug 28 · 14:00      │   ← --font-size-xs / --text-primary, tabular-nums
└──────────────────────────┘
```

**`BoardCard` takes `Card`'s surface and the hover `Card` refuses, and the second half is the
interesting one.** §12 built `Card` *without* `--shadow-card-hover` and `scale(1.01)` on the stated
grounds that a lift belongs to a control, and painting one on a static container promises a click
that is not there. A board card **is** a control — it opens the
candidate — so the promise is true and the treatment is correct here. §12's refusal and §42's
adoption are the same rule read twice, not a disagreement.

| State | Treatment |
|---|---|
| Rest | `--surface-card`, 1px `--border-default`, `--radius-l`, no shadow |
| Hover | Border to `transparent`, `--shadow-card-hover`, `scale(1.01)`, over `--transition-card-hover` — the border is *replaced* by the shadow rather than doubled |
| Focus | `--shadow-focus-input`, composed with whatever shadow the card already carries — **on keyboard focus only** ([§68](../design-system/decisions.md)). A pointer press focuses the card too, and a ring left behind by a click answers a question nobody asked; on the keyboard it is the only thing saying where the arrow keys apply |
| **Held** (keyboard only) | `--action-primary` border, `--shadow-popover`, `translateY(-1px)`. A card dragged with a *pointer* is not drawn at all; what lifts under the cursor is the browser's own drag image |
| **Cancelled** | The whole card at `opacity: .65`, with a `Badge status="inactive" outlined size="s"` that names who cancelled. Never removed from its column. *Revised by a later pass: outlined, because a solid red pill is the system's loudest paint and this is the one card nobody has to act on, already dimmed* |
| **Past interview** | The date recedes to `--text-secondary`. Nothing else changes; the card does not move |

*Revised.* Two type steps moved. The name is `--font-size-s`, not
`--font-size-base`: a board is five 220px columns of these and the name is the one line that must
never wrap, so the step down is what buys the characters — and `--font-size-s` at `medium` is what
every other name in the product is set in. The date is `--font-size-xs` and reads at
`--text-primary` while the interview is still ahead, receding to `--text-secondary` only once it is
behind. It previously started at `--text-tertiary` and stepped down from there, which made an
upcoming interview quieter than the name above it — and the date is the reason to look at the
card.

### The cancelled mark

| Actor | Badge | Accessible name |
|---|---|---|
| Candidate | Cancelled by candidate | Cancelled by {submittedName} on {date} |
| Member | Cancelled by {firstName} | Cancelled by {memberFullName} on {date} — {reason} |

**First name only** on the badge: a board card is a glance, and the accessible name carries the full
name, the date, and the reason when one was given. **"Cancelled by candidate"** rather than the
candidate's own name, because their name is already the card's title and repeating it reads as a
bug.

That full sentence is an **`aria-label`, never a native `title`** — [§42](../design-system/decisions.md),
settled here as written. On an element that already has text content, `title` is the accessible
*description*; the text content still wins the name computation, so a `title` would leave the badge
named `Cancelled by Pat` with the whole fact read after it as a second sentence. The candidate card
reached the same conclusion from the other side in Phase 5, and the badge here is the same
component drawing the same fact.

### The missing-conclusion marker

`⚑` marks a card in `Didn't pass` or `Offer` with no conclusion recorded. Three things about it:

- **It is drawn, not typed.** the earlier design used the dingbat character `⚑`. The system's iconography rule
  admits no exceptions — *"every icon is a hand-authored inline SVG React component"*, *"no
  PNG/raster icons and no emoji are used as icons anywhere in the app"* — so the mark is
  `FlagIcon` ([§44](../design-system/decisions.md)), drawn to the system's stated rules the way `Eye` and
  `EyeOff` were in Phase 1. 14px, filled, `currentColor`.
- **It is `--status-warning`, not the tracker hue.** The token map would have carried the earlier design's
  `--tracker` amber onto `--color-tracker-blue`, and that is the one mapping in the table that must
  not be taken: the system reserves `#2AA7FF` for the floating time tracker and says so in as many words
  — *"intentionally different from the primary blue, not a mistake to normalize away"*. A warning
  mark painted in the tracker's colour would be borrowing the one hue the system has already spoken for.
  `--status-warning` is what the readme scopes to *"real state"*, and a recorded outcome with no
  reason behind it is precisely that. It is also what [§32](../design-system/decisions.md) already
  established the app may reach for.
- **The colour is never the only signal.** The glyph is `aria-hidden`; the sentence *No conclusion
  recorded* is a visually-hidden node wired as the card's `aria-describedby`, and the glyph also
  carries it as a native `title`.

That last line is the one place in this migration where native `title` is not a regression, and it
is worth saying why, because [§62](../design-system/decisions.md) spent three sites concluding
the opposite. `title` is harmful on an element that **already has a name** — it becomes the
description and the same sentence is read twice. This glyph has no name: it is an `aria-hidden`
decoration inside a `role="button"` whose name the caller supplies. So the bubble gives a pointer
user something and takes nothing from a reader, who has the always-resolving description instead.
The rule reversal 2 actually found — *whether the screen already has somewhere to say it* — is what
forces the hidden node here: a card is three lines and has nowhere.

### The CV mark, and why there is not one

`📄 CV` first became `CV` — the emoji was decoration beside a text label that already said the same
thing, and the system forbids emoji outright.

**A later pass removed the label too, and the argument that removed it is the stronger one:
it was on every card.** A booking cannot be made without a CV ([02 §03.8](02-booking-page.md)), so
the mark was true of every card in every column and distinguished nothing — while costing a third
line of height in five columns that scroll. A card is a glance, and every line on it has to earn
its place by being sometimes absent: the name always, the date always, the flag and the cancelled
badge only when they are true.

The CV itself did not go anywhere. It is on the candidate card, drawn as an attachment row that
opens it ([04 design](04-candidate-card.design.md)) — which is the screen with room to do something
about it, and the screen a board card is one click from.

`hasCv` leaves the board's payload with it ([05 §API](05-board.md)): nothing renders it, and a
field the response carries for no reader is a promise the next change has to keep.

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Header | *the vacancy's* — see [01 design](01-vacancies.design.md) | — | `page-title` |
| Column | **`BoardColumn`** ([§43](../design-system/decisions.md)) | `status`, `name`, `count`, `nameAs`, `hideHeader`, `placeholderIndex`, `placeholderHeight`, `onDragOverIndex`, `onDrop` | `board-column-{status}` · `board-column-count-{status}` · `board-column-empty-{status}` |
| Drop placeholder | **`BoardColumn`** | — | `board-placeholder-{status}` |
| Card | **`BoardCard`** ([§42](../design-system/decisions.md)) | `draggable`, `lifted`, `past`, `flag`, `onDragStart`, `onDragEnd`, `onKeyDown`, `onOpen` | `board-card-{id}` · `board-card-name-{id}` · `board-card-when-{id}` |
| Cancelled mark | `Badge` | `status="inactive"`, `aria-label` | `board-card-cancelled-{id}` |
| Missing conclusion | `FlagIcon` ([§44](../design-system/decisions.md)) | `title`, `aria-hidden` | `board-card-no-conclusion-{id}` |
| Narrow column picker | `PageTabs` ([§45](../design-system/decisions.md)) | `tabs` (object form), `active`, `onChange`, `label` | `board-tab-{status}` |
| Move failure · stale board | `Toast` in `ToastHost` ([§54](../design-system/decisions.md)) | `tone="error"`, `onDismiss` | `toast-move-failed` · `toast-board-stale` |
| Loading | `Preloader` | default 12/7, centred in the region | `board-loading` |
| Load failure | `Toast tone="error"` in `ToastHost`, and `EmptyState` + retry `Button` in the region's place | the toast leaves; the state stays with the way back inside it (§65) | `toast-board-load-failed` · `board-load-error` · `board-load-retry` |

The `toast-*` ids stay, and they are toasts again. They named the **announcement** rather than the
component drawing it — the call Phase 3 made when the first five of these moved off `Toast` onto
`InfoBanner` for want of one — and now that §54 exists, the two ids that were promises are
descriptions. `board-loading-skeleton` does not stay: it named the component, there is no skeleton,
and Phase 3's `vacancies-loading` is the shape to follow.

**A move that failed is a toast, and so is a board that could not be read — but the second one
also leaves something behind.** The distinction is whether the message is still true: a failed
drag is over — it happened, it is announced, it goes away — while a board that would not load is a
state, and it is standing in for the whole region. So its toast is the announcement, and the
region shows an `EmptyState` carrying the retry, in the shape the candidate database gives an
empty list: a toast that timed out over an empty board would otherwise leave nothing at all
saying why it is empty, and the retry inside the message would go with it. For a while the
whole message was an `InfoBanner` kept in the flow on that argument; the argument was right
about the region and wrong about the remedy
([ADR 0010](../../docs/adr/0010-hiring-page-states-stand-on-the-page-and-alerts-are-toasts.md)).

`BoardColumn` owns the placeholder, because the placeholder is a slot in the column rather than a
state of the card — the card being dragged is not rendered at all while it is in flight. The column
converts a pointer position into a **slot index** and hands it back; which columns exist, what a
slot means, and what a drop writes are all the screen's.

## Copy

| Slot | Text |
|---|---|
| Zone, in the vacancy's meta line | times in {zone} |
| Column names | Scheduled · Didn't pass · Maybe · Passed · Offer |
| Narrow tab labels | The same, uppercased by `PageTabs`' own CSS, with the count beside them |
| Empty column | Nothing here yet. |
| Empty board | No candidates yet. Share the booking link to start. |
| Missing conclusion | No conclusion recorded |
| Cancelled badge · candidate | Cancelled by candidate |
| Cancelled badge · member | Cancelled by {firstName} |
| Cancelled name · candidate | Cancelled by {submittedName} on {date} |
| Cancelled name · member | Cancelled by {memberFullName} on {date} — {reason} |
| Keyboard hint (visually hidden) | Press Space to pick up, arrow keys to move, Space to drop. |

## Interactions

- **Drag** — the card being dragged is **not rendered**. In its place a single card-sized
  placeholder — the `--surface-sunken` well showing through, outlined 1px dashed in
  `--action-primary` — opens the gap the drop would land in, and **travels** to follow the pointer
  between and within columns.

  There is one mark on the board at a time, never two. An earlier revision of this spec paired a
  placeholder at the *source* with a 2px insertion line at the target; two grey marks for one card
  read as two cards in flight, and the line was too slight to say what size the gap would be. The
  travelling placeholder shows the shape of the result instead of pointing at it.

  Its outline is `--action-primary` rather than a tint, for the same reason: the placeholder is the
  only thing on the board that should be reading as *here*, and the system carries almost all emphasis in
  one colour. A filled placeholder would be a second object.

  Its height is **measured from the card at pick-up**, so the gap is exactly the size of the thing
  going into it and the column does not resize as the card leaves it.
- **Optimistic move** — the card renders in its new place before the request resolves. On failure it
  returns and `toast-move-failed` is raised as a `Toast` ([§54](../design-system/decisions.md)),
  top-right over the page: nothing on the board moves to say so, a second failure adds a line
  rather than replacing the first, and the plate withdraws itself on the host's clock.
- **Drop into `Didn't pass` or `Offer`** — the move completes, then the card page opens with
  Conclusion focused. The navigation happens *after* the move is confirmed, so a failed move never
  navigates.
- **Keyboard drag** — `Space` picks up, arrows move between positions and columns, `Space` drops,
  `Escape` cancels and returns the card. Each step is announced.

  A card held by the keyboard **stays where it is**, lifted, and only the placeholder travels —
  unlike a pointer drag, where the card is not drawn at all. Moving it would re-parent the element
  between columns, and a focused node moved to a new parent is blurred, which would take the arrow
  keys, `Escape` and the drop itself with it one keystroke into the drag.
- **Motion is the system's**: `--transition-card-hover` (`--duration-quick`, 0.1s) on the card's own
  states and nothing longer anywhere. The system's rule is *"minimal and utilitarian… no bounce, no spring
  physics"*, and a board that eases slowly reads as sluggish under repeated use.
- `prefers-reduced-motion` removes the lift, the hover scale and the return, keeping the
  placeholder, which carries the information.

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
| < 768px | Columns become a `PageTabs` strip — one column at a time, the tab label carrying the count. Drag is replaced by the status control on the card page, which the board links to |

The first row is about the viewport, but the columns live inside the shell: with the system's 290px
sidebar and `AppShell`'s own 25px padding, five columns at their 220px minimum need roughly
**1510px of viewport** before they all fit. Between 1200px and that, the group still scrolls. This
is deliberate rather than a breakpoint to add — the invariant that matters is the one the middle row
states, and it holds at every width: the group scrolls inside its own container and the page body
never does.

**The columns have no `max-height` any more.** They used to carry
`100vh - var(--layout-navbar-height-desktop) - 2 * var(--space-9) - 120px`, with the mobile navbar
token swapped in below the breakpoint — every term named rather than rolled into a constant,
because the relayout had moved one of them and the arithmetic had to be re-readable. It was correct
and it was a re-derivation: the navbar's height, the shell's padding and a hand-counted 120px for
a page header, restated in CSS because nothing in the layout knew the answer.

The fold-in gave the layout the answer. The screen is a flex column of a definite height, the board
is `flex: 1` of it, and each column is `height: 100%` of the board with `min-height: 0` so it may
shrink. Three of the four terms are gone and the fourth — the header — is a real box that measures
itself. The one thing to keep in mind is that the group's horizontal scroller must set
`overflow-y: hidden` explicitly: `overflow-x: auto` alone computes the other axis to `auto` too,
and the columns already scroll themselves.

Below 768px, drag-and-drop is deliberately not attempted: a touch drag across a horizontally
scrolling container is unreliable, and the card's own status control does the same job.

**The narrow column keeps its head.** It duplicates the chosen tab, which looks redundant and is
not: the tab strip is the control that *chooses*, the head is the column's own identity, and it
carries the count in the position it holds at every other width. Dropping it would leave a scrolled
board showing a list of names with nothing saying which column they are in.

## Accessibility

- Each column is a labelled region whose accessible name includes its count. Below 768px it is also
  the `role="tabpanel"` its tab points `aria-controls` at.
- Cards are `role="button"` with an accessible name of "{name}, {status}, {date}".
- Drag is fully keyboard operable, with pick-up, target, and drop announced through a polite live
  region.
- The placeholder is paired with the announcement — position is never conveyed by the gap alone.
  It is `aria-hidden`: it is the visible half of something the live region already says, and a
  reader that met it as an element would hear an empty node between two cards.
- The missing-conclusion marker's meaning lives in a visually-hidden node the card points
  `aria-describedby` at, which is in the tree at all times and always resolves — not in the amber
  alone and not in a bubble that only exists on hover.
- Focus returns to the moved card after a drop, so a keyboard user does not lose their place.

## DS gaps

| Gap | Resolution |
|---|---|
| **`BoardCard`** | [§42](../design-system/decisions.md) — `packages/ds/src/components/data/BoardCard.tsx`. Presentational and drag-mechanical only; the five statuses, the ordering rule and every permission live in the app. **Designed from the system’s own vocabulary** |
| **`BoardColumn`** | [§43](../design-system/decisions.md) — `packages/ds/src/components/data/BoardColumn.tsx`, same split. The pick-up/gap/drop visual language becomes part of the design system with these two, so a second board would not invent its own. **Designed from the system’s own vocabulary** |
| No warning glyph anywhere in the system | [§44](../design-system/decisions.md) — `FlagIcon`, drawn to the system's icon rules. §9's position on `Eye`/`EyeOff`: nothing else in the app flags anything, so there was no mark to copy, and the rules are explicit enough to draw to |
| `PageTabs` was not a `tablist` | [§45](../design-system/decisions.md) — its tabs were `<a href="#">`, which a screen reader announces as links to nowhere, and the narrow board makes it the control that chooses which column is shown. They are buttons now, with `aria-selected`, `aria-controls`, a single tab stop and arrow keys |
| `PageTabs` took only `string[]` | Same entry — an object form beside it (`value` / `label` / `testId` / `controls`), which is §18's shape on `Table`. There is deliberately **no `count` prop**: a count composes into the `label` node, and a strip that grew one would then need a badge, and an icon |
