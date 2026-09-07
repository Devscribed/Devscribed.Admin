---
id: "PATCH-012"
title: A member states their own holiday country, or none
surface: api+ui
supersedes: time-off/01, time-off/02
requirement: null
cases: []
files: 9
---

## Why

A member who stated no country of their own was given the organization's. That chain reached
everywhere — who a country-scoped holiday is paid to, what the Holidays summary counts, what
Amounts Owed pays, which countries the sync sources — and it decides, on a person's behalf,
where they are. The organization does not know that. A company registered in the United States
whose people are all in Belarus was sourcing and offering US holidays to anybody whose
membership row happened to be blank.

The decision, taken by the product owner: **nobody inherits a country.** A member states one or
is counted for the holidays that reach everybody and nothing else. With no inheritance left
there is nothing for an organization country to do, so the setting, its picker and the checkbox
that added it to the sourced set all go with it.

**This is bigger than the patch entry condition allows** — nine product files, two of them
services that decide what people are paid — and it is recorded as a patch at the user's
explicit direction, with the pipeline waived. A spec bundle is what a change this wide is
owed.

## The rule

THE SYSTEM SHALL resolve a member's holiday country from the country stated on their own
membership, and from nothing else; a value that names no country resolves to none.

THE SYSTEM SHALL pay a member with no resolved country the global holidays only — the rows
carrying no country — in the Holidays summary, in the time-off calendar, in the holiday list
read as `mine`, and in Amounts Owed.

THE SYSTEM SHALL source public holidays for the countries active members state, and for no
other country.

THE SYSTEM SHALL NOT draw the organization country picker, its Save button, its hint, or the
`Include organization country` checkbox.

**What it looks like when it is wrong.** A member with an empty country column is counted for
some country's holidays.

## Contracts

No route changes shape, and no message text changes.

`GET`/`PUT .../settings/country` and `GET`/`PUT .../settings/holiday-sourcing` still answer, and
nothing reads what they store any more. They are left standing deliberately: deleting a route
takes its integration cases with it, and a route no screen calls changes nobody's pay. The same
goes for `Organization.countryCode` and the `OrganizationHolidaySourcing` row, which are left in
place — migrations here are additive.

Removed from the screen: `org-country-select`, `org-country-select-input`, `org-country-save`,
`holiday-sourcing-include-org-country`. Every other test id on the screen is unchanged.

## Cases

**None written, at the user's direction** — asked for as patch, code, commit, with the
regression waived.

Two unit cases asserted the rule this replaces and are **retired** where they stood, each with
a note naming what took its place: `TC-01-UNIT-01`'s fallback rows, and `TC-02-UNIT-02` whole,
which existed only to check that the organization's country joined the sourced set.

**Suites that now contradict this rule and have not been run or updated:**
`e2e/tests/holidays.spec.ts`, `e2e/tests/time-off-calendar.spec.ts`, `e2e/tests/helpers.ts`,
`apps/api/test/holiday-sourcing.spec.ts`, `apps/api/test/time-off-calendar.spec.ts`.

## Blast radius

- **A member with no country loses every country-scoped holiday**, in the summary, the
  calendar, and Amounts Owed. Where an organization country was set, this is a fall in days and
  in money for exactly those people. That is the change.
- **The sourced country set shrinks** to what members state. A country only the organization
  named stops being sourced — and holidays already imported for it are **not** deleted, which is
  spec 02's standing rule about a country leaving the set. They reach nobody who states another
  country, so they are paid to nobody; they remain visible in the list until deleted by hand.
- **The Holidays screen loses a control row.** The country filter moves up into the row the
  picker used to share with the sourcing panel.
- **Amounts Owed changes for the same people, on the same day.** It reads the same resolution.

## Not in this patch

- **Deleting the two settings routes, their controllers, and `Organization.countryCode`.** Dead
  surface, and removing it is a deletion with its own integration cases to retire.
- **Backfilling a country onto members who have none.** Nobody is guessed at: that is the point.
- **A screen that names the members who state no country.** The summary already shows them with
  a dash in the country column, and now with nothing but the global days beside it.
