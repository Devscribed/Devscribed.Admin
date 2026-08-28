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
