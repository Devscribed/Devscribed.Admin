# Patch Notes

One file per patch: `PATCH-NNN-slug.md`. A patch is a change of agreed behaviour small enough
to state and check in one file — a field moves, a control is disabled until another is chosen,
an input gains a bound.

Write one with the [`patch`](../../.claude/skills/patch/SKILL.md) skill (`/patch`), then ship
it on the light track:

```bash
node scripts/ship.mjs specs/patches/PATCH-NNN-slug.md --branch fix/<slug>
```

## The three weights

| Document | Answers | Admitted by | Pipeline |
|---|---|---|---|
| `specs/<area>/NN-name.md` + bundle | What should this area do? | a judged refine loop | every stage |
| `specs/bugs/BUG-NNN.md` | Why is this wrong, and whose fault? | its own verdict | no plan stage |
| `specs/patches/PATCH-NNN.md` | This rule changes — here is the new one | the skill's entry condition | no plan stage, cheap review |

The static gate and QA run on all three. They are what a lighter document buys speed against,
and they are never what it skips.

## The newest document governs

A patch supersedes what an older spec said about the behaviour it names, and it states the
whole new rule in its own text — the same rule [`CLAUDE.md`](../../CLAUDE.md) gives any newer
document. Nothing is written back into the spec it supersedes: specs are frozen once refined,
and the record of what was decided then is worth more than a document edited to look
prescient. The `supersedes` field is how the two are found together.

## When it is not a patch

The entry condition is in the skill and it is closed. A change that adds a route, touches the
schema, moves authorization, needs a third product file or a new design-system component is a
spec, and writing it as a patch only moves where the run stops.

## Index

| Patch | Title | Supersedes | Cases |
|---|---|---|---|
| [002](PATCH-002-needed-by-upper-bound.md) | A needed-by date more than five years out is refused | requests/01, requirement 8 | TC-01-UNIT-07, TC-01-INT-23 |
| [003](PATCH-003-new-request-addressee-first.md) | The addressee is chosen first, and the project chooses the contact | requests/03 | TC-03-E2E-06, TC-01-E2E-01 |
| [004](PATCH-004-holiday-country-pickers-searchable.md) | The holiday country pickers are searched by typing | organization/03 | TC-03-E2E-10, TC-01-E2E-09 |
| [005](PATCH-005-member-country-picker-searchable.md) | The member's country picker is searched by typing | time-off/01 | TC-01-E2E-13 |
| [006](PATCH-006-member-role-submitted-only-when-chosen.md) | A member's role is submitted only when it is chosen | user-management/05 | none |
| [007](PATCH-007-the-double-answers-an-unseeded-country.md) | The holiday double answers an unseeded country with holidays | time-off/02 | none |
| [008](PATCH-008-a-field-label-and-its-message-share-one-left-edge.md) | A field's label and its message share one left edge | design-system | none |
| [009](PATCH-009-the-holidays-control-row-holds-still.md) | The Holidays control row holds its width and its position | time-off/02 | none |
| [010](PATCH-010-a-single-select-is-one-line-tall.md) | A searchable single select is one line tall | design-system | none |
| [011](PATCH-011-a-re-read-does-not-blank-the-screen.md) | A re-read of the Holidays screen does not blank it first | time-off/02 | none |
| [012](PATCH-012-a-member-states-their-own-country-or-none.md) | A member states their own holiday country, or none | time-off/01, time-off/02 | none |
| [013](PATCH-013-a-refresh-replaces-what-it-imported-before.md) | A refresh replaces what a previous import wrote | time-off/02 | none |
| [014](PATCH-014-the-country-filter-stands-on-the-list-it-filters.md) | The country filter stands on the list it filters | time-off/02 | none |
| [015](PATCH-015-the-wait-is-drawn-when-there-is-nothing-to-draw.md) | The wait is drawn when there is nothing to draw | time-off/02, PATCH-011 | none |
| [016](PATCH-016-the-sourcing-panel-is-a-fixed-box.md) | The sourcing panel is a fixed box | time-off/02, PATCH-009 | none |
| [017](PATCH-017-a-refresh-clears-a-country-nobody-is-in.md) | A refresh clears the imports of a country nobody is in | time-off/02, PATCH-012 | none |
| [018](PATCH-018-the-holidays-screen-reads-top-to-bottom.md) | The Holidays screen reads top to bottom, and filters by team | time-off/02, design-system, 014, 015, 016 | none |
| [019](PATCH-019-a-button-holds-its-label-and-projects-opens.md) | A button holds its label, chips share a line, and Projects opens | user-management/05, projects/11, design-system | none |
| [020](PATCH-020-a-filter-states-its-selection-on-one-line.md) | A filter states its selection on one line | design-system, 019 | none |
| [021](PATCH-021-a-holiday-name-does-not-set-the-header-s-height.md) | A holiday's name does not set the calendar header's height | time-off/01 | none |
| [022](PATCH-022-the-calendar-says-what-the-window-costs.md) | The calendar says what the window costs | time-off/01 | none |
| [023](PATCH-023-the-calendar-s-title-goes-up-a-level.md) | The calendar's title goes up a level | design-system | none |

PATCH-001 is the mock fixture the track was built against and is not indexed as product work.

**A patch supersedes a patch the same way it supersedes a spec.** 015 replaces the mechanism
011 introduced, 016 finishes what 009 half-fixed and 017 clears what 012 orphaned; each states
its whole rule and names the one it replaces in `supersedes`, and nothing is edited back into
the earlier note. Three of the four are the same lesson — a first fix that reasoned about the
cause instead of measuring it.

**006 to 023 carry no cases and were not shipped through the pipeline.** Each was written,
implemented and committed in one sitting at the user's direction, with the regression waived —
the `Cases` section of each note says so and names the case it would have carried. PATCH-012 is
also **wider than the entry condition above allows**, at nine product files, and says so in its
own text: a change that decides what people are paid is owed a spec bundle, and it was taken as
a patch deliberately rather than by mistake.

**003 depends on 002 being merged**, not merely written: it reads `requestNeededByMax` from
`packages/validation` and puts no bound on a control that the server does not also hold. That is
declared in 003's frontmatter as `depends-on: ["PATCH-002"]`, which `scripts/spec-index.mjs`
reads and the board renders — the prose here is the explanation, the field is the record.

**`depends-on` is a declaration, not a gate.** Nothing refuses a run whose dependency has not
merged; the field feeds the board and this index. What *is* enforced is that runs never overlap:
`wf init` fails while another holds `.workflow/lock`, because runs share ports and databases. So
two documents touching one file need no ordering rule of their own — 003 and
[BUG-010](../bugs/BUG-010-new-request-title-error-drawn-twice.md) both change
`NewRequestModal.tsx` and neither declares the other, because either may go first and the second
rebases.
