---
id: "PATCH-027"
title: The product loads the typeface it names, in both scripts
surface: ui
supersedes: design-system, time-off/01
requirement: null
cases: []
files: 3
---

## Why

`--font-family-base` has read `'Poppins', sans-serif` since the design system was written,
and **nothing has ever fetched Poppins**. There is no `@font-face`, no `next/font`, no link in
the document. A machine with Poppins installed drew the product as designed; one without drew
whatever its generic sans is, and nobody could tell which they were looking at.

The second half is what made it visible. **Poppins carries no Cyrillic.** Even where it is
installed, a Cyrillic name falls through per glyph to whatever the browser picks next — and
that family has no 500 weight, so a request for `--font-weight-medium` resolves *down* to 400.
On the calendar, `Anna Nowak` is medium and `Алексей Каминский` on the row below it is not:
not a missing style, a missing face.

Two rows on the same screen were also different heights, because a member with no job title
left the name cell one line short.

## The rule

THE SYSTEM SHALL load the faces it names, in the weights it asks for.

THE SYSTEM SHALL carry, behind them, a family that covers Cyrillic in the same weights, so
that a name in either script is drawn at the weight it was asked to be and the fallback is a
decision rather than whatever the browser reaches for.

THE SYSTEM SHALL reserve the job title's line in a calendar row whether or not that member has
one, so every row is the same height.

**What it looks like when it is wrong.** Two names in a list, one medium and one not, with
nothing but their alphabet between them.

## Contracts

No route, no message, no `data-testid`. `--font-family-base` is repointed in the web app at the
two loaded families; the token's name and every component that reads it are unchanged.

Montserrat is the second family for the reason it is and no other: a geometric sans of the same
build as Poppins, with Cyrillic, in the weights the system asks for.

## Cases

**None written, at the user's direction** — asked for as a patch, code, commit, with the
regression waived.

`next build` was run and both families were fetched and inlined. The case this would carry is
an E2E one reading `getComputedStyle` on two names in one list — one Latin, one Cyrillic — and
asserting the same `font-weight`.

## Blast radius

- **Every screen changes typeface**, on any machine that did not already have Poppins
  installed. That is the change: the product now looks the same everywhere, and where it looked
  right before it still does.
- **Two font families are fetched at build.** `next/font` downloads and self-hosts them, so
  nothing is requested from Google at run time and there is no layout shift beyond `swap`'s.
- **A machine without network cannot build the web app** until the fonts are in Next's cache.
  That is the cost of loading a font properly rather than hoping for it.
- **`packages/ds` is not touched.** It is TypeScript source with no build step and no place to
  put an `@font-face`; the app that renders it is where files are loaded.
- **The calendar's rows are all one height**, which makes the grid a row taller where a member
  has no title.

## Not in this patch

- **The weight scale itself.** `--font-weight-medium` at 500 is the system's, and the fix is to
  have a face at 500 rather than to stop asking for one.
- **A Cyrillic-first stack.** Poppins is the product's face; Montserrat is what carries the
  glyphs it does not, in the order that keeps that true.
- **Every other screen's mixed-script text.** They all read the same token and all get this.
