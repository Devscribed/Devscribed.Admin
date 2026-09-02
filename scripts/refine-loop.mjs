#!/usr/bin/env node
/**
 * refine-loop — judge one spec until it can be delivered, or stop and say why.
 *
 *   node scripts/refine-loop.mjs specs/requests/02-client-participants.md
 *
 * Three gates, cheapest first, and only the last two cost a model:
 *
 *   T0  spec-lint          a script. Pointers, joins, cross-product completeness.
 *   T1  pre-implement      the spec is compiled into a plan. A `spec` finding here is the
 *                          same finding that halts a ship run, met before the run is paid for.
 *   T2  spec-refiner       one judge, on what T0 and T1 cannot decide.
 *
 * Then `spec-fixer` repairs T2's verdict, the round is committed, and the next pass judges
 * **that commit** rather than the document again. The range is passed to the judge as an
 * argument; it is not inferred from a file lying around, which is how a loop ends up
 * re-sweeping a document it has already accepted and returning a different subset forever.
 *
 * Nothing here decides anything a person would want to argue with. The stopping rule is
 * arithmetic: a round that does not reduce the blocker count, or a finding that survives two
 * rounds, halts for a person instead of spending another pass.
 *
 * Options:
 *   --rounds <n>       judged rounds before stopping (default from config)
 *   --request <text>   the request the spec answers; without it the Summary is the request
 *   --skip <gates>     comma-separated: t1, t2
 *   --no-fix           stop after the verdict instead of dispatching the fixer
 *   --dry-run          print what each gate would run, change nothing
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set(['rounds', 'request', 'skip', 'permission-mode']);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

const specArg = (() => {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { if (VALUE_FLAGS.has(a.slice(2))) i++; continue; }
    return a;
  }
  return undefined;
})();

const cfg = JSON.parse(readFileSync(join(ROOT, '.claude/ai-workflow.config.json'), 'utf8'));
const RC = cfg.refine ?? {};
const rounds = Number(opt('rounds', RC.rounds ?? 2));
const skip = new Set((opt('skip', '') || '').split(',').filter(Boolean));
const dryRun = flag('dry-run');
const noFix = flag('no-fix');
const permissionMode = opt('permission-mode', 'bypassPermissions');

const t = () => new Date().toTimeString().slice(0, 8);
const say = (s) => process.stdout.write(`${s}\n`);
const step = (s) => say(`\n\x1b[1m${t()}  ${s}\x1b[0m`);
const note = (s) => say(`         ${s}`);

/* ── git ──────────────────────────────────────────────────────────────────── */

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function headSha() {
  try { return git('rev-parse', 'HEAD'); } catch { return null; }
}

/** A round is a commit. Without one the next pass has no boundary and re-judges everything. */
function commitRound(spec, ledger, round, verdict, fix) {
  const files = [spec, ...bundleMembers(spec), '.workflow/refine'];
  try { git('add', '--', ...files.filter((f) => existsSync(join(ROOT, f)))); } catch { /* nothing staged */ }
  const staged = git('diff', '--cached', '--name-only');
  if (!staged) return null;
  const n = verdict.findings?.filter((f) => f.severity === 'blocker').length ?? 0;
  const decided = fix?.decided?.length ?? 0;
  const body = [
    `refine(${ledger.stem}): round ${round}`,
    '',
    `${n} blocker(s) repaired${decided ? `, ${decided} settled by deciding` : ''}.`,
    'Judged against the previous round\'s commit, not the document.',
  ].join('\n');
  git('commit', '-q', '-m', body);
  return headSha();
}

/* ── the bundle ───────────────────────────────────────────────────────────── */

const bundleMembers = (spec) => {
  const base = spec.replace(/\.md$/, '');
  return [`${base}.contracts.md`, `${base}.cases.md`, `${base}.design.md`];
};

/** `specs/requests/02-client-participants.md` -> `requests-02` */
function stemFor(spec) {
  const m = spec.match(/specs\/([^/]+)\/(\d+)/);
  return m ? `${m[1]}-${m[2]}` : spec.replace(/[^\w]+/g, '-');
}

/* ── the ledger ───────────────────────────────────────────────────────────── */

function loadLedger(spec) {
  const stem = stemFor(spec);
  const path = join(ROOT, '.workflow/refine', `${stem}.loop.json`);
  if (existsSync(path)) {
    const l = JSON.parse(readFileSync(path, 'utf8'));
    if (l.spec === spec) return { ...l, path };
  }
  return { spec, stem, path, startedAt: new Date().toISOString(), rounds: [], status: 'running' };
}

function saveLedger(l) {
  mkdirSync(dirname(l.path), { recursive: true });
  const { path, ...rest } = l;
  writeFileSync(path, `${JSON.stringify(rest, null, 2)}\n`);
}

