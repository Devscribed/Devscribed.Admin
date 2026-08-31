---
id: "01"
kind: design
title: Vacancies — Design
pairs-with: 01-vacancies.md
routes: ["/org/{orgId}/hiring/vacancies", "/org/{orgId}/hiring/vacancies/{vacancyId}"]
design-system: "1_DS for dev"
tags: [vacancy, table, modal, select, disabled-option, teammerly, light-only]
---

# 01 — Vacancies · Design

Visual and interaction specification for the vacancies list, the vacancy detail page, and the
create/edit dialog. Pairs with [01-vacancies.md](01-vacancies.md), which owns the rules and every
validation message.

**Design system:** Teammerly Original DS, `1_DS for dev/`. The decisions behind it are in
[`specs/design-system/README.md`](../design-system/README.md); divergences from the vendored copy
carry numbers in the [ledger](../design-system/ledger.md).

**Theme:** light only. Both screens render inside the `AppShell`
(`specs/user-management/00-app-shell.design.md`) and draw no chrome of their own.

> **Amended by Phase 4.** The category picker in the dialog now **closes its menu** when a
> category is chosen. Blue kept a multi-select's list open, which react-select — the library blue
> recreates — does only when `closeMenuOnSelect` is explicitly `false`; restoring the default is
> [§36](../design-system/ledger.md). Nothing else on these screens changed, and
> `hiring-vacancies.spec.ts` is unaffected.

