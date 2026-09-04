---
name: spec
description: Write a functional specification for this repository — a three-file bundle in specs/<area>/ (NN-name.md for EARS rules with stable ids, NN-name.contracts.md for routes, messages and testids, NN-name.cases.md for the verification plan and test cases) covering behaviour, API contracts, edge cases, blast radius, backward compatibility, acceptance criteria, and unit/integration/E2E test cases. Use when asked to spec a feature, write a specification, design a new area, or extend an existing spec. Also use before implementing anything non-trivial that has no spec yet.
---

# Writing specifications

This repository is spec-driven: `specs/<area>/NN-name.md` is authoritative and code is written to
match it. A spec is not a description of what you plan to build — it is the contract the
implementation and its tests are checked against.

## The coverage contract

Every spec covers all six. None is optional, and none is satisfied by a sentence.

**Two of them are covered in the area `README.md`, not in the bundle**, because they are properties
of the area rather than of one document: an area has one blast radius and one compatibility story,
and restating them per spec is a second copy that goes stale. A spec says where they are — the
shipped ones say *"Blast radius and backward compatibility for this spec are in README.md"* — and
that sentence is the coverage. A judge asking for a `## Blast Radius` heading inside the bundle is
asking for the copy, and the answer is the pointer, not a new section.

| | What it means | Where it lives |
|---|---|---|
| **Edge cases** | A numbered table of specific situations and the exact behaviour for each. Not a paragraph of caveats. | `## Edge Cases`, in the contracts file |
| **Blast radius** | What breaks *outside* this feature, with a mitigation per row. Listing what you add is not blast radius. | `## Blast Radius`, in the area `README.md` |
| **Backward compatibility** | What guarantees existing data, routes, and deployments keep working, and what mechanism enforces each guarantee. | `## Backward Compatibility`, in the area `README.md` |
| **Acceptance criteria** | Observable, checkable statements. Not a restatement of the functional requirements. | `## Acceptance Criteria`, in `NN-name.md` |
| **Automated tests to E2E** | Numbered `TC-NN-UNIT-NN`, `TC-NN-INT-NN`, `TC-NN-E2E-NN` with preconditions, steps, expected results, and — for E2E — the `data-testid` selectors. | `## Test Cases`, in the cases file |
| **A proven verification route** | The rig an agent verifies this on, walked by you: how it comes up, what reaches each state a case needs, what observes each criterion, and what access that took. Recorded as what ran and what came back. | `## Verification Plan`, in the cases file |

## Workflow

### 1. Reconnaissance before writing

Never write a spec from the prompt alone. Read the code first and produce two explicit lists:

- **What already exists to build on** — with file paths. A spec that reinvents
  `apps/api/src/auth/reset-token.ts` when the pattern is already there is a bad spec.
- **What must be built from zero** — the honest list. This is usually where the real cost is, and
  it belongs in the spec, not in a surprise three weeks later.

Also read two or three existing specs in `specs/` first. Match their structure, their register, and
their level of detail.

When the spec depends on a system this repository does not own, reconnaissance includes that system
too: probe it, in the state the product will meet it in, and record what came back. Documentation
and a plausible reading of an API are not observations. What you cannot probe is written down as
unproven rather than as fact.

### 2. Resolve the forks with the user

Identify the two to four genuine architectural forks — the ones where different answers produce
materially different specs. Ask them with `AskUserQuestion`, each option carrying its real
trade-off, and put your recommendation first with the reason.

Do not ask about things a careful colleague would just decide. Do not guess on things that change
the whole shape.

If the user's framing rests on a wrong premise, say so in a sentence and then answer what they
actually asked. (Example from this repository: a third-party e-signature vendor gives no stronger
legal standing than an in-house engine for contracts in Belarus, because a qualified signature
there requires a ГосСУОК certificate that no SaaS vendor issues. Worth one sentence; not worth
blocking on.)

### 3. Prove the verification route

A spec leaves the task ready to be executed **and verified** by an agent. Everything below is done
with your own hands, before the test cases are written, because this is the only stage where a
verification route that does not exist costs nothing to discover.

**Every acceptance criterion names its observer, and the observer is proven before the criterion is
written.** A criterion nothing can observe is a defect, and QA is the agent least able to fix it.

**The spec run holds its own ports** — `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1`, and the E2E
database. Never 3000/4000, never `devscribed_dev`. `e2e/playwright.config.ts` starts the pair
itself with a hermetic environment; hand-start a pair only to click through a screen.

**Reach the surface the feature hangs off.** Call the nearest existing endpoints and open the
nearest existing screen. Record the call and what came back, not that you intended to.

