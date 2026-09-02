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

              Senior React Engineer                   ← <h1>, headline-4 (24/36/-0.7)
                   [ 60 minutes ]                     ← Badge status="neutral"
      We're looking for an engineer who…              ← 16px, --text-tertiary, 66ch

  All times in                                        ← the frame, ABOVE what it frames
  [ (UTC+03:00) Minsk        ▾ ]        [24h│12h]     ← zone Select 320px + ToggleButton 160px

  ┌──────────────────────┐  ┌──────────────────────┐
  │  DATE                │  │  TIME                │  ← two panels, 1fr 1fr, micro titles
  │  ‹  August 2026   ›  │  │  Tue 25 August 2026  │
  │  M  T  W  T  F  S  S │  │  ┌────┐ ┌────┐       │
  │  … date grid …       │  │  │09:00││10:00│      │
  └──────────────────────┘  └──────────────────────┘

  ┌────────────────────────────────────────────────┐
  │  YOUR DETAILS                                  │  ← one panel, its title an <h2>
  │  First name*           Last name*              │  ← two columns
  │  Email*                                        │
  │  CV*   [ Choose file ]  jane-cv.pdf  184 KB ×  │
  │  Anything we should know?                      │
  └────────────────────────────────────────────────┘

                [        Book        ]              ← primary, 320px, OUTSIDE the panel
