#!/usr/bin/env node
/**
 * static-gate — the deterministic gate between Implement and Code Review.
 *
 * Everything here is mechanical: a regex, a path comparison, a set difference. None of it
 * is judgement. That is the whole point — the rules it enforces are the ones a reviewer
 * would otherwise spend attention on, and a script gives the same verdict on the same
 * diff every time.
 *
 * Every rule cites the line of CLAUDE.md, the spec, or `1_DS for dev/_adherence.oxlintrc.json`
 * that it enforces. A rule that cannot cite its source is a rule nobody agreed to, so the
 * gate reports it as a defect in itself (`target: "self"`) rather than blaming the code.
 *
 * Output is a verdict in the same schema the agents produce, so `wf verdict` routes it
 * identically:
 *
 *   { status, findings: [ { id, target, severity, rule, file, symbol, line, claim,
 *                           witness: { kind, detail, source }, suggestedFix } ] }
 *
 * Usage:
 *   node scripts/static-gate.mjs                 # diff against the active run's base
 *   node scripts/static-gate.mjs --all           # scan the whole tree, ignore the diff
 *   node scripts/static-gate.mjs --out <file>    # also write the verdict as JSON
 *   node scripts/static-gate.mjs --base <ref>    # override the diff base
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const readIf = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null);

const findings = [];
let seq = 0;
const add = (f) => findings.push({ id: `S${++seq}`, severity: 'blocker', target: 'code', ...f });

/* ── where raw values are legitimate ─────────────────────────────────────── */

/**
 * The design system's token files are where colours and sizes are *defined*; forbidding
 * literals there would forbid the design system from existing. Everywhere else consumes
 * them through var(). This split is the DS's own rule, not one invented here.
 */
const RAW_VALUE_ALLOWED = [
  /^1_DS for dev\/tokens\//,
  /^1_DS for dev\/styles\.css$/,
  /^1_DS for dev\/_ds_bundle\.js$/,
  /^1_DS for dev\/_ds_manifest\.json$/,
  /^1_DS for dev\/(scraps|templates|uploads)\//,
  /\.card\.html$/,
  /\.mock\.html$/,
  /\.prompt\.md$/,
];

const STYLED_SOURCE = [/^apps\/web\/src\/.*\.(tsx|ts)$/, /^1_DS for dev\/components\/.*\.jsx$/];

const isTestFile = (p) => /\.(spec|test)\.(ts|tsx|js|mjs)$/.test(p);

/**
 * Only real source is scanned for suppressions. Specs quote `as any` in their code samples
 * and mock HTML quotes anything at all; flagging those was this gate's first false positive,
 * and a gate that cries wolf about documentation is a gate people switch off.
 */
const isSource = (p) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(p) && !/^1_DS for dev\/(scraps|templates|uploads)\//.test(p);

/* ── file set under inspection ───────────────────────────────────────────── */

