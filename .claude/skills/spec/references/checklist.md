# Pre-presentation checklist

Run this before showing a spec to anyone. A "no" is a defect, not a style preference.

## Coverage

- [ ] Edge cases are a numbered table with exact behaviour per row, not prose.
- [ ] Blast radius names things **outside** this feature — shared code that stops compiling, the
      first unauthenticated route, a nav array, a module that becomes unreadable.
- [ ] Every blast-radius row has a mitigation.
- [ ] Backward compatibility names the *mechanism* for each guarantee (version pinning, snapshot,
      write-once artifact, additive migration), not an intention.
- [ ] Acceptance criteria are observable and do not restate the functional requirements.
- [ ] Test cases exist at all three levels, and every edge case has one.
- [ ] Known Gaps exists, and each row says why it is acceptable now and what closes it.
- [ ] Out of Scope lists what a reader would reasonably expect and will not get.

## Verification

- [ ] The pair was brought up on the run's own ports, and the surface this feature hangs off
      answered.
- [ ] Every state a test case names has a route, and the route either exists today or is a task
      this spec owes.
- [ ] Every acceptance criterion names its observer.
- [ ] Every credential, account or tool the checking needs was obtained, used once against the live
      system, and left where the next agent finds it.
- [ ] No secret value appears in the spec or in any tracked file.
- [ ] The rehearsal probe was run and deleted; the spec keeps the command and the result.
- [ ] Anything that could not be proven says so, and has a Known Gaps row.

## Correctness patterns

- [ ] Every path reachable twice is idempotent, with the mechanism named and a concurrency test.
- [ ] Nothing that matters depends on a scheduler running; the lazy path is stated as authoritative.
- [ ] A failure in a derived artifact cannot lose the irreplaceable one.
- [ ] Every state transition writes its audit record in the same transaction.
- [ ] Values written exactly once are identified as such.
- [ ] Every writer of a row is enumerated, with its lock and with what it re-reads inside the
      transaction. Guards are evaluated on the in-transaction read, never on a copy loaded before
      it.
- [ ] Every unconditional invariant was checked against the call sites it already governs;
      violators are fixed, carved out, or named out of scope.
- [ ] Every "on any read" / "for every X" rule enumerates the call sites it covers.
- [ ] A scope key is a required argument with no default.
- [ ] Every outbound call states whether it is idempotent, and a non-idempotent one states what
      runs between retry attempts.
- [ ] Partial failure rolls back — nothing is half-applied and no status claims something that did
      not happen.

## Security

- [ ] Every new endpoint states its authentication and capability.
- [ ] Public surfaces state their rate limit, the identity it is keyed on, and why that identity
      cannot be forged by the caller behind a proxy.
- [ ] Unknown and unauthorized responses are identical, with no timing signal.
- [ ] Author-controlled markup is sanitized on write and rendered sandboxed.
- [ ] Every substituted value is escaped.
- [ ] PII is named as PII, gated by capability, masked for callers without it, and excluded from
      logs and audit metadata.
- [ ] Org scoping is specified and returns 404, not 403, matching `OrgScopeGuard`.

## Data

- [ ] The migration is additive — no renames, drops, or new `NOT NULL` on existing tables.
- [ ] Deploy-order independence is stated explicitly.
- [ ] Delete behaviour is specified on every foreign key.
- [ ] Enums, uniqueness constraints, and meaningful indexes are listed.
- [ ] Existing free-form or legacy column values are handled rather than silently redefined.

## Consistency

- [ ] Frontmatter is complete: `id`, `title`, `routes`, `api`, `entities`, `tags`, `depends-on`.
- [ ] Every `data-testid` in the selectors section appears in an E2E case, and vice versa.
- [ ] Every error message in the spec appears in the Error Messages table, and every row of that
      table names its `packages/validation` export and the route that emits it.
- [ ] Every "asserted absent" has a presence twin — the same selector or field asserted present
      where the rule says it should be.
- [ ] Every `##` section has at least one test case, or an explicit note saying it has none and
      why. Verification Plan is the standing exception — it is the rig those cases run on, not a
      behaviour to test.
- [ ] E2E cases that mutate process-wide state are marked serial.
- [ ] Every premise about the pipeline or infrastructure is cited by file path, not restated from
      CLAUDE.md.
- [ ] No message text is duplicated between the business spec and a `.design.md`.
- [ ] Every control the screens need that `@ds` does not export has a row in a `## DS gaps`
      table, naming what the screen does instead and what closes it. A spec that states the
      obligation and carries no table has not met it.
- [ ] Every statement this spec overrules in another document is amended **in that document**,
      marked beside the statement, naming the requirement that overrules it. A banner at the top
      saying some statements below are superseded is a promise, not an amendment — and one that
      names line offsets is stale on the next edit.
- [ ] A test case amended for a new contract is amended on its Expected Result as well as its
      Steps.
- [ ] Rules shared with other specs live in the area README, not copied.
- [ ] The area README index, dependency graph, and cross-spec side effects are updated.
- [ ] Cross-references to other specs use their number and are accurate.
- [ ] File paths cited from the codebase actually exist.

## External systems, when present

- [ ] Every claim about the external system says how it was established and what it ran against.
- [ ] Every observation names the state the probe was in.
- [ ] No requirement rests on a row marked `Assumed`.
- [ ] Every boundary value names its unit and vocabulary on both sides, and what detects a
      mismatch.
- [ ] Unrecognized values from outside stall and are logged; nothing defaults at the boundary.
- [ ] Permanent refusals are separated from outages, and compensation is scoped to what could
      actually have been written.
- [ ] The behaviours the double must reproduce are listed, including the ones that make tests fail.
- [ ] Every allow-list entry carries the reason it is there, and a test fails on any refused
      resource.

## Infrastructure, when present

- [ ] Two environments, one root module, separate state files, no workspaces.
- [ ] A table of every input that differs between environments, framed as a contract.
- [ ] Behaviour-affecting values are identical across environments.
- [ ] No secrets in `.tfvars`; Terraform never reads a secret value.
- [ ] `apply-prod` is manual and approval-gated; OIDC, no static keys.
- [ ] What the dev environment is *for* is stated, and tests stay hermetic.
- [ ] Lead-time items are called out as lead time.
- [ ] Any pattern borrowed from a sibling repository was judged, not copied.

## Prose

- [ ] Every non-obvious decision carries its reason in the same breath.
- [ ] No "TBD", no "we'll decide later", no requirement without stated behaviour.
- [ ] The scope actually asked for is delivered in full; anything blocked is named as blocked.
- [ ] Written in English, matching the register of the existing specs.
