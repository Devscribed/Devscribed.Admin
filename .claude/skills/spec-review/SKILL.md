---
name: spec-review
description: How one specification is judged for admission into development — the closed register, how the reading is split across shards, and what a judge may return a spec for. Use when reviewing a spec, judging whether a spec may enter the pipeline, or writing a spec-review verdict.
---

# Judging a spec for admission

A spec is admitted when every criterion the register marks `blocks` is `clear` or `n/a`. The
register is `references/admission-criteria.md`. Nothing outside it admits or refuses a spec.

This page is the method: what is enumerated, who enumerates it, and who decides.

## Shards find; the judge decides

**A shard never blocks.** It enumerates its assignment, reports every item, and returns each
suspicion as a **claim** with a witness. Severity is not its to set.

**The judge decides what is worth returning.** A claim becomes a blocker only when the judge
finds all three:

1. it names a criterion the register marks `blocks`;
2. its witness settles it — the two quoted statements, the scenario with both outcomes, or the
   command and its output;
3. it has a consequence: the spec is handed back at review, a state the product reaches that
   nobody answers, data lost, or a claim the code refutes.

A claim missing any of the three is a note. Notes reach the person and stop nothing.

**A claim the judge cannot check is not promoted on trust.** The shards read a slice each; the
judge signs the verdict.

## What the judge splits, and how

The axis is the **criteria family**, not the file: a bundle is three files and every family
sweeps all three. Each shard is handed one family, and with it:

- **the criteria ids and their text, quoted** — a shard reads no register and invents no rule;
- **what to enumerate**, in one sentence, and the files to enumerate it from;
- **the shard number**, so merged finding ids stay distinct.

**The families are the register's own sections**, so a criterion added to the register lands in a
family without a second edit here. `scripts/spec-slice.mjs` derives them and prints the
assignment; it is not a decision the judge makes each pass.

| Family | What the shard enumerates |
|---|---|
| Currency | every claim the spec makes about code that exists today, and the command that settles each |
| Conventions | every rule the spec states, against the `CLAUDE.md` convention that governs it |
| Self-sufficiency | every rule the implementer must obey, and where **this** document states it |
| Testability | every case, its route to the state it asserts, and its expected result |
| Obligations | everything the spec obliges itself to contain, counted |

**These stay with the judge and go to no shard:**

- **Contradiction** — the register's whole contradiction section, the state machine and the data
  model included. A shard holds one family and cannot see two regions disagreeing; a
  contradiction lives between them.
- **Scope against the request.** The Summary is the boundary of the whole feature, which is a
  question about the document and not about a slice of it.
- **Divergence**, which is note-only and needs the other documents in view.
- **The admission decision** and the `criteria` map.

**Merge families rather than run an idle shard.** Under the profile's
`mergeFamiliesUnderLines`, the slice pairs them.

## Enumerate first, judge second

Every family is a sweep: list the items, then answer one question about each. **A sweep that
produced no list did not run**, and a count of zero enumerated items is a failed sweep, not a
clean one. Record one line per item, at most a dozen words.

## The boundary

**The spec's Summary is the whole of the feature.** A rule the Summary does not ask for is not
missing — it is out of scope. A finding whose repair would add a route, a screen, a column, a
capability or a flow the Summary never named is not a finding.

**One exception, and it is S-58's whole subject.** Deciding what an already-shipping path does
with a row of a kind this spec invents is not new feature: the repair is a sentence, or one line
in Out of Scope. Asking for it is in bounds; asking for the route that would implement it is not.

## Currency of the pass

**A criterion cleared against text nobody has touched stays cleared.** On a pass that judges a
range, the shards sweep the changed lines and the rules those lines touch, and the judge carries
the earlier answers forward for everything else. The one exception is contradiction: a rule that
changed is checked against the whole document, because that is where a new contradiction lives.

## Findings, once

A document with eleven false statements is eleven findings, or one finding whose witness names
all eleven with their line numbers. It is never "the document needs review". A person fixes what
is named.

**A finding that survived its repair is not filed again.** It goes to a person — either the
requirement is ambiguous or the finding is wrong, and another round decides neither.
