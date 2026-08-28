/**
 * Distils one pipeline run into a file small enough to commit and detailed enough to argue
 * with.
 *
 * `.gitignore` keeps `events.jsonl`, the blobs and the transcripts out of the repository —
 * 600 KB per run, and a run directory reaches 136 MB. What that throws away is every number
 * worth having later: which agent spent what, on which command, and how much of a stage was
 * the model thinking rather than a process running. Without them, "did the pipeline get
 * faster" can only be answered from memory, and "where did the time go" not at all.
 *
 * So this keeps **every tool call** — its agent, its duration, and what it ran — and drops
 * only the outputs, which are what made the journal large. The pipeline's own fingerprint is
 * part of it, because two runs are comparable only if the pipeline that produced them was
 * the same, and hashing the files is the only way to know that across an edit nobody
 * committed yet.
 *
 *   node scripts/run-digest.mjs [runId] [--summary]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = join(ROOT, '.workflow', 'runs');

/** The files that decide how agents behave, hashed by content so an uncommitted edit counts. */
const PIPELINE_FILES = [
  'scripts/ship.mjs',
  'scripts/wf.mjs',
  'scripts/static-gate.mjs',
  '.claude/ai-workflow.config.json',
  '.claude/agents/pre-implementer.md',
  '.claude/agents/implementer.md',
  '.claude/agents/code-reviewer.md',
  '.claude/agents/qa.md',
];

const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

function fingerprint() {
  const files = {};
  const all = createHash('sha256');
  for (const rel of PIPELINE_FILES) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) continue;
    const h = createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12);
    files[rel] = h;
    all.update(h);
  }
  return { fingerprint: all.digest('hex').slice(0, 16), files };
}

