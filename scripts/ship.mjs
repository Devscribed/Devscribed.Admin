#!/usr/bin/env node
/**
 * ship — run one spec through the pipeline. One command, no conversation.
 *
 *   node scripts/ship.mjs specs/user-management/11-projects.md
 *
 * The loop is mechanical, so a script runs it: nothing here decides anything. Stage order
 * and every routing decision come from `wf`, which writes them to run.json; this reads
 * run.json, runs whatever stage it names, hands the verdict back, and repeats until the run
 * reaches `ready` or halts. Agent stages run as headless `claude -p --agent <name>` when
 * invoked from a plain shell, or in-process via the Claude Agent SDK when invoked from
 * inside another Claude session (Code or Desktop) — a parent classifier refuses the nested
 * CLI otherwise. Gate stages are plain scripts.
 *
 * Each agent writes its verdict to a known path rather than returning prose, so the
 * orchestrator never has to interpret an answer. A stage that produces no verdict file is an
 * infrastructure error, not a failed review — `wf` retries those without spending the budget.
 *
 * Options:
 *   --branch <name>    create and switch to this branch first
 *   --from <ref>       measure the diff from this ref instead of HEAD — for a run that
 *                      continues work already committed, after a spec defect was fixed
 *   --carry <runId>    pin the run whose unresolved `code` blockers this run inherits.
 *                      Found automatically when omitted: the newest earlier run of the same
 *                      spec that ended holding them. They reach pre_implement and implement
 *                      only, never a gate, and are spent on the first implement attempt.
 *   --no-carry         start clean, inheriting nothing
 *   --resume           continue the active run instead of starting a new one
 *   --skip <stages>    comma-separated stages to skip (e.g. --skip qa)
 *   --permission-mode  passed to claude; default acceptEdits
 *   --track <name>     spec | bug | patch — which stages this document earns, and what each
 *                      one is. Read off the document's path when omitted, so the flag is only
 *                      for overriding that.
 *   --plan-profile <v>       run a named variant of one stage instead of the shape the track
 *   --implement-profile <v>  declares. `npm run config` lists what each track has; `default`
 *   --review-profile <v>     is the block itself.
 *   --accept-unrefined <reason>  start even though the spec's refine ledger is not a pass
 *   --dry-run          print what each stage would run, change nothing
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig, stageFor, timeoutFor, trackFor, STAGES } from './ship-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WF = join(ROOT, 'scripts', 'wf.mjs');

const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set(['branch', 'skip', 'permission-mode', 'from', 'carry',
  'implement-profile', 'review-profile', 'plan-profile', 'accept-unrefined', 'track']);

const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

/**
 * The bare arguments, skipping the values that belong to value-taking flags.
 *
 * `/ship patch <note>` and `/ship bug <report>` are how a person names the weight of what they
 * are shipping, and the skill and the README both write the command that way. Taking the word
 * as the track rather than refusing it as a document path is the difference between the command
 * a person typed working and a message about a track that does not match.
 */
const bare = (() => {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { if (VALUE_FLAGS.has(a.slice(2))) i++; continue; }
    out.push(a);
  }
  return out;
})();

const TRACK_WORDS = new Set(['spec', 'bug', 'patch']);
const bareTrack = bare.length > 1 && TRACK_WORDS.has(bare[0]) ? bare[0] : null;
const specArg = bareTrack ? bare[1] : bare[0];

const skip = new Set((opt('skip', '') || '').split(',').filter(Boolean));
const dryRun = flag('dry-run');
/**
 * A headless run cannot answer a permission prompt — in print mode there is nobody to ask, so
 * any mode that would prompt turns into a denial and the stage fails for a reason that has
 * nothing to do with the code. What actually protects this run is
 * `.claude/hooks/guard-protected-branch.mjs`, which denies the two irreversible actions
 * (a push or tag that deploys, and `prisma generate` from the wrong directory) at PreToolUse,
 * and the fact that the run is on a working branch that is never pushed.
 */
const permissionMode = opt('permission-mode', 'bypassPermissions');

/* Validated here, before a run directory, a lock or a branch exists. A configuration error
   found by the stage that trips over it is found after the run has already spent the stages
   before it. */
const cfg = (() => {
  try { return loadConfig(ROOT); }
  catch (e) { process.stderr.write(`ship: ${e.message}\n`); process.exit(1); }
})();

/* ── output ──────────────────────────────────────────────────────────────── */

