/**
 * What else in the bundle talks about the thing a repair just changed.
 *
 * A minimal repair rewrites one statement. The statements that agreed with the old one are
 * still standing, and they now disagree with the new one — which is the next round's finding,
 * filed against text the repair never opened. Ten of the eighteen blockers the time-off/01
 * loop raised were of that shape, and each of them named a token the repair had touched
 * somewhere else in the same bundle.
 *
 * This prints that worklist. It decides nothing: it lists, per token the range moved, every
 * line elsewhere in the bundle that still carries it and that the range did not touch. A
 * reader — the fixer before it finishes, or the judge on the re-pass — answers each line.
 *
 * The strongest signal is a token the range *removed* from one file and left standing in
 * another: the repair deleted the only route that named `ViewHolidays` and the permission
 * matrix kept granting it.
 *
 *   node scripts/spec-coref.mjs specs/time-off/01-vacation-calendar.md --range a08419d..a64e65a
 *   node scripts/spec-coref.mjs <spec> --since <sha>          # <sha>..HEAD
 *   node scripts/spec-coref.mjs <spec> --working              # HEAD against the working tree
 *   node scripts/spec-coref.mjs <spec> --range a..b --json
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { repairPaths } from './spec-paths.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i === -1 ? d : argv[i + 1];
};
const has = (n) => argv.includes(`--${n}`);

const spec = argv.find((a) => !a.startsWith('--') && a.endsWith('.md'));
if (!spec) {
  console.error('usage: spec-coref.mjs <spec.md> (--range a..b | --since <sha> | --working) [--json] [--all]');
  process.exit(2);
}

const git = (...a) => {
  try {
    /* A bundle member that does not exist on one side of the range is normal — a spec without a
       `.design.md` is not an error — and git says so on stderr. Printed, it reads as a failure of
       the tool to whoever ran it. */
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
};

const range = flag('range');
const since = flag('since');
const working = has('working');
const [BASE, HEAD] = range
  ? [range.split('..')[0], range.split('..')[1] || 'HEAD']
  : since
    ? [since, 'HEAD']
    : working
      ? ['HEAD', null]
      : [null, null];
if (!BASE) {
  console.error('need --range a..b, --since <sha>, or --working');
  process.exit(2);
}

/* ── the files a repair may touch ─────────────────────────────────────────── */

const FILES = [spec, ...repairPaths(spec)].filter((f, i, a) => a.indexOf(f) === i);

const atRev = (file, rev) => (rev === null
  ? (existsSync(join(ROOT, file)) ? readFileSync(join(ROOT, file), 'utf8') : '')
  : git('show', `${rev}:${file}`));

/* ── what counts as a subject ─────────────────────────────────────────────────
 *
 * A token is something two statements can both be about. Prose words are not: two sentences
 * sharing "member" are not a pair that must agree. Ids, exports, capabilities, routes,
 * selectors and the identifiers a spec writes in backticks are, and every repair-induced
 * finding in the loop this was built from named one of them.
 */

