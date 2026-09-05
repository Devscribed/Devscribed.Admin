# What a refine pass samples

**Question.** `specs/time-off/01-vacation-calendar` spent three `/refine` invocations and about
two hours and fifty minutes reaching a `pass`, and the `/ship` review then halted three times,
twice on findings addressed to the spec. Why does a document that was admitted still carry spec
defects, and what makes a refine loop take three invocations instead of one?

## Ground truth

The bundle's history on `spec/time-off-vacation-calendar` is the oracle. Every commit is on disk,
every judge verdict is under `.workflow/refine/`, and every review verdict is under
`.workflow/runs/2026-09-04T16-38-40_time-off-01-vacation-calendar/stages/`.

- `bf6d5ca` — what `/spec` first wrote.
- `0f20da7` — the commit the refine loop admitted.
- `40eedaa`, `a83e79f`, `30b415e` — spec repairs made *during* the ship run, after admission.

**The refine loops.**

| invocation | window | rounds | outcome | blocker keys |
|---|---|---|---|---|
| A | 13:45 → 14:54 | 2 | `not-converging` | r1: 5, r2: 5 — no overlap |
| B | 15:05 → 15:46 | 2 | `budget` | r1: 4, r2: 2 — no overlap |
| C | 15:50 → 16:35 | 2 | **pass** | r1: 2, r2: 0 (mode `change`) |

18 distinct blocker keys over five judged rounds, **none repeated**. Bundle growth per round:
+42, +65, +60, +23 net lines.

**The ship run.** pre_implement 4 attempts, implement 4, review 4 (three blocked), qa 1.
Nine distinct review findings, each raised once; three carried `target: "spec"`.

## Where the findings came from

A forensic pass classified all 27 blocking findings by origin, reading the fix records and the
spec's commit history.

- **10 of the 18 refine blockers were repair-induced**, not present in `bf6d5ca`. The findings name
  their own parents: *"Both Known Gaps rows still describe the three-link chain **this range
  deleted**"*; *"**R1's repair** moved the calendar's gate to `can(role, …)`, and `can()` does not
  normalize"*. There is a three-generation chain — A-R1 R1 → decided → B-R1 R1 → decided → B-R2 P1.
  Each repair was minimal and correct, and each opened the next.
- **Only 1 of the 3 ship-review spec blockers existed at the admitted commit.** The other two were
  manufactured by the ship run's own spec repairs — the same pattern, continuing past admission.
- **62% (13 of 21) of spec-targeted blockers are "two statements in the bundle disagree."** Every
  repair-induced finding but one is of that shape: *a minimal repair rewrites one statement and
  leaves standing the statements that agreed with the old one.*

## The measurement

The one review blocker that predated admission is `REQ-01-036` — *"a valid alpha-2 value"* on the
country writes reads either as a two-uppercase-letter pattern or as membership of the ISO 3166-1
list, so `PUT …/settings/country` with `"XX"` is answered 200 by one reading and 422 by the other.
The text had been in the bundle since loop A round 1. **Five judge passes read it and cleared it.**

So: is it findable at all, and by what?

Five worktrees detached at `0f20da7` — the exact text the loop admitted. Identical prompt (the
spec path, the originating request, "judge the document in full"), identical model (opus),
identical agent, run through `scripts/lab-run.mjs` from inside each worktree so each reads its own
`.claude/`. Four carry the register as it stood; one carries it plus a new criterion, S-59.
Wall time per pass: **about 14 minutes.**

| pass | blockers | notes | what it blocked on |
|---|---|---|---|
| `lab-base` | 2 | 7 | `REQ-01-036` [S-17] · `REQ-01-019` [S-34] |
| `lab-s2` | 3 | 6 | `REQ-01-031` [S-17] · `REQ-01-043` [S-17] · `REQ-01-036` [S-17] |
| `lab-s3` | 2 | 3 | `REQ-01-036` [S-09] · `REQ-01-030` [S-09] |
| `lab-s4` | 2 | 4 | `TC-01-E2E-07` [S-37] · `REQ-01-019` [S-34] |
| `lab-s59` | 2 | 6 | `REQ-01-036` [S-59] · `REQ-01-019` [S-34] |

**Six distinct blockers across five passes; 2.2 per pass.**

| defect | found by |
|---|---|
| `REQ-01-036` — the `XX` contradiction that halted the ship review | **4 of 5** |
| `REQ-01-019` — the calendar's landing state, never decided | 3 of 5 |
| `REQ-01-031`, `REQ-01-043`, `REQ-01-030`, `TC-01-E2E-07` | 1 of 5 each |

Two defects are found repeatedly and four are found once each — the signature of a pass that
samples a pool larger than it can hold.

### The agent, not the register

| passes | agent | shape | found `REQ-01-036` |
|---|---|---|---|
| loops A, B, C — five judged rounds | `spec-reviewer-lead` | `sharded` | **0 of 5** |
| the lab passes | `spec-reviewer` | solo | **4 of 5** |

