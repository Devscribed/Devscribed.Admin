# Review sharding, model, effort and shard size

**2026-08-30.** Why one review pass over a large change misses defects, and what actually
changes that.

## Ground truth

Every run below reviews the same change: `57d55ac..d1d436f`, **75 files, 11,448 changed
lines** — spec `documents/04-signature-providers`. That commit is the tree the pipeline's own
first review judged. It survived only because it is still reachable from the reflog: the next
implement attempt amended it away, which is the whole subject of ADR 0001.

Three defects are known to be in that code. They were established by reading it, not by
trusting the historical verdicts:

| id | defect | how it was confirmed |
|---|---|---|
| **B1** | The Infrastructure section is unimplemented — nothing carries the three SignWell values to the task | `git diff --name-only 57d55ac..d1d436f -- infra/` returns **zero files** |
| **B2** | A provider call is awaited inside a database transaction | transaction opens at `signing.service.ts:317`, `FOR UPDATE` at `:321`, `applySignature` awaited at `:397` |
| **B3** | `POST /documents` is retried five times with no orphan lookup between attempts | `signwell-http-client.ts` has `maxAttempts: 5`, the loop at `:291`, and no `beforeUnsafeRetry` |

**The pipeline's own history needed two review passes to find these three**, and the second
pass's blocker sat in a file the first had never opened. That is the bar.

Scoring is keyword matching against rule, file, symbol, claim and witness — it proposes, and
every candidate was then checked by hand. Two misses in E1 were confirmed by grepping the
verdict for `transaction`, `FOR UPDATE` and `infra/`: the words appear, but about other things.

## Results

| # | mode | shards | model | effort | **3 known** | blockers | notes | coverage | wall | cost |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | whole diff | — | opus | xhigh | **0/3** | 1 | 5 | 75/75 | 1004s | $15.97 |
| 2 | whole diff | — | opus | xhigh | **0/3** | 1 | 5 | 75/74 | 901s | $14.89 |
| 3 | sharded ~15 | 6 | opus | xhigh | **3/3** | 12 | 15 | 75/75 | 1265s | $43.67 |
| 4 | sharded ~15 | 5 | opus | xhigh | **3/3** | 14 | 22 | 75/75 | 1164s | $36.07 |
| 5 | sharded 20 | 4 | **sonnet** | **medium** | **1/3** | 6 | 5 | 75/75 | **559s** | **$8.78** |
| 6 | sharded 10 | 10 | sonnet | medium | **2/3** | 4 | 14 | 75/75 | 705s | $10.37 |
| 7 | sharded 15 | 7 | sonnet | **high** | **0/3** | 3 | 11 | 75/75 | 697s | $13.60 |
| 8 | sharded 15 + **sweeps** | 7 | sonnet | medium | **1/3** | 7 | 11 | 75/75 | 659s | $12.07 |
| 9 | 8 + **dismissal rule** | 5 | sonnet | medium | **2/3** | 5 | 5 | 75/75 | 699s | $11.84 |
| 10 | 9, **sonnet root** | 8 | sonnet | medium | **2/3** | 4 | 12 | 75/75 | **606s** | **$7.89** |
| 11 | 9 + **placement rule** | 5 | sonnet | medium | **3/3** | 6 | 14 | 75/75 | 802s | $13.27 |
| 12 | 11, **sonnet root** | 6 | sonnet | medium | 2/3 | 4 | 7 | 75/75 | 1074s | $11.04 |
| 13 | 11 replicated | 5 | sonnet | medium | **2/3** | 4 | 9 | 75/75 | 776s | $12.55 |
| 14 | 11, shards of 10 | 10 | sonnet | medium | 2/3 | 10 | 8 | 75/75 | 744s | $14.74 |
| 15 | 11, **opus** shards | 6 | **opus** | medium | **3/3** | 11 | 22 | 75/75 | 900s | — |
| 16 | 11, **opus** shards | 9 | opus | low | 2/3 | 11 | 21 | 75/75 | 751s | $24.02 |
| 17 | 15 replicated | ? | opus | medium | *running* | | | | | |
| 18 | 15, sweeps 5+9 as shards | 8 | opus | medium | 3/3 | 16 | 33 | 75/75 | 897s | $34.39 |
| 19 | 17, **sweeps as a floor** | 5 | sonnet | medium | **0/3** | 2 | 10 | 75/75 | 726s | $10.97 |
| 20 | **open**, 20f | 4 | sonnet | xhigh | 1/3 | 4 | 8 | 75/75 | 836s | $14.65 |
| 21 | **open**, 30f | 3 | opus | medium | 1/3 | 6 | 19 | 75/75 | 828s | $21.31 |
| 22 | **open**, 15f | 5 | sonnet | xhigh | 0/3 | 5 | 11 | 75/75 | 1007s | $18.67 |
| 23 | **open**, 20f | 4 | opus | medium | 2/3 | 11 | 24 | 75/75 | 809s | $22.94 |

