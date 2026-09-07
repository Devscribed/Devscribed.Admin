---
id: "03"
title: Calendar range and scope defaults
routes: ["/org/{orgId}/time-off/calendar"]
api: ["GET /api/organizations/{orgId}/time-off/calendar"]
entities: []
tags: [vacation-calendar, date-range, window, scope, teams, people, filter-defaults, wallchart]
depends-on: ["01"]
bundle:
  - 03-calendar-range-and-scope.contracts.md
  - 03-calendar-range-and-scope.cases.md
---

## Summary

The Time off calendar can be pointed at an arbitrary span of days, and its Teams and People
scopes stop refusing to draw anything until something is ticked. Today the reader has three
fixed windows — Week, 2 weeks, Month — so a question about a specific fortnight that straddles
two months, or about the run-up to a release, cannot be asked at all; and switching Scope to
Teams replaces the chart with "Choose at least one team.", which is a refusal where every other
filtered surface in this product reads an empty filter as *all*. This spec adds a **Range**
window driven by the design system's `DateRangePicker`, and makes an empty Teams or People
selection mean every member the caller may see, exactly as an empty Members filter already does
on the reports.

Beyond the request, this spec adds two things. It **removes two refusals from a shipped route**
— `GET .../time-off/calendar` stops answering `422 teamsRequired` and `422 peopleRequired` — and
that is a contract other things read, which is why this is a spec and not a patch. And it fixes
the day-column geometry for a window that can now be far wider than a month, because the existing
grid divides the available width by however many days it is given, and the widest range this spec
allows drawn that way is unreadable.

No route is added, no entity is created, no migration is written: the endpoint already takes
`startDate` and `endDate` and already bounds the span at 92 days.

Blast radius and backward compatibility for this spec are in [README.md](README.md).

## Actors & Preconditions

| Actor | Precondition |
|---|---|
| `admin`, `manager`, `user` | An active membership in the organization, holding `view-time-off-calendar`. Reaches the calendar from the Time off sidebar group |
| `viewer` | Holds no `view-time-off-calendar`; the sidebar row is not rendered and the route answers `404` |

The window, the scope and the range are in-page state and are not in the URL — the rule
`time-off/01` set for the three presets, unchanged here.

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| Open the calendar | ✅ | ✅ | ✅ | ❌ |
| Choose a custom range | ✅ | ✅ | ✅ | ❌ |
| See every active member under an empty Teams or People selection | ✅ | ✅ | ✅ | ❌ |

The role is read **normalized**: a membership still storing the legacy `member` value is read as
`user` and is answered `200`, which is the reading the sidebar is drawn from.

## Functional Requirements

### Scope defaults

#### REQ-03-001 — an empty Teams selection means every member

WHILE the scope is `teams` and no team is selected, THE SYSTEM SHALL answer `200` with every
active membership of the organization, in the same order and the same shape the `all` scope
answers with.

#### REQ-03-002 — an empty People selection means every member

WHILE the scope is `people` and no person is selected, THE SYSTEM SHALL answer `200` with every
active membership of the organization, in the same order and the same shape the `all` scope
answers with.

#### REQ-03-003 — the two refusals are withdrawn

THE SYSTEM SHALL NOT answer `GET /api/organizations/{orgId}/time-off/calendar` with `422` for an
empty `projectIds` or an empty `memberIds`, under any scope.

**Decided:** the two message exports these refusals carried are deleted from
`packages/validation` rather than left unused — they are named in the Withdrawn table of the
contracts file. A message no route can emit is a message a future screen will emit for a rule
nobody wrote.

#### REQ-03-004 — the picker says what an empty selection does

WHILE the scope is `teams` or `people` and nothing is selected, THE SYSTEM SHALL draw the
picker's placeholder as `All`.

#### REQ-03-005 — the screen spends the request

WHEN the scope changes to `teams` or `people` with nothing selected, THE SYSTEM SHALL issue the
calendar request.

