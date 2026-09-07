---
id: "PATCH-014"
title: The country filter stands on the list it filters, and says so
surface: ui
supersedes: time-off/02
requirement: null
cases: []
files: 1
---

## Why

The country filter is an unlabelled select at the top of the Holidays screen, in the row that
used to hold the organization country picker — a control that governed the whole organization.
It reads as though it governs the screen, and it does not: it filters the **list of holidays**
and nothing else. The summary above it is a total over every country and does not move.

So choosing a country changes nothing a person is looking at. The list is below the summary,
often below the fold, and the only visible effect is a moment's wait. There is no label to say
otherwise, because the label the row had belonged to the picker that is now gone.

## The rule

THE SYSTEM SHALL draw the country filter directly above the holiday list, labelled with what it
does, and SHALL leave the summary above unfiltered — a year's totals are a total for the year.

**What it looks like when it is wrong.** A control sits above a block it does not change.

## Contracts

No route, no message. `holidays-country-filter` and `holidays-country-filter-input` keep their
places on the same two nodes; only where they are drawn changes. The list request is unchanged —
`?country=` when a country is chosen, absent when it is not.

## Cases

**None written, at the user's direction** — asked for as patch, code, commit, with the
regression waived.

The cost: nothing holds the control's position, and a selector finds it wherever it is. The
case this would carry asserts the filter is drawn after `holiday-summary` and before
`holidays-table`.

## Blast radius

- **The top row now holds the sourcing panel alone**, right-aligned as it already was.
- **The filter gains a label**, so the control is 21px taller and the list moves down by that
  much. It is the only labelled control on the screen, which is what a lone filter should be.
- **Nothing about what is filtered changes.** The same rows, the same request, the same empty
  state naming the country and the year.

## Not in this patch

- **Filtering the summary by country.** It would mean days and money recomputed over a subset
  of countries, which is a different question from the one the summary answers — and a real
  feature, with a query parameter, a per-country total and its own cases.
- **A second filter for the summary.** Same decision, and one screen with two country pickers
  is the thing this patch exists to avoid.