function activeRun() {
  const cur = join(ROOT, '.workflow/current');
  if (!existsSync(cur)) return null;
  const id = readFileSync(cur, 'utf8').trim();
  const p = join(ROOT, '.workflow/runs', id, 'run.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

const run = activeRun();
const base = opt('base') ?? run?.baseRef;

function changedFiles() {
  if (flag('all') || !base) {
    return git('ls-files').split('\n').filter(Boolean);
  }
  const committed = git('diff', '--name-only', `${base}...HEAD`).split('\n');
  const working = git('status', '--porcelain').split('\n')
    .filter(Boolean).map((l) => l.slice(3).trim());
  return [...new Set([...committed, ...working])].filter(Boolean);
}

const files = changedFiles().filter((f) => existsSync(join(ROOT, f)));

/** Nearest enclosing named declaration, so a finding survives edits above it. */
function symbolAt(lines, idx) {
  for (let i = idx; i >= 0; i--) {
    const m = lines[i].match(
      /^\s*(?:export\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)|^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=|^([.#:@a-zA-Z][^{};]*)\{\s*$/,
    );
    if (m) return (m[1] ?? m[2] ?? m[3] ?? '').trim() || null;
  }
  return null;
}

function eachLine(file, fn) {
  const text = readIf(file);
  if (text === null) return;
  const lines = text.split('\n');
  lines.forEach((line, i) => fn(line, i + 1, lines, i));
}

/* ── rules ───────────────────────────────────────────────────────────────── */

/** R1 — the implementer may not edit the spec. The spec is the contract being checked. */
function ruleSpecUntouched() {
  for (const f of files) {
    if (!/^specs\//.test(f)) continue;
    if (flag('all')) continue; // scanning the tree is not a diff
    add({
      rule: 'pipeline/spec-immutable',
      file: f,
      claim: 'the implementation stage modified a specification file',
      witness: {
        kind: 'rule',
        detail: 'CLAUDE.md: "When behaviour and spec disagree, the spec wins — change the spec first, deliberately." A run that edits its own contract cannot be checked against it.',
        source: 'CLAUDE.md:5',
      },
      suggestedFix: 'revert the spec change and raise a finding with target "spec" instead',
    });
  }
}

/** R2 — Goodhart guard. Weakening the detector must never be a way to pass. */
function ruleTestWeakening() {
  const patterns = [
    [/\.(skip|only)\s*\(/, 'a skipped or focused test'],
    [/@ts-ignore|@ts-expect-error/, 'a suppressed type error'],
    [/\bas\s+any\b/, 'an `as any` cast'],
    [/eslint-disable/, 'a disabled lint rule'],
  ];
  /* In --all mode nothing was "introduced" — the tree is simply being surveyed. Reporting
     pre-existing suppressions as blockers there would block every run on day one. */
  const surveying = flag('all') || !base;
  const verb = surveying ? 'is present' : 'was introduced';

  for (const f of files) {
    if (!isSource(f)) continue;
    eachLine(f, (line, n, lines, i) => {
      for (const [re, what] of patterns) {
        if (!re.test(line)) continue;
        if (!isTestFile(f) && what === 'a skipped or focused test') continue;
        add({
          rule: 'pipeline/no-detector-weakening',
          file: f,
          line: n,
          symbol: symbolAt(lines, i),
          claim: `${what} ${verb}`,
          witness: {
            kind: 'rule',
            detail: `Line ${n}: ${what}. A change that makes the checks weaker passes the gate without making the code correct, so it blocks regardless of any verdict.`,
            source: 'CLAUDE.md:59',
          },
          suggestedFix: 'fix the underlying defect, or contest this finding with a counter-witness',
        });
      }
    });
  }

  if (flag('all') || !base) return;
  /* Deleted assertions are invisible to a line scan of the new file, so read the diff. */
  const diff = git('diff', '-U0', `${base}...HEAD`, '--', 'e2e', 'apps', 'packages');
  for (const hunk of diff.split('\ndiff --git ')) {
    const file = hunk.match(/^a\/(\S+)/m)?.[1] ?? hunk.match(/\+\+\+ b\/(\S+)/)?.[1];
    if (!file || !isTestFile(file)) continue;
    const removedAsserts = (hunk.match(/^-.*\b(expect|assert)\s*\(/gm) ?? []).length;
    const addedAsserts = (hunk.match(/^\+.*\b(expect|assert)\s*\(/gm) ?? []).length;
    if (removedAsserts > addedAsserts) {
      add({
        rule: 'pipeline/no-detector-weakening',
        file,
        symbol: null,
        claim: `${removedAsserts - addedAsserts} more assertion(s) removed than added`,
        witness: {
          kind: 'rule',
          detail: `The diff removes ${removedAsserts} assertion(s) and adds ${addedAsserts} in a test file. Net-negative assertions in a change meant to add behaviour is the signature of fixing the test instead of the code.`,
          source: 'CLAUDE.md:59',
        },
        suggestedFix: 'restore the assertions, or contest with the reason each one is now wrong',
      });
    }
  }
}

/** R3/R4 — design tokens. The DS declares these rules itself; this enforces them on the diff. */
function ruleDesignTokens() {
  const adherence = readIf('1_DS for dev/_adherence.oxlintrc.json');
  if (!adherence) {
    add({
      target: 'self',
      rule: 'gate/missing-source',
      file: 'scripts/static-gate.mjs',
      claim: 'the design-token rules cannot cite their source',
      witness: {
        kind: 'rule',
        detail: '1_DS for dev/_adherence.oxlintrc.json is missing, so the token rules below would enforce something nobody declared.',
        source: 'scripts/static-gate.mjs',
      },
      suggestedFix: 'restore the adherence config or remove the token rules from the gate',
    });
    return;
  }

  for (const f of files) {
    if (!STYLED_SOURCE.some((re) => re.test(f))) continue;
    if (RAW_VALUE_ALLOWED.some((re) => re.test(f))) continue;

    eachLine(f, (line, n, lines, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;

      const colour = line.match(/#[0-9a-fA-F]{3,8}\b|oklch\([^)]*\)|rgba?\([^)]*\)|hsla?\([^)]*\)/);
      if (colour) {
        add({
          rule: 'ds/no-raw-colour',
          file: f,
          line: n,
          symbol: symbolAt(lines, i),
          claim: `raw colour \`${colour[0]}\` outside the token layer`,
          witness: {
            kind: 'rule',
            detail: `Line ${n} contains the literal ${colour[0]}. The design system declares this exact rule: "Raw hex color — use a design-system color token via var()." Colours live in 1_DS for dev/tokens/, everywhere else reads them through var().`,
            source: '1_DS for dev/_adherence.oxlintrc.json (no-restricted-syntax)',
          },
          suggestedFix: 'use an existing token, or add one to 1_DS for dev/tokens/colors.css and record it in the spec\'s DS gaps table',
        });
      }

      const size = line.match(/(?<![\w-])\d+px(?![\w-])/);
      if (size && !/\bvar\(/.test(line)) {
        add({
          rule: 'ds/no-raw-size',
          file: f,
          line: n,
          symbol: symbolAt(lines, i),
          claim: `raw size \`${size[0]}\` outside the token layer`,
          witness: {
            kind: 'rule',
            detail: `Line ${n} contains the literal ${size[0]}. The design system declares: "Raw px value — use a design-system spacing token via var()."`,
            source: '1_DS for dev/_adherence.oxlintrc.json (no-restricted-syntax)',
          },
          suggestedFix: 'use a --sp-* or --fs-* token',
        });
      }
    });
  }
}

/** R5/R6 — migrations. Deploy rolls services out before migrate deploy, so additive is load-bearing. */
function ruleMigrations() {
  const dir = 'apps/api/prisma/migrations';
  const baseline = run?.preflight?.migrations ?? null;
  const touched = files.filter((f) => f.startsWith(`${dir}/`) && f.endsWith('.sql'));
  const newDirs = [...new Set(touched.map((f) => f.split('/')[4]))]
    .filter((d) => !baseline || !baseline.includes(d));

  if (baseline && newDirs.length > 1) {
    add({
      rule: 'pipeline/one-migration-per-run',
      file: `${dir}/`,
      claim: `${newDirs.length} new migrations in one run: ${newDirs.join(', ')}`,
      witness: {
        kind: 'rule',
        detail: `Preflight recorded ${baseline.length} migrations; the diff adds ${newDirs.length}. Migrations are additive and therefore permanent, so a retry that adds a second one leaves the failed attempt in the schema forever.`,
        source: 'CLAUDE.md:76',
      },
      suggestedFix: 'replace the migration this run already created instead of adding another',
    });
  }

  for (const f of touched) {
    eachLine(f, (line, n, lines, i) => {
      const m = line.match(/\b(DROP\s+(TABLE|COLUMN)|ALTER\s+COLUMN[^;]*SET\s+NOT\s+NULL|RENAME\s+(TO|COLUMN))\b/i);
      if (!m) return;
      add({
        rule: 'db/additive-migrations-only',
        file: f,
        line: n,
        symbol: symbolAt(lines, i),
        claim: `non-additive statement \`${m[0].replace(/\s+/g, ' ')}\``,
        witness: {
          kind: 'rule',
          detail: `Line ${n} is not additive. \`make deploy-<env>\` rolls the services out and *then* runs \`prisma migrate deploy\`, so the new code serves traffic before the schema changes — safe only while migrations add. This statement breaks the running deployment.`,
          source: 'CLAUDE.md:76',
        },
        suggestedFix: 'add a new nullable column or table instead; drops belong to a later, separate release',
      });
    });
  }
}

/** R7 — the diff stays inside the plan. Scope creep is what turns one finding into ten. */
function ruleScopeCreep() {
  if (flag('all') || !run) return;
  const hp = join(ROOT, '.workflow/runs', run.runId, 'handoff.json');
  if (!existsSync(hp)) return;
  const handoff = JSON.parse(readFileSync(hp, 'utf8'));
  const globs = (handoff.tasks ?? []).flatMap((t) => t.files ?? []);
  if (!globs.length) return;

  const toRe = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, ' ').replace(/\*/g, '[^/]*').replace(/ /g, '.*')}$`);
  const allowed = globs.map(toRe);

  for (const f of files) {
    if (f.startsWith('.workflow/')) continue;
    if (allowed.some((re) => re.test(f))) continue;
    add({
      rule: 'pipeline/stay-in-plan',
      file: f,
      claim: 'file changed but not listed in the handoff',
      witness: {
        kind: 'rule',
        detail: `The handoff lists ${globs.length} path pattern(s) and ${f} matches none. Edits outside the plan grow the blast radius the reviewer has to cover, which is how one finding becomes ten.`,
        source: `.workflow/runs/${run.runId}/handoff.json`,
      },
      suggestedFix: 'revert the change, or amend the handoff and say why in the stage report',
    });
  }
}

/** R8 — the data-testid list in the spec is a contract in both directions. */
function ruleTestidContract() {
  if (!run?.spec) return;
  const spec = readIf(run.spec);
  if (!spec) return;

  const section = spec.split(/^##\s+Required data-testid Attributes\s*$/m)[1];
  if (!section) return;
  const declared = [...new Set([...section.split(/^##\s/m)[0].matchAll(/`([a-z0-9][a-z0-9-]{2,})`/g)].map((m) => m[1]))];
  if (!declared.length) return;

  const web = git('grep', '-rhoI', '--', 'data-testid', 'apps/web/src').length ? git('grep', '-rhI', 'data-testid', '--', 'apps/web/src') : '';
  const e2e = existsSync(join(ROOT, 'e2e/tests')) ? git('grep', '-rhI', '', '--', 'e2e/tests') : '';

  for (const id of declared) {
    const inWeb = web.includes(id);
    const inE2e = e2e.includes(id);
    if (inWeb && inE2e) continue;
    const missing = [!inWeb && 'apps/web/src', !inE2e && 'e2e/tests'].filter(Boolean).join(' and ');
    add({
      rule: 'spec/testid-contract',
      file: run.spec,
      symbol: id,
      claim: `data-testid "${id}" is declared in the spec but absent from ${missing}`,
      witness: {
        kind: 'rule',
        detail: `The spec's "Required data-testid Attributes" section lists "${id}". Every id there must appear in the UI and in an E2E case, and vice versa — a selector that exists in only one of the three has already drifted.`,
        source: `${run.spec} (Required data-testid Attributes)`,
      },
      suggestedFix: `add data-testid="${id}" to the component and reference it from the E2E case that owns it`,
    });
  }
}

/* ── run ─────────────────────────────────────────────────────────────────── */

ruleSpecUntouched();
ruleTestWeakening();
ruleDesignTokens();
ruleMigrations();
ruleScopeCreep();
ruleTestidContract();

/* A survey is not a verdict. `--all` reports what is in the tree so a human can read it;
   blocking on pre-existing debt would stop every run on day one over code nobody touched. */
if (flag('all')) for (const f of findings) f.severity = 'note';

const blockers = findings.filter((f) => f.severity === 'blocker');
const verdict = {
  stage: 'static_gate',
  status: blockers.length ? 'blocked' : 'pass',
  scanned: files.length,
  mode: flag('all') ? 'whole-tree' : `diff against ${base ?? 'HEAD'}`,
  findings,
};

if (opt('out')) writeFileSync(resolve(ROOT, opt('out')), `${JSON.stringify(verdict, null, 2)}\n`);

if (flag('json')) {
  process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
} else {
  process.stdout.write(`static-gate: ${verdict.status}  (${files.length} file(s), ${verdict.mode})\n`);
  const byRule = new Map();
  for (const f of findings) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
  for (const [rule, n] of [...byRule].sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`  ${String(n).padStart(4)}  ${rule}\n`);
  }
  for (const f of findings.slice(0, 12)) {
    process.stdout.write(`\n  [${f.target}] ${f.rule}\n    ${f.file}${f.line ? `:${f.line}` : ''}${f.symbol ? ` (${f.symbol})` : ''}\n    ${f.claim}\n`);
  }
  if (findings.length > 12) process.stdout.write(`\n  … ${findings.length - 12} more (use --json)\n`);
}

process.exit(blockers.length ? 2 : 0);
