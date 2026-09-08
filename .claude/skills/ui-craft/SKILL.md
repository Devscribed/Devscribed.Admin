---
name: ui-craft
description: How a screen in this repository is built — a request lifecycle that never hangs, where labels and headings go and who owns a control's state, the tree that carries the hierarchy, what the browser has to redraw, motion that says what changed, one screen at every width, and following the screen that already does this. Use when writing or changing anything under apps/web or packages/ds, and before calling a screen task done.
---

# UI craft

Thirty-eight rules for building a screen, in seven families. Each carries an id so a finding can
name one.

| Family | Ids | The question it answers |
|---|---|---|
| A request has a lifecycle | UC-01 – UC-06 | can the screen get stuck in this state |
| Where a thing goes, and who owns it | UC-07 – UC-12 | is this a label, a caption or a heading, and who holds its value |
| The tree is the hierarchy | UC-13 – UC-17 | does the DOM say what the picture says |
| What the browser has to redo | UC-18 – UC-23 | why is this frame slow |
| Motion says what changed | UC-24 – UC-28 | should this move at all |
| One screen at every width | UC-29 – UC-33 | does it hold up between the breakpoints |
| The screen that already does this | UC-34 – UC-38 | has this been solved here before |

**This page decides nothing about how the product looks.** The palette, the type, the surfaces,
the radii, the hover treatments and the content voice are settled in
[`packages/ds/README.md`](../../../packages/ds/README.md) and
[`specs/design-system/decisions.md`](../../../specs/design-system/decisions.md); breakpoints, the
hover and pointer rules and the overlay panels are settled in
`specs/design-system/01-responsive.md`. Read those for what a screen should look like. This page
is how it is built so that it works.

**What must hold on a drawn screen is a different register.**
[`.claude/skills/ui-invariants/`](../ui-invariants/SKILL.md) holds the eight mechanisms a screen
fails by, each of them measurable and each of them able to block. Nothing here repeats one. Where
a rule below would restate an invariant, it names the id instead.

`npm run ui:check -- <path>...` reports on four of these mechanically. It **reports and does not
gate**, for the reason `ds:check` does: a lint that fails the build the day it is written is a
lint somebody turns off.

---

## A request has a lifecycle, and every path through it ends

A screen hangs when a path exists that the code never returns from — a flag nobody clears, a
rejection nobody catches, a control disabled by one branch and re-enabled by another that did not
run. None of these throws, none of these logs, and every test still passes.

| id | The rule |
|---|---|
| **UC-01** | An in-flight flag is cleared in `finally`, never on the paths you remembered. A `setSaving(false)` at the end of a `try` is cleared by every path that exists today, and stranded by the first early return somebody adds. |
| **UC-02** | Every request has a failure path that reaches the person: something drawn, and a way to try again. A `catch` that only logs is a hung state with a log line. |
| **UC-03** | A request that a later one supersedes is aborted, and the abort path leaves the flag in the state the next request needs — not cleared because clearing looked symmetric. |
| **UC-04** | A catalogue that failed to load is not an empty catalogue. A picker whose options never arrived says so and offers the retry, or is not drawn; silently offering nothing is indistinguishable from *there is nothing*. |
| **UC-05** | One owner per disabled state. The code that disables a control re-enables it. A control disabled in one handler and released in another is released only when both agree, which is never on the failure path. |
| **UC-06** | An `async` body started inside an effect handles its own rejection. `void (async () => { … })()` discards the promise, so a rejection inside it reaches nothing and leaves the screen in whatever state it was in. |

Whether the wait is drawn at all, and what stands on screen while it is, is **UI-03**.

## Where a thing goes, and who owns it

A label, a heading and a control each have one correct place and one correct owner. Getting this
wrong produces a screen that looks right and behaves as several unrelated pieces.