Runs 1–2 and 3–4 are independent repetitions of the same configuration, differing only in
which coverage mechanism supplied the file list. Both pairs replicated, so the 0/3 → 3/3 gap
is not sampling noise.

## What holds

**Shard size is a quality control, not just a cost one.** Holding model and effort at
sonnet/medium and moving only the group size, 20 → 10 files, took the score from 1/3 to 2/3.
The defect it recovered is the one that needs two distant lines of the same file related to
each other. Attention per file is bought by dividing, and it is bought at a price: ten shards
instead of four generated 137k output tokens against 72k, and the wall clock went 559s → 705s.

**A root and a shard fail differently.** The absence defect B1 — a required directory with no
files in it — was found by both roots running at `xhigh` and by neither root running at
`high`, in four runs whose shards varied freely. No shard has ever found it, and none can:
a shard is given files that exist. Root quality tracks effort; shard quality tracks size.

**Sharding is what finds the defects.** Two whole-diff passes found none of the three; two
sharded passes found all three. Both whole-diff passes accounted for 75 of 75 files and one
of them opened `signwell-http-client.ts` five times, twice with `Read`, and still did not see
B3. **Coverage is necessary and nowhere near sufficient** — making a reviewer open every file
does not make it look at any of them hard enough.

**Duration is output tokens divided by a constant.** Across 23 shards: 14,569s of span,
1,201k output tokens, 70–110 tokens per second with a mean near 90. A run gets faster only by
generating less. Nothing else moved the wall clock in any measurement here.

**Effort sets volume, not rate.** Dropping `xhigh` → `medium` (with sonnet) took a shard from
~45k output tokens to ~18k and from ~546s to ~183s, while the generation *rate* barely moved
(88 → 98 tok/s). The time came out of how much was thought, not how fast.

**The default effort is `xhigh`** — second of five (`low, medium, high, xhigh, max`). Every
measurement taken before this was noticed ran near the top of the range.

**Effort is settable per agent, in frontmatter.** Verified directly: a parent launched with
`--effort high` and a child declaring `effort: medium` produced `effort=high claude-opus-5`
and `effort=medium claude-sonnet-5` in their transcripts. Session flag and frontmatter
coexist; frontmatter wins for that agent.

**Shard verdicts should be returned as text, not written to files.** Shards were first told
to write `review-shard-<n>.verdict.json` while holding no `Write` tool. Some improvised with
`Bash`, some returned text, and one root hired a seventh `general-purpose` subagent whose
whole job was to write the file. Answering the parent is the native path and has no failure
mode.

## Where the wall clock goes

Splitting a run into the root's planning, the shards running in parallel, and the root working
alone after the last shard returns:

| run | total | plan | shards | root alone |
|---|---|---|---|---|
| 5 (4 shards) | 557s | 80s · 14% | 271s · 49% | 206s · 37% |
| 6 (10 shards) | 703s | 75s · 11% | 467s · 66% | 162s · 23% |

**Root overhead is a near-constant four to five minutes** and shard tuning cannot touch it.
Everything measured so far moves only the middle term, which is at best two thirds of the run.
`.workflow/critical-path.mjs` prints this for any arm.

## A better prompt beats a higher effort

Runs 7 and 8 hold shard size at 15 files and the shard model at sonnet, and differ in one
thing each. Run 7 raises the shard effort `medium` → `high`. Run 8 leaves effort at
`medium` and replaces the method with the `code-review` skill: nine sweeps, each of which
enumerates something and then answers one question about every item it enumerated, with the
enumeration required in the output before any finding.

| | run 7 · effort | run 8 · sweeps |
|---|---|---|
| blockers | 3 | 7 |
| of the three known | 0 — B2 raised as a note only | 1 |
| corroborated by another arm | 6 of 21 | **7 of 21** |
| wall | 697s | **659s** |
| cost | $13.60 | **$12.07** |

