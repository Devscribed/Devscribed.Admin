# Devscribed.Admin (Teammerly)

Internal admin product. **Spec-driven**: `specs/` is authoritative and code is written to match it.
When behaviour and spec disagree, the spec wins — change the spec first, deliberately.

## Layout

```
apps/api/              NestJS 11 + Prisma + PostgreSQL
apps/web/              Next.js 15 App Router + React 19
packages/validation/   validation rules and error messages, shared by web and API
e2e/                   Playwright, one file per spec area
specs/                 the specs (see specs/*/README.md for each area index)
1_DS for dev/          Teammerly Meridian design system, imported as @ds
```

npm workspaces, Node 22, TypeScript everywhere.

## Commands

```bash
npm install            # from the root only; runs prisma generate via the API's postinstall
docker compose up -d   # Postgres 17 on port 5433, databases devscribed_dev and devscribed_test
npm run dev            # API on :4000, web on :3000
npm run test:unit      # Vitest, packages/validation
npm run test:int       # Jest + Supertest against devscribed_test (wiped each run)
npm run test:e2e       # Playwright; starts both dev servers itself

npm run spec   -- <what to spec>   # opens Claude Code on /spec
npm run refine -- <spec path>      # /refine — a stranger judges the spec, before a run is paid for
npm run bug    -- <what is broken> # /bug
npm run patch  -- <the rule that changes>  # /patch
npm run ship   -- <document path>  # /ship — the skill, which checks the branch and reads the outcome
npm run ship:run -- <document path># scripts/ship.mjs alone, no model either side
npm run config                     # what each track resolves to, and whether the config is valid
npm run pipeline                   # the pipeline's parts still agree with each other
npm run board                      # the board: specs → what was run against one → that run
npm run watch                      # the same, without opening anything
npm run specs                      # the same index, printed
```

Under yarn the `--` is unnecessary: `yarn spec projects and their members`. Install with npm
regardless — the lockfile is `package-lock.json`.

Full first-time setup is in [README.md](README.md). `apps/api/.env` is untracked — every fresh
clone needs `cp apps/api/.env.example apps/api/.env`.

## Architecture

The web app has **no API routes and no server actions**. Pages are `'use client'` and fetch
`/api/...` with `credentials: 'same-origin'`; `apps/web/next.config.mjs` rewrites that to the
NestJS origin. All data access goes through the API.

Prisma is one injected service (`apps/api/src/prisma.service.ts`) with the node-postgres adapter.
There is no repository layer — services call `this.prisma.*` directly.

## Conventions that matter

**Auth.** JWT in an httpOnly cookie. `SessionGuard` re-reads `Account.securityStamp` from the
database on every request, so rotating the stamp revokes every session instantly. `OrgScopeGuard`
returns **404, not 403**, when the path `orgId` does not match the session — and queries always
scope by `session.organizationId`, never by the path parameter.

**Validation.** Rules and message text live in `packages/validation` and are re-run server-side on
every request. The client's copy is a convenience, never a gate. Never write a user-facing
validation message inline.

**Submit buttons are never disabled for validation.** Clicking an invalid form shows every error
and focuses the first invalid field. Disabling is only for genuine in-flight guards and deliberate
confirmations.

**Design system.** Import from `@ds` (via the barrel `apps/web/src/ds.ts`). **No hardcoded colors
or sizes** — use tokens (`var(--sp-8)`, `var(--fs-14)`, `var(--text-muted)`). Anything missing goes
*into* the design system and is recorded in that spec's "DS gaps" table, never improvised per
screen. Light theme only this release.

**Testing.** Selectors are `data-testid` only, and the ids are named in the specs. Test cases are
numbered in the specs (`TC-01-E2E-03`) and the code references those ids. E2E reads sent mail from
`GET /api/test/mail/latest?email=` — the in-memory mail sink, fenced off in production.

**Which level a case belongs at.** Unit is free, one integration case costs about half a second,
one E2E case about eight. E2E earns its place only when the assertion is out of reach of an API
test: a multi-page journey through real mail, focus and blur, layering, CSS tokens, the session
cookie, a control that must not be drawn. A server rule — a status code, a message, a token
state, an authorization decision — belongs at integration even when a screen shows it. One
mechanism gets one E2E test, on the cheapest page that exercises it; retiring a case is recorded
in its spec as `- **Retired.**` naming what covers the rule now.

