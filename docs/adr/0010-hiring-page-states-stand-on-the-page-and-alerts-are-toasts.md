# 0010 — Hiring's page states stand on the page, and its alerts are toasts

**Decided** 2026-09-03.

## The rule now

On every signed-in hiring screen — vacancies, the vacancy with its board, the candidate
database, the candidate card, the libraries — four things are true:

1. **The card is drawn only around content.** A list's `Card` appears with its rows; a first
   load's `Preloader` and every empty state stand on the page's own ground, centred, with no
   surface around them. This is the shape the candidate database already had for its empty
   state, and the shape Projects, Clients and Requests give theirs.
2. **Nothing is drawn while a refilter is in flight except the dimmed rows.** The candidate
   database's "Counting…" row — a small `Preloader` and a word, appearing above the table while
   a request ran — is gone. The rows dim (`Table busy`, decisions §34) and the scope tabs'
   counts move when the answer lands. `candidates-count` no longer exists.
3. **Every announcement is a toast** (decisions §54). That includes the candidate card's
   application-grain outcomes — a status moved, an interview rescheduled or cancelled — which
   were an `InfoBanner` under `PageHeader`, and every load failure, which was an `InfoBanner`
   with a retry in the flow.
4. **A failure that can be retried keeps its retry on the page after the toast has gone.** A
   failed load raises an error toast *and* draws an `EmptyState` carrying the retry where the
   content would have been (`LoadFailed`, one composition for the four screens). A failed
   autosave raises an error toast carrying `Retry` with `autoClose: 0`, so it stands until the
   retry, the ×, or another route to a saved field takes it down.

Three consequences the first pass missed and a stranger's reading of the specs caught
(`.workflow/refine/hiring-0{1,3,4}.verdict.json`):

- **The vacancies list and the vacancy screen had no failed-load state at all** — a non-OK
  response left them on the loader for ever. Rule 4 now holds there too: an error toast, and
  the retry standing where the list or the screen would be.
- **The candidate card's not-found sentence** was the one dead end still drawn inside a
  `Card`. It stands on the page's ground with the rest.
- **A failed autosave was spoken twice** — by the field's hidden live region and by the
  toast's `role="alert"` plate. The hidden region now speaks only the explicit save, which no
  toast reports; 04 §09.40 is settled the same way, and it no longer claims autosaves are
  announced.

Three things stay as they were, deliberately. A dialog's own form-level server error stays at
the top of the form inside the modal, and so does the reschedule dialog's availability failure
— its calendar and slot list are the dialog's own form, and they keep the banner-and-retry the
control specs give them. A control's field-level message stays beside the control: the
criteria picker's "Already assessed" note and a refused assessment's reason are the answer to
what was just typed into it, as a field's validation error is. And the public booking and
manage pages are untouched — they have no toast host, and a candidate filling a form needs the
error beside the form.

## What it replaced

Three positions the specs had argued for and the code implemented:

- **"One surface at every state"** (01 design, 06 design): the loader and the empty message
  rendered *inside* the list's card, under the table header, so the surface never changed
  shape. The candidate database had already departed from this for its empty state, on the
  argument that a card around a sentence is a bordered white slab the height of the viewport
  with one line of grey text near the top. The same argument holds for three dots.
- **"The count is the feedback"** (03 design): with the count line removed, the in-flight half
  of it survived as a "Counting…" row, on the argument that a filter change should be
  acknowledged before its rows arrive. It appeared above the table and moved the table on
  every filter change to say what the dimmed rows already said.
- **"Events announce and leave; states are drawn and stay"** (01 design, 05 design, 04
  design): a board or card that could not be read is a state standing in for the whole
  region, so its message stayed inline with the retry inside it, because a toast that timed
  out would leave a blank region with nothing saying why. And the card's application-grain
  outcome stayed in flow by grain — it reported a change to a record on the page.

The third argument was right about what has to stay and wrong about what it has to be. The
thing that must not leave is the *retry*, not the banner; an empty state carrying the retry
keeps it without a banner's cost. And the grain argument on the card lost to the one rule that
screen is built around: the layout never shifts while someone is typing. A banner under the
header pushed the interview notes down by its own height to say "Moved to Offer".

## What it costs

- **A refilter on the candidate database is acknowledged only by the dimmed rows.** The polite
  live-region announcement that went with the "Counting…" row is gone; `Table busy` sets
  `aria-busy` and nothing is spoken until the tab counts change.
- **A load failure says its sentence twice**, once on the toast and once in the empty state.
  The toast is for the moment, the state is for after it.
- **A standing error toast is a new thing for `ToastHost` to hold.** The host's per-entry
  `autoClose` override existed and was documented as "`0` leaves them standing", but the code
  passed `0` to `setTimeout` and dismissed the entry on the next tick. That is fixed in the
  component; no decision number, because the documented contract did not change.
- **Two spec statements that already disagreed were settled here.** 03 §05.20 asked for a count
  line ("128 candidates", "12 of 128") that 03 design and the code had removed; §05.20 now
  places the count in the scope tabs, which is what the code and the E2E suite do.

The specs amended, statement by statement: 01 (both), 03 (both), 04 (both), 05 (both), 06
(both) and 07 (design), each citing this record beside the statement it overrules.
