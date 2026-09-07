---
id: "BUG-008"
title: A mock defect whose fix is one variable name
severity: minor
surface: ui
verdict: CODE-DEFECT
owning-spec: null
violates: null
regression-test: null
introduced-in: null
affects: all
tags: [fixture, pipeline]
---

## Symptom

A fixture for exercising the bug track end to end. No user has seen this and no user can: it
exists so the pipeline has a real document of bug weight to carry, and it is deleted once the
flows are verified.

## Reproduction

Not reproducible by a user. The subject is a local variable name, which no observation reaches.

## Evidence

None to gather. This section is present because the template requires it, and stating that it
is empty is the honest answer for a fixture.

## Root Cause

By construction rather than by investigation: the name of one local binding in one file.

## Spec Verdict

`CODE-DEFECT` in form only. No requirement is violated, because none speaks about a local
variable name. A real report with this shape would be a `SPEC-GAP` and would not be filed at
all.

## Fix Approach

Rename the binding the prompt names. Touch nothing else.

## Blast Radius

One file, one local binding, no exported symbol.

## Regression Test

None. A rename with no observable behaviour has nothing an assertion could catch.

## Acceptance Criteria

The binding is renamed, the type check passes, and no other file changed.

## Known Gaps

This document is a fixture and is not a model for a real bug report: a real one carries a
symptom somebody saw and a root cause found rather than declared.
