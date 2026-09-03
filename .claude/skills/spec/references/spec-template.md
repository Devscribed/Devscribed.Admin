# Spec template

Section order for `specs/<area>/NN-name.md`. Omit a section only when it genuinely does not apply —
never because it is hard.

## Frontmatter

```yaml
---
id: "02"
title: Envelopes & Signing
routes: ["/org/{orgId}/documents", "/sign/{token}"]
api: ["POST .../envelopes", "POST .../envelopes/{id}/send", "GET/POST /api/sign/{token}"]
entities: [Envelope, EnvelopeSigner, SigningToken, EnvelopeEvent]
tags: [envelope, signing, magic-link, audit-trail, pdf, terraform, s3, ses]
depends-on: ["01"]
---
```

Frontmatter exists so specs are greppable. `tags` should include the words someone would actually
search for, including infrastructure and mechanism names.

## Sections

### `# NN — Title`

### `## Summary`

Three to six sentences: what this surface does, for whom, and the one structural decision that
shapes it. End with `**Depends on:** Spec NN (Entity, Entity).` when there are dependencies.

### `## Actors & Preconditions`

Who acts, and what must already be true. Include non-account actors (a signer holding a link) when
they exist.

### `## Roles & Permission Matrix`

A table of capability × role with ✅/❌. Add a column for any non-account actor. Note explicitly
when a capability check runs on a normalized or legacy role value.

### `## Functional Requirements`

Numbered, grouped under `###` subheadings by lifecycle stage. One rule per number. Include the
error message text inline where a rule can fail. Numbers are referenced from elsewhere (`spec 02
requirement 40`), so do not renumber casually.

### `## Data Model`

One `###` per entity, a field table with `| Field | Type | Description |`. Mark FKs and their
delete behaviour. Follow with:

- `### New Enums` — the enum values this spec introduces.
- `### New Capabilities (extend Capability enum)` — one line each with the roles that hold it.

Note uniqueness constraints and indexes that carry meaning (`@@unique([EnvelopeId, Order])`).

### `## State Machine`

When the entity has a lifecycle. An ASCII diagram, then a numbered list of invariants — what may be
edited, what is terminal, what is written exactly once, and what must happen in the same
transaction.

### `## Infrastructure`

Only when the spec introduces it. Topology diagram, one table per service with settings and the
*why* for each non-obvious one, IAM roles, Terraform layout, the environment-difference table, cost
characteristics, and how local development and tests avoid touching any of it.

### `## Screens`

ASCII mockups, one per meaningful state. They are not decoration — they settle layout, wording, and
which control appears in which state, and reviewers catch problems there that they miss in prose.

### `## Flows`

`### Flow: <actor does thing>` — numbered steps from user action through API call to observable
result. Then `### Alt Flow: <what went wrong> (branches from <flow>, step N)` with the step number
and the branch. Always include a network/server-error alt flow.

### `## API Contracts`

One `###` per endpoint. Authentication and capability line, request JSON, success JSON with the
status code, then an `**Errors:**` list where every entry is a real status plus the exact body.
Group public/unauthenticated endpoints separately and state their rate limits and non-leakage
rules.

### `## External Contracts`

Only when the spec depends on a system this repository does not own. Three tables.

**Observations** — every claim about the external system's behaviour, one row each:

```
| Claim | How established | Ran against | State the probe was in | Observed / Assumed |
```

A row marked `Assumed` may not carry a requirement. A claim of which one half was seen and the
other inferred is two rows, not one.

**Boundary values** — every value crossing the boundary in either direction:

```
| Value | Our unit or vocabulary | Theirs | Converted where | What detects a mismatch |
```

Coordinates, currencies, times, status words, identifiers, address formats.

**What the double must reproduce** — the behaviours a test double needs for the suite to mean
anything, including the ones that make tests fail:

```
| Provider behaviour | Why a double without it certifies nothing |
```

### `## Validation Rules`

Numbered, each with the constraint and the exact error message. Close with a paragraph on what the
client validates versus what the server re-validates. The server always re-validates everything.

### `## Error Messages`

A `| Context | Message |` table covering every message in the spec — validation, conflicts,
permissions, toasts, empty states. This is the single source of truth; the messages belong in
`packages/validation` so web and API cannot disagree.

### `## UI Description`

Components, their `data-testid`s, interactions, and a `| State | Behavior |` table covering
loading, empty, saving, read-only, permission-limited, and error states.

### `## Required data-testid Attributes`

Grouped by screen area. Every id here appears in an E2E case below, and vice versa.

### `## Out of Scope`

A bullet list of what a reader would reasonably expect and will not get. Where the omission is
interesting, say why in the same line.

### `## Verification Plan`

The rig the cases below run on, walked before they were written. Every cell is what happened, not
what should happen — a row nobody ran says `not run` and gets a Known Gaps entry.

**Bringing it up** — the commands, in order, that put the surface in front of a verifier:

```
| Step | Command | Observed |
```

The ports are the run's own (`E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1`) and the database is the
E2E one, never `devscribed_dev`.

**Reaching the states the cases need** — one row per precondition any `TC-*` below names:

```
| State a case needs | Route to it | Exists today | Proven |
```

The route is a helper in `e2e/tests/helpers.ts`, the product endpoint that gets there, or a fixture
under `apps/api/src/test-support/`. `Exists today: no` makes the route a task this spec owes, and
it appears in the requirements like any other.

**Access this needs** — every credential, account or tool a verifier must hold:

```
| What | Name | Where the value lives | How the next agent gets it | Proven against |
```

Names and locations only. **No value of any secret appears here**, or anywhere else in a tracked
file: the value goes in untracked `apps/api/.env` or in the agent's MCP configuration, and the name
and its explanation go in `apps/api/.env.example` or `.mcp.json`.

**Observing each criterion** — one row per acceptance criterion:

```
| Acceptance criterion | Observer | Level | Proven at spec time |
```

The observer is a `TC-*`, an API call, a query against an external system, or a named human step
when nothing automated can see it.

**Rehearsal** — the throwaway probe: the command that ran, what came back, and the note that the
file was deleted.

A spec with no runtime surface keeps this section and says in one line what a person does instead,
and why nothing automated can.

### `## Test Cases`

`### TC-NN-UNIT-NN`, `### TC-NN-INT-NN`, `### TC-NN-E2E-NN`, in that order. Each carries:

```
- **Level:** Unit | Integration | E2E
- **Preconditions:** …
- **Steps:** numbered
- **Expected Result:** numbered, matching the steps
- **Selectors:** (E2E only) every data-testid the test touches, with "(asserted absent)" where relevant
```

Cover, at minimum: the happy path, every edge case from the edge-case tables, every permission
boundary, org scoping, concurrency and idempotency, and the failure of each external dependency.

## Area README

`specs/<area>/README.md` carries what no single spec owns:

- Why the area exists, in a short paragraph.
- The spec index table.
- **Product decisions** — decision, choice, rationale. Include the alternatives that lost.
- **Shared Rules** — rule, defined in, referenced by.
- **New infrastructure introduced by this area**, if any.
- **Cross-Spec Side Effects** — trigger, source, effect, target.
- **Dependency Graph** — ASCII.
- **Blast Radius** — database, shared code that breaks on contact, security surface, operations.
- **Backward Compatibility** — numbered guarantees, each naming its enforcing mechanism.
- **Known Gaps** — gap, why acceptable now, what closes it.

Blast radius and backward compatibility live in the README when they span several specs, and in the
spec itself when the spec stands alone.
