---
id: "07"
kind: design
title: Manage Booking — Design
pairs-with: 07-manage-booking.md
routes: ["/manage/{slug}/{token}"]
design-system: "1_DS for dev"
tags: [public, booking-layout, reschedule, cancel, destructive, modal, teammerly, light-only]
---

# 07 — Manage Booking · Design

Visual and interaction specification for `/manage/{slug}/{token}` and for the reschedule and cancel
affordances on the candidate card and My interviews. Pairs with
[07-manage-booking.md](07-manage-booking.md), which owns the rules, the API contract, and every
validation message.

**Design system:** Teammerly Original DS (blue), vendored at `1_DS for dev/`. Import from
`index.js` through the app's `@/ds` barrel; never hardcode a colour, size, or font.

**Theme:** light only.

**No new design-system component.** Every element on every screen in this spec composes from what
the vendored copy already exports — `BookingLayout`, `Card`, `PageTitle`, `Calendar`, `Button`,
`FormActions`, `FileInput`, `InfoBanner`, `Modal`, `Badge`, `Select`, `ToggleButton`, `TextArea`,
`Preloader`, `Table`. `BookingLayout` ([§46](../design-system/ledger.md)) and `FileInput`
([§47](../design-system/ledger.md)) arrive with [02](02-booking-page.design.md) and are consumed
here; nothing on this screen adds a number of its own. The DS gaps table at the end records that
deliberately, so nobody adds a fifth surface or a second confirmation pattern on the way through.

**Five Meridian components are gone from this spec** and were replaced rather than repainted (D4):
`SectionLabel` → `Card` titles, `Skeleton` → `Preloader`, `Toast` → a dismissible `InfoBanner`,
`Tooltip` → the badge's own accessible name, `Toggle` → `ToggleButton`. Each is worked through
where it appears below.

## Layout — the public page

The same `BookingLayout` shell as [02](02-booking-page.design.md): the `#f8fafc` well, one centred
column capped at **880px**, the organization's name above it. Same shell, same width, same header
block — a candidate arriving from their invite must recognise the page they booked on.

```
                       Acme Inc                       ← the organization's name, headline-4

              Senior React Engineer                   ← PageTitle, 16 → 20 → 24 by viewport
                    60 minutes                        ← 16px, --text-secondary

  ┌────────────────────────────────────────────────┐
  │  Your interview                                │  ← the Card's own title, an <h2>
  │                                                │
  │  Tuesday, 25 August 2026 at 14:00              │  ← headline-5, tabular-nums
  │  (UTC+03:00) Minsk                             │  ← 14px, --text-secondary
  │  ─────────────────────────────────────────     │  ← --border-subtle
  │  CV attached                      [ Replace ]  │  ← Button, blue's neutral
  │                                                │
  │  [ Reschedule ]           [ Cancel interview ] │  ← neutral · delete
  └────────────────────────────────────────────────┘
```

- Gap between regions `--space-6` (16px); the action row sits `--space-7` (20px) below the record.
- One `Card` ([§12](../design-system/ledger.md)) — `--surface-card`, a 1px `--border-default`
  hairline, `--radius-l`, **no shadow** — capped at **560px** and centred, narrower than the
  booking page's full column, because this screen has one short record to state and an 880px card
  holding four lines reads as a form with its fields missing.
- The action row is inside the Card, Reschedule leading and Cancel trailing, pushed to opposite
  ends: a destructive control adjacent to a benign one is a misclick waiting to happen.
- **The panel names nobody.** No candidate name, no email address, no CV filename — the link rides
  in a calendar event both parties hold and can forward onward ([07 §04.21](07-manage-booking.md)).
  What is left is the interview and the two actions on it, which is all its holder needs.
- **No primary action anywhere in the live state.** The page's default posture is that nothing needs
  to change, and a solid blue CTA would contradict it.
