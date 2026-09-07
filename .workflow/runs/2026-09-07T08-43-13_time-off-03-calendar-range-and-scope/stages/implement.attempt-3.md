# implement — attempt 3

Spec: `specs/time-off/03-calendar-range-and-scope.md` (+ contracts, cases)
Branch: `spec/calendar-range-and-scope` · commit `6bcd903` (attempt 1 `57fa8f5`, attempt 2 `c776d16`)

## The finding

**REQ-03-018 / time-off/01 contracts §Screens — "the day columns divide what is left"**
(`apps/web/app/globals.css#.time-off-calendar-grid`) — `min-width: max-content` is not the sum
of the column floors.

**Fixed.** The finding is correct, and it is worse in fact than in the witness: the measured
column width is **87.53px**, not ~60px, so a 30-day month wants ~2890px inside a ~950px area and
the reader sees roughly a third of it.

### Reproduced first

I wrote the assertion before touching the CSS and ran it against attempt 2's commit, in the
state the witness names — a `countryCode: null` holiday called `Company Day` in the month the
screen opens on, at 1280×900:

```
Expected: 32
Received: 87.53125
  818 |     for (const width of await headerWidths()) expect(width).toBeCloseTo(floor, 0);
```

### The cause, and what changed

`max-content` asks what the widest cell wants. Every day track carries the same flex factor, so
the used flex fraction taken from one item's max-content contribution becomes the width of
**all** of them — the holiday name in one header sizes thirty columns. That is neither what
REQ-03-018 conditions the scroll on, nor Edge case 13 ("Every day column is at its minimum width
and the grid scrolls"), nor what the comment beside the rule claimed it did.

One word changes:

```css
.time-off-calendar-grid {
  min-width: min-content;
}
```

Under a min-content constraint a `minmax(--day-col-min, 1fr)` track is its **base size** — the
floor — and items do not grow it, because the track's min sizing function is a length and not
`auto`. So `min-content` here *is* the sum the rule describes: the name column plus one floor
per day. Above that width nothing changes: `width: auto` fills the container, the free space is
definite, and the `1fr` tracks divide what is left exactly as they shipped.

The rule now carries both halves of the reason — what `min-content` is, and what `max-content`
did — because the two are one character apart and only one of them is the rule:

> `max-content` instead asks what the widest CELL wants, and because every day track carries the
> same flex factor, the answer sets the width of ALL of them: one whole-view holiday named in
> one header made every column in a 30-day month 87px wide and put two thirds of the reader's
> own month off the right edge.

### The cases that now catch it

Both in TC-03-E2E-13, the case that already owns REQ-03-014 and REQ-03-018 — no new case id, and
no new `data-testid`:

- **the shipped Month window, with a whole-view holiday in it.** The case now seeds
  `Company Day` on the 15th of the month the screen opens on (mid-month so the runner's UTC
  reading and the account's zone cannot disagree about which month it is), asserts the holiday
  is named in its header, and then asserts Edge case 13 in full: the grid scrolls, **every** day
  column is the declared `--day-col-min` — `toBeCloseTo`, not `>=`, so a column that is too wide
  fails as loudly as one too narrow — and the grid's `scrollWidth` is at most
  `--name-col + days × --day-col-min`. That last one is the rule stated as arithmetic: the grid
  is the sum of the floors and not the sum of anything a header holds.
- **the Week window, where the columns fit.** `scrollWidth <= clientWidth` and every column
  strictly wider than the floor — the other half of REQ-03-018's condition, and the guard
  against "fixed 32px columns with empty space beside them", which is the mistake the opposite
  of this one would be.

The 92-day assertion later in the case tightened the same way: it read `>= floor - 0.5` and now
reads `toBeCloseTo(floor, 0)`, since with 92 columns the floor is what sizes them.

### What this does to the windows that already shipped

Three of the four windows draw the same as they did before this spec whenever no day header
holds anything unusual — the `1fr` division is untouched. Two things do change, and both are the
spec's own rules rather than side effects:

- a month whose columns at 32px exceed the content area scrolls, which is REQ-03-014 with
  REQ-03-018 (a 22px column is the sliver the floor exists to prevent);
- below 1200px, where `max-content` shipped, columns are now at the floor rather than at the
  widest header's content — again Edge case 13.

## Commands run

| Command | Result |
|---|---|
| `E2E … -g "nav controls hold one position"` — **before** the CSS change | `1 failed` — 87.53px against a 32px floor, the reproduction above |
| the same, **after** | `1 passed (31.3s)` |
| `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/time-off-calendar.spec.ts tests/regressions.spec.ts` | `24 passed (1.3m)` — no flake this time; attempt 2's flake in the country-settings case did not recur |
| `node scripts/static-gate.mjs` | `static-gate: pass (diff against c3abb8dc)` |
| `npm run ds:check` | `25 values outside the token vocabulary, 43 exempted` — unchanged |

Unit, integration and the typechecks were not re-run: this attempt changed one CSS declaration
and one E2E case, and no TypeScript any of them compile.

## Still standing

1. `scripts/static-gate.mjs` blocked on the spec's own `### Withdrawn` table; the fix is on
   `build/static-gate-withdrawn-messages` (`9a04205`) via `scripts/aside.mjs`, in the working
   tree and deliberately not in this run's diff. Merge it when the run is over.
2. The bundle's Known Gap "no fixture can seed more than 100 active memberships" is false —
   TC-01-INT-17 already does it — but the fixture was built as the plan required and has a real
   consumer.
3. The design system's `Calendar` draws `data-testid="calendar-grid"`, the same id the wallchart
   carries, so both are on the page while the Range panel is open.
