# 0002 — Review coverage is a worklist with provenance, not the reviewer's judgement

> **Renamed by [ADR 15](0015-one-core-agent-one-lead-and-the-rules-in-one-place.md).** The agents this record names still exist under the current names; the rules they duplicated now live once, in `.claude/agents/references/`. The decision below is unchanged.

**Decided** 2026-08-30. **Superseded the same day by [0003](0003-commit-slice-not-journal-ledger.md)** — the
rule it establishes is right and the mechanism it chose to enforce it was not. Kept because
the measurements below still stand and 0003 rests on them.

## The rule now

`scripts/review-ledger.mjs` splits the diff into two lists and the reviewer works the first:

- **Worklist** — files no pass has judged, plus files a pass judged that have changed since.
- **Settled** — files a pass named where `git diff <that pass's head>..HEAD -- <file>` is empty.

A reviewer may not write a verdict while the worklist is non-empty; if the fuse runs out first
it reports the remainder in `covered.unreached`, and a `pass` with a non-empty `unreached` is
not a pass. The verdict's `read + settled + unreached` must equal the file count.

## What the reviewer's own judgement produced instead

Four passes over one growing diff, measured against the diff each pass actually saw:

| pass | diff | files it named | never opened by anyone, cumulative |
|---|---|---|---|
| 1 | 65 files / 10,747 lines | 55 (85%) | — |
| 2 | 83 files / 11,830 lines | 46 (55%) | |
| 3 | 83 files / 12,228 lines | 50 (60%) | |
| 4 | 84 files / 12,430 lines | 44 (52%) | 9 files |

Both blockers pass 2 raised were in a file pass 1 had never opened. Nine files — eight of them
Terraform, where the run's one still-open deployment defect lives — were never opened by any
pass.

The interesting part is that the reviewers were not careless. Pass 4's verdict justified the
forty files it skipped with "judged reviews 1-3, unchanged since", naming the pass for each.
Every one of those thirteen claims was true — checked afterwards against `git diff`, all
thirteen files were byte-identical since the pass named. **The stories were honest and the
coverage was still wrong**, because nothing required the claim to be checked before it was
acted on, and nothing noticed the files that appeared in no story at all.

So the fix is not "trust the reviewer less". It is to compute the claim the reviewer was
already making, from data it cannot forge, and hand it back as the plan.

## Why not simply re-read everything each pass

Because that is the waste the honest skipping was avoiding. A pass costs roughly twelve
minutes and eight dollars, and 82% of that is the model emitting tokens. Re-deriving 84 files
to re-confirm that 75 of them have not moved spends the fuse the worklist needs.

## Why coverage is derived from the journal

A file counts as judged when the pass's own tool call named its path. That cannot be inflated
by a verdict claiming more than it did. It errs downward — a file read as part of a whole-diff
dump counts as unjudged — and under-crediting is the safe direction, since it sends the next
pass back to a file rather than away from one.

One trap worth recording: paths must be normalised before comparison. `Read` is handed an
absolute path, and on Windows that path uses backslashes while `git diff` names files as
repo-relative POSIX. Before normalisation the ledger scored **zero** for the one tool it exists
to count — all 123 `Read` calls in the reference run were invisible, and every file it credited
had come from a bash command line instead. It then told reviewers to go back to files they had
read in full.

## Consequences

- `.claude/agents/code-reviewer.md` states the rule; the evidence lives here.
- `scripts/review-ledger.mjs` produces the worklist; `scripts/review-coverage.mjs` remains the
  after-the-fact view of who opened what.
- Provenance depends on ADR 0001: an amended-away commit cannot anchor "unchanged since".
