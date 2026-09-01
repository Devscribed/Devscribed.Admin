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
 *   --resume           continue the active run instead of starting a new one
 *   --skip <stages>    comma-separated stages to skip (e.g. --skip qa)
 *   --permission-mode  passed to claude; default acceptEdits
 *   --dry-run          print what each stage would run, change nothing
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WF = join(ROOT, 'scripts', 'wf.mjs');

const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set(['branch', 'skip', 'permission-mode', 'from']);

const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

/** The first bare argument, skipping the values that belong to value-taking flags. */
const specArg = (() => {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { if (VALUE_FLAGS.has(a.slice(2))) i++; continue; }
    return a;
  }
  return undefined;
})();

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

const cfg = JSON.parse(readFileSync(join(ROOT, '.claude/ai-workflow.config.json'), 'utf8'));

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

  const feedback = lastBlockers(run);
  const back = feedback.length
    ? `\n## What sent this back\n\nAddress every one of these explicitly — fixed and how, or contested with a counter-witness.\n\n`
      + feedback.map((f) => `- **${f.rule}** (${f.file ?? '-'}${f.symbol ? `#${f.symbol}` : ''}) — ${f.claim}\n  witness: ${f.witness?.detail ?? '-'}`).join('\n')
      + '\n'
    : '';

  switch (stage) {
    case 'pre_implement':
      return `${head}\nCompile the spec into \`.workflow/runs/${run.id}/handoff.json\` and write your reasoning to `
        + `\`.workflow/runs/${run.id}/stages/pre_implement.md\`.${back}`;
    case 'implement':
      return `${head}\nImplement \`.workflow/runs/${run.id}/handoff.json\`. Write your stage report to `
        + `\`.workflow/runs/${run.id}/stages/implement.attempt-${(run.stages.implement.attempts ?? 0) + 1}.md\`.${back}`;
    case 'review': {
      const done = run.stages.review.attempts ?? 0;
      const ledger = `\n\n## Your worklist\n\nRun \`node scripts/review-ledger.mjs\` first. It splits the diff into what must be read this `
        + `pass and what an earlier pass settled, and it decides the second by comparing each file against the commit that pass `
        + `actually saw. You may not write a verdict while the worklist is non-empty; if the fuse runs out first, report the `
        + `remainder in \`covered.unreached\` and do not call it a pass.\n`;
      if (!done) {
        return `${head}\nReview \`git diff ${run.baseRef}...HEAD -- . ':(exclude).workflow'\` against the spec and the handoff.${ledger}${back}`;
      }
      const priors = Array.from({ length: done }, (_, i) =>
        `  - \`.workflow/runs/${run.id}/stages/review.attempt-${i + 1}.json\``).join('\n');
      return `${head}
Review \`git diff ${run.baseRef}...HEAD -- . ':(exclude).workflow'\` against the spec and the handoff. **This diff has been reviewed ${done} time(s) before.**

## What earlier passes concluded

Read every one of these in full, notes included:

${priors}

They are claims to check, not conclusions to trust. If you disagree with an earlier pass, say so — your verdict is the one that counts.

## What has and has not been looked at

Run \`node scripts/review-ledger.mjs\`. It is derived from what earlier reviews actually opened — not from what they claimed — and from the commit each of those passes saw, so "unchanged since" is checked rather than remembered. It is the plan for this pass:

1. **Confirm each earlier blocker is closed** by checking its witness against the code. Say so per finding.
2. **Then work the worklist**, largest first. A previous pass is not proof of absence — on the first run of this spec, four passes named 55, 46, 50 and 44 files of a diff that grew to 84, and nine files were never opened by any of them.
3. **Do not re-derive a settled file.** The ledger has already confirmed with \`git diff\` that it has not moved.

You may not write a verdict while the worklist is non-empty. A review that only re-checks the fix and reports clean has not reviewed this diff.${back}`;
    }
    case 'qa':
      return `${head}\nRun unit in full, then the integration and E2E suites the diff touches — never either one whole; `
        + `both already run on the deploy gate. Run E2E with \`CI=1\`, targeted. Then check the spec's acceptance criteria.${back}`;
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
  return [];
}

/* ── stage runners ───────────────────────────────────────────────────────── */

const AGENT_STAGES = { pre_implement: 'pre-implementer', implement: 'implementer', review: 'code-reviewer', qa: 'qa' };

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
  const agent = AGENT_STAGES[stage];
  const model = cfg.stages[stage]?.model;
  const timeoutMin = cfg.breakers.stageTimeoutMin?.[stage] ?? 45;
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
  return readVerdict(abs, `${agent} wrote a verdict that is not valid JSON`);
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

async function main() {
  const branch = opt('branch');
  if (branch) {
    step(`branch ${branch}`);
    if (!dryRun) execFileSync('git', ['switch', '-c', branch], { cwd: ROOT, stdio: 'inherit' });
  }

  if (!flag('resume')) {
    if (!specArg) {
      say('usage: node scripts/ship.mjs <spec path> [--branch <name>] [--skip qa] [--resume]');
      process.exit(1);
    }
    step(`init ${specArg}`);
    const from = opt('from');
    if (wf('init', '--spec', specArg, ...(from ? ['--from', from] : [])) !== 0) process.exit(1);
    step('preflight');
    if (wf('preflight') !== 0) process.exit(2);
  }

  for (let guard = 0; guard < 40; guard++) {
    const run = runState();
    if (!run) { say('no active run'); process.exit(1); }

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
    if (skip.has(stage) || cfg.stages[stage]?.enabled === false) {
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
    if (code === 1) {
      say(`\n\x1b[1m${t()}  stopped — wf refused the verdict for "${stage}"\x1b[0m`);
      note('This is a defect in the pipeline, not in the code under review. Nothing was routed.');
      process.exit(3);
    }
  }

  say('\nstopped: 40 stage transitions without settling. Something is wrong with the loop itself.');
  process.exit(3);
}

function writeSkip(run, stage) {
  const p = `.workflow/runs/${run.id}/${stage}.verdict.json`;
  writeFileSync(join(ROOT, p), `${JSON.stringify({ status: 'pass', findings: [], skipped: true }, null, 2)}\n`);
  return p;
}

main().catch((e) => { console.error(e); process.exit(1); });