**Reach every state a case will need.** For each precondition — a role, an expired token, delivered
mail, a provider's answer — name the route to it: a helper in `e2e/tests/helpers.ts`, the product
endpoint that gets there, or a fixture under `apps/api/src/test-support/` that this spec must add
behind `assertFixturesOpen`. A state no route reaches is not a test case yet; it is a task this
spec owes.

**Rehearse with a throwaway probe.** One scratch Playwright spec that signs in, arrives at the
parent screen, and touches the ids the cases will name. Run it on the spec run's own ports, then
delete it. The spec keeps the command and the result, never the file.

**Obtain the access here; never leave QA to ask for it.** When checking the result needs a
third-party key, an analytics token, a bot or an MCP server, ask the user for it with
`AskUserQuestion`, use it once against the live system, and leave it where the next agent finds
it — the value in untracked `apps/api/.env` or in the agent's MCP configuration, the name and its
explanation in `apps/api/.env.example` or `.mcp.json`, the pointer in the spec.

**A spec never carries a secret's value.** Names and locations, never values, and nothing of the
sort in a tracked file.

**When the product is not what is observed** — an event in an analytics service, a message a bot
sends, a row in a third-party console — the observer is the query that reads it and the account
that may. Run it once. A criterion whose only observer is a person says so, and says what the
person does.

**Fix the ground rather than describing it.** This stage may bring the environment up and change
the harness: a helper, a fixture route, the Playwright environment, `.env.example`, MCP
configuration, setup docs. It writes no product code. `qa` may repair nothing, which is why the
repairing happens here.

**Whatever the rehearsal had to do to work is written into the spec**, not left in a shell history.

**What could not be proven is written as unproven**, and carries a Known Gaps row naming what would
close it.

Everything this step establishes goes into the spec's `## Verification Plan` section — see
`references/spec-template.md`.

### 4. Choose the shape

One spec per coherent surface. A spec is a **bundle of three files** sharing a base path:

```
specs/<area>/NN-name.md             behaviour  — EARS rules with stable REQ ids, decision tables
specs/<area>/NN-name.contracts.md   contracts  — routes, messages, data model, testids, screens
specs/<area>/NN-name.cases.md       cases      — the verification plan and the test cases
```

They are one document. The split is not tidiness: the three are checked by different means, and
keeping the tables out of the behaviour file is what lets a script decide most of what used to
need a judge. The behaviour file is budgeted at `120 + 7 × requirements` lines — over that, the
reasoning has grown around the rules.

Past roughly 900 lines of behaviour, split into numbered specs with an area `README.md` index —
see `specs/user-management/` and `specs/documents/`.

New area → create `specs/<area>/README.md` too, and add a "Related Areas" pointer from any area it
depends on.

### 5. Write

Follow `references/spec-template.md`. It gives the file split, the EARS patterns, the decision-table
directive, and the exact table headers the lint parses — keep those verbatim. Specs are written in
English, including in Russian-language conversations.

**The request is the budget.** The Summary opens with the request in one sentence and closes
with what the spec adds beyond it, one line per addition with its reason — a route the request
never named, a migration, a change to a route that already ships. An addition not listed there
is a scope finding for the refiner. Before adding one, ask whether the request works without
it: a curated list of six words does not need reordering, restoring or a lock to be the feature
that was asked for, and every route added is paid for by every caller and every later spec.

**Run the lint as you write, not at the end:**

```bash
npm run spec:lint -- specs/<area>/NN-name.md
```

It decides everything mechanical — a rule that matches no EARS pattern, a requirement stating two
outcomes, a decision table with an empty cell, a status a case expects that no contract declares, a
message asserted on a route its own row does not list, a testid in one place and not the other, a
requirement no case covers, a rule carried by reference to another spec, a count in prose about a
table, a line number into code, a path that does not exist.

**Every one of those repairs deletes or corrects text.** That is why they belong to a script: a
gate whose findings are answered with new prose makes work for the next pass.

### 6. Refine — one command, and a stranger judges what is left

```bash
npm run refine:loop -- specs/<area>/NN-name.md --request "<the request, in one line>"
```

The loop runs three gates — the lint, then `spec-reviewer`, and `pre-implement` **last and once**,
after the judge's verdict is clean — repairs what the blocking gate finds, commits the round, and
judges the next round against that commit. Read `.claude/skills/refine/SKILL.md` for how to read the outcome; the important part
is that **you do not drive the agents and do not decide whether a finding deserves another round.**

You do not check your own spec. You know which sentence you meant, so you read the sentence you
meant. The refiner reads what you did not and asks what this spec has just made false around it.