These are the first screens to **lose components rather than repaint them**, so the calls made
here are the ones Phases 4–7 follow: [where a persistent banner sits](#the-banner-slot), [which
heading a caption becomes](#headings), and [what replaces a tooltip](#the-blocked-action).

## Sidebar

Hiring adds a second section to the sidebar, below `People`:

| Section | Row | Route | Visible to |
|---|---|---|---|
| HIRING | Vacancies | `/org/{orgId}/hiring/vacancies` | admin, manager |
| HIRING | Candidates | `/org/{orgId}/hiring/candidates` | admin, manager |
| HIRING | My interviews | `/org/{orgId}/hiring/my-interviews` | anyone assigned as an interviewer |

`My interviews` is gated on **assignment**, not role — the shell already resolves the session
before rendering so a gated row never flashes, and this is that mechanism with a different
predicate. A member with no hiring access sees no HIRING section at all, not an empty one.

Hiring's rows use blue's **flat** sidebar form, not its collapsible submenu — every hiring
destination is one level deep, and the flat form is the one that keeps its own glyph
(spec 00, and [§D6](../design-system/README.md): blue's icon *style*, hiring's own glyphs).

## Layout — list

```
  Vacancies                                        [ New vacancy ]   ← PageHeader
  ─────────────────────────────────────────────────────────────────
  [🔍 Search vacancies…]                    Status [ Open      ▾ ]   ← --space-5 gap
  ┌───────────────────────────────────────────────────────────────┐
  │ Title            │ Interviewer │ Length │ Candidates │ Status  │  ← Card > Table
  │ Senior React Eng.│ Pat Owner   │ 60 min │     12     │  Open   │
  │ ▌React ▌Senior   │             │        │            │         │
  └───────────────────────────────────────────────────────────────┘
```

- Search leading, status filter trailing, on one row above the card.
- The table is edge to edge inside a `Card padded={false}`, which is what gives it a border and
  rounds its first and last rows. `clip` stays at its default — nothing on this screen opens a
  popover inside the card ([reversal 6](../design-system/README.md)).
- **One surface at every state.** The loader and the empty message render *inside* that card,
  under the header row, rather than replacing it. This is blue's own table screen, and what the
  members list already does.
- Column alignment is blue's positional rule — first left, last right, everything between
  centred — so `Length` and `Candidates` read centred. They were right-aligned Grotesk numerals
  under Meridian; blue has one family and no mono treatment to align.
- Category chips sit on a second line inside the title cell.

## Layout — detail

```
  Senior React Engineer                    [ Board ]  [ Edit ]  [⋮]  ← PageHeader
  Open · 60 minutes · Pat Owner                                      ← subtitle
  ┌───────────────────────────────────────────────────────────────┐
  │ ⓘ Vacancy created                                          ✕  │  ← banner slot
  └───────────────────────────────────────────────────────────────┘
  ┌───────────────────────────────────────────────────────────────┐
  │ Booking link                                                  │  ← Card title = h2
  │ https://…/book/senior-react-engineer-Kj8mQ2nP4xTw   [ Copy ]  │
  └───────────────────────────────────────────────────────────────┘
  ┌──────────────────────────┐  ┌──────────────────────────────────┐
  │ Categories               │  │ Description                      │
  │ ▌React ▌Senior ▌Full…    │  │ We're looking for…               │
  └──────────────────────────┘  └──────────────────────────────────┘
```

The booking link is the first thing on the page because copying it is the reason to visit. It is
selectable text at `--font-size-s`, truncated with an ellipsis on narrow viewports but never
wrapped.

## The three calls this phase sets

### The banner slot

`Toast` is gone ([D4](../design-system/README.md); blue has none, because the live app has none),
and [reversal 4](../design-system/README.md) is the consequence: **transient becomes persistent,
so it needs a place and a way out.**

| | Answer |
|---|---|
| Where | Directly under `PageHeader`, above the page body, full content width, `--space-7` beneath it |
| Why there | It is an announcement *about this page*, raised by an action taken from the header above it. In flow it pushes the content down rather than covering it, which is what a thing that does not time out has to do |
| How it goes away | Dismissed, or replaced. `InfoBanner onDismiss` ([§24](../design-system/ledger.md)) draws an `IconButton` at the trailing edge; a new notice overwrites the old one, so announcements never stack |
| Tone | `success` for a completed action, `error` for a failure. Both are `role="status"`, `aria-live="polite"` — never focus-stealing, exactly as the toast was |

Nothing auto-dismisses. A banner that removed itself after a few seconds would be a toast wearing
a different component, and the point of the reversal is that blue has no toast.

The dialog's own error banner is the same component in the same role, at the top of the form.

**Phases 4, 6 and 7 follow this**: header, then banner, then body.

### Headings

`SectionLabel` is gone (D4; blue captions nothing, and `PageTabs` is its only uppercase). Each of
the detail page's three captions becomes a **card title**, which is blue's own header line at the
headline-6 step:

| Was | Is | Element |
|---|---|---|
| `SectionLabel` BOOKING LINK | `Card title="Booking link"` | `<h2>` |
| `SectionLabel` CATEGORIES | `Card title="Categories"` | `<h2>` |
| `SectionLabel` DESCRIPTION | `Card title="Description"` | `<h2>` |

Sentence case, not caps — blue's card titles are sentence case, and the uppercase micro-caps were
Meridian's. `<h2>` because `PageTitle` is the page's `<h1>` and these are the sections under it;
blue renders its titles as `<div>`s, which is [§27](../design-system/ledger.md).

The dialog's micro-labels are field labels rather than captions, so they are the labels the
fields draw themselves (`TextInput`, `Select`, `TextArea`) plus one `FieldLabel` for the radio
row — blue's own label, so the row matches the fields above it exactly.

### The blocked action

`Tooltip` is gone, and [reversal 2](../design-system/README.md) warned that native `title` is
free only for a pointer. **It is not used here.** The reason a delete is blocked is drawn in the
menu row itself, under the label, at `--font-size-xs` in `--text-secondary`, and wired as that
row's `aria-describedby` ([§22](../design-system/ledger.md)).

Delete stays **disabled rather than hidden** — a missing action is indistinguishable from a bug —
and the row stays **focusable** while disabled (`aria-disabled`, never the `disabled` attribute),
because a reason nobody can reach is the same failure one step later. Full reasoning in the
ledger's note on §22. Phases 5 and 6 own the other two `Tooltip` sites and are not bound to this
answer: a menu row has somewhere to put a sentence, an inline icon may not.

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page header | `PageHeader` (app adapter over `PageTitle`) | `title`, `subtitle`, `action` | `page-title` |
| Announcement | `InfoBanner` | `variant`, `onDismiss` | `toast-vacancy-*`, `toast-link-copied` |
| Search | `SearchInput` | `outlined`, `onClear`, `wrapperStyle` | `vacancies-search-input` |
| Status filter | `Select` | `options`, `value`, `wrapperStyle` | `vacancies-status-filter` |
| List surface | `Card` | `padded={false}` | `vacancies-list` |
| List | `Table` | `columns`, `rows`, `rowHref`, `rowTestId` | — |
| Category chip | `Chip` | `label` (no `onRemove` — read-only) | `vacancy-category-chip-{id}` |
| Status pill | `Badge` | `status="active"` open, `"inactive"` closed | `vacancy-status-{id}` |
| Loading | `Preloader` | default 12/7, centred in the card | `vacancies-loading` |
| Empty state | `EmptyState` | — | `vacancies-empty-state` |
| Detail sections | `Card` | `title` | — |
| New / Edit | `Modal` | `title`, `style={{ width: 520 }}` | `vacancy-dialog` |
| Dialog footer | `FormActions` | `align="full"` | — |
| Title field | `TextInput` | `label`, `id`, `error`, `errorId` | `vacancy-title-input` |
| Interviewer | `Select` + **disabled options** | `hint`, `hintId`, option `disabled`/`hint` | `vacancy-interviewer-select` |
| Length | native radios + `FieldLabel` | `role="radiogroup"` | `vacancy-duration-{minutes}` |
| Categories | `Select` `isMulti isSearchable allowCreate` | `variant="formik"`, `chipTestId` | `vacancy-categories-input` |
| Description | `TextArea` | `label`, `id`, `error`, `errorId` | `vacancy-description-input` |
| Row actions | `Popover` | `label`, `items` | `vacancy-actions-menu` |
| Copy link | `Button` | default variant | `vacancy-copy-link-button` |
| Confirmations | `Modal` + `FormActions` | — | `vacancy-reassign-confirm`, `vacancy-delete-confirm` |

The `toast-*` ids are the ones the suite already knows these announcements by. They named a
`Toast` when there was one to name; what they identify now is the banner slot.

**`Button` variants** are blue's three: `primary` (solid blue), `delete` (solid red) and the
default outlined neutral. Meridian's `secondary` and `ghost` both land on the default, and
`danger` on `delete`.

**Interview length has no design-system component.** Blue ships no `Radio` or `RadioGroup` — prod
has no three-way inline choice to measure — so the row stays three native radios in a
`role="radiogroup"`, with blue's `FieldLabel` above them and `--action-primary` as the
`accentColor`. It is the one control on these screens the system does not draw.

## Copy

| Slot | Text |
|---|---|
| Page title | Vacancies |
| Page action | New vacancy |
| Search placeholder | Search vacancies… |
| Status filter options | All · Open · Closed |
| Column headers | Title · Interviewer · Length · Candidates · Status |
| Detail card titles | Booking link · Categories · Description |
| Copy button | Copy |
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
| Closed link note | This link is no longer accepting bookings. |
| Menu items | Close vacancy · Reopen vacancy · Delete vacancy |
| Delete blocked reason | Close this vacancy instead — it has candidates |
| Reassign confirmation body | {n} scheduled interviews keep their current time and interviewer. |
| Empty list | No vacancies yet. |
| Empty list, filtered | No vacancies match these filters. |

Column headers and card titles move from Meridian's uppercase micro-caps to blue's sentence case;
the words are unchanged. The interviewer hint states *why* a mailbox is required, up front, rather
than waiting for the visitor to discover it from a disabled row.

## States

| State | Treatment |
|---|---|
| **Status · open** | `Badge status="active"` — solid `--status-success`, white text |
| **Status · closed** | `Badge status="inactive"` — solid `--status-error`, white text |
| **Category chip** | `Chip` — white, 1px `--border-default`, a 7px `--color-blue` left border, 8px radius. Read-only on the list and the detail; removable inside the dialog, where it is what `Select isMulti` draws for itself |
| **Select option · eligible** | `rgba(0, 122, 255, 0.1)` under the pointer *and* under the arrow keys |
| **Select option · ineligible** | `--text-secondary` ink, reason trailing at `--font-size-xs`, `aria-disabled`, no hover, not selectable — but still reachable by arrow key |
| **Select option · selected** | `--color-blue` fill, white text (single-value only; a chosen chip leaves the list) |
| **Menu row · blocked** | `--text-secondary`, `aria-disabled`, focusable, reason drawn beneath |
| **Link · copied** | `InfoBanner variant="success"`; the button itself does not change label |
| **Row · hover** | `--color-row-hover`, blue's neutral grey. Meridian tinted it violet |
| **Loading** | `Preloader` centred in the card, under the table header. Content pops in rather than resolving in place — the honest cost of losing `Skeleton` (D4) |

`--text-faint` is gone: blue has three text levels to yellow's four, so faint and muted are both
`--text-secondary` ([reversal 7](../design-system/README.md)). On these screens they were never
adjacent, so nothing flattened.

## Interactions

- **Search** debounces 300 ms then refetches server-side; the status filter refetches
  immediately. The clear cross is a real button (`--space-6` inset), so emptying the field does
  not need a pointer.
- **Row click** navigates to the detail page. Rows are real anchors, so middle-click and
  copy-address work; the modifier keys are left to the browser.
- **Copy** writes the absolute URL to the clipboard and raises the banner. On a clipboard failure
  the link text is selected instead, so the visitor can copy manually — the action never silently
  fails.
- **Category picker** — typing filters existing categories case-insensitively; when nothing
  matches, a `Create "…"` row appears last. Chips come off by clicking their cross or by
  `Backspace` in the empty input, which is react-select's own behaviour.
- **Changing interviewer or length** on a vacancy with scheduled interviews opens the
  confirmation before the request is sent, with the count interpolated.
- **After any mutation** the list or detail refetches. No optimistic updates.

## Responsive

| Width | Layout |
|---|---|
| ≥ 1200px | Full shell; detail's Categories and Description side by side |
| 1024–1199px | Shell switches to hamburger + drawer (spec 00); the two detail columns still sit side by side |
| < 1024px | Detail's Categories and Description stack; the filter row wraps |

The booking link truncates with `text-overflow: ellipsis`; the page body never scrolls
horizontally.

**The table has one layout at every width.** Meridian's spec described the `CANDIDATES` column
folding into the title cell at 768–1023px and rows becoming stacked cards below 768px. Neither
was ever built, and blue's `Table` is a fixed 70px flex row with no responsive form to adopt
(D1) — its columns flex, and that is the whole behaviour. The claim is removed rather than
carried forward unimplemented.

The two-column rule lives in `globals.css` because a media query cannot be an inline style, which
is the same reason `.page-title` and the shell's breakpoint live there.

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
  returns to the trigger on close. A disabled row keeps its place in that walk.
- Both dialogs trap focus, close on `Escape` and return focus to the opener
  ([§8](../design-system/ledger.md)).
- Announcements are `role="status"`, polite, and never steal focus.
- The loader is `aria-hidden` with a single polite "Loading vacancies" beside it.
- Every field's label is a real `<label for>`, and its error or hint is the field's
  `aria-describedby`. Only one of the two ever exists, which is what keeps that attribute
  single-valued.

## DS gaps

Every row is a numbered entry in the [ledger](../design-system/ledger.md). All but two are
omissions rather than decisions — blue is a measurement of production, and production never had
to answer these ([§D2](../design-system/README.md)).

| Gap | Impact | Ledger |
|---|---|---|
| `Select` is a `<div onClick>`: no role, nothing focusable, no keys — and `isSearchable` accepted and doing nothing | The category picker could not exist and the interviewer picker was unusable without a pointer | [§21](../design-system/ledger.md) |
| `SelectOption` carries no `disabled`, `hint` or `testId` | An ineligible interviewer could not be shown-but-disabled, which is what [01 §02.6](01-vacancies.md) requires | [§21](../design-system/ledger.md) |
| `Select` has no `errorId`, `hint`, `id` or `chipTestId` | §3 and §4's shape on `TextInput`, missing on its sibling | [§21](../design-system/ledger.md) |
| No creatable option row anywhere in blue | A category the library does not hold yet had nowhere to be offered. **Designed, not measured** | [§29](../design-system/ledger.md) |
| `Popover` is `<div onClick>` rows in a `<div onClick>` trigger, with no `testId`, `disabled` or description | The actions menu could not be opened, walked or left from a keyboard, and a blocked row could not say why | [§22](../design-system/ledger.md) |
| Blue's chip is locked inside `Select` | A read-only category chip had no component; `Badge` is a two-hue status pill, not a tag | [§20](../design-system/ledger.md) |
| `Badge`, `Preloader`, `EmptyState` forward nothing | No `data-testid`, no `role`, no `aria-live` reached the DOM | [§19](../design-system/ledger.md), [§23](../design-system/ledger.md), [§28](../design-system/ledger.md) |
| `TextArea` forwards nothing, its label is associated with nothing, and its error is a boolean | The description field could not be named, focused by the validator or described by its error | [§25](../design-system/ledger.md) |
| `SearchInput` forwards nothing and its clear cross is a `<span onClick>` | The field could not be named or sized, and clearing it needed a pointer | [§26](../design-system/ledger.md) |
| `Card`'s title is a `<div>` | Captions became card titles, so those titles are now the page's outline | [§27](../design-system/ledger.md) |
| `InfoBanner` cannot be dismissed | Prod's banners report a state; one standing in for a toast reports an event. **Designed, not measured** | [§24](../design-system/ledger.md) |

### Left open for Phase 6

Neither confirmation on these screens uses blue's `ConfirmDialog`, and both are exactly its
shape. `ConfirmDialog` fires `onClose` in the same breath as `onAccept`, so a confirmation whose
action is a request with a busy state cannot use it — which is both of these. They stay on
`Modal` + `FormActions`. Phase 6 owns `ConfirmDialog` and inherits the question, because the
archive confirmations it is meant to adopt it for are asynchronous too.
