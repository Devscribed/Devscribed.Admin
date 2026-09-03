#!/usr/bin/env node
/**
 * refine-loop — judge one spec until it can be delivered, or stop and say why.
 *
 *   node scripts/refine-loop.mjs specs/requests/02-client-participants.md
 *
 * Three gates, and only the last two cost a model:
 *
 *   T0  spec-lint          a script. Pointers, joins, cross-product completeness.
 *   T2  spec-refiner       one judge. Full on the first round; from the second, the range the
 *                          previous repair produced, and nothing else.
 *   T1  pre-implement      the spec compiled into a plan, by the agent the pipeline runs. It
 *                          runs once, after a clean T2 verdict, as the last gate — it reads the
 *                          whole document every time and cannot be given a range, so it is
 *                          not the gate the loop converges on.
 *
 * Whichever gate blocked, `spec-fixer` repairs that verdict, the round is committed, and the
 * next round's judge is given **that commit** as a range. A finding blocks only under the
 * closed rule list; a blocker filed under any other rule is demoted to a note here, whichever
 * agent wrote it.
 *
 * Nothing here decides anything a person would want to argue with. The stopping rules are
 * arithmetic: a round that does not reduce the blocker count, a finding that survives a
 * repair, or a repair that grows the bundle by more than the configured lines per finding,
 * halts for a person instead of spending another pass.
 *
 * Options:
 *   --rounds <n>       judged rounds before stopping (default from config)
 *   --request <text>   the request the spec answers; without it the Summary is the request
 *   --skip <gates>     comma-separated: t1, t2
 *   --no-fix           stop after the verdict instead of dispatching the fixer
 *   --fresh            archive the ledger and probes of an earlier loop on this spec and start
 *                      at round 1 — for a spec that was rewritten or restored since
 *   --dry-run          print what each gate would run, change nothing
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { enforceCriteria, readRegister } from './criteria.mjs';

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

/**
 * Every gate is a commit.
 *
 * A round used to be one, and a round that stopped at T0 or T1 was none at all — so the
 * verdict that halted the loop, the plan it was compiled from and the ledger recording it sat
 * untracked until somebody swept them up by hand, or lost them. A gate is the smallest thing
 * that produced a judgement, so it is the thing that gets committed: what it wrote, at the
 * moment it wrote it, whether or not the round it belongs to ever finished.
 *
 * The spec bundle rides with the fixer's commit and no other. Only the fixer edits the
 * document, and keeping that in one commit is what lets the next round be judged against a
 * range that holds nothing but repairs.
 */
function commitGate(ledger, { round, gate, summary, spec }) {
  if (dryRun) return null;
  const files = ['.workflow/refine', ...(spec ? [spec, ...bundleMembers(spec)] : [])];
  try { git('add', '--', ...files.filter((f) => existsSync(join(ROOT, f)))); } catch { /* nothing staged */ }
  const staged = git('diff', '--cached', '--name-only');
  if (!staged) return null;
  git('commit', '-q', '-m', `refine(${ledger.stem}): round ${round} ${gate} — ${summary}`);
  return headSha();
}

/**
 * The round's own copy of a verdict written to a shared path.
 *
 * `spec-refiner` and `spec-fixer` write to one file each, which the next round overwrites, so
 * without this only the last round of a loop has any findings on disk — and a commit that
 * carries a verdict the next round will replace records nothing durable.
 */
