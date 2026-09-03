# 0006 — The spec stage proves the verification route

**2026-09-01.** Accepted.

## The rule

A spec is not finished when it lists `TC-*` ids. Before those cases are written, the spec stage
walks the route by which the feature will be verified, with its own hands:

- the pair comes up on the run's own ports (`E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1`) and the
  E2E database, and the surface the feature hangs off answers;
- every state a case will need has a named route to it — a helper in `e2e/tests/helpers.ts`, the
  product endpoint that gets there, or a fixture under `apps/api/src/test-support/` that the spec
  then owes as a task;
- every acceptance criterion has an observer, and the observer is run once;
- every credential, account or tool the checking needs is obtained from the user at spec time,
  used once against the live system, and left where the next agent finds it: the value in
  untracked `apps/api/.env` or in the agent's MCP configuration, the name and its explanation in
  `apps/api/.env.example` or `.mcp.json`, the pointer in the spec. No spec carries a secret's
  value;
- a throwaway Playwright probe rehearses the arrival and is deleted, leaving its command and its
  result in the spec.

What could not be proven is written as unproven and carries a Known Gaps row. The result lives in
the spec's `## Verification Plan` section, which `qa` then follows as its rig and `pre-implementer`
mines for tasks.

**The spec stage may repair the environment and change the harness.** Bringing up containers,
migrating the E2E database, adding a helper or a fixture route, adding an environment value,
configuring an MCP server. It writes no product code.

## What it replaces

Specs were written entirely from reading. The stage that first met a running server was `qa`, at
the far end of the pipeline — which is where it was discovered that a precondition had no route to
it, that a screen was never reachable, that an event could only be seen in a console nobody held a
token for.

`qa` is the worst possible place to discover any of that. By its own definition it may not repair
the environment, may not edit a test, and may not write code; its only lever is a `spec` finding
that halts the run for a person, after the implementation has already been written against cases
that could not be checked. The spec stage has a person in the loop already, owns the
`AskUserQuestion` fork, and has written nothing a failed probe would waste.

## What it costs

**A spec run now boots servers.** It is minutes, and it is spent whether or not the probe finds
anything, on every spec including the ones that would have been fine.

**Two policies on one environment, deliberately.** `qa` may not stop a container, free a port or
reset a schema; the spec stage may do all three. The asymmetry is the point — a repair during
verification hides the defect that made it necessary, while a repair during specification is the
deliverable. Both prompts name the difference so neither reads as an oversight.

**A required section that can be filled in badly.** "QA can start the pair" is a sentence anyone
can write without running anything, and it satisfies a heading. The checklist asks for what ran and
what came back for exactly that reason, and a row nobody ran is required to say `not run`.

## Why not the alternatives

**Have the spec describe the route without running it.** That is what a spec already implicitly
did, and it is the failure this record exists to end: a route nobody walked reads identically to
one that works, right up until QA.

**Give `qa` the latitude to repair instead.** It is the same work moved to the point where it is
most expensive and least visible — the implementation is written, the attempt budget is spent, and
a green run after a repair says nothing about whether the rig was ever right.

**Put the verification rehearsal in `pre-implementer`.** Closer, and it does read the spec and the
code. But it plans one already-written spec: by then the cases exist and a state with no route is
a rewrite, not a fork. It gets the sweep instead — a route the plan marks as missing becomes a
task.
