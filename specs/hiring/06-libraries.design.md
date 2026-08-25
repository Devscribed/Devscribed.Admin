---
id: "06"
kind: design
title: Category & Criteria Libraries — Design
pairs-with: 06-libraries.md
routes: ["/org/{orgId}/hiring/settings"]
design-system: "1_DS for dev"
tags: [settings, categories, criteria, scale-editor, archive, meridian, light-only]
---

# 06 — Category & Criteria Libraries · Design

Visual and interaction specification for the hiring settings screen and the criterion dialog that
also opens inline from a candidate card. Pairs with [06-libraries.md](06-libraries.md).

**Design system:** Teammerly Meridian. **Theme:** light only. Renders inside `AppShell`.

Two design problems: making **usage counts** prominent enough that archive-versus-delete is
obvious, and building a **scale editor** whose ordering reads as meaningful rather than incidental.

## Layout

```
  Hiring settings                                                     ← PageHeader
  ────────────────────────────────────────────────────────────────────
  ┌──────────────────────────────────────────────────────────────────┐
  │ Categories                                      [ New category ] │  ← Card action
  │ ────────────────────────────────────────────────────────────────  │
  │ React              4 vacancies              [ Rename ] [ Delete ] │
  │ Senior             2 vacancies              [ Rename ] [ Delete ] │
  └──────────────────────────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────────────────────────┐
  │ Criteria                                       [ New criteria ]  │
  │ ────────────────────────────────────────────────────────────────  │
  │ English            scale                    [ Edit ] [ Archive ] │
  │ A1 › A2 › B1 › B2 › C1 › C2       18 assessments                 │
  │ ────────────────────────────────────────────────────────────────  │
  │ Legacy skill  ⟨Archived⟩  text              [ Edit ] [ Restore ] │
  │                                    2 assessments                 │
  └──────────────────────────────────────────────────────────────────┘
```

- Two `Card`s, gap `--sp-10`, categories first because they are simpler and more frequently
  touched.
- A criterion row is two lines: name, type badge, and actions on the first; the scale and the usage
  count on the second in `--fs-12` `--text-muted`.
- **Scale values are joined by `›`**, not commas — the separator states that order is meaningful.
  A comma-separated list reads as a set.
- Usage counts sit immediately left of the actions, so the number and the decision it governs are
  read together.
- Archived criteria sort last, at `opacity: .7`, with a `Badge tone="neutral"` reading "Archived".

## The criterion dialog

```
┌────────────────────────────────────────────┐
│  New criteria                              │
│                                            │
│  NAME                                      │
│  [ English                            ]    │
│                                            │
│  TYPE                                      │
│  (•) Scale  ( ) Yes/No  ( ) Number  ( ) Text│
│  Scale values can be compared — "at least  │
│  B1" — so use one when order matters.      │
│                                            │
│  VALUES, WORST TO BEST                     │
│  ⟨⠿ A1 ×⟩⟨⠿ A2 ×⟩⟨⠿ B1 ×⟩⟨⠿ B2 ×⟩          │
│  [ Add value…                         ]    │
│                                            │
│            [ Cancel ]  [ Create ]          │
└────────────────────────────────────────────┘
```

- `Modal width={520}`.
- The type hint explains *why* the choice matters rather than restating the four options — it is
  the only place a member learns that a scale is what makes `at least` possible.
- **`VALUES, WORST TO BEST`** states the direction in the label itself. Order is the one thing that
  cannot be corrected later without consequences, so it is spelled out at the moment of entry
  rather than inferred from a drag handle.
- Values are draggable chips with a `⠿` handle; the add field appends on `Enter`, so a six-value
  scale is six keystrokes and six returns.
- The `VALUES` block is hidden entirely for non-scale types, not disabled — a disabled block
  invites the reader to wonder what they are missing.

This dialog also opens from a candidate card, mid-interview
([04 §05](04-candidate-card.md)), which is why it is compact and why the values field takes keyboard
entry without reaching for the mouse.

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page header | `PageHeader` | `title` | `page-title` |
| Library panel | `Card` | `title`, `action` | `categories-list` · `criteria-list` |
| Row actions | `Button` | `variant="ghost"`, `size="sm"` | `category-rename-{id}` … |
| Type badge | `Badge` | `tone="neutral"`, `dot={false}` | `criterion-type-{id}` |
| Archived badge | `Badge` | `tone="neutral"`, `outline` | `criterion-archived-badge-{id}` |
| Dialogs | `Modal` | `title`, `actions`, `width` | `criterion-dialog` |
| Name | `Input` | `label`, `error` | `criterion-name-input` |
| Type | `RadioGroup` | `direction="row"`, `options` | `criterion-type-{type}` |
| Value chip | `Badge` + drag handle + remove `IconButton` | — | `criterion-value-input-{index}` |
| Add value | `Input` | `placeholder` | `criterion-value-add` |
| Confirmations | `Modal` | `actions` | `category-delete-confirm` · `criterion-reorder-confirm` |
| Errors | `InfoBanner` | `tone="error"` | `library-error-banner` |
| Notifications | `Toast` | `tone` | `toast-library-created` |

