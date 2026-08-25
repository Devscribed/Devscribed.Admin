---
id: "01"
kind: design
title: Vacancies — Design
pairs-with: 01-vacancies.md
routes: ["/org/{orgId}/hiring/vacancies", "/org/{orgId}/hiring/vacancies/{vacancyId}"]
design-system: "1_DS for dev"
tags: [vacancy, table, modal, combobox, disabled-option, meridian, light-only]
---

# 01 — Vacancies · Design

Visual and interaction specification for the vacancies list, the vacancy detail page, and the
create/edit dialog. Pairs with [01-vacancies.md](01-vacancies.md), which owns the rules and every
validation message.

**Design system:** Teammerly Meridian. **Theme:** light only. Both screens render inside the
existing `AppShell` (`specs/user-management/00-app-shell.design.md`) and draw no chrome of their
own.

## Sidebar

Hiring adds a second section to the sidebar, below `People`:

| Section | Row | Route | Visible to |
|---|---|---|---|
| HIRING | Vacancies | `/org/{orgId}/hiring/vacancies` | admin, manager |
| HIRING | Candidates | `/org/{orgId}/hiring/candidates` | admin, manager |
| HIRING | My interviews | `/org/{orgId}/hiring/my-interviews` | anyone assigned as an interviewer |

`My interviews` is gated on **assignment**, not role — the shell already resolves the session
before rendering so a gated row never flashes, and this is that mechanism with a different
predicate. A member with no hiring access sees no HIRING section label at all, not an empty one.

Glyphs are copied into `apps/web/src/layout/icons.tsx` alongside `PeopleIcon`, from the template's
`P` dictionary — the same accommodation spec 00 already records.

## Layout — list

```
  Vacancies                                        [ New vacancy ]   ← PageHeader
  ─────────────────────────────────────────────────────────────────
  [🔍 Search vacancies…]                    Status [ Open      ▾ ]   ← --sp-6 gap
  ┌───────────────────────────────────────────────────────────────┐
  │ TITLE            │ INTERVIEWER │ LENGTH │ CANDIDATES │ STATUS  │  ← Table
  │ Senior React Eng.│ Pat Owner   │ 60 min │     12     │ ● Open  │
  │ ⟨React⟩⟨Senior⟩  │             │        │            │         │
  └───────────────────────────────────────────────────────────────┘
```

- Search leading, status filter trailing, on one row above the table.
- Category chips sit on a second line inside the title cell, `--sp-2` below the title.
- `CANDIDATES` is a `mono` column — Grotesk numerals, right-aligned.

## Layout — detail

```
  Senior React Engineer                    [ Board ]  [ Edit ]  [⋮]  ← PageHeader
  ● Open · 60 minutes · Pat Owner                                    ← subtitle
  ─────────────────────────────────────────────────────────────────
  ┌───────────────────────────────────────────────────────────────┐
  │ BOOKING LINK                                                  │  ← Card
  │ https://…/book/senior-react-engineer-Kj8mQ2nP4xTw   [ Copy ]  │
  └───────────────────────────────────────────────────────────────┘
  ┌──────────────────────────┐  ┌──────────────────────────────────┐
  │ CATEGORIES               │  │ DESCRIPTION                      │
  │ ⟨React⟩⟨Senior⟩⟨Full…⟩   │  │ We're looking for…               │
  └──────────────────────────┘  └──────────────────────────────────┘
```