**Agents run tests targeted, never whole.** `npm run test:unit` runs in full — it is under a
second. `npm run test:int` and `npm run test:e2e` are for a person and for the deploy gate; an
agent runs the files its diff touches (`npm test -- test/<file>.spec.ts` from `apps/api`,
`E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/<file>.spec.ts
tests/regressions.spec.ts` from `e2e`). Jest here is 29, where the file filter is a positional
path: `--testPathPatterns` is the Jest 30 spelling and this version ignores it silently,
running everything while the log says otherwise.

**An agent's e2e run holds its own ports**, as above — 3000 and 4000 belong to whoever is
working, and the database follows the ports and is never `devscribed_dev`. Reusing a running
dev server is not the alternative: it is configured for development and its signing provider
is the real one. To look at a screen, start a pair on those ports rather than borrowing one.

**A busy port is not a stopped run.** Under `CI` the suite claims its own pair: it kills this
repository's dev servers that nobody has waited on for two hours, then steps both ports by 100
until a free pair answers, exports the choice so the servers and workers inherit it, and writes
it to `e2e/.last-ports.json`. So never free a port by killing what holds it, and never report a
suite unrunnable because a port was taken. `npm run reap:dry` says what the reaper would remove;
`E2E_REAP=0` turns it off.

**Navigation.** No dead links. A nav item that the current role cannot use is not rendered.

## Watch out for

- **`main` deploys itself, and does not test first.** `deploy.yml` is the pipeline: push to
  `main` deploys `dev` *when the push moved a file that ships* — a change to `.claude/`,
  `docs/`, `specs/`, `scripts/`, `e2e/` or any `*.md` is copied into no image and deploys
  nothing, and the run says so. A `v*` tag on `main` deploys `prod` unconditionally, and
  neither runs a test. The suite
  lives in `test.yml`, which triggers on `pull_request` only — so the pull request is the only
  gate, and a change that reaches `main` any other way is deployed untested. The deploy half is
  gated on the repository variable `DEPLOY_ENABLED`. The runbook —
  releasing, rolling back, and what to do when a deploy fails — is
  [docs/deployment.md](docs/deployment.md). Prod tags come from `npm run release`.
- **Role values are in transition.** The database holds `admin` / `member`; the specs target
  `admin | manager | user | viewer`. New authorization code must handle both — see the role-enum
  note in `specs/documents/README.md`.
- **`prisma generate` runs from `apps/api`**, which is where `postinstall` runs it. Running it
  from the repository root produces a client that cannot find `apps/api/.env`, and the app then
  starts and fails its first query with "client password must be a string".
- **Never write file content through a shell heredoc.** A backslash escape does not survive the
  trip: `'\n'` arrives as a real newline and the file no longer parses. Use the editor tool for
  file content; when a script must build a newline, `String.fromCharCode(10)`.
- **Probe a busy port by connecting, not by binding.** On Windows a server on `0.0.0.0` does not
  prevent a second bind to `127.0.0.1`, so a bind test reports every port free.
- Migrations should be **additive**. `infra/deploy.sh` runs `prisma migrate deploy` (through
  `infra/migrate.sh`, as a one-off task on the *new* image) and *then* `tf apply`s the services,
  so the schema changes while the **previous** code is still serving. Additive is what makes that
  window safe: the old code must keep working against the new schema. This is a rule, not an
  observation about the current migrations. The migration step is skipped entirely on a web-only
  deploy.
- If Prisma types look wrong in the editor, re-run `npm install` (or `prisma generate`) — the
  client is generated into `node_modules/.prisma`.

## Writing specs

Use the `spec` skill (`/spec`). Every spec covers edge cases, blast radius, backward compatibility,
acceptance criteria, test cases through E2E, and a verification route walked before those cases
were written. Specs are written in English.

