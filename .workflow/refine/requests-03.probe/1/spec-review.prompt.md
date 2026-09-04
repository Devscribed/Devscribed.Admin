specs/requests/03-client-participants.md

no request given

## The shards have already run

Each read one member of the bundle and answered the criteria that member settles. Their
reports:

- shard 1 — `specs/requests/03-client-participants.md` — `.workflow/refine/requests-03.probe/1/shard-1.json`
- shard 2 — `specs/requests/03-client-participants.contracts.md` — `.workflow/refine/requests-03.probe/1/shard-2.json`
- shard 3 — `specs/requests/03-client-participants.cases.md` — `.workflow/refine/requests-03.probe/1/shard-3.json`

**They are claims, not conclusions.** Check each witness before you keep it, and check
the dismissals as hard as the claims: a shard that enumerated an item and let it go on
the strength of a code comment has cleared nothing. You sign the verdict; they do not.

Their criteria are answered unless you overturn one, and the reason goes in the verdict.
**Yours are these, and they are the ones no single file settles:**

S-09 S-10 S-11 S-12 S-13 S-14 S-15 S-16 S-17 S-41 S-42 S-44 S-45 S-46 S-57 S-58

Read the whole bundle for those — contradiction lives between two regions, and scope is
a question about the document rather than about a slice of it.

Record each shard in `shards`: its number, its file, how much it enumerated, how many
claims it made and how many you kept.

Judge the document in full. This is its first pass.

Write your verdict to `.workflow/refine/requests-03.verdict.json`. That file is the only output of this pass: a
judgement that is not in it did not happen, whatever you say in your final message. Write it
even when nothing blocks — `"status": "pass"` with an empty `findings` array is a verdict
and is the outcome this loop is looking for. Then print the same JSON and nothing after it.