# Bug report template

Section order for `specs/bugs/BUG-NNN-slug.md`. Omit a section only when it genuinely does not
apply — never because it is hard.

## Frontmatter

```yaml
---
id: "BUG-014"
title: Archiving a project deletes its time entries
severity: blocker            # blocker | major | minor
surface: api                 # ui | api | data | infra
verdict: SPEC-GAP            # CODE-DEFECT | SPEC-DEFECT | SPEC-GAP
owning-spec: user-management/12
violates: null               # requirement number when CODE-DEFECT, else null
regression-test: TC-12-INT-09
introduced-in: 5b69347       # commit, migration or deploy, when known
affects: [admin, manager]    # roles, or "all"
tags: [time-tracking, archive, cascade]
---
```

## Sections

### `## Symptom`

What the person saw, in their words before yours. One paragraph. No diagnosis here.

### `## Reproduction`

Numbered steps that produce it every time, with the environment and the exact data. Name the
seed or the fixture. If it reproduces only sometimes, say how often and what varies — an
intermittent bug that is reported as deterministic sends the fix in the wrong direction.

### `## Evidence`

What you observed, with links: log excerpts, a failing test, a network response, a query
result, a Playwright trace path. Facts only — the reading of them belongs in the next section.

### `## Root Cause`

The defect, to `file:line`, with the code quoted. Then one paragraph on *why* it produces the
symptom, connecting the two. If you could not find it, say so explicitly and list what you
ruled out; a bounded unknown is useful, a vague one is not.

### `## Spec Verdict`

The routing decision and its justification.

- `CODE-DEFECT` — quote the requirement the code violates, with its spec and number.
- `SPEC-DEFECT` — quote the requirement that is wrong and say what it should say instead.
- `SPEC-GAP` — name the spec that should own this and show that no requirement covers the
  situation. Propose the edge-case row to add.

### `## Fix Approach`

The smallest change that removes the cause, not the symptom. Name the files. Where you
considered another approach and rejected it, say which and why in one line — the next person
to touch this will wonder.

### `## Blast Radius`

A table of what else the fix touches, with a mitigation per row. Shared code, other specs'
behaviour, existing data, in-flight sessions. A fix with no blast radius is a fix in a leaf; if
that is genuinely the case, say so rather than leaving the section out.

### `## Backward Compatibility`

Only when the fix changes stored data, an API response, or a URL. Name the mechanism that
protects existing rows and deployments, not the intention.

### `## Regression Test`

The new case, numbered in the owning spec's scheme, with preconditions, steps, expected
result, and — for E2E — the `data-testid` selectors. State explicitly that it fails against
the current code, and record what it reports when it does.

### `## Acceptance Criteria`

Observable statements that will be true when this is fixed, including the regression test
passing and the original reproduction no longer reproducing.

### `## Known Gaps`

What this fix does not address, why that is acceptable now, and what would close it. A bug
report that admits its edges is one a reviewer can trust.