The sweeps arm found more, agreed with other arms more often, and was cheaper and faster than
raising the effort. It also produced something no other run has produced: an auditable
coverage artefact. Its sweep 5 enumerated 42 requirements and 122 named artefacts, put the
command that proves each one against it, and returned three that no code implements, each with
the `grep` that shows it. Its sweep 9 listed 23 cross-file pairs that must agree and named the
four that do not.

**Until now the reviewer's only rubric was `checklist.md`, which is written for judging a
spec, not code.** A reviewer given a rubric for the wrong artefact was being asked to improvise
the method on every run.

## Enumerating is not judging: the dismissal hole

Run 8 missed B2, the provider call awaited inside a transaction, and the transcript shows
exactly how. Its shard 1 **did** enumerate it — item 11 of the transaction sweep, named in
full — and then cleared it:

> `signing.service.ts:sign()` `$transaction` … contains `locally.applySignature()` inside;
> documented exception (LocallySigned never touches network) per spec's carve-out to invariant 1

There is no such carve-out. `grep -n "carve-out" specs/documents/04-signature-providers.md`
returns nothing. What the shard read was a fifteen-line comment at `signing.service.ts:386`
in which **the implementation argues its own exemption** — "Invariant 11's stated reason is …
so the reason cannot apply". Three independent arms rate this a blocker, so the code is wrong
and the dismissal was not.

The rule that was missing is symmetrical to the one already there. A finding may block only if
it cites a rule from a closed list — but nothing required the same of *clearing* an item. So
raising cost evidence and dismissing cost nothing, and the sweep dutifully enumerated the
defect and waved it past. Runs 9 and 10 add: an item you enumerate and do not report needs the
same source you would need to report it, a comment in the code under review is not a source,
and code that argues its own exception to a rule is the finding rather than the answer to it.

## Counting agreement instead of counting blockers

A three-item ground truth ranks recall against three defects and says nothing about the other
four to seven blockers an arm returns, so blocker counts have measured verbosity rather than
quality. `.workflow/corroborate.mjs` clusters every finding from every arm by file and claim
overlap and reports how many independent arms raised each. The arms share the diff, the spec
and the base commit; they do not share a session, so agreement is the cheapest evidence
available that a finding is real, and a finding only one arm ever saw is unconfirmed.

Across 8 arms and 124 findings, 25 clusters were seen by two or more arms and 80 by exactly
one.

| arm | agreed | solo | ratio |
|---|---|---|---|
| 5 · 20f sonnet/medium | 5/25 | 6 | 0.83 |
| 6 · 10f sonnet/medium | 5/25 | 13 | 0.38 |
| 7 · 15f sonnet/high | 7/25 | 7 | 1.00 |
| 8 · 15f sonnet/medium + sweeps | 7/25 | 11 | 0.64 |
| **9 · 8 + dismissal rule** | **8/25** | **2** | **4.00** |
| 10 · 9 with a sonnet root | 4/25 | 12 | 0.33 |
| 3 · opus/xhigh | 16/25 | 19 | 0.84 |
| 4 · opus/xhigh | 16/25 | 10 | 1.60 |

**Run 9 raised nothing that no other arm saw.** Ten findings, eight of them corroborated. No
other arm, including either opus/xhigh baseline, comes close on precision — the baselines find
roughly twice as much and bring nineteen and ten unconfirmed findings with it.

**The dismissal rule paid twice.** It recovered B2 as a blocker, and it cut the notes from
eleven to five. Requiring a source to wave something past does not only stop wrong dismissals;
it stops the reviewer writing down items it has nothing to say about.

## The root is not the place to save money

Runs 9 and 10 are the same prompts, the same shard model, the same shard effort, and differ
only in the root: opus against sonnet, both at `high`.

| | 9 · opus root | 10 · sonnet root |
|---|---|---|
| agreed | 8/25 | 4/25 |
| solo | 2 | 12 |
| notes | 5 | 12 |
| sweep 5 artefacts missing | 1 | 0 |
| wall | 699s | 606s |
| cost | $11.84 | $7.89 |

Both found the same two of the three known defects, so the shards carried the recall either
way. What the sonnet root lost was **filtering**: it kept three times as many unconfirmed
findings and its own requirement sweep came back empty where the opus root's found a real
missing artefact. The root's job is to check claims and refuse the ones that do not hold, and
that is the part that did not survive the cheaper model. $3.95 and 93 seconds bought it back.

