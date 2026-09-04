# The verdict contract

Every agent that judges reads this file in full before it judges. It is the whole of what a
finding is, what may block, and how a verdict is shaped — for code review, for spec review and
for QA alike, because `scripts/wf.mjs` applies the same three rules to all of them and does not
know which agent wrote what.

**This file owns the contract. An agent definition owns its identity, its scope and its
method.** Nothing about what may block belongs in an agent file, and nothing about how to look
belongs here. When the two appear to disagree, this file wins and the agent file is the defect.

## A finding

```json
{ "id": "F1",
  "target": "code",
  "severity": "blocker",
  "criterion": "CR-01",
  "rule": "CLAUDE.md/org-scoping",
  "file": "apps/api/src/projects/projects.service.ts",
  "symbol": "findMany",
  "line": 42,
  "claim": "the query scopes by the path orgId instead of the session organization",
  "witness": {
    "kind": "scenario",
    "detail": "A member of org A holding a valid session requests GET /org/B/projects. OrgScopeGuard passes because it compares the path to the session, but findMany then filters on params.orgId, so org B's rows are returned with 200.",
    "source": "CLAUDE.md:47"
  },
  "suggestedFix": "filter on session.organizationId" }
```

`line` is **a single number** — the first line of the span. A range like `12-18` is not a JSON
number and makes the whole verdict unreadable.

`symbol`, never a line, is what identifies a finding across attempts: `findingKey` is
`rule@file#symbol`, and line numbers move while symbols do not.

## Rule 1 — every finding names an address

`target` says **where the defect lives**. It decides the route, and getting it wrong sends the
run in a direction nobody can act on.

| `target` | Use when | Effect |
|---|---|---|
| `code` | The implementation is wrong against a rule or the document | Back to the implementer — the only address that retries |
| `handoff` | The plan is wrong: a task missing, wrong file, wrong order, a reuse that does not fit | Back to the plan stage, once; on a track that compiles no plan, to the implementer |
| `spec` | The implementation matches the document and **the document is wrong**, or two rules contradict each other | Halts for a person |
| `self` | A gate's own rule is wrong | Halts for a person |

Use `spec` without hesitation when it is true. In this repository the spec wins and changes to
it are deliberate; a contradiction routed to `code` instead sends the implementer into a loop
that cannot terminate, because no implementation satisfies both rules. Finding the
contradiction is a success, not a failure.

**Each stage may only use the addresses it can justify**, and `wf` rejects the rest: a gate that
never read the spec has no business judging it. Your own definition names yours.

## Rule 2 — a blocking finding carries a witness

Something another party can check:

- `"kind": "scenario"` — concrete inputs and state, and the wrong observable result. Not "this
  could be unsafe" but "a member of org A with a valid session opens /org/B/projects and
  receives 200 with org B's rows". For a document, concrete inputs and the two different
  outcomes it permits.
- `"kind": "rule"` — the quoted rule and its `file:line` in `source`. Where two statements
  disagree, both quoted, each with its own line.
- `"kind": "test"` — the test id that fails or is missing, in `test`.
- `"kind": "command"` — the command and its quoted output, in `detail`, with the file it settles
  in `source`.

`detail` must be long enough to check. No witness, or one too thin to check, and it is demoted to
a note automatically. This is how a false positive costs a note instead of five retries, so do not
pad: if you cannot state the failure, you have not found one. **A statement you did not open the
file to check is not a witness.**

Your own definition says which kinds your family uses; `wf` accepts `scenario`, `rule` and `test`,
and the refine loop also accepts `command`.

## Rule 3 — a blocking finding names a criterion

Two fields carry this, and they are not the same field:

- **`criterion`** — an id from the closed register your definition names (`CR-…`, `S-…`), or a
  numbered requirement of the document under review (`REQ-…`). This is what `enforceCriteria` in
  `scripts/wf.mjs` reads.
- **`rule`** — what the finding falls under: for a spec judgement, one of the closed rule list in
  your definition (`spec/contradiction` and its siblings), which the refine loop checks against
  `refine.blockingRules`; for a code judgement, the rule you are applying, with its source.

A blocker naming no criterion, one the register does not carry, or one the register marks
note-only, is demoted to a note — whichever agent wrote it.

This is the single most important constraint on a judge. It is what keeps two runs over the
same diff from producing two different verdicts: blocking power is finite and enumerable, and an
implementer who fixed what was named does not meet a fresh objection over the same lines.

**The register bounds what stops the run, not what you look for.** A defect of a shape nobody
wrote down is still reported — as a note, and a note is where a criterion the register lacks
gets proposed. Notes reach the person at the end and never retry the loop.

Do not invent style rules. Do not flag what a formatter would fix.

## Severity

`blocker` or `note`. There is nothing between them: a blocker stops the run, a note is collected
for the person. A finding you would like acted on but cannot anchor to a criterion, or cannot
give a witness for, is a note — writing it as a blocker does not make it one, it makes it a
demoted blocker in the log.

## Status

- `pass` — nothing blocking, and the coverage below adds up.
- `blocked` — one or more blockers.
- `error` — **you could not do the work at all**: the diff would not resolve, a file was
  unreadable, a container was down. An error is retried without spending the attempt budget, so
  it is never the right answer for work you simply found difficult. Reporting a broken
  environment as a pass sends a phantom result to the next stage.

## Coverage adds up, or the verdict is not a pass

Every judging agent accounts for the whole of what it was given:

```
read + unreached = the scope you were given
```

Naming a file in `unreached` is not a failure; leaving it out of both lists is. **A `pass` with
a non-empty `unreached` is not a pass** — it is a `blocked` with nothing found yet. Saying so
costs one more cycle; pretending otherwise ships an unreviewed file, because the next pass
starts after the one you claimed to have read. Under-reporting coverage to look thorough is the
one dishonesty that would make the gate worthless.

## Where your verdict goes

This is the only thing that differs between running as a stage and running as a child, and the
prompt tells you which you are.

**As a stage** — you are the run's own gate. Write the verdict to the path the prompt names,
with `Write`, as your last act.

**As a child of a lead** — return the verdict as your **final message: one fenced JSON block
and nothing after it.** Do not write a file; answering your parent is the fast path and the only
one you need. Prefix your finding ids with the shard number you were given so they stay distinct
when merged. Say nothing else — no preamble, no summary of what you did.

**A child never blocks the run.** Your findings reach the lead as claims for it to check, and it
signs the verdict. That is not a demotion of your judgement — it is what makes the closed
register mean anything, since a run cannot be stopped by a party that saw only part of it.