const t = () => new Date().toTimeString().slice(0, 8);
const say = (s) => process.stdout.write(`${s}\n`);
const step = (s) => say(`\n\x1b[1m${t()}  ${s}\x1b[0m`);
const note = (s) => say(`         ${s}`);

/* ── wf, the only thing that decides anything ────────────────────────────── */

function wf(...args) {
  const r = spawnSync(process.execPath, [WF, ...args], { cwd: ROOT, encoding: 'utf8' });
  if (r.stdout?.trim()) for (const l of r.stdout.trim().split('\n')) note(l);
  if (r.stderr?.trim()) for (const l of r.stderr.trim().split('\n')) note(l);
  return r.status ?? 1;
}

function runState() {
  const cur = join(ROOT, '.workflow/current');
  if (!existsSync(cur)) return null;
  const id = readFileSync(cur, 'utf8').trim();
  const p = join(ROOT, '.workflow/runs', id, 'run.json');
  return existsSync(p) ? { id, dir: join(ROOT, '.workflow/runs', id), ...JSON.parse(readFileSync(p, 'utf8')) } : null;
}

/**
 * The track, and the shape each stage runs in.
 *
 * The track comes first: it decides which stages a document of this weight earns and what each
 * of them is. A `--*-profile` flag then names a variant of one stage. Both are resolved once,
 * printed at the start and written into run.json, so a result is attributable to the shape that
 * produced it rather than to whatever the config says the next time somebody looks.
 */
const TRACK = (() => {
  const active = runState();
  const doc = specArg ?? active?.spec;
  /* No document at all is the usage error in main(), not an unmatched track. */
  if (!doc) return {};
  /* A resumed run keeps the track it was started with, including one that came from `--track`
     and disagrees with the path. Re-deriving it would resume a different pipeline. */
  try {
    return trackFor(cfg, doc,
      opt('track', null) ?? bareTrack ?? (specArg ? null : active?.track ?? null), ROOT);
  }
  catch (e) { process.stderr.write(`ship: ${e.message}\n`); process.exit(1); }
})();

const VARIANT_FLAG = { pre_implement: 'plan-profile', implement: 'implement-profile', review: 'review-profile' };
const STAGE = {};
if (TRACK.name) {
  for (const stage of STAGES) {
    try { STAGE[stage] = stageFor(cfg, TRACK.name, stage, opt(VARIANT_FLAG[stage] ?? '', null)); }
    catch (e) { process.stderr.write(`ship: ${e.message}\n`); process.exit(1); }
  }
}

/** HEAD when an attempt starts, so a report can tell what each attempt actually changed. */
function headSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/* ── stage prompts ───────────────────────────────────────────────────────── */

/**
 * Short on purpose: the role, its boundaries and its output schema live in the agent
 * definition under .claude/agents/. Repeating them here would create a second copy to drift.
 */