## Three of three, once — and it did not replicate

Run 11 is the first arm outside the opus/xhigh baselines to find all three known defects.
**Run 13 is the same worktree, the same prompts and the same flags, and it missed B1.** One
success in two attempts is not a property of the configuration, and every conclusion below
about the placement rule is provisional on that.

What run 11's sweep 5 said, and run 13's did not:

> SIGNWELL_API_KEY — spec places it in SSM Parameter Store as a SecureString injected by the
> ECS task definition; exists only in `apps/api/.env.example`

Five configuration values, each present under the name the spec gives it and absent from the
place the spec puts it. Every earlier sweep 5 had ticked them off as present, because
`grep` found the name and nothing asked *where*. Two sentences closed it:

- **Prove it where the spec puts it.** Same name, wrong home, is a miss.
- **Walk the spec's sections in order** and say which artefacts came from each. A section that
  contributed none is itself the finding.

The second sentence is what makes an unimplemented section visible at all. A section nobody
implemented leaves no trace in a diff, so a reviewer working from the diff cannot see it and a
shard holding files cannot either.

**But asking for it in a prompt is asking the reviewer to remember, and it remembered once in
two tries.** Run 13's sweep 5 returned a single missing artefact and never mentioned the five
configuration values. This is the same failure that the file slice already solved for coverage:
a list an agent is told to derive is a list it sometimes does not derive. The fix that matches
the evidence is to compute the spec's sections and hand them over as a worklist, the way
`review-slice.mjs` hands over files, rather than to word the instruction more firmly.

## The scoreboard that matters

| | 3 known | blockers | of those, corroborated | alone | wall | cost |
|---|---|---|---|---|---|---|
| 3 · opus/xhigh baseline | 3/3 | 13 | 8 | 5 | 1265s | $43.67 |
| 4 · opus/xhigh baseline | 3/3 | 12 | 8 | 4 | 1164s | $36.07 |
| 9 · sweeps + dismissal | 2/3 | 5 | 5 | **0** | 699s | $11.84 |
| 11 · + placement | 3/3 | 6 | 5 | 1 | 802s | $13.27 |
| 13 · 11 replicated | 2/3 | 4 | 4 | **0** | 776s | $12.55 |
| 14 · 11, shards of 10 | 2/3 | 10 | 7 | 3 | 744s | $14.74 |

Run 11 matched the baselines' recall with **half the blockers**, a third of the cost and two
thirds of the wall clock, on sonnet shards at `medium` — once. What replicates is the
precision: runs 9 and 13 between them raise nine blockers and **not one of them is
uncorroborated**. No baseline comes close; they raise twelve and thirteen, of which four and
five are findings no other arm agrees with.

**Halving the shard size costs precision here.** Run 14 raised ten blockers, three of them
alone, and recovered nothing extra. Once the method is good, dividing further buys noise.

The baselines' extra blockers are not extra recall. They are four and five findings no other
arm agrees with, each of which costs the implementer a cycle if wrong.

## The model, separated from the effort

Runs 13, 15 and 16 hold everything constant — 15-file shards, the full sweep method, an opus
root at `high` — and move only the shard model and its effort.

| shards | 3 known | blockers | corroborated | alone | notes | wall | cost |
|---|---|---|---|---|---|---|---|
| sonnet · medium (13) | 2/3 | 4 | 4 | **0** | 9 | 776s | $12.55 |
| opus · low (16) | 2/3 | 11 | 8 | 3 | 21 | 751s | $24.02 |
| **opus · medium (15)** | **3/3** | 11 | **11** | **0** | 22 | 900s | — |

**Run 15 is the best verdict this series has produced.** Eleven blockers, every one of them
raised independently by at least one other arm, none alone — and all three known defects,
including the absence B1 that only one other sharded arm has ever found. Both opus/xhigh
baselines were less precise: thirteen and twelve blockers with five and three that nobody
corroborates.

**`low` is not a cheaper `medium`; it is a different failure.** Run 16 cost nearly twice run
15's sonnet twin and produced the same recall as sonnet at a third of sonnet's precision. The
opus verbosity arrives at `low` — eleven blockers, twenty-one notes — and the judgement that
makes the verbosity worth reading does not.

**Verbosity is a property of the model, not of the method.** Sonnet shards on the same prompt
return four or five blockers; opus shards return eleven, and so did the opus/xhigh baselines.
The method changed what is *in* the findings; it did not change how many there are.

