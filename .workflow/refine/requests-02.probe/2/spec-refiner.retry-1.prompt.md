specs/requests/02-request-topics.md

Employees pick a request topic from presets the organization curates (VPN, Claude, Question, Other for staff; Access, Other for clients), and the screens say Pending / In progress / Completed / Closed

Judge the change: this document has already been judged in full and repaired. The range is `63204135930ede7d5f2387e4f83d2e878af60081..HEAD`. Sweep the lines that commit changed and the rules those lines touch, plus contradiction across the whole document. A statement outside the range is a statement an earlier pass accepted.

What that repair was answering is in `.workflow/refine/requests-02.probe/1/judge.verdict.json`, and what the
fixer says it did about each finding — including what it settled by deciding, and the
alternative it rejected — is in `.workflow/refine/requests-02.probe/1/fix.verdict.json`. Read both.

They are a claim to check, never a conclusion to accept. A finding listed as fixed is
fixed only if the document now carries the repair; a decision recorded there is one the
fixer made, not one you are bound by. Where the record and the text disagree, the text
is what ships and the disagreement is your finding.