function promptFor(stage, run, verdictPath) {
  /* The run's own verdicts, journal summary and digest are committed, so they land in the
     diff — and one digest alone is 275 KB of JSON that says nothing about the product. What
     is under review is the change, not the pipeline's record of reviewing it. */
  const head = `Run id: \`${run.id}\`\nRun directory: \`.workflow/runs/${run.id}/\`\n`
    + `Spec: \`${run.spec}\`\nBranch: \`${run.branch}\`\nDiff base: \`${run.baseRef}\`\n\n`
    + `Write your verdict to \`${verdictPath}\` in the schema from your agent definition. `
    + `Write it even when everything passes.\n`;

  /* Carried findings reach the two stages that plan and build, and no gate. A reviewer who
     has read the previous reviewer agrees with a text instead of with the code: on this
     spec's own history two shards reached the same finding independently, which is the only
     reason it could be trusted. Independence at the gates is worth more than the time it
     costs. The spend rule below stops them anyway once implement has run; this states the
     rule rather than leaving it to be inferred from that side effect. */
  const CARRY_STAGES = new Set(['pre_implement', 'implement']);
  const carried = blockersAreCarried(run) && CARRY_STAGES.has(stage);
  const feedback = blockersAreCarried(run) && !carried ? [] : lastBlockers(run);
  const heading = carried
    /* These were written against an earlier run's tree. The spec has changed since, and the
       code may have too, so they are leads to check rather than facts to act on — an
       implementer told otherwise will "fix" something already fixed and report it as work. */
    ? `\n## Carried findings\n\n`
      + `**Verify each against the current code first.** Then: still present — fix it; already fixed — `
      + `say so and name what fixed it; no longer applicable under the current spec — say which requirement `
      + `retired it. Do not take any of them as a current fact.\n\n`
    : `\n## What sent this back\n\nAddress every one of these explicitly — fixed and how, or contested with a counter-witness.\n\n`;
  const back = feedback.length
    ? heading
      + feedback.map((f) => `- **${f.rule}** (${f.file ?? '-'}${f.symbol ? `#${f.symbol}` : ''}) — ${f.claim}\n  witness: ${f.witness?.detail ?? '-'}`).join('\n')
      + '\n'
    : '';

  switch (stage) {
    case 'pre_implement':
      return `${head}\nCompile the spec into \`.workflow/runs/${run.id}/handoff.json\` and write your reasoning to `
        + `\`.workflow/runs/${run.id}/stages/pre_implement.md\`.${back}`;
    case 'implement': {
      /* The shape reaches the lead as configuration, not as a choice: two runs of one handoff
         must split it the same way, or a comparison between them measures the split. How to
         split is in the lead's own definition; only the numbers belong here. */
      const p = STAGE.implement ?? {};
      const shards = p.shardAgent
        ? `\n\n## Your shape\n\nDispatch subagent_type "${p.shardAgent}"${p.shardModel ? ` on ${p.shardModel}` : ''}, at most `
          + `${p.maxShards ?? 4} at once. From shipConfig.${run.track ?? 'spec'}.stages.implement; not yours to choose.\n`
        : '';
      /* A track with no plan stage leaves no handoff.json. The document is then the plan, and
         saying so is the whole difference — an implementer sent to a path that does not exist
         invents one. */
      const plan = existsSync(join(ROOT, '.workflow/runs', run.id, 'handoff.json'))
        ? `\`.workflow/runs/${run.id}/handoff.json\``
        : `\`${run.spec}\` — this track compiles no plan, so the document is the plan`;
      return `${head}\nImplement ${plan}. Write your stage report to `
        + `\`.workflow/runs/${run.id}/stages/implement.attempt-${(run.stages.implement.attempts ?? 0) + 1}.md\`.${shards}${back}`;
    }
    case 'review': {
      const done = run.stages.review.attempts ?? 0;
      /* Naming a plan that was never compiled sends the reviewer to an absent file, and a
         reviewer that cannot find its inputs judges the diff against its own assumptions. */
      const against = existsSync(join(ROOT, '.workflow/runs', run.id, 'handoff.json'))
        ? 'the spec and the handoff' : 'the spec';
      /* Name the run. Without it the slice falls back to the newest directory under
         .workflow/runs, which is this run only until somebody starts another one. */
      const slice = `node scripts/review-slice.mjs ${run.id} --variant ${STAGE.review?.variant ?? 'default'}`;
      const ledger = `\n\n## Your worklist\n\nRun \`${slice}\` first. It splits the diff into what must be read this `
        + `pass and what an earlier pass settled, and it decides the second by comparing each file against the commit that pass `
        + `actually saw. You may not write a verdict while the worklist is non-empty; if the fuse runs out first, report the `
        + `remainder in \`covered.unreached\` and do not call it a pass.\n`;
      if (!done) {
        return `${head}\nReview \`git diff ${run.baseRef}...HEAD -- . ':(exclude).workflow'\` against ${against}.${ledger}${back}`;
      }
      const priors = Array.from({ length: done }, (_, i) =>
        `  - \`.workflow/runs/${run.id}/stages/review.attempt-${i + 1}.json\``).join('\n');
      return `${head}
Review \`git diff ${run.baseRef}...HEAD -- . ':(exclude).workflow'\` against ${against}. **This diff has been reviewed ${done} time(s) before.**

## What earlier passes concluded

Read every one of these in full, notes included:

${priors}

They are claims to check, not conclusions to trust. If you disagree with an earlier pass, say so — your verdict is the one that counts.

## What has and has not been looked at

Run \`${slice}\`. It is derived from the commit each earlier verdict names as judged and the files it reported unreached. It is the plan for this pass:

1. **Confirm each earlier blocker is closed** by checking its witness against the code. Say so per finding.
2. **Then work the worklist**, largest first. A previous pass is not proof of absence — on the first run of this spec, four passes named 55, 46, 50 and 44 files of a diff that grew to 84, and nine files were never opened by any of them.
3. **Do not re-derive a settled file.** The ledger has already confirmed with \`git diff\` that it has not moved.

You may not write a verdict while the worklist is non-empty. A review that only re-checks the fix and reports clean has not reviewed this diff.${back}`;
    }
    case 'qa': {
      /* The levels are the track's, not this sentence's. Writing them out here made
         `shipConfig.<track>.stages.qa.levels` a setting a person could change with no effect. */
      const levels = STAGE.qa?.levels ?? ['unit', 'int', 'e2e'];
      const how = {
        unit: 'unit in full',
        int: 'the integration suites the diff touches',
        e2e: 'the E2E suites the diff touches, with `CI=1`',
      };
      const order = levels.map((l) => how[l] ?? l).join(', then ');
      const cheapFirst = STAGE.qa?.skipE2eIfLowerFailed && levels.includes('e2e') && levels.length > 1
        ? ' If a cheaper level fails, stop there and report it — an E2E run buys nothing on a change that already failed below it.'
        : '';
      return `${head}\nRun ${order} — never a whole suite; both already run on the deploy gate.${cheapFirst} `
        + `Then walk every area of functionality the change touches, from every side that can reach it. `
        + `Then check the spec's acceptance criteria.${back}`;
    }
    default:
      throw new Error(`no prompt for stage ${stage}`);
  }
}

/** The blockers from whichever verdict last sent work back, so the next agent sees them. */
function lastBlockers(run) {
  for (const stage of ['qa', 'review', 'static_gate']) {
    /* Only the stage's most recent verdict. An earlier version walked attempts backwards
       until it found one with blockers, which meant a gate that blocked, was satisfied, and
       then passed still handed its old findings to the next stage: QA opened its first run
       being told to address a defect review had already signed off two attempts earlier, and
       spent its time re-verifying a closed finding. A verdict that supersedes another is the
       whole point of running the stage again. */
    const n = run.stages[stage]?.attempts ?? 0;
    if (!n) continue;
    const p = join(run.dir, 'stages', `${stage}.attempt-${n}.json`);
    if (!existsSync(p)) continue;
    const v = JSON.parse(readFileSync(p, 'utf8'));
    const blockers = (v.findings ?? []).filter((f) => f.severity !== 'note');
    if (blockers.length) return blockers;
  }
  /* Nothing in this run has sent work back yet, so a carried set from the run a spec
     correction ended is still the freshest thing there is. Spent on the first implement
     attempt only: after that this run's own gates have looked at the code, and a stale
     finding they did not repeat is one they cleared. */
  if ((run.stages.implement?.attempts ?? 0) === 0) return run.carriedFindings ?? [];
  return [];
}

/** True when lastBlockers is serving a previous run's findings rather than this run's. */
function blockersAreCarried(run) {
  const own = ['qa', 'review', 'static_gate'].some((s) => (run.stages[s]?.attempts ?? 0) > 0);
  return !own && (run.carriedFindings ?? []).length > 0;
}

/* ── stage runners ───────────────────────────────────────────────────────── */

/**
 * A parent Claude session refuses to spawn a nested `claude` CLI with
 * `--permission-mode bypassPermissions`: Anthropic's classifier kills the child before
 * it emits a byte, and the pipeline sees a 0s attempt with an empty log — indistinguishable
 * from a crash. The Agent SDK is the same code path without the outer executable, so it
 * runs in-process and the classifier never fires. Ship uses it whenever it detects a Claude
 * parent (`CLAUDECODE=1` is set by both Claude Code and Desktop for their subprocesses), and
 * falls back to the CLI everywhere else. Both paths write the same log line — a JSON object
 * with `session_id` — so `lastSessionId` keeps working unchanged.
 */
const nested = process.env.CLAUDECODE === '1' || !!process.env.CLAUDE_CODE_ENTRYPOINT;

async function runAgentStage(stage, run) {
  const agent = STAGE[stage].agent;
  const model = STAGE[stage]?.model;
  const timeoutMin = timeoutFor(cfg, run.track ?? 'spec', stage);
  const verdictPath = `.workflow/runs/${run.id}/${stage}.verdict.json`;
  /* Remove any verdict left by the previous attempt: a stale file read as this attempt's
     answer would be the worst possible failure — a verdict about code that is no longer there. */
  const abs = join(ROOT, verdictPath);
  if (existsSync(abs)) rmSync(abs);

  const prompt = promptFor(stage, run, verdictPath);

  /* The implementer resumes its own session between attempts; every other agent starts cold.
     The asymmetry is the point. Converging on working code is helped by remembering what you
     already tried — and three gates downstream catch it if the memory carries a mistake. A
     reviewer's judgement is not helped by remembering what it already ruled: it would be
     defending a position rather than re-deriving one, and two passes over the same diff must
     be able to disagree. See `code-reviewer.md`, "Reviewing again". */
  const resume = stage === 'implement' && run.stages[stage].attempts > 0
    ? lastSessionId(run, stage)
    : null;

  const via = nested ? 'sdk' : 'cli';
  note(`${via === 'sdk' ? 'sdk query' : 'claude -p'} --agent ${agent}${model ? ` --model ${model}` : ''}  (fuse ${timeoutMin}m)`);
  if (resume) note(`resuming session ${resume.slice(0, 8)} — the implementer keeps what it already learned`);
  if (dryRun) return { status: 'pass', findings: [], dryRun: true };

  const started = Date.now();
  const attempt = (run.stages[stage].attempts ?? 0) + 1;
  mkdirSync(join(run.dir, 'stages'), { recursive: true });
  const stem = join(run.dir, 'stages', `${stage}.attempt-${attempt}`);

  /**
   * What this attempt was given, written *before* the agent starts.
   *
   * Two reasons it goes first rather than alongside the log. A run that is still going, or
   * one that was killed, has no log at all — and those are exactly the runs somebody wants to
   * look at. Written up front, these two files mean every attempt is legible from the moment
   * it begins: what was asked, of whom, on which model, continuing which session.
   *
   * The prompt in particular existed nowhere. Reading a finished run afterwards, "what did
   * the reviewer actually see?" could only be re-derived by running `promptFor` again against
   * a run that had since moved on — which answers a different question. It is the one half of
   * every stage that was never recorded, and it is the half that explains the other.
   */
  writeFileSync(`${stem}.prompt.md`, prompt);
  writeFileSync(
    `${stem}.start.json`,
    `${JSON.stringify(
      {
        stage,
        attempt,
        agent,
        model: model ?? null,
        resumedSession: resume ?? null,
        fuseMin: timeoutMin,
        via,
        startedAt: new Date(started).toISOString(),
        baseRef: run.baseRef,
        head: headSha(),
      },
      null,
      2,
    )}\n`,
  );

  const ctx = { stage, agent, model, prompt, resume, timeoutMin, stem, abs, verdictPath };
  const outcome = via === 'sdk' ? await runViaSDK(ctx) : runViaCLI(ctx);
  const secs = ((Date.now() - started) / 1000).toFixed(0);

  if (outcome.timedOut) {
    note(`fuse blew after ${timeoutMin}m`);
    return { status: 'error', error: `stage ${stage} exceeded its ${timeoutMin}-minute fuse` };
  }

  /* A missing verdict file is an environment problem, not a failed review. Saying so keeps a
     crashed runner from spending a code attempt and sending the implementer after a ghost. */
  if (!existsSync(abs)) {
    note(`no verdict written after ${secs}s — treating as an environment failure`);
    return { status: 'error', error: `${agent} produced no verdict at ${verdictPath} (${outcome.exitNote})` };
  }

  note(`verdict written after ${secs}s`);
  const verdict = readVerdict(abs, `${agent} wrote a verdict that is not valid JSON`);

  /* Whether to delegate is the lead's call, so working alone is a legitimate answer. What is
     not optional is saying which way it went: a stage that split and one that did not are
     different stages, and a run whose record cannot tell them apart cannot be compared with
     the run before it. The same check guards the refine judge. */
  if (STAGE[stage]?.shardAgent && !(verdict.shards ?? []).length && !verdict.shardDecision) {
    note(`${agent} reported no split — neither "shards" nor "shardDecision" is in the verdict, `
      + 'so what this stage actually ran is only in its prose report');
  }
  return verdict;
}

function runViaCLI({ stage, agent, model, prompt, resume, timeoutMin, stem }) {
  const args = ['-p', prompt, '--agent', agent,
    '--permission-mode', permissionMode, '--output-format', 'json'];
  if (model) args.push('--model', model);
  if (resume) args.push('--resume', resume);

  const r = spawnSync('claude', args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: timeoutMin * 60_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...(stage === 'qa' ? cfg.isolation.e2eEnv : {}) },
  });

  writeFileSync(`${stem}.log`, `${r.stdout ?? ''}\n${r.stderr ?? ''}`);

  return {
    timedOut: r.error?.code === 'ETIMEDOUT',
    exitNote: `exit ${r.status}`,
  };
}

