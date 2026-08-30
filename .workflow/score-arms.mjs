/**
 * Score the two review arms against ground truth.
 *
 * Ground truth is what the code at d1d436f actually does, verified by reading it rather than
 * by trusting the historical verdicts:
 *
 *   B1  no file under infra/ exists, so nothing carries the three SignWell values to the task
 *   B2  signing.service.ts opens a transaction at 317, takes FOR UPDATE at 321, and awaits
 *       the provider's applySignature at 397 — inside it
 *   B3  signwell-http-client.ts retries POST /documents up to five times with no orphan
 *       lookup between attempts
 *
 * History needed two review passes to find these three. A pass that covers the whole change
 * should find all three at once. Candidate matching is keyword-based and deliberately loose —
 * it proposes, the reader disposes, and every finding is printed in full underneath.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ARMS = [
  { name: 'E1 20f son/med', dir: 'D:/git_repos/ds-lab-e1', run: 'lab-E1' },
  { name: 'E2 10f son/med', dir: 'D:/git_repos/ds-lab-e2', run: 'lab-E2' },
  { name: 'E3 15f son/high', dir: 'D:/git_repos/ds-lab-e3', run: 'lab-E3' },
  { name: 'E4 15f son/med+sweeps', dir: 'D:/git_repos/ds-lab-e4', run: 'lab-E4' },
  { name: 'E5 +dismissal rule', dir: 'D:/git_repos/ds-lab-e5', run: 'lab-E5' },
  { name: 'E6 E5 w/ sonnet root', dir: 'D:/git_repos/ds-lab-e6', run: 'lab-E6' },
  { name: 'E7 +placement rule', dir: 'D:/git_repos/ds-lab-e7', run: 'lab-E7' },
  { name: 'E8 E7 w/ sonnet root', dir: 'D:/git_repos/ds-lab-e8', run: 'lab-E8' },
  { name: 'E9  = E7 replicated', dir: 'D:/git_repos/ds-lab-e9', run: 'lab-E9' },
  { name: 'E10 = E7, shards of 10', dir: 'D:/git_repos/ds-lab-e10', run: 'lab-E10' },
  { name: 'E11 opus/med shards', dir: 'D:/git_repos/ds-lab-e11', run: 'lab-E11' },
  { name: 'E12 opus/low shards', dir: 'D:/git_repos/ds-lab-e12', run: 'lab-E12' },
  { name: 'E13 = E11 replicated', dir: 'D:/git_repos/ds-lab-e13', run: 'lab-E13' },
  { name: 'E14 sweeps5+9 as shards', dir: 'D:/git_repos/ds-lab-e14', run: 'lab-E14' },
];

const TRUTH = [
  { id: 'B1', what: 'Infrastructure never implemented — nothing under infra/', any: [/infra/i, /terraform/i], and: [/SIGNWELL|secret|environment|task definition/i] },
  { id: 'B2', what: 'Provider call awaited inside a database transaction', any: [/signing\.service/i, /applySignature/i], and: [/transaction/i] },
  { id: 'B3', what: 'POST /documents retried with no orphan lookup between attempts', any: [/signwell-http-client/i, /createDocument|createSession/i], and: [/retr|duplicate|orphan|idempot/i] },
];

const isBlocker = (f) => f.severity !== 'note' && f.severity !== 'info';
const text = (f) => [f.rule, f.file, f.symbol, f.claim, f.witness?.detail, f.suggestedFix].filter(Boolean).join(' ');

const rows = [];
for (const arm of ARMS) {
  const stem = `${arm.dir}/.workflow/runs/${arm.run}`;
  const vPath = `${stem}/review.verdict.json`;
  if (!existsSync(vPath)) {
    console.log(`${arm.name}: no verdict yet`);
    continue;
  }
  const v = JSON.parse(readFileSync(vPath, 'utf8'));
  let log = null;
  for (const n of [3, 2, 1]) {
    const p = `${stem}/stages/review.attempt-${n}.log`;
    if (existsSync(p)) {
      try {
        log = JSON.parse(readFileSync(p, 'utf8'));
      } catch {
        /* ignore */
      }
      break;
    }
  }
  /* The runner's own stopwatch, not the log's `duration_ms`. For a sharded run the root takes
     almost no turns of its own and the log reports a fraction of the wall clock — 162s against
     a measured 705s in one case. `duration_api_ms` is no better: it sums parallel subagents and
     exceeds the wall clock. */
  let wall = null;
  const exitPath = `${stem}/stages/review.attempt-1.exit.json`;
  if (existsSync(exitPath)) wall = JSON.parse(readFileSync(exitPath, 'utf8')).seconds;
  const findings = v.findings ?? [];
  const c = v.covered ?? {};
  const accounted = (c.read ?? []).length + (c.settled ?? []).length + (c.unreached ?? []).length;
  const total = c.of ?? c.slice ?? null;

  const hits = TRUTH.map((t) => {
    const match = findings.find((f) => {
      const s = text(f);
      return t.any.some((re) => re.test(s)) && t.and.every((re) => re.test(s));
    });
    return { id: t.id, found: !!match, as: match ? `${match.id}/${match.severity}/${match.target}` : null };
  });

  rows.push({ arm: arm.name, v, log, wall, findings, c, accounted, total, hits });
}

const pad = (s, n) => String(s).padEnd(n);
console.log('\n' + pad('arm', 22) + pad('verdict', 10) + pad('blockers', 10) + pad('notes', 7) + pad('accounted', 12) + pad('time', 8) + pad('cost', 9) + 'turns');
for (const r of rows) {
  console.log(
    pad(r.arm, 22) +
      pad(r.v.status, 10) +
      pad(r.findings.filter(isBlocker).length, 10) +
      pad(r.findings.filter((f) => !isBlocker(f)).length, 7) +
      pad(`${r.accounted}/${r.total ?? '?'}`, 12) +
      pad(r.wall ? `${r.wall}s` : r.log ? `${Math.round(r.log.duration_ms / 1000)}s` : '?', 8) +
      pad(r.log ? `$${r.log.total_cost_usd.toFixed(2)}` : '?', 9) +
      (r.log ? r.log.num_turns : '?'),
  );
}

console.log('\nground truth — three defects the code at d1d436f really has:');
for (const t of TRUTH) {
  const line = rows.map((r) => {
    const h = r.hits.find((x) => x.id === t.id);
    return `${r.arm.split(' ')[0]}: ${h.found ? `FOUND ${h.as}` : 'missed'}`;
  });
  console.log(`  ${t.id}  ${t.what}`);
  console.log(`      ${line.join('   |   ')}`);
}

for (const r of rows) {
  console.log(`\n===== ${r.arm} — every finding`);
  if (r.v.reviewedUpTo) console.log(`reviewedUpTo: ${r.v.reviewedUpTo.slice(0, 10)}`);
  for (const f of r.findings) {
    console.log(`  ${isBlocker(f) ? 'BLOCK' : 'note '} ${f.id} -> ${f.target}  ${f.file ?? ''}#${f.symbol ?? ''}`);
    console.log(`        ${(f.claim ?? '').replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  if ((r.c.unreached ?? []).length) console.log(`  unreached: ${r.c.unreached.length} — ${r.c.unreached.slice(0, 5).join(', ')}`);
}
