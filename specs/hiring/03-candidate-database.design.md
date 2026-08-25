---
id: "03"
kind: design
title: Candidate Database — Design
pairs-with: 03-candidate-database.md
routes: ["/org/{orgId}/hiring/candidates", "/org/{orgId}/hiring/my-interviews"]
design-system: "1_DS for dev"
tags: [candidates, filters, filter-builder, pagination, my-interviews, meridian, light-only]
---

# 03 — Candidate Database · Design

Visual and interaction specification for the candidate database and My interviews. Pairs with
[03-candidate-database.md](03-candidate-database.md), which owns the rules.

**Design system:** Teammerly Meridian. **Theme:** light only. Both render inside `AppShell`.

The design problem here is the filter bar: three kinds of filter, one of which is a repeatable
three-part row, on a screen that must still read as a list rather than a query builder.

## Layout — candidates

```
  Candidates                                                          ← PageHeader
  Times in Europe/Minsk
  ────────────────────────────────────────────────────────────────────
  [🔍 Search name or email…]
  ┌──────────────────────────────────────────────────────────────────┐
  │ POSITION  ⟨Senior React Eng. ×⟩ [+]                              │  ← filter Card
  │ CATEGORY  ⟨Senior ×⟩ [+]                                         │
  │ CRITERIA  [ English ▾][ at least ▾][ B1 ▾] ×                     │
  │           [ + Add criteria filter ]                              │
  └──────────────────────────────────────────────────────────────────┘
  12 of 128 candidates                                 [ Clear all ]
  ┌──────────────────────────────────────────────────────────────────┐
  │ NAME          │ EMAIL            │ LATEST APPLICATION │ STATUS   │
  │ Jane Doe      │ jane@example.com │ Senior React Eng.  │ Scheduled│
  │ ⟨React⟩⟨Senior⟩│                 │ 26 Aug 2026, 14:00 │          │
  └──────────────────────────────────────────────────────────────────┘
                            ‹ 1  2  3 ›
```

- The filter Card is `--bg-panel-2` rather than `--bg-panel`, so it reads as a control surface
  distinct from the data below it.
- Each filter kind is one row with a `SectionLabel` in a fixed 96px leading column, so the three
  labels align and the controls start at the same x.
- The count line sits between the filters and the table — the hinge between "what I asked for" and
  "what I got" — with `Clear all` trailing, present only when two or more filters are active.

## The criteria filter row

```
[ English        ▾ ][ at least ▾ ][ B1      ▾ ]  ×
   Combobox           Select         Select | Input
```

- Three controls at `--sp-2` gap, then a remove `IconButton size={34}`.
- The **operator** control's options are derived from the chosen criterion's type; changing the
  criterion resets both the operator and the value rather than carrying a meaningless leftover
  across types.
- The **value** control's component is chosen by type: `Select` for `scale` (the criterion's
  ordered values) and `boolean`, `Input type="number"` for `number`, `Input` for `text`.
- Rows stack; `+ Add criteria filter` sits below the last one, `Button variant="ghost" size="sm"`.
- An **archived** criterion appears in the criterion combobox below the active ones, with an
  "Archived" `Badge tone="neutral"` trailing — filterable, not offerable for new assessment.

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page header | `PageHeader` | `title`, `subtitle` | `page-title` |
| Search | `SearchField` | `placeholder` | `candidates-search-input` |
| Filter surface | `Card` | `padded` | — |
| Filter labels | `SectionLabel` | — | — |
| Position / category | **`Combobox`** | `multiple` | `candidates-filter-position` · `candidates-filter-category` |
| Filter chip | `Badge` + remove `IconButton` | `tone="neutral"` | `candidates-filter-chip-{id}` |
| Criterion | **`Combobox`** | — | `criteria-filter-criterion-{index}` |
| Operator | `Select` | `options` | `criteria-filter-op-{index}` |
| Value | `Select` \| `Input` | by type | `criteria-filter-value-{index}` |
| Add / remove filter row | `Button` / `IconButton` | `variant="ghost"` | `candidates-criteria-filter-add` · `criteria-filter-remove-{index}` |
| Count | native `<p>` | — | `candidates-count` |
| Clear all | `Button` | `variant="ghost"`, `size="sm"` | `candidates-clear-filters` |
| List | `Table` | `columns`, `rows` | `candidates-list` |
| Status | `Badge` | tone by status | `candidate-status-{id}` |
| Pagination | **`Pagination`** (new) | `page`, `pageCount`, `onChange` | `candidates-pagination` |
| Loading | `Skeleton` | — | `candidates-loading-skeleton` |
| Empty / no results | `Card` | — | `candidates-empty-state` · `candidates-no-results` |

## Status tones

The five board statuses map onto Meridian's five `Badge` tones. There is no sixth tone and no new
colour:

