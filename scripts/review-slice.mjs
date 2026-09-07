/**
 * What this review pass must read: everything that has changed since the last pass judged,
 * plus whatever that pass ran out of time to reach.
 *
 * The slice is computed from commits and verdicts, and from nothing else. Both are facts a
 * second party can re-derive: `git diff --name-only <sha>..HEAD` is exact, and each verdict
 * states which commit it judged and which files it did not reach. Nothing here infers what an
 * agent looked at from what it typed.
 *
 * That inference is what this replaces. Deriving coverage from a journal of tool calls means
 * matching paths against command text, and every such match is a guess: absolute Windows paths
 * do not look like repo-relative ones, a directory argument stands for the files beneath it, a
 * `grep` that names a file is not a reading of it, and a call the hook failed to record is
 * invisible. Each of those is a way to be wrong, and being wrong in the generous direction
 * lets a reviewer skip a file nobody read.
 *
 * The soundness of the scheme rests on one invariant, and it is the reviewer's to keep:
 *
 *   **every pass accounts for its whole slice** — `read` plus `unreached` equals the slice.
 *
 * Given that, induction covers the diff: pass 1 judges base..c1, pass 2 judges c1..c2 and
 * anything pass 1 left, and so on. Break it once — a pass that reports `pass` while silently
 * skipping ten files — and those files are never seen again, because the next slice starts
 * after them. So `unreached` is not a confession, it is the mechanism.
 *
 * It also depends on history being permanent. An amended or rebased commit makes the sha a
 * verdict names unreachable, and the slice cannot be computed at all.
 *
 *   node scripts/review-slice.mjs [runId] [--head <sha>] [--shape <name>] [--json]
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readConfig, stageFor } from './ship-config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = join(ROOT, '.workflow', 'runs');

const argv = process.argv.slice(2);
const TAKES_VALUE = new Set(['--head', '--shape']);
const flag = (n) => {
  const i = argv.indexOf(n);
  return i === -1 ? null : argv[i + 1];
};
const asJson = argv.includes('--json');
const positional = argv.filter((a, i) => !a.startsWith('--') && !TAKES_VALUE.has(argv[i - 1]));

const runId =
  positional[0] ??
  readdirSync(RUNS)
    .filter((d) => statSync(join(RUNS, d)).isDirectory())
    .sort()
    .pop();

const dir = join(RUNS, runId);
if (!existsSync(join(dir, 'run.json'))) {
  console.error(`no run.json under ${dir}`);
  process.exit(1);
}
const run = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));

const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

const HEAD = flag('--head') ?? git('rev-parse', 'HEAD');
const SCOPE = ['--', '.', ':(exclude).workflow'];

/* ── the verdicts so far, in order ────────────────────────────────────────── */

const stagesDir = join(dir, 'stages');
const verdicts = !existsSync(stagesDir)
  ? []
  : readdirSync(stagesDir)
      .map((f) => f.match(/^review\.attempt-(\d+)\.json$/))
      .filter(Boolean)
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b)
      .map((n) => {
        const v = JSON.parse(readFileSync(join(stagesDir, `review.attempt-${n}.json`), 'utf8'));
        return {
          attempt: n,
          status: v.status,
          reviewedUpTo: v.reviewedUpTo ?? null,
          read: v.covered?.read ?? [],
          unreached: v.covered?.unreached ?? [],
          blockers: (v.findings ?? []).filter((f) => f.severity !== 'note' && f.severity !== 'info').length,
          notes: (v.findings ?? []).filter((f) => f.severity === 'note' || f.severity === 'info').length,
        };
      });

const last = verdicts[verdicts.length - 1] ?? null;

/**
 * Where this slice begins.
 *
 * A verdict that does not name the commit it judged cannot anchor the next slice, and guessing
 * would quietly review the wrong range. Fall back to the run's base — the whole diff again,
 * which is wasteful and safe, and says so.
 */
let from = run.baseRef;
let anchor = 'the run base — this is the first pass';
if (last?.reviewedUpTo && git('cat-file', '-t', last.reviewedUpTo) === 'commit') {
  from = last.reviewedUpTo;
  anchor = `what review ${last.attempt} judged`;
} else if (last) {
  anchor = `the run base — review ${last.attempt} did not record a usable \`reviewedUpTo\`, so the whole diff is in scope again`;
}

const sizes = new Map();
for (const line of git('diff', '--numstat', `${from}..${HEAD}`, ...SCOPE).split('\n')) {
  const [a, r, p] = line.split('\t');
  if (p) sizes.set(p, (+a || 0) + (+r || 0));
}
const changed = new Set(sizes.keys());

