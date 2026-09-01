---
id: "02"
kind: design
title: Booking Page — Design
pairs-with: 02-booking-page.md
routes: ["/book/{slug}"]
design-system: "1_DS for dev"
tags: [public, booking-layout, calendar, slots, file-upload, teammerly, light-only]
---

# 02 — Booking Page · Design

Visual and interaction specification for `/book/{slug}`, the product's only public screen. Pairs
with [02-booking-page.md](02-booking-page.md), which owns the rules, the API contract, and every
validation message. This file owns what a developer would otherwise invent: which component to
reach for, which token drives which state, and the on-screen wording.

**Design system:** Teammerly Original DS (blue), vendored at `1_DS for dev/`. Import from
`index.js` through the app's `@/ds` barrel; never hardcode a colour, size, or font.

**Theme:** light only.

**This screen renders in neither `AppShell` nor `AuthLayout`.** It is the public shell,
[`BookingLayout`](#ds-gaps) — [ledger §46](../design-system/ledger.md), *designed, not measured*,
because prod has no public-facing surface of any kind.

## Layout

`BookingLayout` is the `#f8fafc` well `AppShell` paints, with one centred column capped at
**880px** — wide enough for the calendar and slot list side by side, where `AuthLayout`'s 480px
card is not. Page padding is 40px top and bottom, 16px at the sides, with 30px under the wordmark:
`AuthLayout`'s own rhythm, deliberately, because a candidate who books and then returns through
the link in their invite must land on a page they recognise.

```
                       Acme Inc                       ← the organization's name, headline-4
                                                        (no logo, and not Teammerly's mark)

              Senior React Engineer                   ← PageTitle, 16 → 20 → 24 by viewport
                    60 minutes                        ← 16px, --text-secondary
      We're looking for an engineer who…              ← 16px, --text-tertiary, 66ch

  ┌──────────────────────┐  ┌──────────────────────┐
  │  Date                │  │  Time                │  ← two Cards, 1fr 1fr, headline-6 titles
  │  ‹  August 2026   ›  │  │  Tue 25 August 2026  │
  │  M  T  W  T  F  S  S │  │  ┌────┐ ┌────┐       │
  │  … date grid …       │  │  │09:00││10:00│      │
  └──────────────────────┘  └──────────────────────┘
     🌐 (UTC+03:00) Minsk ▾            [24h│12h]     ← zone Select + ToggleButton

  ┌────────────────────────────────────────────────┐
  │  Your details                                  │  ← one Card, its title an <h2>
  │  First name            Last name               │  ← two columns
  │  Email                                         │
  │  CV                                            │
  │  Anything we should know?                      │
  │              [        Book        ]            │  ← primary, 320px
  └────────────────────────────────────────────────┘
```

- Gap between regions `--space-8` (24px); the form's own rows are `--space-7` (20px) apart, which
  is blue's form rhythm and the clearance a field's message slot needs beneath it.
- The header block is centred; the two Cards and the form Card are full width of the column.
- The zone selector and format toggle sit on one row directly under the two Cards, zone leading and
  toggle trailing.
- Cards are blue's `Card` ([§12](../design-system/ledger.md)): `--surface-card`, a 1px
  `--border-default` hairline, `--radius-l`, **no shadow**. Meridian's `--shadow-card` is not
  carried over — blue reserves shadow for things that float.

### The wordmark

The organization's name, drawn by the shell at blue's headline-4 step in `--text-primary`. It is
**not** Teammerly's mark: this page belongs to the customer whose vacancy it advertises, and
`AuthLayout` draws the product's own mark precisely because *that* page does not.

Meridian put a 7px amber square after the name. It is gone, and the reasoning is in the
[ledger](../design-system/ledger.md#a-note-on-46-and-the-wordmark-that-is-not-the-products): the
square imitated yellow's own wordmark, which existed only because yellow had no logo file. Blue
ships a real one, so the imitation has nothing left to imitate — and lending Teammerly's actual
mark to a customer's name would be worse than dropping it.

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page shell | **`BookingLayout`** (§46) | `wordmark`, `wordmarkTestId` | `booking-page` |
| Organization | drawn by the shell | — | `booking-org-wordmark` |
| Vacancy title | `PageTitle` | — | `booking-vacancy-title` |
| Duration | native `<div>` | — | `booking-duration` |
| Description | native `<p>` | — | `booking-description` |
| Date panel | `Card` | `title="Date"` | — |
| Date grid | `Calendar` (§30) | `month`, `weeks`, `availableDates`, `selected`, `onSelect`, `onMonthChange`, `minDate`, `maxDate`, `today`, `loading` | `calendar-control` |
| Month nav | drawn by `Calendar` | — | `calendar-prev-month` · `calendar-next-month` |
| Time panel | `Card` | `title="Time"` | — |
| Slot entry | `Button` | `variant="primary"` when chosen, `aria-pressed` | `slot-option-{startUtc}` |
| Time zone | `Select` | `isSearchable`, `options`, `value`, `onChange` | `booking-timezone-select` |
| Time format | `ToggleButton` (§31) | `value1="24h"`, `value2="12h"`, `selectedValue` | `booking-timeformat-toggle` |
| Form section | `Card` | `title="Your details"` | — |
| First / last / email | `TextInput` | `label`, `id`, `placeholder`, `error`, `errorId`, `type` | `booking-first-name-input` … |
| CV | **`FileInput`** (§47) | `label`, `id`, `accept`, `fileName`, `fileNameTestId`, `error`, `errorId`, `hint`, `hintId` | `booking-cv-input` |
| CV filename | drawn by `FileInput` | — | `booking-cv-filename` |
| Note | `TextArea` | `label`, `id`, `rows`, `error`, `errorId` | `booking-note-input` |
| Submit | `Button` | `variant="primary"`, `preloader`, `disabled` | `booking-submit-button` |
| Server error | `InfoBanner` | `variant="error"`, `role="alert"` | `booking-error-banner` |
| Availability error | `InfoBanner` | `variant="warning"` + retry `Button` | `calendar-error` · `slot-list-error` |
| Page loading | `Preloader` | `aria-hidden`, with a polite region beside it | `booking-loading` |
| Availability loading | `Preloader` | — | `calendar-loading` · `slot-list-loading` |
| Closed / not found | `Card` | — | `booking-closed-message` · `booking-not-found` |

Inline field errors come from each field's own `error` prop; `errorId` tags the message node
`field-error-{fieldName}`, which is what makes it an `aria-describedby` target
([§4](../design-system/ledger.md)). The convention is spec 01 of user-management's, unchanged.

**Four components from the Meridian version are gone**, and each was replaced rather than
repainted (D4):

| Was | Is | Why |
|---|---|---|
| `SectionLabel` "YOUR DETAILS" | the `Card`'s own `title` | A caption over a whole surface is that surface's title, at `<h2>` ([§27](../design-system/ledger.md)) — so it joins the outline under `PageTitle` instead of floating above a box |
| `Input` / `Textarea` | `TextInput` / `TextArea` | blue's names for blue's fields |
| `Toggle` | `ToggleButton` | one control with two answers, as a `radiogroup` ([§31](../design-system/ledger.md)) |
| `Spinner` | `Preloader` | blue answers a wait with its pulse loader; there is no second spinner |

**The vacancy title is `PageTitle`.** Meridian set it at 34px, which blue's scale has no
counterpart for — one of the two token-map rows that needed a human call. It is the page's title,
and `PageTitle` is what blue titles a page with: type stepping 16 → 20 → 24px with the viewport
rather than holding one size. This is how `--fs-27` closed in Phase 2, on the signed-in header.

## Copy

Validation messages are **not** here — they belong to
[02-booking-page.md](02-booking-page.md) and must match its table exactly.

| Slot | Text |
|---|---|
| Date panel title | Date |
| Time panel title | Time |
| Slot list header | {Weekday} {D} {Month} {YYYY} |
| Time zone prefix | All times in |
| Form section title | Your details |
| Label · first name | First name |
| Label · last name | Last name |
| Label · email | Email |
| Label · CV | CV |
| Label · note | Anything we should know? |
| Placeholder · first name | Jane |
| Placeholder · last name | Doe |
| Placeholder · email | you@example.com |
| Placeholder · note | Optional |
| Hint · CV | PDF, DOC, DOCX, RTF or TXT. Up to 10 MB. |
| File chooser | Choose file |
| File chooser, empty | No file chosen |
| Submit | Book |
| Submit, in flight | Booking |
| Slot list empty | No times available on this date — please pick another. |
| Window empty | No times are available in the next month. |
| Availability retry | Try again |
| Closed | This position is no longer accepting applications. |
| Not found | This link doesn't lead anywhere. |

**Sentence case throughout, and no uppercase anywhere on this screen.** Meridian set every
micro-label in `UPPERCASE` with `--ls-wider`; blue's content rule spends its one uppercase
treatment on `PageTabs`, which this page does not use. The labels are now the field labels blue
draws — 12px, `--text-secondary`, sentence case.

Voice is otherwise unchanged: no exclamation marks, no emoji, and errors stay terse — blue prefixes
them with a bare `*`, which `TextInput`, `TextArea` and `FileInput` all draw for themselves. Times
carry `tabular-nums` so a column of slots aligns.

## States

Every value is a token; nothing here is a literal.

| State | Treatment |
|---|---|
| **Date · available** | `--surface-card`, `--text-primary`; cursor pointer |
| **Date · unavailable** | `--color-gray-light` at `opacity: .5`, `disabled`, out of the tab order, `not-allowed` |
| **Date · past** | as unavailable |
| **Date · selected** | solid `--color-blue`, white ink, 13px/600 — react-datepicker's own selected day |
| **Date · focus** | `--shadow-focus-input`, which react-datepicker leaves transparent (§30) |
| **Slot · available** | `Button` default — `--surface-card`, 1.5px `--border-default`, `--action-neutral-text` |
| **Slot · selected** | `Button variant="primary"` — solid `--action-primary`, `aria-pressed="true"`. The same fill the Calendar paints its selected day with: one answer to "this is the one you picked" across both halves of the picker |
| **Slot · focus** | blue's own button focus |
| **Field · error** | 1.5px `--status-error` border, `--shadow-error-glow`, the message `*`-prefixed beneath |
| **CV · empty** | `Choose file` affordance, then `No file chosen` in `--text-secondary` |
| **CV · attached** | the same affordance, then the filename in `--text-primary`, ellipsised |
| **Submit · disabled** | blue's own disabled Button — `opacity: .6`, `cursor: not-allowed` |
| **Submit · loading** | `Button preloader` — the spinner takes the icon slot, `aria-busy`, label "Booking" |
| **Page · loading** | a centred `Preloader` in the shell, `aria-hidden`, with "Loading this position" in a polite region beside it — the dots carry no text of their own |
| **Availability · loading** | grid and list replaced by a centred `Preloader` |
| **Availability · error** | `InfoBanner variant="warning"` replacing the grid or list, with a retry `Button` |

Hover is blue's: `primary` brightens with `filter: brightness(90%)`, the neutral button fades to
`opacity: .6`. **There is no press treatment.** Meridian dropped a "lip" on press and shifted the
button 1px; blue's buttons have neither a lip nor a press state, and inventing one here would give
this screen a motion vocabulary the rest of the product does not have.

## Interactions

- **On load** — the first available date is selected and its slots load. No slot is selected.
  Submit is disabled.
- **Selecting a date** — replaces the selection, reloads the slot list, clears any slot selection.
  The visible month does not change.
- **Selecting a slot** — single selection, `aria-pressed` toggles, announced politely.
- **Changing the time zone** — refetches availability and re-renders both panels. If the selected
  slot no longer exists, the selection clears and the polite region says so.
- **Changing the time format** — re-renders slot labels only; nothing refetches, nothing is
  deselected, and the choice is written to `localStorage` under one key shared with the manage page.
- **Choosing a CV** — validated on selection, not on submit: the constraints were stated up front.
  A rejected file is not held on to, so a stale name can never be submitted.
- **Blur on a field** — validates that field. Valid clears the error.
- **Submit** — re-runs every validation; the button is disabled while anything is missing, so an
  invalid submit is not reachable. On a server error the banner appears **at the top of the form
  Card's body, above the first field**, and the values are retained.
- **Duplicate rejection** — renders in `booking-error-banner`, not as a field error, because it is
  a statement about the booking rather than about the email field.
- **Success** — the page **navigates** to `/manage/{slug}/{token}`, whose live state is the
  confirmation ([07 §04](07-manage-booking.md)). There is no confirmation Card here to design.
  **Book keeps its loading state until the navigation lands**, and is never released back to its
  rest state on this screen: an enabled Book for the length of a page transition invites a second
  press against a booking that already exists.

## Responsive

| Width | Layout |
|---|---|
| ≥ 880px | Date and Time Cards side by side, `1fr 1fr`; first and last name on one row |
| 600–879px | Date and Time stack; the name row stays two columns |
| < 600px | Everything stacks; the submit goes full width; the slot list caps at `60vh` and scrolls in its own region |

The breakpoints are this spec's own and do not change — they belong to the content, not to the
shell, and blue's 1200px `AppShell` breakpoint has nothing to say about a page that does not use
`AppShell`. They live in `globals.css` because a media query cannot be an inline style, which is
the same reason `.page-title` and `.ds-sidebar` exist.

The date grid keeps seven columns at every width — columns resize, never reflow. The page body
never scrolls horizontally.

## Accessibility

- The date grid is a `role="grid"` with `role="row"` / `role="gridcell"`, arrow-key roving focus,
  and disabled dates removed from the tab order entirely.
- Slot entries form a single-selection group; each carries an accessible name of its start time
  **in the current format** plus the active zone.
- Every field has a real `<label for>` — blue's own label had no `htmlFor` at all, which
  [§3](../design-system/ledger.md) added and `TextArea` (§25) and `FileInput` (§47) both inherit.
- A field in error carries `aria-invalid="true"` and `aria-describedby` pointing at
  `field-error-{fieldName}`.
- The CV hint is referenced by `aria-describedby` so the constraints are announced before a file is
  chosen — not after it is rejected. It shares the error's slot, so only one of the two ever exists
  to be described by, which is what keeps that attribute single-valued.
- **The CV control is one tab stop.** The `<input type="file">` is the whole hit area and the
  painted row beneath it is `aria-hidden` decoration (§47), so the control opens the picker on
  click, on `Enter` and on `Space`, and the focus ring is drawn where the focus actually is.
- The error banner is `role="alert"`; availability and selection changes go to a separate
  `aria-live="polite"` region so a rejected booking is not announced twice.
- The submit carries `aria-busy` while loading — set by `Button` itself from `preloader` (§2).
- Colour is never the only signal: an unavailable date is announced as disabled, a selected slot
  through `aria-pressed`.
- Contrast: `--text-primary` on `--surface-card` and `--action-primary-text` on `--action-primary`
  both clear AA. Disabled dates carry their state in the accessibility tree as well as in ink.

## DS gaps

Nothing on this screen may be improvised locally. Both entries below are in the vendored copy and
numbered in the [divergence ledger](../design-system/ledger.md).

| Gap | Why the existing bundle cannot cover it | Resolution |
|---|---|---|
| **`BookingLayout`** | `AuthLayout` is one 480px card for a login form; this screen needs a wide public shell with no card, and a wordmark that is the customer's rather than the product's | `components/appLayout/BookingLayout.jsx` — §46, *designed* |
| **`FileInput`** | Nothing in blue accepts a file: prod uploads only an avatar, through a cropper of its own | `components/forms/FileInput.jsx` — §47, *designed*, built as `TextInput`'s sibling |
| **`Calendar`** | Blue's `DateField` is a 140px text field holding `"Mar 18, 2026"` | `components/data/Calendar.jsx` — §30, landed in Phase 4 |
| **`Preloader` at page scale** | Exists, and needs nothing — compose it, centred | No change; recorded so nobody adds a second loader |

`Calendar` is deliberately presentational: availability, the booking window, and the time zone are
business rules that belong to the API and the page, not to a design-system component.

**A clear control on `FileInput` was considered and refused** — see §47. On this screen a CV is
required, so clearing one only produces an invalid form that re-choosing would fix anyway.

## Reference mockup

To be produced as `02-booking-page.mock.html` — static, token-driven, every state on one page,
following the pattern of `specs/user-management/01-organization-creation.mock.html`. It is the
visual acceptance target for this screen.