/** What a call *was*, so a hundred invocations roll up into a handful of rows. */
function shapeOf(command) {
  const c = String(command)
    .replace(/^cd\s+(["']?)[^&|;]*\1\s*&&\s*/, '')
    .replace(/^(?:[A-Z_][A-Z_0-9]*=\S+\s+)+/, '')
    .trim();
  const words = c.split(/[|;]|&&/)[0].trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '(empty)';
  const head = words[0];
  if (!/^(npm|npx|node|git|docker|yarn|pnpm|python|python3)$/.test(head)) return head;
  const second = words[1] ?? '';
  if (head === 'npm' && second === 'run') return `npm run ${words[2] ?? ''}`.trim();
  return /^-/.test(second) ? head : `${head} ${second}`;
}

/** One line describing what a call did, short enough to keep 1,000 of them. */
function describe(e) {
  const i = e.input ?? {};
  const raw = i.command ?? i.file_path ?? i.pattern ?? i.path ?? i.url ?? '';
  return String(raw).replace(/\s+/g, ' ').slice(0, 160);
}

const argv = process.argv.slice(2);
const summaryOnly = argv.includes('--summary');
const runId =
  argv.find((a) => !a.startsWith('--')) ??
  readdirSync(RUNS).filter((d) => statSync(join(RUNS, d)).isDirectory()).sort().pop();

const dir = join(RUNS, runId);
const run = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
const journal = existsSync(join(dir, 'events.jsonl'))
  ? readFileSync(join(dir, 'events.jsonl'), 'utf8')
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
 * One agent invocation per block. A gap over three minutes is always a boundary: a verdict
 * is written and the router runs in between, and no agent idles that long mid-attempt.
 */
const blocks = [];
let cur = null;
for (const e of journal) {
  if (e.event !== 'tool') continue;
  const gap = cur ? new Date(e.ts) - new Date(cur.lastTs) : 0;
  if (!cur || cur.stage !== e.stage || gap > 180_000) {
    if (cur) blocks.push(cur);
    cur = { stage: e.stage, agentType: e.agentType ?? null, sessionId: e.sessionId ?? null, firstTs: e.ts, lastTs: e.ts, events: [] };
  }
  cur.lastTs = e.ts;
  cur.events.push(e);
}
if (cur) blocks.push(cur);

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};

/* The journal only carries `agentType` once an agent has announced itself, so the first
   events of a stage arrive without it and would otherwise be filed under a name that is not
   an agent at all. The config knows which agent owns which stage; it is the authority. */
const cfgStages = (() => {
  try {
    return JSON.parse(readFileSync(join(ROOT, '.claude', 'ai-workflow.config.json'), 'utf8')).stages ?? {};
  } catch {
    return {};
  }
})();
const agentFor = (block) => block.agentType ?? cfgStages[block.stage]?.agent ?? block.stage;

const seen = {};
const agents = blocks.map((b) => {
  seen[b.stage] = (seen[b.stage] ?? 0) + 1;
  const attempt = seen[b.stage];
  const start = new Date(b.firstTs);
  const wallMs = new Date(b.lastTs) - start;
  const toolMs = b.events.reduce((a, e) => a + (e.durationMs ?? 0), 0);

  const byTool = {};
  const byShape = {};
  for (const e of b.events) {
    const t = (byTool[e.tool] ??= { count: 0, ms: 0 });
    t.count++;
    t.ms += e.durationMs ?? 0;
    if (e.tool !== 'Bash') continue;
    const s = (byShape[shapeOf(e.input?.command ?? '')] ??= { count: 0, ms: 0 });
    s.count++;
    s.ms += e.durationMs ?? 0;
  }

  const verdict = readJson(join(dir, 'stages', `${b.stage}.attempt-${attempt}.json`));
  const findings = verdict?.findings ?? [];

  return {
    stage: b.stage,
    attempt,
    agent: agentFor(b),
    sessionId: b.sessionId,
    startedAt: b.firstTs,
    wallSec: Math.round(wallMs / 1000),
    toolSec: Math.round(toolMs / 1000),
    // Where a stage's time actually goes. Reviews sit at 96%: nothing about tooling moves them.
    thinkingPct: wallMs ? Math.round(100 - (toolMs / wallMs) * 100) : null,
    calls: b.events.length,
    verdict: verdict?.status ?? null,
    findings: verdict
      ? {
          blockers: findings.filter((f) => f.severity !== 'note').length,
          notes: findings.filter((f) => f.severity === 'note').length,
          rules: findings.map((f) => ({ rule: f.rule, target: f.target, severity: f.severity })),
        }
      : null,
    byTool: Object.fromEntries(
      Object.entries(byTool)
        .sort((a, z) => z[1].ms - a[1].ms || z[1].count - a[1].count)
        .map(([k, v]) => [k, { count: v.count, sec: Math.round(v.ms / 1000) }]),
    ),
    byCommand: Object.entries(byShape)
      .sort((a, z) => z[1].ms - a[1].ms || z[1].count - a[1].count)
      .map(([shape, v]) => ({ shape, count: v.count, sec: Math.round(v.ms / 1000) })),
    // Every call, in order. Outputs are dropped — they are what made the journal large.
    timeline: b.events.map((e) => ({
      at: Math.round((new Date(e.ts) - start) / 1000),
      tool: e.tool,
      ms: e.durationMs ?? 0,
      ok: e.ok !== false,
      what: describe(e),
    })),
  };
});

const shortstat = git('diff', '--shortstat', `${run.baseRef}...HEAD`);
const m = shortstat.match(/(\d+) files? changed(?:, (\d+) insertions?)?(?:[^0-9]*(\d+) deletions?)?/);

const totals = {
  wallSec: agents.reduce((a, s) => a + s.wallSec, 0),
  toolSec: agents.reduce((a, s) => a + s.toolSec, 0),
  calls: agents.reduce((a, s) => a + s.calls, 0),
};
totals.thinkingPct = totals.wallSec ? Math.round(100 - (totals.toolSec / totals.wallSec) * 100) : null;

/** The same numbers grouped by who did the work, which is the question usually being asked. */
const byAgent = {};
for (const a of agents) {
  const k = a.agent;
  const r = (byAgent[k] ??= { invocations: 0, wallSec: 0, toolSec: 0, calls: 0 });
  r.invocations++;
  r.wallSec += a.wallSec;
  r.toolSec += a.toolSec;
  r.calls += a.calls;
}
for (const r of Object.values(byAgent)) {
  r.thinkingPct = r.wallSec ? Math.round(100 - (r.toolSec / r.wallSec) * 100) : null;
}

const digest = {
  runId,
  capturedAt: new Date().toISOString(),
  spec: run.spec,
  specSha: run.specSha,
  branch: run.branch,
  baseRef: run.baseRef,
  headAtCapture: git('rev-parse', 'HEAD'),
  status: run.status,
  halt: run.halt ?? null,
  budget: run.budget,
  pipeline: fingerprint(),
  diff: m ? { files: +m[1], added: +(m[2] || 0), removed: +(m[3] || 0) } : null,
  totals,
  byAgent,
  agents: summaryOnly ? agents.map(({ timeline, ...rest }) => rest) : agents,
};

const out = join(dir, 'digest.json');
writeFileSync(out, JSON.stringify(digest, null, 2) + '\n');

const kb = (statSync(out).size / 1024).toFixed(0);
console.log(`${out}  (${kb} KB from ${journal.length} journal events)`);
console.log(`  pipeline ${digest.pipeline.fingerprint}`);
console.log(`  ${totals.wallSec}s wall · ${totals.toolSec}s tools · ${totals.calls} calls · ${totals.thinkingPct}% thinking`);
for (const [k, v] of Object.entries(byAgent)) {
  console.log(`  ${k.padEnd(16)} ${String(v.invocations).padStart(2)}× · ${String(v.wallSec).padStart(5)}s wall · ${String(v.toolSec).padStart(4)}s tools · ${String(v.calls).padStart(4)} calls · ${v.thinkingPct}% thinking`);
}
