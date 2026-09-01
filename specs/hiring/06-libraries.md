---
id: "06"
title: Category & Criteria Libraries
routes: ["/org/{orgId}/hiring/settings"]
api: ["GET /api/organizations/{orgId}/hiring/categories", "POST /api/organizations/{orgId}/hiring/categories", "PATCH /api/organizations/{orgId}/hiring/categories/{categoryId}", "DELETE /api/organizations/{orgId}/hiring/categories/{categoryId}", "GET /api/organizations/{orgId}/hiring/criteria", "POST /api/organizations/{orgId}/hiring/criteria", "PATCH /api/organizations/{orgId}/hiring/criteria/{criterionId}"]
entities: [Category, Criterion, CriterionValue]
tags: [categories, criteria, autocomplete, archive, uniqueness, scale-values]
depends-on: ["01"]
---

# 06 — Category & Criteria Libraries

## Summary

Two org-wide libraries that everything else autocompletes against: **categories**, the labels on a
vacancy (`React`, `Senior`, `Engineer`), and **criteria**, the things a candidate is assessed on
during an interview (`English`, `AI Skills`, `Late hours availability`).

Both are created inline, at the moment they are needed — typing a name into a vacancy's category
field or a candidate card's Add-criteria control. This settings screen exists for the maintenance
that inline creation cannot do: renaming, archiving, and deleting.

Inline creation is also how these libraries decay. Six months in you have `React`, `ReactJS`, and
`react`, and the filter that justified the whole system quietly misses a third of its matches.
Requirement 4 is the main defence.

## Actors & Preconditions

- **Actors:** `admin` and `manager`. `user` and `viewer` have no access, including to the inline
  creation paths.
- **Preconditions:** a signed-in member of the organization.

## Functional Requirements

### 01. Shared Rules

1. Both libraries are scoped to the organization. Nothing is shared across organizations and
   nothing is seeded — every entry is team-created, and there are no system-provided defaults.
2. Both are created **inline** from the screen that needs them, and also from this settings screen.
3. **Names are unique per organization, case-insensitively.** `react` cannot be created while
   `React` exists; the autocomplete offers the existing entry instead. This single rule kills the
   most common source of duplicates.
4. Renaming propagates everywhere automatically, because assignments and assessments reference the
   row rather than the string.
5. **Merge is not available in this release**, for either library. Note the consequence:
   requirement 3 makes rename unable to fix a duplicate that already exists, since renaming
   `ReactJS` to `React` collides. Until merge lands, near-duplicates coexist. See the README.

### 02. Categories

6. A category has a **name only** — no colour, no description, no parent.
7. Categories attach to **vacancies**, not to candidates ([01 §01](01-vacancies.md)). A candidate's
   categories in [03](03-candidate-database.md) are derived from the vacancies they applied to.
8. Creating: inline from the vacancy dialog, or from this screen.
9. **Renaming** updates it everywhere it is assigned.
10. **Deleting** is allowed even when in use. It unassigns the category from every vacancy and
    deletes nothing else — no vacancy, no application, no assessment is affected. The confirmation
    names the usage count: "Delete "React"? It's used by 4 vacancies."
11. Deleting is permitted here, unlike for criteria, because a category is a label: removing it
    loses a classification, not a judgement.
12. Categories are internal. They are **never shown on the public booking page** or in any
    candidate-facing email — `Middle` or `Senior` on a public posting carries implications that are
    not ours to publish on the team's behalf.

### 03. Criteria

13. A criterion has a **name** and a **type**, fixed at creation:

    | Type | Value | Filterable by |
    |---|---|---|
    | `scale` | one of an ordered list of labels | is · is not · at least · at most |
    | `boolean` | yes / no | is yes · is no |
    | `number` | a number | = ≠ ≥ ≤ |
    | `text` | free text, ≤ 500 characters | contains · is |

14. **Type cannot be changed after creation.** Existing assessments are stored in the column that
    matches the type; changing it would strand or silently reinterpret them. Archive the criterion
    and create a replacement instead.
15. A `scale` criterion owns an ordered list of `CriterionValue` rows — a label and a position.
    Comparison uses the **position**, never the label.
