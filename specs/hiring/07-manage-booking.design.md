---
id: "07"
kind: design
title: Manage Booking — Design
pairs-with: 07-manage-booking.md
routes: ["/manage/{slug}/{token}"]
design-system: "1_DS for dev"
tags: [public, booking-layout, reschedule, cancel, destructive, modal, meridian, light-only]
---

# 07 — Manage Booking · Design

Visual and interaction specification for `/manage/{slug}/{token}` and for the reschedule and cancel
affordances on the candidate card and My interviews. Pairs with
[07-manage-booking.md](07-manage-booking.md), which owns the rules, the API contract, and every
validation message.

**Design system:** Teammerly Meridian, `1_DS for dev/`. Import from `1_DS for dev/index.js`; never
hardcode a colour, size, or font.

**Theme:** light only, matching the rest of the release.

**No new design-system component.** Every element on every screen in this spec is composed from
what `1_DS for dev/index.js` already exports — `BookingLayout`, `Card`, `Calendar`, `Button`,
`FileInput`, `InfoBanner`, `Modal`, `Badge`, `Select`, `Toggle`, `Textarea`, `SectionLabel`,
`Spinner`, `Skeleton`, `Tooltip`. The DS gaps table at the end records this deliberately, so nobody
adds a fifth surface or a second confirmation pattern on the way through.

## Layout — the public page

The same `BookingLayout` shell as [02](02-booking-page.design.md): one centred column capped at
**880px** on the paper field, wordmark above. Same shell, same width, same header block — a
candidate arriving from their invite must recognise the page they booked on.

```
                    Teammerly●                      ← text wordmark, no logo

              Senior React Engineer                 ← Grotesk 34, --text
                    60 minutes                      ← Grotesk 15, --text-muted

  ┌────────────────────────────────────────────────┐
  │  YOUR INTERVIEW                                │  ← SectionLabel
  │                                                │
  │  Tuesday, 25 August 2026 at 14:00              │  ← Grotesk 22, tabular-nums
  │  (UTC+03:00) Minsk                             │  ← Plex 14, --text-muted
  │  ─────────────────────────────────────────     │  ← --divider
  │  CV attached                      [ Replace ]  │  ← Button ghost sm
  │                                                │
  │  [ Reschedule ]           [ Cancel interview ] │  ← secondary · danger
  └────────────────────────────────────────────────┘
```

- Page padding `--sp-16` top, `--sp-10` sides; gap between regions `--sp-12`.
- One Card, `--radius-2xl`, 1px `--border`, `--shadow-card`, `--bg-panel`, capped at **560px** and
  centred — narrower than the booking page's full column, because this screen has one short record
  to state, and a 880px card holding four lines reads as a form with its fields missing.
- The action row sits inside the Card, separated by `--sp-8`, Reschedule leading and Cancel
  trailing. They are pushed to opposite ends: a destructive control adjacent to a benign one is a
  misclick waiting to happen.
- **The panel names nobody.** No candidate name, no email address, no CV filename — the link rides
  in a calendar event both parties hold and can forward onward ([07 §04.21](07-manage-booking.md)).
  What is left is the interview and the two actions on it, which is all its holder needs.
- **No primary action anywhere in the live state.** The page's default posture is that nothing needs
  to change, and a violet CTA would contradict it.
- Arriving **straight from a booking**, an `InfoBanner tone="info"` sits above the Card at the same
  560px width with `--sp-8` between them — the same composition the cancelled and not-found states
  use. First view only; the flag is stripped from the URL on the first paint. `info` rather than
  `success`, because the record beneath is the celebration and this page is meant to read calm.

## Layout — rescheduling

The Date and Time Cards are lifted from [02](02-booking-page.design.md) unchanged: same
`Calendar`, same slot `Button`s, same zone `Select` and format `Toggle` on the row beneath, same
`1fr 1fr` at ≥880px.