## Testing a prompt rule for a dollar

A full pass dispatches a fleet and costs a quarter of an hour. A prompt rule can be tested for
the price of one subagent: `scripts/lab-probe.mjs` gives a single shard the files a defect
lives in, the spec, and nothing else, and prints what it returns. Three probes cost $2.68 and
eighteen minutes between them.

The defect classes the opus arms found and the sonnet arms did not, generalised away from the
instances, come to two shapes. Both are now sweeps.

**A predicate that is nearly the required predicate.** The invariant spans two facts and the
write constrains one; equality is required and a subset check is written; "does any row exist"
stands in for "does ours exist"; the guard is read from a copy loaded before the transaction
meant to protect it; two steps in one pass are ordered so the first changes what the second
selects on.

**A mechanism applied to some call sites and not the rest.** A partition key one caller passes
and six omit; a lazy refresh wired into two entry points of three. What hides it is the
graceful default — an optional parameter, a fallback constant — which turns every site that
forgot the mechanism into a silent success.

The test sweep also now asks, of each test, **what would have to break for it to fail**. A test
nothing can break is the finding.

### What the probes showed

| shard | sweep 10 items | blockers | wall | cost |
|---|---|---|---|---|
| 1 file, before the new sweeps | — | 1 | 356s | $1.08 |
| 1 file, after | 7 | 1 | 260s | $0.57 |
| 3 files, sonnet `medium` | 8 | 1 | 317s | $0.80 |
| 3 files, sonnet `high` | 13 | 2 | 506s | $1.30 |

**The probe corrected the experiment before it corrected the prompt.** Given one file, the
shard enumerated the guard in question and dismissed it for lack of a reachable scenario —
correctly, under its own witness rule, because the code that decides reachability is in two
other files. A one-file probe cannot test a rule about a defect that is not visible from one
file. With the three files that carry the reachability, the same sweep at the same effort
raised the convergence race that four independent arms rate a blocker.

**With a method, effort buys something after all.** Sonnet at `high` enumerated thirteen
predicates against `medium`'s eight and returned one more blocker, for 60% more time and cost.
The earlier finding that `high` was worse was measured *without* the sweeps: raising effort
with no method to spend it on produces more thinking about nothing in particular.

### One blocker the probes put in doubt

Three opus arms block on the completion write guarding only `signedPdfKey: null` with no
status predicate. Every sonnet shard that enumerated it cleared it as unreachable, and the
reachability argument survives a hand check: the sweep that reaches that path selects
`status: { in: [sent, partially_signed] }`, so a terminal envelope is filtered before the write
is reached. Unadjudicated, and recorded here rather than counted as a sonnet miss.

## Making the sweeps a floor made the review worse

The objection the sweeps invite is that they are fitted: they were derived from what one model
found on one change, and a reviewer walking a list has a stopping condition that open-ended
judgement does not. Run 19 tried to keep the method and remove the stopping condition. Three
changes, all in the same direction:

- the shard states, **before it opens the skill**, what the change is for and the two or three
  things most likely wrong in a change of that shape — first, so the list cannot anchor it;
- the skill says the sweeps are a floor, necessary for a verdict and never sufficient for a
  `pass`;
- a finding belonging to no sweep gets `"sweep": null` and is first-class.

| | 17 · sweeps as written | 19 · sweeps as a floor |
|---|---|---|
| blockers | 4 | **2** |
| notes | 9 | 10 |
| known defects | 2/3 | **0/3** |
| findings using `"sweep": null` | — | **0** |
| wall | 776s | 726s |
| cost | $12.55 | $10.97 |

**It did not produce the thing it was designed to produce and it cost the thing that worked.**
Not one finding used the open slot, so the extra freedom bought nothing; meanwhile the three
known defects that the same profile had been raising as blockers came back as notes about
neighbouring code or not at all. The retry defect appears as a note on double-counted failures
in the same file — adjacent, and not the defect.

The mechanism is worth naming, because it is the opposite of what was intended. Telling a
reviewer to look everywhere *before* it looks at anything in particular spends attention on
breadth, and the enumerate-then-judge discipline is a depth instrument: it works by forcing one
question against every item, and a reviewer that has already formed a view of what is probably
wrong answers that question more cheaply.

Both blockers run 19 did raise are corroborated, so it is not noisy — it is quiet. A gate that
returns two well-founded findings and misses three known defects is worse than one that returns
four, and it looks better while doing it.

