You are shard 3 of 3 on the specification `specs/requests/03-client-participants.md`.

## Your file

`specs/requests/03-client-participants.cases.md` — the cases file, 682 lines. **Read all of it, and nothing else
of the bundle.** The other members are held by other shards; a statement in one of them is
not yours to report on, however wrong it looks.

You may read the repository — the code, `CLAUDE.md`, `packages/validation`, the schema —
as evidence for the questions below. That is what settles a claim about what exists today.

## Enumerate

every test case: the route to the state it asserts, whether its expected result follows from its steps, and the level it sits at.

Build the list before you answer anything about it. A sweep that produced no list did not
run, and zero enumerated items is a failed sweep rather than a clean one.

## Your questions, and the whole of them

- **S-01** (blocks) — Every symbol the spec names as existing today — export, function, class, service, guard, component — exists under that name.
- **S-02** (blocks) — Every message text the spec quotes matches the `packages/validation` export it names, character for character.
- **S-03** (blocks) — Every status the spec attributes to a route that already ships is the status that route returns today.
- **S-04** (blocks) — Every schema fact the spec attributes to today — column, type, nullability, default, uniqueness, enum member — matches `apps/api/prisma/schema.prisma`.
- **S-05** (blocks) — Every "today the code does X" claim is true of the code today.
- **S-07** (blocks) — Every premise about the pipeline, the deploy or the test rig is cited by file path rather than restated.
- **S-08** (blocks) — Every number the spec states about its own contents equals the thing it counts.
- **S-23** (blocks) — The web app reaches data only through `/api/...`; the spec asks for no route handler and no server action in `apps/web`.
- **S-28** (blocks) — Every case sits at the level the repository puts it: a server rule — a status, a message, a token state, an authorization decision — is integration even when a screen shows it, and E2E covers only what an API test cannot reach, one mechanism one case.
- **S-29** (blocks) — Selectors are `data-testid`, and the spec names the ids.
- **S-30** (blocks) — The reference test: cover every mention of another spec and read the sentence again — nothing the implementer needs went away with it.
- **S-32** (blocks) — Every behaviour this spec changes from what an older document describes is stated here in full, and the older document is neither edited nor marked.
- **S-33** (blocks) — Every vocabulary the spec introduces is enumerated exhaustively — the stored value and the displayed label of each member.
- **S-34** (blocks) — No "TBD", no "decide later", no requirement without stated behaviour.
- **S-36** (blocks) — Every case's steps can reach the state it asserts, under this spec's own rules.
- **S-37** (blocks) — Every expected result follows from the steps that precede it.
- **S-39** (blocks) — A case amended for a new contract is amended on its Expected Result as well as its Steps.
- **S-40** (blocks) — The Verification Plan records routes, states and observers — never a port, a database name or a connection string.
- **S-50** (note) — Every "asserted absent" has a presence twin — the same selector or field asserted present where the rule says it should be.
- **S-52** (note) — E2E cases that mutate process-wide state are marked serial.
- **S-55** (note) — No secret value appears in the spec or in any tracked file it adds.

Answer each one for **your file**: `clear`, `claim`, or `n/a` when your file has no such
subject. Report a `claim` when the answer is no. You never set severity and you never
block — the judge decides what a claim is worth.

## Your answer

Write it to `.workflow/refine/requests-03.probe/1/shard-3.json` — that file is the only output of this pass; a judgement that is
not in it did not happen. Then print the same JSON and nothing after it.

```json
{
  "shard": 3,
  "file": "specs/requests/03-client-participants.cases.md",
  "enumerated": [
    {
      "item": "REQ-03-004 cites hasCapability in packages/validation",
      "settledBy": "grep -n \"export function hasCapability\" packages/validation/src/capabilities.ts",
      "ok": true
    }
  ],
  "counts": {
    "enumerated": 34,
    "ok": 33,
    "claims": 1
  },
  "criteria": {
    "S-01": "clear",
    "S-03": "claim",
    "S-06": "n/a"
  },
  "claims": [
    {
      "id": "S3-C1",
      "criterion": "S-03",
      "file": "specs/requests/03-client-participants.cases.md",
      "symbol": "Routes",
      "line": 41,
      "claim": "the route is documented as answering 403; the controller answers 404",
      "witness": {
        "kind": "command",
        "detail": "grep -n \"NotFoundException\" apps/api/src/clients/clients.controller.ts → :88",
        "source": "apps/api/src/clients/clients.controller.ts:88"
      },
      "confidence": "high",
      "suggestedFix": "state 404 in the Errors cell"
    }
  ]
}
```

`criteria` carries every id you were given, and `enumerated` every item you listed — not
only the ones that failed.