- Arriving **straight from a booking**, an `InfoBanner` (blue's default `info`) sits above the Card
  at the same 560px width — the same composition the cancelled and not-found states use. First view
  only; the flag is stripped from the URL on the first paint. `info` rather than `success`, because
  the record beneath is the celebration and this page is meant to read calm.

**"Your interview" is the `Card`'s own `title`, not a caption above it.** `SectionLabel` is gone
(D4), and Phase 3 settled the replacement for a caption over a whole surface: it becomes that
surface's title at `<h2>` ([§27](../design-system/ledger.md)), joining the outline under
`PageTitle`'s `<h1>`. It is sentence case now, not `YOUR INTERVIEW` — blue spends its one uppercase
treatment on `PageTabs`, which this page does not use.

## Layout — rescheduling

The Date and Time Cards are lifted from [02](02-booking-page.design.md) unchanged: same
`Calendar`, same slot `Button`s, same zone `Select` and format `ToggleButton` on the row beneath,
same `1fr 1fr` at ≥880px. They are one shared `SlotPicker`, not two copies — a second picker with
its own rules is how a page ends up offering a start time the server would reject.

```
              Senior React Engineer
       Currently Tuesday, 25 August at 14:00          ← 16px, --text-secondary

  ┌── Date ──────────────┐  ┌── Time ──────────────┐
  │  ‹  August 2026   ›  │  │  Thu 27 August 2026  │
  │  … Calendar …        │  │  ┌────┐ ┌────┐       │
  └──────────────────────┘  └──────────────────────┘
     🌐 (UTC+03:00) Minsk ▾           [24h│12h]

     [ Keep current time ]      [ Move interview ]    ← neutral · primary
```

- The current time is stated above the pickers and **never rendered as a selected date or slot**.
  Pre-selecting the time they came here to change would make the first click a deselection.
- The calendar opens on the month containing the current interview, with that date selected as the
  browsing position only — the slot list loads, but no slot carries `aria-pressed`.
- **Move interview** is the one primary action in this spec, and it is disabled until a slot is
  chosen.

## Layout — cancelled and not-found

Both states are the same composition, differing only in banner variant and wording.

```
              Senior React Engineer

  ┌────────────────────────────────────────────────┐
  │  ⚠  We couldn't find your booking.             │  ← InfoBanner
  └────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────┐
  │              [    New booking    ]             │  ← Card, primary
  └────────────────────────────────────────────────┘
```

- The banner sits **above** the Card, at the column's 560px width, `--space-6` between them.
- The Card holds nothing but the action, centred. It exists to give the button a surface rather
  than leaving it floating on the well.
- The wordmark and the vacancy title are always present, in both states. The slug resolves even when
  the token does not ([07 §04.20](07-manage-booking.md)), and a bare error on an unbranded page
  reads as a broken site rather than a dead link.

## Component map — public page

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Page shell | `BookingLayout` (§46) | `wordmark`, `wordmarkTestId` | `manage-page` |
| Organization | drawn by the shell | — | `manage-org-wordmark` |
| Vacancy title | `PageTitle` | — | `manage-vacancy-title` |
| Duration | native `<div>` | — | `manage-duration` |
| Booking panel | `Card` | `title="Your interview"` | — |
| When | native `<p>` | headline-5, tabular-nums | `manage-booking-when` |
| Zone | native `<span>` | — | `manage-booking-zone` |
| CV present | native `<p>` | — | `manage-cv-present` |
| Replace CV | `Button` | *(no variant — blue's neutral)* | `manage-cv-replace-button` |
| CV chooser | `FileInput` (§47) | `accept`, `hint`, `hintId`, `error`, `errorId`, `disabled` | `manage-cv-replace-input` |
| Reschedule | `Button` | *(no variant)* | `manage-reschedule-button` |
| Cancel | `Button` | `variant="delete"` | `manage-cancel-button` |
| Current time line | native `<p>` | — | `manage-current-time` |
| Date grid | `Calendar` (§30) | `month`, `weeks`, `availableDates`, `selected`, `minDate`, `maxDate`, `loading` | `calendar-control` |
| Slot entry | `Button` | `variant="primary"` when chosen, `aria-pressed` | `slot-option-{startUtc}` |
| Time zone | `Select` | `isSearchable`, `options`, `value` | `manage-timezone-select` |
| Time format | `ToggleButton` (§31) | `value1="24h"`, `value2="12h"` | `manage-timeformat-toggle` |
| Move interview | `Button` | `variant="primary"`, `preloader`, `disabled` | `manage-reschedule-submit` |
| Keep current time | `Button` | *(no variant)* | `manage-reschedule-cancel` |
| Cancel dialog | `Modal` | `title`, `initialFocusRef`, `style={{ width: 420 }}` | `manage-cancel-dialog` |
| Dialog actions | `FormActions` | `align="full"` | — |
| Confirm cancel | `Button` | `variant="delete"`, `preloader` | `manage-cancel-confirm` |
| Dismiss | `Button` | *(no variant)* | `manage-cancel-dismiss` |
| Just-booked notice | `InfoBanner` | *(default `info`)* | `manage-booked` |
| Just-moved notice | `InfoBanner` | *(default `info`)* | `manage-moved` |
| Cancelled notice | `InfoBanner` | *(default `info`)* | `manage-cancelled` |
| Not-found notice | `InfoBanner` | `variant="warning"` | `manage-not-found` |
| New booking | `Button` | `variant="primary"`, `as="a"` | `manage-new-booking-button` |
| Server error | `InfoBanner` | `variant="error"`, `role="alert"` | `manage-error-banner` |
| Loading | `Preloader` | — | `manage-loading` |
| Availability loading | `Preloader` | — | `calendar-loading` · `slot-list-loading` |
| Availability error | `InfoBanner` + retry `Button` | `variant="warning"` | `calendar-error` · `slot-list-error` |

`New booking` is `as="a"` pointing at `/book/{slug}` ([§38](../design-system/ledger.md)): it is a
navigation, and a real link keeps middle-click and copy-address working.

**Meridian's `ghost` and `secondary` arrive here as one control.** Blue has three buttons — a
default outlined neutral, `primary`, and `delete` — and both Meridian names meant *quiet*, so
Replace, Reschedule and Keep current time are all the neutral one. `danger` becomes `delete`, which
is the same red under blue's name for it. There is no `size`: blue's button is 44px everywhere, so
`sm` and `lg` have nothing to map onto, and the submit's 320px minimum is set by the page in
`globals.css` rather than by a variant.

**Loading is a `Preloader`, not a `Skeleton`.** The skeleton stood in for a card whose shape it
could not actually predict — one line or four, a CV row or none — and blue answers a wait with its
pulse loader rather than a guess at what is coming. The test id changes with it:
`manage-loading-skeleton` → `manage-loading`.

## Component map — team surfaces

| Screen element | DS component | Props | `data-testid` |
|---|---|---|---|
| Reschedule (card) | `Button` | *(no variant)* | `application-reschedule-{applicationId}` |
| Cancel (card) | `Button` | `variant="delete"` | `application-cancel-{applicationId}` |
| Reschedule dialog | `Modal` | `title`, `style={{ width: 720 }}` | `application-reschedule-dialog-{applicationId}` |
| Cancel dialog | `Modal` | `title`, `style={{ width: 520 }}` | `application-cancel-dialog-{applicationId}` |
| Reason | `TextArea` | `label`, `rows={3}`, `error`, `errorId`, `trailing` | `application-cancel-reason-{applicationId}` |
| Confirm cancel | `Button` | `variant="delete"`, `preloader` | `application-cancel-confirm-{applicationId}` |
| History summary | `Button` | *(no variant)*, `aria-expanded` | `application-history-toggle-{applicationId}` |
| History list | `Card` | `--surface-sunken` | `application-history-{applicationId}` |
| History entry | native `<li>` | — | `application-history-entry-{eventId}` |
| Cancelled mark (card) | `Badge` | `status="inactive"`, `aria-label` | `application-cancelled-{applicationId}` |
| Outcome | `InfoBanner` | `onDismiss` | `toast-interview-rescheduled` · `toast-interview-cancelled` |
| Reschedule (My interviews) | `Button` | *(no variant)* | `my-interview-reschedule-{applicationId}` |
| Cancel (My interviews) | `Button` | *(no variant)* | `my-interview-cancel-{applicationId}` |

The team's reschedule dialog is a **720px `Modal` holding the same `Calendar` and slot list** the
public page uses. One picker, one behaviour, two hosts — the team does not get a second date control
with different rules.

**Blue's `Modal` has no `actions` slot**, because prod's dialogs put their button row in the body.
`FormActions align="full"` is that row, and both cancel dialogs — the public one and the team's —
compose it the same way, which is the point: one confirmation pattern, not a second one.
`ConfirmDialog` is deliberately **not** used for either. Its accept button is blue's primary blue
even on a destructive confirmation ([§40](../design-system/ledger.md)), and these are the dialogs
where the irreversible action must not look like the safe one.

**The outcome `Toast` is an `InfoBanner`.** `Toast` is gone (D4) and Phase 3 settled the
replacement: a banner with a close control ([§24](../design-system/ledger.md)), because prod's
banners report a *state* and go away when the state does, while one standing in for a toast reports
an *event* that nothing later makes untrue. The two test ids are unchanged — they name the
announcement, not the component that carries it.

On **My interviews**, the two actions live in a trailing cell of the existing `Table` row, revealed
on row hover and on keyboard focus, and always present for the row's own focus order. Both are
blue's neutral button on both counts: a `delete` fill repeated down a table of interviews turns a
calm list into an alarm.

## Copy

Validation and error messages are **not** here — they belong to
[07-manage-booking.md](07-manage-booking.md) and must match its table exactly.

| Slot | Text |
|---|---|
| Just-booked notice | A calendar invite is on its way to the address you gave. |
| Just-moved notice | Your interview has been moved. An updated calendar invite is on its way. |
| Panel title | Your interview |
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
| Reason label · team | Reason (optional) |
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
| Outcome · rescheduled | Interview moved to {date} at {time} |
| Outcome · cancelled | Interview cancelled |

**Sentence case throughout.** Meridian's `UPPERCASE` micro-labels are gone with `SectionLabel` and
`Input`; blue's field label is 12px `--text-secondary` in sentence case, and the one uppercase
treatment blue has is `PageTabs`, which nothing in this spec uses. No exclamation marks, no emoji.
Times carry `tabular-nums`.

**"Keep it" rather than "Cancel"** on the dismiss control: a Cancel button inside a cancellation
dialog is genuinely ambiguous, and this is the one dialog in the product where getting it wrong is
irreversible.

## The cancelled badge

[05-board.design.md](05-board.design.md) specifies a `Badge status="inactive"` reading "Cancelled".
This spec makes it **name who cancelled**, because "the candidate withdrew" and "we called it off"
are different facts to a hiring manager scanning a column, and the data distinguishes them.

| Actor | Badge text | Accessible name |
|---|---|---|
| Candidate | Cancelled by candidate | Cancelled by {submittedName} on {date} |
| Member | Cancelled by {firstName} | Cancelled by {memberFullName} on {date} — {reason} |

- Still `Badge status="inactive"`, still on a card at `opacity: .65`, still never removed from its
  column.
- **First name only** on the badge. A board card is a glance.
- "Cancelled by candidate" rather than the candidate's own name: their name is already the card's
  title, and repeating it reads as a bug.

**The hover bubble is gone, and it was not replaced by native `title`.** `Tooltip` is gone (D4),
and this is the second of [reversal 2](../design-system/README.md)'s three sites. The full sentence
is the badge's **accessible name** (`aria-label`), which is where it always lived — the truncated
form is only what is drawn. Adding `title` on top would make the same sentence the badge's
*description* and have it announced twice. A pointer user loses nothing, because the candidate card
draws the fact in full a few rows below, in the scheduling history, with who gave the reason and
when.

## States

Every value is a token; nothing here is a literal.

| State | Treatment |
|---|---|
| **Live · at rest** | `Card`, no elevated action; both buttons at rest |
| **Cancel · rest** | `Button variant="delete"` — solid `--action-danger`, white ink |
| **Cancel · hover** | `filter: brightness(90%)`, which is blue's hover for a filled button |
| **Reschedule · rest** | `Button` default — `--surface-card`, 1.5px `--border-default`, `--action-neutral-text`; hover fades to `opacity: .6` |
| **Move interview · disabled** | blue's own disabled Button — `opacity: .6`, `cursor: not-allowed` |
| **Move interview · loading** | `Button preloader` — the spinner takes the icon slot, `aria-busy`, label "Moving" |
| **CV · replacing** | `FileInput` expands in place beneath the "CV attached" row; the row's Replace button is removed while it is open |
| **CV · uploading** | `FileInput disabled` — `opacity: .6`; the file is already on its way, so there is nothing to press |
| **CV · error** | 1.5px `--status-error`, `--shadow-error-glow`, the message `*`-prefixed beneath |
| **Dialog · open** | `Modal` — `--shadow-modal`, `--color-overlay-scrim`, focus trapped |
| **Dialog · destructive** | Confirm is `delete`; **focus opens on the dismiss control**, never on Confirm |
| **Just-booked notice** | `InfoBanner` default `info` — the info tint, above the Card, first view only. Not `success`: the page's posture is calm, and the record beneath is the celebration |
| **Just-moved notice** | Identical treatment, in the same slot, until the next reload or the next press of Reschedule. Never drawn beside the just-booked one — a move replaces it |
| **Cancelled notice** | `InfoBanner` default `info` |
| **Not-found notice** | `InfoBanner variant="warning"` |
| **Server error** | `InfoBanner variant="error"`, above the Card, values retained |
| **History · collapsed** | One neutral `Button` row, `▸` leading |
| **History · expanded** | `Card` on `--surface-sunken`, inset, newest first — a log recessed into the panel it belongs to, not a second white card floating inside a white one |
| **History · actor** | `--text-tertiary`; the timestamp `--text-secondary`, right-aligned, `tabular-nums` |
| **Past interview (team card)** | Both actions absent — not disabled |
| **Loading** | `Preloader`, centred in the column, `aria-hidden`, with "Loading your interview" in a polite region beside it — the dots carry no text of their own |

Note that blue paints `warning` with the **error** palette — that is prod's own treatment, measured,
and `error` is the same treatment under the name that says what it is
([§7](../design-system/ledger.md)). The not-found banner is therefore red rather than amber, which
is correct for it: a link that leads nowhere is a failure, not a caution.

**There is no press treatment**, and none of these bounce. Meridian dropped a "lip" and shifted the
control 1px on press; blue's buttons have neither.

## Interactions

- **On load** — the live state renders, or one of the two dead ends. Nothing is focused beyond the
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
  under the just-moved notice, and the polite region announces the move naming that time. Pressing
  Reschedule again clears the notice: it is a receipt for the move that has been made, not for the
  one being made. On `slot_taken` the slot leaves the list, the selection clears, and the banner
  explains; the booking on file is untouched.
- **Cancel** — opens the `Modal`. `Escape` and the dismiss control both close it with nothing
  written. Confirm replaces the whole page with the cancelled notice.
- **Replace** — opens the `FileInput` inline. Choosing a file uploads immediately; there is no
  second Save, because a chosen file with an unpressed button is a change the candidate believes
  they have made. The chooser has no clear control (§47) — it exists to *replace* a CV the API has
  no way to remove.
- **Changing the time zone** — refetches availability and re-renders both pickers. A selection that
  no longer exists clears, and the polite region says so.
- **Changing the time format** — re-renders slot labels only. Written to `localStorage` under the
  same key the booking page uses, so the candidate's choice follows them between the two screens.
- **Team reschedule** — opens the 720px `Modal`; success closes it, refreshes the section in place,
  and raises the outcome banner. The board is not navigated to and the card is not collapsed.
- **Team cancel** — the `Modal` carries the optional `TextArea`, whose character count sits in the
  label row ([§33](../design-system/ledger.md)) so it can change without moving the field beneath
  it. Success closes the dialog, marks the section cancelled, and raises the outcome banner.
- **History** — the summary row toggles the list. Expansion never scrolls the page: a member reading
  a card must not have the notes field move under their cursor.

## Responsive

| Width | Layout |
|---|---|
| ≥ 880px | Reschedule pickers `1fr 1fr`; booking Card capped at 560px, centred |
| 600–879px | Pickers stack; the action row keeps both buttons on one line |
| < 600px | Everything stacks; both actions go full width, **Cancel beneath Reschedule with `--space-5` between them**; the slot list caps at `60vh` and scrolls in its own region |
| < 600px, team | The reschedule `Modal` goes full-bleed; the card's two actions drop below the header row |

At the narrowest width the destructive action is the lower of the two and never adjacent to the
thumb's resting position. The page body never scrolls horizontally at any supported width.

These breakpoints are this spec's own and are unchanged by the move to blue — they belong to the
content, and this page does not render in `AppShell`, whose 1200px breakpoint has nothing to say
about it.

## Accessibility

- Both dialogs are real modals: `role="dialog"`, `aria-modal`, focus trapped, `Escape` closes, and
  focus returns to the invoking control on close. None of that was measured — prod's overlays are
  plain `<div>`s that close only by click — and all of it is [§8](../design-system/ledger.md),
  shared with `ConfirmDialog` through `useDialogFocus` since §40.
- **Focus opens on the dismissive control** in the cancel dialog, via `initialFocusRef`. The
  destructive action is never the initially focused element, and never what `Enter` reaches on
  arrival.
- The cancel dialog's body names the interview being cancelled — date, time, and for the team the
  candidate — so a screen-reader user is not asked to confirm a pronoun.
- Reschedule and Cancel are **removed** from the tree once `start` has passed, not disabled. A
  disabled control announced with no explanation is worse than a control that is simply not there.
- The history summary is a real `<button>` with `aria-expanded` and `aria-controls`; the expanded
  list is a `<ul>` whose entries read as "{new time}, moved from {old time}, by {actor}, {date}".
- The cancelled badge's accessible name is the full sentence, not the truncated first-name form —
  and it is the name rather than a `title`, so it is announced once.
- The CV chooser is **one tab stop** and carries its own name (`Replace CV`) even with no visible
  label, because the row above it is the only thing that says what it replaces.
- Success and failure of every action go to a polite live region; the error banner is `role="alert"`
  so the two are never announced twice.
- The `Calendar`, slot group, and `FileInput` carry their own contracts from
  [02](02-booking-page.design.md) and the control specs, unchanged.
- Contrast: `--action-primary-text` on `--action-primary`, and `--action-danger-text` on
  `--action-danger`, both clear AA.

## DS gaps

**None.** Every element here composes from the vendored copy, and that is worth stating rather than
leaving as an absence:

| Considered | Why no new component |
|---|---|
| A "destructive confirm" dialog | `Modal` + `FormActions` + a `delete` `Button` is the pattern, and it is the one the team's dialog already uses. `ConfirmDialog` is the wrong shell here: its accept button is primary blue even on a destructive confirmation (§40) |
| A "timeline" component | Four entry shapes over a `<ul>` inside a `Card` — the variance is content, not structure |
| A "dead end" page shell | `BookingLayout` + `InfoBanner` + `Card`. A fourth shell for two static screens would be one shell too many |
| A wide `Modal` for the team picker | `Modal` takes `style`; 720px is a width, not a variant |
| A `clear` on `FileInput` | Nothing here can remove a CV — the chooser replaces one. See §47 |

## Reference mockup

To be produced as `07-manage-booking.mock.html` — static, token-driven, all four public states —
live, rescheduling, just cancelled, not found — plus both of the live state's notices, just booked
and just moved, and both team dialogs on one page, following `02-booking-page.mock.html`. It is the
visual acceptance target for this screen.
