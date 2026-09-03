---
name: code-review
description: The sweeps a code review is made of, and the evidence each one must produce. Use when reviewing a diff, judging an implementation against a spec, or writing a review verdict.
---

# Code review sweeps

A review is a set of sweeps. Each one **enumerates** something, then answers one question
about **every item it enumerated**. Enumerate first, judge second. A sweep that produced no
list was not run.

Record one line per item, at most a dozen words. No prose, no summary.

Sweeps 5 and 9 are about the change as a whole. Every other sweep applies to the files you
were given.

**The sweeps are the method; what may block is the register.** Each "Blocks when" below has an
id in [references/blocking-criteria.md](references/blocking-criteria.md), and a blocking finding
names that id. A defect a sweep turns up that no criterion carries is a note.

## 1. Transaction sweep

**Enumerate** every transaction the files open — `$transaction`, an explicit unit of work, any
block that commits.

**For each**, list every `await` between the open and the commit, and say what each one is.

**Blocks when** an await inside is anything but a database call on that transaction's own
client: an HTTP or provider call, a queue publish, a file write, a sleep, a callback whose body
you did not open. Also when a row lock is taken and held across such a call.

## 2. Repeat sweep

**Enumerate** every path that can execute twice — retry loops, mutating endpoints, webhook and
queue consumers, anything a person can double-click, anything a scheduler re-runs.

**For each**, name the mechanism that makes the second execution harmless: a unique
constraint, an idempotency key the remote honours, a state guard, or a lookup that finds what
the previous attempt did before acting again.

**Blocks when** you cannot name the mechanism, or when a request that creates something is
repeated without first looking for what the earlier attempt may already have created.

## 3. Scope sweep

**Enumerate** every query and every route handler.

**For each**, the field it filters on and the status it returns when nothing matches.

**Blocks when** it filters by a path parameter rather than the session's organization, or
answers a scope mismatch with anything but 404.

## 4. Failure sweep

**Enumerate** every call that can fail — network, provider, database, filesystem.

**For each**, what the caller does on a timeout, a 4xx, a 5xx, and a body that will not parse.

**Blocks when** a failure is swallowed, reported as success, or leaves stored state claiming
something that did not happen.

## 5. Requirement sweep

**Enumerate** the spec's numbered requirements and every artefact it names — files,
directories, endpoints, columns, environment variables, error messages, test ids, selectors.

**For each**, the command whose output proves it exists, and where it lives.

**Prove it where the spec puts it.** Same name, wrong home, is a miss. A value the spec places
in the deployment is not proved by a local example file; a rule the spec places in shared
validation is not proved by an inline copy; a component the spec places on one screen is not
proved by another screen rendering something similar.

**Walk the spec's sections in order**, and say which artefacts came from each. A section that
contributed none is the finding: a requirement with no file to read is invisible to every
other sweep, and a whole section nobody implemented leaves no trace in a diff.

**Blocks when** something the spec requires is implemented nowhere, or exists only somewhere
the spec did not put it. Run this sweep against the requirement list, never against the diff.

## 6. Leak sweep

**Enumerate** every log line, audit record, stored payload and error response the files add.

**For each**, whether it can carry a secret, a token, a live URL, a value a person typed, or a
key from a foreign system.

**Blocks when** one of those reaches a log, a stored row, or a response an unauthorized caller
can obtain — or when unknown and unauthorized answers differ.

## 7. Schema sweep

**Enumerate** every migration and every schema change.

**For each**, whether it is additive, and whether code deployed *before* it runs still serves.

**Blocks when** there is a rename, a drop, a new `NOT NULL` on an existing table, or a query
in the previous version that would stop working.

## 8. Test sweep

**Enumerate** every test id the spec names and every test the files add or change.

**For each**, where it lives, and **what would have to break for it to fail**.

**A test nothing can break is a finding**: an assertion about a value nothing produces, a
selector nothing renders, a query that resolves to the wrong element, a mechanism that throws
before the assertion runs, or state made global in a suite that runs in parallel.

**Blocks when** an id the spec names exists nowhere, a check was weakened — `.skip`, `.only`,
`@ts-ignore`, `as any`, `eslint-disable`, a relaxed assertion, a deleted case — or a test
asserts the opposite of the spec.

## 10. Predicate sweep

**Enumerate** every guard that holds an invariant up: the `where` of a conditional write, an
early return, the condition on a state transition, a boolean that gates an action.

**For each**, write two things — the rule it is there to enforce, and the exact question the
code asks.

**Blocks when those are not the same question.** It usually reads as almost right:

- the invariant spans two facts and the write constrains one of them;
- equality is required and a subset check is written — every expected item found, nothing
  said about the ones that were not expected;
- "does any row exist" stands in for "does *ours* exist";
- the guard is read from a copy loaded before the transaction that is supposed to protect it,
  so the value it tests is already stale when it is tested;
- two steps run in one pass and the first changes the state the second selects on.

## 11. Call-site sweep

**Enumerate** every mechanism that is meant to hold everywhere rather than somewhere: a
partition or queue key, a scope filter, an audit write, a lazy refresh, a rate limit, a
redaction, an idempotency key.

**For each**, list every call site and say whether the mechanism is present at all of them.

**Blocks when a mechanism required at a class of call sites is applied to some and not the
rest.** Look for what hides it: an optional parameter only one caller passes, a fallback
default that stands in when the real value is absent, a wrapper applied at one entry point of
three. A mechanism with a graceful default fails silently at every site that forgot it.

## 9. Boundary sweep

**Enumerate** every pair that must agree across a file boundary: a caller and its port, a
constant and its consumer, a message and its table, a selector and its test, a client rule and
its server re-check, a documented value and the code that reads it.

**For each**, whether they agree.

**Blocks when** they do not.

## Clearing an item

An item you enumerate and then wave past needs the same evidence as one you raise. Say what
makes it fine, and cite the same closed list of sources: `CLAUDE.md`, this file, or a numbered
requirement of the spec, quoted with its line.

**A comment in the code under review is not a source.** Neither is a variable name, a type
name, a test name or a commit message. Code that argues its own exception to a rule is the
finding, not the answer to it. Quote the carve-out from the spec, or report the violation.

When a rule is unconditional as written and the code gives a reason it should not apply, that
is a contradiction between the code and the spec. Report it, with `"target": "spec"`, and let
a human rule on it. Never settle it yourself by preferring the code.

## Accounting

Every file you were given appears in at least one enumeration, or you state that no sweep
applies to it. A file you can say nothing about was not reviewed.

## What does not block

A finding naming no criterion is a note. A finding with no witness is a note. Formatting,
naming and anything a formatter would change is not a finding at all.
