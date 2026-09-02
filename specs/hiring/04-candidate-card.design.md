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
  ‹ Candidates                                                         ← BackTo (§56)
  Jane Doe                                                         ⋮  ← PageHeader + Popover
  jane@example.com ⧉ · first seen 12 Aug 2026                          ← IconButton + CopyIcon
  ┌──────────────────────────────────────────────────────────────────┐
  │ ⓘ Moved to Didn't pass                                        ×  │  ← InfoBanner, in flow
  └──────────────────────────────────────────────────────────────────┘
  ┌───────────────────────────────────────────────────────────────────┐
  │ Senior React Engineer  (Open)          Status [ Scheduled  ▾ ]  ⋮ │  ← <h2> + VacancyStatusBadge
  │ [React] [Senior] [Full Stack]                                     │  ← Badge neutral s
  │ 🗓 Thu, Aug 27 2026                                                │
  │ 🕐 13:00 · 60 min · Europe/Minsk (GMT+3)   [View vacancy] [Open in │
  │ 👤 Pat Owner                                            calendar] │
  ├───────────────────────────────────────────────────────────────────┤  ← edge to edge
  │ Criteria                          │ From the candidate            │
  │ ┌───────────────────────────────┐ │ ┌───────────────────────────┐ │
  │ │ Type a criterion…             │ │ │ PDF  jane-doe-cv.pdf      │ │
  │ └───────────────────────────────┘ │ │      180 KB               │ │
  │ ▌English [ B2      ▾ ] ×          │ └───────────────────────────┘ │
  │                                   │ [        Download         ]   │
  │ Interview notes      Saved 14:32  │                               │
  │ ┌───────────────────────────────┐ │ Candidate's note              │
  │ │                               │ │ I'm available from September. │
  │ └───────────────────────────────┘ │                               │
  │                        [  Save  ] │ Applied as "Jane M. Doe"      │
  │ Conclusion                        │                               │
  │ ┌───────────────────────────────┐ │                               │
  │ └───────────────────────────────┘ │                               │
  │                        [  Save  ] │                               │
  │ [ ▸ Rescheduled once · booked 12 Aug 2026, 09:14 ]                │  ← spans both
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
- The **back link** is above the title, and it names the list rather than saying `Back` — `Board`
  from a vacancy's board, `Candidates` from the database, `Candidates` again for an arrival that
  had no list at all ([04 §01.8](04-candidate-card.md)). It is a real anchor over a real address
  ([§56](../design-system/ledger.md)), and the address is the list's own, filters and all
  ([03 §09.53](03-candidate-database.design.md)). It is drawn on **every** state this route has —
  loading, loaded, failed and not-found — so nothing shifts when the record arrives, and a card
  that `404`s because somebody else deleted the person is not a dead end.
- The **copy control** sits between the address and the `·`, inside the subtitle's own line. It is
  an `IconButton` at 28px rather than blue's 34 — the row is `--font-size-s`, and a control taller
  than the line it sits in would set the subtitle's height instead of the text doing it. The glyph
  is [`CopyIcon`](../design-system/ledger.md) at 16px.
- One `Card` per application, gap `--space-6`. The most recent is expanded; the rest collapse to a
  single summary row with a chevron.
- **Every application panel is `Card variant="panel"`** ([§66](../design-system/ledger.md)) —
  `--radius-xl` over `--shadow-card-soft`, no border, which is the treatment prod gives its large
  white sections and the one the two public screens take. *Revised by `blue-fixes`.*
- **Every application panel passes `clip={false}`.** The status `Select` in its header and every
  criterion's value control drop a list into the card, and a `Card` clips to its radius by default.
  This is the second of the four surfaces [reversal 6](../design-system/README.md) named, after the
  candidates filter bar Phase 4 proved it on.
- The panel composes its own header inside the card rather than using `Card`'s `title` / `action`
  pair: that pair is one title and one trailing node in a single row, and this header carries the
  interview's facts and its two schedule actions *under* the title, with a badge and a status
  control beside it.
- Read-only facts sit in the header; everything else sits in the body.

- **The body is two columns, and the split is the whole idea of the screen: what the team writes
  on the left, what the candidate gave us on the right.** *Revised by `blue-fixes`.* It was one
  column in the order the interview happens — history and CV first, criteria during, notes
  throughout, conclusion at the end — which is a defensible reading of a page nobody scrolls. This
  is a page somebody scrolls **while talking to a person**, and in one column the CV is above the
  field being typed into, which is to say off screen exactly when it is wanted. Beside it, it stays
  in view for the length of the call.

  | Column | Holds | Width |
  |---|---|---|
  | Left | `Criteria`, `Interview notes`, `Conclusion` | `minmax(0, 1.7fr)` |
  | Right | `From the candidate` (the CV row and `Download`), `Candidate's note`, `Applied as "…"` | `minmax(240px, 1fr)` |

  Not halves: the left holds three text editors and the right holds a file row. The rule between
  them belongs to the **right** column (`border-left`), so it is as tall as the taller of the two
  rather than as tall as its own content.