Present the spec when the loop passes, or when it stops and you have carried its remaining findings
to the person. A stop at `needs-a-person` is a fork the fixer refused to take for you — bring it,
with the trade-off, and let them choose.

## Principles

**Every decision carries its reason, in the same breath.** "Signing is strictly sequential" is
half a spec. "Signing is strictly sequential, so the second party receives a document already
signed by the first" is a spec. Where a decision is contested, put it in a decisions table in the
area README with the alternative and why it lost.

**Cite what you reuse.** Name the file. `apps/api/src/auth/session.guard.ts`, not "the existing
auth guard".

**Verify a premise against the file that implements it.** Deploy order, what a script does, what
the pipeline runs — read `infra/deploy.sh`, `.github/workflows/`, the Makefile, and cite the path.
CLAUDE.md, an earlier spec and a code comment are claims about the code, not the code. Where they
disagree with it, the spec says so and CLAUDE.md is amended in the same change.

**An absolute rule is checked against the code it already governs.** Before writing "never",
"always" or "every", find the call sites the rule forbids today. Each is fixed by this spec, carved
out in the rule's own sentence, or named in Out of Scope. An unqualified invariant the current code
violates is a contradiction you are shipping, not a standard you are setting.

**Put a port where a vendor might change.** Define the interface, ship one implementation, and add
the columns the future adapter needs (`ProviderKey`, `ProviderRef`) in the first migration. A port
that requires a migration to use is not a port.

**Migrations are additive.** New models, new nullable columns, new tables. No renames, no drops, no
new `NOT NULL` on an existing table. Then deploy order stops mattering and a code rollback needs no
database rollback — say this explicitly in the backward-compatibility section.

**Immutability is the backward-compatibility mechanism.** Pin versions, snapshot values, make
artifacts write-once. "Editing a template cannot alter a document already signed" is a guarantee
you can state and test; "we'll be careful" is not.

**Correctness must not depend on a scheduler.** Evaluate expiry, staleness, and eligibility lazily
on read, and let the cron job merely materialize what is already true. Then a failed schedule
degrades timeliness, never correctness. Say which one is the source of truth.

**A failure must not lose the irreplaceable thing.** If PDF rendering fails after both parties
signed, the envelope stays completed and the render retries — the signatures are the asset, the
PDF is derived. Identify the irreplaceable thing in your feature and protect it by name.

**Anything reachable twice must be idempotent.** Double-clicks, retries after timeout, queue
redeliveries, webhook replays. State the mechanism (a `UsedAt` set in the same transaction, a FIFO
group key) and write a concurrency test for it.

**A lock is specified where two writers race in ordinary use**, not on every row that has two
writers. A settings list one curator edits, a seed that runs once at creation: say in one line
that the writers do not race and why, instead of a `FOR UPDATE` and a concurrency case for each.
The mechanism costs a rule, an invariant, a case and every edge the next reader finds in them.

**Retry policy is stated per route, not per client.** For every outbound call say whether it is
idempotent, and for one that is not, what runs between attempts. A generic retry loop wrapped
around a create is the default failure.

**A scope key is required, never defaulted.** When a rule is "per organization", "per tenant",
"per signer", say that the key is a required argument on every method of the port and that there
is no fallback value. A default turns the rule into its opposite and no test sees it.

**A guard is evaluated on the row the transaction locked.** Say which writer takes the lock, what
is re-read inside the transaction, and that the decision is made against that read. A value loaded
before the transaction is already stale when it is tested.

**Do not leak through error responses.** Unknown and unauthorized must be byte-identical, with no
timing signal. Spell this out where a public surface exists.

**Sanitize on write, not on read.** Store the cleaned value so that what the author saved is what
renders, and there is exactly one sanitization path to get wrong.

**Name the limitation instead of hiding it.** Every spec ends with Known Gaps: the gap, why it is
acceptable for this release, and what closes it. A magic link can be forwarded — write that down.
Reviewers trust a spec that admits its edges.

**Out of Scope is a section, not a shrug.** List what a reader would reasonably expect and will not
get, so nobody discovers it during review.

**Error messages live in one table.** The business spec owns validation messages and behaviour; a
paired `.design.md` owns headings, placeholders, and micro-copy. Neither restates the other. Shared
rules go in the area README, not duplicated per spec.

**The `data-testid` list is a contract.** Every id in the selectors section appears in an E2E case,
and every selector an E2E case names appears in the list.

## Depending on a system you do not own

A third-party API, a browser policy, a rendering engine. Everything the spec says about it is a
claim, and the `## External Contracts` section is where each one is written down with its
evidence.