## Copy

| Slot | Text |
|---|---|
| Page title | Hiring settings |
| Card titles | Categories · Criteria |
| Card actions | New category · New criteria |
| Usage · category | {n} vacancies |
| Usage · criterion | {n} assessments |
| Row actions | Rename · Delete · Edit · Archive · Restore |
| Dialog titles | New category · New criteria · Edit criteria |
| Micro-label · name | NAME |
| Micro-label · type | TYPE |
| Micro-label · values | VALUES, WORST TO BEST |
| Type options | Scale · Yes/No · Number · Text |
| Type hint | Scale values can be compared — "at least B1" — so use one when order matters. |
| Add value placeholder | Add value… |
| Delete confirmation · category | Delete "{name}"? It's used by {n} vacancies. |
| Delete blocked · criterion | Archive this instead — it has {n} assessments |
| Reorder confirmation | Reordering changes what existing filters match. |
| Archived badge | Archived |
| Empty categories | No categories yet. Add one when you create a vacancy. |
| Empty criteria | No criteria yet. Add one during an interview. |

The empty states point at where the thing is actually created, rather than at a button on this
screen — inline creation is the primary path and the copy should say so.

## States

| State | Treatment |
|---|---|
| **Row · hover** | `--hover-bg-tint`; actions raise from `--text-muted` to `--text` |
| **Delete · blocked** | `Button` disabled at `--text-faint`, `Tooltip` carrying the count |
| **Archived row** | `opacity: .7`, sorted last, "Archived" badge, Archive replaced by Restore |
| **Value chip · dragging** | `--shadow-pop`, `--accent-border`, siblings shift at `--duration-base` |
| **Value chip · in use** | remove `IconButton` disabled, `Tooltip` naming the assessment count |
| **Duplicate name** | `Input error` plus, when created inline, the existing entry preselected in the calling combobox rather than a dead end |
| **Reorder pending** | `Create`/`Save` opens the confirmation before any request goes out |

## Interactions

- **Rename** is an inline `Modal` with the current value preselected, so overwriting is one keystroke.
- **Delete a category** confirms with its usage count interpolated. There is no undo, and the copy
  does not pretend otherwise.
- **Delete a criterion** is disabled once assessed; the tooltip names archive as the alternative,
  so the member is never left guessing what to do instead.
- **Archive / Restore** apply immediately with a toast, no confirmation — both are reversible.
- **Reordering a scale** requires confirmation, because it is the only edit here with retroactive
  effect on saved filters. Renaming a value does not, because comparison is by position.
- **A duplicate name created inline** resolves to the existing entry and is selected in the calling
  control — the member gets what they meant rather than an error.
- **Type** is absent from the edit dialog entirely, not disabled, since it is immutable; the reason
  appears if a member tries to reach it through the API.

## Responsive

| Width | Layout |
|---|---|
| ≥ 768px | As drawn; row actions trailing |
| < 768px | Row actions move to a `Menu` behind a "⋮"; the scale wraps to as many lines as it needs; the dialog goes full width |

## Accessibility

- Each library `Card` is a labelled region.
- A row's actions carry accessible names including the entry ("Rename React", "Archive English"),
  never a bare verb repeated down the page.
- The scale is exposed as an ordered list, so its order is conveyed structurally and not only by
  the `›` glyphs.
- Value reordering is keyboard operable: `Space` picks up, arrows move, `Space` drops, with each
  step announced.
- Disabled actions stay focusable so their tooltips are reachable, referenced by
  `aria-describedby`.
- The reorder confirmation is a modal dialog with focus trapped and returned to the trigger.
- Usage counts are part of the row's accessible name, so the archive-versus-delete decision is
  available without sighted scanning.

## DS gaps

| Gap | Resolution |
|---|---|
| `Modal`, `Tooltip`, `Toast`, `Menu` | Already opened by [01](01-vacancies.design.md); no new component here |
| **Sortable chip list** | The scale editor needs drag-reorderable chips. Reuses the drag language established by [05](05-board.design.md)'s `BoardCard` — same pick-up, insertion, and drop treatment, so the product has one drag idiom rather than two |
| **`Badge` with a drag handle and a remove control** | Composed in the app, consistent with the decision recorded in [04](04-candidate-card.design.md): a chip carrying controls is a screen concern |
