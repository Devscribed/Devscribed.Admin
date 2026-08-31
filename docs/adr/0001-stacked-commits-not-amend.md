# 0001 — The implementer adds a commit per attempt and never amends

**Decided** 2026-08-30. Supersedes the original rule, "one run, one commit".

## The rule now

Each implement attempt ends in its own commit, named for the attempt and the findings it
closes: `implement 4: never repeat a create that may already have landed (review 2 F1)`.
Amending a previous attempt's commit is forbidden. The pipeline still never pushes.

## Why the old rule existed, and why it was wrong

The original reasoning was that the reviewer should always see the finished state rather than
a history of attempts. That reasoning does not survive contact with what the reviewer actually
runs: `git diff <baseRef>...HEAD` is the cumulative diff regardless of how many commits
produced it. Amending bought nothing that stacking did not already give.

## What it cost

Measured on the first large run of the pipeline (spec `documents/04-signature-providers`):

- Implement attempt 1 committed at 21:02:57. Review 1 read and judged that tree.
- Implement attempt 2 amended it at 21:48:04, producing `4af8c9b` — author date 21:02:57,
  committer date 21:48:04.
- The commit review 1 approved no longer existed under any name.

That is not cosmetic. Three mechanisms need a permanent name for the state a gate judged:

1. **Coverage provenance.** The review ledger settles a file by asking whether the diff has
   moved since the pass that judged it. Asked which commit review 1 saw, the fallback resolved
   to `38cabfa` — a commit made *before the run started*, by the operator — because the real
   one had been amended away. Every "unchanged since review 1" answer was computed against the
   wrong tree.
2. **Incremental review.** "Only what changed since you last looked" requires *last looked* to
   be a commit that still exists.
3. **Revert and bisect.** A bad fix from attempt 4 cannot be dropped without taking attempt 1's
   good work with it.

It also erased attribution: attempt 1 built the provider port and attempt 2 built the Terraform
plumbing, and both arrived as one commit with one message.

## The cost of the new rule, and why it is acceptable

A branch now carries several commits with names like `implement 4: …`, which is messier than
one. Two things pay for it. Commit messages that name the attempt and the finding are more
informative than a single squashed message, not less. And the pipeline deliberately stops at a
green branch for a person to open the PR — if `main` should get one commit, that is what
squash-merge is for, and it is the merger's decision rather than a decision baked into the
implementer.

## Consequences

- `.claude/agents/implementer.md` states the rule.
- `ship.mjs` records `head` in `stages/<stage>.attempt-<n>.start.json` before each attempt, so
  provenance no longer depends on inferring a commit from a timestamp.
- `scripts/review-ledger.mjs` reads that `head`; its timestamp fallback is only correct for
  runs recorded before that capture existed, and only while nothing rewrote history.
