---
id: "PATCH-018"
title: The Holidays screen reads top to bottom, and filters by team
surface: api+ui
supersedes: time-off/02, design-system, PATCH-014, PATCH-015, PATCH-016
requirement: null
cases: []
files: 6
---

## Why

Five things on Settings › Holidays, taken together because they are one screen's shape and
splitting them would put five documents on one layout.

**The band of empty screen.** Sourcing was a titled column on a row of its own under the year
tabs. That row used to hold the organization country picker too; with the picker gone
([PATCH-012](PATCH-012-a-member-states-their-own-country-or-none.md)) a single button is left
holding a whole row open, and the gap between the tabs and the summary reads as something
missing.

**The year tabs still threw the page around.** The summary block waited whenever the figures it
held were for another year — which is every moment between pressing a year and its figures
arriving — and two tables were replaced by a preloader card a fraction of their height.
[PATCH-015](PATCH-015-the-wait-is-drawn-when-there-is-nothing-to-draw.md) stopped the list doing
this and left the summary doing it, because the summary had a second reason: its headings name
the year, and last year's figures under this year's heading would be a lie.

**The empty state landed at the bottom of the window.** `EmptyState` pushes its message down by
150px, so that on a page whose only content is a list the sentence sits where the rows would
have been. Under two summary tables it sits below everything instead, alone against the bottom
of the viewport. The same 150px is wrong inside a modal, which is where three other call sites
put it.

**There is no way to ask about one team.** The summary answers for every active member, and an
organization that wants to know what one team's holidays cost has to read the rows and add up.

## The rule

THE SYSTEM SHALL draw the year tabs and the sourcing controls on one line, the tabs at its start
and the Refresh button at its end, with the sync status line between them.

THE SYSTEM SHALL label every heading of the summary from the year of the figures it is drawing,
and SHALL keep those figures on screen while the figures for another year are fetched.

THE SYSTEM SHALL draw an empty state centred in the box it is given, with no offset of its own,
and SHALL draw the holiday list's empty state inside the card the table would have filled.

THE SYSTEM SHALL offer a **Teams** filter above the summary, listing the organization's active
projects and an `Unassigned` entry, and SHALL compute the summary over the members on the ticked
teams — every active member when nothing is ticked.

THE SYSTEM SHALL NOT narrow the holiday list by team: a holiday belongs to a country.

**What it looks like when it is wrong.** A control acts on a block that does not move; a year
tab resizes the page; a sentence explaining an empty list is nowhere near the list.

## Contracts

`GET /organizations/{orgId}/holidays/summary` gains **`projectIds`**, repeatable
(`projectIds=a&projectIds=b`), the same shape and the same `Unassigned` sentinel the calendar's
team scope uses. Absent or empty means every active member. An id naming no project of the
organization narrows to nobody rather than being refused — a filter is a selector over a
catalogue the screen was handed, and a stale id in it is not a malformed request. No new status
and no new message.

New: `holidays-teams-filter`, with `holidays-teams-filter-item-{projectId}` per row, which is
`MultiFilter`'s own pattern. Every other test id on the screen is unchanged, `holiday-summary`,
`holiday-sourcing-panel`, `holiday-sourcing-status` and `holidays-empty-state` included.

## Cases

**None written, at the user's direction** — asked for as one patch, code, commit, with the
regression waived.

The cost is largest on the team filter, which is the only part of this that is a rule about
money rather than about pixels. The cases it would carry are integration ones: a ticked team
narrows `members` and `memberCount` and leaves `holidayCount` alone; `Unassigned` collects the
members on no non-archived project; a member on two ticked teams appears once; an empty
selection answers for everybody; an id from another organization narrows to nobody.

## Blast radius

- **`EmptyState` loses its 150px offset everywhere** — every empty list in the product, and the
  three inside modals where the offset was plainly wrong. It gains the vertical padding a
  loading block carries, so a list that swaps one for the other does not move.
- **The summary is now narrowed by a filter, and the money in it with it.** Amounts Owed is a
  different screen and is untouched: this parameter exists on one route.
- **`buildSummary` gains an optional `membershipIds`.** Its other caller, the integration suite,
  passes none and reads what it read.
- **The year tabs share a line**, so a narrow viewport wraps sourcing under them rather than
  beside them. Nothing overlaps at any width.
- **One more request on load** — the project catalogue, the same one the calendar fetches.

## Not in this patch

- **Extracting "which memberships are on these teams".** The calendar states this rule over its
  own query and the summary now states it over another; two copies of one rule is exactly what
  this repository warns about. The extraction wants a home neither module owns and a decision
  about where team scope lives, which is a spec's decision, not a patch's.
- **Filtering the holiday list by team.** Named in the rule above as something the filter
  deliberately does not do.
- **A team column in the member table.** The filter says which team is being asked about; a
  column would have to say all of them, for members on several.