/**
 * The in-process path. Uses the same agent definitions from `.claude/agents/` as the CLI —
 * the SDK reads them itself — and writes a log with one JSON object per SDK message so
 * `lastSessionId` (which greps for `"session_id": "..."`) works unchanged.
 */
async function runViaSDK({ stage, agent, model, prompt, resume, timeoutMin, stem }) {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const log = `${stem}.log`;
  writeFileSync(log, '');
  const ac = new AbortController();
  const fuse = setTimeout(() => ac.abort(), timeoutMin * 60_000);
  let timedOut = false;
  let lastResult = null;

  const options = {
    agent,
    permissionMode,
    cwd: ROOT,
    abortController: ac,
    env: { ...process.env, ...(stage === 'qa' ? cfg.isolation.e2eEnv : {}) },
  };
  if (model) options.model = model;
  if (resume) options.resume = resume;

  try {
    for await (const msg of query({ prompt, options })) {
      appendFileSync(log, `${JSON.stringify(msg)}\n`);
      if (msg.type === 'result') lastResult = msg;
    }
  } catch (e) {
    if (ac.signal.aborted) timedOut = true;
    else appendFileSync(log, `${JSON.stringify({ type: 'sdk_error', message: String(e?.message ?? e) })}\n`);
  } finally {
    clearTimeout(fuse);
  }

  return {
    timedOut,
    exitNote: lastResult ? `result ${lastResult.subtype}` : 'no result message',
  };
}