**A spec is judged by somebody who did not write it.** `/spec` ends by dispatching the
`spec-reviewer` agent on a clean context — it is given the spec path and the request, and nothing
else — which asks three questions the author cannot ask of their own work: is every claim about
this repository still true, do two clear statements disagree, and what has this spec just made
false in the documents around it. `npm run refine -- <spec path>` runs the same judgement on any
spec at any time, which is what a spec that has sat while the code moved needs.

**A judge blocks only under a criterion somebody wrote down.** Both judges work from a closed
register — `.claude/skills/spec-review/references/admission-criteria.md` for the spec judge,
`.claude/skills/code-review/references/blocking-criteria.md` for the review — and every blocking
finding names an id from it. A blocker naming none, or one the register marks note-only, is
demoted to a note by the script that reads the verdict. Anything outside a register is still
reported, as a note, which is also how a criterion the register lacks gets proposed. Without
this the blocking surface is a different one every pass, and the loop repairs findings the pass
before never raised.

**Two statements that disagree block, even when you can tell which one is right.** Neither the
refiner nor the reviewer settles a contradiction by preferring one side; that decision is a
person's, and it is made in the document. A contradiction resolved silently upstream is
implemented, and then found by the gate that is forbidden to resolve it.

**A spec is frozen once it is written and refined. Older specs are never edited to stay
current.** They record what was decided then, and that record is worth more than a document
that pretends to have always known the answer.

**The newest spec that speaks about a behaviour governs it.** When a new spec changes something
an older one describes, it states the whole new rule **in its own text** — who may call it,
what comes back, which status, which message — completely enough that a reader of the new spec
never has to open the old one. It does not plant markers in the old document, and it does not
write "this overrules requirement 45 of spec 01": a cross-reference sends the reader away
instead of answering them, and it is bookkeeping that goes stale on the next edit and is then
found as a defect of its own.

A spec is judged on whether it is implementable and checkable **from itself alone**. That is
what `/refine` protects.

Investigate a defect with the `bug` skill (`/bug`). It writes `specs/bugs/BUG-NNN-slug.md` and
ends in one of three verdicts — the code is wrong, the spec is wrong, or the spec is silent —
which is what decides whether anything may be fixed yet.

**Three weights of document, and the weight is chosen by what changes, never by how much time
is left.** A spec bundle in `specs/<area>/` opens a design space and is admitted by `/refine`.
A bug report in `specs/bugs/` explains behaviour that disagrees with a document. A patch note
in `specs/patches/` — the `patch` skill (`/patch`) — closes exactly one rule that is changing:
a field moves, a control is disabled until another is chosen, an input gains a bound. The
patch's entry condition is closed and lives in that skill; a change that adds a route, touches
the schema, moves authorization, needs a third product file or a new design-system component
is a spec however small it looks. A patch supersedes what an older spec said the same way any
newer document does — by stating the whole new rule in its own text, and writing nothing back.

## Implementing specs

Use the `ship` skill (`/ship`) to run a spec through pre-implement → implement → static gate →
review → QA. `/ship bug <report>` and `/ship patch <note>` run the lighter tracks: no plan is
compiled, and for a patch the review runs its cheap shape. **Every track runs the static
gate and QA** — a lighter document buys speed against the stages that read intent, never
against the ones that check the result. Routing lives in `scripts/wf.mjs`, not in a prompt: every finding names where the
defect lives, only findings addressed to `code` are ever retried, and a finding the implementer
contests halts the run for a person instead of spending another attempt. The runbook is
[docs/ai-workflow.md](docs/ai-workflow.md).

The pipeline stops at a green branch. It never merges and never pushes — see the note about
`main` above.

**A run refuses to start on a spec nothing admitted.** `wf init` reads the spec's refine ledger:
a loop that is not a `pass`, or a bundle that changed after the round that judged it, stops the
run before any model is paid. `--accept-unrefined "<why>"` overrides it and the reason is
recorded in `run.json`.

