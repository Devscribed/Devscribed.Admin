---
id: "03"
kind: design
title: Candidate Database — Design
pairs-with: 03-candidate-database.md
routes: ["/org/{orgId}/hiring/candidates", "/org/{orgId}/hiring/my-interviews"]
design-system: "1_DS for dev"
tags: [candidates, filters, filter-builder, infinite-scroll, my-interviews, teammerly, light-only]
---

# 03 — Candidate Database · Design

Visual and interaction specification for the candidate database and My interviews. Pairs with
[03-candidate-database.md](03-candidate-database.md), which owns the rules.

**Design system:** Teammerly Original DS, `1_DS for dev/`. The decisions behind it are in
[`specs/design-system/README.md`](../design-system/README.md); divergences from the vendored copy
carry numbers in the [ledger](../design-system/ledger.md).

**Theme:** light only. Both screens render inside the `AppShell`
(`specs/user-management/00-app-shell.design.md`) and draw no chrome of their own.

The design problem here is the filter bar: three kinds of filter, one of which is a repeatable
three-part row, on a screen that must still read as a list rather than a query builder.

Two things settled elsewhere land on this screen for the first time, and both are recorded below:
the [status palette](#status-badges) stops being a five-tone scale, and the
[page controls](#loading-more) go away.

## Layout — candidates

```
  Candidates                                                          ← PageHeader
  Times in Europe/Minsk
  ────────────────────────────────────────────────────────────────────
  [🔍 Search name or email…]
  ┌──────────────────────────────────────────────────────────────────┐
  │ Position   ⟨▌Senior React Eng. ×⟩                                │  ← filter Card
  │ Category   ⟨▌Senior ×⟩                                           │     --surface-sunken
  │ Criteria   [ English ▾][ at least ▾][ B1 ▾] ×                    │
  │            [ + Add criteria filter ]                             │
  └──────────────────────────────────────────────────────────────────┘
  12 of 128 candidates                                 [ Clear all ]
  ┌──────────────────────────────────────────────────────────────────┐
  │ Name          │ Email            │ Latest application │ Status   │
  │ Jane Doe      │ jane@example.com │ Senior React Eng.  │ Scheduled│
  │ ▌React ▌Senior│                  │ 26 Aug 2026, 14:00 │          │
  │ ────────────────────────────────────────────────────────────────  │
  │                          ● ● ●                                   │  ← load-more row
  └──────────────────────────────────────────────────────────────────┘
```

- The filter `Card` is `--surface-sunken` (`#EEF2F5`) rather than `--surface-card`, so it reads as
  a control surface distinct from the data below it. This is the last of the four `--bg-panel-2`
  uses in the token map; the shell's two were settled in Phase 2 the other way, onto
  `--surface-card`, because blue's shell is white panels around a `#f8fafc` well. A filter bar is
  neither — it is the sunken tone blue already uses behind a `Table`'s own header row.
- **The filter `Card` passes `clip={false}`.** Every control inside it opens a list into the card,
  and a `Card` clips to its radius by default. This is the surface
  [reversal 6](../design-system/README.md) was written for, and the first one to actually exercise
  it — Phase 3's two popovers opened from a `Modal` and from `PageHeader`, neither of which is a
  `Card`.
- Each filter kind is one row with a `FieldLabel` in a fixed 96px leading column, so the three
  labels align and the controls start at the same x. They are sentence case, not the uppercase
  Meridian drew: blue's only uppercase is `PageTabs`, and these are labels for the controls beside
  them rather than captions over a section.
- The count line sits between the filters and the table — the hinge between "what I asked for" and
  "what I got" — with `Clear all` trailing, present only when two or more filters are active.
- The table is edge to edge inside a `Card padded={false}`, the same one surface at every state
  that the vacancies list uses ([01](01-vacancies.design.md)): the card gives the table its border
  and rounds its first and last rows, and the loader, the empty message and the load-more row all
  sit inside it rather than replacing it.

## The criteria filter row

```
[ English        ▾ ][ at least ▾ ][ B1      ▾ ]  ×
  Select              Select        Select | TextInput
  isSearchable
```

- Three controls at `--space-1` gap, then a remove `IconButton size={34}`.
- The **criterion** control is `Select isSearchable` — blue's own control with the capability
  prod never switches on ([§21](../design-system/ledger.md)), not a second combobox.
- The **operator** control's options are derived from the chosen criterion's type; changing the
  criterion resets both the operator and the value rather than carrying a meaningless leftover
  across types.
- The **value** control's component is chosen by type: `Select` for `scale` (the criterion's
  ordered values) and `boolean`, `TextInput type="number"` for `number`, `TextInput` for `text`.
- Rows stack; `+ Add criteria filter` sits below the last one, `Button variant="ghost" size="sm"`.
- An **archived** criterion appears in the criterion select below the active ones, with its marker
  in the option's own label rather than as a trailing node — the control filters on its options'
  text, and a node there would make an archived criterion unfindable by typing its name.

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page header | `PageHeader` → `PageTitle` | `title`, `subtitle` | `page-title` |
| Search | `SearchInput` | `outlined`, `onClear` | `candidates-search-input` |
| Filter surface | `Card` | **`clip={false}`**, `--surface-sunken` | — |
| Filter labels | `FieldLabel` | `htmlFor` | — |
| Position / category | `Select` | `isMulti`, `isSearchable` | `candidates-filter-position` · `candidates-filter-category` |
| Filter chip | `Chip` (inside `Select isMulti`) | — | `candidates-filter-chip-{id}` |
| Criterion | `Select` | `isSearchable` | `criteria-filter-criterion-{index}` |
| Operator | `Select` | `options` | `criteria-filter-op-{index}` |
| Value | `Select` \| `TextInput` | by type | `criteria-filter-value-{index}` |
| Add / remove filter row | `Button` / `IconButton` | `variant="ghost"` | `candidates-criteria-filter-add` · `criteria-filter-remove-{index}` |
| Count | native `<p>` + `Preloader size={8}` | `aria-live="polite"` | `candidates-count` |
| Clear all | `Button` | `variant="ghost"`, `size="sm"` | `candidates-clear-filters` |
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
| Filter labels | Position · Category · Criteria |
| Add criteria filter | + Add criteria filter |
| Operators · scale | is · is not · at least · at most |
| Operators · number | is · is not · at least · at most |
| Operators · boolean | is yes · is no |
| Operators · text | contains · is |
| Count, unfiltered | {n} candidates |
| Count, filtered | {matched} of {total} candidates |
| Clear all | Clear all |
| Column headers | Name · Email · Latest application · Status |
| Application count | {n} applications |
| Archived marker | Archived |
| Empty database | No candidates yet. Share a booking link to start. |
| No results | No candidates match these filters |
| Loading more | Loading more candidates |
| My interviews title | My interviews |
| My interviews groups | Upcoming · Past |
| My interviews empty of upcoming | No upcoming interviews. |

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
  number, so the list does not collapse and reflow under the reader.
- **Removing a chip** widens the result set in place.
- **Changing a criterion** in a filter row resets its operator and value.
- **An incomplete criteria row** — criterion chosen, value empty — is ignored rather than treated
  as a filter, so the list never empties while the row is half-built.
- **Row click** opens the candidate card. Rows are real anchors, so middle-click and copy-address
  work.

## My interviews

A deliberately plain screen: no filters, no search, no page controls.

```
  My interviews                                                       ← PageHeader
  Times in Europe/Minsk
  ────────────────────────────────────────────────────────────────────
  Upcoming                                                            ← Card title, <h2>
  ┌──────────────────────────────────────────────────────────────────┐
  │ Jane Doe    Senior React Engineer    Wed 26 Aug, 14:00  Scheduled │
  └──────────────────────────────────────────────────────────────────┘
  Past
```

- Two groups, each a `Card` whose **`title` is the group name** at `titleAs="h2"`, wrapping a
  `Table hideHeader`.

  This is [reversal 5](../design-system/README.md), and it is the reason `hideHeader` keeps the
  rationale it was added with. `hideHeader` exists because the groups are "already named by the
  `SectionLabel` above them"; delete `SectionLabel` and that sentence has to name something else or
  the prop loses its argument. A `Card` title names the table **inside its own surface** rather
  than floating above it, so the naming is structural rather than a caption's proximity — and it is
  the same `<h2>` outline under `PageTitle`'s `<h1>` that Phase 3 established for captions
  ([§27](../design-system/ledger.md)).

  The `<section aria-label>` Meridian wrapped each group in is gone with it. The heading is a real
  heading now, so labelling a region with the same string would announce the name twice.
- Past rows render their date in `--text-secondary`. Meridian used `--text-faint`, the fourth text
  level blue does not have; this is [reversal 7](../design-system/README.md) taking the answer
  Phase 3 settled — a shown-but-receded thing is `--text-secondary`.
- The next-upcoming accent rule Meridian drew is **gone**. It was a `--accent-soft` left rule on one
  row, and blue's `Table` paints rows white with a `--color-row-hover` tint and nothing else; a
  coloured left edge on a single row is a treatment blue has no precedent for. Ordering and the
  group heading carry "what's next", which is what the accessibility note already said they did.
- When `Upcoming` is empty the group still renders, with its empty line, so the screen does not look
  broken on a quiet day. `Past` does not render at all when it is empty.
- Both rows' actions — Reschedule and Cancel — stay `ghost` `Button`s revealed on hover and on
  focus-within, and absent rather than disabled once the interview has passed or been called off.

## The two dialogs

Reschedule and Cancel are mounted by this screen and by the candidate card, over the same
endpoints, and they are the same two components in both places (07 design). Both are `Modal` +
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
| ≥ 1024px | As drawn |
| 768–1023px | Filter labels move above their controls; the `Email` column folds under `Name` |
| < 768px | Criteria filter rows stack their three controls vertically, each full width |

The filter `Card` never scrolls horizontally; its rows wrap.

## Accessibility

- The filter `Card` is a labelled `<section>` named "Filters", so three kinds of filter can be
  skipped whole on the way to the table.
- Each criteria row is a labelled group naming its index ("Criteria filter 1"), and its three
  controls carry labels that make sense read in sequence.
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
| ~~`Pagination`~~ | Deleted, not built — see [Loading more](#loading-more) |
| ~~`Combobox` multi-select with chips~~ | `Select isMulti isSearchable`, [§20](../design-system/ledger.md) / [§21](../design-system/ledger.md) |
