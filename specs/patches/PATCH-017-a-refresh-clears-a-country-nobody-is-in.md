---
id: "PATCH-017"
title: A refresh clears the imports of a country nobody is in
surface: api
supersedes: time-off/02, PATCH-012
requirement: null
cases: []
files: 1
---

## Why

[PATCH-013](PATCH-013-a-refresh-replaces-what-it-imported-before.md) made a refresh replace what
a previous import wrote — but only for the countries being sourced now. A country that has
**left** the sourced set is never visited by the sync loop at all, so its imported holidays stay
in the list for ever, reaching nobody.

That is exactly the state
[PATCH-012](PATCH-012-a-member-states-their-own-country-or-none.md) created. Removing the
organization country took the United States out of the set of an organization whose people are
all in Belarus, and left a screen of US holidays that no member can be paid and that nothing
will ever clear. Deleting them one at a time is the only route today.

## The rule

THE SYSTEM SHALL delete, on a refresh, every imported holiday of the year whose country is not
in the organization's sourced country set, together with the import record that recorded it.

THE SYSTEM SHALL NOT delete a holiday somebody added by hand, whatever country it names, and
SHALL NOT delete a global holiday — one carrying no country — which belongs to no country and
can therefore be orphaned by none.

**What it looks like when it is wrong.** A country with no members keeps its holidays through a
refresh.

## Contracts

No route, no message, no `data-testid`. `POST .../holidays/sync` answers the same body; the
cleared countries are not in `countries`, because they are not sourced.

## Cases

**None written, at the user's direction** — asked for as patch, code, commit, with the
regression waived.

The cost: the boundary is the whole rule and nothing holds it. The cases this would carry are
integration ones — a refresh clears an imported row of an unsourced country; it leaves a manual
row of the same country; it leaves a global row; it leaves every row of a country still
sourced.

## Blast radius

- **A refresh is now the way a country leaves the screen**, which is the answer to spec 02's
  standing rule that stored holidays survive their country leaving the set. That rule is
  unchanged for every other path: nothing else deletes them, and a screen that is never
  refreshed keeps them.
- **A person's imported holiday for a country they are the last member of disappears on the
  next refresh after they leave.** That is the rule as asked for, and it is a deletion driven
  by who is in the organization rather than by anybody's edit.
- **The import record goes too**, so the country is re-sourced from scratch if somebody moves
  back rather than reading as sourced-with-nothing.
- **The deletion runs before the provider is called**, so it happens whether or not the
  provider answers. It has nothing to do with what the provider says: a country nobody is in is
  a fact about the organization.

## Not in this patch

- **Clearing on anything but a refresh.** The automatic sync leaves the rows alone; deleting
  data with nobody asking is not something a page load should do.
- **Clearing other years.** A refresh names a year and clears that year.