**The floor change is not in the pipeline.** Both profiles ship as measured: `open` with no
checklist at all, `sweeps` with the sweeps as written.

## The open profile, gridded

The `open` profile hands each shard its own judgement and no checklist — the reviewer as it was
before any of this. Five runs fill the grid, every one hand-checked against the three defects
because the keyword scorer proposes false matches on B1 and B3 by catching a neighbouring
finding in the same file.

| shards | 15 files | 20 files | 30 files |
|---|---|---|---|
| sonnet `xhigh` | **0/3** (E19) | **1/3** (E17) | — |
| opus `medium` | — | **2/3** (E20) | **1/3** (E18) |
| opus `xhigh` | **3/3, 3/3** (A3, B3) | — | — |

It is monotone in all three directions and there is no free lunch: more model, more effort and
a smaller shard each buy recall, and nothing substitutes for anything else. Sonnet at `xhigh`
does not reach opus at `medium` on the same 20 files (1/3 against 2/3), and opus at `medium`
does not reach opus at `xhigh` however the shard is sized.

**And the sweeps profile beats the open profile at the same model, effort and cost:**

| | 3 known | blockers | corroborated | alone | wall | cost |
|---|---|---|---|---|---|---|
| E20 · open, opus/medium, 20f | 2/3 | 11 | 9 | 2 | 809s | $22.94 |
| **E13 · sweeps, opus/medium, 15f** | **3/3** | 9 | 8 | 1 | **789s** | **$21.00** |
| E9 · sweeps, sonnet/medium, 15f | 2/3 | 4 | 4 | **0** | 776s | $12.55 |
| A3 · open, opus/xhigh, ~15f | 3/3 | 13 | 9 | 4 | 1164s | $36.07 |

E13 dominates E20 on every axis at once, and reaches the opus/`xhigh` baseline's recall for
$15 less and 375 seconds less, with four fewer blockers and three fewer of them
uncorroborated.

**Recall by configuration, over all nineteen runs:**

| | runs | of three |
|---|---|---|
| open + sonnet, any effort, 10–20 files | 4 | 0, 1, 1, 2 |
| open + opus `medium` | 2 | 1, 2 |
| open + opus `xhigh` | 2 | **3, 3** |
| sweeps + sonnet `medium`, 15 files | 3 | **2, 2, 2** |
| sweeps + opus `medium`, 15 files | 2 | **3, 3** |

The two columns that replicate are the ones with the sweeps or with `xhigh`. The open profile
on sonnet sits near one of three at every effort and every size tried.

## False positives follow the model, not the method

The worry the sweeps invite is that a checklist manufactures findings. Counting blockers no
other independent arm raises:

| | uncorroborated blockers, per run |
|---|---|
| sonnet + sweeps | 0, 0, 0, 0 |
| sonnet + open | 2, 0, 0, 0 |
| opus + sweeps | 6, 1, 6 |
| opus + open | 4, 2, 2 |

Opus is verbose with the sweeps and without them; sonnet is spare either way. **The sweeps
neither add nor remove false positives** — the model decides that.

There is a reason in the design, and it matters for how freely a sweep can be added.
**Attention and blocking are gated separately.** A sweep only decides what gets looked at. To
block, a finding needs a rule from the closed list and a witness another party can check, and
without the witness it is demoted to a note automatically. A sweep that is too broad therefore
costs shard time, not a false blocker.

## What no measurement here can settle

Every run above reviews the same commit. "The sweeps work" and "the sweeps encode this change's
answers" are indistinguishable from this data, and sweeps 10 and 11 were derived from what one
model found on this diff. The distinction that might survive is between a defect signature and
a procedure — "check that write-once guards include a status predicate" fires only on its own
shape, while "write down the rule and the question the code asks, and block when they differ"
does not name a domain. Whether that holds is unmeasured.

The cheapest thing that would settle it is not another arm. It is recording, on every real run
against a new spec, **what the review missed** — found later by QA, by a deploy, by a bug. A
held-out sample nobody could have fitted, accumulating for free.

## What was measured and dropped

**"Raising the shard effort is how you buy quality back."** Wrong, at least below opus. Run 7
took the shards from `medium` to `high` and got three blockers where the same shard size with
a better method got seven, while costing more and taking longer. Effort buys volume of
thought; the method decides what the thought is spent on.