#### REQ-03-016 — nothing is refused, so nothing is announced

WHILE the scope is `teams` or `people` and nothing is selected, THE SYSTEM SHALL draw no error
banner.

#### REQ-03-006 — a selection still narrows

WHILE the scope is `teams` and at least one team is selected, THE SYSTEM SHALL answer with the
members of the selected teams only, and WHILE the scope is `people` with at least one person
selected, with the selected people only.

### The custom range

#### REQ-03-007 — a fourth window

THE SYSTEM SHALL offer a fourth window option, **Range**, beside Week, 2 weeks and Month.

#### REQ-03-008 — the range is picked on a grid

WHEN the **Range** window is active, THE SYSTEM SHALL draw a `DateRangePicker` whose two ends
become the request's `startDate` and `endDate` unchanged.

#### REQ-03-009 — the invalid span is unreachable

WHILE the **Range** window is active and a start has been armed, THE SYSTEM SHALL bound the
picker so that no end more than 91 days after that start can be chosen.

#### REQ-03-010 — the server still refuses a span it is handed

IF `GET /api/organizations/{orgId}/time-off/calendar` receives a span longer than 92 days, THEN
THE SYSTEM SHALL answer `422` with `TIME_OFF_CALENDAR_MESSAGES.rangeTooWide`.

#### REQ-03-011 — stepping a custom range

WHEN `‹` or `›` is clicked while the **Range** window is active, THE SYSTEM SHALL move both ends
by the range's own length in days, preserving that length.

#### REQ-03-012 — Today under a custom range

WHEN **Today** is clicked while the **Range** window is active, THE SYSTEM SHALL keep the
range's length and set its start to the caller's today.

#### REQ-03-013 — leaving the custom range

WHEN the window changes from **Range** to a preset, THE SYSTEM SHALL open that preset on the
window containing the custom range's start.

#### REQ-03-017 — entering the custom range

WHEN the window changes from a preset to **Range**, THE SYSTEM SHALL seed the range with that
preset's current start and end.

### Geometry

#### REQ-03-014 — a day column has a floor

WHILE the grid is drawn, THE SYSTEM SHALL give every day column a minimum width.

#### REQ-03-018 — a grid wider than its space scrolls

IF the day columns at their minimum width are wider than the space available, THEN THE SYSTEM
SHALL scroll the grid horizontally inside its own container.

#### REQ-03-015 — the navigation controls hold their position

THE SYSTEM SHALL reserve, for the range label, the width of the widest label any window can
produce, so that `‹`, **Today** and `›` occupy one position throughout a session.

## Decision table — what a scope and a selection resolve to

`decision-table: keys=(scope, selection) domains=(scope: all|teams|people, selection: empty|nonEmpty)`

| scope | selection | Outcome |
|---|---|---|
| all | empty | Every active membership. The selection control is not drawn. |
| all | nonEmpty | Unreachable — the `all` scope draws no picker, so no selection can exist. |
| teams | empty | Every active membership (REQ-03-001). `200`. |
| teams | nonEmpty | The members of the selected teams, `Unassigned` included when ticked (REQ-03-006). `200`. |
| people | empty | Every active membership (REQ-03-002). `200`. |
| people | nonEmpty | The selected memberships only (REQ-03-006). `200`. |

## Decision table — where a window control lands

`decision-table: keys=(window, control) domains=(window: week|2weeks|month|range, control: prev|next|today)`

| window | control | Outcome |
|---|---|---|
| week | prev | The anchor moves back 7 days; the window is that anchor's week. |
| week | next | The anchor moves forward 7 days. |
| week | today | The anchor becomes the caller's today. |
| 2weeks | prev | The anchor moves back 14 days. |
| 2weeks | next | The anchor moves forward 14 days. |
| 2weeks | today | The anchor becomes the caller's today. |
| month | prev | The anchor moves to the 1st of the previous calendar month. |
| month | next | The anchor moves to the 1st of the next calendar month. |
| month | today | The anchor becomes the caller's today; the window is that month. |
| range | prev | Both ends move back by the range's length in days (REQ-03-011). |
| range | next | Both ends move forward by the range's length in days (REQ-03-011). |
| range | today | The start becomes the caller's today; the length is kept (REQ-03-012). |

