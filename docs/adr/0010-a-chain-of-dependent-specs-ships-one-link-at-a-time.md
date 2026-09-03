# 0010 — A chain of dependent specs is refined and shipped one link at a time

**Status:** current.

## The rule

When several specs are written together and one `depends-on` another, they are refined and
shipped **in dependency order, one link at a time**:

```
spec:lint every spec in the chain     ← the only step that batches
refine 02 → ship 02 → merge
refine 03 → ship 03 → merge
```

**A spec is refined only after every spec it `depends-on` is merged and running**, not merely
written. `T0` (`spec-lint`) is the exception: it is a script, it reads no code, and it may be run
across the whole chain the day the specs are written.

Front-loading the chain — refining 02 and 03 together, then shipping both — is not an
optimisation. It is a way of producing verdicts about a tree that does not exist yet, and
committing document edits from them.

## Why

**`refine` judges the spec against the code, and it commits what it decides.** T1
(`pre-implement`) compiles the document against the working tree; T2 (`spec-refiner`) verifies
every statement the spec makes about code that exists today; `spec-fixer` then repairs the
verdict and `refine-loop` commits the round. So the ground truth of a refine pass is the code at
that moment, and every link of a chain moves that ground truth.

The chain in `specs/requests/` shows it exactly. `03-client-participants.contracts.md:139`
declares `REQUEST_MESSAGES.topicAudienceMismatch` with **new = `no`** — the spec asserts the
message already exists, because `02-request-topics.contracts.md:126` introduces it with
**new = `yes`**. Today neither is true of the repository:

```
grep -rn "topicRequired|topicUnavailable|classifierNotAccepted" packages/validation/src   → nothing
grep -n  "RequestTopic" apps/api/prisma/schema.prisma                                     → nothing
```

Run `refine` on 03 now and `pre-implement` splits two ways, and which one fires is not
predictable:

- Its **Messages** sweep (`.claude/agents/pre-implementer.md:61-63`) — *"a row whose text exists
  nowhere is a task"* — plans 02's catalogue and 02's messages **as tasks of 03**. The handoff
  swallows the previous link, and two runs then contend for one migration.
- Its **Premise** sweep reads `new: no` as a claim about the repository that the file refutes,
  files a `spec` blocker, and the loop halts with `spec-defect`. `spec-fixer` repairs the
  document — flipping `no` to `yes`, or restating 02's rules inside 03 — and commits it. Both
  repairs become false the moment 02 merges.

The second is the expensive one: the loop is working exactly as designed, and the thing it
damages is the spec text, which is the artefact this repository treats as authoritative.

**And the runs cannot overlap anyway.** `concurrentRuns` is 1, `init` takes a lock, and
worktrees isolate files and nothing else — ports 3000/4000, `devscribed_dev`, `devscribed_test`,
the mail sink and `.local-storage` are shared (`docs/ai-workflow.md:124`). Two ship runs at once
do not fail cleanly; they return verdicts about the wrong code.

## What it costs

**Latency is linear in the chain, and cannot be traded for anything.** A chain of N specs is N
sequential refine-plus-ship cycles, and no amount of up-front reading shortens it, because the
judgement each link needs does not exist until the previous link is merged.

**Only the mechanical gate front-loads.** `npm run spec:lint -- <spec>` on every spec at writing
time catches pointers, joins and cross-product completeness for the whole chain at once. That is
the whole of what can be done early.

## Where a person is actually needed

Both orchestrators are non-interactive and neither asks anything it can decide. A chain stops
for a human at these points and no others:

| Stop | Raised by | Why it cannot be automatic |
|---|---|---|
| `needs-a-person`, `stuck-finding` | `refine-loop` | a product fork, or a contradiction — settled in the document, by a person |
| `not-converging`, `budget` | `refine-loop` | "ship with these, or spend another round" is a person's call |
| a `spec` finding, or a contested finding | `ship` | the same decision, met after the run was paid for |
| **the merge** | nobody | the pipeline ends at a green branch: it never merges and never pushes |

Everything between those is a command that runs to completion.

## Alternatives, and what was deferred

**Rejected: refine the whole chain first, ship afterwards.** This is the shape a developer
reaches for, and it is the failure above — verdicts computed against a tree without the
dependency, and a fixer commit that inverts as soon as the dependency lands.

**Deferred, not rejected: a dependency baseline in the two judging agents.** One rule in
`pre-implementer.md` and `spec-refiner.md` would make an unmerged dependency legible: *a
`depends-on` spec that is not yet merged is read in full, and everything it introduces counts as
existing for the premise sweep and belongs to its own handoff, never to this one.* That would
let a chain be refined up front. It is not written, because it widens what both agents read on
every invocation to buy back only latency, and the sequential order costs nothing but time.

**Deferred: a chain runner.** `scripts/chain.mjs <spec>…` — lint every link, then
`refine-loop` → `ship` per link in order, halting on the first stop and naming the ledger to
read. It removes the sitting, not the sequence. The merge between links stays a confirmation
rather than an automatic step: `main` deploys itself and does not test first, so a merge is the
one place in this loop where a mistake leaves the repository.

## A gap this exposed

**The sentence that states the rule is outside the agent's read list.**
`specs/requests/README.md:137` says *"03 depends on 02 being merged and running, not merely
written"* — and it sits in the README's **Dependency Graph** section, while
`.claude/agents/pre-implementer.md:22` admits the area README only as *"Shared Rules, Cross-Spec
Side Effects, Known Gaps"*. Line 24 then limits `depends-on` specs to *"their README and Shared
Rules only, not in full"*. So the pre-implementer is structurally unable to read the one
statement that would tell it why half its plan is missing from the tree.

This is the same class as the second finding of
[docs/research/2026-09-02-what-blocked-the-requests-runs.md](../research/2026-09-02-what-blocked-the-requests-runs.md),
where eleven statements of a `depends-on` spec were out of the pre-implementer's reach and
surfaced for the first time at `implement`, three runs in. The order rule above avoids the
symptom; it does not close the gap, and closing it is the deferred baseline change.