The booking link is the first thing on the page because copying it is the reason to visit. It is
selectable Grotesk at `--fs-14`, truncated with an ellipsis on narrow viewports but never wrapped.

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page header | `PageHeader` (app shell) | `title`, `subtitle`, `action` | `page-title` |
| Search | `SearchField` | `placeholder` | `vacancies-search-input` |
| Status filter | `Select` | `options`, `value` | `vacancies-status-filter` |
| List | `Table` | `columns`, `rows` | `vacancies-list` |
| Category chip | `Badge` | `tone="neutral"`, `dot={false}` | `vacancy-category-chip-{id}` |
| Status pill | `Badge` | `tone="active"` open, `"inactive"` closed | `vacancy-status-{id}` |
| New / Edit | `Modal` | `title`, `actions`, `width={520}` | `vacancy-dialog` |
| Title field | `Input` | `label`, `error` | `vacancy-title-input` |
| Interviewer | **`Select` + `disabled` option** | see [DS gaps](#ds-gaps) | `vacancy-interviewer-select` |
| Length | `RadioGroup` | `direction="row"`, `options` | `vacancy-duration-{minutes}` |
| Categories | **`Combobox`** (new) | `multiple`, `allowCreate`, `options` | `vacancy-categories-input` |
| Description | **`Textarea`** (new, shared with 02) | `label`, `rows={6}` | `vacancy-description-input` |
| Row actions | **`Menu`** (new) | `trigger`, `items` | `vacancy-actions-menu` |
| Copy link | `Button` | `variant="secondary"`, `size="sm"` | `vacancy-copy-link-button` |
| Confirmations | `Modal` | `actions` | `vacancy-reassign-confirm` |
| Notifications | **`Toast`** (new) | `tone` | `toast-vacancy-created` … |
| Loading | **`Skeleton`** (new) | `rows` | `vacancies-loading-skeleton` |
| Empty state | native `<p>` in a `Card` | — | `vacancies-empty-state` |

## Copy

| Slot | Text |
|---|---|
| Page title | Vacancies |
| Page action | New vacancy |
| Search placeholder | Search vacancies… |
| Status filter options | All · Open · Closed |
| Column headers | TITLE · INTERVIEWER · LENGTH · CANDIDATES · STATUS |
| Detail section labels | BOOKING LINK · CATEGORIES · DESCRIPTION |
| Copy button | Copy |
| Dialog title, create | New vacancy |
| Dialog title, edit | Edit vacancy |
| Micro-label · title | TITLE |
| Micro-label · interviewer | INTERVIEWER |
| Micro-label · length | INTERVIEW LENGTH |
| Micro-label · categories | CATEGORIES |
| Micro-label · description | DESCRIPTION |
| Placeholder · title | Senior React Engineer |
| Placeholder · categories | Type to add… |
| Placeholder · description | What the role involves, who it suits. |
| Hint · interviewer | Availability is read from their Microsoft 365 calendar. |
| Ineligible option suffix | No Microsoft 365 mailbox |
| Submit, create | Create vacancy |
| Submit, edit | Save changes |
| Closed link note | This link is no longer accepting bookings. |
| Menu items | Close vacancy · Reopen vacancy · Delete vacancy |
| Reassign confirmation body | {n} scheduled interviews keep their current time and interviewer. |
| Empty list | No vacancies yet. |

The interviewer hint states *why* a mailbox is required, up front, rather than waiting for the
visitor to discover it from a disabled row.

## States

| State | Treatment |
|---|---|
| **Status · open** | `Badge tone="active"` — success tint, dot |
| **Status · closed** | `Badge tone="inactive"` — error tint, dot |
| **Interviewer option · eligible** | default menu item, `--hover-bg-tint` on hover |
| **Interviewer option · ineligible** | `--text-faint` ink, reason in `--fs-12` `--text-muted` trailing, `aria-disabled`, no hover, not selectable |
| **Category chip · in dialog** | `Badge` with a trailing remove `IconButton size={20}` |
| **Delete · blocked** | menu item disabled, `--text-faint`, tooltip carrying the reason |
| **Link · copied** | `Toast tone="success"`; the button itself does not change label |
| **Row · hover** | `--hover-bg-tint`, the universal Meridian row hover |
| **Loading** | `Skeleton` rows matching the table's column widths — never a bare spinner in a table |

## Interactions

- **Search** debounces 300 ms then refetches server-side; the status filter refetches immediately.
- **Row click** navigates to the detail page; the actions menu stops propagation so opening it
  never navigates.
- **Copy** writes the absolute URL to the clipboard and raises a toast. On a clipboard failure the
  link text is selected instead, so the visitor can copy manually — the action never silently
  fails.
- **Category combobox** — typing filters existing categories case-insensitively; when nothing
  matches, a `Create "…"` row appears last. Chips are removable by click or `Backspace` at the
  start of the input.
- **Changing interviewer or length** on a vacancy with scheduled interviews opens the confirmation
  before the request is sent, with the count interpolated.
- **Delete** is disabled rather than hidden when blocked — a missing action is indistinguishable
  from a bug, and the tooltip carries the reason.
- **After any mutation** the list or detail refetches. No optimistic updates.

## Responsive

| Width | Layout |
|---|---|
| ≥ 1024px | Full table; detail's Categories and Description side by side |
| 768–1023px | Table drops the `CANDIDATES` column into the title cell as "12 candidates"; detail stacks |
| < 768px | Rows become stacked cards — title, chips, then a metadata line; the dialog goes full width |

The booking link truncates with `text-overflow: ellipsis`; the page body never scrolls
horizontally.

## Accessibility

- The status pill's meaning is in its text, not its tint.
- The interviewer picker exposes ineligible options with `aria-disabled="true"` and includes the
  reason in the option's accessible name, so it is announced rather than merely seen.
- The category combobox follows the combobox pattern: `aria-expanded`, `aria-activedescendant`,
  and chips exposed as a list with removable items each carrying an accessible name.
- The actions menu is a real menu — `Escape` closes, arrow keys move, focus returns to the trigger.
- A disabled menu item stays focusable so its tooltip can be reached by keyboard; the tooltip is
  referenced by `aria-describedby`.
- Toasts are `role="status"`, polite, and never steal focus.
- Skeletons are `aria-hidden` with a single polite "Loading vacancies" announcement alongside.

## DS gaps

| Gap | Why the existing bundle cannot cover it | Resolution |
|---|---|---|
| **`SelectOption` has no `disabled`** | `SelectOption = string \| { value, label }`. `RadioOption` already carries `disabled`; `Select` does not — so an ineligible interviewer cannot be shown-but-disabled, which is exactly what [01 §02.6](01-vacancies.md) requires | add `disabled?: boolean` and `hint?: ReactNode` to `SelectOption`, matching `RadioOption` |
| **`Combobox`** | `Select` takes a fixed `options` array with no typing, no filtering, no multi-select, no create-new | `components/forms/Combobox.jsx` — used again by 03's filters and 04's criteria |
| **`Textarea`** | `Input` is single-line by construction | shared with [02 design](02-booking-page.design.md) |
| **`Menu`** | Nothing in the bundle is a dropdown menu; `Modal` is a dialog | `components/navigation/Menu.jsx` — also used by 04 and 05 |
| **`Tooltip`** | Nothing exists, and the blocked-delete and last-admin patterns both need one | `components/feedback/Tooltip.jsx` |
| **`Toast`** | Nothing exists; user-management spec 04 already specifies toasts it has no component for | `components/feedback/Toast.jsx` — resolves a gap that predates hiring |
| **`Skeleton`** | Only `Spinner` exists; spec 04 already asks for skeleton rows | `components/feedback/Skeleton.jsx` |
| **`Table` has no row link or per-row test id** | `rows` accepts `id` and `dim` only, so a linked row needs a `render` on every column | add `rowHref` and `rowTestId` to `TableProps` |

`Toast`, `Skeleton`, `Menu`, and `Tooltip` are gaps user-management already opened and worked
around; hiring is where they get built, and specs 04 and 05 of user-management should adopt them
when next touched.