/**
 * Files an earlier pass ran out of time to reach. The latest verdict restates the whole
 * outstanding list, so only it needs consulting.
 *
 * Entries that are not paths in the change are dropped. `unreached` is specified as a list of
 * file paths, but a verdict is written by a model and will sometimes annotate them — "…ts
 * (deleted; verified by grep)" — or name something outside the diff. Carrying those forward
 * makes the slice larger than the whole change, which is nonsense on its face and would send
 * the next pass looking for files that do not exist.
 */
const inDiff = new Set(
  git('diff', '--name-only', `${run.baseRef}..${HEAD}`, ...SCOPE)
    .split('\n')
    .filter(Boolean),
);
const carried = new Set();
const dropped = [];
for (const entry of last?.unreached ?? []) {
  if (inDiff.has(entry)) carried.add(entry);
  else dropped.push(entry);
}
for (const p of carried) if (!sizes.has(p)) sizes.set(p, sizeOf(p));

function sizeOf(path) {
  const line = git('diff', '--numstat', `${run.baseRef}..${HEAD}`, '--', path).split('\n')[0] ?? '';
  const [a, r] = line.split('\t');
  return (+a || 0) + (+r || 0);
}

const worklist = [...new Set([...changed, ...carried])]
  .map((path) => ({ path, lines: sizes.get(path) ?? 0, why: changed.has(path) ? (carried.has(path) ? 'changed since, and was unreached' : 'changed since the last pass judged') : `unreached by review ${last.attempt}` }))
  .sort((a, b) => b.lines - a.lines);

const totalLines = worklist.reduce((a, r) => a + r.lines, 0);
const wholeDiff = git('diff', '--numstat', `${run.baseRef}..${HEAD}`, ...SCOPE).split('\n').filter(Boolean).length;

const result = {
  runId,
  pass: verdicts.length + 1,
  from,
  to: HEAD,
  anchor,
  files: worklist.length,
  lines: totalLines,
  wholeDiffFiles: wholeDiff,
  worklist,
  priorVerdicts: verdicts,
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

/* The reviewer's shape is configuration, not a decision it makes each run: which shard agent
   reads the files, and how many files one of them is handed. It is printed here because the
   root runs this first, so one command hands it both the work and the shape. */
const track = run.track ?? 'spec';
const shapeName = flag('--shape') ?? run.shapes?.review ?? null;
const review = (() => {
  try { return stageFor(readConfig(ROOT), track, 'review', shapeName); }
  catch { return {}; }
})();
const shardSize = review.shardSize ?? 15;
result.profile = { track, ...review, shardSize };

console.log(`# Review slice — pass ${result.pass}`);
console.log(`# ${from.slice(0, 7)}..${HEAD.slice(0, 7)} — ${anchor}`);
console.log(`# the whole change is ${wholeDiff} files; this slice is ${worklist.length}\n`);

if (!worklist.length) {
  console.log('## Nothing has changed since the last pass judged, and it left nothing unreached.');
  console.log('Check the earlier findings against the code and write your verdict.');
} else {
  console.log(`## Read all of these — ${worklist.length} file(s), ${totalLines.toLocaleString('en-US')} changed lines\n`);
  for (const r of worklist) console.log(`  ${String(r.lines).padStart(5)}  ${r.path}\n         ${r.why}`);
}

if (verdicts.length) {
  console.log('\n## Earlier verdicts');
  for (const v of verdicts) {
    console.log(`  review ${v.attempt}: ${v.status} · judged ${(v.reviewedUpTo ?? '?').slice(0, 7)} · read ${v.read.length}, unreached ${v.unreached.length} · ${v.blockers} blockers, ${v.notes} notes`);
  }
}

console.log(`
## How to shard`);
if (review.shardAgent) {
  console.log(`Track ${track}, shape ${review.shape} — dispatch subagent_type "${review.shardAgent}"${review.shardModel ? ` on ${review.shardModel}` : ''}.`);
  console.log(`At most ${shardSize} files per shard, balanced by changed lines — ${Math.max(1, Math.ceil(worklist.length / shardSize))} shard(s) here.`);
  console.log(`Both live in .claude/ai-workflow.config.json under shipConfig.${track}.stages.review. Do not choose your own.`);
} else {
  console.log(`Track ${track}, shape ${review.shape} — this shape runs no children. Read the slice yourself.`);
}
console.log(`\n## Accounting`);
console.log(`Your verdict must set \`reviewedUpTo\` to ${HEAD.slice(0, 7)} and account for all ${worklist.length}:`);
console.log('`read` + `unreached` = the slice. A `pass` with a non-empty `unreached` is not a pass.');
