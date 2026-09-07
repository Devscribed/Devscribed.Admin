# Gate audit — the blocked review of `specs/requests/03-client-participants.md`

Run: `.workflow/runs/2026-09-03T16-00-49_requests-03-client-participants` (review at
`771451a`, 5 blockers / 24 notes).
Gates audited: T0 `scripts/spec-lint.mjs`, T2 `spec-refiner`, T1 `pre-implementer`,
`static_gate`, `review`.

Every claim below comes from an artefact on disk: the review verdict, the pre-implement
report, the three refine ledgers and their probe verdicts, the two registers, the two agent
definitions, `scripts/spec-lint.mjs`, `scripts/refine-loop.mjs` and the git log.

---

## Verdicts

| id | Gate that should have caught it | Cause | Proposed change |
|---|---|---|---|
| F1 — reassign extended to a client addressee, no trail | **T2** (T1 had the fact too) | No criterion's enumeration reaches a shipping route the bundle never names. S-31 and S-42 are keyed to routes *the document lists*; the reassign route is in no table of this bundle, so both were cleared truthfully and neither looked. | **P2** — new register row `S-58` |
| F2 — `user` is granted an addressee kind no route lets it fill | **T2** | Criterion **exists and was not applied**: `S-12` was reported `clear` by every pass, including the full opus pass at `2bc8fca` where both halves of the contradiction were already in the file. `S-12`'s text compares the matrix with *flows*; the guard lives in the Routes table, which the criterion never names. | **P1** — sharpen `S-12` |
| F3 — `browser.newContext()` with no `baseURL`, relative `goto` | **review, correctly** | The test did not exist before `implement`. `CR-26` was in the register, was applied, and the finding carries a checkable witness. | none |
| F4 — members screen ungated for a client principal | **review, correctly** | The screen's gate could not be judged before the code existed. The spec-side half — `TC-03-E2E-02` asserting "renders no screen behind it" while naming only sidebar selectors — is `S-44`, which the register makes **note-only on purpose**. | none |
| F5 — `TC-03-UNIT-02` asserts around the rule instead of it | **review, correctly** | The test did not exist before `implement`; the spec's expected result is unambiguous and true of the code. `CR-25` applied. | none |
| N7 — an admin answers a client-addressed request | **T2** | Same cause as F1: a shipping route meeting a row kind this spec creates, with no rule and no out-of-scope line. | covered by **P2** |
| N21 — the DS `Modal` changed outside scope | **review, correctly found; should have blocked** | `CR-32` covers it on its face (a shipped component's contract changed, no handoff task names it, DS gaps says "None"). The reviewer filed it with `criterion: null`. Criterion **exists, severity under-called**. | none to the registers |
| systemic | **T2's harness** | The verdict that cleared this spec for the pipeline carries **no `criteria` map and no `sweeps`** — by the refiner's own definition, criteria that are absent from the map "were not run" — and the loop recorded it as `pass`. The same loop ran the judge on **sonnet** while `judgeModel` is `opus`. | **P3**, **P4** |

Three of the five blockers are the pipeline working. F3, F4 and F5 are defects of code and
tests that did not exist when any earlier gate ran; the review found them, under criteria that
were already written down, with witnesses a person can check. No earlier gate could have seen
them and none should be changed on their account.

---

## The repairs already in the bundle

Only **one** of the reviewer's five blockers has been repaired in the spec bundle. The git log
on `spec/requests-02-client-participants` carries exactly two `spec(requests-03)` commits since
the run began, and only one of them is after the review:

- **`30401b4` — repairs F2.** Post-review (20:33, review at 20:24). It adds `REQ-03-043` and
  `GET /api/organizations/{orgId}/request-contacts`, guarded `create-request` and bounded by
  the requester's own projects, plus `TC-03-INT-36`. **The repair is right and is made the way
  CLAUDE.md asks**: the contradiction is settled *in the document*, by a person, with the
  rejected alternatives recorded (granting `user` `view-clients`; dropping `user` from the
  matrix). The picker's boundary is now `REQ-03-023`'s own, so the offered set equals the
  accepted set — the contradiction is closed rather than papered over.
  Two loose ends in the repair, both checkable:
  - **`S-42` will block on the next refine pass.** The repair adds a new route; `S-42` requires
    an addition that is a new route to be **named in the Summary as an addition**, and the
    Summary was edited in the same commit without naming it.
  - The front-matter `api:` list still does not carry the new route, where it carries the six
    others.
  - It is unimplemented: the modal still fills its picker from `/clients` + `/contacts`, so F2
    is repaired in the document and open in the code until the next run.
- **`4cc668a` — repairs the *pre-implementer's* P1, not a reviewer blocker.** Pre-review
  (19:00). It adds `REQ-03-042` (a staff invitation refuses an account holding an active
  `ClientMembership`, at write and at accept), reopens `TC-03-INT-08` from both directions and
  amends AC-2. The repair holds and the implementation carries it. Its one loose end is the
  reviewer's N9: `acceptClientExistingAccount` can answer `409 CLIENT_USER_MESSAGES.alreadyLinked`
  on a route whose Routes row lists only `tokenInvalid` and `principalConflict`.

F1, F3, F4 and F5 all target `code`, and there is no code commit after `771451a`. Nothing in
the bundle answers F1's question about what the reassign route does with a client-addressed
row; the Known Gaps row still names "a reassign path that accepts a client addressee" as
future work, which is precisely what the code shipped.

---

# Proposed changes

## P1 — sharpen `S-12` so the matrix is compared with the Routes table's guards

**File:** `.claude/skills/spec/references/blocking-criteria.md`, Contradiction and ambiguity.

Replace the `S-12` row with:

| id | The question | rule | severity | source |
|---|---|---|---|---|
| S-12 | The permission matrix, the flows and the Routes table agree: every actor a flow needs is permitted, every grant the matrix makes is used by a flow, and every route an actor must call to exercise a grant is guarded by a capability that actor holds. | `spec/contradiction` | blocks | refiner |

**Why this is closed and checkable.** The enumeration is finite and written down: one line per
`✅` in the matrix; for each, the routes the flow calls; for each route, the Guards cell. The
finding names a grant, a route and the guard the granted actor lacks. It cannot be filed
without those three, so it licenses no blocker under a pretext.

**Evidence.** At `2bc8fca`, the state the full opus judge pass ran against, the bundle carried
both halves of F2 at once:

- `Raise a request, to a colleague or to a client contact | ✅ | ✅ | ✅ | ❌ | ❌` — `user` granted;
- `GET …/clients/{clientId}/contacts | session, org scope, ViewClients` — the only route in the
  product that lists contacts.

That pass reported `"S-12": "clear"`, and so did every later pass
(`requests-03.probe.2026-09-03T12-33-36-605Z/1` and `/2`,
`requests-03.probe.2026-09-03T13-53-50-451Z/1`). The judge was reading `S-12` as
matrix-against-flows, which is what the row says; the guard is not part of a "flow" as the row
words it. Five hours of pipeline later the reviewer filed the same fact as F2 and returned it
to a person, who added a route.

## P2 — a new register row for a shipping route that meets a state this spec creates

**File:** `.claude/skills/spec/references/blocking-criteria.md`, Self-sufficiency, after `S-31`.

| id | The question | rule | severity | source |
|---|---|---|---|---|
| S-58 | Every already-shipping route and control that can act on a row this spec gives a new kind, state or addressee says here what it does with such a row — a rule in this document, or one line placing it out of scope. | `spec/incomplete-decision` | blocks | refiner |

**Why this is closed and checkable.** Its enumeration is the new values the spec adds to a
column or a table that already ships — here `Request.assigneeKind = 'client'` and
`assigneeClientMembershipId` — and, for each, the shipping paths that read or write such a row.
That list is finite and obtainable by grep, which the refiner has. The repair is a sentence or
an out-of-scope line, never a route or a screen, so it does not violate "refining is not
growing".

**Why an existing row does not cover it.** `S-31` and `S-42` are both keyed to routes the
*document* names — "every route the spec adds or changes", "an addition that is a new route".
The reassign route appears in no table of this bundle, so nothing put it in front of the judge;
both criteria were reported `clear` on the full pass and both answers were honest. `S-43` runs
the other direction (an invariant the spec states, against the call sites it already governs);
there is no invariant here to run. The gap is that every criterion's enumeration is driven by
the document's own tables, and a shipping path the document is silent about is invisible to all
of them.

**Evidence.**

- `REQ-03-035` names `reassigned` among the events that must write an outbox row, so this spec
  changes the reassign path; the Routes table carries no reassign row, and the Known Gaps table
  names "a reassign path that accepts a client addressee" as what closes a gap — i.e. as absent.
- The judge came within one step. Opus, round 2 of loop `12-33-36`, note V3: *"The repaired
  recipient set is decidable for every event except a reassignment, where 'its addressee' names
  two different people."* The fixer's record for V3 (`…probe.2026-09-03T12-33-36-605Z/2/fix.verdict.json`)
  reads *"this bundle declares no reassign route or message of its own to hang it on"* — the
  gate had the fact in hand, decided *which* addressee is notified, and never asked whether the
  route may take a client-addressed row at all.
- The implementer then extended `reassignRequest` to client-addressed rows and dropped the
  outgoing contact from the event's label columns (F1), and the detail screen draws the control
  for the row (`showReassign = !terminal && canViewAll`) beside a comment asserting the opposite.
- N7 is the same shape at a second site: an admin may mark a client-addressed request answered,
  because spec 01's carve-out was written for a member addressee and nobody decided the cell.

One row covers both, and both were decidable before any code was written.

## P3 — the loop refuses a judged pass that reports no criteria

**File:** `scripts/refine-loop.mjs`, the T2 branch (the `else if (SPEC_CRITERIA.ids.size)`
arm that currently prints `the verdict carries no criteria map`).

Change: a judged round whose verdict carries no `criteria` map is `judge-error` — retried like
a pass that produced no verdict — not a round recorded as `pass`.

**Evidence.** The verdict on whose strength this spec entered the pipeline is
`.workflow/refine/requests-03.probe.2026-09-03T13-53-50-451Z/2/judge.verdict.json`. Its keys
are `status, spec, range, note, checked, contradictionSweep, findings` — no `criteria`, no
`sweeps`. The ledger recorded `"criteria": null`, the loop printed one line and went on to T1.
Both governing documents say what that means: the register — *"A criterion missing from the map
was not run"* — and the agent definition — *"A criterion you leave out of the map is one you
did not run, and the loop prints it as unreported"*. Printing is what it does; the pass still
counts. So the last word on this spec before `ship` was a pass that ran no enumerated
criterion, which is the cheapest available explanation for `S-12`, `S-31` and `S-42` never
being brought to bear.

Keep the requirement minimal — the map must be **present**, not complete — so that a diff pass
carrying an earlier round's answers forward still passes.

## P4 — the ledger records which model judged

**File:** `scripts/refine-loop.mjs`, `runAgent` / the `record.judge` write.

Change: take `model` from the SDK `init` event and store it on the round's `judge` record;
print a line when it differs from the configured `judgeModel`.

**Evidence.** `.claude/ai-workflow.config.json` sets `"judgeModel": "opus"` and the loop passes
`RC.judgeModel ?? 'opus'`. The `init` events in
`.workflow/refine/requests-03.probe.2026-09-03T13-53-50-451Z/1/spec-refiner.log` and `/2/…`
both read `"model":"claude-sonnet-5"`; the same loop's retry attempt and every round of the
earlier loop read `"claude-opus-5"`. The ledger records neither, so the two passes that judged
this spec last — one full, one diff — are indistinguishable in the record from opus passes, and
the substitution is findable only by grepping a raw JSONL log. A calibration made from those
ledgers is a calibration of the wrong judge.

This is not a criterion and changes no judgement; it makes the record say what was paid for.

---

# What I considered and rejected

**A T0 join from the permission matrix to the Routes table's Guards column.** The most
tempting proposal, and it does not survive the strictness rule. `scripts/spec-lint.mjs` already
parses both sides — `matrix` (label + granted roles, `:352`) and `route.guards` (`:331`) — and
**consumes neither**; both are returned from `parseContracts` and read by no check. The
author's own comment at `:330` says why: the matrix is written in neither the dashed nor the
PascalCase spelling of a capability. Its rows are sentences ("Raise a request, to a colleague
or to a client contact"), so a name join fires on every route and finds nothing. Making it work
means requiring the matrix to name capabilities — a format change to the `spec` skill and a
re-write of every existing matrix — for a check that still could not see F2, because the link
"the contact picker is filled from *this* route" is prose in the Screens section and appears in
no table. The link is not written down; the check is not proposed. (It is worth knowing the
parse is dead code: a future format decision has half its lint already written.)

**A T0 check that every event a requirement names has a route row** — would have caught F1 via
`REQ-03-035`'s `reassigned` and `cancelled`. Rejected: the mapping from an event word to a
route is nowhere in the bundle, so the check would be a hardcoded verb table in a script, stale
on the first spec that names a different verb.

**A T0 check that every observation in a case's Expected Result has a selector or an asserted
status** — would have exposed `TC-03-E2E-02`'s "renders no screen behind it" (F4). Rejected:
matching prose observations to selectors is model work, not a join. T0's charter is joins and
regexes, and a fuzzy version of this would report a finding on most cases in the repository.

**A `static_gate` grep for `browser.newContext()` without a `baseURL` in `e2e/`** (F3). It is
genuinely decidable — nine call sites in the tree, three of them cited by the reviewer as doing
it right. Rejected on the gate's own charter: static-gate exists for "changes it might not
notice in a large diff that would let a bad run *pass*", and this one both blocked the review
correctly and would have failed loudly the moment QA ran the file. It costs a review round, not
a merge.

**A `CR-*` row for a load-bearing premise no case asserts** (N22 — the contracts ship on
`member` holding neither contacts capability, and no case calls a contacts route as a `member`).
Rejected: coverage is deliberately note-only in both registers (`S-44`, and the reviewer's
sweep 5 which reported `missing: []`), because a blocking coverage criterion fires on every
spec and QA judges coverage against code that runs. The premise is true — the pre-implementer
verified it at the file — and the gap is a missing case, not a wrong one.

**Promoting N10 to `CR-20`** (the invited contact's address reaches the application log, against
a Security section saying it is visible "nowhere else"). Rejected: the identical line already
ships in `invitations.service.ts`, so the change introduces no new class, and `CR-20`'s
enumeration — secret, token, live URL, typed value, foreign key — does not plainly name a
correspondent's own address. Left where the reviewer left it.

**A mechanical promoter in `scripts/wf.mjs` for a note whose claim quotes a register criterion**
(N21). Rejected: `wf.mjs` demotes because a blocker naming no criterion is unanchored, and the
asymmetry is deliberate. A promoter would turn every note that mentions a rule into a halt, and
the severity rule — "a blocker is a defect with a consequence" — is a judgement that belongs to
the judge. N21 should have blocked under `CR-32`; that is a fact about the pass, not about the
register.

**A new sweep in `.claude/agents/pre-implementer.md`** — "for every new value or row kind this
change makes reachable, list every shipping path that reads or writes such a row, and the rule
that governs it". This is F1 and N7's defect at the right gate: T1 read the code and its own
report names `reassignRequest:756` and `transition:534` under `REQ-03-035`'s call sites, so it
had both sites in hand and asked neither question. Rejected in favour of P2 for two reasons:
the same defect at T2 is caught before a run is paid for, and the register is closed and
enumerable where a prompt sweep is neither — the existing call-sites bullet already produced
the list and the list alone changed nothing. If P2 is adopted and a later run shows T1 is
where this class actually surfaces, the bullet is the cheap follow-up.

**A `CR-*` row for F1.** Rejected: `CR-32` already carries it, the reviewer named it, and the
finding routed to `code` with a `suggestedFix` that correctly refuses to settle the spec
question. The review register needs nothing.

**Editing spec 01 to say what reassign does with a client addressee, or adding the requirement
to spec 03.** Both out of bounds: specs are frozen and older ones are never edited to stay
current, and adding a requirement to 03 is the separate decision this audit was told not to
make. P2 is what makes the next spec of this shape state the rule itself.

**More refine rounds, or a bigger fuse.** Not evidenced. Two of the three loops on this spec
ended in `529 Overloaded`, not in exhausted rounds, and the round that mattered returned a
clean pass in a few minutes.
