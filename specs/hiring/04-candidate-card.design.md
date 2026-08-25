---
id: "04"
kind: design
title: Candidate Card — Design
pairs-with: 04-candidate-card.md
routes: ["/org/{orgId}/hiring/candidates/{candidateId}"]
design-system: "1_DS for dev"
tags: [candidate-detail, notes, autosave, criteria, cv, meridian, light-only]
---

# 04 — Candidate Card · Design

Visual and interaction specification for the candidate card — the page a team works on **during**
an interview. Pairs with [04-candidate-card.md](04-candidate-card.md), which owns the rules.

**Design system:** Teammerly Meridian. **Theme:** light only. Renders inside `AppShell`.

The governing constraint: someone is on a live call while using this. Nothing may steal focus,
nothing may move under the cursor, and no save may be silent.

## Layout

```
  Jane Doe                                                            ← PageHeader
  jane@example.com · first seen 12 Aug 2026
  ────────────────────────────────────────────────────────────────────
  ┌──────────────────────────────────────────────────────────────────┐
  │ Senior React Engineer · 60 minutes        Status [ Scheduled ▾ ] │  ← Card header
  │ Tue 26 Aug 2026, 14:00 Europe/Minsk · Pat Owner                  │
  │ Applied as "Jane M. Doe"                                         │
  ├──────────────────────────────────────────────────────────────────┤
  │ 📄 jane-doe-cv.pdf  180 KB              [ View ]   [ Download ]  │
  │                                                                  │
  │ CANDIDATE'S NOTE                                                 │
  │ I'm available from September.                                    │
  │                                                                  │
  │ CRITERIA                                    [ + Add criteria ]   │
  │ ⟨English  B2  ×⟩ ⟨AI Skills  Strong  ×⟩ ⟨Late hours  Yes  ×⟩     │
  │                                                                  │
  │ INTERVIEW NOTES                              Saved 14:32         │
  │ ┌──────────────────────────────────────────────────────────────┐ │
  │ └──────────────────────────────────────────────────────────────┘ │
  │                                                       [ Save ]   │
  │ CONCLUSION                                                       │
  │ ┌──────────────────────────────────────────────────────────────┐ │
  │ └──────────────────────────────────────────────────────────────┘ │
  │                                                       [ Save ]   │
  └──────────────────────────────────────────────────────────────────┘
  ┌ .NET Engineer · 45 minutes · 3 Jul 2026 · ● Didn't pass    ⌄ ┐    ← collapsed
```

- One `Card` per application, gap `--sp-8`. The most recent is expanded; the rest collapse to a
  single summary row with a chevron.
- Read-only facts sit in the Card header; everything editable sits in the body, in the order the
  interview happens: CV first, criteria during, notes throughout, conclusion at the end.
- `INTERVIEW NOTES` is the tallest thing on the page — `rows={12}` — because it is what the page is
  for.

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page header | `PageHeader` | `title`, `subtitle` | `page-title` |
| Application panel | `Card` | `title`, `action` | `application-section-{applicationId}` |
| Status | `Select` | `options`, `value` | `application-status-select-{applicationId}` |
| Submitted-as note | native `<p>` | — | `application-submitted-as-{applicationId}` |
| CV row | `Button` ×2 | `variant="secondary"`, `size="sm"` | `card-cv-view` · `card-cv-download` |
| Criterion chip | **`Badge` + inline value control** | see below | `card-criterion-{criterionId}` |
| Criterion value · scale/boolean | `Select` | `options` | `card-criterion-value-{criterionId}` |
| Criterion value · number/text | `Input` | `type` | `card-criterion-value-{criterionId}` |
| Add criteria | **`Combobox`** | `allowCreate` | `card-criteria-autocomplete` |
| Notes / conclusion | **`Textarea`** | `label`, `rows` | `card-notes-input` · `card-conclusion-input` |
| Save | `Button` | `variant="secondary"`, `size="sm"` | `card-notes-save` · `card-conclusion-save` |
| Saved indicator | native `<span>` | — | `card-notes-saved-at` |
| Save failure | `InfoBanner` | `tone="error"` + retry | `card-save-error` |
| Not found | `Card` | — | `candidate-not-found` |

`Combobox` and `Textarea` come from [01](01-vacancies.design.md) and
[02](02-booking-page.design.md); nothing new is invented here.

## Copy