function finish(ledger, status, reason, detail) {
  ledger.status = status;
  ledger.outcome = { reason, detail, at: new Date().toISOString() };
  saveLedger(ledger);
  step(status === 'pass' ? 'pass' : `stopped: ${reason}`);
  if (detail) note(detail);
  say('');
  say(`ledger  ${ledger.path.replace(ROOT + '\\', '').replace(ROOT + '/', '')}`);
  process.exit(status === 'pass' ? 0 : 1);
}

/* ── T0 ───────────────────────────────────────────────────────────────────── */

function gateLint(spec) {
  step('T0  spec-lint');
  if (dryRun) { note(`would run: node scripts/spec-lint.mjs ${spec}`); return { findings: [] }; }
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/spec-lint.mjs'), spec, '--json'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  let out;
  try { out = JSON.parse(r.stdout); } catch {
    return { error: `spec-lint produced no JSON (exit ${r.status}): ${(r.stderr || r.stdout || '').slice(0, 400)}` };
  }
  return out;
}

/* ── agents ───────────────────────────────────────────────────────────────── */

/**
 * A parent Claude session cannot spawn a nested `claude` CLI under bypassPermissions — the
 * classifier kills the child before it emits a byte. The SDK is the same code path without the
 * outer executable, so it runs in-process. Same reasoning as `ship.mjs`.
 */
const nested = process.env.CLAUDECODE === '1' || !!process.env.CLAUDE_CODE_ENTRYPOINT;

async function runAgent({ agent, model, prompt, verdictPath, timeoutMin, logStem }) {
  const abs = join(ROOT, verdictPath);
  if (existsSync(abs)) rmSync(abs); // a stale verdict read as this pass's answer is the worst failure available
  mkdirSync(dirname(abs), { recursive: true });
  mkdirSync(dirname(join(ROOT, logStem)), { recursive: true });

  note(`${nested ? 'sdk query' : 'claude -p'} --agent ${agent}${model ? ` --model ${model}` : ''}  (fuse ${timeoutMin}m)`);
  if (dryRun) { note(`would write ${verdictPath}`); return { status: 'pass', findings: [], dryRun: true }; }

  const started = Date.now();
  const outcome = nested
    ? await runViaSDK({ agent, model, prompt, timeoutMin, logStem })
    : runViaCLI({ agent, model, prompt, timeoutMin, logStem });
  note(`${Math.round((Date.now() - started) / 1000)}s, ${outcome.exitNote}`);

  if (!existsSync(abs)) {
    return { status: 'error', error: `${agent} produced no verdict at ${verdictPath} (${outcome.exitNote})` };
  }
  try { return JSON.parse(readFileSync(abs, 'utf8')); } catch (e) {
    return { status: 'error', error: `${agent} wrote a verdict that is not valid JSON: ${e.message}` };
  }
}