16. Scale values may be:
    - **added** at any position;
    - **renamed** freely, with no effect on any filter or stored assessment;
    - **reordered**, which *does* change what existing filters match. The confirmation says so
      plainly, because it is the one edit here with retroactive consequences.
    - **deleted** only when no assessment uses them; otherwise the action is disabled with the
      usage count.
17. **Criteria are archived, never deleted, once assessed.** Deleting one would destroy every
    assessment recorded against it — precisely the data the candidate database filters on, and not
    recoverable. A criterion with zero assessments may be deleted outright.
18. An **archived** criterion:
    - disappears from the Add-criteria autocomplete, so it cannot be newly assessed;
    - keeps every existing assessment, readable and editable on the card;
    - remains available in the [03](03-candidate-database.md) criterion filter, marked "Archived"
      and sorted below the active ones, so historical data stays reachable.
19. Archiving is reversible.
20. Criteria are internal and never shown to a candidate.

### 04. Inline Creation

21. Typing a name that matches nothing offers `Create "…"`.
22. For a **category** this creates it immediately, in the same submit as the vacancy edit.
23. For a **criterion** it opens a compact form asking for the type and, for a scale, its ordered
    values. This is the one moment of friction in the design, and it is deliberate: inferring a
    scale's order from the order in which values happen to be first used would leave every filter
    quietly wrong until somebody noticed and fixed the ordering. Paying it once, visibly, is
    better than discovering it later.
24. After the first few interviews almost every criterion already exists, so the common path is
    autocomplete-and-pick, exactly as intended.

## Screens

### Settings — libraries

One screen, two tabs — the standard list layout every other hiring screen uses: the toolbar
carries the tab strip, a search over the open tab, and the tab's primary action; the body is a
table whose rows act through a kebab.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Libraries                                                           │
│                                                                      │
│  CATEGORIES (3) · CRITERIA (4)      [ Search…      ] [ New category ]│
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Name        Vacancies                                  Actions │  │
│  │ Asp.Net     No vacancies                                   ⋮   │  │
│  │ React       One, Two  (+2)                                 ⋮   │  │
│  │ Senior      Senior React Engineer                          ⋮   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  Merging isn't available yet…                                        │
└──────────────────────────────────────────────────────────────────────┘

│  CATEGORIES (3) · CRITERIA (4)      [ Search…      ] [ New criteria ]│
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Name                       Type     Assessments        Actions │  │
│  │ English                    Scale    18 assessments         ⋮   │  │
│  │   A1 › A2 › B1 › B2 › C1 › C2                                  │  │
│  │ Late hours                 Yes/No   6 assessments          ⋮   │  │
│  │ Legacy skill  ⟨Archived⟩   Text     2 assessments          ⋮   │  │
│  └────────────────────────────────────────────────────────────────┘  │
```

- Each tab's label carries its whole library's size. The counts ignore the search, because
  the search is not shared across the strip — it resets on a switch, since a term typed
  over one library means nothing over the other — so each label states exactly what
  pressing its tab shows.
- The category row's `Vacancies` cell prints up to two whole titles and folds the rest
  into a `+N`; the count lives in the cell's accessible name with every title spelled out.
  A truncated title names nothing.
- The kebab holds `Rename` / `Delete` on a category and `Edit` / `Archive`|`Restore` /
  `Delete` on a criterion. A blocked `Delete` is disabled in place with its reason drawn
  in the row, never hidden.

### New criteria dialog

```
┌──────────────────────────────────────────────┐
│  New criteria                                │
│  NAME                                        │
│  [ English                              ]    │
│  TYPE                                        │
│  (•) Scale  ( ) Yes/No  ( ) Number  ( ) Text │
│  VALUES, WORST TO BEST                       │
│  [ A1 ] [ A2 ] [ B1 ] [ B2 ] [ C1 ] [ C2 ]   │
│  [ + Add value ]                             │
│                                              │
│              [ Cancel ]  [ Create ]          │
└──────────────────────────────────────────────┘
```

## Flows

### Flow: create a criterion during an interview

1. Interviewer activates Add criteria on a candidate card and types "English".
2. Nothing matches, so `Create "English"` is offered.
3. The compact form asks for the type; they choose Scale and enter the six CEFR values in order.
4. On confirm the criterion joins the library and is assessed on this application in one step.

### Flow: rename a category

1. `admin` opens Libraries and renames `Reactjs`.
2. The new name is checked case-insensitively against the library.
3. On success, every vacancy carrying it shows the new name immediately.

### Alt flow: rename collides

- Renaming `ReactJS` to `React` is rejected, because `React` exists. The message names the
  collision and, since merge is not available, suggests deleting one after reassigning its
  vacancies.

### Alt flow: archive rather than delete

- Delete on a criterion with assessments is disabled, with the count and an explanation. Archive is
  offered instead; it removes the criterion from autocomplete while leaving the assessments and the
  database filter intact.

### Alt flow: reorder a scale

- Dragging `B1` above `A2` warns that existing filters will match differently, and requires
  confirmation before saving.

## API Contracts

### GET /api/organizations/{orgId}/hiring/categories

Response `200`:
```json
{ "categories": [ { "id": "uuid", "name": "React", "vacancyCount": 4,
                    "vacancies": ["One", "Two", "Three", "Four"] } ] }
