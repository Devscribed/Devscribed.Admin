---
id: "01"
kind: design
title: Vacancies — Design
pairs-with: 01-vacancies.md
routes: ["/org/{orgId}/hiring/vacancies", "/org/{orgId}/hiring/vacancies/{vacancyId}"]
design-system: "@devscribed/ds"
tags: [vacancy, table, modal, select, disabled-option, teammerly, light-only]
---

# 01 — Vacancies · Design

Visual and interaction specification for the vacancies list, the vacancy detail page, and the
create/edit dialog. Pairs with [01-vacancies.md](01-vacancies.md), which owns the rules and every
validation message.

**Design system:** [`packages/ds`](../../packages/ds/README.md). Import from `@devscribed/ds`;
never hardcode a colour, size or font — every value below is a token that already exists. The
numbered decisions behind it are in [`decisions.md`](../design-system/decisions.md), cited here
as `§n`.

**Theme:** light only. Both screens render inside the `AppShell`
(`specs/user-management/00-app-shell.design.md`) and draw no chrome of their own.

> **Amended by Phase 4.** The category picker in the dialog now **closes its menu** when a
> category is chosen. The system kept a multi-select's list open, which the underlying control
> recreates — does only when `closeMenuOnSelect` is explicitly `false`; restoring the default is
> [§36](../design-system/decisions.md). Nothing else on these screens changed, and
> `hiring-vacancies.spec.ts` is unaffected.

