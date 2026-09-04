# 17. A gate finds nothing in an empty diff

Accepted, 2026-09-04.

## The rule

**The static gate refuses a run whose branch carries no implementation.** Rule 0 of
`scripts/static-gate.mjs` compares `baseRef...HEAD` excluding `.workflow/` and blocks with
`pipeline/work-uncommitted`, addressed to `code`, when that diff is empty. It runs before every
other rule.

**`wf` accepts a fourth witness kind, `command`.** A command and the output it produced is
checkable by anyone who runs it again, which is what rule 2 asks of a witness. It requires a
`source` naming the command, the way `rule` requires a `file:line`.

**A verdict whose findings name no target halts as `gate-schema`, not `gate-authority`.** The
two send a reader to different files.

**The implementer stages the paths it wrote, by name.** `.claude/agents/implementer.md` says so;
`CLAUDE.md` already said it to people.

## What it replaced

Nothing was written down. The implementer's prompt said "Then commit … Not optional" and that
was the whole enforcement: a rule stated once, in a prompt, checked by nobody.

## What it cost to learn

Run `2026-09-04T10-59-04_patches-PATCH-002-needed-by-upper-bound`, the first real run of the
patch track. The implementer wrote four files, ran the suites against them, reported `pass`,
and never committed. What happened next is the reason this record exists:

- **`static_gate` passed.** Every one of its rules asks a question about the contents of the
  diff — did the stage edit a spec, did it weaken a suppression, does a testid the spec names
  get rendered. An empty diff answers "no" to all of them. The gate reported `pass` on a branch
  carrying no work, which is not a gap in any single rule but a property of all of them.

- **`review` found it exactly, and was disarmed by one word.** The finding
  (`review.verdict.json`, F1) was correct, addressed to `code`, severity `blocker`, criterion
  `CR-29`, with a witness quoting three git commands and their output. Its `witness.kind` was
  `command`, and `witnessDefect()` knew only `test`, `rule` and `scenario`, so it was demoted to
  a note and the run advanced. The register offered no kind that fits a claim about the
  repository's state rather than about its code, and the reviewer invented one.

- **`qa` found the same thing and halted the run on its shape.** Its finding carried no
  `target`, so `classify()` rejected it and `wf` halted with "produced findings outside its
  authority" — which named the wrong problem, since the finding was malformed rather than
  overreaching.

Two independent gates found one true blocker. Neither could route it. The budget read
`code 0/3` at the halt: the implementer was never sent back, and the stage that should have
caught this in three seconds had passed twenty minutes earlier.

## The hypothesis that died

**"Say it louder in the prompt."** The obvious repair was to strengthen
`.claude/agents/implementer.md` — the instruction is already there, already bold, already
"Not optional", and it was not followed. A sentence that failed once fails again, and
`CLAUDE.md` forbids paying for justification on every invocation. Adding emphasis would have
bought nothing checkable.

What replaced it is mechanical: the gate that runs immediately after the implementer now asks
whether the commit exists, addresses the answer to `code`, and spends a code attempt. It cannot
be forgotten by an agent because no agent is asked.

The one prompt line that was added is of a different kind — `git add -A` was never forbidden to
the implementer at all, only to people, and the working tree routinely holds machinery moved
aside by `scripts/aside.mjs`. That is a missing rule, not a louder one.

## What it costs

Rule 0 blocks a legitimate no-op run — a document whose implementation is genuinely zero lines.
No such document has existed: `PATCH-001`, the mock, renames a variable and still produces a
diff. If one ever does, it is the document that is wrong.

The `command` witness kind widens what may block. It is the weakest of the four in one respect —
a command's output is quoted by its author rather than re-executed by `wf` — and the strongest
in another, since re-running it is the cheapest verification any witness offers.

## Where the evidence is

`.workflow/runs/2026-09-04T10-59-04_patches-PATCH-002-needed-by-upper-bound/` — `review.verdict.json`
F1 and `qa.verdict.json` both state the defect in full, and `run.json` records the halt and the
unspent budget.
