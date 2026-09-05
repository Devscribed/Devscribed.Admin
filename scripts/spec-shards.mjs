/**
 * Dispatch every child of a spec-review plan at once, and return when the last of them has
 * answered.
 *
 * A lead holding its own dispatch sends its children one message at a time, and no wording of
 * the rule changes it. This is the same dispatch as one tool call: the plan names the children,
 * this spawns all of them together, waits for every one, and prints where each answer landed.
 * The lead reads the answers itself and signs the verdict — nothing here judges anything.
 *
 *   node scripts/spec-shards.mjs <plan.json> [--shape <name>] [--out <dir>] [--restart]
 *
 * The plan:
 *   { "bundle": ["specs/a.md", "specs/a.contracts.md"],
 *     "mode": "Judge the bundle in full.",
 *     "shards": [ { "shard": 1, "subject": "…",
 *                   "criteria": [ { "id": "S-09", "text": "…quoted in full…" } ],
 *                   "enumerate": "…", "depth": "…" } ] }
 *
 * The child agent and its model come from the configured shape, never from the plan: which
 * model answers a criterion is a calibration, and a plan that could name it is a plan that can
 * quietly change what a measurement measured.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './ship-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const planPath = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--shape'
  && argv[argv.indexOf(a) - 1] !== '--out');

if (!planPath) {
  process.stderr.write('usage: node scripts/spec-shards.mjs <plan.json> [--shape <name>] [--out <dir>]\n');
  process.exit(2);
}

const cfg = loadConfig(ROOT);
const RC = cfg.refine ?? {};
const shapeName = opt('shape', RC.use);
const SHAPE = RC.shapes?.[shapeName];
if (!SHAPE) {
  process.stderr.write(`spec-shards: no shape "${shapeName}" — have ${Object.keys(RC.shapes ?? {}).join(', ')}\n`);
  process.exit(2);
}
if (!SHAPE.shardAgent) {
  process.stderr.write(`spec-shards: shape "${shapeName}" declares no shardAgent — it does not shard\n`);
  process.exit(2);
}

const absPlan = resolve(ROOT, planPath);
if (!existsSync(absPlan)) {
  process.stderr.write(`spec-shards: no plan at ${planPath}\n`);
  process.exit(2);
}
let plan;
try { plan = JSON.parse(readFileSync(absPlan, 'utf8')); }
catch (e) { process.stderr.write(`spec-shards: ${planPath} is not valid JSON — ${e.message}\n`); process.exit(2); }

const shards = (plan.shards ?? []).filter((s) => s && Array.isArray(s.criteria) && s.criteria.length);
if (!shards.length) {
  process.stderr.write('spec-shards: the plan carries no assignment with criteria\n');
  process.exit(2);
}
const members = (plan.bundle ?? []).filter((m) => existsSync(join(ROOT, m)));
if (!members.length) {
  process.stderr.write('spec-shards: the plan names no bundle member that exists\n');
  process.exit(2);
}

const outDir = opt('out', `${planPath.replace(/\.json$/, '')}.answers`);
mkdirSync(join(ROOT, outDir), { recursive: true });
const answerPath = (s, i) => `${outDir}/shard-${s.shard ?? i + 1}.json`;

/* What a child is told is its own definition's, in full. This hands it the four values that
   change per dispatch and no sentence of instruction: a script that composes prose keeps a
   second copy of a rule, and the two drift. */
const promptFor = (s, i) => JSON.stringify({
  assignment: planPath,
  shard: s.shard ?? i + 1,
  of: shards.length,
  answer: answerPath(s, i),
});

const timeoutMin = Number(opt('timeout-min', RC.timeoutMin ?? 45));
const permissionMode = opt('permission-mode', 'bypassPermissions');
const ledgerPath = join(ROOT, outDir, 'dispatch.json');

/**
 * Children outlive this process, and a second invocation waits instead of spawning again.
 *
 * Whoever runs this has a time limit of its own, and it is shorter than the children — a shell
 * that gives up at two minutes kills the parent while ten answers are still being written, and
 * a dispatch that respawned on the next call would pay for all of them twice. So the children
 * are detached and their pids are recorded: run the command again and it picks the same run up
 * where it stopped watching.
 */
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
const answerOf = (p) => {
  const abs = join(ROOT, p);
  if (!existsSync(abs)) return null;
  try { return JSON.parse(readFileSync(abs, 'utf8')); } catch { return 'unreadable'; }
};

