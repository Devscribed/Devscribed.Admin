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

It opens with the request, in one sentence, and closes with what the spec adds beyond it — one
line per addition with its reason: a route the request never named, a migration, a change to the
contract of a route that already ships. Nothing else counts as an addition; a rule that only
completes what was asked for needs no line. An addition the Summary does not name is a scope
finding.

It ends with the pointer that carries two of the six coverage obligations:

```
Blast radius and backward compatibility for this spec are in [README.md](README.md).
```

Those two are properties of the area and live in its `README.md` under `## Blast Radius` and
`## Backward Compatibility`. **They are not repeated in the bundle** — the pointer is the
coverage, and a second copy is the one that goes stale.

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

Mocks in fenced blocks, then the question, the states and what the screen borrows.

**The question.** A screen that asks the server answers a question: the values the answer
depends on — the range, the scope, the filters, the row. Name it once, here, before the states.
Every rule below reads it.

```
| Surface | Behaviour |
```

Loading, empty, saving, read-only, permission-limited and error — **for each question the
screen can ask**, not once for the screen. A row that leaves content on screen says which
question that content still answers.

**What the screen borrows** — every component, place and source it takes rather than defines:

```
| Borrowed | What it demands of the caller | How this spec meets it |
```

A component is read by its entry in `specs/design-system/decisions.md`, not by its name; a
place — a slot, a row, a header, a dialog — states what it does to what is put in it; a list
states its length and the way to reach a member; a table the screen reads states who fills it.
That it exports, or that something already lives there, is not a row.

A screen this spec changes and does not draw is named here as undrawn, with the risk that
leaves open.

## `## Geometry & motion`

Required of every bundle that draws a screen. One row per element whose **content varies** —
in length, in count, or in presence.

```
| Element | What varies | What holds it | What moves if it does not |
|---|---|---|---|
| `calendar-range-label` | a month name, a same-month range, a range crossing a year | a width reserved for the longest label the four window presets produce | `‹`, Today and `›`, far enough that the arrow leaves the pointer that just clicked it |
| the day column header | a holiday name, up to three lines in a 40px column | a fixed-size marker drawn out of the header's flow, the name given on hover | the header row of the whole grid, and every row below it |
| the sourcing panel | a status line present or absent, two possible strings | a fixed width sized for the longer string, and a status slot of one line that does not wrap | the Refresh button, sideways, whenever a sync starts or ends |
```

Three things make a row, and every screen has at least one of them:

- **length** — a label, a name, a sum, a count, a translated string;
- **count** — a chip per selection, a row per result, a badge per state;
- **presence** — an optional second line, a status that appears, a hint that is replaced.

**An empty table is a finding, not an omission.** A screen with genuinely nothing that varies
says so in one row and names why.

Two rules the column "What holds it" is judged against:

- `min-width` and `min-height` are not reservations. They hold until the content exceeds
  them, which is the case they were written for. A reserved slot has a **fixed** size and the
  content inside it is stopped from wrapping.
- A box drawn outside its own flow — absolutely positioned, transformed, portalled — still
  counts toward the scrollable overflow of an ancestor that scrolls, and is clipped by it.
  Where this spec puts such a box inside such an ancestor, the row says how it is kept out of
  that ancestor's layout.

The invariants these rows answer, and the worked examples of each, are in
`.claude/skills/ui-invariants/`.

## `## Edge Cases`

One of the six coverage obligations, and the one a reader reaches for first. A numbered table of
specific situations and the exact behaviour of each — never a paragraph of caveats.

```
| # | Situation | Exact behaviour |
|---|---|---|
| 1 | Two curators rename two topics to the same name at the same instant | The unique index rejects the second; the service maps the violation to `409` `X_MESSAGES.nameDuplicate`. |
```

A row states an outcome a test could observe: a status, a message, what the screen shows. "It is
handled gracefully" is not a row. Every row earns a test case.

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

## `## DS gaps`

Present whenever the mock declares a custom property or writes a colour the design system does not
name — `| Gap | Impact | What closes it |`. Every `--token` the mock declares has a row here, and a
colour with no name to declare carries `@literal <reason>` on its own line. A name improvised on
one screen is improvised again on the next.