```

`vacancies` is the titles behind the count, alphabetical — derived on read, like every
usage number in this spec. Every category endpoint answers this same shape.

### POST /api/organizations/{orgId}/hiring/categories

Request: `{ "name": "React" }`

Success `201`: the category.
Errors: `409` `{ error: "duplicate_name", message: "\"React\" already exists" }` — the body carries
the existing category's id so an inline caller can select it instead of failing.

### PATCH /api/organizations/{orgId}/hiring/categories/{categoryId}

Request: `{ "name": "React.js" }`. Errors as `POST`, plus `404`.

### DELETE /api/organizations/{orgId}/hiring/categories/{categoryId}

Success `200`: `{ "success": true, "unassignedFrom": 4 }`. Errors: `404`.

### GET /api/organizations/{orgId}/hiring/criteria

Query params: `includeArchived` (optional, default `false`).

Response `200`:
```json
{ "criteria": [
  { "id": "uuid", "name": "English", "type": "scale", "isArchived": false,
    "assessmentCount": 18,
    "values": [ { "id": "uuid", "label": "A1", "position": 0, "assessmentCount": 1 } ] },
  { "id": "uuid", "name": "Late hours", "type": "boolean", "isArchived": false,
    "assessmentCount": 6, "values": [] }
] }
```

### POST /api/organizations/{orgId}/hiring/criteria

Request:
```json
{ "name": "English", "type": "scale", "values": ["A1","A2","B1","B2","C1","C2"] }
```

`values` is required and non-empty for `scale`, and must be absent or empty otherwise.

Success `201`: the criterion.
Errors:
- `409` `duplicate_name` — with the existing id, as for categories.
- `422` `{ error: "values_required" }` — a scale with no values.
- `422` `{ error: "values_not_allowed" }` — values supplied for a non-scale type.
- `422` `{ error: "duplicate_value" }` — repeated labels within one scale, compared
  case-insensitively.

### PATCH /api/organizations/{orgId}/hiring/criteria/{criterionId}

Request: any subset of `{ "name": "…", "isArchived": true, "values": [ … ] }`.

`values` carries the full ordered list, each entry either an existing `{ id, label }` or a new
`{ label }`. Order in the array is the new order.

Success `200`: the criterion.
Errors:
- `409` `duplicate_name`.
- `422` `{ error: "type_immutable" }` — any attempt to change `type`.
- `409` `{ error: "value_in_use", message: "…" }` — removing a value that has assessments.
- `404`.

`DELETE` exists for criteria with **zero** assessments only, and answers `409`
`{ error: "has_assessments" }` otherwise, naming archive as the alternative.

## Validation Rules

1. Names — trimmed, 1–50 characters, unique per organization case-insensitively, for both
   libraries.
2. `type` — one of `scale`, `boolean`, `number`, `text`; immutable after creation.
3. Scale values — 1–50 characters each, unique within the criterion case-insensitively, at least
   one, at most 20.
4. A value with assessments may not be removed.
5. Reordering is permitted and changes filter results; it is not blocked, only confirmed.
6. Archived criteria cannot receive **new** assessments ([04 §05](04-candidate-card.md)) but remain
   editable where already assessed.
7. Every id in a request must belong to the caller's organization.

## Error Messages

| Context | Message |
|---|---|
| Duplicate name | "\"{name}\" already exists" |
| Rename collides | "\"{name}\" already exists. Reassign and delete one instead." |
| Name empty | "Name is required" |
| Name too long | "Name must be at most 50 characters" |
| Scale with no values | "Add at least one value" |
| Duplicate scale value | "Each value must be different" |
| Too many values | "A scale can have at most 20 values" |
| Value in use | "\"{label}\" is used by {n} assessments" |
| Criterion delete blocked | "Archive this instead — it has {n} assessments" |
| Type change attempted | "A criterion's type can't be changed. Archive it and create a new one." |
| Category delete confirmation | "Delete \"{name}\"? It's used by {n} vacancies." |
| Criterion delete confirmation | "Delete \"{name}\"? No assessments are recorded against it, so nothing else is affected." |
| Reorder confirmation | "Reordering changes what existing filters match." |
| Toast — created | "Added to the library" |
| Toast — archived | "Criteria archived" |
| Toast — restored | "Criteria restored" |
| Empty categories | "No categories yet. Add one when you create a vacancy." |
| Empty criteria | "No criteria yet. Add one during an interview." |
| No categories match | "No categories match this search." |
| No criteria match | "No criteria match this search." |
| Libraries failed to load | "We couldn't load the libraries. Try again." |

The toast table stops at created, archived and restored on purpose: those are the changes
this screen cannot show — a new entry lands somewhere in an alphabetical order, possibly
off-screen, and an archived criterion is still on the page looking almost as it did —
while a rename, an edit or a delete announces itself by the row changing in front of the
reader.

## UI Notes

- Both libraries live on one settings screen, titled **Libraries**, as the two tabs of the
  product's standard list layout — toolbar with the strip, a search over the open tab and
  the tab's primary action, over a table. Categories is the first tab because it is the
  simpler library and the more frequently touched.
- Usage counts are part of every row — they are what makes a delete or archive decision
  answerable. A category's count lives in its `Vacancies` cell's accessible name, since
  the cell paints the titles themselves.
- Row actions live in a kebab, as on every other list: the blocked criterion `Delete`
  stays in the menu, disabled, with its reason drawn under the label in the row.
- Both deletes confirm; both confirmations stay up while the request runs.
- Archived criteria sort below active ones, recede to 70% and carry an "Archived" badge;
  the row's menu — the way back — never fades with it.
- Scale values render inline under the criterion's name as an ordered list joined by `›`,
  and in the dialog as an ordered, draggable row of chips, worst to best, with the
  direction stated in the label.
- Required `data-testid` attributes:
  - `hiring-settings`, `libraries-tabs`,
    `libraries-tab-categories`, `libraries-tab-criteria`, `libraries-loading`,
    `categories-search-input`, `criteria-search-input`, `categories-merge-note`
  - `categories-list`, `category-row-{id}`, `category-name-{id}`, `category-usage-{id}`,
    `category-actions-{id}`, `category-rename-{id}`, `category-delete-{id}`,
    `category-new-button`, `category-delete-confirm`, `category-delete-confirm-button`,
    `categories-empty`, `categories-no-results`
  - `criteria-list`, `criterion-row-{id}`, `criterion-name-{id}`, `criterion-type-{id}`,
    `criterion-values-{id}`, `criterion-usage-{id}`, `criterion-actions-{id}`,
    `criterion-edit-{id}`, `criterion-archive-{id}`, `criterion-restore-{id}`,
    `criterion-delete-{id}`, `criterion-delete-guard-{id}`, `criterion-delete-confirm`,
    `criterion-delete-confirm-button`, `criterion-archived-badge-{id}`, `criteria-empty`,
    `criteria-no-results`
  - `criterion-dialog`, `criterion-name-input`, `criterion-type-{type}`,
    `criterion-value-input-{index}`, `criterion-value-add`, `criterion-value-remove-{index}`,
    `criterion-reorder-confirm`, `criterion-submit-button`
  - `library-error-banner`, `libraries-retry`, `toast-library-created`,
    `toast-criteria-archived`, `toast-criteria-restored`, `toast-library-error`

## Out of Scope

- Merging two categories or two criteria — see the README.
- Colours, descriptions, icons, or hierarchies on categories.
- Criteria grouped into sets, or a vacancy declaring which criteria it expects.
- Changing a criterion's type.
- Per-vacancy or per-interviewer libraries — both are org-wide.
- Importing or exporting either library.
- Showing categories to candidates anywhere.

## Test Cases

### TC-H06-UNIT-01: Case-insensitive uniqueness
- **Level:** Unit
- **Preconditions:** a library containing `React`.
- **Steps:**
  1. Validate creating `react`, `REACT`, and `  React  `.
  2. Validate creating `React Native`.
- **Expected Result:**
  1. All three are rejected as duplicates, including the whitespace-padded form.
  2. `React Native` is accepted — it is a different name, not a case variant.

### TC-H06-UNIT-02: Scale value rules
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate a scale with no values.
  2. Validate one with `["Good","good"]`.
  3. Validate one with 21 values.
  4. Validate a `boolean` criterion carrying values.
- **Expected Result:**
  1. Rejected — "Add at least one value".
  2. Rejected — duplicates are compared case-insensitively.
  3. Rejected — at most 20.
  4. Rejected — values are not allowed for non-scale types.

### TC-H06-UNIT-03: Positions are reassigned contiguously on reorder
- **Level:** Unit
- **Preconditions:** a scale `A1 A2 B1` at positions 0, 1, 2.
- **Steps:**
  1. Move `B1` to the front.
- **Expected Result:**
  1. Positions become `B1`=0, `A1`=1, `A2`=2 — contiguous, with no gaps and no duplicates.

### TC-H06-INT-01: Duplicate creation returns the existing id so inline callers can recover
- **Level:** Integration
- **Preconditions:** category `React` exists.
- **Steps:**
  1. `POST` a category named `react`.
- **Expected Result:**
  1. `409` `duplicate_name`.
  2. The body carries the existing category's id, so the vacancy dialog can select it instead of surfacing an error.

### TC-H06-INT-02: Renaming propagates and never touches assignments
- **Level:** Integration
- **Preconditions:** category `Reactjs` assigned to three vacancies.
- **Steps:**
  1. `PATCH` the name to `React.js`.
  2. Read the three vacancies.
- **Expected Result:**
  1. Success.
  2. All three still carry the category, now under the new name; no assignment row changed.

### TC-H06-INT-03: Deleting a category unassigns it and nothing else
- **Level:** Integration
- **Preconditions:** category assigned to four vacancies, one of which has applications.
- **Steps:**
  1. `DELETE` the category.
  2. Read the vacancies and their applications.
- **Expected Result:**
  1. `200` with `unassignedFrom: 4`.
  2. All four vacancies survive with their other categories; every application, note, and assessment is untouched.

### TC-H06-INT-04: A criterion with assessments cannot be deleted, only archived
- **Level:** Integration
- **Preconditions:** criterion `English` with 18 assessments; criterion `Unused` with none.
- **Steps:**
  1. `DELETE` English.
  2. `PATCH` English with `isArchived: true`.
  3. `DELETE` Unused.
- **Expected Result:**
  1. `409` `has_assessments`; every assessment survives.
  2. Archived; the assessments are still readable.
  3. Deleted outright.

### TC-H06-INT-05: An archived criterion leaves the autocomplete but stays filterable
- **Level:** Integration
- **Preconditions:** an archived criterion with existing assessments.
- **Steps:**
  1. `GET` criteria with the default `includeArchived`.
  2. `GET` criteria with `includeArchived=true`.
  3. Filter candidates on it in [03](03-candidate-database.md).
- **Expected Result:**
  1. Absent — so it cannot be newly assessed.
  2. Present and marked archived.
  3. The filter still returns the historical matches.

### TC-H06-INT-06: Type is immutable
- **Level:** Integration
- **Preconditions:** a `scale` criterion.
- **Steps:**
  1. `PATCH` it with `type: "text"`.
- **Expected Result:**
  1. `422` `type_immutable`; the criterion and every assessment are unchanged.

### TC-H06-INT-07: A scale value in use cannot be removed
- **Level:** Integration
- **Preconditions:** scale `A1 A2 B1`, with `A2` used by two assessments and `B1` by none.
- **Steps:**
  1. `PATCH` the values omitting `B1`.
  2. `PATCH` the values omitting `A2`.
- **Expected Result:**
  1. Succeeds — `B1` is unused.
  2. Rejected `409` `value_in_use`, naming the count; both assessments survive.

### TC-H06-INT-08: user and viewer cannot reach either library
- **Level:** Integration
- **Preconditions:** callers as `user` (including an assigned interviewer) and `viewer`.
- **Steps:**
  1. As each, call every endpoint in this spec.
- **Expected Result:**
  1. All calls are rejected, and no library data appears in any response.
  2. An interviewer's inline criterion creation is rejected on the same grounds.

### TC-H06-E2E-01: Create a scale criterion inline during an interview
- **Level:** E2E
- **Preconditions:** logged in as `admin`; a candidate card open; the library has no "English".
- **Steps:**
  1. Activate Add criteria and type "English".
  2. Choose `Create "English"`.
  3. Choose Scale and enter `A1 A2 B1 B2 C1 C2`.
  4. Create, then set the value to `B2`.
  5. Open another candidate and type "Eng" into Add criteria.
- **Expected Result:**
  1. A create option appears because nothing matched.
  2. The dialog asks for the type and, for Scale, the ordered values.
  3. After step 4 the assessment shows `B2`.
  4. On the second candidate the autocomplete offers the existing criterion — no create option.
- **Selectors:** `card-criteria-add`, `card-criteria-autocomplete`, `criterion-dialog`, `criterion-type-scale`, `criterion-value-input-0`, `criterion-submit-button`, `card-criterion-value-{criterionId}`.

### TC-H06-E2E-02: Case-insensitive duplicates are offered, not created
- **Level:** E2E
- **Preconditions:** logged in as `admin`; category `React` exists.
- **Steps:**
  1. Open a vacancy's category field and type `react`.
- **Expected Result:**
  1. The existing `React` is offered.
  2. No `Create "react"` option appears.
- **Selectors:** `vacancy-categories-input`.

### TC-H06-E2E-03: Delete is replaced by archive once a criterion is used
- **Level:** E2E
- **Preconditions:** logged in as `admin`; one criterion with assessments and one without.
- **Steps:**
  1. Open Libraries, switch to the Criteria tab, and open both rows' menus.
  2. Archive the used one, then restore it.
  3. Delete the unused one.
- **Expected Result:**
  1. The used criterion's menu offers Archive and a disabled Delete with its reason —
     naming the assessment count — drawn in the row; the unused one's Delete is live.
  2. Archiving shows the badge; restoring removes it and returns the criterion to the autocomplete.
  3. The delete confirms — stating that no assessments go with it — and the row vanishes.
- **Selectors:** `libraries-tab-criteria`, `criterion-row-{id}`, `criterion-usage-{id}`, `criterion-actions-{id}`, `criterion-delete-{id}`, `criterion-delete-guard-{id}`, `criterion-archive-{id}`, `criterion-archived-badge-{id}`, `criterion-restore-{id}`, `criterion-delete-confirm-button`.

### TC-H06-E2E-04: Reordering a scale warns before it changes filter results
- **Level:** E2E
- **Preconditions:** logged in as `admin`; a scale criterion with assessments.
- **Steps:**
  1. Open the criterion for editing from its row's menu and drag a value to a new position.
  2. Save.
- **Expected Result:**
  1. A confirmation states that existing filters will match differently.
  2. Cancelling leaves the order untouched; confirming saves the new order.
- **Selectors:** `criterion-actions-{id}`, `criterion-edit-{id}`, `criterion-values-{id}`, `criterion-reorder-confirm`.