- **The scheduling log spans both columns, at the bottom.** It is the one thing on the card the
  split has no side for — it is neither the team's writing nor the candidate's material, it is what
  has happened to the booking — and it is the widest content here: each entry is four facts on a
  line with its timestamp pushed to the right edge, which in a 300px column wraps three times.

- **`Applied as "…"` is at the foot of the right column**, not under the vacancy's title. It is a
  fact about what the candidate sent, and it now sits with the rest of what they sent; beside the
  interview's own facts it read as one of them.

- **The panel pads its two regions rather than itself** — `Card padded={false}`, `16px 20px` on the
  header and `20px` on the body. That is what lets the rule between them run the full width of the
  card. A divider inset 16px at each end reads as a box drawn around the header; one that reaches
  the edges reads as the card being in two parts, which is what it is.

- **The vacancy's own status and its category labels sit under its name** — `VacancyStatusBadge`
  (outlined) and `Badge status="neutral" size="s"` ([§59](../design-system/ledger.md)). Both are
  read live rather than frozen at booking ([04 §API](04-candidate-card.md)): what the vacancy *is
  now* is what a member needs before they act on the interview.

- **The header states three facts as a list, one glyph per line** — when it is, how long it runs,
  who is taking it (`CalendarIcon` · `TimeOutlineIcon` · `PersonOutlineIcon`,
  [§67](../design-system/ledger.md), all three outline so the row reads as one family). They were
  one dot-separated run at `--font-size-s` in `--text-tertiary`, and this is the page a team works
  on **during** an interview: a run of three facts is hardest to read off a screen at exactly the
  moment one of them is being asked out loud.

  | Line | Reads |
  |---|---|
  | Calendar | `Thu 27 Aug 2026` — the date alone |
  | Clock | `13:00` in `--text-primary`, then `· 60 min · Europe/Minsk (GMT+3)` in `--text-secondary` |
  | Person | the interviewer's full name |

  The clock line carries three things because they are **one** fact — when it starts, for how long,
  on whose clock — and the two that qualify the first recede a level. The zone carries its offset:
  a bare IANA id answers *which* zone and not *what time that is*, which is the whole reason a zone
  is printed beside a time at all. It is computed for the interview's own instant, never for now,
  because an interview booked in July and read in December is an hour out otherwise. The length
  leaves the heading with them — stated once, in the list — and returns to the heading only when
  the section is collapsed, where a summary is the whole point.

- **The interview's own actions are in a kebab, beside the status control.** `Reschedule interview`
  and `Cancel interview` were two buttons under the facts they change, which put a destructive
  control in the reading order of the header and kept `Cancel interview` permanently on screen
  beside a control somebody is using. A kebab is one deliberate press away from either — the same
  shape every list row in the module uses — and it is drawn only while there is something in it,
  because a menu whose every row is gone is a trigger that opens nothing. Both rows are absent once
  the interview is behind or called off ([07 §14.65](07-manage-booking.md)).

- **The header ends in the two places this interview goes**: `View vacancy` and `Open in calendar`,
  bottom-right, pushed to the header's baseline so a two-line title does not drag them up with it.
  `Open in calendar` is the primary, because during an interview it is what is most often reached
  for — and pressing it says `Not implemented yet` rather than describing a navigation this product
  cannot make ([03 §10.55](03-candidate-database.md)).

- **The status control is labelled beside itself**, not above. `Select`'s own `label` is the form
  geometry — indented, 10px above and 4px below — which is right in a column of fields and wrong in
  a header row, where it would push the control off the line the kebab sits on.

- **The criteria picker is always there**, directly under its heading at 260px, rather than behind
  a `+ Add criteria` button that swapped itself for it. Recording a criterion is what the section
  exists for on the one screen where it is being done live; one press away made the common case two
  actions and left the section reading as a list with an editor bolted on.
- `Interview notes` is the tallest thing on the page — `rows={12}` — because it is what the page is
  for. Blue's `TextArea` pins itself at a flat 100px (prod's one textarea is a comment box), so the
  field passes `style={{ height: 'auto' }}` and hands sizing back to `rows`. That is a documented
  prop doing what it says, not a divergence.