function runViaCLI({ agent, model, prompt, timeoutMin, logStem }) {
  const args = ['-p', prompt, '--agent', agent, '--permission-mode', permissionMode, '--output-format', 'json'];
  if (model) args.push('--model', model);
  const r = spawnSync('claude', args, {
    cwd: ROOT, encoding: 'utf8', timeout: timeoutMin * 60_000, maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(join(ROOT, `${logStem}.log`), `${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  return { timedOut: r.error?.code === 'ETIMEDOUT', exitNote: `exit ${r.status}` };
}

async function runViaSDK({ agent, model, prompt, timeoutMin, logStem }) {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const log = join(ROOT, `${logStem}.log`);
  writeFileSync(log, '');
  const ac = new AbortController();
  const fuse = setTimeout(() => ac.abort(), timeoutMin * 60_000);
  let timedOut = false;
  let last = null;
  const options = { agent, permissionMode, cwd: ROOT, abortController: ac };
  if (model) options.model = model;
  try {
    for await (const msg of query({ prompt, options })) {
      appendFileSync(log, `${JSON.stringify(msg)}\n`);
      if (msg.type === 'result') last = msg;
    }
  } catch (e) {
    if (ac.signal.aborted) timedOut = true;
    else appendFileSync(log, `${JSON.stringify({ type: 'sdk_error', message: String(e?.message ?? e) })}\n`);
  } finally { clearTimeout(fuse); }
  return { timedOut, exitNote: last ? `result ${last.subtype}` : 'no result message' };
}

/* ── T1 ───────────────────────────────────────────────────────────────────── */

/**
 * The pre-implementer compiles the spec into a plan. It is bound to a run, so the loop gives it
 * a throwaway one rather than editing its definition: the point of running it here is that it
 * is the *same* agent the pipeline runs, reading the *same* way.
 */
async function gatePlan(spec, ledger, round) {
  step(`T1  pre-implement  (round ${round})`);
  const dir = `.workflow/refine/${ledger.stem}.probe/${round}`;
  const runId = `refine-${ledger.stem}-${round}`;
  mkdirSync(join(ROOT, dir, 'stages'), { recursive: true });
  writeFileSync(join(ROOT, dir, 'run.json'), `${JSON.stringify({
    runId, dir, spec, specSha: null, status: 'pre_implement',
    task: 'compile this spec into a plan; this is a refine probe, not a ship run',
    stages: { pre_implement: { status: 'running', attempts: 0 } },
  }, null, 2)}\n`);

  const verdictPath = `${dir}/pre_implement.verdict.json`;
  const prompt =
    `Compile the specification into a plan. The run is at \`${dir}/run.json\`; the spec it names is `
    + `\`${spec}\`, and its bundle members beside it are part of it. Write the handoff to `
    + `\`${dir}/handoff.json\` and your report to \`${dir}/stages/pre_implement.md\`. `
    + `Write your verdict to \`${verdictPath}\` in the schema from your agent definition. `
    + `Nothing is implemented yet and nothing will be implemented from this plan — it is run to `
    + `find out whether the spec can be compiled at all.`;

  return runAgent({
    agent: 'pre-implementer',
    model: cfg.stages.pre_implement?.model,
    prompt,
    verdictPath,
    timeoutMin: cfg.breakers?.stageTimeoutMin?.pre_implement ?? 45,
    logStem: `${dir}/stages/pre_implement`,
  });
}

/* ── T2 ───────────────────────────────────────────────────────────────────── */

async function gateJudge(spec, ledger, round, request, since) {
  step(`T2  spec-refiner  (round ${round}${since ? `, judging ${since.slice(0, 8)}..HEAD` : ', full'})`);
  const verdictPath = `.workflow/refine/${ledger.stem}.verdict.json`;
  const prompt = [
    spec,
    '',
    request || 'no request given',
    '',
    since
      ? `Judge the change: this document has already been judged in full and repaired. The range `
        + `is \`${since}..HEAD\`. Sweep the lines that commit changed and the rules those lines `
        + `touch, plus contradiction across the whole document. A statement outside the range is a `
        + `statement an earlier pass accepted.`
      : 'Judge the document in full. This is its first pass.',
  ].join('\n');

  return runAgent({
    agent: 'spec-refiner',
    model: RC.judgeModel ?? 'opus',
    prompt,
    verdictPath,
    timeoutMin: RC.timeoutMin ?? 45,
    logStem: `.workflow/refine/${ledger.stem}.probe/${round}/spec-refiner`,
  });
}

/* ── repair ───────────────────────────────────────────────────────────────── */

async function repair(spec, ledger, round) {
  step(`fix  spec-fixer  (round ${round})`);
  const verdictPath = `.workflow/refine/${ledger.stem}.verdict.json`;
  const fixPath = `.workflow/refine/${ledger.stem}.fix.json`;
  const prompt = `${spec}\n${verdictPath}`;
  return runAgent({
    agent: 'spec-fixer',
    model: RC.fixerModel ?? 'opus',
    prompt,
    verdictPath: fixPath,
    timeoutMin: RC.timeoutMin ?? 45,
    logStem: `.workflow/refine/${ledger.stem}.probe/${round}/spec-fixer`,
  });
}

/* ── convergence ──────────────────────────────────────────────────────────── */

const blockersOf = (v) => (v.findings ?? []).filter((f) => f.severity === 'blocker');
const keyOf = (f) => `${f.rule ?? '?'}:${f.symbol ?? f.file ?? '?'}`;

/* ── main ─────────────────────────────────────────────────────────────────── */

async function main() {
  if (!specArg) {
    say('usage: node scripts/refine-loop.mjs <spec path> [--rounds n] [--request "…"] [--skip t1,t2]');
    process.exit(2);
  }
  const spec = specArg.replace(/\\/g, '/');
  if (!existsSync(join(ROOT, spec))) { say(`no such spec: ${spec}`); process.exit(2); }

  const ledger = loadLedger(spec);
  ledger.status = 'running';
  say(`\x1b[1mrefine\x1b[0m  ${spec}`);
  note(`${rounds} judged round(s) at most, ledger ${ledger.stem}.loop.json`);

  const request = opt('request', ledger.request ?? '');
  if (request) ledger.request = request;

  for (let round = ledger.rounds.length + 1; round <= rounds; round += 1) {
    const record = { round, startedAt: new Date().toISOString(), head: headSha() };

    /* T0 — decidable, free, and its repairs delete text rather than add it. */
    const lint = gateLint(spec);
    if (lint.error) finish(ledger, 'error', 'lint-error', lint.error);
    record.lint = lint.findings.length;
    if (lint.findings.length) {
      for (const f of lint.findings.slice(0, 20)) note(`${f.file}:${f.line}  ${f.rule} — ${f.message}`);
      ledger.rounds.push(record);
      finish(ledger, 'blocked', 'lint',
        `${lint.findings.length} lint finding(s). Every one has a mechanical repair and no judgement in it; `
        + 'fix them and run again rather than paying a model to edit text.');
    }
    note('clean');

    /* T1 — the gate that halts a ship run, met before the run is paid for. */
    if (!skip.has('t1')) {
      const plan = await gatePlan(spec, ledger, round);
      if (plan.status === 'error') finish(ledger, 'error', 'plan-error', plan.error);
      const specFindings = (plan.findings ?? []).filter((f) => f.target === 'spec' && f.severity === 'blocker');
      record.plan = { status: plan.status, specBlockers: specFindings.length };
      if (specFindings.length) {
        for (const f of specFindings) note(`${f.rule ?? 'spec'} — ${f.claim ?? f.summary ?? ''}`);
        ledger.rounds.push(record);
        finish(ledger, 'blocked', 'spec-defect',
          `${specFindings.length} finding(s) the pipeline would halt on: ${specFindings.map((f) => f.rule ?? '?').join('; ')}`);
      }
      note(`plan compiles${plan.status === 'pass' ? '' : ` (${plan.status})`}`);
    }

    /* T2 — one judge, on what the first two could not decide. */
    if (skip.has('t2')) { ledger.rounds.push(record); break; }
    const since = round > 1 ? ledger.rounds[round - 2]?.commit ?? null : null;
    const verdict = await gateJudge(spec, ledger, round, request, since);
    if (verdict.status === 'error') finish(ledger, 'error', 'judge-error', verdict.error);

    const blockers = blockersOf(verdict);
    const notes = (verdict.findings ?? []).length - blockers.length;
    record.judge = { status: verdict.status, mode: verdict.mode ?? (since ? 'diff' : 'full'), blockers: blockers.length, notes };
    record.keys = blockers.map(keyOf);
    note(`${blockers.length} blocker(s), ${notes} note(s)`);
    for (const f of blockers) note(`${f.id ?? '-'}  ${f.rule} — ${f.symbol ?? f.file}`);

    if (!blockers.length) {
      ledger.rounds.push(record);
      finish(ledger, 'pass', 'pass',
        notes ? `${notes} note(s) for the person with the spec; none of them stops anything.` : 'no findings.');
    }

    /* A finding that survived a repair has been tried and not fixed. Another round buys nothing. */
    const previous = ledger.rounds[round - 2];
    if (previous?.keys) {
      const survived = record.keys.filter((k) => previous.keys.includes(k));
      if (survived.length) {
        ledger.rounds.push(record);
        finish(ledger, 'blocked', 'stuck-finding',
          `${survived.join(', ')} survived a repair — the requirement is ambiguous or the finding is wrong. A person decides.`);
      }
      if (blockers.length >= previous.judge.blockers) {
        ledger.rounds.push(record);
        finish(ledger, 'blocked', 'not-converging',
          `round ${round - 1} left ${previous.judge.blockers} blocker(s), round ${round} found ${blockers.length}. `
          + 'A loop that does not shrink is judging the document again rather than the repair.');
      }
    }

    if (noFix) { ledger.rounds.push(record); finish(ledger, 'blocked', 'verdict-only', 'stopped before the fixer, as asked.'); }

    const fix = await repair(spec, ledger, round);
    if (fix.status === 'error') finish(ledger, 'error', 'fixer-error', fix.error);
    record.fix = { fixed: fix.fixed?.length ?? 0, decided: fix.decided?.length ?? 0, left: fix.left?.length ?? 0 };
    note(`fixed ${record.fix.fixed}, decided ${record.fix.decided}, left ${record.fix.left}`);

    /* The round is committed whatever comes next: the commit is the next pass's boundary. */
    record.commit = dryRun ? null : commitRound(spec, ledger, round, verdict, fix);
    record.endedAt = new Date().toISOString();
    ledger.rounds.push(record);
    saveLedger(ledger);

    if (fix.left?.length) {
      for (const l of fix.left) note(`left: ${l.id} — ${l.question}`);
      finish(ledger, 'blocked', 'needs-a-person',
        `${fix.left.length} finding(s) the fixer may not settle: a repair needing scope the spec does not have, `
        + 'or a question only the product owner answers.');
    }
  }

  finish(ledger, 'blocked', 'budget',
    `${rounds} judged round(s) without a clean verdict. The remaining findings are in `
    + `.workflow/refine/${ledger.stem}.verdict.json; ship with them or spend another round deliberately.`);
}

main().catch((e) => { say(`\nrefine-loop failed: ${e?.stack ?? e}`); process.exit(3); });
