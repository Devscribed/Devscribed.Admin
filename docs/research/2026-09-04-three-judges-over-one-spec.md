# Three judges over one specification

Measured 2026-09-04. Every number below comes from a verdict or an agent log on disk; the paths
are named so each can be re-read.

## The ground truth

One text, judged three times: `specs/requests/03-client-participants.md` and its two bundle
members **as they stood at commit `2bc8fca`** — the state the first full pass of the
`12-33-36-605Z` loop judged. The bundle was restored into a worktree of its own
(`build/spec-review-trial`, commit `aaaf700`) so the document could not move between passes.

`spec-lint` was clean on that text under today's lint.

**A confound, stated up front.** The spec text is from `2bc8fca`; the *code* around it is
today's, and this spec has since been implemented (`771451a`). So every criterion that compares
the document with the repository — the currency family, `S-43` — is not comparable across the
three passes. The third judge found this by itself and threw out four claims that rested on it,
which is recorded below because it is the more interesting fact.

## What was run, and what came back

| | OLD solo | NEW solo | NEW sharded |
|---|---|---|---|
| Judge | `spec-refiner`, opus | `spec-review`, opus | `spec-review`, opus |
| Shards | none | none | 3 × `spec-review-shard`, sonnet |
| Register | 57 criteria | 58 | 58 |
| clear / note / blocked / n/a | 41 / 9 / 5 / 2 | 43 / 5 / 8 / 2 | 39 / 6 / 7 / 6 |
| Blockers | 7 | 10 | 8 |
| Notes | 9 | 8 | 6 |
| Judge wall time | — | 1126 s | 786 s |

Verdicts: `…/requests-03.probe.2026-09-03T12-33-36-605Z/1/judge.verdict.json`,
`…/requests-03.verdict.2026-09-03T14-33-24-441Z.json`,
`…/requests-03.probe/1/judge.verdict.json` (the last two in the trial worktree).

Which criteria blocked:

```
OLD solo   : S-09 S-10 S-18 S-36 S-37
NEW solo   : S-05 S-09 S-10 S-12 S-30 S-41 S-43 S-58
NEW sharded: S-09 S-10 S-18 S-37 S-40 S-43 S-58
```

- **Recovered by sharding**: `S-18`, `S-37` — blockers for the old judge, cleared by the
  unsharded new pass, blocked again by the sharded one.
- **Lost by sharding**: `S-12`, `S-41` — the unsharded new pass blocked both; the sharded pass
  did not. `S-12` is the criterion this register change was written for.
- **Blocked by both new passes and neither old**: `S-43`, `S-58` — the two changes the register
  made. These are the only findings that reproduce.
- **Lost by both new passes**: `S-36`.

## The shards

Three, one per member of the bundle, dispatched together:

| Shard | File | Lines | Criteria | Enumerated | Claims | Turns | Wall |
|---|---|---|---|---|---|---|---|
| 1 | `03-client-participants.md` | 407 | 19 | 31 | 1 | 37 | 214 s |
| 2 | `…contracts.md` | 555 | 28 | 41 | 3 | 33 | 246 s |
| 3 | `…cases.md` | 682 | 21 | 42 | 6 | 46 | 294 s |

114 items enumerated, 10 claims, every one carrying a witness.

**The judge kept 3 of the 10 and overturned 8 of the shards' answers**, with a reason recorded
per shard. Two of the reasons, quoted from the verdict:

> S-03 and S-02 both compare the spec to code that was written to this same spec. The contacts
> routes do not "already ship" — this spec's own prose says they are new and the Verification
> Plan records them as "not run — the route is new" — so a status the current implementation
> returns is not the witness S-03 asks for.

> S-43: shard 1 cleared it; I block it — the spec's invariant 1 has a call site it never
> checked, the staff invitation accept.

So the judge rejected claims in one direction and blocked two criteria the shards had cleared in
the other. It also derived the confound in this experiment's design from the document alone.

## A second document

`specs/requests/02-request-topics.md`, on text that has not moved since the verdict that judged
it (last edit 12:46, verdict 12:55). The old verdict was a **range** pass — `pass`, 0 blockers,
57 criteria, one note — and the new one a full pass, so this is not a controlled comparison of
judges. It is a comparison of registers, and it is unusually clean:

```
S-44  note  -> clear
S-46  clear -> note
S-57  clear -> note
S-58  absent -> blocked      <- the only blocker
```

The one thing that refused a document the pipeline had admitted is the criterion that did not
previously exist. Nothing else moved above note level.

## Hypotheses that died

**"A judge told to split its reading will split it."** Three passes were instructed to, the tool
was granted, and a slice named the agent and the groups. All three read the bundle themselves:
0 dispatches across 552, 439 and 636 events. Sharding happened only when the loop dispatched the
shards itself. The instruction was then removed again on the ground that the choice belongs to
the lead — so what this measures is that the instruction alone does not produce the behaviour,
not that the mechanism was right.

**"The prompts name the dispatch tool wrongly."** The `init` events of both a spec-review pass
and the `code-reviewer` pass that *did* dispatch four shards list the same granted tool, `Task`;
the reviewer's log records its calls as `Agent`. Two names, one tool. The prompts were renamed
on the strength of this reading and two subsequent passes dispatched nothing, which killed it.

**"A closed register makes two passes comparable."** It makes the *surface* comparable — every
id is answered every time, and that held in all three passes. It does not make the *answers*
comparable: on identical text, two opus passes under the same register disagree on four criteria
in each direction. Only `S-09`, `S-10`, `S-43` and `S-58` reproduce across the new passes.

**"Splitting by bundle member is the useful axis."** It yields three shards whatever the document
contains. The reading that actually costs something is the code behind the claims, and the
bundle names only 12 repository paths — the mapping from a route to its controller is in the
code, not in the document. The computed split was withdrawn; the slice now reports the numbers
and the lead decides.

## One defect this found on the way

Both criteria registers read as **zero criteria** in a freshly created worktree. Git materialises
those pages with CRLF there, and the row regex ended `(.*)$`, which cannot match past a carriage
return. An empty register makes `enforceCriteria` return early, so no blocker is anchored and no
coverage is checked — silently. The main checkout is LF and was parsing all 57 and 32 rows, so
this was latent rather than historical. `readRegister` now splits on either ending, and a
register that exists but parses to nothing is fatal rather than permissive.

## What this does not establish

One run of each shape is not a sample. The three passes differ in judge, in register and in
shape at once, and only the register's two additions can be attributed cleanly — `S-58` did not
exist before and `S-12`'s wording changed. Whether sharding finds more than one pass is not
answered here: it recovered two findings and lost two.