**"A sonnet root is the cheap win."** Wrong, twice over. Run 10 kept three times as many
unconfirmed findings as its opus twin and its requirement sweep came back empty where the opus
root's found a real absence. Run 12 was worse: slower than every other arm at 1074s, and it
wrote a **verdict that is not valid JSON** — four `"line": 279-325` range values, which no gate
can read. The original is kept beside the repaired copy as `review.verdict.as-delivered.txt`.

**"Shards are where the model choice matters."** Half right. Sonnet shards with a good method
match opus shards on recall of the known defects. The *root* on sonnet loses precision badly,
and precision is the root's entire contribution.

**"Each shard re-reading the spec is the bottleneck."** Wrong, and it was asserted several
times before being checked. Across 23 shards, tool calls touching the spec, `CLAUDE.md`, the
checklist and the handoff accounted for **12% of span overall and 2–5% for a typical shard** —
they read it in the first ten seconds and never return. A shared or preloaded context would
buy percentages. The proposal to distil the spec for shards was withdrawn.

**"The root rubber-stamps its shards."** Wrong. It was inferred from `kept == findings` alone.
The transcript shows 45 `Bash` calls over 11.5 minutes, running *while the shards worked*:
checking that files the spec names exist, that each named environment variable and error code
exists, that declared test ids exist — and going to `signing.service.ts:380-405`,
`signwell-http-client.ts:250-340` and `infra/deploy.sh` to verify the three blockers at
source. `kept == findings` meant the claims were checked and held.

**"Reasoning effort cannot be set per subagent."** Wrong. Inferred from every shard reporting
`xhigh`, which was true and had a different cause: no agent had declared an effort, so all
inherited the session's. Disproved by a one-minute probe.

**"Task calls in separate messages run sequentially."** Wrong. The dispatch returns
`Async agent launched successfully` immediately; five shards dispatched in five separate
messages over 68 seconds were all running concurrently. The instruction demanding one message
was removed as pointless.

## The cost of the fix that was not measured

Between the root's last verification and its verdict landing on disk, one run spent
**18.5 minutes** pushing 62 KB of JSON through a bash heredoc — three failed attempts and two
experiments in `/tmp` substituting `@Q@` for quote characters to find what broke the escaping.
The root held no `Write` tool. It was given one; the effect is taken as read rather than
measured, since the mechanism is not in doubt.

## Open

- **Can a better prompt buy what effort buys?** Runs 7 and 8 both shard at 15 files and both
  run sonnet. Run 7 raises the shard effort to `high` and changes nothing else. Run 8 leaves
  effort at `medium` and replaces the method: a `code-review` skill of nine sweeps, each of
  which enumerates something and answers one question about every item, with the enumeration
  required in the output before any finding. Until now the reviewer's only rubric was
  `checklist.md`, which is written for judging a spec rather than code.
- **Is the quality loss caused by effort or by model?** Runs 15 and 16 put opus shards on the
  best available prompt at 15 files, at `medium` and at `low`, against run 13's sonnet at
  `medium`.
- **Can the section walk be made mechanical?** B1 is found by prompt instruction one time in
  two. Computing the spec's sections and handing them over as a worklist is the same move that
  fixed coverage.
- **How many of the sharded blockers are false?** Runs 3 and 4 produced 12 and 14 blockers
  where the pipeline's whole history produced 4. Until each is adjudicated against the code,
  the blocker count measures verbosity, not quality — only the 3-of-3 column is trustworthy.
- **What crashed two runs.** Two agent processes died mid-work with empty stderr, no log and a
  surviving sibling task. Memory pressure is the standing suspicion, unproven. `exit.json` now
  records status, signal and spawn error for the next occurrence.

## How to reproduce

Each run is one worktree at `d1d436f`, its own `.workflow/runs/<id>`, and:

```bash
node scripts/lab-run.mjs --agent code-reviewer --run <id> \
  --base 57d55acd03b825aeed9c85836e85138f12b01be1 \
  --prompt lab-prompt-review.md --model opus --effort high --fuse 50
```

Shard size lives in one line of `.claude/agents/code-reviewer.md`; shard model and effort in
the frontmatter of `.claude/agents/review-shard.md`.

Reading the results: `scripts/lab-watch.mjs` for run state, `scripts/lab-peek.mjs` for what
each subagent is doing or said, `.workflow/shard-cost.mjs` for per-shard span and tokens.
