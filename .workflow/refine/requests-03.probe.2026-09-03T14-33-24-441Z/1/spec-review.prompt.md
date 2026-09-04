specs/requests/03-client-participants.md

client contacts can be invited to an organization, raise and receive requests, and see nothing else

Run `node scripts/spec-slice.mjs specs/requests/03-client-participants.md --profile sharded` first. It gives you the bundle, the criteria families and
the shape of this pass. That shape is configuration; do not choose your own.

Judge the document in full. This is its first pass.

Write your verdict to `.workflow/refine/requests-03.verdict.json`. That file is the only output of this pass: a
judgement that is not in it did not happen, whatever you say in your final message. Write it
even when nothing blocks — `"status": "pass"` with an empty `findings` array is a verdict
and is the outcome this loop is looking for. Then print the same JSON and nothing after it.