```
              Senior React Engineer
       Currently Tuesday, 25 August at 14:00        ← Plex 15, --text-muted

  ┌── DATE ──────────────┐  ┌── TIME ──────────────┐
  │  ‹  August 2026   ›  │  │  Thu 27 August 2026  │
  │  … Calendar …        │  │  ┌────┐ ┌────┐       │
  └──────────────────────┘  └──────────────────────┘
     🌐 (UTC+03:00) Minsk ▾           [24h│12h]

     [ Keep current time ]      [ Move interview ]  ← ghost · primary
```

- The current time is stated above the pickers and **never rendered as a selected date or slot**.
  Pre-selecting the time they came here to change would make the first click a deselection.
- The calendar opens on the month containing the current interview, with that date selected as the
  browsing position only — the slot list loads, but no slot carries `aria-pressed`.
- **Move interview** is the one primary action in this spec, and it is disabled until a slot is
  chosen.

## Layout — cancelled and not-found

Both states are the same composition, differing only in banner tone and wording.

```
              Senior React Engineer

  ┌────────────────────────────────────────────────┐
  │  ⚠  We couldn't find your booking.             │  ← InfoBanner
  └────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────┐
  │              [    New booking    ]             │  ← Card, primary lg
  └────────────────────────────────────────────────┘
```

- The banner sits **above** the Card, at the column's 560px width, `--sp-8` between them.
- The Card holds nothing but the action, centred, `--sp-10` padding. It exists to give the button a
  surface rather than leaving it floating on the paper field.
- The wordmark and the vacancy title are always present, in both states. The slug resolves even when
  the token does not ([07 §04.20](07-manage-booking.md)), and a bare error on an unbranded page
  reads as a broken site rather than a dead link.

## Component map — public page

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page shell | `BookingLayout` | `wordmark` | `manage-page` |
| Vacancy title | native `<h1>` | — | `manage-vacancy-title` |
| Duration | `SectionLabel` | — | `manage-duration` |
| Booking panel | `Card` | — | — |
| Panel label | `SectionLabel` | — | — |
| When | native `<p>` | — | `manage-booking-when` |
| Zone | native `<span>` | — | `manage-booking-zone` |
| CV present | native `<p>` | — | `manage-cv-present` |
| Replace CV | `Button` | `variant="ghost"`, `size="sm"` | `manage-cv-replace-button` |
| CV chooser | `FileInput` | `accept`, `hint`, `error`, `fileName` | `manage-cv-replace-input` |
| Reschedule | `Button` | `variant="secondary"` | `manage-reschedule-button` |
| Cancel | `Button` | `variant="danger"` | `manage-cancel-button` |
| Current time line | native `<p>` | — | `manage-current-time` |
| Date grid | `Calendar` | `month`, `weeks`, `availableDates`, `selected`, `minDate`, `maxDate`, `loading` | `calendar-control` |
| Slot entry | `Button` | `variant="secondary"`, `aria-pressed` | `slot-option-{startUtc}` |
| Time zone | `Select` | `options`, `value` | `manage-timezone-select` |
| Time format | `Toggle` | `options={['24h','12h']}` | `manage-timeformat-toggle` |
| Move interview | `Button` | `variant="primary"`, `loading`, `disabled` | `manage-reschedule-submit` |
| Keep current time | `Button` | `variant="ghost"` | `manage-reschedule-cancel` |
| Cancel dialog | `Modal` | `title`, `actions`, `width={420}` | `manage-cancel-dialog` |
| Confirm cancel | `Button` | `variant="danger"`, `loading` | `manage-cancel-confirm` |
| Dismiss | `Button` | `variant="ghost"` | `manage-cancel-dismiss` |
| Just-booked notice | `InfoBanner` | `tone="info"` | `manage-booked` |
| Cancelled notice | `InfoBanner` | `tone="info"` | `manage-cancelled` |
| Not-found notice | `InfoBanner` | `tone="warning"` | `manage-not-found` |
| New booking | `Button` | `variant="primary"`, `size="lg"`, `as="a"` | `manage-new-booking-button` |
| Server error | `InfoBanner` | `tone="error"` | `manage-error-banner` |
| Loading | `Skeleton` | `rows`, `height` | `manage-loading-skeleton` |
| Availability loading | `Spinner` | — | `calendar-loading` · `slot-list-loading` |
| Availability error | `InfoBanner` + retry `Button` | `tone="warning"` | `calendar-error` · `slot-list-error` |