const PATTERNS = [
  /\bREQ-\d{2}-\d{3}\b/g,                               // requirement ids
  /\bTC-\d{2}-(?:UNIT|INT|E2E)-\d{2,3}\b/g,             // case ids
  /\b(?:[A-Z][A-Z0-9_]*_)?MESSAGES\.[A-Za-z0-9_.]+/g,   // message exports
  /\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[^\s`|,;)]+/g,   // routes
  /\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b/g,             // PascalCase: ViewHolidays, MemberCapability
];

/* Backticked spans are the spec's own way of saying "this is a name, not a word". Keep the
   ones shaped like an identifier, a path, a column or a literal value; drop a backticked
   sentence, which is prose wearing a costume. */
const BACKTICK = /`([^`\n]{2,80})`/g;
const IDENTIFIER = /^[A-Za-z_$][\w$]*(?:[.\-/[\]][\w$*]+)*\??$/;

/* Words that pass the PascalCase or kebab shape and name nothing a pair can be about. A short
   list, because a token nobody else mentions costs one line of output and no judgement. */
const STOP = new Set([
  'JavaScript', 'TypeScript', 'PostgreSQL', 'NestJS', 'README', 'ISO', 'UTC',
  'GitHub', 'DateTime', 'JSON', 'HTTP', 'HTTPS', 'API', 'UI', 'URL',
]);

function tokensOf(line) {
  const out = new Set();
  for (const re of PATTERNS) {
    for (const m of line.matchAll(re)) {
      const t = m[0].trim();
      if (!STOP.has(t)) out.add(t);
    }
  }
  for (const m of line.matchAll(BACKTICK)) {
    const t = m[1].trim();
    if (IDENTIFIER.test(t) && t.length >= 3 && !STOP.has(t)) out.add(t);
  }
  return out;
}

/* ── the index ────────────────────────────────────────────────────────────── */

/** token -> file -> [{ line, text }] */
function index(rev) {
  const idx = new Map();
  const bodies = new Map();
  for (const file of FILES) {
    const body = atRev(file, rev);
    if (!body) continue;
    const lines = body.split(/\r?\n/);
    bodies.set(file, lines);
    lines.forEach((text, i) => {
      for (const t of tokensOf(text)) {
        if (!idx.has(t)) idx.set(t, new Map());
        const byFile = idx.get(t);
        if (!byFile.has(file)) byFile.set(file, []);
        byFile.get(file).push({ line: i + 1, text: text.trim() });
      }
    });
  }
  return { idx, bodies };
}

const before = index(BASE);
const after = index(HEAD);

/* Which files the range actually touched, so a mention in an untouched file can be called
   untouched rather than assumed so. */
const touched = new Set(
  (HEAD === null
    ? git('diff', '--name-only', 'HEAD', '--', ...FILES)
    : git('diff', '--name-only', `${BASE}..${HEAD}`, '--', ...FILES))
    .split('\n').map((s) => s.trim()).filter(Boolean),
);

/* The lines the range changed, per file, so a surviving mention inside a touched file is still
   reported when the repair did not open that particular line. */
const changedLines = new Map();
for (const file of FILES) {
  if (!touched.has(file)) continue;
  const patch = HEAD === null
    ? git('diff', '-U0', 'HEAD', '--', file)
    : git('diff', '-U0', `${BASE}..${HEAD}`, '--', file);
  const set = new Set();
  for (const m of patch.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    for (let i = 0; i < count; i += 1) set.add(start + i);
  }
  changedLines.set(file, set);
}

/* ── what moved ───────────────────────────────────────────────────────────── */

const countIn = (side, token, file) => (side.idx.get(token)?.get(file)?.length ?? 0);

const subjects = [];
for (const token of new Set([...before.idx.keys(), ...after.idx.keys()])) {
  const moved = [];
  for (const file of FILES) {
    const b = countIn(before, token, file);
    const a = countIn(after, token, file);
    if (b !== a) moved.push({ file, before: b, after: a });
  }
  if (!moved.length) continue;

  /* Every mention that survives and that this range did not write. Those are the statements
     that agreed with the old wording and were never asked whether they agree with the new. */
  const standing = [];
  for (const [file, hits] of after.idx.get(token) ?? []) {
    const changed = changedLines.get(file);
    for (const hit of hits) {
      if (changed?.has(hit.line)) continue;
      standing.push({ file, ...hit });
    }
  }
  if (!standing.length) continue;

  /* A token the range deleted outright from a file it rewrote, still named elsewhere, is the
     shape that cost this loop the most rounds. Rank it first. */
  const removedSomewhere = moved.some((m) => m.after === 0 && m.before > 0);
  subjects.push({ token, moved, standing, removedSomewhere });
}

subjects.sort((a, b) => (Number(b.removedSomewhere) - Number(a.removedSomewhere))
  || (a.standing.length - b.standing.length)
  || a.token.localeCompare(b.token));

const CAP = has('all') ? Infinity : 12;

if (has('json')) {
  console.log(JSON.stringify({
    spec, base: BASE, head: HEAD ?? 'working tree', files: FILES.filter((f) => existsSync(join(ROOT, f))),
    touched: [...touched], subjects,
  }, null, 2));
  process.exit(0);
}

const rel = (f) => f.replace(/^specs\//, '');
console.log(`\ncoref  ${spec}  ${BASE.slice(0, 8)}..${HEAD ? HEAD.slice(0, 8) : 'working tree'}`);
console.log(`       ${touched.size} file(s) touched, ${subjects.length} subject(s) the range moved and left standing elsewhere\n`);

if (!subjects.length) {
  console.log('  nothing moved, or nothing that moved is named anywhere else.\n');
  process.exit(0);
}

for (const s of subjects) {
  const where = s.moved.map((m) => `${rel(m.file)} ${m.before}→${m.after}`).join(', ');
  console.log(`${s.removedSomewhere ? '!!' : '  '} ${s.token}`);
  console.log(`     moved: ${where}`);
  for (const hit of s.standing.slice(0, CAP)) {
    console.log(`     ${rel(hit.file)}:${hit.line}  ${hit.text.slice(0, 120)}`);
  }
  if (s.standing.length > CAP) console.log(`     … ${s.standing.length - CAP} more (--all)`);
  console.log('');
}

console.log(`${subjects.filter((s) => s.removedSomewhere).length} marked !! — the range removed the token from a file`);
console.log('and left it named in another. Answer those first.\n');
