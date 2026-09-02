# Spec template

A spec is a **bundle of three files** sharing a base path. They are one document; they are split
because the three are checked by different means and change at different rates.

```
specs/<area>/NN-name.md             behaviour  — the rules, in EARS, with stable ids
specs/<area>/NN-name.contracts.md   contracts  — tables a script checks
specs/<area>/NN-name.cases.md       cases      — test cases declaring what they assert
```

`NN-name.design.md` may sit beside them when a surface needs drawing beyond the mocks.

**`npm run spec:lint -- specs/<area>/NN-name.md` must be clean before the spec is presented.** It
checks everything below that a script can decide, so write to it as you go rather than at the end.
The table headers on this page are the ones it parses — keep them exactly.

---

# 1. The behaviour file — `NN-name.md`

Budget: `120 + 7 × requirements` lines. Over that, the reasoning has grown around the rules.

## `## Frontmatter`

```yaml
---
id: "02"
title: Envelopes & Signing
routes: ["/org/{orgId}/documents", "/sign/{token}"]
api: ["POST /api/organizations/{orgId}/envelopes", "GET /api/sign/{token}"]
entities: [Envelope, EnvelopeSigner, SigningToken, EnvelopeEvent]
tags: [envelope, signing, magic-link, audit-trail, pdf, terraform, s3, ses]
depends-on: ["01"]
bundle:
  - NN-name.contracts.md
  - NN-name.cases.md
---
```

Frontmatter exists so specs are greppable. `tags` holds the words someone would actually search
for, infrastructure and mechanism names included.

## `## Summary`

Three to six sentences: what this surface does, for whom, and the one structural decision that
shapes it. **The Summary is the boundary of the whole feature** — a rule it never asks for is out
of scope, and the refiner judges scope against it.

## `## Actors & Preconditions`

Who acts and what must already be true. Include non-account actors — a signer holding a link —
when they exist.

## `## Roles & Permission Matrix`

Capability × role, ✅/❌, one column per actor. A matrix is complete by its own shape, so it needs
no directive. Say explicitly when a check runs on a normalized or legacy role value.

## `## Functional Requirements`

Grouped under `###` subheadings by lifecycle stage. Each requirement is an `####` heading:

```markdown
#### REQ-02-014 — a short name for the rule

WHEN a client user opens a request raised for another client, THE SYSTEM SHALL answer `404` and
draw nothing.
```

**Stable ids.** `REQ-<spec>-<serial>`, three digits, assigned once and **never renumbered**. A new
rule takes the next free number wherever it sits on the page. Positional numbering — "requirement
36" — falsifies every sentence that cites it the moment a rule is inserted, and that has cost this
repository whole pipeline runs.

**EARS.** Every rule matches one of five patterns:

| Pattern | Shape |
|---|---|
| Ubiquitous | `THE SYSTEM SHALL <response>` |
| Event-driven | `WHEN <trigger>, THE SYSTEM SHALL <response>` |
| State-driven | `WHILE <state>, THE SYSTEM SHALL <response>` |
| Optional | `WHERE <feature or actor>, THE SYSTEM SHALL <response>` |
| Unwanted | `IF <condition>, THEN THE SYSTEM SHALL <response>` |

Combine a state or an optional clause with an event or an unwanted one when the rule genuinely
needs both: `WHILE the request is open, WHEN the addressee answers, THE SYSTEM SHALL …`.

**Singular.** One requirement, **one observable outcome**. One `SHALL`, one status code. Two
outcomes joined by "and" is two requirements, or a decision table. This is not style: a rule
carrying two outcomes is what a second rule then contradicts, and neither reader can tell which.

**Short.** Twelve lines including any `**Decided:**` note. A rule, not the reasoning that produced
it.

**Reference by id, never by address.** `REQ-02-023`, never "requirement 23 of spec 01" — a
cross-spec pointer is rejected by the lint, because the reader has to leave to learn the rule.
State the rule here instead, in full.

### Decision tables

When a rule branches, the branches go in a table that **declares its own key domains**:

````markdown
`decision-table: keys=(staffRow, clientRow) domains=(staffRow: none|active|removed, clientRow: none|active|removedBound|removedOther)`

| staffRow | clientRow | Outcome |
|---|---|---|
| none | none | The row is created `active`. |
| …one row per cell of the cross product… |
````

The lint requires a row for **every cell**. A cell with no sensible outcome says `Unreachable — `
and why; it never simply goes missing. An empty cell is a state the product reaches and the spec
never answers, which is the defect class that costs a whole run.

**The keys must be independent dimensions.** If two values of one key can be true at once, the
domain is not a partition, two rows match the same state, and the table contradicts itself while
looking complete. The lint checks the cross product is *covered*; it cannot check the domain is
*right*. That one is on you.

## `## State Machine`

A `decision-table` keyed on `(state, event)`, not a diagram. The cross product is the point: a
diagram can omit an arrow silently, a table cannot omit a row. Follow it with numbered invariants.

## `## Out of Scope`

What a reader would reasonably expect and will not get. Where the omission is interesting, say why
on the same line.

## `## Known Gaps`

`| Gap | Why acceptable now | What closes it |`.

## `## Acceptance Criteria`

```
| # | Criterion | Observed by |
```

`Observed by` names the `TC-*` that would fail if the criterion were not met. The lint checks each
one exists.

---

# 2. The contracts file — `NN-name.contracts.md`

Tables. No prose that states a rule — rules live in the behaviour file and are referenced by id.

## `## Routes`

```
| Route | Guards | Success | Errors |
```

