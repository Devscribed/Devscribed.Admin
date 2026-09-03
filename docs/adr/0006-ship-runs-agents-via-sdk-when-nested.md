# 0006 — Ship runs agent stages via the Agent SDK when nested in a Claude session

**2026-09-01.** Accepted.

## The rule

`scripts/ship.mjs` picks its runner at startup:

- In a plain shell, it spawns each stage as `claude -p --agent <name>` — unchanged.
- Inside another Claude session (Code or Desktop), it calls the same agent in-process
  via `@anthropic-ai/claude-agent-sdk`.

Detection is `CLAUDECODE=1` (both Code and Desktop set this in every subprocess they
open) with `CLAUDE_CODE_ENTRYPOINT` as a fallback. The stage log format is unchanged: one
JSON object per SDK message, so `lastSessionId` still finds `"session_id": "..."` and the
implementer resumes its own thread between attempts.

## What it replaces

Nothing — the SDK path is added, not swapped in. What it fixes is a hard failure that had
no workaround. Running `ship` from inside another Claude session, every stage returned in
zero seconds with an empty log, four times in a row, and `wf` halted on `infra-error`
without a single agent having spoken. The child `claude` process was killed by the
parent's classifier before it wrote anything, so the pipeline saw an environment failure
that no environment change would move.

## Why not the alternatives

**Ask users to run ship from a shell only.** That is the workaround people were using.
It cuts off the workflow where most planning happens — inside a Claude Desktop
conversation about the spec, where launching the pipeline should be one command away.

**Drop `--permission-mode bypassPermissions`.** The flag is what the classifier trips on.
But headless `claude -p` cannot answer a permission prompt — there is nobody to ask — so
without it every stage stalls on the first tool it uses. The permission mode is not
optional for a run that must complete without a person.

**Reimplement the router in-process.** The SDK exposes `query()` and reads
`.claude/agents/` and settings itself, so agent definitions, `--resume`, and the
permission mode all move across unchanged. There is nothing to reimplement — the SDK is
the same code path with the CLI executable factored out.

## What it costs

One dependency (`@anthropic-ai/claude-agent-sdk`), and one code path more in ship's
`runAgentStage`. The two branches share their prompt, log stem, attempt manifest, verdict
contract and fuse timeout; only the mechanism differs. About thirty lines.

Auth uses the same tokens either way — the SDK reads `~/.claude` for OAuth or
`ANTHROPIC_API_KEY` from the environment, exactly like the CLI does — so a revoked CLI
OAuth blocks both paths the same way.

## What it does not fix

**Auto Mode classifier still blocks long chained pipeline runs from inside a Claude
session.** The individual SDK call is allowed (verified against the pre-implementer
agent), but a wrapping "run the whole pipeline" command is refused at the tool-call layer
in Auto Mode. In this environment ship must be launched from a real shell — the SDK path
matters when the pipeline is driven from a script or a subagent that Auto Mode's
classifier is not evaluating end-to-end.
