# 0020 — A rule an agent must follow is a field a script reads

**Status:** accepted, 2026-09-06

## The rule

When an agent must perform a step that its output does not otherwise reveal, the step gets a
**named field in the agent's record**, and the script that reads the record **refuses the run when
the field is missing**. Prose in the definition states what belongs in the field; it never carries
the obligation alone.

A rule that only says "do this" is followed at the agent's discretion. A rule whose result must
appear in a field is followed, because the run stops otherwise.

## What it replaced

Rules stated as prose in `.claude/agents/*.md` and nothing else. That is still the right form for a
prohibition, a preference or an ordering — anything whose observance shows in the work itself. It is
the wrong form for a step whose omission is invisible.

## What it costs

A field per obligation, a check per field, and a run that stops on a malformed record rather than
proceeding with a weaker one. The fields are not free to write: the enumeration gate roughly
doubles a judge pass's output tokens, and the repair plan lengthens the fixer's record several-fold.
That is the price of the work actually being done.

It also costs restraint. A field is worth adding only where the step is invisible and the omission
is expensive; a checklist of twenty fields is a form to fill in, and an agent fills in forms.

## The evidence

Measured on one frozen bundle across nine arms, recorded in
[docs/research/2026-09-06-why-a-refine-pass-clears-what-it-should-block.md](../research/2026-09-06-why-a-refine-pass-clears-what-it-should-block.md).

Three rules were written as prose, measured, found to change nothing, and then re-expressed as a
field with a check. Each changed behaviour on the first run afterwards:

| obligation | as prose | as a checked field |
|---|---|---|
| enumerate before judging | sampled | 300–400 items listed per pass |
| plan the repair before editing | 0 of 28 repairs recorded a plan | 26 of 26 |
| say what would produce each asserted value | two cases cleared by citing their own line numbers | 34 of 34 and 32 of 32, first run |

The last one is the clearest. Asked in prose not to settle a case by the text of the case, the judge
wrote `settledBy: "cases.md:228-236"`. Given a `produces` field the loop reads, the same judge wrote
out the four values the case asserts, the column each needs, and the fact that one column cannot
hold two of them — and raised the blocker it had cleared twice before.

## The corollary: what a script can enumerate, a script must enumerate

A judge asked for a long list samples it. On the bundle measured here it raised three of the four
cases pinned to a calendar date; `grep` finds four of four, for nothing, before any model runs.

So the division is: **a script settles what is decidable, the model decides what is not.** The
script hands over a complete population; the model judges each member of it. Inverting this —
paying a model to enumerate and asking a script to judge — is how both halves go wrong at once.

## The corollary that follows from that one

A finding a script can state is a finding the fixer can repair, so `spec-lint`'s findings ride into
the verdict rather than halting the run for a person. Stopping a run to have somebody hand-edit a
date that the fixer rewrites better, in a pass that is running anyway, spends the expensive resource
in the exchange. What still halts: a finding the fixer returns in `left`, because the fixer has read
it and said the choice is a person's, and a finding that survived the repair it was given.

## Where the rules also go

Every rule added to `spec-reviewer` or `spec-fixer-minimal` is also added to the `spec` skill, so
the defect is not written in the first place. A gate that catches a defect on every future spec is
worth less than a template that never produces it. This is why `spec-template.md` matters most of
the three files: it is what authors copy, and it was teaching the opposite of what the gates
enforce — its Verification Plan block instructed authors to record the run's ports, which is exactly
what `plan/environment` refuses.

## What this does not license

A field for every thought. The test is whether the omission is **invisible in the output and
expensive downstream**. "Did you consider X" is not a field; "which column produces this value" is,
because the answer is checkable, short, and its absence is precisely the failure.