`Route` is exactly `METHOD /path`, in backticks, with the full path and no ellipsis. `Success` and
`Errors` carry every status this route can answer and the message export beside each refusal. **A
status a case expects and this table does not declare is a lint error** — which is how a spec that
says 200 in one place and 201 in another stops being something a judge has to find.

Response bodies go in a fenced ` ```json ` block under a `###` heading per route. **Open the
controller before writing one** — a field name copied from an older spec is a claim the code
refutes.

## `## Error Messages`

```
| Export | Route | Message | New |
```

Every message the spec's rules and cases name, including the ones it reuses unchanged: restated
here so a case author asserting a body never leaves this bundle. `Route` lists every route that
emits it, comma-separated, each `METHOD /path` in backticks. `New` is `yes` or `no`.

The lint joins this table against the Routes table **in both directions** — the two describe one
refusal from two sides and can disagree.

## `## Data Model`

One `###` per new entity with `| Field | Type | Description |`; one table for columns added to
existing entities. Mark FKs and their delete behaviour. Migrations are additive.

## `## Validation Rules`

```
| # | Field | Constraint | Message | Server-only |
```

Close with one line on what the client validates and what the server re-validates. The server
re-validates everything.

## `## Required data-testid Attributes`

```
| id | Screen | Asserted |
```

`Asserted` says `present`, `absent`, or which for whom. The lint checks every id here is asserted
by a case and every id a case asserts is here.

## `## Screens` and `## UI Description`

Mocks in fenced blocks; `| Surface | Behaviour |` for loading, empty, saving, read-only,
permission-limited and error states.

## `## Security`

Bullets: what the schema or scoping choice buys, the refusal discipline (404 not 403 across
organizations), what is revoked and how fast, what is not exposed.

## `## External Contracts`

Only when the spec depends on a system this repository does not own. Three tables.

**Observations** — every claim about the external system:
`| Claim | How established | Ran against | State the probe was in | Observed / Assumed |`
A row marked `Assumed` may not carry a requirement. A claim half seen and half inferred is two rows.

**Boundary values** — everything crossing the boundary either way:
`| Value | Our unit or vocabulary | Theirs | Converted where | What detects a mismatch |`

**What the double must reproduce**:
`| Provider behaviour | Why a double without it certifies nothing |`

---

# 3. The cases file — `NN-name.cases.md`

## `## Verification Plan`

The rig the cases run on, walked **before** they were written. Every cell is what happened, not
what should happen; a row nobody ran says `not run` and earns a Known Gaps entry.

**Bringing it up** — `| Step | Command | Observed |`. The ports are the run's own
(`E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1`) and the database is the E2E one, never
`devscribed_dev`.

**Reaching the states the cases need** — `| State a case needs | Route to it | Exists today | Proven |`.
The route is a helper in `e2e/tests/helpers.ts`, a product endpoint, or a fixture under
`apps/api/src/test-support/`. `Exists today: no` makes it a task this spec owes.

**Access this needs** — `| What | Name | Where the value lives | How the next agent gets it | Proven against |`.
Names and locations only. **No secret value appears in a tracked file.**

**Rehearsal** — the throwaway probe: the command, what came back, and the note that the file was
deleted.

A spec with no runtime surface keeps this section and says in one line what a person does instead.

## `## Test Cases`

`### TC-NN-UNIT-NN`, `### TC-NN-INT-NN`, `### TC-NN-E2E-NN`, in that order. Each carries:

```markdown
### TC-02-INT-04

- **Level:** Unit | Integration | E2E
- **Covers:** REQ-02-014, REQ-02-015
- **Asserts:** `POST /api/invitations/accept` → 409 CLIENT_USER_MESSAGES.accountIsClient;
  `POST /api/invitations/accept` → 200
- **Steps:** …
- **Expected Result:** …
- **Selectors:** (E2E only) every `data-testid` the test touches, with `(absent)` where relevant
```

**`Covers`** names the requirements this case would fail for. The lint checks every id exists and
**every requirement is covered by at least one case** — a rule nobody observes is a rule nobody
built.

**`Asserts`** is the observable half, in a strict grammar so a script can join it:

```
METHOD /path → status [MESSAGES.key]
```

repeated, separated by `;`. Paths match the Routes table exactly. This is what turns "does the spec
agree with itself about the status code" from a judgement into an integer comparison.

Cover, at minimum: the happy path, every cell of every decision table, every permission boundary,
org scoping, concurrency and idempotency, and the failure of each external dependency.

**Which level.** A server rule — a status, a message, a token state, an authorization decision —
belongs at integration even when a screen shows it. E2E earns its place only when the assertion is
out of reach of an API test: a multi-page journey through real mail, focus and blur, layering, CSS
tokens, the session cookie, a control that must not be drawn.

---

# Area README

`specs/<area>/README.md` carries what no single spec owns:

- Why the area exists, in a short paragraph.
- The spec index table.
- **Product decisions** — decision, choice, rationale, and the alternatives that lost.
- **Shared Rules** — rule, defined in, referenced by.
- **New infrastructure introduced by this area**, if any.
- **Cross-Spec Side Effects** — trigger, source, effect, target.
- **Dependency Graph** — ASCII.
- **Blast Radius** — database, shared code that breaks on contact, security surface, operations.
- **Backward Compatibility** — numbered guarantees, each naming its enforcing mechanism.
- **Known Gaps** — gap, why acceptable now, what closes it.

Blast radius and backward compatibility live in the README when they span several specs, and in the
spec itself when the spec stands alone.
