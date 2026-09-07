---
id: "PATCH-019"
title: A button holds its label, chips share a line, and Projects opens
surface: api+ui
supersedes: user-management/05, projects/11, design-system
requirement: null
cases: []
files: 7
---

## Why

**A button cut its own label in half.** `Button` is a fixed 44px box — `height:
--control-height` — and its label was free to wrap. In `Add Members`, `FormActions` caps the
row at 240px and splits it between two buttons, so `Add selected (1)` had about 115px, wrapped
to two lines, and drew its second line outside the button's paint. A label that needs more room
than it has should say so by overflowing sideways; one sliced by the button's own edge reads as
a broken control.

**A two-chip filter drew as a column.** The search `<input>` inside a multi-select carries an
`<input>`'s 20-character intrinsic width as its flex basis, and a flex line is broken on the
basis before anything is allowed to shrink — so every chip after the first started a new line.
[PATCH-010](PATCH-010-a-single-select-is-one-line-tall.md) fixed exactly this for the single
select and left the multi alone, naming it as not-in-that-patch on the grounds that no screen
showed it. The Teams filter shows it. `MultiFilter`'s own docstring claims 200px is "wide
enough for two chips", which was never true while the input took 150 of them.

**Projects was a disabled word.** The member's Projects tab has been drawn greyed out since the
screen was built, waiting for a spec. What it needs is one filter on a route that already
exists.

## The rule

THE SYSTEM SHALL draw a button's label on one line, whatever the width of the slot it is
given.

THE SYSTEM SHALL pack a multi-select's chips onto the line while there is room for them, and
SHALL move the search input to a line of its own only when less than a word's width is left.

THE SYSTEM SHALL open the member's Projects tab, listing the active projects that member is
assigned to — the project's name, its client, and how many people are on it — each row
navigating to the project. A member on no active project gets an empty state saying so.

THE SYSTEM SHALL answer `GET .../projects?membershipId=` with the projects that member is on,
narrowing what the caller may already see and never widening it: a caller who may manage
projects reads any member's assignments, and one who may not is answered with an empty list for
anybody but themselves.

**What it looks like when it is wrong.** A button's text runs past its own edge; two chips
stand in a column with room beside them; a tab is drawn and cannot be opened.

## Contracts

`GET /organizations/{orgId}/projects` gains **`membershipId`**, optional, a single value. No new
status: a `viewer` is refused by the route's own 403 as before, and an id that names nobody in
this organization matches no project rather than erroring — a filter over a catalogue the
screen was handed is not the place to validate identity.

`MultiFilter` gains an optional `width` (default 200, the reports bar's budget).

New: `member-projects-panel`, `member-projects-row-{projectId}`, `member-projects-empty`,
`member-projects-retry-btn`. `member-detail-tab-projects` keeps its id and stops being
`disabled`.

## Cases

**None written, at the user's direction** — asked for as one patch, code, commit, with the
regression waived.

The cases this would carry: an integration one per branch of `membershipId` (a manager reads
another member's list; a user asking about somebody else gets nothing; an id from another
organization matches nothing), and an E2E one opening the tab and finding the row for a project
the member is on. The two design-system rules want geometry assertions — a button's label box
inside its border box, and two chips with equal `y`.

## Blast radius

- **Every button in the product stops wrapping its label.** Where one was wrapping it was
  already broken; where it was not, nothing changes.
- **Every multi-select packs its chips.** The reports filters are the other caller, at 200px,
  and they gain a line rather than losing one.
- **`GET .../projects` answers a narrower list when asked.** Unasked, byte for byte what it
  answered before — the parameter defaults to absent and every existing caller omits it.
- **The member screen makes one more request, and only on the Projects tab**, which is mounted
  when the tab is shown.
- **Projects is now reachable from two places** — the Projects screen and a member. The tab
  reads, and writes nothing: assignment stays where it was, on the project.

## Not in this patch

- **Assigning a member to a project from this tab.** Reading is the tab; the write has a
  roster, a modal and a capability of its own on the project side.
- **Archived assignments.** Archiving a project does not unassign anybody, so an archived
  project is still an assignment on paper. The tab answers what somebody is working on, which
  is the active list; showing both wants a column saying which is which.
- **Roles and Payments.** Still disabled, still waiting for their own specs.
- **The chip's own paint.** The 7px blue edge and its geometry are §20's, and a chip that looks
  cramped in a 200px box is a question about the chip, not about this line break.
