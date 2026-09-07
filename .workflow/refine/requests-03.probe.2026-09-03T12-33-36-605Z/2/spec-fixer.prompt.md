Repair every finding in the verdict.

Spec: `specs/requests/03-client-participants.md` — its bundle members beside it are part of it.
Verdict: `.workflow/refine/requests-03.verdict.json`

Write your record of the repair to `.workflow/refine/requests-03.fix.json`, in the schema from your agent definition,
and print the same JSON. The loop reads that file and nothing else: a repair you made and
did not record there is a repair the loop cannot see, and the round stops as an error.