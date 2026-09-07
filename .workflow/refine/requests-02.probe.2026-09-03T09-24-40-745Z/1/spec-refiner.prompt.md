specs/requests/02-request-topics.md

Employees pick a request topic from presets the organization curates (VPN, Claude, Question, Other for staff; Access, Other for clients), and the screens say Pending / In progress / Completed / Closed

Judge the document in full. This is its first pass.

Write your verdict to `.workflow/refine/requests-02.verdict.json`. That file is the only output of this pass: a
judgement that is not in it did not happen, whatever you say in your final message. Write it
even when nothing blocks — `"status": "pass"` with an empty `findings` array is a verdict
and is the outcome this loop is looking for. Then print the same JSON and nothing after it.