# Architecture decision records

Why the pipeline is shaped the way it is. One file per decision, newest last.

These exist because **agent prompts carry rules, never history** (see CLAUDE.md). When a
measurement changes an agent's instructions, the instruction goes in the agent definition and
the evidence goes here. That split keeps prompts short and keeps the reasoning arguable: a
rule with no recorded reason gets cargo-culted forever, and a rule justified inside a prompt
costs tokens on every invocation to tell an agent something it cannot act on.

A record is worth writing when the decision was not obvious, cost something to learn, or is
likely to be re-litigated.

| # | Decision | Status |
|---|---|---|
| [0001](0001-stacked-commits-not-amend.md) | The implementer adds a commit per attempt and never amends | current |
| [0002](0002-review-worklist-with-provenance.md) | Review coverage is a worklist with provenance, not the reviewer's judgement | superseded by 0003 |
| [0003](0003-commit-slice-not-journal-ledger.md) | A review's scope is a commit range, not a journal-derived ledger | current |
| [0004](0004-review-is-a-set-of-sweeps.md) | A review is a set of sweeps, and clearing an item costs what raising one costs | current |

Measurements that led to these, including the hypotheses that did not survive, are in
[docs/research/](../research/).