## Out of Scope

- **Putting the window in the URL.** `time-off/01` decided the window is in-page state, and a
  shareable calendar link is a decision about every control on the screen, not about this one.
- **A Quarter preset.** The 92-day bound was chosen to leave one addable; the custom range now
  reaches every span a Quarter would, so a named preset is a convenience, not a capability.
- **Presets inside the `DateRangePicker` panel.** The component supports them and the reports
  use them; the window control beside it already is the preset row.
- **Absence types, a balance column, and anything the calendar does not draw today.** Unchanged
  from `time-off/01`.
- **The stale-grid defect and the header jump.** Both are already filed —
  [BUG-012](../bugs/BUG-012-calendar-grid-keeps-the-last-window-that-loaded.md) and
  [BUG-013](../bugs/BUG-013-calendar-header-shifts-with-the-range-label.md). REQ-03-015 states
  the width this spec's own label needs; it does not restate BUG-013's fix.

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| A 92-day range is 92 columns and scrolls | The reader asked for the span; the alternative is aggregating days, which is a different chart | A density control, or a week-column rendering for spans over a month |
| An empty Teams selection and the `all` scope produce identical responses | They are the same question asked two ways, and the scope control keeps the reader's intent visible | Nothing needs to; a `teams` scope that meant "everybody who is on some team" would exclude the unassigned, which is a narrowing nobody asked for |
| `Unassigned` cannot be excluded under an empty selection | An empty selection means no narrowing at all | Ticking every team, which is the control that already expresses it |
| The custom range does not survive a reload | The window is in-page state by `time-off/01`'s decision | Putting the window in the URL, named Out of Scope above |
| The verification plan was not walked — every row of it reads `not run` | The bundle was written from the code and from screenshots of the running app, and the routes to each state were established by reading the helpers | Bringing the rig up and re-recording the plan with what answered, before the run is paid for |
| No fixture can seed more than 100 active memberships, so Edge case 1 is unreachable | It is the refusal that replaces the one being withdrawn, and it is the one state this spec most needs to see | A seeding fixture under `apps/api/src/test-support/`, declared as a task this spec owes in the cases file |

## Acceptance Criteria

| # | Criterion | Observed by |
|---|---|---|
| 1 | Switching Scope to Teams with nothing ticked draws the chart, not a banner | TC-03-E2E-11 |
| 2 | Switching Scope to People with nothing ticked draws the chart, not a banner | TC-03-E2E-11 |
| 3 | The route answers `200` for an empty `projectIds` under `scope=teams` | TC-03-INT-21 |
| 4 | The route answers `200` for an empty `memberIds` under `scope=people` | TC-03-INT-22 |
| 5 | A non-empty selection still narrows the rows | TC-03-INT-23 |
| 6 | A span over 92 days is still refused with `rangeTooWide` | TC-03-INT-24 |
| 7 | The **Range** window fetches the two dates that were picked | TC-03-E2E-12 |
| 8 | `‹` and `›` under a custom range preserve its length | TC-03-UNIT-11 |
| 9 | **Today** under a custom range preserves its length and starts on today | TC-03-UNIT-12 |
| 10 | Switching between **Range** and a preset carries the position across | TC-03-UNIT-13 |
| 11 | A range wider than the viewport scrolls rather than compressing its columns | TC-03-E2E-13 |
| 12 | `calendar-today` holds one horizontal position across every window | TC-03-E2E-13 |
| 13 | No day column is narrower than the declared minimum | TC-03-E2E-13 |
| 14 | An empty Teams or People selection draws no banner | TC-03-E2E-11 |
| 15 | Switching a preset to **Range** seeds the range from that preset | TC-03-UNIT-13 |
