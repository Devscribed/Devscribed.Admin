# Blocking criteria — the closed register for code review

**A review finding blocks only if it names one criterion from this register, or a numbered
requirement of the spec under review.** Anything else is a note. `scripts/wf.mjs` enforces it,
so the register holds for the reviewer and for every shard, in either review profile.

It exists so that two passes over one diff produce the same verdict. Blocking power that is
finite and enumerable is what lets a run be retried without the target moving: an implementer
who fixes what was named is not met by a different objection next pass, and a note never stalls
a run.

**Discovery is not constrained by this page.** The sweeps in `SKILL.md` are the method, and the
mandate to find what nobody wrote down in advance stands — a defect of a shape not listed here
is still reported, as a note, and a note reaches the person at the end. What the register
constrains is what *stops the pipeline*.

**The source column is authority; this page is an index.** Where a criterion comes from
`CLAUDE.md` it is named by section, and where it comes from a sweep by that sweep. The witness
rule and the `target` table in the reviewer's own definition are unchanged and not restated
here.

## Authorization and scope

| id | Blocks when | source |
|---|---|---|
| CR-01 | a query filters on a path parameter rather than `session.organizationId` | CLAUDE.md — Auth |
| CR-02 | a scope mismatch is answered with anything but 404 | CLAUDE.md — Auth; sweep 3 |
| CR-03 | a route added by the change carries no guard, or a guard the spec did not put there | CLAUDE.md — Auth |
| CR-04 | new authorization code handles only one of the stored role values and the target set | CLAUDE.md — Role values |
| CR-05 | unknown and unauthorized are distinguishable — by status, by body, or by a timing signal | sweep 6 |
| CR-06 | a path reaches data without `SessionGuard`, or a revocation does not go through the security stamp | CLAUDE.md — Auth |

## Validation and user-facing text

| id | Blocks when | source |
|---|---|---|
| CR-07 | a user-facing message is written inline rather than taken from a `packages/validation` export | CLAUDE.md — Validation |
| CR-08 | a client-side rule is not re-run server-side | CLAUDE.md — Validation |
| CR-09 | a submit control is disabled for validation, or an invalid submit does not show every error and focus the first invalid field | CLAUDE.md — Submit buttons |

## Web architecture and the design system

| id | Blocks when | source |
|---|---|---|
| CR-10 | `apps/web` gains a route handler or a server action, or fetches without `credentials: 'same-origin'` | CLAUDE.md — Architecture |
| CR-11 | a colour, size or spacing literal is hardcoded, or a control missing from `@ds` is improvised on the screen instead of added to the design system | CLAUDE.md — Design system |
| CR-12 | a navigation entry is rendered for a role that cannot use it | CLAUDE.md — Navigation |
| CR-13 | data access adds a second Prisma client or a repository layer instead of the injected service | CLAUDE.md — Architecture |

## Correctness

| id | Blocks when | source |
|---|---|---|
| CR-14 | an HTTP, provider, queue, filesystem or sleep call is awaited inside an open transaction, or a row lock is held across one | sweep 1 |
| CR-15 | a path that can execute twice has no named mechanism making the second execution harmless | sweep 2 |
| CR-16 | a failure — timeout, 4xx, 5xx, unparseable body — is swallowed, reported as success, or leaves stored state claiming something that did not happen | sweep 4 |
| CR-17 | a guard asks a different question from the invariant it exists to enforce | sweep 10 |
| CR-18 | a mechanism required at a class of call sites is applied at some of them and not the rest | sweep 11 |
| CR-19 | a state transition writes its record outside the transaction that makes the transition, or a partial failure leaves something half-applied | checklist — Correctness patterns |
| CR-20 | a secret, token, live URL, typed value or foreign key reaches a log, a stored row, or a response an unauthorized caller can obtain | sweep 6 |

## Data

| id | Blocks when | source |
|---|---|---|
| CR-21 | a migration renames, drops, or adds `NOT NULL` to an existing table, or the previously deployed code would stop serving against the new schema | CLAUDE.md — Watch out for; sweep 7 |
| CR-22 | a new foreign key leaves its delete behaviour implicit, or an existing free-form or legacy value is silently redefined | checklist — Data |

## Tests

| id | Blocks when | source |
|---|---|---|
| CR-23 | a test id the spec names exists nowhere, or exists at a level other than the one the spec puts it at | CLAUDE.md — Testing; sweep 8 |
| CR-24 | a check was weakened — `.skip`, `.only`, `@ts-ignore`, `as any`, `eslint-disable`, a relaxed assertion, a deleted case | sweep 8 |
| CR-25 | a test asserts the opposite of the spec, or was edited to match the implementation rather than the rule | sweep 8 |
| CR-26 | a test cannot fail — an assertion about a value nothing produces, a selector nothing renders, a mechanism that throws before the assertion runs | sweep 8 |
| CR-27 | a test selects by anything but `data-testid`, or by an id the spec does not name | CLAUDE.md — Testing |
| CR-28 | a test pins a port, or names `devscribed_dev` | CLAUDE.md — An agent's e2e run |

## The change as a whole

| id | Blocks when | source |
|---|---|---|
| CR-29 | something the spec requires is implemented nowhere, or exists only somewhere the spec did not put it | sweep 5 |
| CR-30 | a pair that must agree across a file boundary does not — a caller and its port, a constant and its consumer, a message and its table, a selector and its test, a client rule and its server re-check | sweep 9 |
| CR-31 | shared code the change touches breaks another caller — a module other specs depend on, a nav array, something that stops compiling outside this feature | reviewer — blast radius |
| CR-32 | the diff changes the contract of something that already ships and the spec did not ask for the change | reviewer — blast radius |
