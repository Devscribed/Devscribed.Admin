#!/usr/bin/env node
/**
 * refine-report — one refine loop, in the shape the board already knows how to draw.
 *
 *   node scripts/refine-report.mjs requests-02 --json
 *   node scripts/refine-report.mjs refine:requests-02 --out board.html
 *
 * A refine round is four gate invocations with verdicts, models and clocks — which is what a
 * ship run's stages are. So this emits the same payload `run-report.mjs` emits, and the page
 * renders it without knowing the difference: one definition of what a report is, two things
 * that can be reported. What it cannot fill in it leaves null, and the page drops the cards
 * that were about a diff there is none of.
 *
 * The reason this exists at all: until it did, a loop that had been thinking for twenty
 * minutes was a line of console output and nothing else, because the ledger it writes is
 * written when a round ends.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readLoop } from './refine-read.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const TAKES_VALUE = new Set(['--out']);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const positional = argv.filter((a, i) => !a.startsWith('--') && !TAKES_VALUE.has(argv[i - 1]));

const stem = String(positional[0] ?? '').replace(/^refine:/, '');
if (!stem) {
  process.stderr.write('usage: node scripts/refine-report.mjs <stem|refine:stem> [--json] [--out file]\n');
  process.exit(2);
}

const loop = readLoop(ROOT, stem, { full: true });
if (!loop.rounds.length) {
  process.stderr.write(`refine-report: nothing on disk for ${stem}\n`);
  process.exit(1);
}

/* ── steps ────────────────────────────────────────────────────────────────── */

const steps = [];
for (const round of loop.rounds) {
  for (const g of round.gates) {
    const log = g.log?.mode === 'sdk' ? g.log : null;
    const text = g.log?.mode === 'text' ? g.log : null;

    /* A gate with no log ran no agent — T0 is a script — so its clock is the round's, and it
       is drawn as a script rather than as an invocation that cost nothing. */
    const startedAt = log?.startedAt ?? round.startedAt ?? null;
    const endedAt = log?.endedAt ?? round.startedAt ?? null;

    const findings = g.verdict?.findings ?? [];
    const fixSummary = g.gate === 'fix' && g.verdict
      ? `починено ${g.verdict.fixed?.length ?? 0}, решено ${g.verdict.decided?.length ?? 0}, `
        + `оставлено человеку ${g.verdict.left?.length ?? 0}`
      : null;

    steps.push({
      stage: g.gate,
      label: `${g.label} · раунд ${round.round}`,
      attempt: round.round,
      agent: g.agent,
      script: !g.agent,
      state: log?.running ? 'running' : (log || text || g.verdict || g.decided != null) ? 'done' : 'aborted',
      model: log?.model ?? null,
      sessionId: log?.sessionId ?? null,
      resumedSession: null,
      fuseMin: null,
      headAtStart: round.head,
      startedAt,
      endedAt,
      wallSec: startedAt != null && endedAt != null ? Math.round((endedAt - startedAt) / 1000) : 0,
      apiSec: log?.apiSec ?? 0,
      turns: log?.turns ?? null,
      costUsd: log?.costUsd ?? 0,
      stopReason: log?.stopReason ?? null,
      tokens: log?.tokens ?? { out: 0, cacheRead: 0, cacheWrite: 0 },
      prompt: g.prompt ?? null,
      result: log?.result ?? fixSummary ?? text?.text ?? null,
      report: g.report ?? null,
      status: g.verdict?.status
        ?? (g.gate === 'lint' && g.decided != null ? (g.decided ? 'blocked' : 'pass') : null)
        ?? (log?.running ? 'running' : null),
      findings,
      covered: null,
      suites: null,
      /* The fixer's own record of what it settled on the author's behalf. It is the one thing
         in a refine loop that changed the document without a person present, so it is shown
         beside the verdict rather than left in a file nobody opens. */
      decidedByFixer: g.gate === 'fix' ? g.verdict?.decided ?? null : null,
      leftForPerson: g.gate === 'fix' ? g.verdict?.left ?? null : null,
      handoff: g.handoff ?? false,
      tools: log?.tools ?? [],
      byTool: (log?.tools ?? []).reduce((a, t) => ({ ...a, [t.tool]: (a[t.tool] ?? 0) + 1 }), {}),
      has: { prompt: !!g.prompt, log: !!(log || text), verdict: !!g.verdict, report: !!g.report, start: false },
    });
  }
}

for (const s of steps) {
  s.toolSec = Math.round(s.tools.reduce((a, t) => a + (t.sec ?? 0), 0));
  s.calls = s.tools.length;
  s.thinkSec = Math.max(0, s.wallSec - s.toolSec);
  s.thinkPct = s.wallSec ? Math.round((s.thinkSec / s.wallSec) * 100) : 0;
  s.tokPerSec = s.apiSec ? +(s.tokens.out / s.apiSec).toFixed(1) : null;
  s.commits = [];
}
steps.sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));

