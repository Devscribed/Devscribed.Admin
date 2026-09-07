---
id: "PATCH-013"
title: A refresh replaces what a previous import wrote
surface: api
supersedes: time-off/02
requirement: null
cases: []
files: 1
---

## Why

**Refresh** re-asks the provider and then writes only the dates that are free — and the dates
are not free, because the previous import is sitting on them. So a refresh of a country that
was already imported writes nothing at all: every entry comes back `skipped`.

That makes the button useless for the one thing it exists for. A public holiday whose date was
corrected upstream, a name that changed, a day the provider withdrew — none of it can ever
reach the screen, because the stale row itself is what blocks the corrected one. The only way
to see the new answer today is to delete every row by hand first.

## The rule

THE SYSTEM SHALL delete every holiday a previous import wrote for a country and year —
`source` = `imported` — before writing the answer a refresh fetched for that country and year.

THE SYSTEM SHALL NOT delete a holiday somebody added by hand, whatever its date or country, and
such a row SHALL continue to occupy its date so the import that follows skips that day.

THE SYSTEM SHALL delete nothing when the provider does not answer: a country the refresh could
not source keeps the rows and the import record it already had.

A sync that is **not** a refresh is unchanged — a country with an import record is not fetched
again and nothing is deleted.

**What it looks like when it is wrong.** Refresh reports every entry skipped and the list does
not change.

## Contracts

No route, no message, no `data-testid`. `POST .../holidays/sync` answers the same body; the
`written` count of a refresh now reflects the rows actually written rather than reading zero.

## Cases

**None written, at the user's direction** — asked for as patch, code, commit, with the
regression waived.

The cost: nothing holds the deletion's own boundary, which is the part worth holding. The cases
this would carry are integration ones — a refresh over a manual row leaves it and skips its
date; a refresh whose provider call fails leaves the year as it was; a refresh replaces an
imported row whose name changed upstream.

## Blast radius

- **Refresh becomes destructive of imported rows, by design.** A refresh of a stored year now
  deletes and rewrites it. That is what the button was for and what it did not do.
- **An imported row somebody EDITED is replaced by the provider's own text.** Editing a row is
  not the same as adding one, and no flag separates them: the row is still `imported`. The
  smaller of the two wrongs — the alternative is a refresh that cannot correct a row anybody
  ever touched.
- **The delete and the write are not one transaction.** A failure between them leaves the year
  short until the next refresh; the pre-existing sync takes no lock either, for the reason its
  own docstring gives.
- **Rows an admin deleted on purpose come back**, which is already what a refresh means.
- **No other route deletes anything new.** The automatic sync (`refresh: false`) never reaches
  the deletion at all.

## Not in this patch

- **Marking an edited import as manual**, which would protect the edit. It is a change to the
  edit route and a column's meaning, not to the sync.
- **Removing rows for a country that left the sourced set.** A refresh only touches the
  countries it is sourcing; the standing rule that stored holidays survive a country leaving the
  set is untouched.
