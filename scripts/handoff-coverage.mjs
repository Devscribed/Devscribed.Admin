#!/usr/bin/env node
/**
 * handoff-coverage — does the plan account for the whole spec?
 *
 * A plan that quietly drops the hard part is invisible downstream: every later stage judges
 * the diff against the plan, so work the plan never mentioned is work nobody misses. The three
 * things a spec can lose this way:
 *
 *   1. A numbered requirement assigned to no task.
 *   2. A live `TC-*` claimed by no task. A case whose body opens `- **Retired.**` is not live.
 *   3. A whole `##` section. This is the one a requirement-and-case check cannot see, because
 *      a section such as Infrastructure carries neither — which is exactly how one goes
 *      missing without a single finding anywhere.
 *
 * Section coverage is answered by the plan, never guessed from it: `sections` maps every `##`
 * heading to the task that covers it or to a reason it needs none. Matching headings to task
 * prose would be a check that passes when the wording is lucky.
 *
 * Usage:
 *   node scripts/handoff-coverage.mjs [--run <id>] [--out <file>] [--json]
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

const fail = (m) => { process.stderr.write(`handoff-coverage: ${m}\n`); process.exit(1); };

const runId = opt('run') ?? (() => {
  const cur = join(ROOT, '.workflow/current');
  return existsSync(cur) ? readFileSync(cur, 'utf8').trim() : null;
})();
if (!runId) fail('no active run — start one with `wf init --spec <path>` or pass --run <id>');

const runDir = join(ROOT, '.workflow/runs', runId);
const runJson = join(runDir, 'run.json');
if (!existsSync(runJson)) fail(`no run.json for ${runId}`);
const run = JSON.parse(readFileSync(runJson, 'utf8'));

const handoffPath = join(runDir, 'handoff.json');
if (!existsSync(handoffPath)) fail('no handoff.json — nothing to check yet');
const handoff = JSON.parse(readFileSync(handoffPath, 'utf8'));

const specPath = join(ROOT, run.spec);
if (!existsSync(specPath)) fail(`spec not found: ${run.spec}`);
const spec = readFileSync(specPath, 'utf8');

const findings = [];
let seq = 0;
const add = (f) => findings.push({ id: `H${++seq}`, severity: 'blocker', target: 'handoff', ...f });

/* Split on the heading marker rather than matching to it: a multiline `$` ends at the first
   newline, so an end-of-section lookahead written that way captures nothing at all. */
const blocks = `\n${spec}`.split('\n## ');
const section = (heading) => {
  const b = blocks.find((x) => x.startsWith(heading));
  return b ? b.slice(b.indexOf('\n') + 1) : '';
};

const tasks = handoff.tasks ?? [];

/* ── 1. every numbered requirement ───────────────────────────────────────── */

const required = [...section('Functional Requirements').matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
const planned = new Set(tasks.flatMap((t) => t.requirements ?? []).map(Number));
const missingReqs = required.filter((n) => !planned.has(n));

if (missingReqs.length) {
  add({
    rule: 'handoff/requirement-unassigned',
    file: run.spec,
    symbol: `req-${missingReqs[0]}`,
    claim: `${missingReqs.length} numbered requirement(s) are assigned to no task: ${missingReqs.join(', ')}`,
    witness: { kind: 'rule', detail: `The spec numbers ${required.length} requirements. The plan's tasks name ${planned.size}. Unassigned: ${missingReqs.join(', ')}.`, source: run.spec },
    suggestedFix: 'assign each to a task, or raise a spec finding if it cannot be planned — never drop it silently',
  });
}

/* ── 2. every live test case ─────────────────────────────────────────────── */

const cases = [...spec.matchAll(/^### (TC-[A-Z0-9-]+)[: \n]([\s\S]*?)(?=\n### |\n## |$)/gm)];
const live = cases.filter(([, , body]) => !/^\s*-\s+\*\*Retired\.\*\*/m.test(body)).map(([, id]) => id);
const claimed = new Set(Object.values(handoff.testCases ?? {}).flat());
const missingCases = live.filter((id) => !claimed.has(id));

if (missingCases.length) {
  add({
    rule: 'handoff/case-unclaimed',
    file: run.spec,
    symbol: missingCases[0],
    claim: `${missingCases.length} live test case(s) are claimed by no task: ${missingCases.slice(0, 8).join(', ')}${missingCases.length > 8 ? ' …' : ''}`,
    witness: { kind: 'rule', detail: `The spec defines ${cases.length} cases, ${live.length} of them live. The plan claims ${claimed.size}.`, source: run.spec },
    suggestedFix: 'list each live case under testCases, or retire it in the spec with a note naming what covers the rule now',
  });
}

/* ── 3. every section ────────────────────────────────────────────────────── */

const headings = blocks.slice(1).map((b) => b.slice(0, b.indexOf('\n')).trim()).filter(Boolean);
const accounted = handoff.sections ?? {};
const unaccounted = headings.filter((h) => !accounted[h]);

if (unaccounted.length) {
  add({
    rule: 'handoff/section-unaccounted',
    file: run.spec,
    symbol: unaccounted[0],
    claim: `${unaccounted.length} spec section(s) are neither assigned to a task nor explained: ${unaccounted.join(', ')}`,
    witness: { kind: 'rule', detail: 'handoff.sections must name, for every "##" heading in the spec, the task that covers it or the reason it needs none. A section carrying no numbered requirement and no case is invisible to every other check.', source: run.spec },
    suggestedFix: 'add an entry per heading to handoff.sections — a task id, or a sentence saying why nothing is planned for it',
  });
}

/* ── verdict ─────────────────────────────────────────────────────────────── */

const verdict = { stage: 'handoff_coverage', status: findings.length ? 'blocked' : 'pass', spec: run.spec, findings };

if (opt('out')) writeFileSync(resolve(ROOT, opt('out')), `${JSON.stringify(verdict, null, 2)}\n`);

if (argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
} else {
  process.stdout.write(`handoff-coverage: ${verdict.status}  (${run.spec})\n`);
  process.stdout.write(`  requirements ${required.length - missingReqs.length}/${required.length}`);
  process.stdout.write(`  cases ${live.length - missingCases.length}/${live.length}`);
  process.stdout.write(`  sections ${headings.length - unaccounted.length}/${headings.length}\n`);
  for (const f of findings) process.stdout.write(`  ${f.rule}\n    ${f.claim}\n`);
}

process.exit(findings.length ? 2 : 0);
