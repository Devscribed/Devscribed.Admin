---
id: "04"
kind: design
title: Candidate Card — Design
pairs-with: 04-candidate-card.md
routes: ["/org/{orgId}/hiring/candidates/{candidateId}"]
design-system: "1_DS for dev"
tags: [candidate-detail, notes, autosave, criteria, cv, teammerly, light-only]
---

# 04 — Candidate Card · Design

Visual and interaction specification for the candidate card — the page a team works on **during**
an interview. Pairs with [04-candidate-card.md](04-candidate-card.md), which owns the rules.

**Design system:** Teammerly Original DS, `1_DS for dev/`. The decisions behind it are in
[`specs/design-system/README.md`](../design-system/README.md); divergences from the vendored copy
carry numbers in the [ledger](../design-system/ledger.md).

**Theme:** light only. Renders inside the `AppShell`
(`specs/user-management/00-app-shell.design.md`) and draws no chrome of its own.

The governing constraint: someone is on a live call while using this. Nothing may steal focus,
nothing may move under the cursor, and no save may be silent. That constraint is what decides three
things below that would otherwise be free — where the announcement sits, when focus moves after a
status change, and which slot the saved indicator goes in.

Two things settled elsewhere land here for the first time: the [criterion chip](#the-criterion-chip)
stops being a `Badge`, and [reversal 2](#the-cancelled-badge) gets its second of three answers.

## Layout

```
  Jane Doe                                                         ⋮  ← PageHeader + Popover
  jane@example.com · first seen 12 Aug 2026
  ┌──────────────────────────────────────────────────────────────────┐
  │ ⓘ Moved to Didn't pass                                        ×  │  ← InfoBanner, in flow
  └──────────────────────────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────────────────────────┐
  │ Senior React Engineer · 60 minutes            [ Scheduled     ▾ ] │  ← <h2>, headline-6
  │ Tue 26 Aug 2026, 14:00 Europe/Minsk · Pat Owner                   │
  │ Applied as "Jane M. Doe"                                          │
  │ [ Reschedule ]  [ Cancel interview ]                              │
  ├───────────────────────────────────────────────────────────────────┤
  │ [ ▸ Rescheduled once · booked 12 Aug 2026, 09:14 ]                │
  │ 📄 jane-doe-cv.pdf  180 KB                  [ View ] [ Download ] │
  │                                                                   │
  │ Candidate's note                                                  │  ← <h3>
  │ I'm available from September.                                     │
  │                                                                   │
  │ Criteria                                       [ + Add criteria ] │  ← <h3>
  │ ▌English [ B2      ▾ ] ×    ▌Late hours [ Yes     ▾ ] ×           │  ← Chip + trailing
  │                                                                   │
  │ Interview notes                                    Saved 14:32    │  ← label row (§33)
  │ ┌───────────────────────────────────────────────────────────────┐ │
  │ └───────────────────────────────────────────────────────────────┘ │
  │                                                          [ Save ] │
  │ Conclusion                                                        │
  │ ┌───────────────────────────────────────────────────────────────┐ │
  │ └───────────────────────────────────────────────────────────────┘ │
  │                                                          [ Save ] │
  └───────────────────────────────────────────────────────────────────┘
  ┌ .NET Engineer · 45 minutes · 3 Jul 2026 · Didn't pass          ⌄ ┐   ← collapsed
```

- The header's **⋮** is `PageHeader`'s `action` slot holding blue's `Popover` — the same kebab the
  candidate database's rows draw, named the same way (`Actions for {name}`). It holds one item,
  `Delete candidate`, and it is a menu rather than a button because a destructive action never sits
  in a header as a bare control: the ⋮ is one deliberate press away from anything.
  It is a **person-grain** action and therefore belongs to the page, not to an application `Card` —
  the cards below are each about one interview, and deleting somebody is not something that happens
  to an interview. Drawn for `admin`/`manager` only, and **absent** for an assigned interviewer
  ([03 §11.60](03-candidate-database.md)).
- One `Card` per application, gap `--space-6`. The most recent is expanded; the rest collapse to a
  single summary row with a chevron.
- **Every application `Card` passes `clip={false}`.** The status `Select` in its header and every
  criterion's value control drop a list into the card, and a `Card` clips to its radius by default.
  This is the second of the four surfaces [reversal 6](../design-system/README.md) named, after the
  candidates filter bar Phase 4 proved it on.
- The panel composes its own header inside the card rather than using `Card`'s `title` / `action`
  pair: that pair is one title and one trailing node in a single row, and this header carries the
  interview's facts and its two schedule actions *under* the title, with a badge and a status
  control beside it.
- Read-only facts sit in the header; everything editable sits in the body, in the order the
  interview happens: history and CV first, criteria during, notes throughout, conclusion at the end.
- `Interview notes` is the tallest thing on the page — `rows={12}` — because it is what the page is
  for. Blue's `TextArea` pins itself at a flat 100px (prod's one textarea is a comment box), so the
  field passes `style={{ height: 'auto' }}` and hands sizing back to `rows`. That is a documented
  prop doing what it says, not a divergence.

## Headings

The page has a real outline now, which is what replacing `SectionLabel` with headings means
([reversal 5](../design-system/README.md)).

| Level | What | Type |
|---|---|---|
| `<h1>` | The candidate's name | `PageTitle` — 16 → 20 → 24px with the viewport |
| `<h2>` | Each application, `{vacancy} · {length}` | blue's headline-6: 16px, `--font-weight-medium`, -0.32px |
| `<h3>` | `Candidate's note`, `Criteria` | `--font-size-s` at `--font-weight-medium`, `--text-primary` |

The `<h2>` is exactly what `Card` paints its own titles with, so a panel that composes its header
by hand still looks like one that did not. Meridian drew it in `--font-display` at 600 and -.2px,
which is the same idea in a family the app no longer has.

Blue's headline scale bottoms out at headline-6, so the `<h3>` is composed from blue's body tokens
rather than a scale step: body-s at medium weight is what blue uses everywhere small text is
emphatic — nav links, `Badge`, `Table`'s header — and `--text-primary` is what keeps it reading as a
heading rather than as the secondary ink a `FieldLabel` takes.

**Sentence case, not the uppercase Meridian drew.** Blue's only uppercase treatment anywhere is
`PageTabs`; this is the call Phase 4 made for spec 03's column headers and group labels.

When a section is collapsible the toggle goes **inside** the heading — `<h2><button
aria-expanded>…</button></h2>`, the disclosure pattern — so the section stays findable by heading
and the control that opens it stays a control.

## The criterion chip

```
▌English  [ B2        ▾ ]  ×          ▌Years of React  [ 7       ]  ×
 Chip      trailing        onRemove    Chip             trailing
           Select                                       TextInput
```

**`Chip`, not `Badge`.** Blue's `Badge` is `ActivityBadge` — four status paints and no neutral — and
a criterion is not a status. That is the same split [§32](../design-system/ledger.md) made from the
other direction when it gave `Badge` two more hues for the application funnel: an application's
status *is* a status and wanted more paints; a criterion is a chosen thing and wanted a different
component, which blue already draws inside `Select isMulti` and
[§20](../design-system/ledger.md) promoted.

The value control goes in the chip's **`trailing`** slot ([§37](../design-system/ledger.md)), never
in its label. The label span is `overflow: hidden` + `text-overflow: ellipsis` + `white-space:
nowrap`, because inside a `Select` it only ever holds one line of text — a control placed there is
clipped, and one that opens a list is cut off at the chip's own edge. That is `Card`'s `clip`
problem one level down, and the answer is the same shape: put the thing that opens outside the box
that hides it.

- The remove cross is `Chip`'s own `onRemove`, not a separate `IconButton`. Its accessible name is
  `Remove {criterion}`, never a bare "Remove", and it carries `removeTestId`
  ([§37](../design-system/ledger.md)) because the component draws it.
- **The pointer cursor `Chip` paints when it can be removed is turned off here.** On this chip only
  the cross and the value control are clickable; the name between them promises nothing. That is
  [§18](../design-system/ledger.md)'s rule on `Table`'s rows, applied at chip scale.
- The value control is blue's own, at blue's own **44px**. Meridian shrank it to 26px so it would
  fit inside a `Badge`; blue's form controls are 44px, the chip grows to hold one, and the criteria
  *filter* row on the candidates screen ([03](03-candidate-database.design.md)) already reads at
  that size. The two are the same three-part shape and must not disagree about it (D1).
- An **archived** criterion keeps its ` (archived)` marker inside the label, in `--text-secondary`.
  It is the one place on this screen `--fs-11` used to live; blue has no 11px and the marker is
  part of the label's own line, so it takes the label's size rather than a smaller one.
- The read-only view — the assigned interviewer's, who may not read the library at all — is the
  same chip **without a cross**, which is also what drops the pointer cursor
  ([§20](../design-system/ledger.md)). The recorded value keeps the `trailing` slot it has in the
  editable form, so the two states read as one thing with and without its controls and
  `card-criterion-value-{id}` lands on the same node either way.

## The cancelled badge

This is the second of [reversal 2](../design-system/README.md)'s three `Tooltip` sites, and it takes
the third of the three answers the record offered — **an accepted regression** — which here costs
almost nothing. Phase 3 was explicit that this site is not bound to the answer it gave.

The bubble is gone and nothing replaces it. What the bubble drew was already the badge's
accessible **name**: `cancelledTooltip` is the whole fact — who, when and, for a member who gave
one, why — and `cancelledBadgeLabel`'s truncated `Cancelled by Pat` is only what is painted. That
`aria-label` stays exactly as it was.

**Native `title` is not added**, and this is the case reversal 2 did not anticipate. On an element
that already has a name, `title` becomes the accessible *description* — so a screen reader would
read the same sentence twice, once as the name and once after it. It is also unreachable from a
keyboard in every major browser. It would cost a reader something and give nobody anything.

A pointer user is not left guessing either, because **this screen draws the fact in full a few rows
below**, in the scheduling history, with the actor, the timestamp and the reason as a real row. The
vacancies menu ([§22](../design-system/ledger.md)) had nowhere to put a sentence and therefore had
to draw one; a card with a history log does not.

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page header | `PageHeader` → `PageTitle` | `title`, `subtitle`, **`action`** | `page-title` |
| Page actions | **`Popover`** | `label`, `items` *(one, `danger`)* | `candidate-actions` · `candidate-action-delete` |
| Delete confirmation | **`ConfirmDialog`** | `busy`, **`closeOnAccept={false}`** ([§41](../design-system/ledger.md)) | `candidate-delete-dialog` · `candidate-delete-confirm` |
| Announcement | `InfoBanner` | `variant="success"`, `onDismiss`, `role="status"` | `card-status-toast` · `toast-interview-rescheduled` · `toast-interview-cancelled` |
| Application panel | `Card` | **`clip={false}`** | `application-section-{applicationId}` |
| Panel heading | native `<h2>` (+ `<button aria-expanded>` when collapsible) | — | `application-toggle-{applicationId}` |
| Status | `Select` | `options`, `value` *(the option, not the id)* | `application-status-select-{applicationId}` |
| Cancelled mark | `Badge` | `status="inactive"`, `aria-label` | `application-cancelled-{applicationId}` |
| Reschedule / Cancel | `Button` / `Button` | default · **`variant="delete"`** | `application-reschedule-{id}` · `application-cancel-{id}` |
| History toggle | `Button` | `aria-expanded`, `aria-controls` | `application-history-toggle-{id}` |
| History log | `Card` | `--surface-sunken` | `application-history-{id}` |
| CV row | `Button` ×2 | **`as="a"`**, `href`, `download` | `card-cv-view` · `card-cv-download` |
| Section caption | native `<h3>` | — | — |
| Criterion chip | **`Chip`** | `trailing`, `onRemove`, `removeTestId` | `card-criterion-{criterionId}` |
| Criterion value · scale/boolean | `Select` | `options` | `card-criterion-value-{criterionId}` |
| Criterion value · number/text | `TextInput` | `type`, `wrapperStyle` | `card-criterion-value-{criterionId}` |
| Add criteria | **`Select`** | `isSearchable`, `allowCreate` | `card-criteria-autocomplete` |
| Notes / conclusion | `TextArea` | `label`, `rows`, **`trailing`** | `card-notes-input` · `card-conclusion-input` |
| Save | `Button` | — | `card-notes-save` · `card-conclusion-save` |
| Saved indicator | native `<span>` in `TextArea trailing` | — | `card-notes-saved-at` |
| Save failure | `InfoBanner` | `variant="error"`, `role="alert"` | `card-save-error` |
| Loading | `Preloader` | — | `card-loading` |
| Load failure | `InfoBanner` | `variant="error"` + retry | `card-load-error` |
| Not found | `Card` | — | `candidate-not-found` |

Every `Button` on this screen is blue's **default** — the neutral outlined one — except Cancel
interview, which is `delete`. Meridian's `ghost`, `secondary` and `size="sm"` are gone: blue's
`Button` has three paints and one height, and the quietest of the three is the neutral outline.

`Cancel interview` takes `delete` here where the same pair on My interviews
([03](03-candidate-database.design.md)) takes the neutral outline for both. The reason 07 gave for
that was a destructive **fill repeated down a table** turning a calm list into an alarm. This is one
interview under its own heading, and calling it off is the only action on this page that cannot be
undone.

`card-loading-skeleton` is now `card-loading`. Test ids that name an *announcement* survive the
component that draws it — `toast-interview-cancelled` is kept for exactly that reason — but this one
named a component that no longer exists.

## Copy

| Slot | Text |
|---|---|
| Page subtitle | {email} · first seen {date} |
| Submitted-as | Applied as "{submittedName}" |
| Section captions | Candidate's note · Criteria |
| Field labels | Interview notes · Conclusion |
| Add criteria | + Add criteria |
| Criteria autocomplete | Type to find or create… |
| Criteria empty | No criteria recorded yet. |
| Notes placeholder | Notes from the interview… |
| Conclusion placeholder | The outcome, and why. |
| Saved, recent | Saved just now |
| Saved, older | Saved {HH:mm} |
| Saving | Saving… |
| Save failed | Couldn't save. **Retry** |
| Status changed | Moved to {status} |
| Collapsed summary | {vacancy} · {length} · {date} · {status} |
| Not found | We couldn't find that candidate. |
| Actions menu name | Actions for {name} |
| Actions menu | Delete candidate |
| Delete confirmation | as [03 design](03-candidate-database.design.md) — one wording, two doors |

"Saved just now" holds for the first minute, then becomes a clock time. A relative time that keeps
ticking would be motion in the corner of the eye during a call.

## States

| State | Treatment |
|---|---|
| **Notes · idle** | white, 1.5px `--border-default`, `--radius-l` |
| **Notes · focus** | `--color-blue` border, `--shadow-focus-input` |
| **Notes · saving** | indicator reads "Saving…" in the label row's `--text-secondary`; the field stays fully editable |
| **Notes · saved** | indicator reads the time, no colour change, no animation |
| **Notes · failed** | `InfoBanner variant="error"` **below** the field with an inline retry; the field keeps its text and its focus |
| **Criterion chip** | `Chip` — white, 1px `--border-default`, a 7px `--color-blue` left edge, `--radius-l`; the value control in `trailing`, the cross trailing that |
| **Criterion · saving** | the value control is `aria-busy`; no spinner, no layout shift |
| **Status · changed** | `InfoBanner variant="success"` under `PageHeader`; the `Select` does not animate |
| **Collapsed application** | header row only, the same white `Card`; chevron rotating `--duration-hover` |
| **History · open** | a `--surface-sunken` `Card` inset into the panel |

The rule underneath all of this: **the layout never shifts while someone is typing.** The saved
indicator sits in `TextArea`'s label row ([§33](../design-system/ledger.md)), whose height does not
depend on the value and whose label has its `margin-bottom` zeroed inside the row — so the
indicator appears, changes and empties without the field beneath it moving a pixel.

The scheduling history is the last of the token map's four `--bg-panel-2` surfaces. It takes
`--surface-sunken`, the answer Phase 4 gave the candidates filter bar rather than the one Phase 2
gave the shell: a log inset into the panel it belongs to is a recessed surface, not a second white
card floating inside a white card.

## Interactions

- **Autosave** fires ~2 s after typing stops. While a save is in flight further keystrokes are
  buffered into one following save; saves never overlap.
- **Explicit Save** flushes immediately and cancels any pending autosave.
- **A failed save** stops the autosave loop until the member retries or edits again — a failing
  endpoint must not be retried every two seconds for the length of an interview.
- **Leaving the page with unsaved text** prompts before navigating away, including on a board-driven
  navigation.
- **Add criteria** opens `Select isSearchable` with focus in its input. Choosing an existing
  criterion adds the chip and moves focus straight to its value control, so the whole interaction is
  type-select-set with no mouse. Choosing one already assessed edits the existing value rather than
  adding a second chip, and says so.
- **Creating a criterion inline** opens the `Modal` from [06](06-libraries.design.md). Nothing is
  written until it is confirmed, so cancelling leaves no half-made criterion in a shared library.
- **A criterion value** saves on change with no separate confirmation. A `Select` writes when it is
  chosen; the two typed fields commit on blur and on Enter, because saving per keystroke would write
  `7`, `70`, `700` on the way to `700`.
- **A status change raises the banner and does not navigate** — the member stays on the card.
- **Focus moves to the conclusion one frame later.** A status change that records an outcome focuses
  the conclusion field (prompted, never required). The announcement is now *in flow* rather than
  floating over the page, so focusing first would scroll the field into view and then push it down
  by the banner's own height. It waits for the banner to be laid out.
- **`?application=`** expands that section and scrolls it into view with `scroll-margin-top` clear
  of the fixed top bar, `block: 'nearest'` so a section already on screen is left where it is.

## Responsive

| Width | Layout |
|---|---|
| ≥ 1024px | As drawn; criteria chips wrap in a flex row |
| 768–1023px | The header's status control moves below the title |
| < 768px | Criteria chips stack full width; textareas keep their row counts; the CV actions become full-width buttons |
| < 600px | Reschedule and Cancel stack full width, Cancel lower |

Those four are media queries and therefore live in `globals.css` rather than inline, which is the
same reason `AppShell`'s breakpoint and `PageTitle`'s three type steps do. Every value in them is a
blue token.

## Accessibility

- Both textareas have real `<label for>` elements ([§25](../design-system/ledger.md)); the caption
  above a field *is* its label, not a heading.
- The page has one `<h1>`, an `<h2>` per application and `<h3>` captions inside each — no level is
  skipped, and a collapsible panel's toggle sits inside its heading.
- The saved indicator is **not** a live region. A separate visually-hidden `aria-live="polite"` node
  announces only failures and explicit saves; announcing every autosave would speak over an
  interview every two seconds, and the visible indicator carries the routine case.
- The page's announcement is `role="status"`; a save failure under one field is `role="alert"`,
  because it belongs to the field the member is looking at rather than to the page.
- Criterion chips are a list; each cross names its criterion ("Remove English"), never a bare
  "Remove".
- The value control's accessible name is the criterion, so a screen-reader user hears
  "English, B2" rather than an unlabelled select.
- The cancelled badge's accessible name is the whole cancellation, never the truncated form.
- The CV's two controls are real anchors ([§38](../design-system/ledger.md)), so middle-click,
  copy-address, open-in-new-tab and the browser's own download handling all work.
- Focus is never moved by an autosave, by the banner, or by a background refetch — and the one focus
  move there is waits for the layout to settle first.

## DS gaps

Every row here is a numbered entry in the [ledger](../design-system/ledger.md); this table is the
index.

| Gap | Entry |
|---|---|
| `Chip` has one slot, and it ellipsises to a single line | [§37](../design-system/ledger.md) — `trailing`, `removeTestId` |
| `Button` cannot be an anchor, so a download loses the browser's own handling | [§38](../design-system/ledger.md) |
| `TextArea` has no `trailing` slot in the label row | [§33](../design-system/ledger.md) — landed in Phase 4 |
| `TextArea` has no real `<label for>` | [§25](../design-system/ledger.md) — landed in Phase 3 |
| `Card` clips a popover opened inside it | [§12](../design-system/ledger.md)'s `clip`, second of four surfaces |
| `Badge` forwards no `aria-label` or `data-testid` | [§19](../design-system/ledger.md) |
| `Select` is not a combobox, and `isSearchable` did nothing | [§21](../design-system/ledger.md) / [§29](../design-system/ledger.md) |
| `TextInput` cannot size its own box | [§35](../design-system/ledger.md) |
| `Preloader` and `InfoBanner` forward nothing | [§23](../design-system/ledger.md) / [§6](../design-system/ledger.md) / [§24](../design-system/ledger.md) |
| ~~`Badge` cannot host an interactive child~~ | Not composed in the app after all — `Chip` is the component, [§37](../design-system/ledger.md) is the slot |
| ~~`Tooltip`~~ | Deleted, not replaced — see [The cancelled badge](#the-cancelled-badge) |
| ~~`Skeleton`~~ | `Preloader`, with the announcement beside it |
| ~~`SectionLabel`~~ | Headings — see [Headings](#headings) |
| ~~`Toast`~~ | `InfoBanner` in reversal 4's slot |
| ~~`Combobox`~~ | `Select isSearchable allowCreate` |