function keepVerdict(ledger, round, gate, from) {
  const src = join(ROOT, from);
  if (!existsSync(src)) return;
  const dir = join(ROOT, '.workflow/refine', `${ledger.stem}.probe`, String(round));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${gate}.verdict.json`), readFileSync(src));
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
  if (existsSync(path) && flag('fresh') && !dryRun) {
    /* An earlier loop's rounds were judged against a document that no longer exists, so a
       range into them is a range into nothing. The record is kept under its start time; only
       the live names are freed. */
    const l = JSON.parse(readFileSync(path, 'utf8'));
    const tag = (l.startedAt ?? new Date().toISOString()).replace(/[:.]/g, '-');
    renameSync(path, join(ROOT, '.workflow/refine', `${stem}.loop.${tag}.json`));
    const probe = join(ROOT, '.workflow/refine', `${stem}.probe`);
    if (existsSync(probe)) renameSync(probe, join(ROOT, '.workflow/refine', `${stem}.probe.${tag}`));
    for (const f of ['verdict', 'fix']) {
      const shared = join(ROOT, '.workflow/refine', `${stem}.${f}.json`);
      if (existsSync(shared)) renameSync(shared, join(ROOT, '.workflow/refine', `${stem}.${f}.${tag}.json`));
    }
  } else if (existsSync(path)) {
    const l = JSON.parse(readFileSync(path, 'utf8'));
    if (l.spec === spec) return { ...l, path };
  }
  return { spec, stem, path, startedAt: new Date().toISOString(), rounds: [], status: 'running' };
}

function saveLedger(l) {
  /* `--dry-run` prints what each gate would run and changes nothing — the ledger included,
     now that it is written between gates rather than once at the end. */
  if (dryRun) return;
  mkdirSync(dirname(l.path), { recursive: true });
  const { path, ...rest } = l;
  writeFileSync(path, `${JSON.stringify(rest, null, 2)}\n`);
}

/**
 * One loop per spec at a time.
 *
 * Every artefact is named after the stem — the ledger, the verdict, the fix record, the probe
 * directory — so two loops on one spec write to the same files and each round is judged against
 * a range the other one committed. The result reads like a loop that will not converge and is
 * nothing of the kind. The lock carries the pid, so a lock whose process is gone is stale and
 * taken over rather than being something a person has to delete.
 */
function claimLock(stem) {
  const path = join(ROOT, '.workflow', 'refine', `${stem}.lock`);
  if (dryRun) return path;
  mkdirSync(dirname(path), { recursive: true });
  const held = (() => {
    try {
      const l = JSON.parse(readFileSync(path, 'utf8'));
      process.kill(l.pid, 0);
      return l;
    } catch { return null; }
  })();
  if (held) {
    say(`another loop is already refining this spec: pid ${held.pid}, started ${held.startedAt}`);
    say('wait for it, or stop it — two loops share every artefact of this stem and corrupt each round.');
    process.exit(2);
  }
  writeFileSync(path, `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`);
  return path;
}

function releaseLock(stem) {
  if (dryRun) return;
  try { rmSync(join(ROOT, '.workflow', 'refine', `${stem}.lock`), { force: true }); } catch { /* nothing to release */ }
}

function finish(ledger, status, reason, detail) {
  ledger.status = status;
  ledger.outcome = { reason, detail, at: new Date().toISOString() };
  saveLedger(ledger);
  releaseLock(ledger.stem);
  /* The loop leaves nothing behind it uncommitted, on any exit. A stop at T0 or T1 used to
     leave its verdict, its plan and the ledger untracked, which is how a person ends up with
     a working copy full of artefacts nobody can attribute to a round. */
  commitGate(ledger, { round: ledger.rounds.length, gate: 'loop', summary: `${status} — ${reason}` });
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

/**
 * The closing message of an agent's own log — what it said instead of doing the job.
 *
 * A gate that ends with no verdict is not a silent failure: the agent said something, and that
 * something is the whole diagnosis. Without it the operator gets "produced no verdict" and has
 * to go parse two megabytes of JSONL to find out that the model wrote a status report.
 */
function closingWords(logStem) {
  try {
    const lines = readFileSync(join(ROOT, `${logStem}.log`), 'utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const m = JSON.parse(lines[i]);
      if (m.type === 'result' && m.result) return String(m.result).replace(/\s+/g, ' ').slice(0, 400);
    }
  } catch { /* a CLI log is plain text and has no result message */ }
  return null;
}

/**
 * One agent, one artefact.
 *
 * **The prompt is written before the agent is dispatched**, next to the log it will produce.
 * What an agent was handed is the first thing anybody asks when it does something strange, and
 * reconstructing it afterwards from this file is reading the code that built it rather than the
 * bytes that were sent — the two drift, and the drift is invisible exactly when it matters.
 *
 * **A pass that produces no verdict is retried once.** It is not a failed judgement: the model
 * ran with the right tools and did not do the job, which is an infrastructure failure with the
 * same shape as a timeout. Spending the round on it wastes the gates that already passed, and
 * the operator learns nothing they can act on.
 */
async function runAgent({ agent, model, prompt, verdictPath, timeoutMin, logStem, attempts = 2 }) {
  const abs = join(ROOT, verdictPath);
  note(`${nested ? 'sdk query' : 'claude -p'} --agent ${agent}${model ? ` --model ${model}` : ''}  (fuse ${timeoutMin}m)`);
  /* Before the delete, not after: a dry run that removes the last verdict of a loop has
     destroyed the only copy of what the judge found, which is the opposite of changing
     nothing. */
  if (dryRun) { note(`would write ${verdictPath}`); return { status: 'pass', findings: [], dryRun: true }; }

  mkdirSync(dirname(abs), { recursive: true });
  mkdirSync(dirname(join(ROOT, logStem)), { recursive: true });
  writeFileSync(join(ROOT, `${logStem}.prompt.md`), prompt);

  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (existsSync(abs)) rmSync(abs); // a stale verdict read as this pass's answer is the worst failure available
    const stem = attempt === 1 ? logStem : `${logStem}.retry-${attempt - 1}`;
    if (attempt > 1) writeFileSync(join(ROOT, `${stem}.prompt.md`), prompt);

    const started = Date.now();
    const outcome = nested
      ? await runViaSDK({ agent, model, prompt, timeoutMin, logStem: stem })
      : runViaCLI({ agent, model, prompt, timeoutMin, logStem: stem });
    note(`${Math.round((Date.now() - started) / 1000)}s, ${outcome.exitNote}`);

    if (existsSync(abs)) {
      try { return JSON.parse(readFileSync(abs, 'utf8')); } catch (e) {
        last = { status: 'error', error: `${agent} wrote a verdict that is not valid JSON: ${e.message}` };
        note(last.error);
        continue;
      }
    }

    const said = closingWords(stem);
    last = {
      status: 'error',
      error: `${agent} produced no verdict at ${verdictPath} (${outcome.exitNote})`
        + (said ? `. It ended by saying: "${said}"` : ''),
    };
    note(attempt < attempts ? `no verdict — retrying once (${outcome.exitNote})` : 'no verdict');
    if (said) note(`it said: ${said.slice(0, 160)}`);
  }
  return last;
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
  if (!dryRun) mkdirSync(join(ROOT, dir, 'stages'), { recursive: true });
  if (!dryRun) writeFileSync(join(ROOT, dir, 'run.json'), `${JSON.stringify({
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

/* The previous round's own copies. `keepVerdict` writes them into the round that produced them
   precisely so a later pass can be handed them: the shared paths are overwritten every round
   and by the time round two runs they hold round two's own emptiness. */
const lastVerdictPath = (ledger, round) =>
  `.workflow/refine/${ledger.stem}.probe/${round - 1}/judge.verdict.json`;
const lastFixPath = (ledger, round) =>
  `.workflow/refine/${ledger.stem}.probe/${round - 1}/fix.verdict.json`;

async function gateJudge(spec, ledger, round, request, since) {
  step(`T2  spec-refiner  (round ${round}${since ? `, judging ${since.slice(0, 8)}..HEAD` : ', full'})`);
  const verdictPath = `.workflow/refine/${ledger.stem}.verdict.json`;
  const prompt = [
    spec,
    '',
    request || 'no request given',
    '',
    since
      ? [
        `Judge the change: this document has already been judged in full and repaired. The range `
        + `is \`${since}..HEAD\`. Sweep the lines that commit changed and the rules those lines `
        + `touch, plus contradiction across the whole document. A statement outside the range is a `
        + `statement an earlier pass accepted.`,
        ``,
        /* What the repair was answering, and what it says it did. Judging a repair without them
           is judging a diff whose purpose is invisible: the same finding gets filed again
           because the change reads as unmotivated, and the loop halts on `stuck-finding` over a
           question the fixer settled on purpose. These are the claim and the receipt — check
           them against the document, never accept them. A finding recorded as fixed that the
           text does not carry is the most valuable thing you can find in this pass. */
        `What that repair was answering is in \`${lastVerdictPath(ledger, round)}\`, and what the`,
        `fixer says it did about each finding — including what it settled by deciding, and the`,
        `alternative it rejected — is in \`${lastFixPath(ledger, round)}\`. Read both.`,
        ``,
        `They are a claim to check, never a conclusion to accept. A finding listed as fixed is`,
        `fixed only if the document now carries the repair; a decision recorded there is one the`,
        `fixer made, not one you are bound by. Where the record and the text disagree, the text`,
        `is what ships and the disagreement is your finding.`,
      ].join('\n')
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
  /* The output path is named here, as it is for the pre-implementer. It used to be sent as two
     bare paths and the agent had to derive where to write from its own definition; it repaired
     the whole verdict across four files, made 52 edits, and never called Write once. An agent
     told what to read and not where to put the answer is being asked to guess the one thing the
     orchestrator will check. */
  const prompt = [
    `Repair every finding in the verdict.`,
    ``,
    `Spec: \`${spec}\` — its bundle members beside it are part of it.`,
    `Verdict: \`${verdictPath}\``,
    ``,
    `Write your record of the repair to \`${fixPath}\`, in the schema from your agent definition,`,
    `and print the same JSON. The loop reads that file and nothing else: a repair you made and`,
    `did not record there is a repair the loop cannot see, and the round stops as an error.`,
  ].join('\n');
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

/**
 * The closed rule list. A blocker under any other rule is an opinion with a witness, and it
 * reaches the person as a note. The judge's definition carries the same list; enforcing it
 * here is what makes it hold for the pre-implementer too, and for any agent added later.
 */
const BLOCKING_RULES = new Set(RC.blockingRules ?? [
  'spec/contradiction', 'spec/stale-statement', 'spec/incomplete-decision',
  'spec/untestable-case', 'spec/ambiguous-requirement', 'spec/missing-artefact', 'spec/scope-gap',
]);

/**
 * The closed criteria register. A rule says which kind of defect a finding is; a criterion says
 * which written check it failed. Both are enforced, because the rule alone leaves the judge free
 * to file anything it can phrase as a contradiction, and a blocking surface nobody enumerated is
 * a different surface every pass — which is where a loop that never converges comes from.
 */
const SPEC_CRITERIA = readRegister(ROOT, 'spec');

/**
 * Demote every blocker outside the closed list, in place, and return the demoted ones.
 *
 * `criteria` is off for the pre-implementer: its `spec` findings say the document would not
 * compile into a plan, which is a judgement the refiner's register was not written for, and
 * demoting them all would silently retire the pipeline's own gate.
 */
function enforceRules(verdict, { criteria = false } = {}) {
  const demoted = [];
  for (const f of verdict.findings ?? []) {
    if (f.severity === 'blocker' && !BLOCKING_RULES.has(f.rule)) {
      f.severity = 'note';
      f.demotedFrom = 'blocker';
      f.demoted = `rule "${f.rule}" is outside the closed list`;
      demoted.push(f);
    }
  }
  if (criteria) demoted.push(...enforceCriteria(verdict.findings, SPEC_CRITERIA));
  return demoted;
}

/**
 * What the judge said about each criterion, and what changed since the round before.
 *
 * A criterion that was clear against text nobody has touched and is blocked now is the loop
 * finding something it did not find last time — the one thing a closed register exists to make
 * visible. It is printed, not acted on: whether that is a real defect the repair introduced or
 * the judge changing its mind is a person's reading, and the ledger keeps both rounds.
 */
function criteriaShift(ledger, round, verdict) {
  const now = verdict?.criteria;
  if (!now || typeof now !== 'object') return null;
  const before = ledger.rounds[round - 2]?.judge?.criteria;
  const reported = Object.keys(now).length;
  const missing = [...SPEC_CRITERIA.ids].filter((id) => !(id in now));
  const regressed = before
    ? Object.keys(now).filter((id) => before[id] === 'clear' && now[id] === 'blocked')
    : [];
  return { reported, missing, regressed };
}

const blockersOf = (v) => (v.findings ?? []).filter((f) => f.severity === 'blocker');
const keyOf = (f) => `${f.rule ?? '?'}:${f.symbol ?? f.file ?? '?'}`;

/**
 * Lines a commit added to the bundle, net of what it removed. A repair that answers a finding
 * with a route, a lock and three cases adds tens of lines per finding; one that corrects or
 * deletes a sentence adds none. The number is the cheapest signal that a loop is growing the
 * thing it is refining, and it is read from git rather than from the fixer's account of itself.
 */
function growthOf(sha, spec) {
  if (!sha) return 0;
  const out = git('diff', '--numstat', `${sha}~1..${sha}`, '--', spec, ...bundleMembers(spec));
  let added = 0, removed = 0;
  for (const line of out.split('\n').filter(Boolean)) {
    const [a, d] = line.split('\t');
    if (a !== '-') { added += Number(a); removed += Number(d); }
  }
  return added - removed;
}

/* ── main ─────────────────────────────────────────────────────────────────── */

async function main() {
  if (!specArg) {
    say('usage: node scripts/refine-loop.mjs <spec path> [--rounds n] [--request "…"] [--skip t1,t2]');
    process.exit(2);
  }
  const spec = specArg.replace(/\\/g, '/');
  if (!existsSync(join(ROOT, spec))) { say(`no such spec: ${spec}`); process.exit(2); }

  /* Before the ledger is loaded: `--fresh` archives the previous one, and archiving what
     another loop is in the middle of writing is the worst of the two failures. */
  claimLock(stemFor(spec));
  process.on('exit', () => releaseLock(stemFor(spec)));

  const ledger = loadLedger(spec);
  ledger.status = 'running';
  say(`\x1b[1mrefine\x1b[0m  ${spec}`);
  note(`${rounds} judged round(s) at most, ledger ${ledger.stem}.loop.json`);

  const request = opt('request', ledger.request ?? '');
  if (request) ledger.request = request;

  for (let round = ledger.rounds.length + 1; round <= rounds; round += 1) {
    /* Recorded before the first gate runs, not after the last one.
       The ledger is what the board reads, and a record written only when a round ends says
       `blocked` — the state the previous round stopped in — for as long as this one is
       thinking, which on T1 is a quarter of an hour of reporting the opposite of the truth. */
    const record = { round, startedAt: new Date().toISOString(), head: headSha(), status: 'running' };
    ledger.rounds.push(record);
    ledger.status = 'running';
    saveLedger(ledger);

    /* T0 — decidable, free, and its repairs delete text rather than add it. */
    const lint = gateLint(spec);
    if (lint.error) finish(ledger, 'error', 'lint-error', lint.error);
    record.lint = lint.findings.length;
    saveLedger(ledger);
    commitGate(ledger, { round, gate: 'T0 spec-lint', summary: lint.findings.length ? `${lint.findings.length} finding(s)` : 'clean' });
    if (lint.findings.length) {
      for (const f of lint.findings.slice(0, 20)) note(`${f.file}:${f.line}  ${f.rule} — ${f.message}`);
      finish(ledger, 'blocked', 'lint',
        `${lint.findings.length} lint finding(s). Every one has a mechanical repair and no judgement in it; `
        + 'fix them and run again rather than paying a model to edit text.');
    }
    note('clean');

    /* T2 — the judge. Full on the first round; the previous repair's range after that. */
    let verdict = null;
    let gate = null;
    if (!skip.has('t2')) {
      const since = round > 1 ? ledger.rounds[round - 2]?.commit ?? null : null;
      verdict = await gateJudge(spec, ledger, round, request, since);
      if (verdict.status === 'error') finish(ledger, 'error', 'judge-error', verdict.error);
      const demoted = enforceRules(verdict, { criteria: true });
      const shift = criteriaShift(ledger, round, verdict);
      const blockers = blockersOf(verdict);
      const notes = (verdict.findings ?? []).length - blockers.length;
      record.judge = {
        status: verdict.status,
        mode: verdict.mode ?? (since ? 'diff' : 'full'),
        blockers: blockers.length,
        notes,
        criteria: verdict.criteria ?? null,
      };
      saveLedger(ledger);
      keepVerdict(ledger, round, 'judge', `.workflow/refine/${ledger.stem}.verdict.json`);
      commitGate(ledger, { round, gate: 'T2 spec-refiner', summary: `${blockers.length} blocker(s), ${notes} note(s)` });
      note(`${blockers.length} blocker(s), ${notes} note(s)`);
      if (shift) {
        note(`criteria reported ${shift.reported}/${SPEC_CRITERIA.ids.size}`
          + (shift.missing.length ? `, unreported: ${shift.missing.join(' ')}` : ''));
        for (const id of shift.regressed) note(`criterion ${id} was clear last round and blocks now`);
      } else if (SPEC_CRITERIA.ids.size) {
        note('the verdict carries no criteria map');
      }
      for (const f of demoted) note(`demoted to note (${f.demoted}): ${f.rule} — ${f.symbol ?? f.file}`);
      for (const f of blockers) note(`${f.id ?? '-'}  ${f.criterion ?? '-'}  ${f.rule} — ${f.symbol ?? f.file}`);
      if (blockers.length) gate = 'T2';
    }

    /* T1 — the pipeline's own gate, once the judge is satisfied. It compiles the whole document
       every time and cannot be given a range, so it runs last and only on a document the judge
       has passed. */
    if (!gate && !skip.has('t1')) {
      const plan = await gatePlan(spec, ledger, round);
      if (plan.status === 'error') finish(ledger, 'error', 'plan-error', plan.error);
      const demoted = enforceRules(plan);
      const specFindings = (plan.findings ?? []).filter((f) => f.target === 'spec' && f.severity === 'blocker');
      record.plan = { status: plan.status, specBlockers: specFindings.length };
      saveLedger(ledger);
      commitGate(ledger, {
        round,
        gate: 'T1 pre-implement',
        summary: `${plan.status}${specFindings.length ? `, ${specFindings.length} spec finding(s)` : ''}`,
      });
      for (const f of demoted) note(`demoted to note (${f.demoted}): ${f.rule} — ${f.symbol ?? f.file}`);
      for (const f of specFindings) note(`${f.id ?? '-'}  ${f.rule} — ${f.symbol ?? f.file}`);
      if (specFindings.length) {
        /* The plan's verdict becomes the round's, at the path the fixer reads. Its findings
           carry the same schema and the same witness rule as the judge's. */
        verdict = { status: 'blocked', spec, gate: 'pre_implement', findings: specFindings };
        writeFileSync(join(ROOT, `.workflow/refine/${ledger.stem}.verdict.json`), `${JSON.stringify(verdict, null, 2)}\n`);
        keepVerdict(ledger, round, 'judge', `.workflow/refine/${ledger.stem}.verdict.json`);
        gate = 'T1';
      } else {
        note(`plan compiles${plan.status === 'pass' ? '' : ` (${plan.status})`}`);
      }
    }

    if (!gate) {
      const notes = verdict ? (verdict.findings ?? []).length : 0;
      finish(ledger, 'pass', 'pass',
        notes ? `${notes} note(s) for the person with the spec; none of them stops anything.` : 'no findings.');
    }

    const blockers = blockersOf(verdict);
    record.gate = gate;
    record.blockers = blockers.length;
    record.keys = blockers.map(keyOf);
    saveLedger(ledger);

    /* A finding that survived a repair has been tried and not fixed. Another round buys nothing. */
    const previous = ledger.rounds[round - 2];
    if (previous?.keys) {
      const survived = record.keys.filter((k) => previous.keys.includes(k));
      if (survived.length) {
        finish(ledger, 'blocked', 'stuck-finding',
          `${survived.join(', ')} survived a repair — the requirement is ambiguous or the finding is wrong. A person decides.`);
      }
      if (previous.gate === gate && blockers.length >= previous.blockers) {
        finish(ledger, 'blocked', 'not-converging',
          `round ${round - 1} left ${previous.blockers} blocker(s), round ${round} found ${blockers.length}. `
          + 'A loop that does not shrink is judging the document again rather than the repair.');
      }
    }

    if (noFix) { finish(ledger, 'blocked', 'verdict-only', 'stopped before the fixer, as asked.'); }

    const fix = await repair(spec, ledger, round);
    if (fix.status === 'error') finish(ledger, 'error', 'fixer-error', fix.error);
    record.fix = { fixed: fix.fixed?.length ?? 0, decided: fix.decided?.length ?? 0, left: fix.left?.length ?? 0 };
    note(`fixed ${record.fix.fixed}, decided ${record.fix.decided}, left ${record.fix.left}`);

    /* The round ends in the fixer's commit, and that commit is the next pass's boundary: it is
       the one that carries the document's repairs, which is what the next judge is given a
       range of. */
    record.endedAt = new Date().toISOString();
    record.status = 'done';
    saveLedger(ledger);
    keepVerdict(ledger, round, 'fix', `.workflow/refine/${ledger.stem}.fix.json`);
    record.commit = commitGate(ledger, {
      round,
      gate: 'fix spec-fixer',
      spec,
      summary: `${record.fix.fixed} fixed, ${record.fix.decided} decided, ${record.fix.left} left`,
    });
    record.growth = growthOf(record.commit, spec);
    saveLedger(ledger);
    note(`bundle grew by ${record.growth} line(s) for ${blockers.length} blocker(s)`);

    if (fix.left?.length) {
      for (const l of fix.left) note(`left: ${l.id} — ${l.question}`);
      finish(ledger, 'blocked', 'needs-a-person',
        `${fix.left.length} finding(s) the fixer may not settle: a repair needing scope the spec does not have, `
        + 'or a question only the product owner answers.');
    }

    /* A repair that adds text is a repair the next pass has to judge. Past the budget it is
       not a repair at all — it is a feature answering a finding, and a person decides whether
       the spec wanted it. The commit stands; what stops is the spending of another pass. */
    const maxGrowth = RC.maxGrowthPerFinding ?? 15;
    if (record.growth > maxGrowth * blockers.length) {
      finish(ledger, 'blocked', 'growing',
        `the repair added ${record.growth} net line(s) for ${blockers.length} blocker(s); the budget is ${maxGrowth} per finding. `
        + 'Read the fixer commit: a finding answered with a route, a lock or a case is a scope decision, not a repair.');
    }
  }

  finish(ledger, 'blocked', 'budget',
    `${rounds} judged round(s) without a clean verdict. The remaining findings are in `
    + `.workflow/refine/${ledger.stem}.verdict.json; ship with them or spend another round deliberately.`);
}

main().catch((e) => { say(`\nrefine-loop failed: ${e?.stack ?? e}`); process.exit(3); });
