# 0023 — A screen is built to rules that are not about how it looks

**Status:** current
**Date:** 2026-09-08

## The decision

`.claude/skills/ui-craft/` holds **thirty-eight rules for building a screen**, in seven families,
each carrying a `UC-nn` so a finding can name one:

| Family | Ids |
|---|---|
| A request has a lifecycle, and every path through it ends | UC-01 – UC-06 |
| Where a thing goes, and who owns it | UC-07 – UC-12 |
| The tree is the hierarchy | UC-13 – UC-17 |
| What the browser has to redo | UC-18 – UC-23 |
| Motion says what changed | UC-24 – UC-28 |
| One screen at every width | UC-29 – UC-33 |
| The screen that already does this | UC-34 – UC-38 |

Three properties make it a skill rather than a style guide.

1. **It decides nothing about how the product looks.** The palette, the type, the surfaces, the
   radii, the hover treatments and the content voice stay in `packages/ds/README.md` and
   `specs/design-system/decisions.md`; the breakpoint ladder, hover, target size, drag, tooltips
   and overlay panels stay in `specs/design-system/01-responsive.md`. Every rule in the skill can
   be pointed at in code — a path that clears no flag, a heading level, a property in a
   transition, a key.
2. **It repeats no invariant.** `.claude/skills/ui-invariants/` holds the eight measurable
   mechanisms that block. Where a craft rule would restate one, it names the id: the wait itself
   is UI-03, a control that moves when used is UI-02, two sources for one value is UI-07, a
   message drawn twice is UI-05, a box outside its flow is UI-04.
3. **`npm run ui:check` decides four of them mechanically and reports rather than gates**, for
   the reason `ds:check` gives: a lint that fails the build the day it is written is a lint
   somebody turns off. Exit code 0 whatever it finds.

**Bound to `implementer` and `implementer-lead`, and to nobody else.** The lead already reads
`implementer.md` in full and is bound by every rule it states, so the skill reaches its children
without a second copy; it is named in the lead's read-first list so the binding is explicit.
Nothing here is in the code review's closed register, so a reviewer that cites a `UC-nn` files a
note — which is what an id outside a register is worth.

## What it replaces

Nothing was in force for any of it. The two documents that governed screens governed different
subjects: `ui-invariants` holds what must **hold** on a drawn screen, and the design system's
README holds what a screen must **look like**. How it is **built** — the lifecycle of the request
behind it, the tree under the picture, what the browser redraws, whether it survives between two
breakpoints — was in nobody's document and in no gate.

**The obvious base was rejected.** The `frontend-design` plugin skill is about giving a client a
distinctive visual identity: pick typefaces that are not your defaults, spend boldness in one
place, avoid the warm-cream-and-terracotta cluster. Applied here it argues with a normative
document — this product has one blue, one Poppins, flat white surfaces, and shadow reserved for
what floats. Two of its passages survive as rules the design system does not state: motion that
answers an action rather than announcing arrival, and CSS specificity that cancels itself out
between a type selector and an element selector.

## The evidence

A scanner was written against `apps/web` and `packages/ds` and run over 236 tracked source files.
It is `scripts/ui-check.mjs`, so the count is reproducible rather than remembered.

- **6 effects `await fetch(…)` with no `catch`.** Two of them are the pickers on
  `apps/web/app/org/[orgId]/time-off/calendar/CalendarScreen.tsx`. A network failure rejects a
  promise inside `void (async () => …)()`, which nothing awaits; a `500` takes the
  `!response.ok` branch and returns. Both leave the Teams picker drawing an empty list — the same
  picture as *this organization has no projects* — with no message and no reason to press
  anything twice. No existing gate sees it: nothing throws, nothing logs, every test passes.
- **51 in-flight flags cleared outside a `finally`.** Three were read by hand and all three are
  correct today. **This is reported as a shape and not as a defect**, and the distinction is the
  point: `RequestTopicModal.tsx` clears `submitting` on one path at the end of the handler, and
  the first early return somebody adds above it strands the submit button disabled for the life
  of the modal.
- **15 keys that are an index**, four of them in `@ds` components. Correct where the list never
  reorders — `Preloader`'s skeleton bars — and a remount of every row below the first move where
  it does.

The screen the evidence came from is not carelessly written. `CalendarScreen.tsx` carries an
`AbortController`, checks `signal.aborted` after every await, and explains in a comment why a
failed read must not draw the empty state. It has the defect anyway, in the two effects nobody
thought of as requests.

## The hypothesis this killed

**That careful code plus a measurable register is enough.** ADR 0021 established that a screen
defect is a mechanism with an id and a measurement, and ADR 0022 established that what the product
does is settled with a person first. Both hold. Neither reaches a `useEffect` whose rejection has
nowhere to go, because there is nothing to measure: no rectangle moved, no box grew, no node was
drawn twice. The screen is in a state, it is a legal state, and it is the wrong one — and the only
artefact that can see it is the source.

The corollary is the reason the checker reports the 51: **the shapes that produce hung states are
not themselves defects**, so a gate built on them would be wrong most of the time it fired. That
is what makes this a skill an agent reads and a report a person reads, rather than a ninth
invariant.

## What it costs

- **A report with 72 findings that nobody is required to clear.** The `ds:check` precedent says
  this is the survivable shape; the failure mode is the report being ignored, and the counter is
  that `implementer` runs it scoped to the files it touched, where the count is small.
- **`box-shadow` and `filter` were deliberately left out of the expensive-transition check**,
  though both repaint: the design system's own hover treatment transitions them, and a report
  that argues with the normative document is a report nobody finishes reading.
- **Thirty-eight rules is more than an agent holds in working memory.** They are organized by
  family and indexed at the top of the page, and the four that a script can decide are the four
  that were costing the most.
