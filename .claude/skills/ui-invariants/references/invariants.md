# UI invariants — the closed register

Eight mechanisms. Every finding about a drawn screen names one of these ids, and a finding
that names none is a note.

Each row states the invariant, what makes it false, and the shape of the sentence a document
writes to satisfy it. The invariant is about the **mechanism**, never about the control that
happened to show it: a rule written as "the country picker holds its width" closes one
control and leaves the other nine open.

| id | Invariant | Blocks when | Register |
|---|---|---|---|
| UI-01 | No box has a size that its own content decides. Every element whose content varies — in length, in count, or in presence — is drawn in a box that does not move when the content changes. | an element's width or height is a function of the data in it, and something beside or below it moves as a result | spec + review |
| UI-02 | A control does not move as a consequence of being used. | pressing a control changes a value whose length repositions that control | spec + review |
| UI-03 | The wait is drawn when there is nothing to draw. The answer to the previous question stands until the next answer arrives; the answer to a withdrawn question never stands. | a re-read replaces content already on screen with a loading state, or content outlives the question it answered | spec + review |
| UI-04 | A box drawn outside its own flow does not participate in an ancestor's layout or overflow. | an absolutely positioned, transformed or floating box contributes to an ancestor's scrollable overflow, or is clipped by an ancestor that scrolls | spec + review |
| UI-05 | One message, one node. A `data-testid` proves presence, never uniqueness. | a screen hands a message to a component *and* draws it beside the component, or a test asserts a message is visible rather than that it appears exactly once | review + tests |
| UI-06 | Every asset a token names is fetched, in every weight asked for, covering every script the data can carry. | a font family, icon set or stylesheet is named in the tokens and nothing loads it, or is loaded without a weight or a script the product uses | static gate |
| UI-07 | One value has one source. | the same fact is computed in two places — a client clock and a server timezone, a locally derived label and a server-returned grid — and the two can disagree on screen | spec + review |
| UI-08 | A list states its length and the way through it. | a control offers more rows than a person will scroll and no way to narrow them, or hides what is already chosen so the chosen set cannot be read or undone from the control | spec |

---

## How each is satisfied in a document

The register is only useful if the author has a sentence to write. These are the shapes.

**UI-01, UI-02 — the `## Geometry & motion` table.** One row per element whose content varies.

```markdown
| Element | What varies | What holds it | What moves if it does not |
|---|---|---|---|
| `calendar-range-label` | a month name, a same-month range, a range crossing a year | a width reserved for the longest preset the window can produce | `‹`, Today and `›`, far enough that the arrow leaves the pointer that clicked it |
| day column header | a holiday name, up to three lines in a 40px column | a fixed-size marker drawn out of the header's flow, the name on hover | the header row of the whole grid, and every row below it |
```

A row saying *nothing varies* is a row. An **empty table is a finding**, not an omission —
every screen has at least one element whose content is data.

**UI-03, UI-07 — the question, and the states of that question.** Named once, before the
states, in `## Screens`. Every state of that question is drawn: loading, answered, empty,
refused, failed, permission-limited. A state that leaves content on screen says **which
question that content still answers**. Where two things on one screen could each answer, the
document names the single source.

**UI-04 — the borrowed row.** A component that draws outside its own box states so in
`## Screens`, in the "What it demands of the caller" column, and the spec says how it is met:

> `Select` renders its open list absolutely inside its own wrapper. It is placed in a `Modal`
> panel, which is its own scroller — so the list is portalled to the document and positioned
> against the control's rectangle, and the panel's `scrollHeight` is unchanged by opening it.

**UI-05 — one node.** The `## Required data-testid Attributes` table says which node carries
the message, and the case asserts `toHaveCount(1)`, never `toBeVisible()`.

**UI-06 — the asset.** Anything a token names is listed in `## DS gaps` with what loads it.

**UI-08 — the list.** In "What it demands of the caller": how long the list is, and how a
member is reached. `250 rows, reached by typing` is a row; `the country list` is not.

---

## Where a finding under each id is raised

| id | spec author | `spec-reviewer` | `static-gate` | `implementer` | `code-reviewer` | `qa` |
|---|---|---|---|---|---|---|
| UI-01 | writes the table | S-63 | — | measures | CR-37 | walks |
| UI-02 | writes the table | S-63 | — | measures | CR-37 | walks |
| UI-03 | writes the states | S-62 | — | — | CR-33 | walks |
| UI-04 | writes the borrowed row | S-66 | — | measures | CR-38 | walks |
| UI-05 | names the node | — | `spec/message-duplicated` | — | CR-34 | — |
| UI-06 | lists the asset | S-67 | `ds/asset-not-loaded` | — | — | — |
| UI-07 | names the source | S-68 | — | — | CR-36 | — |
| UI-08 | states the length | S-61 | — | — | — | — |

A dash means no gate holds that id at that stage, and the id is carried by the stages that do.