## `## Behaviour Walkthrough`

What the product does, who decided it, and where the decision now lives. One row per decision
about product behaviour, business logic or the experience — never one per requirement.

```
| Decision | What was decided | Decided by | Where it lives |
|---|---|---|---|
| What happens to a half-filled request when the author leaves the screen | Discarded; the form opens empty next time, and nothing is stored until Send | human | REQ-04-012, Edge case 7 |
| Who learns that a topic was renamed | Nobody is notified; the new name is simply what the next reader sees | human | REQ-04-019 |
| Where a reader goes from the empty calendar | The empty state carries the control that adds the first absence | human | Screens, mock state `empty` |
| Which status refuses a window wider than the bound | 422 with the shared bound message | agent | REQ-03-004 |
```

**`Decided by`** is `human` or `agent`, and nothing else. `human` is a decision a person was
actually asked and actually answered; anything you settled yourself is `agent`, including a
decision that was easy and a decision you are sure of.

**`Where it lives`** names the requirement, edge case, contract row or mock state that carries the
rule. The rule is stated there once — this table records the decision, and a row that states a
rule the spec does not carry elsewhere is a rule in the wrong file.

Required of every bundle that draws a screen. A bundle that draws none keeps the section wherever
it decides product behaviour, and says in one line where it does not.

**A table of nothing but `agent` is what a spec written without step 2 looks like**, and it is
readable as one. The lint checks that the column is filled, never that it is true.

## `## Verification Plan`

The rig the cases run on, walked **before** they were written. Every cell is what happened, not
what should happen; a row nobody ran says `not run` and earns a Known Gaps entry.

**Bringing it up** — `| Step | Command | Observed |`. Run it on the spec run's own pair under
`CI=1`, against the E2E database and never `devscribed_dev`. **Record what answered, never where it
ran**: the suite claims its own ports and the database follows them, so a port, a host or a
database name written into this table is a fact about one machine on one afternoon, and it is wrong
for the next reader by construction.

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

**Steps and Expected Result carry no calendar date.** A date written as a literal stops being an
example and becomes a promise about the calendar: the case passes until that day is past and then
fails with nobody having changed anything, and a fixture whose start is already behind cannot be
created at all through a route that refuses one. Bind what the case needs to the run's own today
and name the control that reaches it:

```markdown
- **Steps:** Let `M` be the month after the run's today. Seed an approved request spanning a
  weekend inside `M` — the second Friday of `M` through the Tuesday after it. Open the calendar,
  click `calendar-window-month`, then `calendar-next` once to reach `M`.
- **Expected Result:** The band is one element spanning all five columns of its range. The
  `calendar-day-header-{date}` cells of that Saturday and Sunday carry the weekend styling and the
  Monday after them does not.
```

Where a case is about the clock itself, assert the **relation** rather than the readings: that one
zone's date is a day ahead of the other's at that instant, not that they read `2026-09-05` and
`2026-09-04`. A literal date belongs only in a unit case, where it is an argument to a function and
no clock is involved.

**Steps and Expected Result carry no calendar date.** A date written as a literal stops being an
example and becomes a promise about the calendar: the case passes until that day is past and then
fails with nobody having changed anything, and a fixture whose start is already behind cannot be
created at all through a route that refuses one. Bind what the case needs to the run's own today
and name the control that reaches it:

```markdown
- **Steps:** Let `M` be the month after the run's today. Seed an approved request spanning a
  weekend inside `M` — the second Friday of `M` through the Tuesday after it. Open the calendar,
  click `calendar-window-month`, then `calendar-next` once to reach `M`.
- **Expected Result:** The band is one element spanning all five columns of its range. The
  `calendar-day-header-{date}` cells of that Saturday and Sunday carry the weekend styling and the
  Monday after them does not.
```

Where a case is about the clock itself, assert the **relation** rather than the readings: that one
zone's date is a day ahead of the other's at that instant, not that they read two particular days.
A literal date belongs only in a unit case, where it is an argument to a function and no clock is
involved.

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
