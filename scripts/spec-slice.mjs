/**
 * What one spec-review pass must read, and how it is split.
 *
 * The judge runs this first, so one command hands it both the work and the shape. Everything
 * here is derived — the bundle from the spec path, the criteria families from the register's
 * own section headings, the shard agent and model from the config. Nothing is a decision the
 * judge makes each pass, which is what keeps two passes over one document comparable.
 *
 * Families come from the register's headings rather than from a list here, so a criterion added
 * to the register lands in a family without a second edit. Two sections never go to a shard:
 * contradiction, because a shard holds one family and a contradiction lives between two, and
 * scope, because the Summary is the boundary of the whole document.
 *
 *   node scripts/spec-slice.mjs <spec> [--since <sha>] [--profile <name>] [--json]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REGISTERS } from './criteria.mjs';

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
const specAbs = join(ROOT, specRel);
if (!existsSync(specAbs)) {
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

/**
 * Every member of the bundle: the behaviour file and whatever sits beside it under the same
 * stem. They are one document in three or four files, and a finding against any of them is a
 * finding against this spec.
 */
const stem = specRel.replace(/\.md$/, '');
const dir = dirname(specAbs);
const base = basename(stem);
const bundle = readdirSync(dir)
  .filter((f) => f === `${base}.md` || f.startsWith(`${base}.`))
  .filter((f) => f.endsWith('.md'))
  .map((f) => `${dirname(specRel)}/${f}`.replace(/\\/g, '/'))
  .sort((a, b) => (a === specRel ? -1 : b === specRel ? 1 : a.localeCompare(b)));

const lineCount = (rel) => readFileSync(join(ROOT, rel), 'utf8').split('\n').length;
const files = bundle.map((path) => ({ path, lines: lineCount(path) }));
const totalLines = files.reduce((a, f) => a + f.lines, 0);

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

/* ── the families, from the register's own headings ───────────────────────── */

const HEADING_FAMILY = [
  { match: /^currency/i, family: 'currency', owner: 'shard',
    enumerate: 'every statement the spec makes about code that exists today, and the command that settles each' },
  { match: /^contradiction/i, family: 'contradiction', owner: 'judge',
    enumerate: 'every rule phrased absolutely, and what each one forbids, across the whole bundle' },
  { match: /^repository conventions/i, family: 'conventions', owner: 'shard',
    enumerate: 'every rule the spec states, against the CLAUDE.md convention that governs it' },
  { match: /^self-sufficiency/i, family: 'selfSufficiency', owner: 'shard',
    enumerate: 'every rule the implementer must obey, and where this document states it' },
  { match: /^testability/i, family: 'testability', owner: 'shard',
    enumerate: 'every case, its route to the state it asserts, and its expected result' },
  { match: /^scope/i, family: 'scope', owner: 'judge',
    enumerate: 'the request against the spec, in both directions' },
  { match: /^obligations/i, family: 'obligations', owner: 'shard',
    enumerate: 'everything the spec obliges itself to contain, counted' },
  { match: /^the one note-only/i, family: 'divergence', owner: 'judge',
    enumerate: 'every behaviour this spec changes that an existing document describes' },
];

const registerPath = join(ROOT, REGISTERS.spec);
if (!existsSync(registerPath)) {
  console.error(`register not found: ${REGISTERS.spec}`);
  process.exit(1);
}

