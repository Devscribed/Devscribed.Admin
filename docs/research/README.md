# Research

Measurements of the pipeline itself: what was run, against what, and what came back.

This is not the ADR directory. An ADR records a decision and the reasoning that survived;
this records the experiments, including the ones that came out the other way. A hypothesis
that was measured and dropped is worth more here than a conclusion, because the next person
to have the same idea can see it was already tried.

Every record states its ground truth up front, and every number in it comes from an artefact
on disk — a stage log, a session transcript, a verdict — not from an agent's summary of
itself.

| date | subject |
|---|---|
| [2026-08-30](2026-08-30-review-sharding.md) | Does splitting a review across parallel subagents find more? What does model, effort and shard size change? |
| [2026-08-31](2026-08-31-what-review-cannot-see.md) | Twenty-three review passes against an afternoon of using it: which defects each kind of check can reach |
| [2026-08-31](2026-08-31-open-profile-blockers.md) | Appendix to the sharding record: every blocker the checklist-free reviewer raised, in full, by shard model |
| [2026-09-02](2026-09-02-what-blocked-the-requests-runs.md) | Eleven runs of one spec, 24 blockers classified: where the defects actually lived, and why the stage that found them first did not stop for them |
| [2026-09-03](2026-09-03-the-refine-loop-grew-the-spec.md) | Two refine rounds that never reached the judge: nine findings by origin, two of them written by the previous repair, and a bundle that grew 105 lines |
| [2026-09-04](2026-09-04-three-judges-over-one-spec.md) | One spec text judged three times — old judge, new judge, new judge with shards: what each blocked, what sharding recovered and lost, and four hypotheses it killed |
| [2026-09-04](2026-09-04-what-a-run-costs-by-track.md) | What every run on disk actually cost: $1.64 for a patch track against $7.81–$108.61 for a spec, the digest bug that reported $0 for all of them, and a token breaker set fifty times too low |
| [2026-09-05](2026-09-05-what-a-refine-pass-samples.md) | Why one spec took three refine invocations and still reached review with spec defects: five passes over one frozen text, the defect four of them found and five earlier passes cleared, and three hypotheses it killed |
| [2026-09-05](2026-09-05-what-a-shard-can-be-asked.md) | Twelve shard configurations over one frozen spec: what forced sharding finds that a solo opus pass does not, and five hypotheses about why a shard misses — all of them killed |
| [2026-09-05](2026-09-05-what-parallel-sharding-costs.md) | Five judge configurations over one frozen bundle once the children genuinely run at the same time: three mechanism defects, the two serial opus phases that are the real cost, and five hypotheses it killed |
| [2026-09-06](2026-09-06-why-a-refine-pass-clears-what-it-should-block.md) | Why a spec that passed refine reached review with defects of the spec: the baseline found 2 of 15, what effort buys, and the three rules that changed nothing as prose and everything as a checked field |
