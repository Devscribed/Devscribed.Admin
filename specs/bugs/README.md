# Bug Investigations

Investigation reports live here, one file per defect: `BUG-NNN-slug.md`. They are
specifications of a different shape, not tickets — the fix is written against the report and
checked by it, the same way a feature is written against its spec.

Write one with the [`bug`](../../.claude/skills/bug/SKILL.md) skill (`/bug`).

## Why they sit in `specs/`

A bug report answers the same question a spec does — what the behaviour must be — and it
answers it about code that already exists. Keeping the two apart would put half the
authoritative behaviour in a tracker nobody greps.

## The verdict decides what happens next

Every report ends in exactly one of three, and this is the field that matters most:

| Verdict | Means | Next |
|---|---|---|
| `CODE-DEFECT` | The code violates a rule the owning spec already states | Fix the code; add the regression `TC-*` to that spec |
| `SPEC-DEFECT` | The behaviour matches the spec and the spec is wrong | Change the spec first, deliberately. Only then fix |
| `SPEC-GAP` | The spec is silent on the situation | Add the edge case to the owning spec, then fix |

This follows the rule in [`CLAUDE.md`](../../CLAUDE.md): when behaviour and spec disagree, the
spec wins. A `SPEC-DEFECT` filed as a `CODE-DEFECT` sends the pipeline into a loop against a
requirement that does not exist, so the routing is the investigator's most important output —
more than the diagnosis.

## Index

| # | Title | Severity | Surface | Verdict | Owning spec | Regression test | Status |
|---|-------|----------|---------|---------|-------------|-----------------|--------|
| — | *no investigations recorded yet* | | | | | | |

Add a row when the report lands, and close it out when the fix merges. When the verdict is
`SPEC-GAP` or `SPEC-DEFECT`, also note the follow-up in the owning area's README — otherwise
the spec change is forgotten the moment the fix goes green.

## Numbering

Sequential across the whole repository, never reused, never renumbered — the numbers are cited
from commit messages and from the specs' edge-case tables. A withdrawn investigation keeps its
number and records why it was withdrawn.
