---
name: refine
description: Judge whether a written specification can be delivered on its own — free of self-contradiction, current with the code, complete from itself alone, and testable — by dispatching the spec-refiner agent with a clean context. Use after writing a spec, before shipping one, or when an existing spec has drifted from the code.
---

# Refining a spec

A spec is judged by a stranger. You dispatch one, you fix what it returns, you dispatch again.

```
Task(subagent_type: "spec-refiner", prompt: "<spec path>\n\n<the request the spec answers, or: no request given>")
```

That is the whole of the dispatch. **Give it the spec path and the request, and nothing else** —
no summary of what you wrote, no explanation of a decision, no "I already checked X". Every
sentence of context you add is a sentence it will not go and verify, and the reason it is a
separate agent is that it has not read what you have read.

Dispatch **one** agent. This is a judgement about one document; splitting it produces shards
that each see half a contradiction.

## Your part

**Before** — the spec file exists, and you can state the request in one line. An existing spec
that nobody is currently writing has no request: say `no request given` and the scope sweep is
skipped rather than invented.

**After** — the verdict is in `.workflow/refine/<area>-<nn>.verdict.json`. Blockers are fixed
before the spec is presented or shipped; notes go to the person with the spec.

## Fixing what comes back

You may edit the spec. The refiner may not, which is why it hands you `suggestedFix` rather
than a diff.

**Hand the verdict to `spec-fixer` rather than repairing it yourself.**

```
Task(subagent_type: "spec-fixer", prompt: "<spec path>\n<verdict path>")
```

Two paths, nothing else — the same clean-context rule the refiner runs under. **It repairs the
whole verdict**, including the contradictions and the ambiguities: those it settles by deciding,
and it writes the choice and the alternative it rejected into the document itself, so no
decision is taken out of sight. `.workflow/refine/<area>-<nn>.fix.json` records each one under
`decided`, with `recordedAt` naming where in the spec it landed.

Two things still come back in `left`: a repair that would need a route, a capability, a column or
a screen the spec does not have, and a question only the product owner can answer. Those are
yours — settle them in the document before the next dispatch.

**Read the `decided` entries.** They are choices somebody made on your behalf, and reversing one
is cheap now and expensive after it ships.

**Whoever writes the fix — you or the fixer — every sentence added about this repository is
checked by the next pass.** Open the file before writing the claim, prefer a symbol to a line
number, and run the command before quoting its count. A repair written from memory costs the
pass that finds it.

**Every fix lands in the spec being refined, and in no other.** Older specs are records of
decisions taken then, and are not edited to stay current — the newest spec that speaks about a
behaviour governs it. `spec/incomplete-decision` says this spec changed something described
elsewhere and did not state the new rule in full; the repair is to state it here, completely
enough that a reader never opens the other document. A sentence pointing at what it overrules
is not a repair — it sends the reader away instead of answering them.

**A contradiction is settled by deciding, not by reading it the right way.** Two clear rules
that disagree get one of them changed. If which one wins is a product question, ask it —
`AskUserQuestion`, one fork, with the trade-off — rather than picking the one that costs less
to write.

**When you disagree with a finding, check it before you dismiss it.** Open the file the witness
names. A witness that is wrong is worth saying so plainly; a witness you did not open is not
one you have answered.

## Dispatch again

**Commit the repair before dispatching.** One pass, one commit — that commit boundary is what
the next agent judges against, and without it a diff pass has nothing to bound itself to. It
also leaves the loop a history, which the verdict file does not: `.workflow/refine/` is
overwritten every pass.

Fix, then dispatch a fresh agent. Not the same one — it has seen your fix in its context and
will read the document through it. The second pass costs a fraction of the first, because a
run that halts on a spec defect costs a run.

Stop when the verdict is `pass`, or when every remaining finding is a note and the person with
the spec has seen them.

**The first pass judges the document; every pass after it judges the change.** A document of this
size holds more enumerable detail than one pass samples, so a second full sweep does not re-find
the first one's list — it returns a different subset, and there is always one more. Judging the
diff is what makes the loop terminate: the surface shrinks with each repair instead of being
redrawn at full size.

So the loop ends when **a pass over the last repair finds nothing that changes what gets built**
— not when a pass over the whole spec comes back empty, which it never does. Notes go to the
person with the spec; they do not buy another pass.

**A spec that grows over a pass is a warning.** The repairs state rules; they do not add feature,
and they do not copy the code into the document. If the spec is materially longer than it was,
read what was added before dispatching again.

## Where this sits

Outside the pipeline, before it. `/spec` step 6 dispatches this; `npm run refine -- <spec>`
runs it on any spec at any time, which is what an already-written spec that has drifted needs.

It is not a `ship` stage. `pre-implement` compiles a spec into a plan and blocks when it cannot;
this asks whether the document is true, which is a different question and is not worth an opus
pass on every attempt of every run.
