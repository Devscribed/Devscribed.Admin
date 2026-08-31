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

This is the last of the internal screens, and the one that finishes two things the migration left
open — the third of [reversal 2](../design-system/README.md)'s `Tooltip` sites, and the first use
of blue's `ConfirmDialog`.

## Layout

```
  Hiring settings                                                     ← PageTitle
  ────────────────────────────────────────────────────────────────────
  ( announcement, when there is one )                                 ← InfoBanner
  ┌──────────────────────────────────────────────────────────────────┐
  │ Categories                                      [ New category ] │  ← Card action
  │ ────────────────────────────────────────────────────────────────  │
  │ React              4 vacancies              [ Rename ] [ Delete ] │
  │ Senior             2 vacancies              [ Rename ] [ Delete ] │
  │ Merging isn't available yet…                                      │
  └──────────────────────────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────────────────────────┐
  │ Criteria                                       [ New criteria ]  │
  │ ────────────────────────────────────────────────────────────────  │
  │ English         ▎scale             [ Edit ] [ Archive ] [ Delete ]│
  │ A1 › A2 › B1 › B2 › C1 › C2       18 assessments                 │
  │ ────────────────────────────────────────────────────────────────  │
  │ Legacy skill  ▎text  ⟨Archived⟩    [ Edit ] [ Restore ] [ Delete ]│
  │                                    2 assessments                 │
  └──────────────────────────────────────────────────────────────────┘
```

- Two `Card`s, gap `--space-7`, categories first because they are simpler and more frequently
  touched. Both take `clip={false}`, so the narrow layout's row menus can drop out of the card
  ([reversal 6](../design-system/README.md)).
- A criterion row is two lines: name, type and actions on the first; the scale and the usage
  count on the second in `--font-size-xs` `--text-secondary`.
- **Scale values are joined by `›`**, not commas — the separator states that order is meaningful.
  A comma-separated list reads as a set.
- Usage counts sit immediately left of the actions, so the number and the decision it governs are
  read together.
- Archived criteria sort last, at `opacity: .7`, with a `Badge status="inactive" outlined`
  reading "Archived".
- The row hover is blue's `--color-row-hover`, a neutral grey. Meridian tinted it violet; a list of
  settings is not where the product should acquire an accent it has nowhere else. This is the last
  of that token's two uses (the other went in Phase 2).

### Two pills, two components

The row carries two marks and they are deliberately different components, which is
[§20](../design-system/ledger.md) and [§32](../design-system/ledger.md) meeting on one line:

| Mark | Component | Why |
|---|---|---|
| Type — `scale`, `text`, `number`, `yes/no` | `Chip` | A **classification**, not a state. Blue's `Badge` is `ActivityBadge` and has no neutral paint; `Chip` is blue's neutral pill, and it is already what a vacancy's categories and a candidate's criteria are drawn with |
| Archived | `Badge status="inactive" outlined` | A **state**, and specifically the two-valued switched-off kind `ActivityBadge` was measured for. The outlined form rather than the solid, on a row already receded to `.7` |

The candidate card marks the same fact differently — plain `--text-secondary` text inside the chip
label ([04](04-candidate-card.design.md)) — and that is right there and wrong here. On the card
archived-ness is an aside on a criterion being read; on this screen it is the axis the whole list
sorts on and the action the row offers.

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
  not need one.
- Field labels are blue's own `FieldLabel`, in sentence case. Meridian set them in uppercase
  `--fs-11` micro-caps; this is the last use of that token, and it leaves the map the way most of
  them have — by the element becoming a component with its own type rather than by being remapped.
- The type hint explains *why* the choice matters rather than restating the four options — it is
  the only place a member learns that a scale is what makes `at least` possible.
- **`Values, worst to best`** states the direction in the label itself. Order is the one thing
  that cannot be corrected later without consequences, so it is spelled out at the moment of entry
  rather than inferred from a drag handle.
- Values are `Chip`s with a grip in the `leading` slot ([§39](../design-system/ledger.md)); the add
  field appends on `Enter`, so a six-value scale is six keystrokes and six returns.
