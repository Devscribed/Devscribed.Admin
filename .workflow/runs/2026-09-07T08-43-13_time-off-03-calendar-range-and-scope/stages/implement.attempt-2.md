# implement — attempt 2

Spec: `specs/time-off/03-calendar-range-and-scope.md` (+ contracts, cases)
Branch: `spec/calendar-range-and-scope` · commit `c776d16` (attempt 1 was `57fa8f5`)

## The finding

**contracts §UI Description — "Range wider than the viewport | The grid scrolls horizontally
inside `.time-off-calendar-scroll`; the member column stays pinned"**
(`apps/web/app/globals.css#.time-off-calendar-grid`)

**Fixed.** The finding is correct and I reproduced it before changing anything.

### Reproduced first

I added the missing assertion to TC-03-E2E-13 and ran it against attempt 1's commit: after
`container.scrollLeft = 400` the member name cell's left edge was at **-83px** while the
container's left edge was at **316px** — the names had scrolled off the viewport entirely,
exactly as the witness describes.

```
Expected: >= 315
Received:    -83
  847 |     expect(scroll.nameLeftAfter).toBeGreaterThanOrEqual(scroll.containerLeft - 1);
```

### The cause, and what changed

`.time-off-calendar-grid` carried `border`, `border-radius`, `background` and — for the radius
to clip anything — `overflow: hidden`. That `overflow` makes the grid a scrollport in its own
right, and a `position: sticky` box is offset against its **nearest** scrollport ancestor. The
grid's own scroll offset is permanently 0 because `min-width: max-content` makes its width its
content's width, so `.time-off-calendar-who` had nothing to stick to while the box that actually
moved — `.time-off-calendar-scroll` — was one level further out.

The frame moves to the container that scrolls:

```css
.time-off-calendar-scroll {
  overflow-x: auto;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-l);
  background: var(--surface-page);
}

.time-off-calendar-grid {
  min-width: max-content;   /* REQ-03-018 */
}
```

Nothing else was needed: a scroll container clips to its own rounded corners, so the
`overflow: hidden` that existed only to make the radius bite is not replaced anywhere. Two
things improve with it — the frame now stays around the scrolling area instead of sliding off
to the right with a 3208px grid, and the sticky cell's nearest scrollport is the box the reader
scrolls.

The rule carries the reason in full, and the sticky rule three lines below now says out loud
what it depends on, because the next `overflow` added between those two boxes breaks it again
with no error anywhere:

> A sticky cell is pinned to its NEAREST scrollport ancestor, and any box between it and the
> scroller carrying an `overflow` other than `visible` becomes that scrollport — one whose own
> scroll offset never leaves 0, because its width is its content's width.

### The case that now catches it

TC-03-E2E-13 (`e2e/tests/time-off-calendar.spec.ts`) — the same case that already covered
REQ-03-018 — scrolls the container 400px under the 92-day range and asserts three things beside
the scroll width it asserted before: that the container really moved, that the name cell is
still within a pixel of the container's left edge, and that it has not moved right of where it
started. It fails on `57fa8f5` and passes on `c776d16`.

No new `data-testid` was added: the measurement is anchored on `calendar-grid` and reaches the
member row through the `calendar-member-row-` prefix the contracts already name.

### Scope

`.time-off-calendar-scroll` and `.time-off-calendar-grid` are used by this screen and nothing
else (`CalendarScreen.tsx:99`, `:483` and the two grids inside them), so the frame's move
reaches the wallchart and its loading skeleton and no other surface. Both draw the same box as
before.

## Commands run

| Command | Result |
|---|---|
| `E2E … npx playwright test tests/time-off-calendar.spec.ts -g "nav controls hold one position"` — **before** the CSS change | `1 failed` — the reproduction above |
| the same, **after** | `1 passed (23.4s)` |
| `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/time-off-calendar.spec.ts tests/regressions.spec.ts` | `1 flaky · 23 passed (1.4m)` — see below |
| `E2E … -g "manager sets the organization country"` (the flaky one, alone) | `1 passed (26.3s)` |
| `node scripts/static-gate.mjs` | `static-gate: pass (diff against c3abb8dc)` |
| `npm run ds:check` | `25 values outside the token vocabulary, 43 exempted` — unchanged from attempt 1; the moved declarations are the same declarations |

**The flake.** `a manager sets the organization country and the grid marks that holiday` failed
its first run at `time-off-calendar.spec.ts:532` and passed on retry, then passed alone. The
assertion is on `org-country-select` reading back its own saved value on the holidays settings
screen — a save round-trip on a different route, on a screen this change does not touch, and
nothing in the failure is about the calendar grid. It passed on attempt 1's full run too, so it
is timing, not a regression. Recorded rather than fixed: a flake nobody names is a flake
somebody rediscovers.

Unit, integration and the typechecks were not re-run: this attempt changed one CSS rule and one
E2E case, and touches no TypeScript that any of them compile.

## Still standing from attempt 1

The three notes in `implement.attempt-1.md` are unchanged and still want a reader:

1. `scripts/static-gate.mjs` blocked on the spec's own `### Withdrawn` table; the fix is on
   `build/static-gate-withdrawn-messages` (`9a04205`) via `scripts/aside.mjs`, in the working
   tree but deliberately not in this run's diff. Merge it when the run is over.
2. The bundle's Known Gap "no fixture can seed more than 100 active memberships" is false —
   TC-01-INT-17 already does it — but the fixture was built as the plan required and has a real
   consumer.
3. The design system's `Calendar` draws `data-testid="calendar-grid"`, the same id the wallchart
   carries, so the two are both on the page while the Range panel is open.
