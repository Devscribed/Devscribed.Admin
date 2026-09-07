---
id: "PATCH-015"
title: The wait is drawn when there is nothing to draw
surface: ui
supersedes: time-off/02, PATCH-011
requirement: null
cases: []
files: 1
---

## Why

[PATCH-011](PATCH-011-a-re-read-does-not-blank-the-screen.md) gave the Holidays reads a `quiet`
option and left the year tab and the country filter loud, on the reasoning that a read
answering a new question should show a wait. That reasoning was wrong about what a person sees:
choosing a country is the most frequent thing anybody does on this screen, and it still blanked
the summary and the table for a round trip. The screen blinks on exactly the two controls it
gives somebody to use.

It was also wrong in a second way. The list and the summary shared one effect, and the effect
woke on the list's identity — so choosing a country re-fetched the summary too, which the filter
does not govern and cannot change.

An option on each call site was the wrong shape for the decision. Whether to draw a wait is not
a property of the caller; it is a property of what is in hand.

## The rule

THE SYSTEM SHALL draw the holiday list's loading state only while it holds no rows to draw, and
the summary's only while it holds no figures for the year on screen.

THE SYSTEM SHALL re-read the summary when the year changes, and not when the country filter
changes.

Everything already drawn stands until what replaces it arrives — through a year change, a
country change, a sync, a save and a delete alike. An error still replaces the list, because an
error is a screen with nothing to show.

**What it looks like when it is wrong.** Anything a person does empties the screen first.

## Contracts

No route, no message, no `data-testid`. `holidays-loading-skeleton` is still drawn on the first
read of the screen — the one read that has nothing behind it — and is absent from every read
after it.

## Cases

**None written, at the user's direction** — asked for as patch, code, commit, with the
regression waived.

The cost: a test that waits for `holidays-loading-skeleton` after the first paint now waits for
something that never appears. The case this would carry asserts `holidays-table` is present
continuously across a country change.

## Blast radius

- **Settings › Holidays only.** Both reads live in that page's own component.
- **The in-flight flag is gone from the list read**, because nothing was left that read it. The
  summary keeps its own, which now only decides the very first paint.
- **A year change shows the previous year's rows for a moment.** Every band names its own month
  and year, so nothing on screen is mislabelled while it stands. The summary still waits on a
  year change, because its heading names the year and its figures would be a lie under another.
- **An empty result now shows the empty state while a re-read runs**, where it used to be held
  back and drew a table with a head and no rows.

## Not in this patch

- **The first paint's preloader.** A screen with nothing on it has nothing to keep.
- **The summary going stale after a holiday is added or deleted.** It is not re-read on either,
  which is a separate defect that predates both patches.
