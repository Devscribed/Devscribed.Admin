# 0003 — A review's scope is a commit range, not a journal-derived ledger

**Decided** 2026-08-30. Supersedes [0002](0002-review-worklist-with-provenance.md).

## The rule now

A review pass covers `git diff <the commit the last pass judged>..HEAD`, plus whatever that
pass recorded as `unreached`. Its verdict names `reviewedUpTo` and accounts for the slice:
`read + unreached` equals the slice, and a `pass` with a non-empty `unreached` is not a pass.

`scripts/review-slice.mjs` computes it. `scripts/review-ledger.mjs` and
`scripts/review-coverage.mjs` are retired.

## Why the ledger went

0002 derived coverage from the run journal: a file counted as judged when a review's own tool
call named its path. The idea was that a verdict cannot inflate what the journal recorded.
It is sound in principle and leaked in practice, four times in one day:

- **Windows paths.** `Read` is handed an absolute path with backslashes; the diff names files
  repo-relative with forward slashes. Before normalisation the ledger credited **zero of 123
  `Read` calls** — the one tool it existed to count.
- **Directory arguments.** `git diff -- infra/` displays eight files and names none of them.
  Crediting them required a rule about ancestor directories; the first version of that rule
  matched `apps/api/` inside `apps/api/prisma/schema.prisma` and credited forty files for a
  command that showed one. That is the failure direction that lets a reviewer skip a file
  nobody read.
- **Reading is not judging.** A pass that read half the diff and then died settled 63 files no
  verdict had ever weighed. Settling had to be made conditional on a verdict existing.
- **Unrecorded calls.** Five of 43 commands in one pass reached the journal as `undefined`.

Each fix was correct and none of them was the last one. The common shape is that the journal
is a *proxy* for what an agent looked at, and every proxy needs rules to interpret, and every
rule is a way to be wrong.

## Why the commit range is better

It is not a proxy. `git diff --name-only A..HEAD` is exact, needs no normalisation, cannot be
inflated, and answers "what changed since you last looked" directly rather than by inference.
The "unchanged since" question that 0002 spent most of its code on disappears: a file that did
not change is not in the slice.

It also replaces 463 lines of journal parsing with one git command and a set union.

## What is given up

The journal could, in principle, catch a reviewer that claimed to read a file it never opened;
the slice trusts `covered.read`. That trade is accepted because the journal's version of that
check was weaker than it looked — it could not distinguish reading a file from grepping it,
and it lost calls — while the *slice itself* remains exact. A reviewer can lie about what it
read, but not about what it was given.

## Consequences

- Depends on ADR 0001: an amended commit cannot anchor a range.
- A verdict with no usable `reviewedUpTo` puts the whole change back in scope. Wasteful and
  safe, and the slice says so when it happens.
- `unreached` must contain plain paths. Verdicts written before this rule put prose there
  — "…ts (deleted; verified by grep)" — which made one slice larger than the whole diff.
  Entries that are not paths in the change are now dropped.
