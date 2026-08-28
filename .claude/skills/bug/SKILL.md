---
name: bug
description: Investigate a defect and write an investigation report to specs/bugs/BUG-NNN-slug.md — symptom, reproduction, evidence, root cause, and the routing verdict that says whether the code is wrong or the spec is. Use when asked to investigate a bug, find why something is broken, or diagnose a UI, API or data defect.
---

# Investigating a bug

A bug report is a specification of a different shape. It carries the same weight: it is the
document the fix is written against and checked by, and it lands in `specs/bugs/` alongside
the feature specs.

**You do not fix anything.** You find the cause and write it down. An investigator who starts
patching stops looking for the cause and starts chasing the symptom — and the two are only
occasionally in the same place. Writing a *failing* test is allowed and encouraged; changing
product code is not.

## The verdict is the point

Everything else in the report supports one decision. `CLAUDE.md` states the rule this rests
on: *when behaviour and spec disagree, the spec wins — change the spec first, deliberately.*
So every investigation ends in exactly one of:

| Verdict | Means | What happens next |
|---|---|---|
| `CODE-DEFECT` | The code violates a rule the spec already states | Fix the code. Add a regression `TC-*` to the owning spec. Goes to the pipeline. |
| `SPEC-DEFECT` | The behaviour matches the spec, and the spec is wrong | **Do not fix the code.** Change the spec first with the `spec` skill; the bug then becomes a CODE-DEFECT. |
| `SPEC-GAP` | The spec is silent on this situation | Add the edge case to the owning spec, then fix. The most common verdict in practice. |

Name the owning spec and the exact requirement number, or say plainly that no requirement
covers it — that *is* the SPEC-GAP finding.

## Gathering evidence

Reproduce it before you explain it. An explanation that does not come with a reproduction is a
hypothesis, and hypotheses belong in the report labelled as such.

The role is the same for every surface; only the instruments change.

**UI** — the browser tools: console messages, network requests, the DOM state at failure. A
Playwright case that fails is worth more than a screenshot. Run E2E with `CI=1` so Playwright
does not attach to a dev server you did not start and so a trace is produced.

**API** — an integration test that reproduces the failure, run against `devscribed_test`. Then
the NestJS logs and, when the shape of a query is suspect, the Prisma query itself. Check
whether the failure survives a change of role: the database holds `admin`/`member` while the
specs target four values, and code that knows only one side fails on real data while passing
on fixtures.

**Data** — the row state, the migration history, and whether the defect is in the write path
or the read path. Prefer a query over a hypothesis.

Always establish two boundaries: **when it started** (a commit, a migration, a deploy) and
**who it affects** (one organization, one role, everyone). A bug that only reproduces for one
org is almost always a scoping bug.

## The report

`specs/bugs/BUG-NNN-slug.md`, numbered sequentially. Follow
[references/bug-template.md](references/bug-template.md) for section order and frontmatter.

Keep the register of the feature specs: state behaviour exactly, carry the reason with the
decision, and cite files by path. Written in English, like every other spec here.

Add the row to `specs/bugs/README.md` and, when the verdict is SPEC-GAP or SPEC-DEFECT, note
the follow-up in the owning area's README so the change is not forgotten once the fix merges.

## The regression test

Name it, place it in the owning spec's numbering (`TC-12-INT-09`, not `TC-BUG-14-01`) and
state the property it holds: it must **fail before the fix and pass after**. A regression test
that passes against the unfixed code is not a regression test, and writing one is how a bug
comes back.

## Severity

`blocker` — data loss, a security or scoping failure, or the product unusable for a role.
`major` — a documented behaviour is wrong with no workaround.
`minor` — wrong but with a workaround, or cosmetic.

Scoping failures are blockers even when nobody has hit one, because the exposure is silent.

## Anti-patterns

- Fixing while investigating.
- A root cause without a `file:line`.
- Skipping the verdict, or hedging between two.
- "Could not reproduce" without recording what was tried and what environment.
- A regression test written after the fix, never seen to fail.
- Filing a SPEC-GAP as a CODE-DEFECT because it is quicker — that puts the pipeline into a
  loop against a requirement that does not exist.