`New booking` is `as="a"` pointing at `/book/{slug}`: it is a navigation, and a real link keeps
middle-click and copy-address working.

## Component map — team surfaces

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Reschedule (card) | `Button` | `variant="secondary"`, `size="sm"` | `application-reschedule-{applicationId}` |
| Cancel (card) | `Button` | `variant="danger"`, `size="sm"` | `application-cancel-{applicationId}` |
| Reschedule dialog | `Modal` | `title`, `width={720}` | `application-reschedule-dialog-{applicationId}` |
| Cancel dialog | `Modal` | `title`, `width={420}` | `application-cancel-dialog-{applicationId}` |
| Reason | `Textarea` | `label`, `rows={3}`, `error` | `application-cancel-reason-{applicationId}` |
| Confirm cancel | `Button` | `variant="danger"`, `loading` | `application-cancel-confirm-{applicationId}` |
| History summary | `Button` | `variant="ghost"`, `size="sm"`, `aria-expanded` | `application-history-toggle-{applicationId}` |
| History list | `Card` | `--bg-panel-2` | `application-history-{applicationId}` |
| History entry | native `<li>` | — | `application-history-entry-{eventId}` |
| Cancelled mark (card) | `Badge` | `tone="inactive"` | `application-cancelled-{applicationId}` |
| Outcome | `Toast` | `tone` | `toast-interview-rescheduled` · `toast-interview-cancelled` |
| Reschedule (My interviews) | `Button` | `variant="ghost"`, `size="sm"` | `my-interview-reschedule-{applicationId}` |
| Cancel (My interviews) | `Button` | `variant="ghost"`, `size="sm"` | `my-interview-cancel-{applicationId}` |

The team's reschedule dialog is a **720px `Modal` holding the same `Calendar` and slot list** the
public page uses. One picker, one behaviour, two hosts — the team does not get a second date control
with different rules.

On **My interviews**, the two actions live in a trailing cell of the existing `Table` row, revealed
on row hover and on keyboard focus, and always present for the row's own focus order. They are
`ghost` on both counts: a `danger` fill repeated down a table of interviews turns a calm list into
an alarm.

## Copy

Validation and error messages are **not** here — they belong to
[07-manage-booking.md](07-manage-booking.md) and must match its table exactly.

| Slot | Text |
|---|---|
| Just-booked notice | A calendar invite is on its way to the address you gave. |
| Panel label | YOUR INTERVIEW |
| Reschedule action | Reschedule |
| Cancel action · candidate | Cancel interview |
| Cancel action · team | Cancel |
| Replace CV | Replace |
| Hint · CV | PDF, DOC, DOCX, RTF or TXT. Up to 10 MB. |
| Current time prefix | Currently |
| Reschedule submit | Move interview |
| Reschedule submit, in flight | Moving |
| Reschedule dismiss | Keep current time |
| Cancel dialog title | Cancel this interview? |
| Cancel dialog confirm | Cancel interview |
| Cancel dialog dismiss | Keep it |
| Reason micro-label · team | REASON (OPTIONAL) |
| Reason placeholder | Shared with the candidate in the cancellation notice |
| New booking | New booking |
| History summary · none | Booked {date} |
| History summary · one | Rescheduled once · booked {date} |
| History summary · many | Rescheduled {n} times · booked {date} |
| History section label | Scheduling history |
| History entry · booked | Booked {time} |
| History entry · rescheduled | {newTime} ← {oldTime} |
| History entry · cancelled | Cancelled |
| History entry · CV | CV replaced · {fileName} |
| History actor · candidate | {submittedName} |
| History actor · member | {memberFullName} |
| Toast · rescheduled | Interview moved to {date} at {time} |
| Toast · cancelled | Interview cancelled |