/* Each round is committed, so the commits belong to the gate that was running when they
   landed — which is how the board answers "what did this round actually change". */
const git = (...a) => {
  try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }); } catch { return ''; }
};
for (const round of loop.rounds) {
  if (!round.commit) continue;
  const line = git('show', '--format=%H%x09%cI%x09%s', '--stat', round.commit).trim().split('\n');
  const [sha, iso, subject] = (line[0] ?? '').split('\t');
  if (!sha) continue;
  const owner = [...steps].reverse().find((s) => s.attempt === round.round && s.stage === 'fix')
    ?? [...steps].reverse().find((s) => s.attempt === round.round);
  owner?.commits.push({ sha: sha.slice(0, 7), subject: subject ?? '', stat: line[line.length - 1]?.trim() ?? '', at: Date.parse(iso) });
}

/* ── totals ───────────────────────────────────────────────────────────────── */

const agents = steps.filter((s) => !s.script && s.state === 'done');
const t0 = steps.length ? Math.min(...steps.map((s) => s.startedAt ?? Date.now())) : Date.now();
const t1 = steps.length ? Math.max(...steps.map((s) => s.endedAt ?? Date.now())) : Date.now();

const isBlocker = (f) => f.severity !== 'note' && f.severity !== 'info';
const totals = {
  wallSec: Math.round((t1 - t0) / 1000),
  apiSec: agents.reduce((a, s) => a + s.apiSec, 0),
  toolSec: steps.reduce((a, s) => a + s.toolSec, 0),
  costUsd: +agents.reduce((a, s) => a + s.costUsd, 0).toFixed(2),
  outTokens: agents.reduce((a, s) => a + s.tokens.out, 0),
  turns: agents.reduce((a, s) => a + (s.turns ?? 0), 0),
  calls: steps.reduce((a, s) => a + s.calls, 0),
  invocations: agents.length,
  running: steps.filter((s) => s.state === 'running').length,
  aborted: steps.filter((s) => s.state === 'aborted').length,
  blockers: steps.reduce((a, s) => a + s.findings.filter(isBlocker).length, 0),
  notes: steps.reduce((a, s) => a + s.findings.filter((f) => !isBlocker(f)).length, 0),
};
totals.tokPerSec = totals.apiSec ? +(totals.outTokens / totals.apiSec).toFixed(1) : 0;
totals.orchestrationSec = Math.max(0, totals.wallSec - totals.apiSec - totals.toolSec);

const byStage = {};
for (const s of agents) {
  const b = (byStage[s.stage] ??= { stage: s.stage, model: s.model, invocations: 0, wallSec: 0, apiSec: 0, toolSec: 0, costUsd: 0, outTokens: 0, turns: 0 });
  b.invocations++;
  b.wallSec += s.wallSec;
  b.apiSec += s.apiSec;
  b.toolSec += s.toolSec;
  b.costUsd = +(b.costUsd + s.costUsd).toFixed(2);
  b.outTokens += s.tokens.out;
  b.turns += s.turns ?? 0;
}

const payload = {
  kind: 'refine',
  runId: `refine:${stem}`,
  spec: loop.spec,
  request: loop.request,
  branch: null,
  status: loop.status,
  halt: loop.outcome ? { reason: loop.outcome.reason, detail: loop.outcome.detail } : null,
  budget: null,
  contested: [],
  findingHistory: {},
  diff: null,
  priority: [],
  t0,
  t1,
  /* The last message any gate wrote. A loop's silence is measured the same way a run's is,
     and it is the only thing that separates a judge that is thinking from one that died. */
  lastEventAt: Math.max(0, ...steps.map((s) => (s.tools.length ? s.tools[s.tools.length - 1].ts ?? 0 : 0)), ...steps.map((s) => s.endedAt ?? 0)) || null,
  generatedAt: Date.now(),
  totals,
  byStage: Object.values(byStage),
  steps,
  decisions: [],
  coverage: null,
  rounds: loop.rounds.map((r) => ({
    round: r.round,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    commit: r.commit ? r.commit.slice(0, 7) : null,
    lint: r.lint,
    plan: r.plan,
    judge: r.judge,
    fix: r.fix,
  })),
};

if (argv.includes('--json')) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

/* The page belongs to `run-report.mjs` and is generated from a payload rather than from a run,
   so a loop is drawn by the same code that draws a run instead of by a copy of it. */
const out = opt('--out') ?? join(ROOT, '.workflow', 'refine', `${stem}.report.html`);
const tmp = join(ROOT, '.workflow', 'refine', `${stem}.payload.json`);
writeFileSync(tmp, JSON.stringify(payload));
const r = spawnSync(process.execPath, [join(ROOT, 'scripts/run-report.mjs'), '--from-json', tmp, '--out', out], {
  cwd: ROOT, encoding: 'utf8',
});
process.stdout.write(r.stdout ?? '');
process.stderr.write(r.stderr ?? '');
process.exit(r.status ?? 0);
