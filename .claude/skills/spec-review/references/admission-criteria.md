# Admission criteria — the closed register for `spec-review`

This page is the whole gate. **A specification is admitted into development when every criterion
this register marks `blocks` is answered `clear` or `n/a`.** Nothing else admits it and nothing
else refuses it.

**A blocking finding names one criterion from this register, and a finding that names none is a
note.** `scripts/refine-loop.mjs` enforces that mechanically, so the register holds for any agent
added later.

## The admission rule

1. **Every pass reports every criterion.** The verdict carries a `criteria` map — `clear`,
   `blocked`, `note` or `n/a` for each id. `n/a` is a real answer for a criterion whose subject
   the spec does not have. A verdict with no map is a pass that did not run, and the loop rejects
   it as a judge error rather than recording it as a pass.
2. **Every `blocks` row `clear` or `n/a` — admitted.** There is no further bar, no reviewer's
   discretion to hold a spec that clears the register, and no criterion outside this page.
3. **Notes never gate.** A note reaches the person with the verdict and stops nothing, however
   bad it looks.
4. **Severity is the register's, not the pass's.** A criterion marked `note` is a note however
   bad it looks; a criterion marked `blocks` still needs its witness and its consequence.
5. **A criterion cleared against text nobody has touched stays cleared.** A later pass re-judges
   a criterion only where the text it was cleared against changed. Re-opening settled text is how
   a document is polished forever: each fresh sweep samples a different subset and no pass ever
   comes back empty.
6. **One repair per finding.** A finding that survives its repair is not repaired again — it goes
   to a person, because either the requirement is ambiguous or the finding is wrong, and another
   round decides neither.
7. **A repair is the shortest statement that clears the criterion.** A criterion is not a
   licence to grow the document: see "Refining is not growing" in `.claude/agents/spec-fixer.md`.

## Why it is closed

A judge with categories rather than criteria samples a different subset of a document every pass:
each round comes back with findings the round before never mentioned, the repair grows the spec,
and the loop converges on nothing. A closed register makes a pass comparable to the pass before
it — a criterion cleared against text nobody touched stays cleared, and a criterion that goes
from clear to blocked is a fact about the repair, not about the sampling.

**What a script already decided is not here.** `spec-lint` runs before the judge and settles
every join and pattern — requirement-to-case coverage, statuses and messages declared by the
contract, both `data-testid` lists, decision tables over their declared domains, cited paths,
rules carried by reference, counts in prose, line numbers into code. Re-deriving those spends a
pass on arithmetic.

**Sources.** Where a criterion comes from a document, the source column names it: `CLAUDE.md`
by section, `checklist.md` by its item. Where the register is itself the source, it says
`spec-review`. The source is authority, not a second copy — when a source and this page
disagree, the source governs and the disagreement is a defect of this page.

## Currency — claims about this repository

| id | The question | rule | severity | source |
|---|---|---|---|---|
| S-01 | Every symbol the spec names as existing today — export, function, class, service, guard, component — exists under that name. | `spec/stale-statement` | blocks | spec-review |
| S-02 | Every message text the spec quotes matches the `packages/validation` export it names, character for character. | `spec/stale-statement` | blocks | spec-review |
| S-03 | Every status the spec attributes to a route that already ships is the status that route returns today. | `spec/stale-statement` | blocks | spec-review |
| S-04 | Every schema fact the spec attributes to today — column, type, nullability, default, uniqueness, enum member — matches `apps/api/prisma/schema.prisma`. | `spec/stale-statement` | blocks | spec-review |
| S-05 | Every "today the code does X" claim is true of the code today. | `spec/stale-statement` | blocks | spec-review |
| S-06 | Every `@ds` export the spec relies on is exported by `apps/web/src/ds.ts`, and one that is not has a `## DS gaps` row. | `spec/stale-statement` | blocks | CLAUDE.md — Design system |
| S-07 | Every premise about the pipeline, the deploy or the test rig is cited by file path rather than restated. | `spec/stale-statement` | blocks | checklist — Consistency |
| S-08 | Every number the spec states about its own contents equals the thing it counts. | `spec/stale-statement` | blocks | spec-review |

## Contradiction and ambiguity