| id | The rule |
|---|---|
| **UC-07** | A label belongs to its control by **element**, not by position. `FormField` and `FieldLabel` own the pairing and the geometry; a `<div>` sitting above an input is a caption — clicking it focuses nothing and nothing announces it as the field's name. |
| **UC-08** | The heading **level** comes from depth in the document; the **size** comes from a token. Never pick a level to get a size, and never pick a size to get a level. The outline this application uses is `PageTitle`'s `<h1>`, a card's title at `<h2>`, `SectionHeading`'s `<h3>` — decided in `specs/design-system/decisions.md` §27 and §74. |
| **UC-09** | A caption that names a block is a heading; a label that names a control is a `<label>`. The two may share the paint and never the element — borrowing `fieldLabelStyle` for a caption is borrowing geometry, not becoming a label. |
| **UC-10** | A control is controlled or it is uncontrolled, and never both. A `value` with no `onChange` is a control that looks editable and refuses every keystroke; a value held by the control *and* by the screen has two sources, which is **UI-07** arrived at through props. |
| **UC-11** | State is owned by the lowest element that needs it. A field's value lifted to the screen so one button can read it re-renders the screen on every keystroke; lifted to a context, it re-renders everything under the provider. |
| **UC-12** | The label, the control and the message are one group with one owner. Where a design-system field owns the message slot, hand it the message — drawing it beside as well is **UI-05**. |

## The tree is the hierarchy

The hierarchy a person navigates is the DOM, not the picture. Where the two disagree, the picture
is what a sighted mouse user gets and the DOM is what everybody else gets.

| id | The rule |
|---|---|
| **UC-13** | One `h1` per page, and levels descend by one. A level skipped is a hole in the outline a screen reader reads as a missing section. |
| **UC-14** | DOM order is reading order. `order`, `row-reverse`, `grid-area` and a negative margin move the picture and leave the keyboard, the screen reader and the tab sequence behind. Reorder the tree. |
| **UC-15** | A visual group is a DOM group. Things that read as one thing — a row and its actions, a figure and its caption — are one element's children, so the relationship survives a re-layout. |
| **UC-16** | Every wrapper owns something: a token it applies, a boundary it establishes, a role it carries. A `<div>` that owns nothing is a box that can still clip, scroll, or establish a stacking or containing context, and it will. |
| **UC-17** | Reach for the element that already has the behaviour before the `role` that promises it. A `<button>` is focusable, activates on both keys and announces itself; a `<div role="button">` owes all three by hand. The floor every component owes is rule 3 of the design system's README. |

Which control is reached by its accessible name and which by `data-testid` is settled in
CLAUDE.md: navigation by name, everything else by id.

## What the browser has to redo

A screen lags for one of two reasons: the browser is laying out or painting on a frame where it
only needed to composite, or React is re-rendering a subtree that did not change.

| id | The rule |
|---|---|
| **UC-18** | Animate `transform` and `opacity`. `width`, `height`, `top`, `left`, `margin` and `padding` lay out on every frame of the animation, and a `filter` on a large box repaints it. The hover shadow is the system's own decision and is not this rule's business. |
| **UC-19** | Never read layout after writing style in the same frame. `getBoundingClientRect`, `offsetWidth`, `scrollHeight` and `getComputedStyle` force the browser to finish a layout it had deferred — inside a loop over rows, once per row. |
| **UC-20** | A key is a stable id. An array index, or anything a sort or a filter reorders, remounts every row after the one that moved and takes its focus, its scroll position and its transition with it. An index is correct only for a list whose order and length never change. |
| **UC-21** | An identity handed to many children is stable. A fresh object, array or function created during render is a new prop for every child that receives it, and a context whose value is a fresh object re-renders every consumer on every parent render. |
| **UC-22** | State derived from props is derived during render. An effect that reads props and calls `setState` renders twice for every render, and draws the intermediate value in between. |
| **UC-23** | `will-change` lasts as long as the motion. It promises the browser a layer and the browser keeps it; set it when the movement starts and remove it when it ends. |

**A claim about speed is a measurement.** A `performance.mark`, a frame count, a profile — never
an opinion about which of two shapes looks faster.

## Motion says what changed

The system's own settings — 0.1–0.3s, no bounce, no spring, no scroll-triggered reveal — are in
`packages/ds/README.md` under *Visual foundations*. These are the rules about **when** a thing
moves rather than how far.