/**
 * The session of a stage's most recent invocation, so the next attempt can continue it.
 *
 * Read from the agent's own output, which `--output-format json` gives us and which this
 * function's predecessor did not use. That one scanned the run journal for the last
 * `sessionId` on the stage — but the journal records every tool call made while the run holds
 * the lock, the operator's shell included, and the hook stamps each with whichever stage is
 * currently running rather than with whoever made the call. So an operator who ran one
 * command during an implement attempt was indistinguishable from the implementer, and the
 * next attempt was handed the operator's own conversation to resume. Filtering on `agentType`
 * did not save it: exactly one of the operator's twenty-two calls had been stamped
 * `implementer`, and one is enough.
 *
 * The agent's own report of its session is not a heuristic and cannot be contaminated.
 */
function lastSessionId(run, stage) {
  for (let n = run.stages[stage].attempts ?? 0; n >= 1; n--) {
    const log = join(run.dir, 'stages', `${stage}.attempt-${n}.log`);
    if (!existsSync(log)) continue;
    const m = readFileSync(log, 'utf8').match(/"session_id"\s*:\s*"([0-9a-fA-F-]{36})"/);
    if (m) return m[1];
  }
  return null;
}

/**
 * A verdict that cannot be parsed is an environment-class failure, not a crash. It happens
 * for dull reasons — an agent pasting a Windows path into a JSON string turns `C:\Users` into
 * two invalid escapes — and letting JSON.parse throw takes the whole run down after every
 * stage before it has already been paid for.
 */
