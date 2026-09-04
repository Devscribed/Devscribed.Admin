/**
 * What one spec-review pass is looking at: an inventory, not a plan.
 *
 * The judge decides how to read a document — whether to split it, along which axis, and into how
 * many pieces. That decision needs facts it cannot cheaply gather itself: how large each member
 * of the bundle is, how much of the repository its claims reach into, which criteria are in play
 * and which of them no single file can settle. Those are what this prints.
 *
 * It prints no division of labour. A computed split is a procedure, and a procedure handed to a
 * judge is one more place to be wrong: this bundle has three members whatever it contains, while
 * the reading that actually costs something is the code behind the claims, and nothing here can
 * see which files those are — the mapping from a route to its controller is in the code, not in
 * the document.
 *
 * One thing here is mechanical and not a preference: the register's `where` column says which
 * criteria are answerable from one file and which need the whole bundle. That is a property of
 * the question — a contradiction lives between two regions — so it travels with the criterion
 * rather than with whoever is reading.
 *
 *   node scripts/spec-slice.mjs <spec> [--since <sha>] [--profile <name>] [--json]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readRegister, REGISTERS } from './criteria.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const TAKES_VALUE = new Set(['--since', '--profile']);
const flag = (n) => {
  const i = argv.indexOf(n);
  return i === -1 ? null : argv[i + 1];
};
const asJson = argv.includes('--json');
const positional = argv.filter((a, i) => !a.startsWith('--') && !TAKES_VALUE.has(argv[i - 1]));

const specRel = positional[0];
if (!specRel) {
  console.error('usage: node scripts/spec-slice.mjs <spec> [--since <sha>] [--profile <name>] [--json]');
  process.exit(1);
}
if (!existsSync(join(ROOT, specRel))) {
  console.error(`spec not found: ${specRel}`);
  process.exit(1);
}

const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

/* ── the bundle ───────────────────────────────────────────────────────────── */

const stem = specRel.replace(/\.md$/, '');
const dir = dirname(join(ROOT, specRel));
const base = basename(stem);
const bundle = readdirSync(dir)
  .filter((f) => f.endsWith('.md') && (f === `${base}.md` || f.startsWith(`${base}.`)))
  .map((f) => `${dirname(specRel)}/${f}`.replace(/\\/g, '/'))
  .sort((a, b) => (a === specRel ? -1 : b === specRel ? 1 : a.localeCompare(b)));

const files = bundle.map((path) => ({
  path,
  lines: readFileSync(join(ROOT, path), 'utf8').split(/\r?\n/).length,
}));
const totalLines = files.reduce((a, f) => a + f.lines, 0);

/* ── the code the bundle reaches into ─────────────────────────────────────── */

/**
 * Every repository path the bundle cites, grouped by the directory that owns it. This is the
 * reading that is not in front of the judge: a claim about a status, an export or a column is
 * settled in the code, and how much code that is decides whether one pass can hold it.
 *
 * It is a floor, not a census. A spec names some of what it is about and describes the rest.
 */
const REPO_PATH = /\b((?:apps|packages|e2e|scripts|infra)\/[\w./@-]+\.[a-z]{2,4})\b/g;
const cited = new Map();
for (const f of files) {
  for (const m of readFileSync(join(ROOT, f.path), 'utf8').matchAll(REPO_PATH)) {
    if (!cited.has(m[1])) cited.set(m[1], new Set());
    cited.get(m[1]).add(f.path);
  }
}
const byDir = new Map();
for (const p of cited.keys()) {
  const d = p.split('/').slice(0, 3).join('/');
  byDir.set(d, (byDir.get(d) ?? 0) + 1);
}

/* ── the pass ─────────────────────────────────────────────────────────────── */

const since = flag('--since');
const mode = since ? 'diff' : 'full';
const changed = since
  ? git('diff', '--numstat', `${since}..HEAD`, '--', ...bundle)
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [a, r, path] = l.split('\t');
      return { path, lines: (+a || 0) + (+r || 0) };
    })
  : [];