Voice matches [02](02-booking-page.design.md): sentence case in prose, `UPPERCASE` with
`--ls-wider` for micro-labels, no exclamation marks, no emoji. Times are Grotesk with
`tabular-nums`.

**"Keep it" rather than "Cancel"** on the dismiss control: a Cancel button inside a cancellation
dialog is genuinely ambiguous, and this is the one dialog in the product where getting it wrong is
irreversible.

## The cancelled badge

[05-board.design.md](05-board.design.md) specifies a `Badge tone="inactive"` reading "Cancelled".
This spec makes it **name who cancelled**, because "the candidate withdrew" and "we called it off"
are different facts to a hiring manager scanning a column, and the data now distinguishes them.

| Actor | Badge text | Tooltip |
|---|---|---|
| Candidate | Cancelled by candidate | Cancelled by {submittedName} on {date} |
| Member | Cancelled by {firstName} | Cancelled by {memberFullName} on {date} — {reason} |

- Still `Badge tone="inactive"`, still on a card at `opacity: .65`, still never removed from its
  column.
- **First name only** on the badge. A board card is a glance; the `Tooltip` carries the full name,
  the date, and the reason when one was given.
- "Cancelled by candidate" rather than the candidate's own name: their name is already the card's
  title, and repeating it reads as a bug.

## States

Every value is a token; nothing here is a literal.

| State | Treatment |
|---|---|
| **Live · at rest** | `Card --bg-panel`, no elevated action; both buttons at rest |
| **Cancel · rest** | `Button danger` — `--error-500` field, `--lip-error` |
| **Cancel · press** | `translateY(1px)`, lip to 1px |
| **Reschedule · rest** | `Button secondary` — `--bg-field`, 1.5px `--border-strong` |
| **Move interview · disabled** | `--bg-sunken` field, `--text-faint`, no lip, `cursor: not-allowed` |
| **Move interview · loading** | `Button loading` — spinner leads, lip drops, label "Moving" |
| **CV · replacing** | `FileInput` expands in place beneath the "CV attached" row; the row's Replace button hides while it is open |
| **CV · error** | `FileInput error` — `--error-500` border, message beneath, focus ring `--shadow-glow-error` |
| **Dialog · open** | `Modal` — `--shadow-modal`, ink-tinted scrim, focus trapped |
| **Dialog · destructive** | Confirm is `danger`; **focus opens on the dismiss control**, never on Confirm |
| **Just-booked notice** | `InfoBanner tone="info"`, above the Card, first view only. Not `success`: the page's posture is calm, and the record beneath is the celebration |
| **Cancelled notice** | `InfoBanner tone="info"` |
| **Not-found notice** | `InfoBanner tone="warning"` |
| **Server error** | `InfoBanner tone="error"`, above the Card, values retained |
| **History · collapsed** | One `ghost` `Button` row, `--text-muted`, `▸` leading |
| **History · expanded** | `Card --bg-panel-2` inset, `--sp-4` row rhythm, newest first |
| **History · actor** | `--text-sub`; the timestamp `--text-faint`, right-aligned, `tabular-nums` |
| **Past interview (team card)** | Both actions absent — not disabled |
| **Loading** | `Skeleton rows={3}` inside the Card outline |

Transitions run at `--duration-base` on `--easing-standard`. Nothing bounces.

## Interactions

- **On load** — the live state renders, or one of the two notices. Nothing is focused beyond the
  document.
- **Arriving from a booking** — the live state renders with the just-booked notice above it, and the
  polite region announces it, because a navigation announces nothing on its own. The `?booked=1`
  flag is stripped from the address bar on the first paint, so the URL left in history is the one
  the invite carries; reloading shows the record without the notice.
- **Reschedule** — replaces the booking Card in place with the two picker Cards. The URL does not
  change. Pressing **Keep current time** restores the booking Card with nothing altered.
- **Selecting a slot** — enables Move interview. No dialog follows: choosing the time *is* the
  confirmation ([07 §05.26](07-manage-booking.md)).
- **Move interview** — on success the pickers are replaced by the booking Card showing the new time,
  and the polite region announces it. On `slot_taken` the slot leaves the list, the selection
  clears, and the banner explains; the booking on file is untouched.
