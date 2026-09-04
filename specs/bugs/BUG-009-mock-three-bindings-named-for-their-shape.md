---
id: "BUG-009"
title: A mock defect whose fix is three independent variable names
severity: minor
surface: api
verdict: CODE-DEFECT
owning-spec: null
violates: null
regression-test: null
introduced-in: null
affects: all
tags: [fixture, pipeline]
---

## Symptom

A fixture for exercising the bug track with the `orchestrated` implement variant, whose whole
point is a lead splitting work across children. No user has seen this and no user can: it exists
so the pipeline has a document naming three independent, disjoint edits, and it is deleted once
the flows are verified.

## Reproduction

Not reproducible by a user. The subject is three local variable names, which no observation
reaches.

## Evidence

None to gather. This section is present because the template requires it, and saying it is empty
is the honest answer for a fixture.

## Root Cause

By construction rather than by investigation: three local bindings are each named `rows`, for
the shape they hold rather than for what they hold.

## Spec Verdict

`CODE-DEFECT` in form only. No requirement is violated, because none speaks about a local
variable name. A real report of this shape would be a `SPEC-GAP` and would not be filed at all.

## Fix Approach

Rename exactly one local binding in each of three files, and touch nothing else:

| File | Binding | Rename to |
|---|---|---|
| `apps/api/src/holidays/holidays.service.ts` | `rows` (in the list method, ~line 115) | `holidays` |
| `apps/api/src/kanban/activity.service.ts` | `rows` (~line 49) | `entries` |
| `apps/api/src/kanban/comments.service.ts` | `rows` (~line 58) | `comments` |

Each binding is declared and used inside a single method, in a single file, and no file needs
any knowledge of the others. Every use of the binding in that method moves with it, and nothing
outside the method changes.

## Blast Radius

Three files, one local binding each, no exported symbol and no signature. The three sets of
changed lines are disjoint: no file appears in two of them, and no rename is visible to another.

## Regression Test

None. A rename with no observable behaviour has nothing an assertion could catch.

## Acceptance Criteria

The three bindings are renamed, `npx tsc --noEmit` passes for the API, and no file outside the
three in the table is changed.

## Known Gaps

This document is a fixture and is not a model for a real bug report: a real one carries a symptom
somebody saw and a root cause found rather than declared, and it does not name the fix line by
line.
