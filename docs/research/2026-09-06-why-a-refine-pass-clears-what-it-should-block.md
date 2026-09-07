# Why a refine pass clears what it should block

`specs/time-off/01-vacation-calendar.md` was admitted by `/refine` with a `pass`, and the `/ship`
review then blocked on defects of the specification. This is the measurement of why, and of what
changed the answer.

Every number below comes from a ledger, a verdict or a run log on disk. Where a claim has no
artefact behind it, it is marked as an impression.

## The ground truth

The bundle is `specs/time-off/01-vacation-calendar.md` and its members, frozen at `77f52afb`, a
worktree of the state the original run judged. Every arm below judges that same bundle, so the
numbers are comparable to each other and to the baseline.

The baseline is the run recorded at `3ef9a3c`, `.workflow/refine/time-off-01.loop.json`:

| | |
|---|---|
| shape | `sharded` |
| round 1 | 2 blockers, 5 fixed, 5 decided, 60 lines added |
| round 2 | clean — status `pass` |
| wall clock | 15:50 → 16:16, one repaired round |

Two blockers found, admitted, and the pipeline then blocked downstream. The question is not why
refine was slow; it is why it found two.

## What one bundle actually contains

Judged repeatedly at `effort: high`, the same frozen bundle yields 12–15 distinct blockers per
first round, and the union across arms is larger than any single arm. Against the baseline's two,
the bundle holds at least an order of magnitude more admissible defects than the run that admitted
it saw.

The free gate alone — `scripts/spec-lint.mjs` as it stands after this work — reports 11 findings on
that bundle, none of which needs a model to state.

## The arms

| arm | round 1 | after one repair | rounds | wall clock | what it was |
|---|---|---|---|---|---|
| baseline `3ef9a3c` | 2 | 0 (`pass`) | 2 | 26 min | `sharded`, `effort: medium` |
| `ab-full` | 14 | 1 | 2 | 55 min | `solo-minimal`, `effort: high` |
| `ab-e2` | 12 | 2 → 1 | 3 | 78 min | + the reading rules |
| `ab-one` | 14 + 11 lint | 4 | 2 | 55 min | + lint into the verdict |

`ab-full` reached one blocker and is **not** the best result: its fixer answered two findings by
inventing routes — `GET /api/organizations/{orgId}/settings/country` with `REQ-01-041` and two
integration cases, and `GET .../time-off/calendar/options` with `REQ-01-042`, an integration case
and an acceptance criterion. Both are forbidden by the fixer's own no-surface rule, and no judge
criterion covers the fixer's constitution, so neither was reported. The spec grew two features
nobody asked for and the loop called it convergence.

`ab-one` is the best valid result: 25 findings entering one repair pass, 4 blockers left, no
invented surface, and every repair carrying its plan.

## The single largest lever: effort

Same shape, same bundle, same prompts; only `effort` in the agent's frontmatter moved.

| | `medium` | `high` |
|---|---|---|
| distinct blockers, union of two passes | 9 | **14** |
| expiring-fixture cases found (of 4) | 1 | **4** |
| cost | ~$10 | $13.52 |
| wall clock | ~15 min | ~20 min |

Enumeration was complete at both settings — 32 of 32 cases listed either way. What `high` buys is
thought per enumerated item, which is exactly what the register asks for.

## The hypotheses that died

### Parallel sharding

Fifteen sonnet shards read genuinely in parallel — 6.45× — and lost anyway. The lead's two serial
opus phases cost more than the whole of `solo-minimal`: 680 s to plan the split and 1007 s to merge
what came back. Fifteen sonnet readings of a bundle cost more than two opus readings of it. Kept
selectable as the `planned-15` shape; not the default.

### Splitting the register between two judges

At `effort: high`, giving each pass half the admission register produced **11** blockers against
solo's 14, and 2 of 4 date cases against 4 of 4. A pass owning forty criteria raised five blockers;
a pass owning all sixty raised twelve. Depth per criterion, not criteria per pass, is what finds
defects — and a defect that is both a stale claim and an untestable case falls between two halves
that each hold one of those families.

### Prose rules in an agent definition

Five rules were added to `spec-reviewer.md` and `spec-fixer-minimal.md` as prose and measured
afterwards. Three changed nothing at all:

- "a dependency is settled by something you did not just write" — the next run's record said
  `settledBy: "the paragraph states it"`, verbatim the forbidden form;
- "a default is what a repair gets wrong" — the next run repeated the same default error;
- "nothing is settled by the text that states it" — the next run cleared two cases with
  `settledBy: "cases.md:228-236"`, their own lines.

The same rules, expressed as a **field the loop reads**, changed behaviour on the first run every
time. This is the most reliable finding in the whole exercise and it is stated as ADR 0020.