const families = new Map();
let current = null;
for (const line of readFileSync(registerPath, 'utf8').split('\n')) {
  const h = line.match(/^##\s+(.*)$/);
  if (h) {
    const title = h[1].replace(/[`*]/g, '').trim();
    const spec = HEADING_FAMILY.find((f) => f.match.test(title));
    current = spec ? spec.family : null;
    if (spec && !families.has(spec.family)) {
      families.set(spec.family, { family: spec.family, owner: spec.owner, enumerate: spec.enumerate, section: title, ids: [] });
    }
    continue;
  }
  const row = line.match(/^\|\s*(S-\d+)\s*\|/);
  if (row && current) families.get(current).ids.push(row[1]);
}

const all = [...families.values()].filter((f) => f.ids.length);
const shardFamilies = all.filter((f) => f.owner === 'shard');
const judgeFamilies = all.filter((f) => f.owner === 'judge');
const unassigned = (() => {
  const seen = new Set(all.flatMap((f) => f.ids));
  const ids = [];
  for (const line of readFileSync(registerPath, 'utf8').split('\n')) {
    const row = line.match(/^\|\s*(S-\d+)\s*\|/);
    if (row && !seen.has(row[1])) ids.push(row[1]);
  }
  return ids;
})();

/* ── the profile ──────────────────────────────────────────────────────────── */

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
const sharded = Boolean(profile.shardAgent);

/**
 * A bundle small enough that a shard would spend more time starting than reading gets its
 * families merged in pairs. The threshold is configuration; the pairing is stable so two passes
 * over one document shard the same way.
 */
const mergeUnder = refine.profiles?.[profileName]?.mergeFamiliesUnderLines ?? 0;
const groups = [];
if (sharded) {
  const merge = mergeUnder > 0 && totalLines < mergeUnder;
  const step = merge ? 2 : 1;
  for (let i = 0; i < shardFamilies.length; i += step) {
    const members = shardFamilies.slice(i, i + step);
    groups.push({
      shard: groups.length + 1,
      families: members.map((m) => m.family),
      ids: members.flatMap((m) => m.ids),
      enumerate: members.map((m) => m.enumerate),
    });
  }
}

const result = {
  spec: specRel,
  bundle: files,
  lines: totalLines,
  mode,
  since: since ?? null,
  changed,
  register: REGISTERS.spec,
  profile: { name: profileName, sharded, ...profile },
  groups,
  judgeFamilies: judgeFamilies.map((f) => ({ family: f.family, ids: f.ids, enumerate: f.enumerate })),
  unassigned,
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log(`# Spec slice — ${specRel}`);
console.log(`# ${mode === 'diff' ? `judging ${since.slice(0, 7)}..HEAD` : 'full pass'} — bundle is ${files.length} file(s), ${totalLines} lines\n`);

console.log('## The bundle — read all of it');
for (const f of files) console.log(`  ${String(f.lines).padStart(5)}  ${f.path}`);

if (mode === 'diff') {
  console.log('\n## Changed since the round you are judging');
  if (!changed.length) console.log('  nothing — the repair touched no bundle file, which is itself the finding');
  for (const c of changed) console.log(`  ${String(c.lines).padStart(5)}  ${c.path}`);
  console.log('  Sweep these lines and the rules they touch. Contradiction is checked against the whole document.');
}

console.log(`\n## Criteria — from ${REGISTERS.spec}`);
if (!sharded) {
  console.log(`Profile ${profileName} runs no shards. Sweep every family yourself, in this order, and set "shards": [].`);
  for (const f of all) console.log(`  ${f.family.padEnd(16)} ${f.ids.join(' ')}`);
} else {
  console.log(`Profile ${profileName} — dispatch subagent_type "${profile.shardAgent}" on ${profile.shardModel ?? 'the default model'}.`);
  console.log(`${groups.length} shard(s). Dispatch them in ONE message, one Task call each.\n`);
  for (const g of groups) {
    console.log(`  shard ${g.shard}: ${g.families.join(' + ')}`);
    console.log(`    criteria: ${g.ids.join(' ')}`);
    for (const e of g.enumerate) console.log(`    enumerate: ${e}`);
  }
  console.log('\n  Quote each criterion\'s text from the register into the shard\'s prompt. A shard reads no register.');
}

console.log('\n## Yours, and no shard\'s');
for (const f of judgeFamilies) {
  console.log(`  ${f.family.padEnd(16)} ${f.ids.join(' ')}`);
  console.log(`    ${f.enumerate}`);
}
if (unassigned.length) console.log(`  unassigned      ${unassigned.join(' ')}\n    no family claims these — answer them yourself and say so in the verdict`);

console.log(`\n## Accounting`);
console.log('The verdict carries a `criteria` map with every id in the register, and `admitted` is true');
console.log('only when every id the register marks `blocks` reads `clear` or `n/a`.');
