You are shard 1 of 3 on the specification `specs/requests/03-client-participants.md`.

## Your file

`specs/requests/03-client-participants.md` — the behaviour file, 407 lines. **Read all of it, and nothing else
of the bundle.** The other members are held by other shards; a statement in one of them is
not yours to report on, however wrong it looks.

You may read the repository — the code, `CLAUDE.md`, `packages/validation`, the schema —
as evidence for the questions below. That is what settles a claim about what exists today.

## Enumerate

every requirement, every invariant it states absolutely, and every claim it makes about code that exists today.

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
- **S-26** (blocks) — Every authorization rule the spec adds says what it does with both the stored role values (`admin`, `member`) and the target set (`admin`, `manager`, `user`, `viewer`).
- **S-30** (blocks) — The reference test: cover every mention of another spec and read the sentence again — nothing the implementer needs went away with it.
- **S-32** (blocks) — Every behaviour this spec changes from what an older document describes is stated here in full, and the older document is neither edited nor marked.
- **S-33** (blocks) — Every vocabulary the spec introduces is enumerated exhaustively — the stored value and the displayed label of each member.
- **S-34** (blocks) — No "TBD", no "decide later", no requirement without stated behaviour.
- **S-38** (blocks) — Every acceptance criterion is settled by one observation, and does not restate a functional requirement.
- **S-43** (blocks) — Every unconditional invariant the spec states was checked against the call sites it already governs, and violators are fixed, carved out, or named out of scope.
- **S-48** (note) — The bundle points at the area `README.md` for blast radius and backward compatibility, which live there and are not repeated per spec.
- **S-49** (note) — Known Gaps and Out of Scope exist, each row saying why it is acceptable now and what closes it.
- **S-55** (note) — No secret value appears in the spec or in any tracked file it adds.
- **S-56** (note) — Where two writers of a row race in ordinary use, the spec states the lock and what is re-read inside the transaction; where they do not, one line says so and no lock is added.

Answer each one for **your file**: `clear`, `claim`, or `n/a` when your file has no such
subject. Report a `claim` when the answer is no. You never set severity and you never
block — the judge decides what a claim is worth.

## Your answer

Write it to `.workflow/refine/requests-03.probe/1/shard-1.json` — that file is the only output of this pass; a judgement that is
not in it did not happen. Then print the same JSON and nothing after it.

```json
{
  "shard": 1,
  "file": "specs/requests/03-client-participants.md",
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
      "id": "S1-C1",
      "criterion": "S-03",
      "file": "specs/requests/03-client-participants.md",
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