### The CV

*Revised by `blue-fixes`.* It was a line of text led by a 📄 with `View` and `Download` beside
it. It is the ordinary attachment row now — extension tile, name, weight — which is the shape a
file has in every mail client and tracker, so it is recognised before it is read, and the geometry
is the design system's own (card surface, `--border-default`, `--radius-l`, a `--surface-sunken`
tile).

It sits under a **`From the candidate`** caption at the top of the body's right column, which is
where the rest of what the candidate sent already is, and `Download` takes the full width of that
column — it is the only action in the aside, under a row that already spans it, so a shrink-to-fit
button would leave a ragged edge for no reason.

Two things follow from that. **The emoji goes**: blue draws icons and never emoji, and it was
decoration beside a name that already said what it was — the same call [05](05-board.design.md)
made on the board card's `CV` mark. And **`View` stops being a button**: a file row that opens the
file is the whole affordance, so the row *is* the link and `Download` is left beneath it as the one
action a click cannot express. Hover is the app's row tint, not a blue edge — a 1.5px blue border
is the focus state of a field, and borrowing it here would say *this input is focused*.

## Headings

The page has a real outline now, which is what replacing `SectionLabel` with headings means
([reversal 5](../design-system/README.md)).

| Level | What | Type |
|---|---|---|
| `<h1>` | The candidate's name | `PageTitle` — 16 → 20 → 24px with the viewport |
| `<h2>` | Each application: the vacancy's title, and the vacancy's own status beside it | blue's headline-6: 16px, `--font-weight-medium`, -0.32px |
| `<h3>` | `Criteria`, `From the candidate`, `Candidate's note` | `fieldLabelStyle` ([§74](../design-system/ledger.md)) — 12px regular, `--text-secondary`, indented 10px |

The `<h2>` is exactly what `Card` paints its own titles with, so a panel that composes its header
by hand still looks like one that did not. Meridian drew it in `--font-display` at 600 and -.2px,
which is the same idea in a family the app no longer has.

**The `<h3>` takes the ink of a field label, and that is deliberate.** *Revised by `blue-fixes`.*
It was body-s at medium weight in `--text-primary` — blue's own treatment for small emphatic text,
and the right answer to the question *what is one step below headline-6*. It is the wrong answer to
the question this card actually asks. Two of the four captions in the body are not captions at all:
`Interview notes` and `Conclusion` are `TextArea`'s own labels, drawn by the design system in
`fieldLabelStyle`. Painting the other two a size up and a shade darker made a column of four labels
read as two kinds of thing, and there is nothing a member can do differently about a `Criteria` that
is darker than an `Interview notes`. They are one kind of thing — the name of the block under it —
so they are painted once, and the 10px indent comes with it, so every caption on the screen starts
where every field label starts.

The *element* does not follow the paint. `FieldLabel` is a `<label>` and belongs to a control;
`From the candidate` names a file row and `Candidate's note` names a paragraph, so these stay real
`<h3>`s and only borrow the geometry.

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

**A sunken row, not `Chip` and not `Badge`.** *(Revised by `blue-fixes`.)* Blue's `Badge` is
`ActivityBadge` — four status paints and no neutral — and
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

## The two announcement surfaces

[Reversal 4](../design-system/README.md) put this page's announcement *in flow*, under
`PageHeader`, at a time when `Toast` did not exist and `InfoBanner` in a fixed container was the
only thing standing in for one. `Toast` exists now ([§54](../design-system/ledger.md)), and the
question it reopens is not *which component* but *which announcements*.

The answer is **grain**, and it draws the line exactly where the controls are.

| Grain | Surface | What raises it |
|---|---|---|
| An **application** | `InfoBanner`, in flow under `PageHeader` | a status moved, an interview rescheduled or cancelled |
| The **page's own header** | `Toast` | the email was copied, or a delete was refused |

The banner stays where reversal 4 put it, and for reversal 4's reason: it reports a change to a
record that is *on this page*, it sits above the sections it is about, and pushing them down is
how the member knows the panel below is the one that changed. The status change's focus move still
waits for it to be laid out.

A toast reports something that changed **nothing in the body**. `Email copied` has no referent
below it, and a delete that was refused leaves the page exactly as it was. Pushing every
application section down by a banner's height to say either of those would move the interview notes
under a hand typing into them — which is the one thing this screen exists not to do.