```

**The zone and the format sit above the panels.** They are the frame every number below is read
in — a slot list means nothing until you know whose clock it is on — and a control that qualifies
what is above it is found only after the reader has already misread it once. The zone select
carries the label `All times in`, which is the only place the zone is named: the slot list states
it too, but visually hidden, because printed under the date it is the same sentence twice on one
screen.

**`Book` is outside the panel.** It is not one of the form's fields — it is what the whole page has
been building toward — and inside the card it read as the last row of `Your details`, level with a
textarea, as though it submitted only the part it sat in. It carries `form=` so it still submits
the fields it no longer stands among.

- Gap between regions `--space-8` (24px); the form's own rows are `--space-7` (20px) apart, which
  is blue's form rhythm and the clearance a field's message slot needs beneath it.
- **The format toggle's width is stated by its wrapper**, not by the control. §49 restored
  `ToggleButton`'s block behaviour so its own `max-width: 160px` decides the width — but a block
  at `width: 100%` inside a **shrink-to-fit flex item** is 100% of nothing, and in this row the two
  segments collapsed onto each other and painted `24h` over `12h`. The width has to be stated by
  whatever the flex row is measuring, which is the wrapper: `flex: 0 0 160px`.
- The header block is centred; the two Cards and the form Card are full width of the column.
- The zone selector and format toggle sit on one row directly under the two Cards, zone leading and
  toggle trailing.
- Panels are `Card variant="panel"` ([§66](../design-system/ledger.md)): `--surface-card`,
  `--radius-xl` (20px) over `--shadow-card-soft` (`0 60px 120px rgba(38,51,77,.05)`), **no border**.
  *Revised by `blue-fixes`.* They were blue's 8px-with-a-hairline `Card` — which is measured, but
  measured off prod's *small* cards; prod's large white sections (the Timesheets calendar card, the
  report tables) take this treatment instead. The two are a scale decision, not a style one: a
  hairline separates a 300px box from the boxes beside it, and a section as wide as the column it
  sits in has nothing beside it to be separated from, so the border becomes an outline drawn round
  the whole page. Neither value is Meridian's `--shadow-card`; both are prod's own.

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
| Vacancy title | native `<h1>` at `--headline-4-*` | — | `booking-vacancy-title` |
| Duration | **`Badge status="neutral"`** ([§59](../design-system/ledger.md)) | — | `booking-duration` |
| Description | native `<p>` | — | `booking-description` |
| Date panel | `Card variant="panel"` | `title="Date"` | — |
| Date grid | `Calendar` (§30) | `month`, `weeks`, `availableDates`, `selected`, `onSelect`, `onMonthChange`, `minDate`, `maxDate`, `today`, `loading` | `calendar-control` |
| Month nav | drawn by `Calendar` | — | `calendar-prev-month` · `calendar-next-month` |
| Time panel | `Card variant="panel"` | `title="Time"` | — |
| Slot entry | `Button` | `variant="primary"` when chosen, `aria-pressed` | `slot-option-{startUtc}` |
| Time zone | `Select` | `isSearchable`, `options`, `value`, `onChange` | `booking-timezone-select` |
| Time format | `ToggleButton` (§31) | `value1="24h"`, `value2="12h"`, `selectedValue`; its wrapper states the 160px | `booking-timeformat-toggle` |
| Form section | `Card variant="panel"` | `title="Your details"` | — |
| First / last / email | `TextInput` | `label`, `id`, `placeholder`, `error`, `errorId`, `type` | `booking-first-name-input` … |
| CV | **`FileInput`** (§47, §73) | `label`, `required`, `id`, `accept`, `fileName`, `fileNameTestId`, `fileSize`, `onClear`, `clearTestId`, `error`, `errorId`, `hint`, `hintId` | `booking-cv-input` |
| CV filename | drawn by `FileInput` | — | `booking-cv-filename` |
| CV clear | drawn by `FileInput` | — | `booking-cv-clear` |
| Note | `TextArea` | `label`, `id`, `rows`, `error`, `errorId` | `booking-note-input` |
| Submit | `Button` | `variant="primary"`, `preloader`, `disabled` | `booking-submit-button` |
| Server error | `InfoBanner` | `variant="error"`, `role="alert"` | `booking-error-banner` |
| Availability error | `InfoBanner` | `variant="warning"` + retry `Button` | `calendar-error` · `slot-list-error` |
| Page loading | `Preloader` | `aria-hidden`, with a polite region beside it | `booking-loading` |
| Availability loading | `Preloader` | — | `calendar-loading` · `slot-list-loading` |
| Closed / not found | `Card variant="panel"` | — | `booking-closed-message` · `booking-not-found` |

Inline field errors come from each field's own `error` prop; `errorId` tags the message node
`field-error-{fieldName}`, which is what makes it an `aria-describedby` target
([§4](../design-system/ledger.md)). The convention is spec 01 of user-management's, unchanged.

**Four components from the Meridian version are gone**, and each was replaced rather than
repainted (D4):

| Was | Is | Why |
|---|---|---|
| `SectionLabel` "YOUR DETAILS" | the panel's own `title` | A caption over a whole surface is that surface's title, and it stays a real `<h2>` ([§27](../design-system/ledger.md)) so it joins the outline. *Revised by `blue-fixes`:* on a `panel` that title is **drawn** as the small-caps micro label this app leads a section with (the Timesheets day header), not headline-6 — at 880px it is not competing with the card beside it but with the page's own `<h1>` two rows up |
| `Input` / `Textarea` | `TextInput` / `TextArea` | blue's names for blue's fields |
| `Toggle` | `ToggleButton` | one control with two answers, as a `radiogroup` ([§31](../design-system/ledger.md)) |
| `Spinner` | `Preloader` | blue answers a wait with its pulse loader; there is no second spinner |

**The vacancy title is blue's headline-4, held at one size.** Meridian set it at 34px, which blue's
scale has no counterpart for — one of the two token-map rows that needed a human call.

*Revised by `blue-fixes`.* It was `PageTitle`, and `PageTitle` is what blue titles an **app page**
with: 16px on a phone, 24px on a desktop, sized to sit under a navbar inside a 290px-railed shell.
This page has no shell and one thing on it, and its title is the largest type in the product — so
it is a plain `<h1>` at `--headline-4-*`, which is where `PageTitle` tops out anyway, without the
steps it takes to get there. There is nothing here for it to step with.

**The length is a neutral label, not a caption.** `Badge status="neutral"`
([§59](../design-system/ledger.md)) — it is a fact *about* the interview, and this is how the rest
of the product states a property of the thing above it.

**Required fields carry a trailing asterisk** ([§64](../design-system/ledger.md)): `First name*`,
`Last name*`, `Email*`, `CV*`. Always `aria-hidden` — the requirement itself reaches a reader
through the control's own `required`, and a label announced as "Email star" says it twice.

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
| **Slot · selected** | `Button pressed` ([§71](../design-system/ledger.md)) — the emphasis colour at 12% behind ink and a border in it, `aria-pressed="true"`. The same tint the Calendar paints its selected day with ([§72](../design-system/ledger.md)): one answer to "this is the one you picked" across both halves of the picker. It was `variant="primary"`, which made the chosen slot the same solid blue as `Book` — two solid blue buttons on one page, one of which submits |
| **Slot · focus** | blue's own button focus |
| **Field · error** | 1.5px `--status-error` border, `--shadow-error-glow`, the message `*`-prefixed beneath |
| **CV · empty** | a `Choose file` chooser, then `No file chosen` in `--text-secondary` — a row, not a field box ([§73](../design-system/ledger.md)) |
| **CV · attached** | the same chooser, then the filename in `--text-primary` (ellipsised at 260px), its weight in `--text-secondary`, and a 24px cross to drop it |
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
| **`FileInput`** | Nothing in blue accepts a file: prod uploads only an avatar, through a cropper of its own | `components/forms/FileInput.jsx` — §47, *designed*; repainted as a chooser row by [§73](../design-system/ledger.md) |
| **`Calendar`** | Blue's `DateField` is a 140px text field holding `"Mar 18, 2026"` | `components/data/Calendar.jsx` — §30, landed in Phase 4 |
| **`Preloader` at page scale** | Exists, and needs nothing — compose it, centred | No change; recorded so nobody adds a second loader |

`Calendar` is deliberately presentational: availability, the booking window, and the time zone are
business rules that belong to the API and the page, not to a design-system component.

**A clear control on `FileInput` was refused by §47 and added by [§73](../design-system/ledger.md).**
The refusal read: on this screen a CV is required, so clearing one only produces an invalid form
that re-choosing would fix anyway. True, and beside the point — somebody who has attached the wrong
document wants it gone before they choose again, and the alternative is re-choosing to overwrite a
name they can still see. It is the last thing in the row, after the name it removes. The **manage**
page still passes no `onClear`: there the chooser exists to *replace* a CV the API has no way to
remove, so a cross would offer an outcome the server has no verb for.

**The CV field is a row, not a field box.** §47 built it as `TextInput`'s sibling — a 44px bordered
box with the chooser inside it — so that a CV field in a column of text fields would sit at the
same height on the same baseline with the same ring. What that produced is a control that looks
like a field you can type in and is not one, beside three that take a caret. The chooser is a
`<label>` now, so the browser still opens the picker with nothing scripted; the input is still
focusable, still the labelled control, still the one tab stop, and the ring is still read off it
and painted on the chooser. The hint moves **into flow**: §4's pinned slot exists so an error never
moves a field, and this hint is permanent — the formats and the size cap are worth reading before a
file is chosen — so pinned, it simply overlapped the label beneath it.

## Reference mockup

To be produced as `02-booking-page.mock.html` — static, token-driven, every state on one page,
following the pattern of `specs/user-management/01-organization-creation.mock.html`. It is the
visual acceptance target for this screen.