**An observation covers the states you saw and nothing else.** Never extend a verified list with a
plausible member. A value that belongs in the list but was not observed is written as unobserved,
in the same table, and carries no requirement.

**An observation taken in one state says nothing about the others.** Statuses read before anyone
acted are not statuses after. Name the state the probe was in.

**Record how each observation was established** — the call, the account or fixture, what came back.
An observation without its method cannot be re-run when it stops holding.

**Where an unverified premise carries the design, it gets its own Known Gaps row**, naming what
would falsify it and what falls with it.

**The double is specified against the external system, never against this spec.** For every
property the spec relies on, the double reproduces the real behaviour including the hostile half —
a refusal, an empty result, a word we do not use. A double built from the spec's own sentences
turns the suite into a second copy of the premise, and every test passes while nothing works. List
the behaviours the double must have.

**Every value crossing the boundary names its unit and its vocabulary on both sides**, and what
detects a mismatch. A number the other side stores and echoes without validating is a value nothing
checks for you.

**An unrecognized value from outside stalls; it never defaults.** Map what is known, log what is
not, and stop. A default at a boundary turns a state you cannot read into a state you claim to
know.

**A permanent refusal is not an outage.** Separate a request the other side refuses from one it
could not answer. A refusal names the field where the body identifies one, and compensation for a
partial write runs only where a partial write was possible.

**An allow-list names every entry with the reason it is there, and its test fails on any refused
resource** — not only on the ones enumerated when it was written.

## Infrastructure sections

When a spec introduces infrastructure:

- **Terraform, two environments (`dev`, `prod`)**, one root module composed per environment through
  `-backend-config` and `-var-file`. **No workspaces** — separate state files make a
  wrong-environment apply impossible to do silently.
- **A table of every input that differs between environments**, presented as a contract: anything
  differing beyond that table is a bug. Hold behaviour-affecting values (memory, timeouts,
  defaults) identical, so dev remains a test of prod.
- **No secrets in `.tfvars`.** Terraform creates the secret containers and the IAM policies; values
  are set out of band. Terraform never reads a secret, so no secret reaches the state file.
- **State backend on S3 with native locking**, versioned, bootstrapped once out of band as the only
  hand-created resource.
- **`apply-prod` is manual and approval-gated**; roles assumed via OIDC, no static keys.
- Say what dev is *for*. Tests stay hermetic on local drivers; the dev environment exists to
  exercise the real services and catch what only appears against them — IAM gaps, identity
  misconfiguration, cold starts, presigned-URL expiry.
- Note lead-time items (SES production access, domain verification) as lead time, not as deploy
  steps.

Reference a sibling repository's pattern only after judging it. `meetwave-serverless-lambda` has a
good module layout and commits plaintext API keys in its `.tfvars` — take the first, name the
second as something not to reproduce.

## Anti-patterns

- Writing the spec before reading the code.
- E2E cases written for a screen nobody reached.
- A precondition no route reaches — "an expired envelope exists", with nothing that makes one.
- Leaving QA to obtain access this stage could have obtained.
- A secret's value in a spec, in a test, or in any tracked file.
- Leaving the probe file behind, or keeping it as a test it was never designed to be.
- Recording the rehearsal as intent — "QA can start the pair" — instead of what ran and what came
  back.
- "TBD", "we'll figure this out later", or a requirement whose behaviour is not stated.
- Edge cases as prose instead of a numbered table with exact behaviour.
- A blast-radius section that lists only additions.
- Acceptance criteria that restate the functional requirements in different words.
- Test cases that only cover the happy path — every edge case worth listing is worth a test.
- Silently narrowing scope because part of it is hard. Deliver the whole spec and mark what is
  blocked.
- Inventing a mechanism that already exists three directories away.
- Copying an infrastructure pattern from another repository without judging it.
- Writing "Observed:" over a list whose last members were never seen.
- Describing what a test double should do by restating the spec instead of the system it stands in
  for.
- Restating a rule about the pipeline from CLAUDE.md without opening the script that implements it.

## Reference files

- `references/spec-template.md` — section order, frontmatter, and what belongs in each section.
- `references/checklist.md` — the standard to write to, the author's own. Not a self-check:
  step 6 hands it to somebody who has not read your spec.
- `.claude/skills/spec-review/references/admission-criteria.md` — the closed register the judge
  works from, and the only thing that may keep a spec out of development. Every `(blocks)` and
  `(note)` item of the checklist has a criterion there, alongside the repository conventions a
  spec may not overrule. Write to the checklist; expect to be judged on the register.
- `.claude/skills/spec-review/SKILL.md` — how a pass is split and what a judge may return a
  spec for.
