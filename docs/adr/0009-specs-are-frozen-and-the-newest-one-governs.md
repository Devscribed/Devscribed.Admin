# 0009 — Specs are frozen, and the newest one governs

**Status:** current. Reverses the amendment rule that CLAUDE.md carried until this record.

## The rule

A spec is frozen once it is written and refined. Older specs are never edited to stay current.

When a new spec changes something an older one describes, it states the whole new rule **in its
own text** — who may call it, what comes back, which status, which message — completely enough
that a reader of the new spec never opens the old one. It plants no marker in the old document
and writes no "this overrules requirement 45 of spec 01".

A spec is judged on whether it is implementable and checkable **from itself alone**. That is
what `/refine` protects.

## What it replaced

> **A spec that overrules another spec amends it, statement by statement.** Marked beside each
> statement, naming the requirement that overrules it. A banner at the top of a document is a
> promise about the document, not an amendment to it.

Under that rule the `spec-refiner` ran a **Consequence** sweep — "what does this spec make false
elsewhere" — and filed `spec/unamended-consequence` against statements in *other* documents. The
repair was a marker planted beside each one, plus a banner listing the markers.

## Why it was reversed

The bookkeeping produced more defects than it prevented.

Requests spec 02 was refined eight times. Across those passes the amendment machinery planted
**22 markers in five documents** — `requests/01`, `organization/01`, `user-management/00`, `/02`
and `/03` — and the markers then became findings of their own:

| Pass | Finding | About |
|---|---|---|
| 5 | R2 | the area README's visited-site count disagreed with the spec's |
| 6 | R5 | a fifth document had no marker while three of its statements were overruled |
| 7 | R9 | a banner promised "two more" marks and named three |
| 7 | R10 | a banner said two statements were marked; `grep -c` returned four |

Every one of those is a defect **in the bookkeeping**, not in the product. None of them would
exist if the older documents had been left alone.

The Consequence sweep was also the most expensive of the five: on pass 7 it enumerated 34
statements, against 26 for contradiction and 22 for self-description.

### The reader argument, and why it does not hold here

The case for markers is a reader who opens the old spec, finds a statement the new spec
overruled, and implements it. That reader is real but narrow: `/ship` hands the implementer the
spec being shipped and a handoff compiled from it, not the older document as authority. The
older spec is authority only for work that was already done.

The cost of protecting that reader was a second, hand-maintained copy of every changed rule,
spread across documents nobody was editing — and a copy that is not edited alongside the thing
it describes is the definition of a claim that goes stale. Seven passes of evidence say it went
stale immediately and repeatedly.

## What it costs

**A reader of an older spec gets no signal.** Nothing at the top of `requests/01` says a client
principal can now reach `GET …/requests`. Finding that out means knowing the area README indexes
`requests/02`, or grepping. This is the cost, it is accepted, and it is the thing to revisit
first if this decision is re-litigated.

**The newest spec carries more text.** Stating a whole rule costs more words than pointing at
the requirement it changes. That is the trade: length in the document that is read, against
accuracy across documents that are not.

## What replaced the sweep

`spec-refiner`'s third question is now **Completeness**: enumerate every behaviour the spec
retires, replaces, narrows or widens, find where *this spec* states what now holds, and ask
whether an implementer could build it from this document alone. A behaviour changed and not
stated in full here is `spec/incomplete-decision`, a blocker.

The agent is forbidden from filing a finding against another document. `spec-fixer` edits only
the spec it was given and its `.design.md` sibling, and a cross-reference is explicitly not a
repair.

## A hypothesis that died on the way

Before reversing, the intended fix was to keep the markers but **generate** them:
`scripts/spec-amendments.mjs` reading an `## Amendments` table in each new spec and writing an
`## Amended by` block into each target, so no marker was ever hand-written and no banner could
miscount.

It was dropped without being built. The generator removes the *staleness* of the bookkeeping but
not the bookkeeping: the `## Amendments` table restates, in the new spec, what the new spec's
requirements already say, and it is one more artefact for the refiner to check against reality.
The cheaper answer was to stop keeping the second copy at all.

## A gap this work exposed

`.workflow/refine/<area>-<nn>.verdict.json` is **overwritten on every pass**, so a refine loop
leaves no history — only the last verdict survives. The counts in the table above come from the
pass reports rather than from files still on disk. If the loop is ever tuned against its own
numbers, the verdicts need a per-pass filename first.
