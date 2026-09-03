# Pre-presentation checklist

Run this before showing a spec to anyone. A "no" is a defect, not a style preference.

**Run `npm run spec:lint -- <spec>` first.** It decides, mechanically and for free, everything on
this page that is a join or a pattern: every requirement in EARS with one outcome and a stable id,
every requirement covered by a case, every acceptance criterion naming an observer that exists,
every status and message a case asserts declared by the contract, every `data-testid` in both
places, every decision table complete over its declared domains, no rule carried by reference to
another document, no count in prose about a table, no line number into code, no path that does not
exist. A clean lint is the precondition for reading this list, not a substitute for it.

What is left below is judgement — the part no script reaches.

## Who each item is for

Every item carries one of three marks, and the mark is what decides who reads it.

| Mark | Who reads it | What a "no" is worth |
|---|---|---|
| **(blocks)** | the author, and `spec-refiner` | A blocker, under one of the rules in `blockingRules`. Delivery stops until it is repaired. |
| **(note)** | the author, and `spec-refiner` | A note. The gap is real and the reviewer and QA meet it again against code that exists; a document counting itself is answered with new text that the next pass then has to judge. |
| **(author)** | the author alone | Craft. It makes the spec better and no judge files a finding about it — either because a script already decided it, because it lives in a document the judge may not file against, or because the only repair is a route, a lock or a case that the fixer is forbidden to add. |

**`spec-refiner` is given the `(blocks)` items and nothing else.** A rubric of ninety items handed
to a judge that can file under seven rules drains everything it cannot place into
`spec/missing-artefact`, and a spec grows a section per round. The rest of this page is the
author's, before anybody is dispatched.

## Coverage

- [ ] **(note)** Edge cases are a numbered table with exact behaviour per row, not prose —
      `## Edge Cases` in the contracts file.
- [ ] **(note)** The bundle points at the area `README.md` for blast radius and backward
      compatibility. Those two live there and are **not** repeated per spec; the pointer is the
      coverage.
- [ ] **(author)** In the area `README.md`: blast radius names things **outside** this feature —
      shared code that stops compiling, the first unauthenticated route, a nav array, a module
      that becomes unreadable — and every row has a mitigation.
- [ ] **(author)** In the area `README.md`: backward compatibility names the *mechanism* for each
      guarantee (version pinning, snapshot, write-once artifact, additive migration), not an
      intention.
- [ ] **(blocks)** Acceptance criteria are observable and do not restate the functional
      requirements.
- [ ] **(note)** Test cases exist at all three levels, and every edge case has one.
- [ ] **(note)** Known Gaps exists, and each row says why it is acceptable now and what closes it.
- [ ] **(note)** Out of Scope lists what a reader would reasonably expect and will not get.

## Verification

- [ ] **(author)** The pair was brought up on the run's own ports, and the surface this feature
      hangs off answered.
- [ ] **(blocks)** Every state a test case names has a route, and the route either exists today or
      is a task this spec owes.
- [ ] **(author)** Every acceptance criterion names its observer.
- [ ] **(author)** Every credential, account or tool the checking needs was obtained, used once
      against the live system, and left where the next agent finds it.
- [ ] **(note)** No secret value appears in the spec or in any tracked file.
- [ ] **(author)** The rehearsal probe was run and deleted; the spec keeps the command and the
      result.
- [ ] **(note)** Anything that could not be proven says so, and has a Known Gaps row.

## Correctness patterns

- [ ] **(author)** Every path reachable twice is idempotent, with the mechanism named and a
      concurrency test.
- [ ] **(author)** Nothing that matters depends on a scheduler running; the lazy path is stated as
      authoritative.
- [ ] **(author)** A failure in a derived artifact cannot lose the irreplaceable one.
- [ ] **(author)** Every state transition writes its audit record in the same transaction.
- [ ] **(author)** Values written exactly once are identified as such.
- [ ] **(author)** Every writer of a row is enumerated. Where two of them race in ordinary use,
      the lock and what is re-read inside the transaction are stated, and guards are evaluated on
      that read; where they do not, one line says so and why, and no lock or concurrency case is
      added for it.
- [ ] **(blocks)** Every unconditional invariant was checked against the call sites it already
      governs; violators are fixed, carved out, or named out of scope.
- [ ] **(author)** Every "on any read" / "for every X" rule enumerates the call sites it covers.
- [ ] **(author)** A scope key is a required argument with no default.
- [ ] **(author)** Every outbound call states whether it is idempotent, and a non-idempotent one
      states what runs between retry attempts.
- [ ] **(author)** Partial failure rolls back — nothing is half-applied and no status claims
      something that did not happen.

## Security

- [ ] **(author)** Every new endpoint states its authentication and capability.
- [ ] **(author)** Public surfaces state their rate limit, the identity it is keyed on, and why
      that identity cannot be forged by the caller behind a proxy.
