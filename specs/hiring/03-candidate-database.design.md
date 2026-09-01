---
id: "03"
kind: design
title: Candidate Database — Design
pairs-with: 03-candidate-database.md
routes: ["/org/{orgId}/hiring/candidates", "/org/{orgId}/hiring/my-interviews (redirect)"]
design-system: "1_DS for dev"
tags: [candidates, filters, filter-drawer, infinite-scroll, scope-tabs, teammerly, light-only]
---

# 03 — Candidate Database · Design

Visual and interaction specification for the candidate database, whose `Assigned to me` scope is
what My interviews became. Pairs with [03-candidate-database.md](03-candidate-database.md), which
owns the rules.

**Design system:** Teammerly Original DS, `1_DS for dev/`. The decisions behind it are in
[`specs/design-system/README.md`](../design-system/README.md); divergences from the vendored copy
carry numbers in the [ledger](../design-system/ledger.md).

**Theme:** light only. The screen renders inside the `AppShell`
(`specs/user-management/00-app-shell.design.md`) and draws no chrome of its own.

The design problem here is the filters: five kinds, one of which is a repeatable three-part
object, on a screen that must still read as a list rather than a query builder. The answer is that
they are **not on the screen** — they are in a drawer behind one counted button, and what stays
above the table is the scope, the search and the count.