- **Cancel** — opens the `Modal`. `Escape` and the dismiss control both close it with nothing
  written. Confirm replaces the whole page with the cancelled notice.
- **Replace** — opens the `FileInput` inline. Choosing a file uploads immediately; there is no
  second Save, because a chosen file with an unpressed button is a change the candidate believes
  they have made.
- **Changing the time zone** — refetches availability and re-renders both pickers. A selection that
  no longer exists clears, and the polite region says so.
- **Changing the time format** — re-renders slot labels only. Written to `localStorage` under the
  same key the booking page uses, so the candidate's choice follows them between the two screens.
- **Team reschedule** — opens the 720px `Modal`; success closes it, refreshes the section in place,
  and raises the `Toast`. The board is not navigated to and the card is not collapsed.
- **Team cancel** — the `Modal` carries the optional `Textarea`. Success closes it, marks the
  section cancelled, and raises the `Toast`.
- **History** — the summary row toggles the list. Expansion never scrolls the page: a member reading
  a card must not have the notes field move under their cursor.

## Responsive

| Width | Layout |
|---|---|
| ≥ 880px | Reschedule pickers `1fr 1fr`; booking Card capped at 560px, centred |
| 600–879px | Pickers stack; the action row keeps both buttons on one line |
| < 600px | Everything stacks; both actions go full width, **Cancel beneath Reschedule with `--sp-6` between them**; the slot list caps at `60vh` and scrolls in its own region |
| < 600px, team | The reschedule `Modal` goes full-bleed; the card's two actions drop below the header row |

At the narrowest width the destructive action is the lower of the two and never adjacent to the
thumb's resting position. The page body never scrolls horizontally at any supported width.

## Accessibility

- Both dialogs are real modals: `role="dialog"`, `aria-modal`, focus trapped, `Escape` closes, and
  focus returns to the invoking control on close.
- **Focus opens on the dismissive control** in the cancel dialog. The destructive action is never
  the initially focused element, and it is never reachable by pressing `Enter` on arrival.
- The cancel dialog's body names the interview being cancelled — date, time, and for the team the
  candidate — so a screen-reader user is not asked to confirm a pronoun.
- Reschedule and Cancel are **removed** from the tree once `start` has passed, not disabled. A
  disabled control announced with no explanation is worse than a control that is simply not there.
- The history summary is a real `<button>` with `aria-expanded` and `aria-controls`; the expanded
  list is a `<ul>` whose entries read as "{new time}, moved from {old time}, by {actor}, {date}".
- The cancelled badge's accessible name is the full tooltip text, not the truncated first-name form.
- Success and failure of every action go to a polite live region; the error banner is `role="alert"`
  so the two are never announced twice.
- The `Calendar`, slot group, and `FileInput` carry their own contracts from
  [02](02-booking-page.design.md) and the control specs, unchanged.
- Contrast: `--on-accent` on `--accent`, and white on `--error-500` for the danger button, both
  clear AA. `--text-faint` is used only for history timestamps, which carry their meaning in the
  entry's text as well.

## DS gaps

**None.** Every element here composes from the existing bundle, and that is worth stating rather
than leaving as an absence:

| Considered | Why no new component |
|---|---|
| A "destructive confirm" dialog | `Modal` plus a `danger` `Button` in `actions` is the pattern; a second dialog component would fork focus behaviour |
| A "timeline" component | Four entry shapes over a `<ul>` inside a `Card` — the variance is content, not structure |
| A "dead end" page shell | `BookingLayout` + `InfoBanner` + `Card`. A fourth shell for two static screens would be one shell too many |
| A wide `Modal` for the team picker | `Modal` already takes `width`; 720px is a prop, not a variant |

## Reference mockup

To be produced as `07-manage-booking.mock.html` — static, token-driven, all four public states —
live, rescheduling, just cancelled, not found — plus the live state's just-booked notice and both
team dialogs on one page, following `02-booking-page.mock.html`. It is the visual acceptance
target for this screen.
