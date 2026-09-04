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
import { CONFIG_REL, STAGES, loadConfig, stageFor, trackNames } from './ship-config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = join(ROOT, '.workflow', 'runs');

/* One reader of the configuration, and this is how it reaches here. */
const CFG = loadConfig(ROOT);

/**
 * The files that decide how agents behave, hashed by content so an uncommitted edit counts.
 *
 * The agent half is derived from the configuration, never written out here. A hand-kept copy
 * went stale the first time an agent was renamed, and because `fingerprint` skipped what it
 * could not find, two runs governed by different reviewers hashed identically and said so.
 */
function pipelineFiles(cfg) {
  const out = new Set([
    'scripts/ship.mjs',
    'scripts/wf.mjs',
    'scripts/ship-config.mjs',
    'scripts/review-slice.mjs',
    'scripts/static-gate.mjs',
    CONFIG_REL,
    '.claude/agents/references/verdict-contract.md',
    '.claude/agents/references/lead-contract.md',
    '.claude/skills/code-review/SKILL.md',
    '.claude/skills/code-review/references/blocking-criteria.md',
  ]);
  for (const track of trackNames(cfg)) {
    for (const stage of STAGES) {
      const block = cfg.shipConfig?.[track]?.stages?.[stage] ?? {};
      for (const shape of Object.keys(block.shapes ?? {})) {
        let s;
        try { s = stageFor(cfg, track, stage, shape); } catch { continue; }
        for (const agent of [s.agent, s.shardAgent]) if (agent) out.add(`.claude/agents/${agent}.md`);
        if (s.script) out.add(s.script);
      }
    }
  }
  return [...out].sort();
}

const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

function fingerprint(cfg) {
  const files = {};
  const missing = [];
  const all = createHash('sha256');
  for (const rel of pipelineFiles(cfg)) {
    const p = join(ROOT, rel);
    /* A file that is not there still changes the pipeline, so it goes into the hash under its
       own name. Skipping it made an absent reviewer definition indistinguishable from one that
       had not changed. */
    if (!existsSync(p)) { missing.push(rel); all.update(`missing:${rel}`); continue; }
    const h = createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12);
    files[rel] = h;
    all.update(h);
  }
  return { fingerprint: all.digest('hex').slice(0, 16), files, ...(missing.length ? { missing } : {}) };
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

/**
 * One agent invocation per block. A gap over three minutes is always a boundary: a verdict
 * is written and the router runs in between, and no agent idles that long mid-attempt.
 */
const blocks = [];
let cur = null;
for (const e of agentEventsOnly(journal.filter((e) => e.event === 'tool'))) {
  const gap = cur ? new Date(e.ts) - new Date(cur.lastTs) : 0;
  if (!cur || cur.stage !== e.stage || gap > 180_000) {
    if (cur) blocks.push(cur);
    cur = { stage: e.stage, agentType: e.agentType ?? null, sessionId: e.sessionId ?? null, firstTs: e.ts, lastTs: e.ts, events: [] };
  }
  cur.lastTs = e.ts;
  cur.events.push(e);
}
if (cur) blocks.push(cur);

/**
 * What an invocation reported about itself. `--output-format json` puts the session, the cost
 * and the token usage in the agent's own output, which ship keeps as the stage log — and none
 * of it is in the journal, so a digest built only from tool calls cannot see what a stage
 * cost. One implement attempt on this branch was $18.88.
 */
function agentReport(dir, stage, attempt) {
  const log = join(dir, 'stages', `${stage}.attempt-${attempt}.log`);
  if (!existsSync(log)) return null;
  const raw = readFileSync(log, 'utf8');
  /* The SDK path writes one JSON message per line and the cost is on the last of them, the
     `result`. Taking the first `{…}` block in the file took the `system` init message instead,
     which carries no cost — so every stage of every run read as $0 and the digest, which exists
     to answer "what did this cost", answered nothing. The CLI path writes a single object. */
  const j = (() => {
    const lines = raw.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const v = JSON.parse(lines[i]);
        if (v?.type === 'result') return v;
      } catch { /* not a message line */ }
    }
    try { return JSON.parse(raw); } catch { return null; }
  })();
  try {
    if (!j) return null;
    return {
      sessionId: j.session_id ?? null,
      costUsd: typeof j.total_cost_usd === 'number' ? +j.total_cost_usd.toFixed(2) : null,
      apiMs: j.duration_api_ms ?? null,
      stopReason: j.stop_reason ?? null,
      tokens: j.usage
        ? {
            input: j.usage.input_tokens ?? 0,
            output: j.usage.output_tokens ?? 0,
            cacheRead: j.usage.cache_read_input_tokens ?? 0,
            cacheWrite: j.usage.cache_creation_input_tokens ?? 0,
          }
        : null,
    };
  } catch {
    return null;
  }
}

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
const agentFor = (block) => {
  if (block.agentType) return block.agentType;
  try {
    return stageFor(CFG, run.track ?? 'spec', block.stage, run.shapes?.[block.stage] ?? run.variants?.[block.stage]).agent ?? block.stage;
  } catch {
    return block.stage;
  }
};

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
  const report = agentReport(dir, b.stage, attempt);

  return {
    stage: b.stage,
    attempt,
    agent: agentFor(b),
    sessionId: report?.sessionId ?? b.sessionId,
    costUsd: report?.costUsd ?? null,
    apiSec: report?.apiMs ? Math.round(report.apiMs / 1000) : null,
    stopReason: report?.stopReason ?? null,
    tokens: report?.tokens ?? null,
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
  costUsd: +agents.reduce((a, s) => a + (s.costUsd ?? 0), 0).toFixed(2),
};
totals.thinkingPct = totals.wallSec ? Math.round(100 - (totals.toolSec / totals.wallSec) * 100) : null;

/** The same numbers grouped by who did the work, which is the question usually being asked. */
const byAgent = {};
for (const a of agents) {
  const k = a.agent;
  const r = (byAgent[k] ??= { invocations: 0, wallSec: 0, toolSec: 0, calls: 0, costUsd: 0 });
  r.invocations++;
  r.wallSec += a.wallSec;
  r.toolSec += a.toolSec;
  r.calls += a.calls;
  r.costUsd = +(r.costUsd + (a.costUsd ?? 0)).toFixed(2);
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
  pipeline: fingerprint(CFG),
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
console.log(`  ${totals.wallSec}s wall · ${totals.toolSec}s tools · ${totals.calls} calls · ${totals.thinkingPct}% thinking · $${totals.costUsd}`);
for (const [k, v] of Object.entries(byAgent)) {
  console.log(`  ${k.padEnd(16)} ${String(v.invocations).padStart(2)}× · ${String(v.wallSec).padStart(5)}s wall · ${String(v.toolSec).padStart(4)}s tools · ${String(v.calls).padStart(4)} calls · ${String(v.thinkingPct).padStart(2)}% thinking · $${String(v.costUsd).padStart(6)}`);
}
