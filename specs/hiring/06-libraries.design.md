---
id: "06"
kind: design
title: Category & Criteria Libraries — Design
pairs-with: 06-libraries.md
routes: ["/org/{orgId}/hiring/settings"]
design-system: "1_DS for dev"
tags: [settings, categories, criteria, scale-editor, archive, teammerly, light-only]
---

# 06 — Category & Criteria Libraries · Design

Visual and interaction specification for the hiring settings screen and the criterion dialog that
also opens inline from a candidate card. Pairs with [06-libraries.md](06-libraries.md).

**Design system:** Teammerly Original DS, `1_DS for dev/`. The decisions behind it are in
[`specs/design-system/README.md`](../design-system/README.md); divergences from the vendored copy
carry numbers in the [ledger](../design-system/ledger.md).
**Theme:** light only. Renders inside `AppShell`.

Two design problems: making **usage counts** prominent enough that archive-versus-delete is
obvious, and building a **scale editor** whose ordering reads as meaningful rather than incidental.

The desktop pass settled the screen's third question — what shape the page itself takes — by
refusing to treat it as a question. The design source tried a bespoke answer first, row buttons of
a ghost variant no other screen has, and withdrew it in its own registry (*"the screen moved to
the product's standard list layout, and the row actions moved into the kebab, as in every other
table"*). So the body is the same row every list in the module already opens with: the toolbar
carrying a tab strip, a search and the primary action, over a table whose rows act through a menu.
The two libraries are the two tabs — they were never two halves of one page so much as two pages
sharing mechanics.

## Layout

```
  Libraries                                                           ← PageTitle
  ────────────────────────────────────────────────────────────────────
  CATEGORIES (3) · CRITERIA (4)       [ Search…      ] [ New category ]   ← TableToolbar
  ┌──────────────────────────────────────────────────────────────────┐
  │ Name        Vacancies                                    Actions │   ← Table in a Card
  │ Asp.Net     No vacancies                                     ⋮   │
  │ React       One, Two  (+2)                                   ⋮   │
  │ Senior      Senior React Engineer                            ⋮   │
  └──────────────────────────────────────────────────────────────────┘
  Merging isn't available yet…                                            ← muted footnote

  ┌──────────────────────────────────────────────────────────────────┐
  │ Name                        Type     Assessments         Actions │
  │ English                     Scale    18 assessments          ⋮   │
  │   A1 › A2 › B1 › B2 › C1 › C2                                    │
  │ Legacy skill  ⟨Archived⟩    Text     2 assessments           ⋮   │
  └──────────────────────────────────────────────────────────────────┘
```

- **The tab labels carry each library's whole size, and ignore the search.** The vacancy strip's
  counts follow the search because its search is shared across the strip; here the search resets
  on a switch — a term typed over categories means nothing over criteria — so each label states
  exactly what pressing its tab shows. Same rule as [01 §07.19](01-vacancies.design.md), read for
  a strip whose dimension is *which library*, not *which slice*.
- **A criterion row is two lines**: name (and its Archived badge) over the scale, with type and
  the assessment count as their own columns. The scale sits under the name the way a vacancy's
  category chips sit under its title — a second line inside the leading cell.
- **Scale values are joined by `›`**, not commas — the separator states that order is meaningful.
  A comma-separated list reads as a set. The list is a real `<ol>`, so the order is conveyed
  structurally and not only by the glyphs.
- **The Vacancies cell prints whole titles** — up to two, then a `+N` bubble in `MembersCell`'s
  exact geometry (32px circle, 8% black wash). Vacancy titles are long, and a chipped or
  truncated title ("Full Stack Develop…") names nothing. The count that makes the delete decision
  answerable is not painted at all, so it is the cell's accessible name, every folded title
  spelled out.
- **The type column is plain text**, in the radio group's own words (`Scale`, `Yes/No`), like
  Role or Status in blue's other tables. The previous revision drew it as a `Chip` on a card row;
  in a column of its own a chip would read as a label *on* the criterion rather than as this
  column's value — and the row and the dialog now call a type by one name.
- Archived criteria sort last, recede to `opacity: .7`, and carry `Badge status="inactive"
  outlined` reading "Archived" — a **state**, the two-valued switched-off kind `ActivityBadge`
  was measured for, which is why the badge survives the revision that took the type's chip. The
  dimming sits on each cell's content and never on the Actions cell: the badge naming the state
  may fade with its row, the menu holding the way back may not.
- Loading is the module's centred `Preloader` beside a visually-hidden live region; a refetch
  after an action dims the rows in place instead (`Table busy`, §34).

## The criterion dialog

```
┌────────────────────────────────────────────┐
│  New criteria                          ×   │
│                                            │
│  Name                                      │
│  [ English                            ]    │
│                                            │
│  Type                                      │
│  (•) Scale  ( ) Yes/No  ( ) Number  ( ) Text│
│  Scale values can be compared — "at least  │
│  B1" — so use one when order matters.      │
│                                            │
│  Values, worst to best                     │
│  ▎⠿ A1 ×▎⠿ A2 ×▎⠿ B1 ×▎⠿ B2 ×             │
│  "A1" is used by 2 assessments             │
│  [ Add value…                         ]    │
│  Press Space on a handle to pick a value…  │
│                                            │
│            [ Cancel ]  [ Create ]          │
└────────────────────────────────────────────┘
```

- `Modal style={{ width: 520 }}`, the width the vacancy dialog already uses. Actions are a
  `FormActions align="full"` row inside the body — blue's `Modal` has no `actions` slot, and does
  not need one. *`blue-fixes` fixed what `full` draws* ([§63](../design-system/ledger.md)): it
  widened the row to 100% and stopped the slots stretching but never said where they go, so a flex
  row packed `Cancel` and the primary against the **left** edge of a 520px dialog. They end right,
  as blue's own `full` call site always implied.
- Field labels are blue's own `FieldLabel`, in sentence case.
- The type hint explains *why* the choice matters rather than restating the four options — it is
  the only place a member learns that a scale is what makes `at least` possible.
- **`Values, worst to best`** states the direction in the label itself. Order is the one thing
  that cannot be corrected later without consequences, so it is spelled out at the moment of entry
  rather than inferred from a drag handle.
- Values are `Chip`s with a grip in the `leading` slot ([§39](../design-system/ledger.md)); the add
  field appends on `Enter`, so a six-value scale is six keystrokes and six returns.
- Reordering is operable by pointer and by keyboard, and both drive the same list: `Space` picks
  up, arrows move, `Space` drops, `Escape` puts it back — each step announced through an
  `aria-live` node.
- The `Values` block is hidden entirely for non-scale types, not disabled — a disabled block
  invites the reader to wonder what they are missing.

This dialog also opens from a candidate card, mid-interview
([04 §05](04-candidate-card.md)), which is why it is compact and why the values field takes keyboard
entry without reaching for the mouse. One dialog, two doors.

### Why the chip is a `Chip`

Meridian composed this token out of a `Badge`, a handle and an `IconButton`, and this spec used to
say a chip carrying controls is a screen concern. **Phase 5 settled that the other way** — *"not
composed in the app after all; `Chip` is the component"* ([04](04-candidate-card.design.md)) — and
this screen follows it. What the composition bought was the handle's position, and that is a slot
now: `leading`, the mirror of §37's `trailing`. It leads rather than trails because a control that
picks a value **up** must not sit beside one that **deletes** it, and blue's chip already has a
grip edge to lead from in its 7px blue left border.

The grip is drawn as an SVG rather than typed as `⠿`, which is a font character in a system whose
icons are geometric, filled and `currentColor`.

### Confirmations

Three, and all of them hold the shape every row confirmation in the module settled on in Phase 7 —
`ConfirmDialog busy closeOnAccept={false}` ([§41](../design-system/ledger.md)), so the last point
at which somebody can change their mind is not also the point the outcome stops being visible:

| Dialog | Asks |
|---|---|
| Delete a category | The usage count, interpolated — it is the whole reason to confirm — and that the vacancies themselves are untouched. There is no undo, and the copy does not pretend otherwise |
| Delete a criterion | Reached only for a criterion nobody has assessed (the menu item is disabled otherwise), so the sentence says why this delete, unlike a category's, has no count to weigh |
| Reorder a scale | That existing filters will match differently — the one edit here with retroactive effect, raised **before** the request goes out so cancelling saves nothing |

The category **create/rename** dialog is not a confirmation and stays a `Modal`: it is one field
and a submit. The rule the two draw is **`ConfirmDialog` for a question, `Modal` for a form.**

Blue paints the accept button primary blue even on a destructive confirmation, and both deletes
adopt that rather than a red `Delete`. A confirmation says what it is in its title and its
sentence, and each one is reached through a menu — there is no way to arrive at it by accident.

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page header | `PageHeader` → `PageTitle` | `title` | `page-title` |
| Toolbar | `TableToolbar` | `tabs` (§45 objects), `activeTab`, `onTab`, `search`, per-tab `searchPlaceholder`/`searchTestId` | `libraries-tabs` · `libraries-tab-categories` · `libraries-tab-criteria` · `categories-search-input` · `criteria-search-input` |
| Primary action | `Button` | `variant="primary"`, one per tab | `category-new-button` · `criterion-new-button` |
| List surface | `Card` | `padded={false}` | `categories-list` · `criteria-list` |
| Table | `Table` | `columns` (objects, §18), `busy` (§34), `rowTestId` | `category-row-{id}` · `criterion-row-{id}` |
| Row actions | `Popover` | kebab trigger, `items` with `danger`/`disabled`/`description` (§22), portalled menu (§55) | `category-actions-{id}` · `criterion-actions-{id}` and the item ids |
| Vacancies cell | app composition | two titles + `MembersCell`'s `+N` bubble; count as `aria-label` | `category-usage-{id}` |
| Archived mark | `Badge` | `status="inactive"`, `outlined` | `criterion-archived-badge-{id}` |
| Loading | `Preloader` | `aria-hidden`, beside an `aria-live` node | `libraries-loading` |
| Empty / no results | `EmptyState` | per tab, per cause | `categories-empty` · `criteria-empty` · `categories-no-results` · `criteria-no-results` |
| Load failure | `InfoBanner` | `variant="error"`, retry `Button` inside | `library-error-banner` · `libraries-retry` |
| Announcements | `Toast` in `ToastHost` (§54) | `tone`, stacking queue | `toast-library-created` · `toast-criteria-archived` · `toast-criteria-restored` · `toast-library-error` |
| Category dialog | `Modal` | `title`, `style={{ width: 420 }}` | `category-dialog` |
| Criterion dialog | `Modal` | `title`, `style={{ width: 520 }}` | `criterion-dialog` |
| Dialog actions | `FormActions` | `align="full"` | `category-submit-button` · `criterion-submit-button` |
| Name | `TextInput` | `label`, `id`, `error`, `errorId` | `category-name-input` · `criterion-name-input` |
| Type | `<div role="radiogroup">` + `FieldLabel` | native radios at `--action-primary` | `criterion-type-{type}` |
| Value chip | `Chip` | `leading`, `onRemove`, `removeDisabled`, `removeDescribedBy`, `removeTestId` | `criterion-value-input-{i}` · `criterion-value-handle-{i}` · `criterion-value-remove-{i}` |
| In-use reasons | `<ul>` | `--font-size-xs` `--text-secondary` | `criterion-values-in-use` |
| Add value | `TextInput` | `placeholder`, `aria-label` | `criterion-value-add` |
| Confirmations | `ConfirmDialog` | `busy`, `closeOnAccept={false}`, `acceptTestId` | `category-delete-confirm` · `criterion-delete-confirm` · `criterion-reorder-confirm` |
| Dialog error | `InfoBanner` | `variant="error"`, `role="alert"` | `criterion-dialog-error` |

There is no `RadioGroup` in blue and none is invented: four mutually exclusive values on one row
are native radios under a `FieldLabel`, which is the shape the vacancy dialog's interview length
already takes.

## Copy

| Slot | Text |
|---|---|
| Page title | Libraries |
| Tabs | Categories ({n}) · Criteria ({n}) |
| Search placeholders | Search categories… · Search criteria… |
| Primary actions | New category · New criteria |
| Vacancies cell · empty | No vacancies |
| Usage · criterion | {n} assessments |
| Row menu items | Rename · Delete · Edit · Archive · Restore |
| Dialog titles | New category · Rename category · New criteria · Edit criteria |
| Field label · name | Name |
| Field label · type | Type |
| Field label · values | Values, worst to best |
| Type options / type column | Scale · Yes/No · Number · Text |
| Type hint | Scale values can be compared — "at least B1" — so use one when order matters. |
| Add value placeholder | Add value… |
| Reorder hint | Press Space on a handle to pick a value up, arrows to move it, Space to drop, Escape to cancel. |
| Delete confirmation · category | Delete "{name}"? It's used by {n} vacancies. The vacancies themselves are untouched. This cannot be undone. |
| Delete confirmation · criterion | Delete "{name}"? No assessments are recorded against it, so nothing else is affected. |
| Delete blocked · criterion | Archive this instead — it has {n} assessments |
| Value blocked · criterion | "{label}" is used by {n} assessments |
| Reorder confirmation | Reordering changes what existing filters match. |
| Archived badge | Archived |
| Empty categories | No categories yet. Add one when you create a vacancy. |
| Empty criteria | No criteria yet. Add one during an interview. |
| No results | No categories match this search. · No criteria match this search. |
| Load failure | We couldn't load the libraries. Try again. |
| Merge footnote | Merging isn't available yet, and a rename onto an existing name is refused — to remove a near-duplicate, reassign its vacancies and delete it. |

The empty states point at where the thing is actually created, rather than at a button on this
screen — inline creation is the primary path and the copy should say so. The no-results states
exist because a search that matched nothing must not be allowed to claim the library is empty
beside a button that would prove it wrong.

**Toasts stop at created, archived and restored.** Those are the changes this screen cannot show —
a new entry lands somewhere in an alphabetical order, possibly off-screen, and an archived
criterion is still on the page looking almost exactly as it did — while a rename, an edit and a
delete announce themselves by the row changing in front of the reader. This replaces the previous
revision's banner slot (reversal 4): these announcements are about a *row*, on a screen the member
stays on and keeps working, which is Phase 7's case for `Toast` and the same rule the vacancies
list follows.

## States

| State | Treatment |
|---|---|
| **Loading** | Centred `Preloader`, announcement beside it |
| **Refetch after an action** | Rows dim in place — `Table busy`, `aria-busy` (§34) |
| **Load failure** | `InfoBanner variant="error"` with a retry `Button` inside, in the table's place |
| **Delete · blocked** | Menu row `aria-disabled`, still focusable; the reason in a `Tooltip` bubble on hover and focus ([§62](../design-system/ledger.md)) over a hidden copy that is the row's permanent `aria-describedby` target. *The bubble was clipped away by an `overflow: hidden` on `Popover`'s panel until `blue-fixes` removed it — see the ledger's note on §62.* |
| **Archived row** | content at `opacity: .7`, sorted last, "Archived" badge, Archive replaced by Restore; the Actions cell never fades |
| **Value chip · dragging** | `--shadow-popover`, siblings shift |
| **Value chip · held (keyboard)** | `1.5px solid --action-primary` outline, plus the same shadow |
| **Value chip · in use** | cross `aria-disabled`, reason drawn under the list |
| **Duplicate name** | `TextInput error` plus, when created inline, the existing entry preselected in the calling control rather than a dead end |
| **Reorder pending** | `Create`/`Save` opens the confirmation before any request goes out |
| **Any confirmation accepted** | the dialog stays up with its accept button spinning (§41) |

## Reversal 2, closed

The previous revision answered the design's three `<Tooltip>` sites three different ways — visible
text in a menu row, a visually-hidden target made visible under the chip list, and an accepted
regression on the wide layout's blocked `Delete` button. What decided every one of them was not
the component but **whether the screen already had somewhere to say it.**

The desktop pass closes the question by removing the site that had nowhere. The wide layout's row
buttons are gone; the blocked `Delete` is a menu row at every width, and a menu row has somewhere
to put a sentence — §22's `description`, visible, in the accessibility tree, reachable from a
keyboard. The accepted regression is simply no longer accepted, because nothing regresses. The
scale editor's answer stands unchanged: the reason is drawn under the chip list and wired as the
cross's `aria-describedby`, because a dialog of wrapping chips has no second line to carry a
count.

The design source names `Tooltip` as its gap #4 and draws one at both of this screen's blocked
controls. It ends the effort unconsumed: every site it was drawn for had, or was given, a place
on the screen to say the same thing better.

## Interactions

- **Rename** is an inline `Modal` with the current value focused, so overwriting is immediate. It
  stays focused while typing: `blue-fixes` found the dialog's focus effect re-running on every
  keystroke and moving the caret to the close button ([§61](../design-system/ledger.md)).
- **Delete a category** confirms with its usage count interpolated. There is no undo, and the copy
  does not pretend otherwise.
- **Delete a criterion** is disabled in the menu once assessed, with the reason in the row; on an
  unassessed one it confirms, and the sentence says why there is no count to weigh.
- **Archive / Restore** apply immediately with a toast, no confirmation — both are reversible.
- **Reordering a scale** requires confirmation, because it is the only edit here with retroactive
  effect on saved filters. Renaming a value does not, because comparison is by position.
- **A duplicate name created inline** resolves to the existing entry and is selected in the calling
  control — the member gets what they meant rather than an error.
- **Type** is absent from the edit dialog entirely, not disabled, since it is immutable; the reason
  appears if a member tries to reach it through the API.
- **Switching tabs clears the search.** The term belonged to the library it was typed over;
  carrying it across would open the other tab pre-narrowed by a search nobody made there.

## Responsive

One layout. The desktop pass targets ≥ 1200px, and the shape it chose needs no branch below it:
the previous revision's breakpoint existed to collapse three row buttons into a menu, and the menu
is now the layout at every width. `useMediaQuery` left the screen with the buttons.

## Accessibility

- The tab strip is a real, named tablist (§52); each label carries its count as text, so the
  split is read where it is written.
- The row's kebab carries the entry's name — "Actions for React", "Actions for English" — never a
  bare "Actions" repeated down the column. Inside an open menu the items are bare verbs, scoped
  by the menu that names the row.
- A category's usage count is the Vacancies cell's accessible name, every folded title spelled
  out, so the delete decision is available without sighted scanning of a `+N`.
- The scale is exposed as an ordered list, on the row and in the dialog, so its order is conveyed
  structurally and not only by the `›` glyphs.
- Value reordering is keyboard operable: `Space` picks up, arrows move, `Space` drops, `Escape`
  puts it back — each step announced through an `aria-live` node. `Escape` reaches the handle
  rather than the dialog because a dialog only takes the key nothing inside it has claimed
  ([§8's note](../design-system/ledger.md)).
- Disabled menu items stay focusable — `aria-disabled`, never the `disabled` attribute — with the
  reason drawn in the row and wired as `aria-describedby` (§22).
- All three confirmations are modal dialogs with focus trapped and returned to the trigger
  ([§40](../design-system/ledger.md)).
- The loading state is a `Preloader` marked `aria-hidden` beside a live region that says what is
  loading — spinning dots announce nothing on their own.

## DS gaps

None opened, and this screen is the stronger version of that result: the whole body is drawn from
entries other phases already paid for — §52's toolbar and §45's tab objects, §18's column objects,
§22's menu rows and §55's portal, §34's `busy`, §54's `Toast`, §39's chip slots, §40/§41's
confirmations. The design source's own registry reached the same conclusion from its side: its
block-06 summary lists no new component, and its entry for the ghost row button is marked
**withdrawn**.

| Gap the design source names | Resolution here |
|---|---|
| ~~`Tooltip`~~ (#4) | Unconsumed — see [Reversal 2, closed](#reversal-2-closed) |
| ~~`Menu` with disabled items~~ (#3) | `Popover`, whose §22 rows carry `disabled` + `description` |
| ~~`Skeleton`~~ (#5) | `Preloader` with the announcement beside it, as on every list |
| ~~`Toast`~~ (#6) | §54, built in Phase 5 |
| ~~ghost row `Button`~~ (#33) | Withdrawn by the design itself; the kebab is the layout |
| **Sortable chip list** (#34) | Still composed in the screen: the drag is the board's own pick-up, insertion and drop language, so the product has one drag idiom rather than two. What the design system owns is the chip it moves (§39), not the moving |