| id | The rule |
|---|---|
| **UC-24** | Motion answers a person's action, or it does not exist. Something that animates on arrival, on scroll, or on a timer draws attention to a change nobody made. |
| **UC-25** | A thing leaves by the axis it arrived on. A panel that came from the right goes back to the right; one that grew from a point collapses to that point. |
| **UC-26** | `prefers-reduced-motion` removes the movement and never the change. The state still changes and the thing still appears — it arrives instead of travelling. |
| **UC-27** | Nothing moves under the pointer that summoned it. A control that repositions on click puts a different control under the finger that is still there. |
| **UC-28** | A transition is between two states the screen actually has. Animating into a state the code cannot describe leaves the screen in it when the animation is interrupted. |

Whether a control moves *at all* as a consequence of being used is **UI-02**, and it blocks.

## One screen at every width

The ladder itself — the breakpoints, the rail that becomes a drawer, the modal that becomes a
sheet, hover, target size and drag — is `specs/design-system/01-responsive.md`, and it is
normative. These are the rules for **building** to it.

| id | The rule |
|---|---|
| **UC-29** | Adapt by the rule, not by the width. `flex-wrap`, `grid-template-columns: repeat(auto-fit, minmax(…))` and `min()`/`clamp()` adapt at every width including the ones nobody tested. A media query is for a change of **structure** — a rail becoming a drawer — never for a change of size. |
| **UC-30** | Width alone decides the layout. Never branch on a stored preference, a user-agent string or a `matchMedia` read during render: the server does not know any of them, so the first paint disagrees with the hydrated one and the screen changes shape under the reader. |
| **UC-31** | The page body never scrolls sideways. Wide content — a table, a grid, a code block, a row of chips — scrolls inside its own `overflow-x` container, and that container is the widest element's own ancestor. |
| **UC-32** | Nothing is laid out against the viewport that belongs to a container. A panel inside a rail sized in `vw` is sized against the window that also holds the rail, so it is wrong by exactly the rail's width at every size. |
| **UC-33** | Check it at the ladder's own widths, not at "mobile" and "desktop". A layout is wrong most often just below the breakpoint where the structure changes, and that is a width you have to ask for. |

## The screen that already does this

Consistency is not a preference here: two screens solving one problem two ways is a defect
whichever of the two is better, because the reader has to learn both and the next screen has to
choose.

| id | The rule |
|---|---|
| **UC-34** | Find the screen that already does this before building it. A filter row, a confirm, a detail panel, an empty state — name the existing one and follow it, or say why this one cannot. |
| **UC-35** | The same action carries the same name everywhere: the control, the confirmation, the heading it leads to, and the `data-testid`. A button that says *Publish* produces *Published*. |
| **UC-36** | Where two shipped screens already disagree, do not invent a third way. Follow the newer, and name the older as a defect rather than preserving the disagreement by matching whichever was nearest. |
| **UC-37** | Anything that repeats across screens is a component, not a copy — rule 1 of the design system's README. A screen that has grown a local `SectionHeader` has found a component and given it a name instead. |
| **UC-38** | The vocabulary is closed. Tokens for every colour, space and size; `packages/validation` for every user-facing message; `@devscribed/ds` from the package root for every control. A value with no token gets a token with its reason, never a neighbour that happens to be close. |

---

## Who reads this

- **`implementer`**, before writing the first line of a screen and again before calling the task
  done — these are the rules it builds to, and `npm run ui:check` is what it runs on the files it
  touched.
- **`implementer-lead`**, which is bound by the same rules and answers for a child that broke
  one; it runs the check over the integrated result of a wave.
- **a person**, reading `npm run ui:check` over a directory.

**Nothing here is in the code review's closed register, and none of it blocks.** A reviewer that
names a `UC-nn` files a note, which is what an id outside a register is worth. Giving one teeth
is a row added to `.claude/skills/code-review/references/blocking-criteria.md`, deliberately and
one at a time.

## What is not here

How it looks. Every rule above can be pointed at in code: a path that clears no flag, a heading
level, a property in a transition, a key. A judgement about whether a screen is handsome belongs
to the design system's documents and to the person who looks at the mock.

[references/examples.md](references/examples.md) — the wrong shape and the right one for the
rules that are easy to read past.
