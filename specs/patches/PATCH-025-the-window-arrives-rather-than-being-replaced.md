---
id: "PATCH-025"
title: The window arrives rather than being replaced, and its controls join the row
surface: ui
supersedes: time-off/01, time-off/03, PATCH-024
requirement: null
cases: []
files: 2
---

## Why

**Stepping the window drew three layouts in a blink.** The grid was rendered only while the
answer on screen matched the window the header names, so the moment an arrow was pressed it was
replaced by the loading skeleton — a fourteen-column placeholder of a different width — and
then by the next month. The month before it was still perfectly good to look at, and it was
thrown away to show a placeholder for something already known.

That is the rule [PATCH-015](PATCH-015-the-wait-is-drawn-when-there-is-nothing-to-draw.md) put
on the Holidays screen, arrived at here the hard way: the wait is drawn when there is nothing
to draw.

**The window's controls sat in the page header.** The arrows, the window's name and Today
decide what the grid shows, exactly as Scope, Teams and Window do — and they stood a row above
them, in a different size, at the other end of the page.

## The rule

THE SYSTEM SHALL keep the window on screen while the next one is fetched, dimmed and marked
busy, and SHALL replace it only when the answer arrives.

THE SYSTEM SHALL draw its loading state only when it holds no window at all.

THE SYSTEM SHALL bring a new window in from the side it was travelled to — from the right when
the reader stepped forward, from the left when they stepped back — and fade it in place for a
jump to Today, and SHALL do none of this where the reader has asked for reduced motion.

THE SYSTEM SHALL draw the window's arrows, its name and Today at the end of the filter row,
with the controls that decide the same thing.

**What it looks like when it is wrong.** An arrow empties the grid before filling it, or the
control that moves the window is not among the controls that choose it.

## Contracts

No route, no message, no `data-testid`. `calendar-grid`, `calendar-prev`, `calendar-next`,
`calendar-today`, `calendar-range-label` and `calendar-empty-state` keep their ids;
`calendar-grid` is now keyed by the range it draws, so React replaces the node rather than
patching it, which is what lets the animation run at all. The scroller carries `aria-busy`
while an answer is in flight.

## Cases

**None written, at the user's direction** — asked for as a patch, code, commit, with the
regression waived.

`TC-01-E2E` waits for `calendar-grid` after pressing an arrow; the node is now present
throughout rather than absent and then present, which a wait for presence still satisfies. A
test asserting the skeleton appears on a step would now fail, and none was found. The case this
patch would carry asserts `calendar-grid` is present continuously across a step.

## Blast radius

- **The Time off calendar only** — one component and one block of CSS.
- **A stale window is on screen while the next is fetched**, dimmed and `aria-busy`. Its
  figures are the stale window's too, and they are labelled by that window's own dates until
  both are replaced together.
- **The empty state now waits for the current window.** With a stale grid on screen there is
  something to show, so "nobody is away" is claimed only about the window the header names.
- **The header keeps only its title.** The page header of this screen is now a title and a
  subtitle, like every other screen's.
- **One animation, at `--duration-fast`.** A slide wants a step longer than the system's single
  duration, and `--duration-slow` would be a token invented on one screen; the gap is real and
  belongs in the design system rather than here.

## Not in this patch

- **Animating the metrics strip.** Its four figures change with the same answer; a number that
  slides is a number being read while it moves.
- **Prefetching the next window.** The animation covers the wait; fetching a window nobody
  asked for is a different decision, about the endpoint's cost.
- **A second duration token.** Named above as the gap it is.