- The `Values` block is hidden entirely for non-scale types, not disabled — a disabled block
  invites the reader to wonder what they are missing.

This dialog also opens from a candidate card, mid-interview
([04 §05](04-candidate-card.md)), which is why it is compact and why the values field takes keyboard
entry without reaching for the mouse.

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

Two, and they are the first `ConfirmDialog`s in the app:

| Dialog | Component | Accept |
|---|---|---|
| Delete a category | `ConfirmDialog` | Dismisses on the press — blue's own behaviour, and right for a yes/no whose accept *is* the whole action |
| Reorder a scale | `ConfirmDialog busy closeOnAccept={false}` | Stays up while the request runs ([§41](../design-system/ledger.md)) — accepting saves the criterion, which can come back with a duplicate name belonging to the form behind it |

The category **create/rename** dialog is not a confirmation and stays a `Modal`: it is one field
and a submit. The rule the two draw is **`ConfirmDialog` for a question, `Modal` for a form.**

Blue paints the accept button primary blue even on a destructive confirmation, and the category
delete adopts that rather than the red `Delete` Meridian drew. A confirmation says what it is in its
title and its sentence — *"Delete "Senior"? It's used by 1 vacancy. … This cannot be undone."* — and
this one is asked at the end of a row whose other button is `Rename`. There is no way to arrive at
it by accident. (Phase 3's `vacancy-reassign-confirm` is the same shape and is still a `Modal`; it
is outside this phase's files and is flagged for a follow-up, not silently left.)

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page header | `PageHeader` → `PageTitle` | `title` | `page-title` |
| Announcement | `InfoBanner` | `variant`, `onDismiss`, `role="status"` | `library-error-banner` · `toast-library-created` · `toast-library-renamed` · `toast-library-deleted` · `toast-criteria-archived` · `toast-criteria-restored` · `toast-criteria-updated` · `toast-criteria-deleted` |
| Library panel | `Card` | `title`, `action`, **`clip={false}`** | `categories-list` · `criteria-list` |
| Loading | `Preloader` | `aria-hidden`, beside an `aria-live` node | — |
| Row actions | `Button` | default (blue's outlined neutral) | `category-rename-{id}` … |
| Row actions · < 768px | `Popover` | `label`, `items` | same ids, on the rows |
| Type mark | `Chip` | `label` | `criterion-type-{id}` |
| Archived mark | `Badge` | `status="inactive"`, `outlined` | `criterion-archived-badge-{id}` |
| Category dialog | `Modal` | `title`, `style={{ width: 420 }}` | `category-dialog` |
| Criterion dialog | `Modal` | `title`, `style={{ width: 520 }}` | `criterion-dialog` |
| Dialog actions | `FormActions` | `align="full"` | `category-submit-button` · `criterion-submit-button` |
| Name | `TextInput` | `label`, `id`, `error`, `errorId` | `category-name-input` · `criterion-name-input` |
| Type | `<div role="radiogroup">` + `FieldLabel` | native radios at `--action-primary` | `criterion-type-{type}` |
| Value chip | `Chip` | `leading`, `onRemove`, `removeDisabled`, `removeDescribedBy`, `removeTestId` | `criterion-value-input-{i}` · `criterion-value-handle-{i}` · `criterion-value-remove-{i}` |
| In-use reasons | `<ul>` | `--font-size-xs` `--text-secondary` | `criterion-values-in-use` |
| Add value | `TextInput` | `placeholder`, `aria-label` | `criterion-value-add` |
| Confirmations | `ConfirmDialog` | `description`, `acceptTestId` | `category-delete-confirm` · `criterion-reorder-confirm` |
| Dialog error | `InfoBanner` | `variant="error"`, `role="alert"` | `criterion-dialog-error` |

There is no `RadioGroup` in blue and none is invented: four mutually exclusive values on one row
are native radios under a `FieldLabel`, which is the shape the vacancy dialog's interview length
already takes.

## Copy

| Slot | Text |
|---|---|
| Page title | Hiring settings |
| Card titles | Categories · Criteria |
| Card actions | New category · New criteria |
| Usage · category | {n} vacancies |
| Usage · criterion | {n} assessments |
| Row actions | Rename · Delete · Edit · Archive · Restore |
| Dialog titles | New category · Rename category · New criteria · Edit criteria |
| Field label · name | Name |
| Field label · type | Type |
| Field label · values | Values, worst to best |
| Type options | Scale · Yes/No · Number · Text |
| Type hint | Scale values can be compared — "at least B1" — so use one when order matters. |
| Add value placeholder | Add value… |
| Reorder hint | Press Space on a handle to pick a value up, arrows to move it, Space to drop, Escape to cancel. |
| Delete confirmation · category | Delete "{name}"? It's used by {n} vacancies. The vacancies themselves are untouched. This cannot be undone. |
| Delete blocked · criterion | Archive this instead — it has {n} assessments |
| Value blocked · criterion | "{label}" is used by {n} assessments |
| Reorder confirmation | Reordering changes what existing filters match. |
| Archived badge | Archived |
| Empty categories | No categories yet. Add one when you create a vacancy. |
| Empty criteria | No criteria yet. Add one during an interview. |

The empty states point at where the thing is actually created, rather than at a button on this
screen — inline creation is the primary path and the copy should say so.

Field labels move from uppercase micro-caps to sentence case with the design system. Nothing else
in this table changes: the two `Values` strings and every message are `@devscribed/validation`
constants with unit tests on them, and the reskin is not the place to reword a sentence.

## States

| State | Treatment |
|---|---|
| **Row · hover** | `--color-row-hover` |
| **Delete · blocked** | `aria-disabled`, `--text-secondary` at 60% opacity, and the reason as the button's own accessible name — no bubble. See *Reversal 2* below |
| **Delete · blocked, < 768px** | `Popover` row, `aria-disabled`, reason drawn under the label and wired as its `aria-describedby` ([§22](../design-system/ledger.md)) |
| **Archived row** | `opacity: .7`, sorted last, "Archived" badge, Archive replaced by Restore |
| **Value chip · dragging** | `--shadow-popover`, `--radius-l`, siblings shift at `--duration-fast` |
| **Value chip · held (keyboard)** | `1.5px solid --action-primary` outline, plus the same shadow |
| **Value chip · in use** | cross `aria-disabled` at 50% opacity, reason drawn under the list |
| **Duplicate name** | `TextInput error` plus, when created inline, the existing entry preselected in the calling `Select` rather than a dead end |
| **Reorder pending** | `Create`/`Save` opens the confirmation before any request goes out |
| **Saving a confirmed reorder** | the confirmation stays up with its accept button spinning (§41) |

## Reversal 2: what happens to the tooltips

Both of this screen's `<Tooltip>`s go, and they go **differently**. The
[ledger's note](../design-system/ledger.md) carries the argument; the outcome is:

| Site | Answer | Because |
|---|---|---|
| Blocked `Delete`, ≥ 768px | **Accepted regression** — the bubble goes, nothing replaces it | The reason already *is* the button's `aria-label`, which `hiring-libraries.spec.ts` asserts. And the screen draws the fact anyway: the count is on the row's second line, and the alternative the message names is the `Archive` button immediately to its left |
| Blocked `Delete`, < 768px | **Visible text** in the `Popover` row | A menu row has nowhere to put a sentence except in itself, which is Phase 3's answer to the identical shape |
| Blocked value cross | **Visually-hidden target made visible** — reason drawn under the chip list, wired as `aria-describedby` | The dialog has no second line to carry a count, so unlike the row above it there is nothing already drawing the fact |

That is all three of the answers the reversal offered, used once each. What decided every one of
them was not the component but **whether the screen already had somewhere to say it.**

## Interactions

- **Rename** is an inline `Modal` with the current value preselected, so overwriting is one keystroke.
- **Delete a category** confirms with its usage count interpolated. There is no undo, and the copy
  does not pretend otherwise.
- **Delete a criterion** is disabled once assessed; its accessible name is the reason, and the
  archive alternative is the control beside it.
- **Archive / Restore** apply immediately with a banner, no confirmation — both are reversible.
- **Reordering a scale** requires confirmation, because it is the only edit here with retroactive
  effect on saved filters. Renaming a value does not, because comparison is by position.
- **A duplicate name created inline** resolves to the existing entry and is selected in the calling
  control — the member gets what they meant rather than an error. `Select allowCreate` offers the
  create row only for a name that matches **nothing**, which is what
  [§29's note](../design-system/ledger.md) settled.
- **Type** is absent from the edit dialog entirely, not disabled, since it is immutable; the reason
  appears if a member tries to reach it through the API.
- **Announcements do not stack and do not expire.** One banner under the header, replaced by the
  next one or dismissed ([reversal 4](../design-system/README.md)). Errors and successes share the
  slot, because they are answers to the same press.

## Responsive

| Width | Layout |
|---|---|
| ≥ 768px | As drawn; row actions trailing |
| < 768px | Row actions move to a `Popover` kebab; the scale wraps to as many lines as it needs |

The breakpoint is read in JavaScript rather than CSS because what changes across it is structure —
three buttons become one menu — and `useMediaQuery` starts `false`, so the server and the first
client render agree on the wide layout.

## Accessibility

- Each library `Card` is a labelled region.
- A row's actions carry accessible names including the entry ("Rename React", "Archive English"),
  never a bare verb repeated down the page.
- The scale is exposed as an ordered list, so its order is conveyed structurally and not only by
  the `›` glyphs.
- Value reordering is keyboard operable: `Space` picks up, arrows move, `Space` drops, `Escape`
  puts it back — each step announced through an `aria-live` node. `Escape` reaches the handle
  rather than the dialog because a dialog only takes the key nothing inside it has claimed
  ([§8's note](../design-system/ledger.md)).
- Disabled actions stay focusable — `aria-disabled`, never the `disabled` attribute — so their
  reason is reachable, whether it is their name or an `aria-describedby` target.
- Both confirmations are modal dialogs with focus trapped and returned to the trigger
  ([§40](../design-system/ledger.md)).
- Usage counts are part of the row's accessible name, so the archive-versus-delete decision is
  available without sighted scanning.
- The loading state is a `Preloader` marked `aria-hidden` beside a live region that says what is
  loading — spinning dots announce nothing on their own.

## DS gaps

| Gap | Resolution |
|---|---|
| `Modal`, `Popover`, `InfoBanner`, `Preloader` | Already opened by [01](01-vacancies.design.md) — §8, §22, §23, §24. Nothing new here |
| ~~`Tooltip`~~ | Deleted at all three sites, three different ways — see [Reversal 2](#reversal-2-what-happens-to-the-tooltips) |
| ~~`Menu`~~ | `Popover`, whose `description` slot (§22) is what the narrow blocked delete needs |
| ~~`Skeleton`~~ | `Preloader`, with the announcement beside it |
| ~~`Toast`~~ | `InfoBanner` in reversal 4's slot, error and success sharing it |
| ~~`Input`~~ | `TextInput` |
| ~~`SectionLabel` micro-caps~~ | `FieldLabel`, sentence case, with blue's own type |
| ~~`Badge` composed with a handle and a cross~~ | `Chip` — the call Phase 5 made, and the slot is [§39](../design-system/ledger.md) |
| **Sortable chip list** | Still composed in the screen: the drag itself is the same pick-up, insertion and drop language [05](05-board.design.md)'s `BoardCard` uses, so the product has one drag idiom rather than two. What the design system now owns is the chip it moves, not the moving |
| **`ConfirmDialog` forwards nothing, has no dialog semantics** | [§40](../design-system/ledger.md) |
| **`ConfirmDialog` cannot wait for a result** | [§41](../design-system/ledger.md) |
| **A chip's cross cannot be blocked, and nothing can lead its label** | [§39](../design-system/ledger.md) |