Two things settled elsewhere land on this screen for the first time, and both are recorded below:
the [status palette](#status-badges) stops being a five-tone scale, and the
[page controls](#loading-more) go away.

## Layout — candidates

```
  Candidates                                                          ← PageHeader
  Times in Europe/Minsk
  ────────────────────────────────────────────────────────────────────
  ALL (128)  ASSIGNED TO ME (4)   [🔍 Search name or email…] [Filters (3)]  ← TableToolbar
  ═════════
  12 of 128 candidates
  ┌──────────────────────────────────────────────────────────────────┐
  │ Name          │ Email            │ Latest application │ Status   │
  │ Jane Doe      │ jane@example.com │ Senior React Eng.  │ Scheduled│
  │ ▌React ▌Senior│                  │ 26 Aug 2026, 14:00 │          │
  │ ────────────────────────────────────────────────────────────────  │
  │                          ● ● ●                                   │  ← load-more row
  └──────────────────────────────────────────────────────────────────┘
```

- The row above the table is blue's own `TableToolbar` — the geometry Projects, Clients, Members,
  ToDo, Policies and Holidays all share: the strip on the left, a 250px search and the actions on
  the right, 20px gaps, 20px down to the table. It gained nothing but the ability to be *addressed*
  ([§52](../design-system/ledger.md)); every number in it is blue's.
- `Filters` is a `Button variant="primary"`, and it carries its own count — `Filters (3)`. The
  count is what buys the hiding: a filter nobody can see is a filter nobody can undo. The search is
  not in it (it has its own field, always visible) and neither is the scope (it is navigation).
- **The filter `Card` is gone**, and with it the last of the four `--bg-panel-2` uses in the token
  map. It was `--surface-sunken` with `clip={false}` — the surface
  [reversal 6](../design-system/README.md) was written for and the only thing that ever exercised
  it. The prop stays on `Card`; the argument for it is unchanged, and the next list that opens a
  control inside a card will need it. Nothing on this screen does any more.
- The count line now sits alone between the toolbar and the table — still the hinge between "what
  I asked for" and "what I got", and still the only thing on the screen that announces itself.
  `Clear all` left with the filters: it is `Clear filters` now, at the bottom of the drawer, beside
  the controls it clears.
- The table is edge to edge inside a `Card padded={false}`, the same one surface at every state
  that the vacancies list uses ([01](01-vacancies.design.md)): the card gives the table its border
  and rounds its first and last rows, and the loader, the empty message and the load-more row all
  sit inside it rather than replacing it.

## The filter drawer

```
                                       ┌────────────────────────────────┐
                                       │ ×                              │  ← MenuDrawer, 340px
                                       │ Filters                        │
                                       │                                │
                                       │ Status                         │
                                       │ [ ▌Scheduled ×             ▾ ] │  ← Select isMulti
                                       │ Position                       │
                                       │ [ ▌Senior React Eng. ×     ▾ ] │
                                       │ Category                       │
                                       │ [ Any category             ▾ ] │
                                       │ Interviewer                    │
                                       │ [ ▌Sam Rowe (me) ×         ▾ ] │
                                       │ Criteria                       │
                                       │ [ Type a criterion…        ▾ ] │  ← Select isSearchable
                                       │ ▌English [at least ▾][B1 ▾] ×  │  ← Chip
                                       │                                │
                                       │ [       Show results       ]   │
                                       │ [      Clear filters       ]   │
                                       └────────────────────────────────┘
```

- Blue's `MenuDrawer`: 340px, `--shadow-drawer`, `translateX(105%)` at rest and a 0.3s slide,
  25/30 padding. It hangs from the navbar rather than over it —
  [§51](../design-system/ledger.md) replaces its hard-coded `top: 60px` (which was
  `--layout-navbar-height-mobile`, not a drawer measurement) with the shell's own switch.
- Five fields, stacked full width at `--space-6`, each one the same `Select`. The gap is the one
  the fields *need* rather than the one they look like they need: every `Select` hangs its
  error/hint slot below itself, and a tighter stack would sit a message on the label under it.
- Labels are `Select`'s own `label` prop — sentence case, blue's measured `10px 0 0 10px` label
  geometry — not the 96px leading column the card used. In a 340px panel a leading label column
  would leave 200px for a control that has to hold chips.
- **Interviewer is absent in `Assigned to me`**, not disabled. There is nothing to enable: the
  interviewer in that scope is the viewer. The viewer reads `{name} (me)` in the picker, so the
  field and the tab are visibly one mechanism rather than two.
- **A field with no options is not drawn at all** (03 §09.52). Four of the five read a library an
  interviewer may not GET, so their drawer is Status and nothing else — one honest control instead
  of five, four of which would answer `No options`. It is the one place this screen's two kinds of
  caller differ inside the panel, and it is the same shape as the missing tab strip.
- `Show results` is `Button variant="primary"`; `Clear filters` sits under it, and only while
  something is applied. Stacked rather than side by side, so the one that undoes work is never
  adjacent to the one that merely dismisses.
- Nothing here applies anything. Every control fires on change, the count under the toolbar moves
  while the drawer is still open, and `Show results` just gets the panel out of the way.

## The criteria filter chip

```
  [ Type a criterion…                    ▾ ]      ← Select isSearchable, over the library
  ▌English  [ at least ▾ ][ B1 ▾ ]  ×             ← Chip: label, trailing, onRemove
```

- The criterion is chosen **once**, in the autocomplete above the chips, and choosing it is what
  creates the chip. There is no criterion control on the chip itself, which is what removes the
  three-`Select` row that read as a query builder.
- The chip is blue's `Chip`, and deliberately **the same object the candidate card draws for an
  assessment** (`card-criterion-*`): the criterion's name as the label, the controls in the
  `trailing` slot ([§37](../design-system/ledger.md)), a cross to drop it. It is the same thing
  said in the other direction — the card records *this candidate's English is B1*, the filter asks
  *whose English is at least B1* — and the operator sits between the name and the value, where it
  reads as part of that sentence.
- The chip's `cursor: pointer` is turned off. Only the cross and the two controls are clickable,
  and the name between them promises nothing — the card's own call, for the card's own reason.
- The chip wraps: 340px minus 60px of padding does not always hold a name and two 44px controls on
  one line, so the operator and the value fall to a second row *inside* the chip rather than
  overflowing it.
- The **operator** is set from the chosen criterion's type and is never blank — a chip reading
  *English · … · B1* would be asking for a control whose only sensible default is sitting right
  there. Changing it resets the value.
- The **value** control's component is chosen by type: `Select` for `scale` (the criterion's
  ordered values), `TextInput type="number"` for `number`, `TextInput` for `text`. A `boolean` has
  **no value control**: its answer travels in its operator (`is yes` / `is no`).
- An **archived** criterion is offered below the active ones, with the marker as the option's
  `hint` ([§21](../design-system/ledger.md)) rather than welded into its label: `hint` is drawn
  inside the row and is part of the option's accessible name, while the control filters on the
  label alone — so the badge is visible *and* the criterion is still findable by typing its name.
  A chip built from one carries the same `Badge status="inactive" outlined` beside it.

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page header | `PageHeader` → `PageTitle` | `title`, `subtitle` | `page-title` |
| Toolbar | `TableToolbar` | `tabs`, `activeTab`, `tabsLabel`, `tabsTestId`, `search*` (§52) | — |
| Scope tabs | `PageTabs` (inside `TableToolbar`) | `tabs` (object form), `active`, `label` | `candidates-scope-tabs` · `candidates-scope-all` · `candidates-scope-mine` |
| Search | `SearchInput` (inside `TableToolbar`) | `outlined`, `onClear` | `candidates-search-input` |
| Filters button | `Button` | `variant="primary"`, `aria-expanded`, `aria-haspopup="dialog"` | `candidates-filters-open` |
| Filter surface | `MenuDrawer` | `open`, `onClose`, `closeLabel`, `role="dialog"` (§51) | `candidates-filters` · `candidates-filters-close` |
| Status / position / category / interviewer | `Select` | `isMulti`, `label`, `isSearchable` (not on status) | `candidates-filter-status` · `candidates-filter-position` · `candidates-filter-category` · `candidates-filter-interviewer` |
| Filter chip | `Chip` (inside `Select isMulti`) | — | `candidates-filter-chip-{id}` |
| Criterion picker | `Select` | `isSearchable`, `label`, per-option `hint` (§21) | `candidates-criteria-filter-add` · `candidates-criteria-option-{id}` |
| Criterion chip | `Chip` | `trailing` (§37), `onRemove`, `removeTestId` | `criteria-filter-row-{index}` · `criteria-filter-criterion-{index}` · `criteria-filter-remove-{index}` |
| Operator | `Select` (inside the chip's `trailing`) | `options` | `criteria-filter-op-{index}` |
| Value | `Select` \| `TextInput` | by type | `criteria-filter-value-{index}` |
| Archived marker | `Badge` | `status="inactive"`, `outlined` | `criteria-filter-archived-{index}` |
| Show results / Clear filters | `Button` | `variant="primary"` / default | `candidates-filters-apply` · `candidates-clear-filters` |
| Count | native `<p>` + `Preloader size={8}` | `aria-live="polite"` | `candidates-count` |
| List | `Card padded={false}` > `Table` | `columns`, `rows`, **`busy`** | `candidates-list` |
| Category chips on a row | `Chip` | — | — |
| Status | `Badge` | `status`, `outlined` | `candidate-status-{id}` |
| **Load more** | `Table footer` > `Preloader size={8} margin={5}` | — | `candidates-load-more` |
| Loading | `Preloader` | — | `candidates-loading` |
| Empty / no results | `EmptyState` | — | `candidates-empty-state` · `candidates-no-results` |

## Status badges

The five application statuses do **not** map onto five tones any more. Blue's `Badge` is
`ActivityBadge` — a two-state pill on a *user*, solid green for active and solid red for inactive,
plus an outlined form of each for lower-emphasis contexts. Four paints, and no fifth.

Mapping five statuses onto four would force `Scheduled` — which is neither good news nor bad — to
be painted as one or the other. That is not a lost reinforcement, which is what
[reversal 9](../design-system/README.md) accepted on the login banner; it is colour actively
saying something false. So `Badge` gains blue's two remaining status hues
([§32](../design-system/ledger.md)), which blue's readme already names and scopes:

> Status colors (green/yellow/red/cyan) are used sparingly and only for real state
> (active/inactive badges, form errors, info banners).

An application's status is real state. The rule the five then follow is **hue is direction, fill is
finality**:

| Status | `Badge` | Hue | Why |
|---|---|---|---|
| Scheduled | `status="info"` | cyan | Nothing has been decided yet |
| Maybe | `status="warning"` | yellow | Decided to not decide |
| Passed | `status="active" outlined` | green | Cleared a stage — the process continues |
| Offer | `status="active"` | green | The settled good outcome |
| Didn't pass | `status="inactive"` | red | The settled bad outcome |

Only the two terminal states are solid, which is what keeps "sparingly" true: a list of in-flight
candidates is mostly outlined pills, and a filled one means the process ended. It also corrects an
inversion Meridian had — `Offer` was the *outlined* variant of `Passed`, so the strongest status in
the funnel was drawn with the least emphasis.

`Maybe` is the one variant that does not take blue's solid treatment literally. Blue paints a solid
badge as white on the status hue, which works on the green and the red; `#FFD02B` is light enough
that white on it is not a legibility trade-off but an absence of text. The yellow therefore stays
on the border and the label takes `--text-primary`. No colour is invented — see
[§32](../design-system/ledger.md).

Status is carried by the badge's **text** on every screen that draws one. The hue repeats it.

## Copy

| Slot | Text |
|---|---|
| Page title | Candidates |
| Page subtitle | Times in {zone} |
| Search placeholder | Search name or email… |
| Filters button | Filters · Filters ({n}) |
| Drawer title | Filters |
| Filter labels | Status · Position · Category · Interviewer · Criteria |
| Filter placeholders | Any status · Any position · Any category · Any interviewer |
| Criterion picker placeholder | Type a criterion… |
| Interviewer picker, the viewer | {name} (me) |
| Drawer actions | Show results · Clear filters |
| Operators · scale | is · is not · at least · at most |
| Operators · number | is · is not · at least · at most |
| Operators · boolean | is yes · is no |
| Operators · text | contains · is |
| Count, unfiltered | {n} candidates |
| Count, filtered | {matched} of {total} candidates |
| Clear filters | Clear filters |
| Column headers | Name · Email · Latest application · Status |
| Application count | {n} applications |
| Archived marker | Archived |
| Empty database | No candidates yet. Share a booking link to start. |
| No results | No candidates match these filters |
| Loading more | Loading more candidates |
| Scope tabs | All ({n}) · Assigned to me ({n}) |
| Scope tablist name | Candidate scope |
| `Assigned to me`, nothing filtered, nothing to show | No upcoming interviews. |

Operator wording is deliberately plain English rather than `>=`. `at least B1` is what an
interviewer would say; `English >= B1` is what a database would.

Column headers and group labels are **sentence case**. Meridian set them in uppercase; blue's
`Table` header is 16px semibold as written, and its only uppercase treatment anywhere is
`PageTabs`.

## Loading more

Page controls are gone. `Pagination` was Meridian's, and blue's list screens scroll —
`ProjectsTable`, `ToDosTable` and `ClientsTable` all load the next page inline
([§D4](../design-system/README.md)).

[Reversal 1](../design-system/README.md) is the thing to get right here: the candidate database was
paginated *precisely because* infinite scroll cannot answer "how many match?", and that question is
this screen's whole purpose. **It is answered by the count line, which does not move.** The count
was never part of the pagination control — it is its own `aria-live` node above the table, it
already said `12 of 128 candidates`, and it goes on saying it. What pagination actually carried was
*position*, and the load-more row carries that instead: rows below the fold mean more to come, no
row means the list is complete.

- The next page loads when the load-more row enters the viewport, and the row is only rendered
  while `rows.length < matched`.
- It is a row **inside** the table, not a control beneath it: `Table`'s `footer` slot holding a
  centred `Preloader size={8} margin={5}`. Those two values are blue's own — the readme measures
  `.loadNextTableIndicator` at exactly that size, distinct from the 12/7 the overlay loader uses.
- The dots carry no text, so the row is named for a reader by a visually-hidden `aria-live` node
  beside them, the same pairing the vacancies list uses for its loader.
- **Changing any filter empties the accumulated list and starts again at page 1.** A filter change
  is a new question, and rows fetched against the old one are not part of its answer.
- Scroll position is not restored on a filter change, because the list it indexed no longer exists.

## Interactions

- **Search** debounces 300 ms then refetches, carrying the current filters. The count updates with
  the result, never optimistically.
- **Every filter change refetches immediately** — filters are discrete choices, unlike typing.
- **The count is the feedback.** No spinner replaces the table on a refilter; the rows stay,
  `Table busy` dims them and sets `aria-busy`, and the count shows a `Preloader` in place of the
  number, so the list does not collapse and reflow under the reader. This is also what makes the
  drawer work: the panel covers a strip of the list, not the count, so a filter's effect is
  legible without closing it.
- **The drawer opens on the button and closes four ways** — the button's own `Escape`, the scrim,
  the close cross and `Show results`. None of them is *Apply*; there is nothing to apply.
- **Removing a chip** widens the result set in place.
- **Choosing a criterion** adds its chip with the type's first operator already set; **changing
  the operator** resets the value.
- **An incomplete criteria chip** — criterion chosen, value empty — is ignored rather than treated
  as a filter, so the list never empties while the chip is half-built, and it is not counted in
  `Filters (n)`. A `boolean` chip is complete the moment it appears: `is yes` is a whole question.
- **Row click** opens the candidate card. Rows are real anchors, so middle-click and copy-address
  work.

## Scope tabs

My interviews is not a screen any more — it is a `PageTabs` strip above this list, and everything
the old screen drew has an answer here.

```
  ALL (128)  ASSIGNED TO ME (4)   [🔍 Search name or email…] [Filters (3)]
  ═════════
```

- The strip is `TableToolbar`'s left slot, which is where every other list screen in the kit puts
  one. It is drawn only once the response has said the caller may see both scopes; until then the
  toolbar's left side is empty and the search stays where it is.
- Blue's `PageTabs`, in the object form ([§45](../design-system/ledger.md)): each tab carries a
  `value` distinct from its label, a `testId`, and a label that is **the scope's name and its
  count**. The component deliberately has no `count` prop — a count composes into the label, and a
  strip that grew one would then need a badge for it, and an icon.
- Real `role="tab"` buttons in a named `role="tablist"`, one tab stop, arrow keys moving and
  selecting as they go. The strip chooses what is shown; it is not a set of destinations, and it is
  not drawn as links.
- Uppercase, because `PageTabs` is the one place blue uppercases anything — which is also why the
  column headers below it are sentence case.
- **The count lives in the label.** The count line above the table still reads
  `12 of 128 candidates`, and in `Assigned to me` with nothing filtered it reads `4 of 128` — four
  are mine, a hundred and twenty-eight exist, and neither number says the other.
- **No strip at all** for a caller who may not see the whole database. Not a disabled tab, not a
  single-tab strip: a control offering one choice is not a choice, and a second tab would advertise
  a list they will never be shown. It is drawn only once the response has said so, so it never
  flashes in and out.
- The scope is in the address (`?scope=mine`, `all` implied by its absence) and remembered per
  browser. A tab press is `history.replaceState`, never a push — Back leaves the screen rather than
  walking the tab strip.
- Switching keeps the search and every filter, and returns to page 1. The strip survives
  `Clear filters` and is not counted in `Filters (n)`: it is navigation, not a filter chip. The
  one filter it *does* change is Interviewer, which is not offered in `Assigned to me` at all —
  and its value is kept rather than dropped, so switching back restores it.
- The `Assigned to me` empty state is the old screen's own line, *No upcoming interviews.*, with no
  clear-filters action beside it — nothing was filtered out, and offering to undo a filter that was
  never applied is worse than saying nothing.
- **The third column's heading moves with the scope**: `Latest application` in `All`,
  `Interview` in `Assigned to me`. The column holds a different application in each
  ([03 §08.44](03-candidate-database.md)) — the candidate's most recent one, against the viewer's
  own nearest — and the second is what the rows are *sorted by*. A heading that said "latest" over
  a date the list ordered ascending would be the row contradicting its own position, in words.
  Nothing else about the column changes: same two lines, same testid, same width.

The old screen's two groups, `Upcoming` and `Past`, do not survive as groups: this list is
candidate-grain, so a person seen twice is one row. What they carried — *what is next for me* — is
carried by the scope's ordering instead ([03 §06.28](03-candidate-database.md), [§08.42](03-candidate-database.md)).
The order is the server's answer and arrives in it; this screen renders the array as it came, and
there is no sort control to draw.

`Table hideHeader` ([§34](../design-system/ledger.md)) loses its only consumer with those groups.
The prop stays; the argument for it — a short grouped list already named by the surface it sits in
— is unchanged, and so is [reversal 5](../design-system/README.md), which was about how such a
group is named rather than about this screen in particular.

## The two dialogs

Reschedule and Cancel are mounted by the candidate card, over the same endpoints the candidate's
own manage page uses, and they are the same two components in both places (07 design). This screen
mounted them too while My interviews had rows of its own; the row gets them back when the table
grows its actions kebab. Both are `Modal` +
`FormActions`, not `ConfirmDialog` — the call Phase 3 made and
[flagged for Phase 6](../design-system/ledger.md): `ConfirmDialog` fires `onClose` in the same
breath as `onAccept`, so a confirmation whose action is a request with a busy state cannot use it.
Cancel is exactly that shape.

- **Reschedule** holds a `SlotPicker` — the same `Calendar`, slot list, zone `Select` and format
  `ToggleButton` the public booking page draws. One picker, one behaviour, two hosts.
- **Cancel** holds a `TextArea` for the optional reason, with the character count in its
  **label row** ([§33](../design-system/ledger.md)) rather than under the field, so the count
  changing never moves the field beneath it.
- Both announce their outcome with an `InfoBanner`, not a toast — [reversal 4](../design-system/README.md),
  in the slot Phase 3 fixed: directly under `PageHeader`, above the page body. `tone="success"`
  becomes `variant="success"` ([§7](../design-system/ledger.md)); the `toast-interview-rescheduled`
  and `toast-interview-cancelled` test ids are kept, because they name the announcement rather than
  the component that draws it.

## Responsive

| Width | Layout |
|---|---|
| ≥ 1200px | As drawn |
| < 1200px | The drawer hangs from the 60px navbar instead of the 80px one (§51); the toolbar wraps, search and `Filters` below the tabs |
| 768–1023px | The `Email` column folds under `Name` |

The drawer is 340px at every width and `max-width: 100%` below it; its fields are full width and
the criterion chip wraps its controls onto a second line rather than overflowing. Nothing in it
scrolls horizontally.

## Accessibility

- The `Filters` button carries `aria-expanded` and `aria-haspopup="dialog"`, and its label carries
  the applied count — so how many filters are on is part of the control's name, not a paint.
- The drawer is a `role="dialog"` labelled by its own `Filters` heading. Focus moves into it when
  it opens and returns to the button when it closes, and `Escape` leaves — but focus is **not
  trapped**, which is the same call `AppShell` made for the rail it turns into below 1200px
  ([§14](../design-system/ledger.md)): the list behind it is still live, and the panel is a place
  to work rather than a modal question. Everything inside it is one Tab walk, in the order it is
  drawn.
- Each criterion chip is a labelled group naming its index ("Criteria filter 1"); its operator and
  value name the criterion they belong to ("Operator for English"), so they make sense read out of
  order, and its cross is named `Remove English`.
- Five kinds of filter no longer sit between the top of the page and the table at all — which is
  the accessibility argument for the drawer as much as the visual one. The labelled `<section>`
  that existed to let them be skipped is gone with them.
- The count is `aria-live="polite"` — it is the primary feedback for a filter change and the one
  thing that must be announced.
- `Table busy` dims the body and sets `aria-busy` together, so the dimming is never the only signal.
- The load-more row's `Preloader` is `aria-hidden` and announced by a visually-hidden live node
  beside it.
- Status badges carry their meaning in text; the hue repeats it.
- Every day cell, slot and dialog control inside the two dialogs follows the two control specs
  ([calendar](controls/calendar-control.md), [slots](controls/time-slot-picker-control.md)).

## DS gaps

Every row here is now a numbered entry in the [ledger](../design-system/ledger.md); this table is
the index.

| Gap | Entry |
|---|---|
| `Calendar` — blue's `DateField` is a 140px text field, and `DateRangePicker` is a range over past dates | [§30](../design-system/ledger.md) — *designed, not measured* |
| `ToggleButton` forwards nothing and announces two unrelated buttons | [§31](../design-system/ledger.md) |
| `Badge` has two status hues; the funnel has five states | [§32](../design-system/ledger.md) — *designed* |
| `TextArea` has no `trailing` slot in the label row | [§33](../design-system/ledger.md) |
| `Table` has no busy, header-less or footer form | [§34](../design-system/ledger.md) |
| `MenuDrawer` hangs from a hard-coded 60px and cannot be named, tagged or left by keyboard | [§51](../design-system/ledger.md) |
| `TableToolbar` draws two controls and gives no way to address either | [§52](../design-system/ledger.md) |
| ~~`Pagination`~~ | Deleted, not built — see [Loading more](#loading-more) |
| ~~`Combobox` multi-select with chips~~ | `Select isMulti isSearchable`, [§20](../design-system/ledger.md) / [§21](../design-system/ledger.md) |