Neither surface ever draws the same event twice: no action on this page raises both.

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Back link | **`BackTo`** | `label`, **`href`** + `onClick` ([§56](../design-system/ledger.md)) | `candidate-back-link` |
| Page header | `PageHeader` → `PageTitle` | `title`, `subtitle`, **`action`** | `page-title` |
| Vacancy status | **`VacancyStatusBadge`** — `Badge outlined` | — | `application-vacancy-status-{applicationId}` |
| Category labels | **`Badge status="neutral" size="s"`** ([§59](../design-system/ledger.md)) | — | `application-category-chip-{applicationId}-{categoryId}` |
| Interview facts | `CalendarIcon` · `TimeOutlineIcon` · `PersonOutlineIcon` ([§67](../design-system/ledger.md)) | `aria-hidden` | `application-when-{id}` · `application-interviewer-{id}` |
| Copy email | `IconButton` + **`CopyIcon`** | `label`, `size={28}` ([§10](../design-system/ledger.md), [§57](../design-system/ledger.md)) | `candidate-email-copy` |
| Page actions | **`Popover`** | `label`, `items` *(one, `danger`)* | `candidate-actions` · `candidate-action-delete` |
| Delete confirmation | **`ConfirmDialog`** | `busy`, **`closeOnAccept={false}`** ([§41](../design-system/ledger.md)) | `candidate-delete-dialog` · `candidate-delete-confirm` |
| Applied as | native `<p>` | `--font-size-xs`, `--text-secondary` | `application-submitted-as-{applicationId}` |
| Announcement · application | `InfoBanner` | `variant="success"`, `onDismiss`, `role="status"` | `card-status-toast` · `toast-interview-rescheduled` · `toast-interview-cancelled` |
| Announcement · header | **`ToastHost` > `Toast`** | `tone`, `onDismiss` ([§54](../design-system/ledger.md)) | `toast-email-copied` · `toast-email-copy-failed` · `card-delete-failed` |
| Application panel | `Card variant="panel"` ([§66](../design-system/ledger.md)) | **`clip={false}`**, **`padded={false}`** | `application-section-{applicationId}` |
| Panel heading | native `<h2>` (+ `<button aria-expanded>` when collapsible) | — | `application-toggle-{applicationId}` |
| Status | `Select` | `options`, `value` *(the option, not the id)* | `application-status-select-{applicationId}` |
| Cancelled mark | `Badge` | `status="inactive"`, `aria-label` | `application-cancelled-{applicationId}` |
| Interview actions | `Popover` | `label`, `items` with `danger` — `Reschedule interview` · `Cancel interview` | `application-actions-{id}` · `application-reschedule-{id}` · `application-cancel-{id}` |
| Header actions | `Button` / `Button` | default · **`variant="primary"`** | `application-open-vacancy-{id}` · `application-calendar-{id}` |
| History toggle | `Button` | `aria-expanded`, `aria-controls` | `application-history-toggle-{id}` |
| History log | `Card` | `--surface-sunken`; the row spans both body columns | `application-history-{id}` |
| CV row | an `<a>` attachment row — 1px `--border-default`, `--radius-l`, a 36px `--surface-sunken` extension tile, the name at `--font-size-s` medium over its weight at `--font-size-xs`; hover is `--color-row-hover` | `href` | `card-cv-view` · `card-cv-name` |
| Download | `Button` | **`as="a"`**, `href`, `download`; full width of the aside | `card-cv-download` |
| Section caption | native `<h3>` painted with **`fieldLabelStyle`** ([§74](../design-system/ledger.md)) | — | — |
| Criterion row (editable) | sunken row — `--surface-sunken`, 1px `--border-subtle`, `--radius-s` — with `Select`/`TextInput` and a 24px `IconButton` | — | `card-criterion-{criterionId}` · `card-criterion-value-{criterionId}` · `card-criterion-remove-{criterionId}` |
| Criterion label (read-only) | **`Badge status="neutral"`** ([§59](../design-system/ledger.md)) | — | `card-criterion-{criterionId}` |
| Criterion value · scale/boolean | `Select` | `options` | `card-criterion-value-{criterionId}` |
| Criterion value · number/text | `TextInput` | `type`, `wrapperStyle` | `card-criterion-value-{criterionId}` |
| Add criteria | **`Select`** | `isSearchable`, `allowCreate` | `card-criteria-autocomplete` |
| Notes / conclusion | `TextArea` | `label`, `rows`, **`trailing`** | `card-notes-input` · `card-conclusion-input` |
| Save | `Button` | **`variant="primary"`**, `disabled` while there is nothing to save, `minWidth: 96` | `card-notes-save` · `card-conclusion-save` |
| Saved indicator | native `<span>` in `TextArea trailing` | — | `card-notes-saved-at` |
| Save failure | `InfoBanner` | `variant="error"`, `role="alert"` | `card-save-error` |
| Loading | `Preloader` | — | `card-loading` |
| Load failure | `InfoBanner` | `variant="error"` + retry | `card-load-error` |
| Not found | `Card` | — | `candidate-not-found` |

