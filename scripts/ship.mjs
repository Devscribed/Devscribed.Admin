#!/usr/bin/env node
/**
 * ship — run one spec through the pipeline. One command, no conversation.
 *
 *   node scripts/ship.mjs specs/user-management/11-projects.md
 *
 * The loop is mechanical, so a script runs it: nothing here decides anything. Stage order
 * and every routing decision come from `wf`, which writes them to run.json; this reads
 * run.json, runs whatever stage it names, hands the verdict back, and repeats until the run
 * reaches `ready` or halts. Agent stages are spawned as headless `claude -p --agent <name>`
 * processes; gate stages are plain scripts.
 *
 * Each agent writes its verdict to a known path rather than returning prose, so the
 * orchestrator never has to interpret an answer. A stage that produces no verdict file is an
 * infrastructure error, not a failed review — `wf` retries those without spending the budget.
 *
 * Options:
 *   --branch <name>    create and switch to this branch first
 *   --resume           continue the active run instead of starting a new one
 *   --skip <stages>    comma-separated stages to skip (e.g. --skip qa)
 *   --permission-mode  passed to claude; default acceptEdits
 *   --dry-run          print what each stage would run, change nothing
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/* ── stage prompts ───────────────────────────────────────────────────────── */

/**
 * Short on purpose: the role, its boundaries and its output schema live in the agent
 * definition under .claude/agents/. Repeating them here would create a second copy to drift.
 */
function promptFor(stage, run, verdictPath) {
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
    case 'review':
      return `${head}\nReview \`git diff ${run.baseRef}...HEAD\` against the spec and the handoff.${back}`;
    case 'qa':
      return `${head}\nRun the suites and check the spec's acceptance criteria. Run E2E with \`CI=1\`.${back}`;
    default:
      throw new Error(`no prompt for stage ${stage}`);
  }
}

/** The blockers from whichever verdict last sent work back, so the next agent sees them. */
function lastBlockers(run) {
  for (const stage of ['qa', 'review', 'static_gate']) {
    const attempts = run.stages[stage]?.attempts ?? 0;
    for (let n = attempts; n >= 1; n--) {
      const p = join(run.dir, 'stages', `${stage}.attempt-${n}.json`);
      if (!existsSync(p)) continue;
      const v = JSON.parse(readFileSync(p, 'utf8'));
      const blockers = (v.findings ?? []).filter((f) => f.severity !== 'note');
      if (blockers.length) return blockers;
    }
  }
  return [];
}

/* ── stage runners ───────────────────────────────────────────────────────── */

const AGENT_STAGES = { pre_implement: 'pre-implementer', implement: 'implementer', review: 'code-reviewer', qa: 'qa' };

function runAgentStage(stage, run) {
  const agent = AGENT_STAGES[stage];
  const model = cfg.stages[stage]?.model;
  const timeoutMin = cfg.breakers.stageTimeoutMin?.[stage] ?? 45;
  const verdictPath = `.workflow/runs/${run.id}/${stage}.verdict.json`;
  /* Remove any verdict left by the previous attempt: a stale file read as this attempt's
     answer would be the worst possible failure — a verdict about code that is no longer there. */
  const abs = join(ROOT, verdictPath);
  if (existsSync(abs)) rmSync(abs);

  const args = ['-p', promptFor(stage, run, verdictPath), '--agent', agent,
    '--permission-mode', permissionMode, '--output-format', 'json'];
  if (model) args.push('--model', model);

  note(`claude -p --agent ${agent}${model ? ` --model ${model}` : ''}  (fuse ${timeoutMin}m)`);
  if (dryRun) return { status: 'pass', findings: [], dryRun: true };

  const started = Date.now();
  const r = spawnSync('claude', args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: timeoutMin * 60_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...(stage === 'qa' ? cfg.isolation.e2eEnv : {}) },
  });
  const secs = ((Date.now() - started) / 1000).toFixed(0);

  mkdirSync(join(run.dir, 'stages'), { recursive: true });
  const attempt = (run.stages[stage].attempts ?? 0) + 1;
  writeFileSync(join(run.dir, 'stages', `${stage}.attempt-${attempt}.log`), `${r.stdout ?? ''}\n${r.stderr ?? ''}`);

  if (r.error?.code === 'ETIMEDOUT') {
    note(`fuse blew after ${timeoutMin}m`);
    return { status: 'error', error: `stage ${stage} exceeded its ${timeoutMin}-minute fuse` };
  }

  /* A missing verdict file is an environment problem, not a failed review. Saying so keeps a
     crashed CLI from spending a code attempt and sending the implementer after a ghost. */
  if (!existsSync(abs)) {
    note(`no verdict written after ${secs}s — treating as an environment failure`);
    return { status: 'error', error: `${agent} produced no verdict at ${verdictPath} (exit ${r.status})` };
  }

  note(`verdict written after ${secs}s`);
  return readVerdict(abs, `${agent} wrote a verdict that is not valid JSON`);
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

function main() {
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
    if (wf('init', '--spec', specArg) !== 0) process.exit(1);
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

    const verdict = stage === 'static_gate' ? runGateStage(run) : runAgentStage(stage, run);
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

main();