- [ ] **(author)** Unknown and unauthorized responses are identical, with no timing signal.
- [ ] **(author)** Author-controlled markup is sanitized on write and rendered sandboxed.
- [ ] **(author)** Every substituted value is escaped.
- [ ] **(author)** PII is named as PII, gated by capability, masked for callers without it, and
      excluded from logs and audit metadata.
- [ ] **(blocks)** Org scoping is specified and returns 404, not 403, matching `OrgScopeGuard`.

## Data

- [ ] **(blocks)** The migration is additive — no renames, drops, or new `NOT NULL` on existing
      tables.
- [ ] **(note)** Deploy-order independence is stated explicitly.
- [ ] **(note)** Delete behaviour is specified on every foreign key.
- [ ] **(note)** Enums, uniqueness constraints, and meaningful indexes are listed.
- [ ] **(note)** Existing free-form or legacy column values are handled rather than silently
      redefined.

## Consistency

- [ ] **(author)** Frontmatter is complete: `id`, `title`, `routes`, `api`, `entities`, `tags`,
      `depends-on`.
- [ ] **(author)** Every `data-testid` in the selectors section appears in an E2E case, and vice
      versa.
- [ ] **(author)** Every error message in the spec appears in the Error Messages table, and every
      row of that table names its `packages/validation` export and the route that emits it.
- [ ] **(note)** Every "asserted absent" has a presence twin — the same selector or field asserted
      present where the rule says it should be.
- [ ] **(note)** Every `##` section has at least one test case, or an explicit note saying it has
      none and why. Verification Plan is the standing exception — it is the rig those cases run
      on, not a behaviour to test.
- [ ] **(blocks)** The Verification Plan records routes, states and observers — never a port, a
      database name or a connection string. The harness chooses those, and a spec that pins one
      sends the next run at a server this repository does not publish.
- [ ] **(note)** E2E cases that mutate process-wide state are marked serial.
- [ ] **(blocks)** Every premise about the pipeline or infrastructure is cited by file path, not
      restated from CLAUDE.md.
- [ ] **(note)** No message text is duplicated between the business spec and a `.design.md`.
- [ ] **(note)** Every control the screens need that `@ds` does not export has a row in a
      `## DS gaps` table, naming what the screen does instead and what closes it. A spec that
      states the obligation and carries no table has not met it.
- [ ] **(blocks)** Every behaviour this spec changes from what an older document describes is
      stated here in full — who may call it, what comes back, which status, which message — so a
      reader never opens the older document. The older document is not edited and carries no
      marker.
- [ ] **(blocks)** The Summary opens with the request and closes with every addition beyond it — a
      route the request never named, a migration, a changed contract of a shipping route — each
      with its reason. An addition the Summary does not name is out of scope.
- [ ] **(blocks)** A test case amended for a new contract is amended on its Expected Result as well
      as its Steps.
- [ ] **(author)** Rules shared with other specs live in the area README, not copied.
- [ ] **(author)** The area README index, dependency graph, and cross-spec side effects are
      updated.
- [ ] **(author)** Cross-references to other specs use their number and are accurate.
- [ ] **(author)** File paths cited from the codebase actually exist.

## External systems, when present

- [ ] **(blocks)** Every claim about the external system says how it was established and what it
      ran against.
- [ ] **(note)** Every observation names the state the probe was in.
- [ ] **(blocks)** No requirement rests on a row marked `Assumed`.
- [ ] **(note)** Every boundary value names its unit and vocabulary on both sides, and what
      detects a mismatch.
- [ ] **(author)** Unrecognized values from outside stall and are logged; nothing defaults at the
      boundary.
- [ ] **(author)** Permanent refusals are separated from outages, and compensation is scoped to
      what could actually have been written.
- [ ] **(note)** The behaviours the double must reproduce are listed, including the ones that make
      tests fail.
- [ ] **(author)** Every allow-list entry carries the reason it is there, and a test fails on any
      refused resource.

## Infrastructure, when present

- [ ] **(author)** Two environments, one root module, separate state files, no workspaces.
- [ ] **(author)** A table of every input that differs between environments, framed as a contract.
- [ ] **(author)** Behaviour-affecting values are identical across environments.
- [ ] **(author)** No secrets in `.tfvars`; Terraform never reads a secret value.
- [ ] **(author)** `apply-prod` is manual and approval-gated; OIDC, no static keys.
- [ ] **(author)** What the dev environment is *for* is stated, and tests stay hermetic.
- [ ] **(author)** Lead-time items are called out as lead time.
- [ ] **(author)** Any pattern borrowed from a sibling repository was judged, not copied.

## Prose

- [ ] **(author)** Every non-obvious decision carries its reason in the same breath.
- [ ] **(blocks)** No "TBD", no "we'll decide later", no requirement without stated behaviour.
- [ ] **(blocks)** The scope actually asked for is delivered in full; anything blocked is named as
      blocked.
- [ ] **(author)** Written in English, matching the register of the existing specs.
