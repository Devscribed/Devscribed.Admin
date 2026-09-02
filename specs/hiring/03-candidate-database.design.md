---
id: "03"
kind: design
title: Candidate Database — Design
pairs-with: 03-candidate-database.md
routes: ["/org/{orgId}/hiring/candidates", "/org/{orgId}/hiring/my-interviews (redirect)"]
design-system: "1_DS for dev"
tags: [candidates, filters, filter-drawer, pagination, row-actions, toasts, scope-tabs, teammerly, light-only]
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
[page controls](#pagination) are what it reads position by.

The table itself is six columns and a kebab, and every one of them is a fact somebody scans for:
who, how to reach them, what for, when, where they got to, and what can be done about it.

## Layout — candidates

```
  Candidates                                                          ← PageHeader
  Times in Europe/Minsk
  ──────────────────────────────────────────────────────────────────────────
  ALL (128)  ASSIGNED TO ME (4)   [🔍 Search name or email…] [Filters (3)]  ← TableToolbar
  ═════════
  12 of 128 candidates
  ┌────────────────────────────────────────────────────────────────────────┐
  │ Name           │ Email        │ Vacancy      │ Interview date│Status│ ⋮ │
  │ Jane Doe       │jane@examp.com│ Senior React │  26 Aug 2026  │Sched.│ ⋮ │
  │ ▌English: B1   │              │ Sam Rowe     │     14:00     │      │   │
  └────────────────────────────────────────────────────────────────────────┘
                              ‹  1  2  3  ›                                  ← Pagination
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
- **There is no count line.** `blue-fixes` removed it. Each scope tab already carries its own
  count, computed under the filters that are applied — `All (12)` beside `Assigned to me (4)` — so
  a line under the strip repeating the active tab's number was the same fact twice, and the one it
  repeated is the one already in the reader's eye. What survives is the half a tab cannot show:
  while a request is in flight the row holds a `Preloader` and the word `Counting…`, announced
  politely, so a filter change is acknowledged before its rows arrive. It keeps
  `candidates-count`, because what that id names is the announcement, not the number.
  `Clear all` left with the filters: it is `Clear filters` now, at the bottom of the drawer, beside
  the controls it clears.
- The table is edge to edge inside a `Card padded={false}`, the same surface the vacancies list
  uses ([01](01-vacancies.design.md)): the card gives the table its border and rounds its first and
  last rows, and the loader sits inside it rather than replacing it. **An empty state does not.**
  The card is the *table's* — drawn around a sentence it is a bordered white slab the height of the
  viewport with one line of grey text near the top — so when there are no rows the `EmptyState`
  stands on the page's own ground, and the way out of it (`Clear filters`, 160px, inside the state
  rather than under it) is part of what the state says ([§65](../design-system/ledger.md)). The page strip sits **outside** it, under the card — it is a control about
  the list rather than a part of it, and the last row keeps its own border either way.

## The columns

| Column | `flex` | Holds |
|---|---|---|
| Name | 1.5 | the name, the application count beside it, the assessed-criteria chips beneath |
| Email | 1.2 | one line, ellipsised |
| Vacancy | 1.1 | the title over its interviewer, `All` scope only |
| Interview date | 1 | the date over the time, **centred** |
| Status | fixed 120px | the badge, or the outlined `Cancelled` |
| Actions | blue's own last column | the row kebab |

- **Vacancy and Interview date are two columns, not one stacked cell.** They are scanned for
  different reasons — *what for* and *when* — and they want different alignment: a title reads from
  its left edge and a date reads centred under its heading.
- The **interviewer** rides as a quieter second line under the vacancy title rather than taking a
  column of its own, because it is 1:1 with the vacancy and a column would only repeat it. It is
  absent in `Assigned to me`, where it is the viewer on every row ([03 §09.48](03-candidate-database.md)).
- The labels under a name are **assessments**, not vacancy categories: `English: B1` — the neutral `Badge` ([§59](../design-system/ledger.md))
  again, the same object the candidate card draws an assessment with, the same sentence in the
  other direction. The categories moved to the drawer with the rest of the filter machinery, and
  drawing them here as well said nothing the filter did not.
- Both two-line cells need `Table`'s §48 row growth and CSS of their own for the stack: blue's cell
  is one line, `nowrap` and clipped, and `text-overflow` cannot be set on the anonymous flex item
  the component renders.
- **Status is capped at 120px and Actions takes 96px** ([§60](../design-system/ledger.md)), which is the cap `Table` puts on its
  last column for exactly this — prod's own icon-only actions cell (§18). Before the kebab existed,
  Status was last and had to override the cap to fit `Didn't pass`; it no longer is, and blue's
  geometry is back where it was measured.

## The row's actions

```
  ⋮ ──▸ ┌──────────────────────────┐
        │ View in calendar         │
        │ Reschedule interview     │
        │ Cancel interview         │   ← --status-error
        │ View candidate           │
        │ Delete candidate         │   ← --status-error, admin/manager only
        └──────────────────────────┘
```

- Blue's `Popover` with no `trigger`, which draws prod's own 32px kebab: `rgba(0,0,0,0.08)` at rest,
  `--color-blue` with a white glyph while open. Nothing about it is drawn here.
- It is named for the person — `Actions for Jane Doe` — because twenty-five rows draw one glyph.
- `Cancel interview` and `Delete candidate` take `Popover`'s `danger` row, which is `--status-error`
  ink. This is the one place in the app that opt-in is used; prod has no destructive menu row at all.
- The two destructive rows are **not** adjacent by accident. `View candidate` sits between them
  because the menu is grouped by what an item is *about* — three interview actions, then the two
  about the person — and a `Delete candidate` immediately under `Cancel interview` would put the
  irreversible-looking one exactly where a hand aiming for the reversible one lands.
- **The menu must portal**, which is [§55](../design-system/ledger.md): blue positions it `absolute`
  inside the trigger, and a row menu near the bottom of a scrolling list is then clipped by the
  scroller. It is `position: fixed` off the trigger's own rectangle now, flipping upward when it
  would run off the viewport.
- The interview actions are **absent** on a cancelled row rather than disabled — there is nothing
  there to enable — and `Reschedule` and `Cancel` are absent on a **past** one for the same reason
  ([03 §10.54](03-candidate-database.md)). `View in calendar` stays either way.
- `Delete candidate` is **absent** for a caller who may not manage hiring, on the same principle
  and for a different reason: it is not that there is nothing to delete, it is that this is not
  their decision ([03 §11.60](03-candidate-database.md)). A disabled row would advertise an
  authority they can only ask somebody else for.

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
- The row is the sunken box, and deliberately **the same object the candidate card draws for an
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
| Criteria filter row | sunken row — `--surface-sunken`, 1px `--border-subtle`, `--radius-s` | — | `criteria-filter-row-{index}` |
| Criterion picker | `Select` | `isSearchable`, `label`, per-option `hint` (§21) | `candidates-criteria-filter-add` · `candidates-criteria-option-{id}` |
| Criterion controls | `Select` (op, 128px) · `Select`/`TextInput` (value, 112px) · `IconButton` (24px) | — | `criteria-filter-criterion-{index}` · `criteria-filter-op-{index}` · `criteria-filter-value-{index}` · `criteria-filter-remove-{index}` |
| Operator | `Select` (inside the chip's `trailing`) | `options` | `criteria-filter-op-{index}` |
| Value | `Select` \| `TextInput` | by type | `criteria-filter-value-{index}` |
| Archived marker | `Badge` | `status="inactive"`, `outlined` | `criteria-filter-archived-{index}` |
| Show results / Clear filters | `Button` | `variant="primary"` / default | `candidates-filters-apply` · `candidates-clear-filters` |
| Counting indicator | native `<p>` + `Preloader size={8}` — **only while a request is in flight** | `aria-live="polite"` | `candidates-count` |
| List | `Card padded={false}` > `Table` | `columns`, `rows`, **`busy`** | `candidates-list` |
| Assessed-criteria labels on a row | **`Badge status="neutral" size="s"`** ([§59](../design-system/ledger.md)), name in `--text-secondary` and value in `--text-primary` | — | `candidate-criterion-{id}-{criterionId}` |
| Vacancy + interviewer | native two-line cell | — | `candidate-vacancy-{id}` · `candidate-interviewer-{id}` |
| Interview date | native two-line cell | `align: 'center'` (§18) | `candidate-latest-{id}` |
| Status | `Badge` | `status`, `outlined` — four of the five outlined, `Offer` alone filled | `candidate-status-{id}` |
| Cancelled | `Badge` | `status="inactive"`, `outlined` | `candidate-status-{id}` |
| **Row actions** | `Popover` | `label`, `items` with `danger` / `testId` (§22, §55) | `candidate-actions-{id}` · `candidate-action-{verb}-{id}` |
| **Pagination** | `Pagination` | `page`, `pageCount`, `onChange`, `pageTestId` (§53) | `candidates-pagination` · `candidates-page-{n}` |
| **Toast** | `ToastHost` > `Toast` | `tone`, `onDismiss` (§54) | `toast-calendar-{id}` · `toast-interview-cancelled` |
| Cancel dialog | `Modal` + `FormActions` | the candidate card's own component | `application-cancel-dialog-{id}` |
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

An application's status is real state. The rule the five then follow is **hue is direction, and the
fill is spent once**:

| Status | `Badge` | Hue | Why |
|---|---|---|---|
| Scheduled | `status="info" outlined`, ink and border overridden to `--color-blue` | primary blue | Nothing has been decided yet — the interview is simply ahead |
| Maybe | `status="warning" outlined` | yellow | Decided to not decide |
| Passed | `status="active" outlined` | green | Cleared a stage — the process continues |
| Offer | `status="active"` | green | The settled good outcome, and the only fill |
| Didn't pass | `status="inactive" outlined` | red | The settled bad outcome |

*Revised by `blue-fixes`.* The rule was **hue is direction, fill is finality**, which made three of
the five solid — `Scheduled`, `Maybe` and `Didn't pass` — and put a column of filled pills down a
list that is mostly in-flight candidates. A list where most rows shout is a list where none of them
do, and blue's readme scopes the palette with *"used sparingly"*. The funnel is drawn in the
outlined idiom `Badge` already has, and the one fill is spent on `Offer`: the terminal good state,
and the one genuinely worth the loudest ink the palette can produce. It still corrects the
inversion Meridian had, where `Offer` was the *outlined* variant of `Passed` and the strongest
status in the funnel was drawn with the least emphasis.

`Scheduled` is the one row that overrides an ink. `outlinedInfo`'s cyan is the hue blue spends on a
**notice**; primary blue is the hue it spends on *the thing being worked on*, which is what an
interview that is still ahead is. The geometry is `Badge`'s, untouched — only the two colour stops
move.

`Maybe` takes blue's `outlinedWarning` unaltered: a `--status-warning` border with
`--text-primary` ink. §32 already settled that `#FFD02B` carries no legible text of its own, and
the alternative — mixing the token toward a dark orange — is a colour blue does not have.

Status is carried by the badge's **text** on every screen that draws one. The hue repeats it.

**A cancelled interview draws none of the five.** It takes `Badge status="inactive" outlined` under
the word `Cancelled`, in place of the status badge rather than beside it: `isCancelled` says the
interview did not take place and deliberately nothing about the candidate's standing
([07 §01.1](07-manage-booking.md)), so a row that showed both would be reporting a stage the
candidate never moved out of, next to the fact that the meeting never happened. Outlined, and not
the solid red `Didn't pass` takes — this is not an outcome. It is the same pair of values the board
card and the candidate card already use for the same mark.

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
| Column headers | Name · Email · Vacancy · Interview date · Status · Actions |
| Assessed-criteria chip | {criterion}: {value} |
| Application count | {n} applications |
| Cancelled interview | Cancelled |
| Row menu | View in calendar · Reschedule interview · Cancel interview · View candidate · Delete candidate |
| Row menu name | Actions for {name} |
| `View in calendar` toast | Not implemented yet |
| Delete title | Delete {name}? |
| Delete body | {n} applications and {m} assessments go with them. They come back, and all of it with them, if they book again with the same email. |
| Delete body, nothing recorded | Nothing has been recorded against them yet. They come back if they book again with the same email. |
| Delete buttons | Delete candidate · Cancel |
| Deleted toast | {name} deleted |
| Page strip | Pages · Previous page · Next page |
| Archived marker | Archived |
| Empty database | No candidates yet. Share a booking link to start. |
| No results | No candidates match these filters |
| Scope tabs | All ({n}) · Assigned to me ({n}) |
| Scope tablist name | Candidate scope |
| `Assigned to me`, nothing filtered, nothing to show | No upcoming interviews. |

Operator wording is deliberately plain English rather than `>=`. `at least B1` is what an
interviewer would say; `English >= B1` is what a database would.

Column headers and group labels are **sentence case**. Meridian set them in uppercase; blue's
`Table` header is 16px semibold as written, and its only uppercase treatment anywhere is
`PageTabs`.

## Pagination

Page controls are back, and [reversal 1](../design-system/README.md) is what they are back from.

The reversal read: *"the candidate database was paginated precisely because infinite scroll cannot
answer «how many match?», and that question is this screen's whole purpose"* — and the answer, when
the load-more row replaced them, was that the count answers it and does not move. That is still
true, and `blue-fixes` only moved **where** the count is said: it is in each scope tab's own label
now, computed under the applied filters, rather than on a line of its own. It is not what came
back.

What pagination carries is **position**, and the load-more row carried it badly on a list this
long. *Which twenty-five of a hundred and twenty-eight am I looking at* has no answer in a scroll
bar over an accumulating list, and *go back to where I was* has none at all. The count and the
strip answer two different questions and neither replaces the other, which is why both are on
screen.

- `Pagination` ([§53](../design-system/ledger.md)) — nothing in blue paginates, because prod's
  own list screens all load the next page inline. So its geometry is taken from blue's *small*
  controls rather than measured off a control that does not exist: 36px targets, `--radius-s`, a 1px
  `--border-default` hairline, and the current page filled `--color-blue` with `--text-on-accent` —
  which is exactly how `Calendar` paints a selected day.
- The arrows are blue's single `ArrowIcon`, rotated. There is no left/right pair in the set, and
  `Calendar`'s own navigation already rotates this one.
- Compression: first, last, and the current page's immediate neighbours; everything else collapses
  into an `aria-hidden` `…`. "There are pages here you cannot see" is not a fact a reader can act
  on, and the numbers either side already say it.
- The current page carries `aria-current="page"`. The fill is the paint; that is the statement.
- **At one page the control is not drawn at all**, which is the same rule the scope strip follows
  for a caller who may see one scope: a control offering one choice is not a choice.
- 25 rows to a page, which is the API's own default and needs no parameter from here.
- **A page change dims the rows exactly as a filter change does.** `Table busy` again — the page
  that is on screen stays until the next one has arrived, because a table that emptied and refilled
  would reflow the page under the reader at the one moment they are looking at it.
- Scroll position is not restored across a page change, and the strip does not scroll the list back
  to the top either: the rows changed under a viewport that did not move, which is what a page
  change *is*.

`Table footer` ([§34](../design-system/ledger.md)) loses its only consumer with the load-more row,
the way `hideHeader` lost its own when the two My interviews groups went. The prop stays and its
argument is unchanged — prod renders its next-page indicator *inside* the table, in the row position
the next page will occupy — and the next infinite list this kit grows will want it.

## Toasts

This is the first screen with more than one thing to confirm, and it is where the
`InfoBanner`-in-a-fixed-container surrogate stopped being adequate.

`InfoBanner` is a static panel inside the content: no enter, no exit, no queue, no notion of time.
One confirmation could live in the flow — [reversal 4](../design-system/README.md) put the
candidate card's under its `PageHeader` and it is still there. Three cannot: a panel that pushed
the table down on every row action would move the list under the hand that is working it.

So `Toast` + `ToastHost` are built here ([§54](../design-system/ledger.md)), and Phases 6, 7 and 9
each add more on top of them.

`{name} deleted` is the first of those, and it is also the only toast in the product raised by a
screen other than the one the action was taken on: the candidate card cannot report its own delete,
because it `404`s the instant the flag is set. The name is handed across that one navigation and
**taken** rather than read, so it announces itself once and a reload of the list says nothing
([03 §11.65](03-candidate-database.md)).

- Bottom-right, 25px in, 360px wide, stacked in a column with the oldest at the top. **They stack
  rather than replace**: two actions taken inside five seconds are two things that happened.
- The paint is `InfoBanner`'s, unchanged — the same status line over the same 10%-of-status fill,
  the same mark, the same `--font-size-xs` in `--text-tertiary`, the same `IconButton` dismiss.
- 0.3s ease-in-out in and out, which is `--duration-hover` and `--ease-standard` — every other
  motion in blue.
- They withdraw themselves after 5s, and the timer **holds while the pointer is over one or focus
  is inside it**: a message somebody is reading is not taken away mid-sentence.
- `ToastHost` is the `role="status"` `aria-live="polite"` region, not each message: a nested pair
  would announce one arrival twice.

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
  work — **except inside the actions menu**, which sits within the row by construction. The row
  asks whether the press landed in the menu rather than relying on containment, because the menu is
  a portal and is not a descendant of the anchor at all.
- **A page change is a request like any other**: the rows dim, the count holds its number, and the
  new page replaces the old one when it arrives.
- **`View in calendar` raises a toast and does nothing else** — and the toast says so, rather than
  describing a navigation this product cannot make. The interview's entry is the interviewer's own
  mailbox event and there is no deep link into one to offer ([03 §10.55](03-candidate-database.md)).

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
- **The count lives in the label, and only there.** Each tab counts what *it* would show under the
  filters already applied, so `All (12)` beside `Assigned to me (4)` answers both "how many match"
  and "and how many would the other one show?" before it is pressed. `blue-fixes` removed the
  separate count line this used to sit beside: two places saying one number, and the tab was
  already the one being read. What is lost with it is the org-wide total — a filter that matches
  nobody now reads `All (0)` rather than `0 of 128`. That is the trade, taken deliberately: the
  total answers a question nobody on this screen was asking, and the `Filters (n)` button already
  says that something is narrowing the list.
- **No strip at all** for a caller who may not see the whole database. Not a disabled tab, not a
  single-tab strip: a control offering one choice is not a choice, and a second tab would advertise
  a list they will never be shown. It is drawn only once the response has said so, so it never
  flashes in and out.
- The scope is in the address (`?scope=mine`, `all` implied by its absence) and remembered per
  browser. A tab press is `history.replaceState`, never a push — Back leaves the screen rather than
  walking the tab strip. **So is everything else the toolbar and the drawer are asking**: the
  search, the four filters and the page all join it, written the same way and for the same reason
  ([03 §09.53](03-candidate-database.md)). That is what a candidate card's back link comes back
  to — the list as it stood, not the tab it was on ([04 §01.8](04-candidate-card.md)) — and it is
  why the drawer can be closed, the card opened and the drawer found holding the same chips
  afterwards. Defaults stay absent from the URL, so the canonical address of the list is still the
  one the rail links to.
- Switching keeps the search and every filter, and returns to page 1. The strip survives
  `Clear filters` and is not counted in `Filters (n)`: it is navigation, not a filter chip. The
  one filter it *does* change is Interviewer, which is not offered in `Assigned to me` at all —
  and its value is kept rather than dropped, so switching back restores it.
- The `Assigned to me` empty state is the old screen's own line, *No upcoming interviews.*, with no
  clear-filters action beside it — nothing was filtered out, and offering to undo a filter that was
  never applied is worse than saying nothing.
- **The column headings no longer move with the scope**, and splitting the column is what settled
  it. There was one `Latest application` column holding a vacancy over a date, and it had to be
  re-headed `Interview` in `Assigned to me` — a heading saying "latest" over a date the list orders
  *ascending* would have been the row contradicting its own position, in words. `Vacancy` and
  `Interview date` are true readings of either application, so nothing has to move.
- **One thing still differs inside a row**: the interviewer line under the vacancy title, drawn in
  `All` and absent in `Assigned to me`, where it is the viewer on every row. It is the same shape as
  the missing tab strip and the missing Interviewer filter — a fact whose answer is already given is
  not drawn.

The old screen's two groups, `Upcoming` and `Past`, do not survive as groups: this list is
candidate-grain, so a person seen twice is one row. What they carried — *what is next for me* — is
carried by the scope's ordering instead ([03 §06.28](03-candidate-database.md), [§08.42](03-candidate-database.md)).
The order is the server's answer and arrives in it; this screen renders the array as it came, and
there is no sort control to draw.

`Table hideHeader` ([§34](../design-system/ledger.md)) loses its only consumer with those groups.
The prop stays; the argument for it — a short grouped list already named by the surface it sits in
— is unchanged, and so is [reversal 5](../design-system/README.md), which was about how such a
group is named rather than about this screen in particular.

## The dialogs

Three now, and the third is a different shape from the first two. Reschedule and Cancel are about
an **interview**; Delete is about the **person**, and it is the one the row and the candidate card
mount identically rather than asymmetrically.

### Delete candidate

Blue's `ConfirmDialog`, which is exactly what it is for: a yes/no whose accept is the whole action,
with no field in it. Two of its props matter here and both were added for this shape of
confirmation ([§41](../design-system/ledger.md)):

- **`closeOnAccept={false}`** — it stays up while the request is in flight. This is the last point
  at which the member can change their mind, and a dialog that dismissed on the press would leave
  the outcome to a toast that has not happened yet.
- **`busy`** — the accept button carries its preloader and neither control can be pressed again.

Blue paints the accept primary blue even here, and it stays that way. A destructive confirmation
says what it is in its title and its sentence, not in a button's fill — the same call the category
delete made ([06 design](06-libraries.design.md)).

The body carries both counts and, deliberately, **no "this cannot be undone"**. It would be false:
the record is kept and re-booking with the same address restores all of it
([03 §11.61](03-candidate-database.md)). Saying so is not an invitation — it is the one fact that
decides whether a recruiter reaches for this or for something else.

On the candidate card the same dialog is mounted from the header's kebab, with the same wording and
the same endpoint. It is the only dialog in hiring whose success is reported on a **different
screen**, because the screen that raised it stops existing.

### Reschedule and Cancel

Reschedule and Cancel are mounted by the candidate card, over the same endpoints the candidate's
own manage page uses, and they are the same two components in both places (07 design). The row's
kebab reaches them, and it reaches them **asymmetrically**: `Cancel interview` mounts the dialog
here, and `Reschedule interview` navigates to the card with the dialog already up. One is a
`TextArea` and a confirmation; the other fetches availability, holds a zone and a format, and
answers with a whole application — a second host for that is a second thing to keep in step, for
the sake of one click, on a screen whose internal door is the card anyway (07 §01.5).

Both are `Modal` + `FormActions`, not `ConfirmDialog` — the call Phase 3 made and
[flagged for Phase 6](../design-system/ledger.md): `ConfirmDialog` fires `onClose` in the same
breath as `onAccept`, so a confirmation whose action is a request with a busy state cannot use it.
Cancel is exactly that shape. §41 has since given `ConfirmDialog` `busy` and `closeOnAccept`, so
the objection is answered in principle — but Cancel also holds a field, and `ConfirmDialog` has no
slot for one, so the call stands on its own second reason.

- **Reschedule** holds a `SlotPicker` — the same `Calendar`, slot list, zone `Select` and format
  `ToggleButton` the public booking page draws. One picker, one behaviour, two hosts.
- **Cancel** holds a `TextArea` for the optional reason, with the character count in its
  **label row** ([§33](../design-system/ledger.md)) rather than under the field, so the count
  changing never moves the field beneath it.
- **On the card** they announce their outcome with an `InfoBanner` —
  [reversal 4](../design-system/README.md), in the slot Phase 3 fixed: directly under `PageHeader`,
  above the page body. `tone="success"` becomes `variant="success"`
  ([§7](../design-system/ledger.md)).
- **On this list the outcome is a real toast** ([§54](../design-system/ledger.md)), and the
  difference is the surface rather than an inconsistency: the card reports one outcome about the
  one interview filling the screen, and the list reports an outcome about a row that is still
  there — a banner in the flow would push the table down under the hand working it.
- The `toast-interview-rescheduled` and `toast-interview-cancelled` test ids are kept in both
  places, because they name the announcement rather than the component that draws it.

## Responsive

| Width | Layout |
|---|---|
| ≥ 1200px | As drawn |
| < 1200px | The drawer hangs from the 60px navbar instead of the 80px one (§51); the toolbar wraps, search and `Filters` below the tabs |
| 768–1023px | The `Email` column folds under `Name`; the other five are unchanged |

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
- The page strip is a named `<nav>`, its current page carries `aria-current="page"`, its arrows
  carry names because they are glyphs, and its `…` is `aria-hidden`.
- The row's kebab is named for the person it belongs to, so twenty-five identical glyphs are
  twenty-five distinguishable controls. `Popover` (§22) already gives the menu its roles, its
  keyboard model and its focus return; portalling it (§55) changes none of that.
- **The kebab's trigger sits inside the row's anchor, and that is a known compromise.** HTML says
  an `<a>` may hold no interactive descendant, and `Table`'s linked row is one element wrapping
  every cell (§18) — so a control in the last cell is nested in it. Every browser handles it and
  the keyboard walk is correct (the anchor, then the button; `Enter` on the button opens the menu,
  and the row's own handler refuses the press), but it is non-conforming and is written down rather
  than left to be found. The two ways out are both worse than it at this size: dropping `rowHref`
  costs the row middle-click, copy-address and open-in-new-tab, which is the whole reason §18 added
  it; and splitting the anchor so the actions cell falls outside it is surgery on `Table`'s row
  layout, hover and background for one cell. Revisit it if a third table wants a kebab.
- `ToastHost` is one polite live region and each `Toast` is a plain node inside it, so an arriving
  message is announced once. Nothing in a toast takes focus, and its dismiss is a real button.
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
| `Pagination` — nothing in blue pages a list | [§53](../design-system/ledger.md) — *composed from measured parts* |
| `Toast` / `ToastHost` — `InfoBanner` is a static panel with no motion, queue or clock | [§54](../design-system/ledger.md) — *designed* |
| `Popover` is positioned inside its trigger and is clipped by any scroller | [§55](../design-system/ledger.md) |
| ~~`Combobox` multi-select with chips~~ | `Select isMulti isSearchable`, [§20](../design-system/ledger.md) / [§21](../design-system/ledger.md) |