/* ── the criteria ─────────────────────────────────────────────────────────── */

const reg = readRegister(ROOT, 'spec');
if (reg.exists && !reg.ids.size) {
  console.error(`${reg.path} parsed to zero criteria — the register is unreadable`);
  process.exit(1);
}

const perFile = [...reg.ids].filter((id) => (reg.where.get(id) ?? 'judge') !== 'judge').sort();
const wholeBundle = [...reg.ids].filter((id) => (reg.where.get(id) ?? 'judge') === 'judge').sort();
const unplaced = [...reg.ids].filter((id) => !reg.where.has(id)).sort();

/* ── the shape available ──────────────────────────────────────────────────── */

const cfg = (() => {
  try {
    return JSON.parse(readFileSync(join(ROOT, '.claude', 'ai-workflow.config.json'), 'utf8'));
  } catch {
    return {};
  }
})();
const refine = cfg.refine ?? {};
const profileName = flag('--profile') ?? refine.profile ?? 'solo';
const profile = refine.profiles?.[profileName] ?? {};

const result = {
  spec: specRel,
  bundle: files,
  lines: totalLines,
  mode,
  since: since ?? null,
  changed,
  citedPaths: [...cited.keys()].sort(),
  citedByDirectory: Object.fromEntries([...byDir.entries()].sort((a, b) => b[1] - a[1])),
  register: reg.path,
  criteria: {
    perFile: perFile.map((id) => ({ id, where: reg.where.get(id), question: reg.question.get(id) })),
    wholeBundle: wholeBundle.map((id) => ({ id, question: reg.question.get(id) })),
    unplaced,
  },
  shardAgent: profile.shardAgent ?? null,
  shardModel: profile.shardModel ?? null,
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log(`# Spec slice — ${specRel}`);
console.log(`# ${mode === 'diff' ? `judging ${since.slice(0, 7)}..HEAD` : 'full pass'}\n`);

console.log(`## The bundle — ${files.length} file(s), ${totalLines} lines`);
for (const f of files) console.log(`  ${String(f.lines).padStart(5)}  ${f.path}`);

if (mode === 'diff') {
  console.log('\n## Changed since the round you are judging');
  if (!changed.length) console.log('  nothing — the repair touched no bundle file, which is itself the finding');
  for (const c of changed) console.log(`  ${String(c.lines).padStart(5)}  ${c.path}`);
}

console.log(`\n## The code its claims reach into — ${cited.size} cited path(s)`);
for (const [d, n] of [...byDir.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${d}`);
}
console.log('  A floor, not a census: a spec names some of what it is about and describes the rest.');

console.log(`\n## Criteria — from ${reg.path}`);
console.log(`  ${perFile.length} are answerable from one member of the bundle:`);
console.log(`    ${perFile.join(' ')}`);
console.log(`  ${wholeBundle.length} need the whole bundle and cannot be split off:`);
console.log(`    ${wholeBundle.join(' ')}`);
if (unplaced.length) console.log(`  the register places nowhere: ${unplaced.join(' ')}`);

console.log('\n## Reading it');
if (result.shardAgent) {
  console.log(`  A shard agent is available: "${result.shardAgent}"${result.shardModel ? ` on ${result.shardModel}` : ''}.`);
  console.log('  Whether to use it, how many, and what each one reads are yours to decide from the');
  console.log('  numbers above. A shard you dispatch carries its files and the text of its criteria;');
  console.log('  it reads no register. Send them in one message or they run in series.');
} else {
  console.log(`  Profile ${profileName} names no shard agent, so this pass is yours alone.`);
}
console.log('  Say what you decided, and why, in `shardDecision`.');

console.log('\n## Accounting');
console.log('  The verdict carries a `criteria` map with every id in the register, and `admitted` is');
console.log('  true only when every id the register marks `blocks` reads `clear` or `n/a`.');
