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

## Correctness patterns

- [ ] Every path reachable twice is idempotent, with the mechanism named and a concurrency test.
- [ ] Nothing that matters depends on a scheduler running; the lazy path is stated as authoritative.
- [ ] A failure in a derived artifact cannot lose the irreplaceable one.
- [ ] Every state transition writes its audit record in the same transaction.
- [ ] Values written exactly once are identified as such.
- [ ] Concurrent access to the same row states its locking strategy.
- [ ] Partial failure rolls back — nothing is half-applied and no status claims something that did
      not happen.

## Security

- [ ] Every new endpoint states its authentication and capability.
- [ ] Public surfaces state their rate limit.
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
- [ ] Every error message in the spec appears in the Error Messages table.
- [ ] No message text is duplicated between the business spec and a `.design.md`.
- [ ] Rules shared with other specs live in the area README, not copied.
- [ ] The area README index, dependency graph, and cross-spec side effects are updated.
- [ ] Cross-references to other specs use their number and are accurate.
- [ ] File paths cited from the codebase actually exist.

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
