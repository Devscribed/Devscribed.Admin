# 0018 — The refine judge reads alone, and more than once

**Status.** Accepted.
**Supersedes the default chosen in** [0013 — a spec is admitted by a judge that shards its
reading](0013-a-spec-is-admitted-by-a-judge-that-shards-its-reading.md). That record stands: the
sharded shape is not withdrawn and `--shape sharded` still selects it.

## The rule

**`refine.use` is `solo-minimal`: one `spec-reviewer` on opus reads the whole bundle, and
`spec-fixer-minimal` repairs what it finds.** The lead is no longer the default.

**A shape may set `judgePasses`, and the loop takes the union.** `solo-minimal` sets it to 2. Each
pass writes its own verdict; the union is written where the rest of the loop reads. The merge is
worst-case per criterion, findings are identified by **place and severity** — never by rule — and
each carries `raisedBy`, with the findings more than one pass raised sorted first.

**A finding is identified by where it is, not by what a pass called it.** `stuck-finding` compares
places.

## What it replaced

The default was `sharded`: a `spec-reviewer-lead` on opus that may dispatch `spec-reviewer`
children on sonnet, one per bundle member.

Two things were wrong with it, and neither was visible from the configuration.

**It never sharded.** Five of the six rounds recorded on this repository report `shards: 0`, by the
judge's own `shardDecision`. That is not disobedience: the register hands the whole contradiction
family to the lead — *"a contradiction lives between two regions, and no child can be given one"* —
and contradiction is where almost every blocker lives. A split by bundle member gives each child
the half of every question it cannot answer, and the leads said so, every time. So each pass was a
lead doing the solo agent's reading **while also** carrying the split decision, the merge, the
shard record and the criteria map.

**The configuration described behaviour no script implemented.** The shape's comment said one child
per member was *"dispatched by the loop before the judge runs"*. The loop computes the split and
offers it; whether to dispatch is the judge's. `npm run pipeline`'s "every setting has a reader"
sweep covered `stages.*` and `breakers.*` and never looked at `refine.*`, so nothing caught it.

## Why

Measured in [2026-09-05-what-a-refine-pass-samples.md](../research/2026-09-05-what-a-refine-pass-samples.md).

Five judge passes over the frozen text the loop admitted — same prompt, same model, same request —
returned six distinct blockers and 2.2 a pass. The one blocker that later halted the ship review
was found by **four of the five solo passes** and by **none of the five lead passes** that had
judged the same bundle. A single pass reads more than it holds and answers a criterion by what it
noticed; two passes over one text overlap without agreeing.

## What it costs

- **A second opus pass per round.** They are dispatched together, so nested they overlap and the
  wall clock is unchanged; standalone they run in turn and the round takes twice as long.
- **The register's admission rule 5** — *a criterion cleared against text nobody has touched stays
  cleared* — is now doing more work, because a `clear` from a union of two passes is a stronger
  claim than a `clear` from one. It is still not a proof.
- **`raisedBy` is a temptation to rank.** It is a reading aid. A finding one pass raised is a
  finding, and the register decides what blocks — not how many passes noticed.

## What is not settled

Whether solo beats the lead on any bundle but this one: five passes a side, one document,
p ≈ 0.048. Whether two passes earn the second one on a bundle whose defects are less clustered.
Whether three would earn a third.