const spawnOne = (s, i, attempts) => {
  const n = s.shard ?? i + 1;
  const logStem = `${outDir}/shard-${n}`;
  const fd = openSync(join(ROOT, `${logStem}.log`), 'w');
  const args = ['-p', promptFor(s, i), '--agent', SHAPE.shardAgent,
    '--permission-mode', permissionMode, '--output-format', 'json'];
  if (SHAPE.shardModel) args.push('--model', SHAPE.shardModel);
  const child = spawn('claude', args, { cwd: ROOT, windowsHide: true, detached: true, stdio: ['ignore', fd, fd] });
  child.unref();
  return { shard: n, pid: child.pid ?? null, answer: answerPath(s, i), log: `${logStem}.log`, attempts };
};

const resuming = existsSync(ledgerPath) && !argv.includes('--restart');
const run = resuming ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : { started: Date.now(), children: [] };
let entries = run.children ?? [];

/* Started here, or started again: a child with no answer and no process left behind it was
   killed with whoever spawned it, and one retry costs a fraction of the round it would
   otherwise leave with an unanswered criterion. Anything already answered is never respawned. */
let restarted = 0;
entries = shards.map((s, i) => {
  const n = s.shard ?? i + 1;
  const was = entries.find((e) => e.shard === n);
  if (!was) return spawnOne(s, i, 1);
  if (answerOf(was.answer) !== null || alive(was.pid) || (was.attempts ?? 1) >= 2) return was;
  restarted += 1;
  return spawnOne(s, i, (was.attempts ?? 1) + 1);
});
run.started = resuming ? run.started : Date.now();
run.children = entries;
run.shape = shapeName;
writeFileSync(ledgerPath, `${JSON.stringify(run, null, 2)}\n`);

process.stdout.write(`${resuming ? 'waiting on' : 'dispatching'} ${entries.length} × ${SHAPE.shardAgent}`
  + `${SHAPE.shardModel ? ` on ${SHAPE.shardModel}` : ''}, all at once — shape ${shapeName}`
  + `${restarted ? `, ${restarted} restarted` : ''}\n`);

const began = Date.now();
const deadline = run.started + timeoutMin * 60_000;
const done = new Map();
while (done.size < entries.length && Date.now() < deadline) {
  for (const e of entries) {
    if (done.has(e.shard)) continue;
    const a = answerOf(e.answer);
    if (a !== null || !alive(e.pid)) done.set(e.shard, { ...e, answer: a, at: Date.now() });
  }
  if (done.size < entries.length) await new Promise((r) => { setTimeout(r, 2000); });
}
const wall = Math.round((Date.now() - began) / 1000);

const results = shards.map((s, i) => {
  const n = s.shard ?? i + 1;
  const e = entries.find((x) => x.shard === n) ?? {};
  const fin = done.get(n);
  const a = fin ? fin.answer : answerOf(e.answer);
  return {
    shard: n,
    criteria: s.criteria.map((c) => c.id).join(' '),
    path: e.answer,
    seconds: fin ? Math.round((fin.at - run.started) / 1000) : null,
    wrote: a !== null && a !== 'unreadable',
    unreadable: a === 'unreadable',
    running: !fin && alive(e.pid),
    enumerated: a && a !== 'unreadable' ? (a.counts?.enumerated ?? (a.enumerated ?? []).length) : null,
    claims: a && a !== 'unreadable' ? (a.claims ?? []).length : null,
  };
});

const pad = (v, n) => String(v ?? '-').padEnd(n);
process.stdout.write(`\n${pad('#', 4)}${pad('criteria', 26)}${pad('s', 6)}${pad('enum', 6)}${pad('claims', 8)}answer\n`);
for (const r of results.sort((a, b) => a.shard - b.shard)) {
  process.stdout.write(`${pad(r.shard, 4)}${pad(r.criteria, 26)}${pad(r.seconds, 6)}${pad(r.enumerated, 6)}${pad(r.claims, 8)}`
    + `${r.wrote ? r.path : r.unreadable ? `${r.path} — not valid JSON` : r.running ? 'still running' : 'no answer'}\n`);
}

const lost = results.filter((r) => !r.wrote);
const totalSeconds = results.reduce((n, r) => n + (r.seconds ?? 0), 0);
const elapsed = Math.round((Date.now() - run.started) / 1000);
process.stdout.write(`\n${results.length - lost.length} of ${results.length} answered,`
  + ` ${elapsed}s since dispatch (${wall}s watched, ${totalSeconds}s of work,`
  + ` ${(totalSeconds / Math.max(elapsed, 1)).toFixed(1)}x parallel), `
  + `${results.reduce((n, r) => n + (r.claims ?? 0), 0)} claim(s)\n`);
if (lost.length) {
  const running = lost.filter((r) => r.running).map((r) => r.shard);
  const gone = lost.filter((r) => !r.running).map((r) => r.shard);
  if (running.length) process.stdout.write(`still running: ${running.join(', ')} — same command resumes\n`);
  if (gone.length) process.stdout.write(`no answer from: ${gone.join(', ')} — logs beside their answer paths\n`);
}
