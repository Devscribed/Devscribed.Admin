---
id: "PATCH-001"
title: A mock patch that renames one variable
surface: ui
supersedes: null
requirement: null
cases: []
files: 1
---

## Why

A fixture for exercising the patch track end to end. It changes nothing a user can see and
supersedes no requirement; it exists so the pipeline has a real document of patch weight to
carry, and it is deleted once the flows are verified.

## The rule

When the pipeline is exercised against this note, the implementer shall rename exactly one
local variable in one file and change nothing else. No behaviour changes, no route changes, no
message changes.

## Contracts

No `data-testid` and no user-facing message is added, removed or altered by this note.

## Cases

None. A rename with no observable behaviour has nothing an assertion could catch, and writing
one would be a test that cannot fail.

## Blast radius

One file, one local binding, no exported symbol. Established by reading the file: the binding
is declared and used inside a single function and is not exported.

## Not in this patch

Anything a user can observe. This note exists to move a document through the track, not to
change the product.
