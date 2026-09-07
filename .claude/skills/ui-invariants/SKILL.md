---
name: ui-invariants
description: The eight mechanisms a drawn screen fails by, as a closed register with worked examples. Use when writing or judging a spec, a patch or a diff that draws a screen — a layout, a control, a loading state, an overlay, a message, a font — and when writing the cases that would catch each one.
---

# UI invariants

A screen fails in a small number of ways, over and over, on a different control each time.
This register names them so that a rule is written once, for the mechanism, instead of once
per control.

**[references/invariants.md](references/invariants.md)** — the closed register, UI-01 to UI-08,
and which stage holds each id.
**[references/examples.md](references/examples.md)** — one worked example per invariant: the
shape that is wrong, the shape that is right, and the test that separates them.

## The rule that makes the register worth having

**A finding is written about the mechanism, never about the control it was found on.**

A rule that says *the country picker holds its width* closes one control. A rule that says
*no box has a size its own content decides* closes every control, including the ones that do
not exist yet. The first shape is how one defect becomes six documents.

Two consequences:

- **A section that defers the same mechanism is not a deferral.** Naming a control that has the
  defect under "Not in this patch", "Out of scope" or "Known gaps" — on the grounds that no
  screen shows it today — schedules the same work again for the next screen that does. Either
  the rule covers the mechanism or the document is the wrong weight.
- **A repair is checked against every place the mechanism reaches**, not against the place the
  report named. Before a fix is called done, list the other call sites of the same component,
  the other controls of the same kind, and the other screens with the same shape.

## Reading the register

Every invariant is a sentence about **what must hold**, and each carries what makes it false.
A finding names an id. A finding that names none is a note — which is also how a mechanism the
register lacks gets proposed.

Where a stage has no id for an invariant, that invariant is carried by the stages that do. The
table at the end of the register says which.

## Who reads this

- **A spec or patch author**, when the document draws a screen — before writing the
  `## Geometry & motion` table, the states of a question, or the borrowed row.
- **`spec-reviewer`**, under S-61, S-62, S-63, S-66, S-67 and S-68.
- **`implementer`**, before calling a UI task done — each invariant names what to measure.
- **`code-reviewer`**, under CR-33, CR-34, CR-36, CR-37 and CR-38.
- **`qa`**, when walking a screen: each invariant names an observation, not an opinion.

## What is not here

Aesthetics. Nothing in this register is about whether a screen looks good — every id is a
statement that can be **measured**: a rectangle that moved, a `scrollHeight` that grew, a node
counted twice, a font that was never fetched. A judgement that cannot be measured is a note,
and belongs in the document that decides the design.
