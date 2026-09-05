/**
 * Dispatch every child of a spec-review plan at once, and return when the last of them has
 * answered.
 *
 * A lead holding its own dispatch sends its children one message at a time, and no wording of
 * the rule changes it. This is the same dispatch as one tool call: the plan names the children,
 * this spawns all of them together, waits for every one, and prints where each answer landed.
 * The lead reads the answers itself and signs the verdict — nothing here judges anything.
 *
 *   node scripts/spec-shards.mjs <plan.json> [--shape <name>] [--out <dir>]
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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

/* One spawn per child, all started before the first `await`. That is the whole mechanism. */
const runChild = (s, i) => new Promise((done) => {
  const out = answerPath(s, i);
  const logStem = `${outDir}/shard-${s.shard ?? i + 1}`;
  const prompt = promptFor(s, i);
  const args = ['-p', prompt, '--agent', SHAPE.shardAgent,
    '--permission-mode', permissionMode, '--output-format', 'json'];
  if (SHAPE.shardModel) args.push('--model', SHAPE.shardModel);

  const started = Date.now();
  const child = spawn('claude', args, { cwd: ROOT, windowsHide: true });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  const fuse = setTimeout(() => child.kill(), timeoutMin * 60_000);
  child.on('error', (e) => { stderr += `\nspawn error: ${e.message}`; });
  child.on('close', (code) => {
    clearTimeout(fuse);
    writeFileSync(join(ROOT, `${logStem}.log`), `${stdout}\n${stderr}`);
    const abs = join(ROOT, out);
    let answer = null;
    if (existsSync(abs)) { try { answer = JSON.parse(readFileSync(abs, 'utf8')); } catch { answer = 'unreadable'; } }
    done({
      shard: s.shard ?? i + 1,
      subject: String(s.subject ?? '(unnamed)'),
      criteria: s.criteria.map((c) => c.id).join(' '),
      path: out,
      seconds: Math.round((Date.now() - started) / 1000),
      exit: code,
      wrote: answer !== null && answer !== 'unreadable',
      unreadable: answer === 'unreadable',
      enumerated: answer && answer !== 'unreadable' ? (answer.counts?.enumerated ?? (answer.enumerated ?? []).length) : null,
      claims: answer && answer !== 'unreadable' ? (answer.claims ?? []).length : null,
    });
  });
});

const began = Date.now();
process.stdout.write(`dispatching ${shards.length} × ${SHAPE.shardAgent}`
  + `${SHAPE.shardModel ? ` on ${SHAPE.shardModel}` : ''}, all at once — shape ${shapeName}\n`);

const results = await Promise.all(shards.map(runChild));
const wall = Math.round((Date.now() - began) / 1000);

const pad = (v, n) => String(v ?? '-').padEnd(n);
process.stdout.write(`\n${pad('#', 4)}${pad('criteria', 26)}${pad('s', 6)}${pad('enum', 6)}${pad('claims', 8)}answer\n`);
for (const r of results.sort((a, b) => a.shard - b.shard)) {
  process.stdout.write(`${pad(r.shard, 4)}${pad(r.criteria, 26)}${pad(r.seconds, 6)}${pad(r.enumerated, 6)}${pad(r.claims, 8)}`
    + `${r.wrote ? r.path : r.unreadable ? `${r.path} — not valid JSON` : `nothing written (exit ${r.exit})`}\n`);
}

const lost = results.filter((r) => !r.wrote);
const totalSeconds = results.reduce((n, r) => n + r.seconds, 0);
process.stdout.write(`\n${results.length - lost.length} of ${results.length} answered in ${wall}s`
  + ` (${totalSeconds}s of work, ${(totalSeconds / Math.max(wall, 1)).toFixed(1)}x parallel), `
  + `${results.reduce((n, r) => n + (r.claims ?? 0), 0)} claim(s)\n`);
if (lost.length) {
  process.stdout.write(`no answer from: ${lost.map((r) => r.shard).join(', ')}`
    + ` — logs beside their answer paths\n`);
}