| Status | `Badge tone` |
|---|---|
| Scheduled | `info` |
| Didn't pass | `inactive` |
| Maybe | `warning` |
| Passed | `active` |
| Offer | `active`, `outline` |

`Offer` is the outlined variant of the success tone rather than a new hue — it is the same good
news as `Passed`, one step further along, and Meridian reserves its remaining accent (amber) for
the tracker and warnings.

## Copy

| Slot | Text |
|---|---|
| Page title | Candidates |
| Page subtitle | Times in {zone} |
| Search placeholder | Search name or email… |
| Filter labels | POSITION · CATEGORY · CRITERIA |
| Add criteria filter | + Add criteria filter |
| Operators · scale | is · is not · at least · at most |
| Operators · number | is · is not · at least · at most |
| Operators · boolean | is yes · is no |
| Operators · text | contains · is |
| Count, unfiltered | {n} candidates |
| Count, filtered | {matched} of {total} candidates |
| Clear all | Clear all |
| Column headers | NAME · EMAIL · LATEST APPLICATION · STATUS |
| Application count | {n} applications |
| Archived marker | Archived |
| Empty database | No candidates yet. Share a booking link to start. |
| No results | No candidates match these filters |
| My interviews title | My interviews |
| My interviews groups | UPCOMING · PAST |
| My interviews empty of upcoming | No upcoming interviews. |

Operator wording is deliberately plain English rather than `>=`. `at least B1` is what an
interviewer would say; `English >= B1` is what a database would.

## Interactions

- **Search** debounces 300 ms then refetches, carrying the current filters. The count updates with
  the result, never optimistically.
- **Every filter change refetches immediately** — filters are discrete choices, unlike typing.
- **The count is the feedback.** No spinner replaces the table on a refilter; rows dim to
  `opacity: .55` and the count shows a `Spinner` in place of the number, so the list does not
  collapse and reflow under the reader.
- **Removing a chip** widens the result set in place.
- **Changing a criterion** in a filter row resets its operator and value.
- **An incomplete criteria row** — criterion chosen, value empty — is ignored rather than treated
  as a filter, so the list never empties while the row is half-built.
- **Pagination** preserves search and filters; changing any filter returns to page 1.
- **Row click** opens the candidate card.

## My interviews

A deliberately plain screen: no filters, no search, no pagination.

```
  My interviews                                                       ← PageHeader
  Times in Europe/Minsk
  ────────────────────────────────────────────────────────────────────
  UPCOMING                                                            ← SectionLabel
  ┌──────────────────────────────────────────────────────────────────┐
  │ Jane Doe    Senior React Engineer    Wed 26 Aug, 14:00     ●    →│
  └──────────────────────────────────────────────────────────────────┘
  PAST
```

- Two `SectionLabel` groups, each a `Table` with no header row — the columns are self-evident and
  a header would outweigh a three-row list.
- Past rows render their date in `--text-faint`.
- The next upcoming interview carries a `--accent-soft` left rule, so "what's next" reads at a
  glance.
- When `UPCOMING` is empty the group still renders, with its empty line, so the screen does not
  look broken on a quiet day.

## Responsive

| Width | Layout |
|---|---|
| ≥ 1024px | As drawn |
| 768–1023px | Filter labels move above their controls; the `EMAIL` column folds under `NAME` |
| < 768px | Rows become stacked cards; criteria filter rows stack their three controls vertically with the operator and value full width |

The filter Card never scrolls horizontally; its rows wrap.

## Accessibility

- The filter Card is a labelled `<section>` named "Filters", so it can be skipped.
- Each criteria row is a labelled group naming its index ("Criteria filter 1"), and its three
  controls carry labels that make sense read in sequence.
- The count is `aria-live="polite"` — it is the primary feedback for a filter change and the one
  thing that must be announced.
- Dimming rows during a refetch is paired with `aria-busy` on the table.
- Status badges carry their meaning in text.
- `Pagination` exposes current-page state via `aria-current="page"`.
- The next-upcoming rule on My interviews is decorative; the ordering and the group heading carry
  the meaning.

## DS gaps

| Gap | Resolution |
|---|---|
| **`Pagination`** | Nothing exists. `components/navigation/Pagination.jsx` — page numbers, previous/next, disabled bounds |
| **`Combobox` multi-select with chips** | The variant [01](01-vacancies.design.md) introduces, used here for positions and categories |
| **`Table` needs a busy/dimmed state** | Add `busy?: boolean` to `TableProps`, dimming the body and setting `aria-busy`, so every filterable table gets the same treatment instead of each screen dimming its own rows |
| **`Table` with no header row** | `columns` is required and always renders a header. Add `hideHeader?: boolean` for the My-interviews pattern |
| `Badge tone` covers all five statuses | No change — recorded so nobody adds a sixth tone for `Offer` |