Fisher's exact on 4/5 against 0/5 gives p ≈ 0.048. The n is five a side and the difference is not
proven; what makes it credible is the mechanism. **The `sharded` shape never sharded** — `shards: 0`
in five of the six recorded rounds, by the judge's own `shardDecision`, because the register hands
the whole contradiction family to the lead and no child can be given one. So every one of those
five passes was a lead doing the solo agent's reading *and* carrying the split decision, the merge,
the shard record and the criteria map.

`2026-09-04-three-judges-over-one-spec.md` measured the same direction and it was read as noise at
the time: its sharded arm lost S-12 and S-41 relative to the solo arms.

### What redundancy buys

From the hit rates above, on this document:

| judge passes, unioned | chance of catching `REQ-01-036` | expected distinct blockers |
|---|---|---|
| 1 | 80% | 2.2 |
| 2 | 96% | ~3.4 |
| 3 | 99.2% | ~4.2 |
| 5 | — | 6 |

Two passes run in parallel cost one extra opus pass and no wall-clock time.

## Hypotheses that died here

**"The admission register lacked a criterion for the defect that reached review."** *Killed.* The
**unmodified** register found it, under S-17, in the baseline arm. The criterion was present and
answered — answered wrongly, five times.

**"A spec judge structurally cannot reach the contradictions code review finds, because a
contradiction is invisible until an implementer has to pick a side."** *Killed.* No implementation
existed at `0f20da7`; the judge read `packages/validation/src/holidays.ts:34` itself and settled it
on the shipped validator — the same evidence the reviewer used three stages later.

**"The two registers cover different surfaces, so refine cannot pre-clear what review blocks on."**
*Demoted to a minor cause.* True for the review's L1, which had no covering criterion — that gap is
what S-59 now closes. False for the only spec blocker that predated admission.

**"`not-converging` protects a loop from grinding the same document."** *Killed.* Across all 26
rounds this repository has judged, it fired **once**, and that once was on two rounds sharing no
criterion at all. It sits after the check that halts on a repeated key, so it is reachable only
when every finding is new — which is discovery. The halt discarded five judged findings with their
repairs unmade and cost 69 minutes. `stuck-finding`, the check that measures what the message
describes, has never fired.

## A defect the union test found

`unionVerdicts` deduplicated findings on `keyOf`, which is `rule:symbol` — and the five passes
filed one defect under three different rules: `spec/ambiguous-requirement` from `lab-base` and
`lab-s2` (S-17), `spec/contradiction` from `lab-s3` (S-09) and `lab-s59` (S-59). They also
disagreed by a line on where `REQ-01-019` starts, 204 against 203.

The same key is what `stuck-finding` compares across rounds, so **a finding that survived its
repair and came back under a different rule read as something new** — which is part of why
`stuck-finding` has never fired in 26 rounds. Keying on the place, `file#symbol`, fixes both.
Replayed over all 26 recorded rounds, place-keying halts **0 rounds** the rule-keyed check did
not, so the correction costs nothing that has ever happened.

## What the numbers changed

- `refine.use` is now `solo-minimal`, on 4 of 5 against 0 of 5 and on the mechanism behind it.
  Every other shape stays selectable, and `--shape sharded` restores the old behaviour for one run.
- `refine.shapes.solo-minimal` — the solo judge with the minimal fixer, added because the two
  shapes on offer forced a choice between the judge that finds things and the fixer that does not
  grow the document.
- `judgePasses` on a shape — the judge is dispatched more than once over the same text and the
  union is what the fixer is given. Findings are identified by place and severity, each carries
  `raisedBy`, and the ones more than one pass raised sort first. Default 1, so no shape that does
  not ask for it changes. `solo-minimal` asks for 2: 96% on the defect that reached review against
  80%, for one extra pass and no wall clock when they run together.
- `not-converging` now fires on criteria that recur, not on a count; disjoint criteria are recorded
  as `discovering` and the round goes on to its repair.
- `requireSweepCounts` — of the four verdicts in this repository that ever recorded a `pass`, two
  recorded no enumeration at all: one carried no `sweeps` field and one carried prose in an array,
  and that second one is the pass that admitted this spec. A pass now carries its enumeration or it
  is a judge error.
- `spec-lint` gained three joins a judge was making by reading — the mock against the DS-gaps table,
  the permission matrix against the Guards cells, the Verification Plan against hosts, ports and
  database names. Against this bundle's history they reproduce four of the eighteen refine blockers
  (#4, #10, #12, #18) in about 0.3 seconds, find one real defect no judge ever filed, and change
  nothing across the other 34 specs in the repository.
- S-59 — the value sets a document states twice, enumerated. In the treatment arm it moved
  `REQ-01-036` from "noticed as an ambiguity" to "named as a contradiction", reached through a list
  of 12 value sets.

## What is still unmeasured

- Whether solo beats the lead on any document but this one. Five passes a side, one bundle.
- Whether a second unioned pass earns its cost on a bundle whose defects are less clustered.
- `spec-coref.mjs` surfaced 3 of 7 repair-induced findings and 0 of the 2 made during the ship run;
  both misses are a rule narrowing a value domain while a control's option list is not narrowed
  with it, which shares no identifier and is out of reach of a token index.
