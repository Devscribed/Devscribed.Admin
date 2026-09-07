specs/time-off/01-vacation-calendar.md

A vacation calendar based on holidays and vacation requests, viewable for the whole organization, for several teams, or for specific people, drawn as a horizontal timeline where each row is a member and each column is a day. Holidays follow a country a manager states on the member, falling back to a country stated on the organization; the phone country code is not a source.

Run `node scripts/spec-slice.mjs specs/time-off/01-vacation-calendar.md --since df2e3aa1e11abfbd2a116ddbf74f61eef596d432 --shape sharded` first. It prints the bundle, this pass's mode, and a ready
split: one shard per member, the criteria that member settles, and the shard agent to use.

**Dispatching is yours to decide.** Delegate when the reading is more than one pass should
hold, and read it yourself when it is not. Either way the verdict says which you did and
why, in `shardDecision`, and records every shard you dispatched in `shards`.

Judge the change: this document has already been judged in full and repaired. The range is `df2e3aa1e11abfbd2a116ddbf74f61eef596d432..HEAD`. Sweep the lines that commit changed and the rules those lines touch, plus contradiction across the whole document. A statement outside the range is a statement an earlier pass accepted.

What that repair was answering is in `.workflow/refine/time-off-01.probe/1/judge.verdict.json`, and what the
fixer says it did about each finding — including what it settled by deciding, and the
alternative it rejected — is in `.workflow/refine/time-off-01.probe/1/fix.verdict.json`. Read both.

They are a claim to check, never a conclusion to accept. A finding listed as fixed is
fixed only if the document now carries the repair; a decision recorded there is one the
fixer made, not one you are bound by. Where the record and the text disagree, the text
is what ships and the disagreement is your finding.

Write your verdict to `.workflow/refine/time-off-01.verdict.json`. That file is the only output of this pass: a
judgement that is not in it did not happen, whatever you say in your final message. Write it
even when nothing blocks — `"status": "pass"` with an empty `findings` array is a verdict
and is the outcome this loop is looking for. Then print the same JSON and nothing after it.