| id | The question | rule | severity | source |
|---|---|---|---|---|
| S-09 | No two requirements that no single implementation satisfies at once. | `spec/contradiction` | blocks | spec-review |
| S-10 | No requirement disagrees with a test case's expected result, with the Routes table, or with the Error Messages table. | `spec/contradiction` | blocks | spec-review |
| S-11 | No acceptance criterion disagrees with the requirement it observes. | `spec/contradiction` | blocks | spec-review |
| S-12 | The permission matrix, the flows and the Routes table agree: every actor a flow needs is permitted, every grant the matrix makes is used by a flow, and every route an actor must call to exercise a grant is guarded by a capability that actor holds. | `spec/contradiction` | blocks | spec-review |
| S-13 | The state machine and the edge cases agree: every state the product reaches is declared, every declared transition is fired by some rule or case, and no edge case names a state no transition reaches. | `spec/contradiction` | blocks | spec-review |
| S-14 | Every control a rule needs is drawn on the screen that carries the rule, and no control is drawn for a role the matrix excludes. | `spec/contradiction` | blocks | spec-review |
| S-15 | Every rule has the data it needs — column, nullability, uniqueness, index — either in the schema today or in a migration this spec owns; and no column this spec adds is written by no rule. | `spec/contradiction` | blocks | spec-review |
| S-16 | No rule makes another unreachable: a refusal that fires before the check it complements, an ordering that leaves a second answer unobservable, two numbers for one set. | `spec/contradiction` | blocks | spec-review |
| S-17 | No requirement has two readings that produce materially different implementations. | `spec/ambiguous-requirement` | blocks | spec-review |

## Repository conventions a spec may not overrule

A convention in `CLAUDE.md` is not negotiable by a specification. A spec that asks for the
opposite is a contradiction against the repository, and the repair is the spec's.

| id | The question | rule | severity | source |
|---|---|---|---|---|
| S-18 | A caller outside the organization, or a row it may not see, is answered 404 — never 403. | `spec/contradiction` | blocks | CLAUDE.md — Auth |
| S-19 | Every user-facing validation message names its `packages/validation` export; no message text is invented in a screen or a route. | `spec/contradiction` | blocks | CLAUDE.md — Validation |
| S-20 | Every client-side rule the spec states is re-run server-side, and the spec says so where it states the rule. | `spec/incomplete-decision` | blocks | CLAUDE.md — Validation |
| S-21 | No submit control is disabled for validation: an invalid submit shows every error and focuses the first invalid field. Disabling is for in-flight guards and deliberate confirmations only. | `spec/contradiction` | blocks | CLAUDE.md — Submit buttons |
| S-22 | No colour, size or spacing literal — tokens only, and a control `@ds` lacks goes into the design system with a DS-gaps row rather than being improvised per screen. | `spec/contradiction` | blocks | CLAUDE.md — Design system |
| S-23 | The web app reaches data only through `/api/...`; the spec asks for no route handler and no server action in `apps/web`. | `spec/contradiction` | blocks | CLAUDE.md — Architecture |
| S-24 | No navigation entry is specified for a role that cannot use it. | `spec/contradiction` | blocks | CLAUDE.md — Navigation |
| S-25 | Every migration the spec specifies is additive, and the code deployed before it runs still serves against the new schema. | `spec/contradiction` | blocks | CLAUDE.md — Watch out for |
| S-26 | Every authorization rule the spec adds says what it does with both the stored role values (`admin`, `member`) and the target set (`admin`, `manager`, `user`, `viewer`). | `spec/incomplete-decision` | blocks | CLAUDE.md — Role values |
| S-27 | Every route the spec adds names its guard and the capability it requires, and a spec that revokes sessions says the security stamp rotates. | `spec/incomplete-decision` | blocks | CLAUDE.md — Auth |
| S-28 | Every case sits at the level the repository puts it: a server rule — a status, a message, a token state, an authorization decision — is integration even when a screen shows it, and E2E covers only what an API test cannot reach, one mechanism one case. | `spec/untestable-case` | blocks | CLAUDE.md — Which level a case belongs at |
| S-29 | Selectors are `data-testid`, and the spec names the ids. | `spec/contradiction` | blocks | CLAUDE.md — Testing |

## Self-sufficiency

| id | The question | rule | severity | source |
|---|---|---|---|---|
| S-30 | The reference test: cover every mention of another spec and read the sentence again — nothing the implementer needs went away with it. | `spec/incomplete-decision` | blocks | spec-review |
| S-31 | Every route the spec adds or changes states its audience, its request, its response, every status it answers and every message it emits. | `spec/incomplete-decision` | blocks | spec-review |
| S-32 | Every behaviour this spec changes from what an older document describes is stated here in full, and the older document is neither edited nor marked. | `spec/incomplete-decision` | blocks | checklist — Consistency |
| S-33 | Every vocabulary the spec introduces is enumerated exhaustively — the stored value and the displayed label of each member. | `spec/incomplete-decision` | blocks | spec-review |
| S-34 | No "TBD", no "decide later", no requirement without stated behaviour. | `spec/incomplete-decision` | blocks | checklist — Prose |
| S-35 | Every claim about an external system says how it was established and what it ran against, and no requirement rests on a row marked `Assumed`. | `spec/incomplete-decision` | blocks | checklist — External systems |
| S-58 | Every already-shipping route and control that can act on a row this spec gives a new kind, state or addressee says here what it does with such a row — a rule in this document, or one line placing it out of scope. | `spec/incomplete-decision` | blocks | spec-review |

