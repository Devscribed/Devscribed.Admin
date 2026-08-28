---
id: "02"
kind: design
title: Booking Page — Design
pairs-with: 02-booking-page.md
routes: ["/book/{slug}"]
design-system: "1_DS for dev"
tags: [public, booking-layout, calendar, slots, file-upload, meridian, light-only]
---

# 02 — Booking Page · Design

Visual and interaction specification for `/book/{slug}`, the product's only public screen. Pairs
with [02-booking-page.md](02-booking-page.md), which owns the rules, the API contract, and every
validation message. This file owns what a developer would otherwise invent: which component to
reach for, which token drives which state, and the on-screen wording.

**Design system:** Teammerly Meridian, `1_DS for dev/`. Import from `1_DS for dev/index.js`; never
hardcode a colour, size, or font.

**Theme:** light only, matching the rest of the release.

**This screen renders in neither `AppShell` nor `AuthLayout`.** It needs a third shell — see
[BookingLayout](#ds-gaps).

## Layout

`BookingLayout` is a paper field with one centred column, capped at **880px** — wide enough for the
calendar and slot list side by side, where `AuthLayout`'s 480px card is not.

```
                    Teammerly●                      ← text wordmark, no logo

              Senior React Engineer                 ← Grotesk 34, --text
                    60 minutes                      ← Grotesk 15, --text-muted
      We're looking for an engineer who…            ← Plex 15, --text-sub, 66ch

  ┌──────────────────────┐  ┌──────────────────────┐
  │  DATE                │  │  TIME                │  ← two Cards, 1fr 1fr
  │  ‹  August 2026   ›  │  │  Tue 25 August 2026  │
  │  M  T  W  T  F  S  S │  │  ┌────┐ ┌────┐       │
  │  … date grid …       │  │  │09:00││10:00│      │
  └──────────────────────┘  └──────────────────────┘
     🌐 (UTC+03:00) Minsk ▾            [24h│12h]    ← zone Select + Toggle

  ┌────────────────────────────────────────────────┐
  │  YOUR DETAILS                                  │  ← one Card
  │  FIRST NAME            LAST NAME               │  ← two columns
  │  EMAIL                                         │
  │  CV                                            │
  │  ANYTHING WE SHOULD KNOW?                      │
  └────────────────────────────────────────────────┘

              [          Book          ]            ← primary, lg, 320px
```

- Page padding `--sp-16` top, `--sp-10` sides; gap between regions `--sp-12`.
- Header block is centred; the two Cards and the form Card are full width of the column.
- The zone selector and format toggle sit on one row directly under the two Cards, zone leading and
  toggle trailing.
- Cards: `--radius-2xl`, 1px `--border`, `--shadow-card`, `--bg-panel`, on the `--bg` paper field.

## Component map

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page shell | **`BookingLayout`** (new) | `wordmark`, `children` | `booking-page` |
| Vacancy title | native `<h1>` | — | `booking-vacancy-title` |
| Duration | `SectionLabel` | — | `booking-duration` |
| Description | native `<p>` | — | `booking-description` |
| Date panel | `Card` | `title="Date"` | — |
| Date grid | **`Calendar`** (new) | `month`, `availableDates`, `selected`, `onSelect`, `minDate`, `maxDate` | `calendar-control` |
| Month nav | `IconButton` | `label`, `disabled` | `calendar-prev-month` · `calendar-next-month` |
| Time panel | `Card` | `title="Time"` | — |
| Slot entry | `Button` | `variant="secondary"`, `aria-pressed` | `slot-option-{startUtc}` |
| Time zone | `Select` | `options`, `value`, `onChange` | `booking-timezone-select` |
| Time format | `Toggle` | `options={['24h','12h']}` | `booking-timeformat-toggle` |
| Form section label | `SectionLabel` | — | — |
| First / last / email | `Input` | `label`, `placeholder`, `error`, `type` | `booking-first-name-input` … |
| CV | **`FileInput`** (new) | `label`, `accept`, `maxBytes`, `error` | `booking-cv-input` |
| Note | **`Textarea`** (new) | `label`, `rows`, `error` | `booking-note-input` |
| Submit | `Button` | `variant="primary"`, `size="lg"`, `loading`, `disabled` | `booking-submit-button` |
| Server error | `InfoBanner` | `tone="error"` | `booking-error-banner` |
| Availability error | `InfoBanner` | `tone="warning"` + retry `Button` | `calendar-error` · `slot-list-error` |
| Loading | `Spinner` | — | `calendar-loading` · `slot-list-loading` |
| Closed / not found | `Card` | — | `booking-closed-message` · `booking-not-found` |

Inline field errors come from `Input`'s own `error` prop; the message node carries
`field-error-{fieldName}`, matching the convention established in spec 01 of user-management.

## Copy

Validation messages are **not** here — they belong to
[02-booking-page.md](02-booking-page.md) and must match its table exactly.

| Slot | Text |
|---|---|
| Date panel title | Date |
| Time panel title | Time |
| Slot list header | {Weekday} {D} {Month} {YYYY} |
| Time zone prefix | All times in |
| Form section label | YOUR DETAILS |
| Micro-label · first name | FIRST NAME |
| Micro-label · last name | LAST NAME |
| Micro-label · email | EMAIL |
| Micro-label · CV | CV |
| Micro-label · note | ANYTHING WE SHOULD KNOW? |
| Placeholder · first name | Jane |
| Placeholder · last name | Doe |
| Placeholder · email | you@example.com |
| Placeholder · note | Optional |
| Hint · CV | PDF, DOC, DOCX, RTF or TXT. Up to 10 MB. |
| File chooser | Choose file |
| Submit | Book |
| Submit, in flight | Booking |
| Slot list empty | No times available on this date — please pick another. |
| Window empty | No times are available in the next month. |
| Availability retry | Try again |
| Closed | This position is no longer accepting applications. |
| Not found | This link doesn't lead anywhere. |

Voice: sentence case in prose, `UPPERCASE` + `--ls-wider` for micro-labels, no exclamation marks,
no emoji. Times are Grotesk with `tabular-nums` so a column of slots aligns.

## States

Every value is a token; nothing here is a literal.

| State | Treatment |
|---|---|
| **Date · available** | `--bg-panel`, `--text`; hover `--hover-bg-tint`; cursor pointer |
| **Date · unavailable** | `--text-faint`, no border, `aria-disabled`, not focusable, no hover |
| **Date · past** | as unavailable |
| **Date · today** | 1.5px `--accent-border` ring, retained when selected |
| **Date · selected** | `--accent-soft` field, `--accent` ink, 1.5px `--accent-border` |
| **Date · focus** | `--shadow-glow-accent` |
| **Slot · available** | `Button secondary` — `--bg-field`, 1.5px `--border-strong` |
| **Slot · selected** | `--accent-soft`, `--accent` ink, `--accent-border`, `aria-pressed="true"` |
| **Slot · focus** | `--shadow-glow-accent` |
| **Field · error** | `Input error` — `--error-500` border, label, message; focus ring swaps to `--shadow-glow-error` |
| **CV · attached** | filename in `--text`, a clear `IconButton` trailing |
| **Submit · disabled** | `--bg-sunken` field, `--text-faint` ink, no lip, `cursor: not-allowed` |
| **Submit · loading** | `Button loading` — spinner leads, lip drops, click blocked, label "Booking" |
| **Availability · loading** | grid and list non-interactive at `opacity: .55` with a centred `Spinner` |
| **Availability · error** | `InfoBanner tone="warning"` replacing the grid or list, with a retry `Button secondary` |

Press on the submit: `translateY(1px)`, lip shrinks to `--lip-accent-press`. Transitions run at
`--duration-base` on `--easing-standard`. Nothing bounces.

## Interactions

- **On load** — the first available date is selected and its slots load. No slot is selected.
  Submit is disabled.
- **Selecting a date** — replaces the selection, reloads the slot list, clears any slot selection.
  The visible month does not change.
- **Selecting a slot** — single selection, `aria-pressed` toggles, announced politely.
- **Changing the time zone** — refetches availability and re-renders both panels. If the selected
  slot no longer exists, the selection clears and the polite region says so.
- **Changing the time format** — re-renders slot labels only; nothing refetches, nothing is
  deselected, and the choice is written to `localStorage` under one key scoped to this page.
- **Blur on a field** — validates that field. Valid clears the error.
- **Submit** — re-runs every validation; the button is disabled while anything is missing, so an
  invalid submit is not reachable. On a server error the banner appears above the form Card and the
  values are retained.
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

The date grid keeps seven columns at every width — columns resize, never reflow. The page body
never scrolls horizontally.

## Accessibility

- The date grid is a `role="grid"` with `role="row"` / `role="gridcell"`, arrow-key roving focus,
  and disabled dates removed from the tab order entirely.
- Slot entries form a single-selection group; each carries an accessible name of its start time
  **in the current format** plus the active zone.
- Every field has a real `<label>`; the uppercase micro-label is that label, not decoration.
- A field in error carries `aria-invalid="true"` and `aria-describedby` pointing at
  `field-error-{fieldName}`.
- The CV hint is referenced by `aria-describedby` so the constraints are announced before a file is
  chosen — not after it is rejected.
- The error banner is `role="alert"`; availability and selection changes go to a separate
  `aria-live="polite"` region so a rejected booking is not announced twice.
- The submit carries `aria-busy` while loading.
- Colour is never the only signal: an unavailable date is announced as disabled, a selected slot
  through `aria-pressed`.
- Contrast: `--text` on `--bg-panel` and `--on-accent` on `--accent` both clear AA. `--text-faint`
  is used only for disabled dates, which carry their state in the accessibility tree as well.

## DS gaps

Nothing on this screen may be improvised locally — each of these is added to `1_DS for dev/`.

| Gap | Why the existing bundle cannot cover it | Resolution |
|---|---|---|
| **`BookingLayout`** | `AuthLayout` is one 480px card for a login form; this screen needs a wide public shell with no card | `components/surfaces/BookingLayout.jsx` |
| **`Calendar`** | No date grid of any kind exists in Meridian | `components/data/Calendar.jsx` — presentational only, takes available dates and bounds, owns no fetching |
| **`Textarea`** | `Input` extends `InputHTMLAttributes<HTMLInputElement>` — single-line by construction | `components/forms/Textarea.jsx`, matching `Input`'s label/hint/error contract |
| **`FileInput`** | Nothing in the bundle accepts a file | `components/forms/FileInput.jsx` — chooser, filename, clear, and the same error treatment |
| **`Spinner` at page scale** | Exists, but this screen needs it centred inside a panel | No change — compose it; recorded so nobody adds a second spinner |

`Calendar` is deliberately presentational: availability, the booking window, and the time zone are
business rules that belong to the API and the page, not to a design-system component.

## Reference mockup

To be produced as `02-booking-page.mock.html` — static, token-driven, every state on one page,
following the pattern of `specs/user-management/01-organization-creation.mock.html`. It is the
visual acceptance target for this screen.
