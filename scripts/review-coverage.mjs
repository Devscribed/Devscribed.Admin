/**
 * Which files of a diff a reviewer has actually opened, and which it has never touched.
 *
 * A review that blocks sends work back, and the next review starts from nothing and reads
 * whatever it happens to read. Measured on the first run of spec 04: review 1 named 22 of
 * the diff's 65 files, review 2 named 44 — and the two blockers review 2 raised were in a
 * file review 1 had never opened. Ten files, the migration among them, were never opened by
 * any of the four reviews. "Passed a review" and "was reviewed" are not the same claim, and
 * without this ledger nothing in the pipeline could tell them apart.
 *
 * Coverage is derived from the journal rather than self-reported: a file counts as opened
 * when a review's own tool call named its path. That cannot be inflated by a verdict which
 * claims more than it did, and it errs downward — a file read as part of a whole-diff dump
 * counts as unopened, which sends the next reviewer back to it. Under-crediting is the safe
 * direction here.
 *
 * The diff is measured against the working tree's current HEAD, which is what a review needs
 * while its run is live. Pointed at a finished run whose branch has moved on it will report
 * that run's base against today's code, which is a different question and not a useful one.
 *
 *   node scripts/review-coverage.mjs [runId] [--json]
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = join(ROOT, '.workflow', 'runs');

const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return '';
  }
};

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const runId =
  args.find((a) => !a.startsWith('--')) ??
  readdirSync(RUNS)
    .filter((d) => statSync(join(RUNS, d)).isDirectory())
    .sort()
    .pop();

const dir = join(RUNS, runId);
const run = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));

/** Every file the diff touches, with how much of it there is to read. */
const sizes = new Map();
/* The same scope the review prompt uses. The run's own verdicts and digests are committed,
   so they land in the diff — but they are the pipeline's record of the work, not the work,
   and a ledger that ranks them by size sends a reviewer to read 8,000 lines of its own JSON. */
for (const line of git('diff', '--numstat', `${run.baseRef}...HEAD`, '--', '.', ':(exclude).workflow').trim().split('\n')) {
  const [added, removed, path] = line.split('\t');
  if (!path) continue;
  sizes.set(path, (Number(added) || 0) + (Number(removed) || 0));
}

const journalPath = join(dir, 'events.jsonl');
const journal = existsSync(journalPath)
  ? readFileSync(journalPath, 'utf8')
      .trim()
      .split('\n')
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
  : [];

/**
 * Review tool calls split into attempts. A gap over three minutes is always a boundary —
 * a verdict gets written and the router runs in between, and no agent pauses that long
 * mid-attempt.
 */

/**
 * The journal records every tool call made while a run holds the lock — including the
 * operator's own, from the session driving the pipeline. Those are not the run's work and
 * must not be counted as it: in the two runs of spec 04 they were 6% and 12% of all calls.
 * For coverage they would be worse than noise, since an operator grepping a file would be
 * credited to a review that never opened it.
 *
 * An agent's calls carry `agentType`, but not from the very first event of an invocation, so
 * the discriminator is the session rather than the field: any session that ever announces an
 * agent is an agent's, and everything else belongs to whoever started the run.
 */
function agentEventsOnly(events) {
  const agentSessions = new Set(events.filter((e) => e.agentType).map((e) => e.sessionId));
  return events.filter((e) => agentSessions.has(e.sessionId));
}

const openedIn = new Map(); // path -> Set(attempt)
let attempt = 0;
let last = null;
for (const e of agentEventsOnly(journal.filter((e) => e.stage === 'review' && e.event === 'tool'))) {
  if (!last || new Date(e.ts) - new Date(last) > 180_000) attempt++;
  last = e.ts;

  const i = e.input ?? {};
  const text = [i.file_path, i.command, i.path, i.pattern, i.glob].filter(Boolean).join(' ');
  if (!text) continue;
  for (const path of sizes.keys()) {
    if (text.includes(path)) {
      if (!openedIn.has(path)) openedIn.set(path, new Set());
      openedIn.get(path).add(attempt);
    }
  }
}

const rows = [...sizes.entries()]
  .map(([path, lines]) => ({
    path,
    lines,
    attempts: [...(openedIn.get(path) ?? [])].sort((a, b) => a - b),
  }))
  .sort((a, b) => a.attempts.length - b.attempts.length || b.lines - a.lines);

const unopened = rows.filter((r) => !r.attempts.length);

if (asJson) {
  console.log(JSON.stringify({ runId, reviews: attempt, files: rows.length, unopened: unopened.length, rows }, null, 2));
} else {
  console.log(`# Review coverage — ${rows.length} files in the diff, ${attempt} review pass(es) so far\n`);
  if (unopened.length) {
    console.log(`## Never opened by any review — ${unopened.length} file(s), largest first`);
    console.log('These are the diff this run has not reviewed. Start here.\n');
    for (const r of unopened) console.log(`  ${String(r.lines).padStart(5)}  ${r.path}`);
  } else {
    console.log('## Every file in the diff has been opened by at least one review.');
  }
  const opened = rows.filter((r) => r.attempts.length);
  if (opened.length) {
    console.log(`\n## Already opened — ${opened.length} file(s)`);
    console.log('Judged in the review pass(es) named. Do not re-derive these unless the');
    console.log('incremental diff since that pass touches them.\n');
    for (const r of opened) {
      console.log(`  ${String(r.lines).padStart(5)}  ${r.path}  (review ${r.attempts.join(', ')})`);
    }
  }
}