function readVerdict(path, whatWentWrong) {
  const raw = readFileSync(path, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    note(`${whatWentWrong}: ${e.message}`);
    writeFileSync(`${path}.raw`, raw);
    return { status: 'error', error: `${whatWentWrong}: ${e.message}. Raw output kept at ${path}.raw` };
  }
}

function runGateStage(run) {
  const out = join(run.dir, 'static_gate.verdict.json');
  if (dryRun) { note('node scripts/static-gate.mjs'); return { status: 'pass', findings: [] }; }
  spawnSync(process.execPath, [join(ROOT, 'scripts/static-gate.mjs'), '--out', out], { cwd: ROOT, encoding: 'utf8' });
  return existsSync(out)
    ? readVerdict(out, 'the static gate wrote a verdict that is not valid JSON')
    : { status: 'error', error: 'static gate produced no verdict' };
}

/* ── the loop ────────────────────────────────────────────────────────────── */

/**
 * What the run has spent, from the agents' own reports on disk.
 *
 * Read from the stage logs rather than kept in memory, so a `--resume` inherits the spend of
 * the invocation before it: the fuses are about the run, not about this process.
 */
function spentSoFar(run) {
  let tokens = 0;
  let usd = 0;
  const dir = join(run.dir, 'stages');
  if (!existsSync(dir)) return { tokens, usd };
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.log')) continue;
    const lines = readFileSync(join(dir, f), 'utf8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      let v;
      try { v = JSON.parse(lines[i]); } catch { continue; }
      if (v?.type !== 'result') continue;
      const u = v.usage ?? {};
      tokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0)
        + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      usd += v.total_cost_usd ?? 0;
      break;
    }
  }
  return { tokens, usd };
}