Every `Button` on this screen is blue's **default** — the neutral outlined one — except Cancel
interview, which is `delete`, and the two **`Save`**s, which are `primary`. *Revised by
`blue-fixes`.* `Save` was neutral, which put the one button on the working half of the card in the
same paint as `View vacancy` up in the header and left a member who does not trust an autosave with
nothing on screen that looks like the thing that saves. It is also **disabled while there is nothing
to save**, which states a rule the editor already had: `useAutosave` refuses a write for text the
server already holds, so an always-lit `Save` was promising work that would not happen. A failed
save leaves the editor dirty, so `Retry` is not the only way back. Meridian's `ghost`, `secondary` and `size="sm"` are gone: blue's
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
| Back link | Board · Candidates |
| Page subtitle | {email} · first seen {date} |
| Copy control's name | Copy email |
| Email copied | Email copied |
| Clipboard refused | The clipboard is unavailable. Select the address to copy it. |
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
| **Criterion row** | The sunken box ([§59](../design-system/ledger.md) settled the read-only half; this is the editable one): `--surface-sunken`, 1px `--border-subtle`, `--radius-s`, `6px 6px 6px 10px`. It was `Chip` until `blue-fixes` — and `Chip` is the token react-select draws for a value chosen *inside a field*, whose 7px `--color-blue` edge marks a selection. This is a small form recording a fact, and the blue edge put the loudest mark on the card on the quietest thing on it. Read-only, with no form left, it is the neutral `Badge` the database row already draws the same assessment with |
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
- **Copying the email** writes the address, raises a toast, and changes nothing else. Focus stays
  on the control it was pressed from, nothing scrolls, and no section moves — this page is worked
  on during a call. A refused clipboard raises the same toast in `error` rather than staying quiet.
- **The back link** is read once, on arrival, and does not change under the member while they are
  looking at it. Modified clicks are left to the browser; an unmodified one is handed to the client
  router, which is [§56](../design-system/ledger.md)'s whole point and the same pair `Table`'s
  `rowHref`/`onRowClick` already established.

## Responsive

| Width | Layout |
|---|---|
| ≥ 1024px | As drawn; criteria chips wrap in a flex row |
| 768–1023px | The header's status control moves below the title, **and the body's two columns become one** — the rule between them becomes a rule above the second, the same division turned through 90° rather than dropped |
| < 768px | Criteria chips stack full width; textareas keep their row counts |
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
- The back link is a real anchor with a real destination, so middle-click, copy-address and
  open-in-new-tab all work and a reader is told "link, Candidates" about a link that goes there.
- The copy control is glyph-only, so its accessible name is the whole of what it says it does —
  `Copy email`, not the address, which the reader has just been read.
- The two announcement surfaces do not compete: the banner is `role="status"` in flow, and the
  toasts are the polite region [§54](../design-system/ledger.md) owns. Only one of them speaks per
  action, because no action raises both.

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
| The icon set has no copy mark | [§57](../design-system/ledger.md) — `CopyIcon` |
| A screen cannot reach the field-label geometry to paint a caption with it | [§74](../design-system/ledger.md) — `fieldLabelStyle` exported |
| `Popover`'s panel clipped [§62](../design-system/ledger.md)'s bubble away entirely | Not a divergence — an `overflow: hidden` that was never blue's; see the ledger's note on §62 |
| `BackTo` is a link with no destination | [§56](../design-system/ledger.md) — landed in desktop 8 |
| No `Toast`, for the header's own outcomes | [§54](../design-system/ledger.md) — landed in desktop 5; the application-grain announcement stays in reversal 4's slot |
| ~~`Badge` cannot host an interactive child~~ | Not composed in the app after all — `Chip` is the component, [§37](../design-system/ledger.md) is the slot |
| ~~`Tooltip`~~ | Deleted, not replaced — see [The cancelled badge](#the-cancelled-badge) |
| ~~`Skeleton`~~ | `Preloader`, with the announcement beside it |
| ~~`SectionLabel`~~ | Headings — see [Headings](#headings) |
| ~~`Combobox`~~ | `Select isSearchable allowCreate` |
| ~~An outline `PersonIcon`~~ | **Reopened and closed by `blue-fixes` as [§67](../design-system/ledger.md).** This read: *nothing draws one — the header's facts are a dot-separated line, not a column of icon-and-value rows.* They are that column now, and the glyph the row needed was exactly the one this said nothing needed |
