#!/usr/bin/env node
/**
 * static-gate — two rules, and only two.
 *
 * The gate exists for one narrow reason: the reviewer is a model, and there are two changes
 * it might not notice in a large diff that would let a bad run *pass*. Everything else a
 * checklist could enforce is left to the reviewer, because a wrong reviewer costs a note or
 * an appeal, while a wrong pass costs a merge.
 *
 *   1. The implementation may not edit the specification it is being checked against.
 *   2. The implementation may not weaken the checks that judge it.
 *
 * Both read `git diff` directly. There is no file walker, no symbol parser and no bespoke
 * copy of a lint rule — design-system token rules already exist as oxlint config in
 * `1_DS for dev/_adherence.oxlintrc.json`, and reimplementing them here would be a second
 * source of truth that drifts.
 *
 * Output is a verdict in the schema the agents use, so `wf verdict` routes it identically.
 *
 * Usage:
 *   node scripts/static-gate.mjs [--base <ref>] [--out <file>] [--json]
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });

const run = (() => {
  const cur = join(ROOT, '.workflow/current');
  if (!existsSync(cur)) return null;
  const p = join(ROOT, '.workflow/runs', readFileSync(cur, 'utf8').trim(), 'run.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
})();

const base = opt('base') ?? run?.baseRef;
/* Rule 1 asks a different question from the other rules. They ask "what is in the change" and
   want the whole diff; it asks "did the implementation stage edit its own contract" and wants
   only what this run produced. Those differ the moment a run starts with `--from`, because the
   diff then contains commits made before the run — including the deliberate, human spec fix
   that a halt asked for. Judging that by the diff accused the implementer of an edit it had
   not made and, worse, told it to revert one. */
const runStart = run?.headAtInit ?? base;
if (!base) {
  process.stderr.write('static-gate: no diff base — start a run or pass --base <ref>\n');
  process.exit(1);
}

const findings = [];
let seq = 0;
const add = (f) => findings.push({ id: `S${++seq}`, severity: 'blocker', target: 'code', ...f });

const isTest = (p) => /\.(spec|test)\.(ts|tsx|js|mjs)$/.test(p);
const isSource = (p) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(p);

/* ── 1. the contract is not the implementation's to edit ─────────────────── */

for (const file of git('diff', '--name-only', runStart, '--', 'specs').split('\n').filter(Boolean)) {
  add({
    rule: 'pipeline/spec-immutable',
    file,
    claim: 'the implementation stage modified a specification file',
    witness: {
      kind: 'rule',
      detail: 'CLAUDE.md: "When behaviour and spec disagree, the spec wins — change the spec first, deliberately." A run that edits its own contract can no longer be checked against it.',
      source: 'CLAUDE.md',
    },
    suggestedFix: 'revert the spec edit and raise a finding with target "spec" instead — that halts the run for a human, which is the intended path',
  });
}

/* ── 2. the checks are not the implementation's to weaken ────────────────── */

const SUPPRESSIONS = [
  [/\.(skip|only)\s*\(/, 'a skipped or focused test', true],
  [/@ts-ignore|@ts-expect-error/, 'a suppressed type error', false],
  [/\bas\s+any\b/, 'an `as any` cast', false],
  [/eslint-disable/, 'a disabled lint rule', false],
];

/* Split on the header rather than on "\ndiff --git ": the first chunk has no leading
   newline, so a naive split leaves its header attached and the first file of every diff
   gets parsed as "diff". That bug hid rule 2 entirely the first time this ran. */
for (const chunk of git('diff', '-U0', base, '--', 'apps', 'packages', 'e2e').split(/^diff --git /m)) {
  const file = chunk.match(/^a\/(\S+)/)?.[1];
  if (!file || !isSource(file)) continue;

  for (const line of chunk.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    for (const [re, what, testsOnly] of SUPPRESSIONS) {
      if (!re.test(line) || (testsOnly && !isTest(file))) continue;
      add({
        rule: 'pipeline/no-detector-weakening',
        file,
        claim: `${what} was added`,
        witness: {
          kind: 'rule',
          detail: `The diff adds ${what}:\n    ${line.slice(1).trim()}\nA change that makes the checks weaker passes the gate without making the code correct.`,
          source: 'CLAUDE.md',
        },
        suggestedFix: 'fix the underlying defect, or contest this finding with the reason the suppression is correct here',
      });
    }
  }

  if (!isTest(file)) continue;

  /* An assertion that was commented out is still gone. Counting the "+ // await expect(…)"
     line as an added assertion made removed == added and hid the simplest weakening there
     is — so a commented assertion is its own finding and never counts towards the total. */
  const isAssertion = (l) => /\b(expect|assert)\s*\(/.test(l);
  const isCommented = (l) => /^[+-]\s*(\/\/|\/\*|\*(?!\/))/.test(l);
  const lines = chunk.split('\n');

  for (const l of lines) {
    if (!l.startsWith('+') || l.startsWith('+++') || !isAssertion(l) || !isCommented(l)) continue;
    add({
      rule: 'pipeline/no-detector-weakening',
      file,
      claim: 'an assertion was commented out',
      witness: {
        kind: 'rule',
        detail: `The diff comments out an assertion:\n    ${l.slice(1).trim()}\nThe test still runs and still passes, and it no longer checks anything.`,
        source: 'CLAUDE.md',
      },
      suggestedFix: 'restore the assertion, or contest with the reason it is now wrong',
    });
  }

  const count = (sign) => lines.filter(
    (l) => l.startsWith(sign) && !l.startsWith(`${sign}${sign}${sign}`) && isAssertion(l) && !isCommented(l),
  ).length;
  const removed = count('-');
  const added = count('+');
  if (removed > added) {
    add({
      rule: 'pipeline/no-detector-weakening',
      file,
      claim: `${removed - added} more assertion(s) removed than added`,
      witness: {
        kind: 'rule',
        detail: `The diff removes ${removed} assertion(s) and adds ${added} in a test file. Net-negative assertions in a change meant to add behaviour is the signature of fixing the test instead of the code.`,
        source: 'CLAUDE.md',
      },
      suggestedFix: 'restore the assertions, or contest with the reason each removed one is now wrong',
    });
  }
}

/* ── verdict ─────────────────────────────────────────────────────────────── */

const verdict = {
  stage: 'static_gate',
  status: findings.length ? 'blocked' : 'pass',
  base,
  findings,
};

if (opt('out')) writeFileSync(resolve(ROOT, opt('out')), `${JSON.stringify(verdict, null, 2)}\n`);

if (argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
} else {
  process.stdout.write(`static-gate: ${verdict.status}  (diff against ${base.slice(0, 8)})\n`);
  for (const f of findings) process.stdout.write(`  [${f.target}] ${f.rule}\n    ${f.file}\n    ${f.claim}\n`);
}

process.exit(findings.length ? 2 : 0);
