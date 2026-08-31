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
| [001](BUG-001-signwell-text-tags-materialize-no-fields.md) | SignWell materializes no fields from our text tags | blocker | api | `SPEC-DEFECT` | documents/04 | TC-04-INT-25 | fixed |
| [002](BUG-002-email-validation-looser-than-the-provider.md) | A signer address we accept, the provider refuses | major | api | `SPEC-GAP` | documents/04 | TC-04-INT-23 | fixed |
| [003](BUG-003-embedded-signing-url-refuses-framing.md) | The embedded signing URL refuses to be framed | blocker | ui | `SPEC-GAP` | documents/04 | TC-04-INT-26 | fixed |
| [004](BUG-004-field-geometry-sent-in-points-not-provider-pixels.md) | Field geometry sent in points, placed in pixels | blocker | api | `SPEC-GAP` | documents/04 | TC-04-INT-27 | fixed |
| [005](BUG-005-recipient-completed-not-signed.md) | A signed recipient reads `completed`, so the turn never closes | blocker | api | `SPEC-DEFECT` | documents/04 | TC-04-INT-28 | fixed |
| [006](BUG-006-signing-page-csp-blocks-the-product-font.md) | The signing page's CSP refuses the product's own fonts | minor | ui | `SPEC-GAP` | documents/04 | TC-04-E2E-07 | fixed |

## These were found and fixed by hand

BUG-001 onwards did not come from the pipeline and were not fixed through it. They were found
by a person using the product against the live provider, investigated in a chat session, and
the fixes were written and committed there too — no `/ship` run, no static gate, no review
stage, no QA stage. The commits say so in their trailers.

That is worth knowing when reading them: they carry the strengths of manual work — a live API,
a real screen, measurements — and its weaknesses. Two suites were left red by the parallel
agents that made the earlier fixes, and nothing caught it until the next person ran them.

Add a row when the report lands, and close it out when the fix merges. When the verdict is
`SPEC-GAP` or `SPEC-DEFECT`, also note the follow-up in the owning area's README — otherwise
the spec change is forgotten the moment the fix goes green.

## Numbering

Sequential across the whole repository, never reused, never renumbered — the numbers are cited
from commit messages and from the specs' edge-case tables. A withdrawn investigation keeps its
number and records why it was withdrawn.