| Slot | Text |
|---|---|
| Page subtitle | {email} · first seen {date} |
| Submitted-as | Applied as "{submittedName}" |
| Section labels | CANDIDATE'S NOTE · CRITERIA · INTERVIEW NOTES · CONCLUSION |
| Add criteria | + Add criteria |
| Criteria empty | No criteria recorded yet. |
| Notes placeholder | Notes from the interview… |
| Conclusion placeholder | The outcome, and why. |
| Saved, recent | Saved just now |
| Saved, older | Saved {HH:mm} |
| Saving | Saving… |
| Save failed | Couldn't save. **Retry** |
| Collapsed summary | {vacancy} · {length} · {date} · {status} |
| Not found | We couldn't find that candidate. |

"Saved just now" holds for the first minute, then becomes a clock time. A relative time that keeps
ticking would be motion in the corner of the eye during a call.

## States

| State | Treatment |
|---|---|
| **Notes · idle** | `--bg-field`, 1.5px `--border-strong` |
| **Notes · focus** | `--accent` border, `--shadow-glow-accent` |
| **Notes · saving** | indicator reads "Saving…" in `--text-muted`; the field stays fully editable |
| **Notes · saved** | indicator reads the time in `--text-muted`, no colour change, no animation |
| **Notes · failed** | `InfoBanner tone="error"` **below** the field with an inline retry; the field keeps its text and its focus |
| **Criterion chip** | `Badge tone="neutral"` for the name, the value control inline, a remove `IconButton size={20}` trailing |
| **Criterion · saving** | the value control is `aria-busy`; no spinner, no layout shift |
| **Status · changed** | `Toast` confirming the move; the Select does not animate |
| **Collapsed application** | header row only, `--bg-panel-2`, chevron rotating 200 ms |

The rule underneath all of this: **the layout never shifts while someone is typing.** Save
indicators occupy reserved space whether or not they have text, so an autosave never nudges the
textarea.

## Interactions

- **Autosave** fires ~2 s after typing stops. While a save is in flight further keystrokes are
  buffered into one following save; saves never overlap.
- **Explicit Save** flushes immediately and cancels any pending autosave.
- **A failed save** stops the autosave loop until the member retries or edits again — a failing
  endpoint must not be retried every two seconds for the length of an interview.
- **Leaving the page with unsaved text** prompts before navigating away, including on a board-driven
  navigation.
- **Add criteria** opens the combobox with focus in the input. Choosing an existing criterion adds
  the chip and moves focus straight to its value control, so the whole interaction is
  type-select-set with no mouse.
- **Creating a criterion inline** opens the `Modal` from [06](06-libraries.design.md). This is the
  one dialog that can appear during an interview and is deliberately compact.
- **A criterion value** saves on change with no separate confirmation.
- **Status changed here** raises a toast and does not navigate — the member stays on the card.
- **`?application=`** expands that section and scrolls it into view with `scroll-margin-top` clear
  of the fixed top bar.

## Responsive

| Width | Layout |
|---|---|
| ≥ 1024px | As drawn; criteria chips wrap in a flex row |
| 768–1023px | The Card header's status control moves below the title |
| < 768px | Criteria chips stack full width; textareas keep their row counts; the CV actions become full-width buttons |

## Accessibility

- Both textareas have real `<label>`s; the uppercase micro-label is the label.
- The saved indicator is `aria-live="polite"` but announces **only** failures and explicit saves.
  Announcing every autosave would speak over an interview every two seconds — the visible indicator
  carries the routine case.
- Criterion chips are a list; each remove control's accessible name names its criterion
  ("Remove English"), never a bare "Remove".
- The value control's accessible name includes the criterion, so a screen-reader user hears
  "English, B2" rather than an unlabelled select.
- The status control announces the resulting column on change.
- Collapsed sections use `aria-expanded` on the header row, and the chevron is decorative.
- Focus is never moved by an autosave, a toast, or a background refetch.

## DS gaps

| Gap | Resolution |
|---|---|
| `Textarea`, `Combobox`, `Menu`, `Toast` | Already opened by [01](01-vacancies.design.md) and [02](02-booking-page.design.md); this screen adds no new component |
| **`Textarea` needs a trailing status slot** | The saved-at indicator must sit in the label row without shifting the field — add a `trailing` slot to `Textarea`'s label row, mirroring `Input`'s `trailing` |
| **`Badge` cannot host an interactive child** | It is a `<span>` with text; the criterion chip needs a `Select` and an `IconButton` inside — add a `Chip` variant, or compose in the app and record it here. **Composed in the app**, since a chip carrying a form control is a screen concern, not a token concern |
