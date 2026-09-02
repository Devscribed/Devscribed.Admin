---
name: refine
description: Judge a written specification against the code and against the specs around it — stale claims, contradictions, and the statements elsewhere it overrules — by dispatching the spec-refiner agent with a clean context. Use after writing a spec, before shipping one, or when an existing spec has drifted from the code.
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

**A finding whose fix is in another document is fixed in that document.** `spec/unamended-consequence`
names a statement in a spec this one overrules; the repair is an amendment there, marked in
place beside the statement it corrects, naming the requirement that overrules it. A banner at
the top of a document saying "some statements below are superseded" is not an amendment — it is
a promise that has to be checked, and a promise that names line offsets is stale on the next
edit. Mark the statements.

**A contradiction is settled by deciding, not by reading it the right way.** Two clear rules
that disagree get one of them changed. If which one wins is a product question, ask it —
`AskUserQuestion`, one fork, with the trade-off — rather than picking the one that costs less
to write.

**When you disagree with a finding, check it before you dismiss it.** Open the file the witness
names. A witness that is wrong is worth saying so plainly; a witness you did not open is not
one you have answered.

## Dispatch again

Fix, then dispatch a fresh agent. Not the same one — it has seen your fix in its context and
will read the document through it. The second pass costs a fraction of the first, because a
run that halts on a spec defect costs a run.

Stop when the verdict is `pass`, or when every remaining finding is a note and the person with
the spec has seen them.

## Where this sits

Outside the pipeline, before it. `/spec` step 6 dispatches this; `npm run refine -- <spec>`
runs it on any spec at any time, which is what an already-written spec that has drifted needs.

It is not a `ship` stage. `pre-implement` compiles a spec into a plan and blocks when it cannot;
this asks whether the document is true, which is a different question and is not worth an opus
pass on every attempt of every run.