**The pipeline is configuration, and it is checked before it runs.**
`.claude/ai-workflow.config.json` is keyed by track: `shipConfig.<track>` names the paths it
matches, the branch it uses and whether refine admits it, and `shipConfig.<track>.stages.<stage>`
writes out the agent, model, shard shape, budgets and timeouts in full. Nothing is inherited
between tracks — what you read under a track is what it runs. `scripts/ship-config.mjs` is the
only reader, and it validates: an unknown key, a renamed agent, a model that does not exist, a
missing stage, `static_gate` or `qa` switched off. `npm run config` prints what each track
resolves to; `ship`, every `wf` command and preflight run the same check first, so a bad edit
stops a run before a lock or a branch exists.

`npm run pipeline` answers the question after that one — the parts that name each other still
agree. An agent whose `name:` and filename disagree, a lead dispatching a `subagent_type`
nobody defines, a hook matcher that stopped matching, a contract an agent no longer reads, the
port ladder kept in two files, **and any setting the config accepts that no script reads** —
which is the one that costs most, because the printer reports it back and a person believes it
took effect.

**Which agent a stage runs is a shape, not a constant.** Every way a stage can run is written
out in full under its `shapes`, and the block's `use` names the one that runs. A flag names a
different one for a single run — `--shape` for refine, `--plan-shape`, `--implement-shape`,
`--review-shape` for ship. So one run goes parallel on
sonnet shards and the next goes synchronous on one opus agent, with no edit between them, and
every shape in force is written into the ledger or `run.json`. **No shape a new agent replaced
is withdrawn** — every method stays selectable, and
[.claude/agents/VARIANTS.md](.claude/agents/VARIANTS.md) maps every name that used to exist to
the one that carries it now. What is not kept is a second copy of a definition: two files
stating one rule is how the rules drifted.

**While a run is in flight, its branch carries the spec's work and nothing else.** The reviewer
diffs `baseRef...HEAD`, so anything else committed there is handed to it as part of the change
under review — a script, a research note, a fix to the board — and it is built to block on a
file no handoff task names and no requirement asks for. The run then halts on work that has
nothing to do with the spec.

Machinery changes go to a `build/*` branch instead. `node scripts/aside.mjs build/<topic>
<path>...` commits the working-tree content of those paths onto that branch, in a worktree of
its own, and puts **HEAD** back to the run's baseRef for them while leaving the change in the
working tree, uncommitted. Merge the `build/*` branch when the run is over.

**The change stays in force for the run.** Every stage spawns its scripts and reads its agent
definitions from the working tree when it starts, so what governs a run is what is on disk, not
what its branch has committed. That is the whole reason `aside` resets the commit and not the
file: the first machinery it was used on was the static gate, and taking a gate fix off the disk
hands the next stage the broken gate again.

**Never `git add -A` while an agent is working.** Its half-written files land in your commit,
and your files land in the commit the gate makes for it — both have happened. Stage the paths
you touched, by name.

**Agent prompts are rules only.** A definition under `.claude/agents/` states the desired
behaviour and the prohibitions, in as few words as state them. Never put in a prompt:

- measurements, counts, timings or costs from this project;
- what happened on an earlier run, or what some agent did last time;
- why a rule exists, what it replaced, or a link to the reasoning.

Write the conclusion, not the evidence for it. "Never run the whole E2E suite" is the rule; the
numbers that made it true belong in `docs/`, written for people. Every sentence of
justification is paid for on every invocation and changes no behaviour.

## Record what you learn

Two directories, two readers, and neither is an agent at runtime.

**[docs/adr/](docs/adr/) — decisions.** One file per decision that was not obvious, cost
something to learn, or will be re-litigated. Write it when a rule changes: a new convention, a
reversed one, a constraint nobody would guess from the code. Say what the rule is, what it
replaced, what it costs. Never delete a superseded record — mark it superseded and leave the
evidence, because the next person to propose the old idea needs to find it.

**[docs/research/](docs/research/) — measurements.** Write one when a change is driven by a
number: a benchmark, an experiment, a comparison of two approaches. State the ground truth
first and how it was established, then every configuration you ran and what came back.

**Record the hypotheses that died.** A measurement that killed an idea is the most valuable
thing in either directory, and the easiest to lose, because nobody writes down what they
stopped believing. Give it a heading of its own and name what disproved it.

Numbers come from artefacts on disk — a log, a transcript, a verdict — never from an agent's
summary of itself. A claim you cannot point at is not a measurement.
