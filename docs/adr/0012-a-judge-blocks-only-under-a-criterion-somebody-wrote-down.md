# 12. A judge blocks only under a criterion somebody wrote down

> **Renamed by [ADR 15](0015-one-core-agent-one-lead-and-the-rules-in-one-place.md).** The agents this record names still exist under the current names; the rules they duplicated now live once, in `.claude/agents/references/`. The decision below is unchanged.

Date: 2026-09-03
Status: accepted

## The rule

Two judges in this repository can stop work: `spec-refiner` in the refine loop, and
`code-reviewer` in the ship pipeline. Each now blocks **only under an id from a closed register**:

- `.claude/skills/spec/references/blocking-criteria.md` — 57 criteria, 43 blocking and 14
  note-only.
- `.claude/skills/code-review/references/blocking-criteria.md` — 32 criteria.

A blocking finding carries `criterion`. A blocker that names none, names one the register does
not carry, or names one the register marks note-only, is **demoted to a note by a script** —
`scripts/refine-loop.mjs` for the spec side, `scripts/wf.mjs` for the review — not by a
prompt. A review may also block under a numbered requirement of the spec it is reviewing, which
is a written rule the register does not own.

The refiner additionally reports **every** criterion each pass, as `clear`, `blocked`, `note` or
`n/a`. The loop prints how many of the register the verdict accounted for, and names any
criterion that was clear in the previous round and blocks in this one.

## What it replaces

A rule list, which is not the same thing. The refiner could already file only under seven rules
(`spec/contradiction`, `spec/stale-statement`, …) and the reviewer only under "a rule that
already exists in `CLAUDE.md`, in the code-review skill, or as a numbered requirement". Both are
**categories**: they say what kind of defect a finding is, not which written check it failed.
Nearly anything can be phrased as a contradiction, and "a rule that exists in `CLAUDE.md`" is a
judgement about a prose document rather than a citation.

The observable cost was a loop that did not converge. Each round the judge swept a document
larger than one pass can enumerate, returned a different subset, and the repair answered
findings the round before had never raised — so the spec grew a section a round while the
blocker count stayed flat. `not-converging` and `growing` are the loop's two stops for exactly
this, and they fire on the symptom.

## What it costs

**Something real will not block.** A defect of a shape nobody wrote down reaches the person as a
note, and a note stops nothing. That is the trade deliberately: a judge that can invent a
blocking rule mid-run cannot be retried against, because the target moves under the party
repairing it. The note is also the intake — a criterion the register is missing is proposed as a
note first, and added to the register by a person.

**The registers must be maintained.** They are two more documents that can go stale, and a
criterion citing `CLAUDE.md` is a second copy of a rule. Mitigated, not solved: each row carries
a `source` column, and both registers state that the source governs when they disagree — the
disagreement is then a defect of the register.

## What was rejected

**Giving the refiner the author's checklist as its rubric.** That is what it had. A page of 75
items handed to a judge that can file under seven rules drains everything it cannot place into
`spec/missing-artefact`, whose repair is new text, which the next pass then has to judge. The
checklist is now the author's alone and the judge is not given it; the `(blocks)` and `(note)`
items are represented in the register as checks with ids.

**Enumerating the criteria in the agent prompts.** They are rules, so a prompt is where the
convention says they belong. They are in a reference instead because three review agents and one
loop must agree on the same list, and four copies of a 32-row table drift within a week.

**Constraining what the judges look for.** The registers bound what *stops* a run, not what is
reported. The open review profile keeps its mandate to find the shape of defect nobody wrote
down in advance, and the refiner keeps its sweeps.

## Two related defects this uncovered

**A gate commit took the whole index.** `commitGate` staged its own paths and then ran a bare
`git commit`, which commits everything staged — so twenty files edited by a person during the
fixer's four minutes landed inside `refine(requests-02): round 1 fix spec-fixer` at 11:06:05 on
2026-09-03. The commit that is supposed to hold repairs and nothing else held somebody's
unrelated work, and the next round would have been asked to judge it. Both the check and the
commit now carry the gate's pathspec. The contaminated commit is left as it stands: the ledger
records its sha, and breaking that reference to tidy a local branch costs more than the mixed
commit does.

**Two loops ran against one spec.** On 2026-09-03 two refine loops interleaved commits into the same
ledger — every artefact is named after the stem, so the second loop overwrote the first's verdict
and each round was judged against a range the other had committed. The output is
indistinguishable from a loop that will not converge. `refine-loop.mjs` now takes
`.workflow/refine/<stem>.lock`, carrying the pid so a lock whose process is gone is taken over
rather than needing a person to delete it.