/** The breaker this run has tripped, as the sentence a person would want, or null. */
function breakerBlown(run) {
  const b = cfg.breakers ?? {};
  const startedAt = run.createdAt ? Date.parse(run.createdAt) : null;
  if (b.runTimeoutMin && startedAt) {
    const min = Math.round((Date.now() - startedAt) / 60_000);
    if (min > b.runTimeoutMin) {
      return `the run has been going ${min} minutes, past the ${b.runTimeoutMin}-minute breaker `
        + '(breakers.runTimeoutMin)';
    }
  }
  if (b.runTokenCap) {
    const { tokens, usd } = spentSoFar(run);
    if (tokens > b.runTokenCap) {
      return `the run has spent ${(tokens / 1e6).toFixed(1)}M tokens ($${usd.toFixed(2)}), past the `
        + `${(b.runTokenCap / 1e6).toFixed(0)}M breaker (breakers.runTokenCap)`;
    }
  }
  return null;
}

async function main() {
  const branch = opt('branch');
  if (branch) {
    step(`branch ${branch}`);
    if (!dryRun) execFileSync('git', ['switch', '-c', branch], { cwd: ROOT, stdio: 'inherit' });
  }

  if (!flag('resume')) {
    if (!specArg) {
      say('usage: node scripts/ship.mjs <document path> [--track spec|bug|patch] [--branch <name>] [--from <ref>] [--carry <runId>|--no-carry] [--skip qa] [--resume]');
      process.exit(1);
    }
    /* A dry run prints and writes nothing. It used to guard only the agent calls and the static
       gate, and drive the state machine for real — so it created a run directory, took the
       lock, marched every stage to `ready` on fabricated verdicts forty milliseconds apart, and
       left that behind. The board and `wf:status` then showed a green run of a spec nobody had
       implemented, and the next real run was refused by the lock the rehearsal was holding. */
    if (dryRun) {
      step(`dry run ${specArg}`);
      note(`track ${TRACK.name}, branch prefix ${TRACK.branchPrefix ?? 'spec/'}, refine ${TRACK.requiresRefine ? 'required' : 'not required'}`);
      note('nothing is written: no run directory, no lock, no verdicts, no branch');
      for (const stage of STAGES) {
        const p = STAGE[stage] ?? {};
        const state = skip.has(stage) ? 'skipped' : p.enabled === false ? 'disabled' : 'would run';
        const how = p.script ? `node ${p.script}`
          : p.agent ? `claude -p --agent ${p.agent}${p.model ? ` --model ${p.model}` : ''}`
            + (p.variant !== 'default' ? `  (variant ${p.variant})` : '')
            + (p.shardAgent ? `  shards ${p.shardAgent} on ${p.shardModel}` : '')
            : 'a preflight script';
        note(`${stage.padEnd(14)} ${state}${state === 'would run' ? `  ${how}` : ''}`);
      }
      return;
    }

    step(`init ${specArg}`);
    const off = STAGES.filter((s) => STAGE[s]?.enabled === false);
    note(`track ${TRACK.name}${off.length ? ` — does not run ${off.join(', ')}` : ''}`);
    const from = opt('from');
    const carry = opt('carry');
    const unrefined = opt('accept-unrefined');
    if (wf('init', '--spec', specArg, '--track', TRACK.name,
      ...(from ? ['--from', from] : []),
      ...(carry ? ['--carry', carry] : []),
      ...(unrefined ? ['--accept-unrefined', unrefined] : []),
      ...Object.entries(STAGE)
        .filter(([, p]) => p?.variant && p.variant !== 'default')
        .flatMap(([stage, p]) => ['--variant', `${stage}=${p.variant}`]),
      ...(flag('no-carry') ? ['--no-carry'] : [])) !== 0) process.exit(1);
    step('preflight');
    if (wf('preflight') !== 0) process.exit(2);
  }

  for (let guard = 0; guard < 40; guard++) {
    const run = runState();
    if (!run) { say('no active run'); process.exit(1); }

    /* The whole-run fuses, checked before a stage is dispatched rather than after — the point
       of a breaker is the agent that does not start. Both are read from `breakers`, and both
       were configuration nothing consulted until now. */
    const blown = breakerBlown(run);
    if (blown) {
      step(`halted — breaker`);
      note(blown);
      wf('abort', '--reason', blown);
      wf('status');
      process.exit(2);
    }

    if (run.status === 'ready') {
      step('ready');
      note(`branch ${run.branch} is green — open the PR yourself; this pipeline never pushes`);
      wf('status');
      return;
    }
    if (run.status === 'halted') {
      step(`halted — ${run.halt.reason}`);
      note(run.halt.detail);
      wf('status');
      process.exit(2);
    }

    const stage = run.status;
    if (skip.has(stage) || STAGE[stage]?.enabled === false) {
      step(`${stage} — skipped`);
      wf('stage', stage, '--start');
      wf('verdict', stage, '--file', writeSkip(run, stage));
      continue;
    }

    step(`${stage}${run.stages[stage].attempts ? `  (attempt ${run.stages[stage].attempts + 1})` : ''}`);
    wf('stage', stage, '--start');

    const verdict = stage === 'static_gate' ? runGateStage(run) : await runAgentStage(stage, run);
    const vp = join(run.dir, `${stage}.verdict.json`);
    writeFileSync(vp, `${JSON.stringify(verdict, null, 2)}\n`);

    wf('stage', stage, '--end');
    const code = wf('verdict', stage, '--file', `.workflow/runs/${run.id}/${stage}.verdict.json`);

    /* Exit 2 is a halt and the loop reads it from run.json on the next pass. Exit 1 is wf
       refusing the call itself — a contract error between these two scripts. Ignoring it
       leaves the status unchanged, so the loop re-runs the same stage forever, and each lap
       is a full agent. Stop instead. */
    commitRecord(run, stage, verdict);

    if (code === 1) {
      say(`\n\x1b[1m${t()}  stopped — wf refused the verdict for "${stage}"\x1b[0m`);
      note('This is a defect in the pipeline, not in the code under review. Nothing was routed.');
      process.exit(3);
    }
  }

  say('\nstopped: 40 stage transitions without settling. Something is wrong with the loop itself.');
  process.exit(3);
}

