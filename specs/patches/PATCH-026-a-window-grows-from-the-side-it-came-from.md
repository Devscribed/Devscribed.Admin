---
id: "PATCH-026"
title: A window grows from the side it came from
surface: ui
supersedes: design-system, PATCH-025
requirement: null
cases: []
files: 2
---

## Why

[PATCH-025](PATCH-025-the-window-arrives-rather-than-being-replaced.md) slid the new window in
by 16px from the side the reader travelled. A slide is the obvious shape for that and it was
wrong here, for a reason the patch note got exactly backwards: it says the transform is on the
grid inside the scroller, "which clips it, so the slide can never reach the page". Clipping is
not the question. **A transformed box contributes its transformed rectangle to its scroller's
scrollable overflow**, so a grid nudged 16px right made the scroller 16px wider than its
content for the length of the animation — and in a window whose columns otherwise fit, a
horizontal scrollbar appeared and vanished on every press of the arrow.

The animation was also the length of a border changing colour. `--duration-fast` is the step a
hover takes; a whole region arriving needs longer, and the system had no token for it.

## The rule

THE SYSTEM SHALL bring a new window in by growing it from the side the reader travelled from —
the far edge pinned, the near edge arriving — so that the animated grid is never wider than
where it settles and no scrollbar can appear for the length of it.

THE SYSTEM SHALL carry a duration for a region arriving, distinct from the duration a control's
own paint changes over, in the design system's tokens.

The rest of PATCH-025 stands: the old window holds until the new one lands, the loading state
is drawn only when there is no window at all, a jump to Today fades in place, and reduced
motion turns all of it off.

**What it looks like when it is wrong.** A scrollbar appears and disappears when the arrow is
pressed.

## Contracts

No route, no message, no `data-testid`. `--duration-region` joins `--duration-quick`,
`--duration-fast`, `--duration-hover` and `--duration-spin` in `packages/ds/src/tokens/effects.css`.

## Cases

**None written, at the user's direction** — asked for as a patch, code, commit, with the
regression waived.

The case this would carry records the scroller's `scrollWidth` before and during a step and
asserts it never grew — which is the assertion that would have caught the slide, and which no
amount of looking at the animation would.

## Blast radius

- **The Time off calendar only** for the animation; the token is the design system's and is
  used by nothing else yet.
- **The motion reads as a settle rather than a slide.** A 1.5% scale on a grid this wide is
  about fifteen pixels of travel at the moving edge — the same distance the slide covered, in
  a shape that cannot overflow.
- **`scaleX` distorts the columns while it runs.** At 1.5% over 280ms nothing is legibly
  squashed; a larger step would be, which is what bounds the number.
- **The busy dim now takes the same duration as the arrival**, so the two are one motion
  rather than a quick fade followed by a slower one.

## Not in this patch

- **A real slide.** It would need the animated element out of the scroller's overflow — a
  wrapper that clips, which is the thing the sticky first column's own note forbids putting
  between the grid and its scroller.
- **Animating anything else on the screen.** The strip and the filters change with the same
  answer and stay still.