### A mechanical "settledBy names a place" check

Proposed as the enforcement for the circular-settlement rule, and abandoned after measurement: of
16 dependencies recorded in one fixer run, 6 would have been rejected, and inspection showed most
of those legitimate — a repair that *decides* a question and writes the decision into a case is
correctly settled by that case. A regular expression cannot separate deciding from asserting. The
structured-field gate replaced it.

## What the gates cost and catch

| gate | cost | what it caught on this bundle |
|---|---|---|
| `spec-lint` (T0) | 0 | 11 findings: 4 expiring fixtures, 4 undeclared DS tokens, 1 colour literal, 2 environment facts in the Verification Plan |
| `spec-reviewer` (T2) | ~$13, 20 min per round | 12–15 blockers |
| `spec-fixer-minimal` | ~$11, 20 min | 37 repairs in one pass at its best |

Two of the free gate's findings were also raised by the judge as paid blockers — the DS band token
under `S-22`, and three of the four expiring fixtures under `S-36`. On this bundle the judge found
**three of the four** date cases; the script found four of four, because enumeration is what a
script is for and sampling is what a judge does when the list is long.

### A measurement error worth recording

Every arm before `ab-one` ran with a `spec-lint.mjs` four rules weaker than the build branch's,
because the experiment worktrees were seeded with the loop, the agents, the config and the register
but not the lint. The runs reported `T0 clean` on a bundle that the current lint reports 11 findings
on. Arm-to-arm comparisons stand — the weakness was identical across arms — but every blocker count
above overstates what the model layer must do.

## The defect families, and which end they come from

Three rounds of attributing round-2 blockers to the diff of the round-1 repair, rather than to
impression:

**The repair touched one end of a join.** Six of six round-2 blockers in one arm. Outward: the
repair changed a rule and left a sibling standing. Inward: the repair introduced a referent —
"the month the calendar opens on" — that the bundle never decides, and settled it in one of the two
cases it wrote it into.

**The container was read instead of the value.** The judge cleared
`MemberProfile.country is a masked sensitive field` with `settledBy: member-profile.service.ts
SENSITIVE_PROFILE_FIELDS` and `ok: true`; that constant's members are `taxId`, `dateOfBirth`,
`idDocumentNumber`, `bankDetails`, and `country` is not among them. The fixer wrote that
`GET .../projects` returns every project in the organization for an admin, having read the `where`
clause and the comment above it — `// admin/manager see all projects, filtered by the status query
param` — without following `parseProjectStatusFilter(undefined)`, which is `'active'`.

**The set was left incomplete.** The judge raised three of four expiring fixtures; the fixer wrote
`subject: "the absolute 2026 dates three cases seed"` when four cases seed them. Both ends of the
loop find the kind and stop before the last instance of it.

## What the structured gates did

`requireRepairPlan` — the fixer's record must name each repair's subject, the search that found its
places, the places left standing, and what the new text leans on:

| | before | after |
|---|---|---|
| repairs recording a plan | **0 of 28** | **26 of 26**, then 27 of 27, then 23 of 23 |
| routes invented by the fixer | 2 | 0 |
| round-2 blockers of the join family | 4 | 1, then 0 |

`produces` on every testability item — for each value the expected result asserts, the rule, column,
route or fixture that has to yield it:

| | before | after |
|---|---|---|
| testability items carrying it | — | **34 of 34** and **32 of 32**, first run |
| round-1 blockers, union | 14 | **15** |
| raised by both passes | 3 | **7** |
| `TC-01-INT-12` | cleared `ok: true` in both passes, found in round 2 | blocker in round 1, both passes |

The reasoning the field forced out of the judge, verbatim from the verdict:

> A=PL needs `MemberProfile.country`; B=US needs `phoneCountryCode`; C=PL needs
> `Organization.countryCode='PL'`; D=null needs `Organization.countryCode=null` — one column, two
> values, in the response the case reads once

That is the S-36 procedure, which the register has always stated and which no pass had performed.

## Time and rounds

One judged round is two judge passes in parallel (~15–20 min, ~$13) plus one fixer pass (~20 min,
~$11). A two-round loop is therefore about 55 minutes and $50, a three-round loop about 78 minutes.

The baseline's 26 minutes bought two blockers. The current configuration's 55 minutes buys 25
findings closed in one repair pass. The loop did not get slower for its own sake; it started doing
the work.

## An operational defect found on the way

A stage's fuse measures wall-clock time. A machine that sleeps mid-run burns it: both judge passes
of one overnight run reported `41233s, no result message` against a 45-minute fuse, and the loop
retried them, correctly, in the morning. Not fixed here.