## Testability

| id | The question | rule | severity | source |
|---|---|---|---|---|
| S-36 | Every case's steps can reach the state it asserts, under this spec's own rules. | `spec/untestable-case` | blocks | spec-review |
| S-37 | Every expected result follows from the steps that precede it. | `spec/untestable-case` | blocks | spec-review |
| S-38 | Every acceptance criterion is settled by one observation, and does not restate a functional requirement. | `spec/untestable-case` | blocks | checklist — Coverage |
| S-39 | A case amended for a new contract is amended on its Expected Result as well as its Steps. | `spec/untestable-case` | blocks | checklist — Consistency |
| S-40 | The Verification Plan records routes, states and observers — never a port, a database name or a connection string. | `spec/untestable-case` | blocks | checklist — Consistency |

## Scope

| id | The question | rule | severity | source |
|---|---|---|---|---|
| S-41 | Everything the request asked for is covered. | `spec/scope-gap` | blocks | spec-review |
| S-42 | Every addition beyond the request that is a new route, a migration, a new writer of a row that already ships, or a changed contract of a shipping route is named in the Summary as an addition. Anything else beyond the request is a note. | `spec/scope-gap` | blocks | checklist — Consistency |
| S-43 | Every unconditional invariant the spec states was checked against the call sites it already governs, and violators are fixed, carved out, or named out of scope. | `spec/contradiction` | blocks | checklist — Correctness patterns |

## Obligations the spec makes of itself

`spec/missing-artefact` has one severity wherever it is filed: **a note.** It blocks only when a
user meets the gap — a control the screens draw that no route serves, a refusal a screen shows
that has no message — and then the finding is that consequence, filed under the rule the
consequence falls under, not the missing row.

| id | The question | rule | severity | source |
|---|---|---|---|---|
| S-44 | Every rule has a case that would fail if the rule were implemented backwards. | `spec/missing-artefact` | note | spec-review |
| S-45 | Every message and every refusal the spec describes has an Error Messages row naming its export and the route that emits it. | `spec/missing-artefact` | note | checklist — Consistency |
| S-46 | Every `##` section and every edge case has a case, or one line saying it has none and why. | `spec/missing-artefact` | note | checklist — Consistency |
| S-47 | Edge cases are a numbered table with exact behaviour per row. | `spec/missing-artefact` | note | checklist — Coverage |
| S-48 | The bundle points at the area `README.md` for blast radius and backward compatibility, which live there and are not repeated per spec. | `spec/missing-artefact` | note | checklist — Coverage |
| S-49 | Known Gaps and Out of Scope exist, each row saying why it is acceptable now and what closes it. | `spec/missing-artefact` | note | checklist — Coverage |
| S-50 | Every "asserted absent" has a presence twin — the same selector or field asserted present where the rule says it should be. | `spec/missing-artefact` | note | checklist — Consistency |
| S-51 | Delete behaviour is stated on every foreign key the spec adds, and its enums, uniqueness constraints and meaningful indexes are listed. | `spec/missing-artefact` | note | checklist — Data |
| S-52 | E2E cases that mutate process-wide state are marked serial. | `spec/missing-artefact` | note | checklist — Consistency |
| S-53 | Deploy-order independence is stated explicitly. | `spec/missing-artefact` | note | checklist — Data |
| S-54 | Every boundary value shared with an external system names its unit and vocabulary on both sides, and what detects a mismatch. | `spec/missing-artefact` | note | checklist — External systems |
| S-55 | No secret value appears in the spec or in any tracked file it adds. | `spec/missing-artefact` | note | checklist — Verification |
| S-56 | Where two writers of a row race in ordinary use, the spec states the lock and what is re-read inside the transaction; where they do not, one line says so and no lock is added. | `spec/missing-artefact` | note | checklist — Correctness patterns |

## The one note-only rule

| id | The question | rule | severity | source |
|---|---|---|---|---|
| S-57 | A behaviour this spec changes that an existing document describes is recorded, so a person can confirm the change was meant. Never a blocker, however large: the newest spec governs. | `spec/divergence` | note | spec-review |