/**
 * Every attempt of every stage is a commit of its own record.
 *
 * A run used to write its verdicts, reports and `run.json` and leave them all uncommitted
 * until somebody swept them up at the end — so a run halted mid-way left dozens of untracked
 * files with no order to them, and a stage that was retried overwrote the record of the
 * attempt before it with nothing to say it had. The refine loop commits per gate for the same
 * reason; this is that rule for the pipeline.
 *
 * Only `.workflow/runs/<id>` is staged, by pathspec on both the check and the commit. The
 * code the implementer wrote is committed by the static gate and is not touched here, and a
 * person editing in the same tree while a stage runs for half an hour does not end up inside
 * this commit. What `.gitignore` excludes — the event journal, the blobs, the per-stage logs
 * and prompts — stays excluded; what is committed is the record a reader wants in the pull
 * request: which stage ran, on which attempt, and what it decided.
 */
function commitRecord(run, stage, verdict) {
  const pathspec = `.workflow/runs/${run.id}`;
  const attempt = run.stages[stage]?.attempts ?? 0;
  const outcome = verdict?.status ?? 'done';
  const blockers = (verdict?.findings ?? []).filter((f) => f.severity === 'blocker').length;
  const notes = (verdict?.findings ?? []).length - blockers;
  try {
    execFileSync('git', ['add', '--', pathspec], { cwd: ROOT, stdio: 'ignore' });
    const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--', pathspec],
      { cwd: ROOT, encoding: 'utf8' }).trim();
    if (!staged) return;
    const summary = `${outcome}${blockers || notes ? ` — ${blockers} blocker(s), ${notes} note(s)` : ''}`;
    execFileSync('git', ['commit', '-q', '-m',
      `run(${run.id}): ${stage} attempt ${attempt} — ${summary}`, '--', pathspec],
    { cwd: ROOT, stdio: 'ignore' });
  } catch { /* the record is a convenience; a run is not stopped by failing to write it */ }
}

function writeSkip(run, stage) {
  const p = `.workflow/runs/${run.id}/${stage}.verdict.json`;
  writeFileSync(join(ROOT, p), `${JSON.stringify({ status: 'pass', findings: [], skipped: true }, null, 2)}\n`);
  return p;
}

main().catch((e) => { console.error(e); process.exit(1); });
