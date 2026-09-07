You are shard 2 of 3 on the specification `specs/requests/03-client-participants.md`.

## Your file

`specs/requests/03-client-participants.contracts.md` — the contracts file, 555 lines. **Read all of it, and nothing else
of the bundle.** The other members are held by other shards; a statement in one of them is
not yours to report on, however wrong it looks.

You may read the repository — the code, `CLAUDE.md`, `packages/validation`, the schema —
as evidence for the questions below. That is what settles a claim about what exists today.

## Enumerate

every route, message, column, validation rule, screen state and edge case, and every claim any of them makes about code that exists today.

Build the list before you answer anything about it. A sweep that produced no list did not
run, and zero enumerated items is a failed sweep rather than a clean one.

## Your questions, and the whole of them

- **S-01** (blocks) — Every symbol the spec names as existing today — export, function, class, service, guard, component — exists under that name.
- **S-02** (blocks) — Every message text the spec quotes matches the `packages/validation` export it names, character for character.
- **S-03** (blocks) — Every status the spec attributes to a route that already ships is the status that route returns today.
- **S-04** (blocks) — Every schema fact the spec attributes to today — column, type, nullability, default, uniqueness, enum member — matches `apps/api/prisma/schema.prisma`.
- **S-05** (blocks) — Every "today the code does X" claim is true of the code today.
- **S-06** (blocks) — Every `@ds` export the spec relies on is exported by `apps/web/src/ds.ts`, and one that is not has a `## DS gaps` row.
- **S-07** (blocks) — Every premise about the pipeline, the deploy or the test rig is cited by file path rather than restated.
- **S-08** (blocks) — Every number the spec states about its own contents equals the thing it counts.
- **S-18** (blocks) — A caller outside the organization, or a row it may not see, is answered 404 — never 403.
- **S-19** (blocks) — Every user-facing validation message names its `packages/validation` export; no message text is invented in a screen or a route.
- **S-20** (blocks) — Every client-side rule the spec states is re-run server-side, and the spec says so where it states the rule.
- **S-21** (blocks) — No submit control is disabled for validation: an invalid submit shows every error and focuses the first invalid field. Disabling is for in-flight guards and deliberate confirmations only.
- **S-22** (blocks) — No colour, size or spacing literal — tokens only, and a control `@ds` lacks goes into the design system with a DS-gaps row rather than being improvised per screen.
- **S-23** (blocks) — The web app reaches data only through `/api/...`; the spec asks for no route handler and no server action in `apps/web`.
- **S-24** (blocks) — No navigation entry is specified for a role that cannot use it.
- **S-25** (blocks) — Every migration the spec specifies is additive, and the code deployed before it runs still serves against the new schema.
- **S-27** (blocks) — Every route the spec adds names its guard and the capability it requires, and a spec that revokes sessions says the security stamp rotates.
- **S-30** (blocks) — The reference test: cover every mention of another spec and read the sentence again — nothing the implementer needs went away with it.
- **S-31** (blocks) — Every route the spec adds or changes states its audience, its request, its response, every status it answers and every message it emits.
- **S-32** (blocks) — Every behaviour this spec changes from what an older document describes is stated here in full, and the older document is neither edited nor marked.
- **S-33** (blocks) — Every vocabulary the spec introduces is enumerated exhaustively — the stored value and the displayed label of each member.
- **S-34** (blocks) — No "TBD", no "decide later", no requirement without stated behaviour.
- **S-35** (blocks) — Every claim about an external system says how it was established and what it ran against, and no requirement rests on a row marked `Assumed`.
- **S-47** (note) — Edge cases are a numbered table with exact behaviour per row.
- **S-51** (note) — Delete behaviour is stated on every foreign key the spec adds, and its enums, uniqueness constraints and meaningful indexes are listed.
- **S-53** (note) — Deploy-order independence is stated explicitly.
- **S-54** (note) — Every boundary value shared with an external system names its unit and vocabulary on both sides, and what detects a mismatch.
- **S-55** (note) — No secret value appears in the spec or in any tracked file it adds.

Answer each one for **your file**: `clear`, `claim`, or `n/a` when your file has no such
subject. Report a `claim` when the answer is no. You never set severity and you never
block — the judge decides what a claim is worth.

## Your answer

Write it to `.workflow/refine/requests-03.probe/1/shard-2.json` — that file is the only output of this pass; a judgement that is
not in it did not happen. Then print the same JSON and nothing after it.

```json
{
  "shard": 2,
  "file": "specs/requests/03-client-participants.contracts.md",
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
      "id": "S2-C1",
      "criterion": "S-03",
      "file": "specs/requests/03-client-participants.contracts.md",
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