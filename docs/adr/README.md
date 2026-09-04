# Architecture decision records

Why the pipeline is shaped the way it is. One file per decision, newest last.

These exist because **agent prompts carry rules, never history** (see CLAUDE.md). When a
measurement changes an agent's instructions, the instruction goes in the agent definition and
the evidence goes here. That split keeps prompts short and keeps the reasoning arguable: a
rule with no recorded reason gets cargo-culted forever, and a rule justified inside a prompt
costs tokens on every invocation to tell an agent something it cannot act on.

A record is worth writing when the decision was not obvious, cost something to learn, or is
likely to be re-litigated.

| #                                                                      | Decision                                                                                          | Status                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------ |
| [0001](0001-stacked-commits-not-amend.md)                              | The implementer adds a commit per attempt and never amends                                        | current                  |
| [0002](0002-review-worklist-with-provenance.md)                        | Review coverage is a worklist with provenance, not the reviewer's judgement                       | superseded by 0003       |
| [0003](0003-commit-slice-not-journal-ledger.md)                        | A review's scope is a commit range, not a journal-derived ledger                                  | current                  |
| [0004](0004-review-is-a-set-of-sweeps.md)                              | A review is a set of sweeps, and clearing an item costs what raising one costs                    | current                  |
| [0005](0005-e2e-runs-beside-a-dev-environment.md)                      | The E2E suite runs beside a dev environment, not instead of it                                    | current, amended by 0007 |
| [0006](0006-the-spec-stage-proves-the-verification-route.md)           | The spec stage proves the verification route, and may repair what QA may not                      | current                  |
| [0007](0007-a-busy-port-moves-the-run-and-stale-servers-are-reaped.md) | A busy port moves the run, and stale servers are reaped                                           | current                  |
| [0008](0008-a-spec-is-judged-by-a-stranger.md)                         | A spec is judged by a stranger, before the pipeline is paid for                                   | current                  |
| [0009](0009-specs-are-frozen-and-the-newest-one-governs.md)            | Specs are frozen; the newest spec that speaks about a behaviour governs it, and states it in full | current                  |
| [0010](0010-a-chain-of-dependent-specs-ships-one-link-at-a-time.md)    | A chain of dependent specs is refined and shipped one link at a time, in dependency order         | current                  |
| [0011](0011-the-board-is-indexed-by-spec-and-a-gate-is-a-commit.md)    | The board is indexed by spec, and every gate of a refine loop is a commit                         | current                  |
| [0012](0012-a-refine-loop-converges-on-the-judge-and-repairs-by-subtraction.md) | A refine loop converges on the judge, runs the pre-implementer last, and stops when a repair grows the spec | current, amends 0008 |
| [0013](0013-a-spec-is-admitted-by-a-judge-that-shards-its-reading.md)  | A spec is admitted by a judge that shards its reading, and the pipeline refuses one nothing admitted | current                  |
| [0014](0014-a-document-earns-its-pipeline-by-its-weight.md)            | A document earns its pipeline by its weight: the config is keyed by track, validated before a run, with the gates on all three | current                  |
| [0015](0015-one-core-agent-one-lead-and-the-rules-in-one-place.md)     | One core agent and one lead per family, with the rules every judge obeys written once outside them | current, renames 0002/0004/0008/0012/0013 |
| [0016](0016-a-setting-nothing-reads-is-a-defect.md)                    | A setting nothing reads is a defect, and `npm run pipeline` says so | current                  |

Measurements that led to these, including the hypotheses that did not survive, are in
[docs/research/](../research/).