> **Amended by Phase 7 — the list.** The filter row is gone and the system's `TableToolbar`
> ([§52](../design-system/decisions.md)) is in its place: the status `Select` became a **tab strip
> with counts**, the search moved into the toolbar's own 250px slot, and `New vacancy` came off
> the page header to join it. Every row grew the **actions kebab** the detail page already had,
> and the two announcements it raises are real `Toast`s ([§54](../design-system/decisions.md)) rather
> than the banner slot below — the list is not a page an action was taken *about*, it is a page
> an action was taken *from*. The [Layout — list](#layout--list), [Component
> map](#component-map), [Copy](#copy) and [States](#states) sections are Phase 7's; the detail
> page and both dialogs are untouched and are Phase 8's.

These are the first screens to **lose components rather than repaint them**, so the calls made
here are the ones Phases 4–7 follow: [where a persistent banner sits](#the-banner-slot), [which
heading a caption becomes](#headings), and [what replaces a tooltip](#the-blocked-action).

## Sidebar

Hiring is the second group in the rail, below `People`:

| Group | Row | Route | Visible to |
|---|---|---|---|
| Hiring | Vacancies | `/org/{orgId}/hiring/vacancies` | admin, manager |
| Hiring | Candidates | `/org/{orgId}/hiring/candidates` | admin, manager, an assigned interviewer |
| Hiring | Libraries | `/org/{orgId}/hiring/settings` | admin, manager |

A member with no hiring access sees no Hiring group at all, not an empty one — the shell resolves
the session before rendering anything, so a gated row never flashes into view and back out.

> **Amended by Phase 3.** These rows were a **flat** list of three, the third of which was
> `My interviews`, gated on assignment rather than role. The rail now takes the system's **collapsible
> submenu** — `Hiring` is a real `<button aria-expanded>` and a toggle, not a destination — and
> the group holding the current route is open on arrival.
> [`00-app-shell.design.md`](../user-management/00-app-shell.design.md) owns that shape and is the
> spec for it; this table is only which rows hiring contributes.
>
> `My interviews` left the rail in Phase 1: it is the candidate database's `Assigned to me` scope
> now ([03 §08](03-candidate-database.md)), which is also why `Candidates` is the one hiring row an
> interviewer sees. `Settings` became `Libraries` in Phase 3 — the route did not move, because
> nothing on that screen is a setting ([06](06-libraries.md)).

## Layout — list

```
  Vacancies                                                          ← PageHeader
  ─────────────────────────────────────────────────────────────────
  ALL (12)  OPEN (9)  CLOSED (3)  [🔍 Search…]   [ New vacancy ]     ← TableToolbar
  ═════════
  ┌───────────────────────────────────────────────────────────────┐
  │ Title            │ Interviewer │ Length │ Candidates │Status│⋮ │  ← Card > Table
  │ Senior React Eng.│ Pat Owner   │ 60 min │     12     │ Open │⋮ │
  │ [React] [Senior] │             │        │            │      │  │
  └───────────────────────────────────────────────────────────────┘
```

- The row above the table is the system's own `TableToolbar` — the geometry Projects, Clients, Members,
  ToDo, Policies and Holidays all share, and the one the candidate database took in Phase 4: the
  strip on the left, a 250px search and the actions on the right, 20px gaps, 20px down to the
  table. It gained nothing but the ability to be *addressed* ([§52](../design-system/decisions.md)).
- **Tabs carry no shadow on click.** The strip's focus ring is keyboard-only
  ([§68](../design-system/decisions.md)): `focus` fires on a pointer press as well, so a click used
  to leave a glow on the chosen tab until something else was clicked. The ring is unchanged for
  the case it was added for — arriving by `Tab` and moving with the arrow keys.
- **The status filter is the strip.** It was a 160px `Select` beside the search: three choices,
  two clicks, and no way to learn how the library divides without making one. As tabs it is one
  click and the counts are on the labels. They are computed under the **search** and not under the
  tab, because a label narrowed by its own tab would read `Closed (0)` while standing on `Open`.
- **The page header keeps its title and loses its action.** `New vacancy` moved into the toolbar,
  where everything that acts on the whole list now lives. The header stays because it is the
  screen's `<h1>` and every screen inside this shell opens with one — the design's own prototype
  draws the list with no title at all, which is a property of a page-flipper demo and not a
  decision; its candidate database, drawn from the same source, keeps its header.
- The table is edge to edge inside a `Card padded={false}`, which is what gives it a border and
  rounds its first and last rows. `clip` stays at its default: the row kebab opens *inside* the
  card now, but `Popover` portals its menu ([§55](../design-system/decisions.md)), so nothing it
  raises is clipped by the surface it was opened from ([§12](../design-system/decisions.md)).
- **One surface at every state.** The loader and the empty message render *inside* that card,
  under the header row, rather than replacing it. This is the system's own table screen, and what the
  members list already does. A refetch over rows already on screen dims them instead
  (`Table busy`, [§34](../design-system/decisions.md)) — a table that collapsed and re-expanded on
  every keystroke would reflow the page under the reader for no information at all.
- Column alignment is the system's positional rule — first left, last right, everything between
  centred — so `Length` and `Candidates` read centred, and the kebab takes the last column's own
  80px. They were right-aligned Grotesk numerals in the earlier design; the system has one family and no mono
  treatment to align.
- Category chips sit on a second line inside the title cell.

## Layout — the vacancy

```
  ‹ Vacancies                                                        ← BackTo (§56)
  Senior React Engineer  [Open]      [ Copy booking link ]     [⋮]   ← PageTitle + Badge
  ▌React ▌Senior · Pat Owner · 60 min · times in Europe/Berlin       ← meta line, --font-size-s
  This link is no longer accepting bookings. Scheduled interviews…   ← only when closed, xs
  We're looking for an engineer who has shipped something they are
  proud of and can talk about the parts of it that went badly. You
  will be the third engineer on a team that is about to be six, …    ← clamped to 3 lines
  View more
  ┌ Scheduled  4 ┐┌ Didn't pass 7┐┌ Maybe     2 ┐┌ Passed 3 ┐┌ Offer 1 ┐
  │┌────────────┐││┌────────────┐││             ││          ││         │
  ││ Jane Doe   ││││ Ann Lee  ⚑ ││                                     
  │└────────────┘││└────────────┘│
  └──────────────┘└──────────────┘└─────────────┘└──────────┘└─────────┘
```

**Four cards became a header** ([01 §08.28](01-vacancies.md)). What is above the columns is
everything the old detail page was, in about a fifth of the height: `BackTo`, the title with its
status `Badge`, the one button worth a button, the kebab, one meta line, and the description.

- **The booking link is the button.** It was selectable text with a `Copy` beside it, on the
  argument that copying it is the reason to visit — which is still true, and is now the argument
  for the button rather than for the field. A 60-character opaque slug is not read by anybody, and
  the room it took is room the board wanted. Disabled on a closed vacancy, with the note that says
  why on the line above.
- **The meta line is a list of facts, not a set of captions.** `Card` titles bought nothing here:
  `Categories` over two chips and `Description` over a paragraph are labels for things that say
  what they are. The chips are elements and the rest is text, so the screen interleaves them
  around a `·` separator that is `aria-hidden` — a reader hears the facts, not the punctuation.
- **The description is the only thing on the page with a size rule**, because it is the only thing
  that can be arbitrarily long. Three lines, `-webkit-line-clamp`; `View more` only when the clamp
  cuts; expanded, `max-height` of a fifth of the viewport with `overflow-y: auto`.

**The screen owns the viewport height.** `AppShell`'s content box is `height: 100%` of a flex child
of a `100vh` column, so it is a **definite** height — which is what lets this screen take it and
hand what is left to the board as `flex: 1`. That single fact replaced the columns' old `100vh`
subtraction ([05 design §Responsive](05-board.design.md)). Nothing is clipped: a header taller than
the viewport overflows into the shell's own scroller instead, which is the degradation to want in
the one case that produces it.

## The three calls this phase sets

### The banner slot

`Toast` was not available when this screen was written, and
[§24](../design-system/decisions.md) is the consequence: **transient became persistent, so it
needed a place and a way out.**

| | Answer |
|---|---|
| Where | Directly under `PageHeader`, above the page body, full content width, `--space-7` beneath it |
| Why there | It is an announcement *about this page*, raised by an action taken from the header above it. In flow it pushes the content down rather than covering it, which is what a thing that does not time out has to do |
| How it goes away | Dismissed, or replaced. `InfoBanner onDismiss` ([§24](../design-system/decisions.md)) draws an `IconButton` at the trailing edge; a new notice overwrites the old one, so announcements never stack |
| Tone | `success` for a completed action, `error` for a failure. Both are `role="status"`, `aria-live="polite"` — never focus-stealing, exactly as the toast was |

Nothing auto-dismisses. A banner that removed itself after a few seconds would be a toast wearing
a different component, and the point of the reversal is that the system has no toast.

The dialog's own error banner is the same component in the same role, at the top of the form.

**Phases 4 and 6 follow this**: header, then banner, then body.

> **Amended by Phase 7 — and the reversal is half-undone, deliberately.** The system has a toast now
> ([§54](../design-system/decisions.md), built in Phase 5 because the candidate list had more than
> one thing to confirm). That does **not** move the detail page's announcements: they are about a
> page the member is standing on, raised by the header above them, and pushing content down rather
> than covering it is still the right treatment for something that does not time out.
>
> The **list** is the other case, and it is why the distinction is worth keeping. Its
> announcements are about a *row* — a link copied, a vacancy closed, one deleted — taken from a
> screen the member stays on and keeps working. A banner under the header would sit nowhere near
> the row it was about, push the whole table down as it arrived, and have to be dismissed by hand
> before the list looked like itself again. Four of them in a row would stack that four times, or
> overwrite each other three times. So the list raises `Toast`s and the detail page keeps the
> slot. One rule, said properly: **an announcement about the page goes in the page; an
> announcement about a row goes over the corner of it.**

> **Amended again by Phase 8, and the slot is gone.** The rule above was right and its premise
> stopped being true: "in flow it pushes the content down rather than covering it" was a virtue
> while the content below was four cards on a page that scrolled. The content below is the board
> now, on a screen that does **not** scroll ([01 §08.32](01-vacancies.md)) — so a banner in the
> flow does not push anything down, it takes a row of cards away to say "Vacancy closed", and
> gives it back when it is dismissed. The vacancy screen raises `Toast`s.
>
> One message stays inline, and it sharpens the rule rather than bending it: the **board's load
> failure**. Everything the slot ever held was an *event* — created, updated, closed, copied — and
> an event is over by the time it is announced. A board that would not load is a **state**, it is
> standing in for the whole region, and the retry lives inside it. A toast that timed out there
> would leave an empty half-screen with nothing saying why. So: **events announce and leave;
> states are drawn and stay.** That is the distinction the slot was approximating with "does not
> time out", said in terms of the message rather than of the component.
>
> The consequence that had to be handled in code: a slot is idempotent and a queue is not. Setting
> the same banner twice showed it once; pushing the same toast twice is two lines. `?created=1` is
> now consumed on arrival — raised once, then stripped from the address — which also stops a
> reload of a kept URL re-announcing a create from last week.

### Headings

`SectionLabel` is gone (D4; the system captions nothing, and `PageTabs` is its only uppercase). Each of
the detail page's three captions becomes a **card title**, which is the system's own header line at the
headline-6 step:

| Was | Is | Element |
|---|---|---|
| `SectionLabel` BOOKING LINK | `Card title="Booking link"` | `<h2>` |
| `SectionLabel` CATEGORIES | `Card title="Categories"` | `<h2>` |
| `SectionLabel` DESCRIPTION | `Card title="Description"` | `<h2>` |

Sentence case, not caps — the system's card titles are sentence case, and the uppercase micro-caps were
the earlier design's. `<h2>` because `PageTitle` is the page's `<h1>` and these are the sections under it;
the system renders its titles as `<div>`s, which is [§27](../design-system/decisions.md).

> **Amended by Phase 8: all three are gone, and so is the question.** Each was a caption over
> something that says what it is — a URL, two chips, a paragraph — and the fold-in dissolved the
> cards they titled into one meta line. The `<h2>` level under `PageTitle` did not go with them:
> `BoardColumn` renders each column name as one ([§43](../design-system/decisions.md)), so the outline
> beneath the `<h1>` is now the five columns, which is a truer table of contents for this screen
> than `Booking link · Categories · Description` ever was.

The dialog's micro-labels are field labels rather than captions, so they are the labels the
fields draw themselves (`TextInput`, `Select`, `TextArea`) plus one `FieldLabel` for the radio
row — the system's own label, so the row matches the fields above it exactly.

### The blocked action

[§62](../design-system/decisions.md) warned that native `title` is free only for a pointer.
**It is not used here, and it never will be.** The reason a delete is blocked is a real
`Tooltip` ([§62](../design-system/decisions.md)) on hover and focus, over a hidden copy of the same
sentence that is the row's permanent `aria-describedby` target — see the amendment below for how
this arrived at its third and final shape.

Delete stays **disabled rather than hidden** — a missing action is indistinguishable from a bug —
and the row stays **focusable** while disabled (`aria-disabled`, never the `disabled` attribute),
because a reason nobody can reach is the same failure one step later. Full reasoning in the
ledger's note on §22. Phases 5 and 6 own the other two `Tooltip` sites and are not bound to this
answer: a menu row has somewhere to put a sentence, an inline icon may not.

> **Amended by Phase 7.** The list's rows take the same menu, so there are now two blocked rows
> rather than one, and the second is the better argument for the treatment: **`Copy booking link`
> on a closed vacancy**. Hiding it would say the vacancy has no link, which is false — it has one,
> it is on the detail page, and it simply will not take a booking. `This link is no longer
> accepting bookings.` is the same sentence the detail page prints under the link itself, so the
> two doors to the same fact read identically.

### `Open booking page`, and the row that has no second line

The menu carries the candidate's own view of the vacancy, and it carries it as **one row with no
subtitle**. The prototype draws a second line under it — *Prototype only — the candidate's view* —
and that line is true of the prototype and false here: there, choosing it swaps the screen, because
a prototype has no tabs to open. In the product it is a link to `/book/{slug}`, which is the same
address `Copy booking link` puts on the clipboard, opened in a new tab. There is nothing about it
to caveat.

Which leaves `description` used by nothing in this menu, and that is the right outcome rather than
a loss: the slot exists for a row whose destination needs explaining, and none of these six do.

> **Amended, and this is the settled answer.** The reason is now drawn in a
> **`Tooltip`** bubble ([§62](../design-system/decisions.md)) opening to the left of the menu, and the
> paragraph above is half-superseded: what is corrected is only *where the sentence is drawn*.
>
> §22's actual claim — that a reason reachable only by a pointer is a reason a keyboard user never
> gets — is untouched and is now **enforced more strictly than before**: the sentence sits in a
> visually-hidden node that is in the DOM at all times, which is what the row's `aria-describedby`
> resolves to whether or not anything is hovering. A bubble alone could not do that; this is
> `BoardCard`'s flag pattern ([§42](../design-system/decisions.md)), and it is why `tooltipTestId`
> names the hidden copy rather than the bubble.
>
> What changes is the drawing. A sentence inside a 160px panel made one row twice the height of the
> four around it, and put a paragraph in a list of verbs. `description` does not go away with it —
> the two slots now mean different things, and the distinction is the durable version of this
> argument: **`description` says what a row is about** (`Open booking page` / *the candidate's
> view*), **`tooltip` says why a row cannot be used**. A row never carries both, because a row
> that is blocked has nothing else to add.
>
> **Corrected later.** None of the above was on screen. `Popover`'s panel carried
> an `overflow: hidden` that was never the system's and had never clipped anything, and a bubble hung at
> `right: 100%` of a row is *entirely* outside that panel — so both blocked rows on this screen
> drew their reason into a zero-width sliver from the day it shipped. The hidden node kept working
> throughout, which is why a screen reader was told and a member with a mouse was not, and why the
> test that asserts the reason `toBeVisible()` passed the whole time: the id it names is on the
> hidden node, and a 1×1 clipped span is visible as far as Playwright is concerned. Reachable is
> not legible. See the decisions record's note on §62.

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page header · list | `PageHeader` (app adapter over `PageTitle`) | `title` | `page-title` |
| Back to the list | `BackTo` ([§56](../design-system/decisions.md)) | `label`, `href`, `onClick`, `data-testid` | `vacancy-back-link` |
| Vacancy title | `PageTitle` | node children | `page-title` |
| Announcement · both screens | `Toast` inside `ToastHost` ([§54](../design-system/decisions.md)) | `tone`, `onDismiss` | `toast-vacancy-*`, `toast-link-copied`, `toast-link-copy-failed` |
| List toolbar | `TableToolbar` | `tabs`, `activeTab`, `onTab`, `tabsLabel`, `tabsTestId`, `search*` | — |
| Status tabs | `PageTabs` (through `TableToolbar`) | `TabItem` objects — `value`, `label`, `testId` | `vacancies-status-tabs`, `vacancies-status-{all\|open\|closed}` |
| Search | `SearchInput` (through `TableToolbar`) | `searchPlaceholder`, `searchLabel`, `searchTestId` | `vacancies-search-input` |
| List surface | `Card` | `padded={false}` | `vacancies-list` |
| List | `Table` | `columns`, `rows`, `rowHref`, `rowTestId`, `onRowClick`, `busy` | — |
| Row actions | `Popover` | `label`, `items` with `disabled` + `tooltip` ([§62](../design-system/decisions.md)) — six rows: Open board · Copy booking link · Open booking page · Edit vacancy · Close/Reopen vacancy · Delete vacancy | `vacancy-actions-menu-{id}` |
| Row confirmations | `ConfirmDialog` | `busy`, `closeOnAccept={false}`, `acceptTestId` | `vacancy-close-confirm`, `vacancy-delete-confirm` |
| Category label | **`Badge status="neutral" size="s"`** ([§59](../design-system/decisions.md)) | — | `vacancy-category-chip-{id}` |
| Status pill | `Badge` | `status="active"` open, `"inactive"` closed, **`outlined` for both** | `vacancy-status-{id}` |
| Loading | `Preloader` | default 12/7, centred in the card | `vacancies-loading` |
| Empty state | `EmptyState` | — | `vacancies-empty-state` |
| Meta line | `Badge status="neutral"` + text, `·` separators `aria-hidden` | — | `vacancy-detail-categories` |
| Description | plain `<div>`, `-webkit-line-clamp: 3` | — | `vacancy-description` |
| Expand / collapse | text button, `--color-blue`, `aria-expanded` | — | `vacancy-description-toggle` |
| Add a description | text button, opens the edit dialog | — | `vacancy-add-description` |
| Closed note | plain `<p>`, `--font-size-xs` | — | `vacancy-closed-link-note` |
| The board | see [05 design](05-board.design.md) | — | `board` |
| New / Edit | `Modal` | `title`, `style={{ width: 520 }}`. Field order **Title · Categories · Interviewer · Interview length · Description** | `vacancy-dialog` |
| Dialog footer | `FormActions` | `align="full"` | — |
| Title field | `TextInput` | `label`, **`required`**, `id`, `error`, `errorId` | `vacancy-title-input` |
| Interviewer | `Select` + **disabled options** | **`required`**, `hint`, `hintId`, option `disabled`/`hint` | `vacancy-interviewer-select` |
| Length | native radios + `FieldLabel` + `RequiredMark` | `role="radiogroup"` | `vacancy-duration-{minutes}` |
| Categories | `Select` `isMulti isSearchable allowCreate` | `variant="formik"`, `chipTestId` | `vacancy-categories-input` |
| Description | `TextArea` | `label`, `id`, `error`, `errorId` | `vacancy-description-input` |
| Actions · vacancy screen | `Popover` | the same rows less `Open board`, which is the page it is on | `vacancy-actions-menu` |
| Copy link | `Button` | `variant="primary"`, `disabled` when closed | `vacancy-copy-link-button` |
| Confirmations · vacancy screen | `ConfirmDialog` | `busy`, `closeOnAccept={false}`, `acceptTestId` | `vacancy-close-confirm`, `vacancy-delete-confirm` |
| Reassign confirm | `Modal` + `FormActions` | — | `vacancy-reassign-confirm` |

The `toast-*` ids are the ones the suite already knows these announcements by. They named a
`Toast` when there was one to name; what they identify now is the banner slot.

**`Button` variants** are the system's three: `primary` (solid blue), `delete` (solid red) and the
default outlined neutral. the earlier design's `secondary` and `ghost` both land on the default, and
`danger` on `delete`.

**Interview length has no design-system component.** The system ships no `Radio` or `RadioGroup` —
nothing else in the app makes a three-way inline choice — so the row stays three native radios in a
`role="radiogroup"`, with the system's `FieldLabel` above them and `--action-primary` as the
`accentColor`. It is the one control on these screens the system does not draw.

## Copy

| Slot | Text |
|---|---|
| Page title | Vacancies |
| Toolbar action | New vacancy |
| Search placeholder | Search vacancies… |
| Status tabs | All (n) · Open (n) · Closed (n) |
| Status tablist name | Vacancy status |
| Column headers | Title · Interviewer · Length · Candidates · Status · Actions |
| Row menu name | Actions for {title} |
| Row menu items | Copy booking link · Edit vacancy · Close vacancy \| Reopen vacancy · Delete vacancy |
| Blocked copy reason | This link is no longer accepting bookings. |
| Close confirm title | Close this vacancy? |
| Close confirm body | The booking link stops accepting new candidates. {n} scheduled interviews stand, and the board keeps working. |
| Close confirm body, none scheduled | The booking link stops accepting new candidates. The board keeps working. |
| Delete confirm title | Delete this vacancy? |
| Delete confirm body | {title} has no candidates, so nothing is lost. This cannot be undone. |
| Clipboard unavailable, list | The clipboard is unavailable. Open the vacancy to copy its link. |
| Clipboard unavailable, vacancy screen | The clipboard is unavailable. The link is {url} |
| Toast · deleted | Vacancy deleted |
| Back link | Vacancies |
| Copy button | Copy booking link |
| Meta line | {chips} · {interviewer} · {n} min · times in {zone} |
| Description toggle | View more \| View less |
| No description | Add a description |
| Dialog title, create | New vacancy |
| Dialog title, edit | Edit vacancy |
| Field label · title | Title |
| Field label · interviewer | Interviewer |
| Field label · length | Interview length |
| Field label · categories | Categories |
| Field label · description | Description |
| Placeholder · title | Senior React Engineer |
| Placeholder · categories | Type to add… |
| Placeholder · description | What the role involves, who it suits. |
| Hint · interviewer | Availability is read from their Microsoft 365 calendar. |
| Ineligible option suffix | No Microsoft 365 mailbox |
| Create row | Create "…" |
| Submit, create | Create vacancy |
| Submit, edit | Save changes |
| Closed link note, vacancy screen | This link is no longer accepting bookings. Scheduled interviews stand and the board keeps working. |
| Menu items, vacancy screen | Edit vacancy · Close vacancy \| Reopen vacancy · Delete vacancy |
| Delete blocked reason | Close this vacancy instead — it has candidates |
| Reassign confirmation body | {n} scheduled interviews keep their current time and interviewer. |
| Empty list | No vacancies yet. |
| Empty list, filtered | No vacancies match these filters. |

Which of the two empty lines is drawn is decided by the organization's **unfiltered** total, never
by a tab's count: somebody with twelve vacancies who searched for a thirteenth must not be told
they have none ([01 §07.21](01-vacancies.md)).

The closed note exists twice, at two lengths, and that is deliberate: a menu row's `description`
is the one thing that stops the action (`This link is no longer accepting bookings.`), while the
vacancy screen's is a statement about the vacancy, made directly above the board that closing did
not touch. Same fact, two jobs.

Column headers and card titles move from the earlier design's uppercase micro-caps to the system's sentence case;
the words are unchanged. The interviewer hint states *why* a mailbox is required, up front, rather
than waiting for the visitor to discover it from a disabled row.

## States

| State | Treatment |
|---|---|
| **Status · open** | `Badge status="active"` — solid `--status-success`, white text |
| **Status · closed** | `Badge status="inactive"` — solid `--status-error`, white text |
| **Category label** | `Badge status="neutral"` ([§59](../design-system/decisions.md)) — `--surface-sunken` hairlined in `--border-subtle`, `--radius-s`, regular weight; `size="s"` in a table row, `m` on the detail header. It was `Chip` until a later pass, and `Chip` is what `Select isMulti` draws for a value chosen **inside a field**: its 7px `--color-blue` left edge marks a *selection*, and on a table row it put the loudest mark on the screen on the quietest fact on it. Inside the dialog it is still a `Chip`, because there it really is a selection |
| **Select option · eligible** | `rgba(0, 122, 255, 0.1)` under the pointer *and* under the arrow keys |
| **Select option · ineligible** | `--text-secondary` ink, reason trailing at `--font-size-xs`, `aria-disabled`, no hover, not selectable — but still reachable by arrow key |
| **Select option · selected** | `--color-blue` fill, white text (single-value only; a chosen chip leaves the list) |
| **Menu row · blocked** | `--text-secondary`, `aria-disabled`, focusable, reason drawn beneath |
| **Link · copied** | `Toast tone="success"`; the button itself does not change label |
| **Link · closed vacancy** | `Button disabled` — the system's own disabled paint — with the reason drawn as a sentence above it rather than in a `title` |
| **Description · clamped** | Three lines, then an ellipsis, with `View more` beneath. Drawn only when `scrollHeight` exceeds `clientHeight`: whether the clamp cut anything is a fact about the width the header ended up with, not about the string |
| **Description · expanded** | `max-height` of a fifth of the viewport, floored at 66px and capped at 132px, `overflow-y: auto`. It never grows past its share — the board keeps the rest |
| **Row · hover** | `--color-row-hover`, the system's neutral grey. the earlier design tinted it violet |
| **Loading** | `Preloader` centred in the card, under the table header. Content pops in rather than resolving in place — the honest cost of losing `Skeleton` (D4) |
| **Refetching** | The rows stay, dimmed and `aria-busy` (`Table busy`, [§34](../design-system/decisions.md)). Only the first load draws the `Preloader`; a search that replaced the table on every keystroke would reflow the page under the reader |
| **Tab · current** | `PageTabs`' own selected treatment, `aria-selected`. The strip is drawn only once a response has arrived, so no label reads `(0)` and then jumps |
| **Menu row · blocked copy** | `--text-secondary`, `aria-disabled`, focusable, the closed-link note drawn beneath as its `aria-describedby` |

`--text-faint` is gone: the system has three text levels to the earlier design's four, so faint and muted are both
`--text-secondary`. On these screens they were never
adjacent, so nothing flattened.

## Interactions

- **Search** debounces 300 ms then refetches server-side; a status tab refetches immediately,
  because a click is already a deliberate act and waiting on it would read as lag. The clear cross
  is a real button (`--space-6` inset), so emptying the field does not need a pointer.
- **Row click** navigates to the detail page. Rows are real anchors, so middle-click and
  copy-address work; the modifier keys are left to the browser.
- **Copy** writes the absolute URL to the clipboard and raises a toast. A clipboard failure is
  answered differently on each screen, and the difference is *where else the link is*: a list row
  points at the vacancy, and the vacancy has nowhere further to point, so it says the link out
  loud. The action never silently fails on either.
- **Back** is a real anchor with a real `href` ([§56](../design-system/decisions.md)): middle-click,
  open-in-new-tab and copy-address all work, and only an unmodified click is taken by the router.
  The same rule `Table`'s `rowHref`/`onRowClick` pair follows on the list.
- **View more** toggles the clamp and nothing else — no scroll, no focus move. The control keeps
  its place under the text in both states, so the thing that expanded is the thing beneath the
  cursor.
- **Category picker** — typing filters existing categories case-insensitively; when nothing
  matches, a `Create "…"` row appears last. Chips come off by clicking their cross or by
  `Backspace` in the empty input, which is react-select's own behaviour.
- **Changing interviewer or length** on a vacancy with scheduled interviews opens the
  confirmation before the request is sent, with the count interpolated.
- **A row's menu never navigates.** The kebab is rendered inside the row's anchor, so the row is
  told which press was not for it — the trigger carries `data-row-actions` and the row handler
  looks for it with `closest`. Not `stopPropagation` inside the menu: the menu is portalled
  ([§55](../design-system/decisions.md)) and its rows are not inside the anchor at all.
- **Closing confirms, reopening does not.** Both row confirmations are the system's `ConfirmDialog` with
  `closeOnAccept={false}`, so they stay up until the server has answered rather than dismissing on
  the press and leaving the outcome to an announcement that may never arrive
  ([§41](../design-system/decisions.md)).
- **After any mutation** the list or detail refetches. No optimistic updates. On the list that
  also moves the tab counts, which is the second reason not to patch a row in place.

## Responsive

| Width | Layout |
|---|---|
| ≥ 1200px | Full shell; the vacancy's header over its board, the header fixed and the columns scrolling inside what is left |
| 1024–1199px | Shell switches to hamburger + drawer (spec 00); the vacancy's header is unchanged and the column group scrolls sideways inside its own container |
| < 1024px | The header's title and its actions wrap onto separate lines — the title group has a `260px` flex basis, so the button and the kebab drop beneath it rather than squeezing the name. The list toolbar wraps the same way: `TableToolbar` is a `flex-wrap` row, so the tabs keep the first line and the search and `New vacancy` drop below them |

The vacancy screen's `height: 100%` holds at every width, and the one case it degrades in is a
header taller than the viewport. Nothing is clipped there: the root sets no `overflow`, so it
overflows into the shell's own scroller and the board follows it down. The design's own version
wraps the screen in `overflow: hidden`; that is right for a prototype with a fixed frame and wrong
here, where a clipped header would hide the only control that leaves the page.

The booking link truncates with `text-overflow: ellipsis`; the page body never scrolls
horizontally.

**The table has one layout at every width.** the earlier design's spec described the `CANDIDATES` column
folding into the title cell at 768–1023px and rows becoming stacked cards below 768px. Neither
was ever built, and the system's `Table` is a fixed 70px flex row with no responsive form to adopt
(D1) — its columns flex, and that is the whole behaviour. The claim is removed rather than
carried forward unimplemented.

The screen's own geometry lives in `globals.css` rather than in inline styles, because a media
query cannot be one — the same reason `.page-title` and the shell's breakpoint live there.

## Accessibility

- The status pill's meaning is in its text, not its tint.
- The interviewer picker is a real `role="combobox"` over a `role="listbox"`: reachable by Tab,
  opened by `ArrowDown` or `Enter`, walked by the arrow keys and `Home`/`End`, closed by
  `Escape`, with `aria-activedescendant` naming the focused row.
- Ineligible options carry `aria-disabled="true"` and draw the reason **inside** the option, so
  it is part of the option's accessible name and is announced rather than merely seen.
- The category picker is the same control with a text input in it, so the chips, the filter and
  the create row are all one widget rather than a bespoke combobox.
- The actions menu is a real menu — `Escape` closes, arrow keys move, focus enters on open and
  returns to the trigger on close. A disabled row keeps its place in that walk. On the list every
  row draws one, so each is named for the vacancy it acts on (`Actions for Senior React
  Engineer`); without that a reader walking twelve rows is told "Actions, menu" twelve times.
- The status strip is a real tablist with an accessible name (`Vacancy status`), and the count is
  inside each tab's label rather than beside it — so it is part of what is announced, not a number
  a reader has to go and find.
- Toasts arrive in a polite live region and dismiss themselves; they never take focus, and a
  second action taken before the first has faded adds a line rather than replacing one.
- The back link is an anchor with an `href`, so it is announced as a link to somewhere and behaves
  like one ([§56](../design-system/decisions.md)).
- The meta line's `·` separators are `aria-hidden`: a reader hears `React, Senior, Pat Owner,
  60 min`, not four middle dots.
- `View more` is a real `<button aria-expanded>` whose label says which way it will go, and the
  expanded block is scrollable, so everything the clamp hid stays reachable from the keyboard.
- The board's own accessibility model is unchanged by the move — see
  [05 design](05-board.design.md). Its columns are the `<h2>`s under this screen's `<h1>`.
- Both dialogs trap focus, close on `Escape` and return focus to the opener
  ([§8](../design-system/decisions.md)).
- Announcements are `role="status"`, polite, and never steal focus.
- The loader is `aria-hidden` with a single polite "Loading vacancies" beside it.
- Every field's label is a real `<label for>`, and its error or hint is the field's
  `aria-describedby`. Only one of the two ever exists, which is what keeps that attribute
  single-valued.

## DS gaps

Every row is a numbered entry in [decisions](../design-system/decisions.md). All but two are
the accessibility floor rather than a change of design — the forwarding, the roles and the keyboard
a component owes whatever else it does. See [the system's README](../../packages/ds/README.md).

| Gap | Impact | Ledger |
|---|---|---|
| `Select` is a `<div onClick>`: no role, nothing focusable, no keys — and `isSearchable` accepted and doing nothing | The category picker could not exist and the interviewer picker was unusable without a pointer | [§21](../design-system/decisions.md) |
| `SelectOption` carries no `disabled`, `hint` or `testId` | An ineligible interviewer could not be shown-but-disabled, which is what [01 §02.6](01-vacancies.md) requires | [§21](../design-system/decisions.md) |
| `Select` has no `errorId`, `hint`, `id` or `chipTestId` | §3 and §4's shape on `TextInput`, missing on its sibling | [§21](../design-system/decisions.md) |
| No creatable option row anywhere in the system | A category the library does not hold yet had nowhere to be offered. **Designed from the system’s own vocabulary** | [§29](../design-system/decisions.md) |
| `Popover` is `<div onClick>` rows in a `<div onClick>` trigger, with no `testId`, `disabled` or description | The actions menu could not be opened, walked or left from a keyboard, and a blocked row could not say why | [§22](../design-system/decisions.md) |
| `TableToolbar` draws two controls and gives no way to address either | The status tabs could not be named or tested, and the tabs' object form could not be typed | [§52](../design-system/decisions.md) |
| `Popover`'s menu was clipped by the surface it opened from | A kebab on the last row of a card-bounded table had nowhere to open | [§55](../design-system/decisions.md) |
| The system's chip is locked inside `Select` | A read-only category chip had no component; `Badge` is a two-hue status pill, not a tag | [§20](../design-system/decisions.md) |
| `Badge`, `Preloader`, `EmptyState` forward nothing | No `data-testid`, no `role`, no `aria-live` reached the DOM | [§19](../design-system/decisions.md), [§23](../design-system/decisions.md), [§28](../design-system/decisions.md) |
| `TextArea` forwards nothing, its label is associated with nothing, and its error is a boolean | The description field could not be named, focused by the validator or described by its error | [§25](../design-system/decisions.md) |
| `SearchInput` forwards nothing and its clear cross is a `<span onClick>` | The field could not be named or sized, and clearing it needed a pointer | [§26](../design-system/decisions.md) |
| `Card`'s title is a `<div>` | Captions became card titles, so those titles are now the page's outline | [§27](../design-system/decisions.md) |
| `InfoBanner` cannot be dismissed | A banner reporting a state goes away when the state does; one standing in for a toast reports an event that nothing later makes untrue | [§24](../design-system/decisions.md) |
| `BackTo` is an `<a href="#">` with an `onClick` | The one back link on this surface could not be middle-clicked, opened in a new tab or copied, and was announced as a link to nowhere | [§56](../design-system/decisions.md) |

### Left open for Phase 6 — answered

Neither confirmation on these screens used the system's `ConfirmDialog`, and both were exactly its
shape. `ConfirmDialog` fired `onClose` in the same breath as `onAccept`, so a confirmation whose
action is a request with a busy state could not use it — which was both of these.

**Phase 6 answered it** with [§41](../design-system/decisions.md): `busy` spins the accept button and
locks the panel, and `closeOnAccept={false}` hands the closing back to the caller, so a
confirmation can stay up until the server has replied. **Phase 7 is the first consumer** — the
list's `Close this vacancy?` and `Delete this vacancy?` are both `ConfirmDialog`.

The **detail page's** two are still `Modal` + `FormActions`. Nothing stops them moving; they are
simply not this phase's, and Phase 8 rewrites that header around the board. The reassign
confirmation inside the dialog is the more interesting of the two anyway: it interrupts a submit
rather than starting one, so what it accepts into is a form's own busy state and not a request of
its own.

> **Phase 8 moved them.** `Close this vacancy?` and `Delete this vacancy?` on the vacancy screen
> are `ConfirmDialog` with `busy` + `closeOnAccept={false}`, the same pair the list raises and
> with the same words behind them — which also means the detail page's delete confirmation stopped
> saying something different from the list's about the same act. §41 now has four call sites.
>
> The **reassign** confirmation stays `Modal` + `FormActions`, for the reason given above: it is
> not a confirmation that starts a request. It interrupts a submit and hands the decision back to
> a form that owns its own busy state, and `ConfirmDialog` has no shape for that.
