/**
 * refine-read — what a refine loop left on disk, read once and shared.
 *
 * The loop writes three kinds of thing: a ledger (`<stem>.loop.json`) that is the record of
 * what each round decided, a probe directory per round (`<stem>.probe/<n>/`) holding the
 * throwaway run the pre-implementer was given, and one agent log per gate. `spec-index.mjs`
 * needs a summary of all of that and `refine-report.mjs` needs the whole of one — so the
 * reading lives here, and neither can drift from the other about what a round was.
 *
 * The ledger is authoritative for what a round *decided* and the logs are authoritative for
 * what a gate *did*, including while it is still doing it: the ledger is written when a round
 * ends, so a loop that has been thinking for twelve minutes appears in it not at all. That is
 * the whole reason the logs are parsed rather than trusted to summarise themselves.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Gate order within a round, and the agent each one runs. `null` is a script. */
export const GATES = [
  { gate: 'lint', label: 'T0 · spec-lint', agent: null },
  { gate: 'pre_implement', label: 'T1 · pre-implement', agent: 'pre-implementer' },
  { gate: 'judge', label: 'T2 · the judge', agent: 'spec-reviewer-lead' },
  { gate: 'fix', label: 'fix · the fixer', agent: 'spec-fixer-minimal' },
];

/**
 * The log stem each gate writes under the round's probe directory. The judge and the fixer log
 * under the name of the agent that ran, which the profile chooses, so the ledger is asked before
 * the defaults — a loop read back under the wrong name shows a gate that never ran.
 */
const LOG_STEMS = {
  pre_implement: () => ['stages/pre_implement'],
  judge: (l) => [l?.judgeAgent, 'spec-reviewer-lead', 'spec-reviewer'].filter(Boolean),
  fix: (l) => [l?.fixerAgent, 'spec-fixer-minimal', 'spec-fixer'].filter(Boolean),
};

const jsonIf = (p) => {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
};
const readIf = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const mtime = (p) => { try { return statSync(p).mtimeMs; } catch { return null; } };

/* ── the log ──────────────────────────────────────────────────────────────── */

/**
 * One agent invocation, from the log the loop streamed while it ran.
 *
 * Two shapes reach this. Run from inside a Claude session the loop uses the SDK and appends
 * one JSON message per line as they arrive — which is what makes a gate in flight legible.
 * Run from a plain shell it spawns the CLI and writes stdout once, at the end; there is
 * nothing to follow there, and this says so rather than inventing progress.
 */
export function parseAgentLog(path, { full = false } = {}) {
  const text = readIf(path);
  if (text == null) return null;

  const msgs = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      const m = JSON.parse(line);
      if (m && typeof m === 'object' && m.type) msgs.push(m);
    } catch { /* a partial last line is the normal state of a file being appended to */ }
  }
  if (!msgs.length) return { mode: 'text', running: false, text: full ? text : null, bytes: text.length };

  const ts = (m) => (m.timestamp ? Date.parse(m.timestamp) : null);
  const stamped = msgs.map(ts).filter((n) => n != null);
  const result = [...msgs].reverse().find((m) => m.type === 'result') ?? null;

  const tools = [];
  if (full) {
    /* A call's duration is the gap to its result, which arrives in a later user message under
       the same id. Without the pairing every call reads as instantaneous and the tools half of
       the think/tools split is a flat zero. */
    const startedById = new Map();
    for (const m of msgs) {
      const t = ts(m);
      for (const c of m.message?.content ?? []) {
        if (c.type === 'tool_use') {
          startedById.set(c.id, tools.length);
          tools.push({
            ts: t,
            tool: c.name,
            /* A sub-agent's calls are in its parent's stream. Naming it is what keeps a
               sharded pass from reading as one agent that made 200 calls. */
            actor: m.parent_tool_use_id ? 'subagent' : null,
            sec: 0,
            ok: true,
            what: String(c.input?.command ?? c.input?.file_path ?? c.input?.pattern ?? c.input?.path ?? c.input?.query ?? '')
              .replace(/\s+/g, ' ')
              .slice(0, 400),
          });
        }
        if (c.type === 'tool_result' && startedById.has(c.tool_use_id)) {
          const call = tools[startedById.get(c.tool_use_id)];
          if (t != null && call.ts != null) call.sec = +Math.max(0, (t - call.ts) / 1000).toFixed(1);
          if (c.is_error) call.ok = false;
        }
      }
    }
  }

  const usage = result?.usage ?? {};
  return {
    mode: 'sdk',
    running: !result,
    startedAt: stamped.length ? Math.min(...stamped) : mtime(path),
    /* A gate still running has no end. Its last message is how long ago it last did anything,
       which is the number the board turns into silence. */
    endedAt: stamped.length ? Math.max(...stamped) : mtime(path),
    sessionId: msgs.find((m) => m.session_id)?.session_id ?? null,
    model: result ? Object.keys(result.modelUsage ?? {})[0] ?? null
      : msgs.filter((m) => m.type === 'assistant').slice(-1)[0]?.message?.model ?? null,
    turns: result?.num_turns ?? msgs.filter((m) => m.type === 'assistant').length,
    costUsd: +(result?.total_cost_usd ?? 0).toFixed(2),
    apiSec: Math.round((result?.duration_api_ms ?? 0) / 1000),
    stopReason: result?.stop_reason ?? null,
    subtype: result?.subtype ?? null,
    tokens: {
      out: usage.output_tokens ?? 0,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      cacheWrite: usage.cache_creation_input_tokens ?? 0,
    },
    result: full ? (result?.result ?? null) : null,
    calls: full ? tools.length : msgs.reduce((a, m) => a + (m.message?.content ?? []).filter((c) => c.type === 'tool_use').length, 0),
    tools,
  };
}

/**
 * An agent log read as the summary object the CLI writes, whichever shape it is in.
 *
 * `claude -p --output-format json` writes one JSON document; run from inside a Claude session
 * the orchestrators use the SDK and append one message per line, and the summary is the last
 * `result` message. Readers that `JSON.parse` the whole file get `null` for every SDK log —
 * which the board turned into "the stage was killed", with no cost and no turns, on stages that
 * had passed. Returning the same shape from both keeps every caller unchanged.
 *
 * `null` means *no answer yet*: no file, or a stream with no `result` in it. That is a stage
 * still running or one killed before it answered, and the caller decides which.
 */
export function agentSummary(path) {
  const text = readIf(path);
  if (text == null) return null;
  try { return JSON.parse(text); } catch { /* the SDK writes JSONL */ }

  const msgs = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      const m = JSON.parse(line);
      if (m && typeof m === 'object' && m.type) msgs.push(m);
    } catch { /* a partial last line is the normal state of a file being appended to */ }
  }
  const result = [...msgs].reverse().find((m) => m.type === 'result');
  if (!result) return null;
  return { ...result, session_id: result.session_id ?? msgs.find((m) => m.session_id)?.session_id ?? null };
}

/* ── one loop ─────────────────────────────────────────────────────────────── */

/** Every stem with something on disk — a ledger, or a probe from a loop still on its first round. */
export function refineStems(root) {
  const base = join(root, '.workflow', 'refine');
  if (!existsSync(base)) return [];
  const stems = new Set();
  for (const f of readdirSync(base)) {
    const m = f.match(/^(.+?)\.(loop\.json|probe)$/);
    if (m) stems.add(m[1]);
  }
  return [...stems].sort();
}

const roundDirs = (base, stem) => {
  const p = join(base, `${stem}.probe`);
  if (!existsSync(p)) return [];
  return readdirSync(p)
    .filter((d) => /^\d+$/.test(d))
    .map(Number)
    .sort((a, b) => a - b);
};

/**
 * One refine loop: the ledger's rounds, widened with what each gate's files say.
 *
 * `full` decides whether the agent logs are parsed for their tool calls — hundreds of
 * kilobytes a gate, worth it for the loop being read and not for the twelve in an index.
 */
export function readLoop(root, stem, { full = false } = {}) {
  const base = join(root, '.workflow', 'refine');
  const ledger = jsonIf(join(base, `${stem}.loop.json`));
  const rounds = new Set([...(ledger?.rounds ?? []).map((r) => r.round), ...roundDirs(base, stem)]);

  const out = [];
  for (const n of [...rounds].sort((a, b) => a - b)) {
    const rec = (ledger?.rounds ?? []).find((r) => r.round === n) ?? { round: n };
    const dir = join(base, `${stem}.probe`, String(n));
    const gates = [];

    for (const g of GATES) {
      const stems = LOG_STEMS[g.gate]?.(ledger) ?? [];
      const logPath = stems.map((x) => join(dir, `${x}.log`)).find((x) => existsSync(x)) ?? null;
      const log = logPath ? parseAgentLog(logPath, { full }) : null;

      /* T1 writes its verdict inside the round's own directory, so every round keeps it. T2 and
         the fixer write to one path that the next round overwrites, so a round may only claim
         that file when its own gate ran and the file is younger than that gate started.
         Without both tests a fresh round is decorated with the findings of the loop before it,
         which is the one error a board like this must not make: it reads as a verdict on work
         that has not been judged yet. */
      const shared = g.gate === 'judge' ? `${stem}.verdict.json` : g.gate === 'fix' ? `${stem}.fix.json` : null;
      const verdict = jsonIf(join(dir, `${g.gate}.verdict.json`))
        ?? (shared && log && !log.running && (mtime(join(base, shared)) ?? 0) >= (log.startedAt ?? 0)
          ? jsonIf(join(base, shared))
          : null);

      const decided = g.gate === 'lint' ? rec.lint : g.gate === 'pre_implement' ? rec.plan
        : g.gate === 'judge' ? rec.judge : rec.fix;
      if (!log && decided == null && !verdict) continue;

      gates.push({
        ...g,
        round: n,
        log,
        /* Written by the loop before the agent is dispatched. It is the first thing anybody
           wants when a gate does something strange, and the board is where they look. */
        prompt: logPath && full ? readIf(logPath.replace(/\.log$/, '.prompt.md')) : null,
        verdict,
        decided: decided ?? null,
        report: full ? readIf(join(dir, 'stages', `${g.gate}.md`)) : null,
        handoff: g.gate === 'pre_implement' && existsSync(join(dir, 'handoff.json')),
      });
    }

    out.push({
      round: n,
      startedAt: rec.startedAt ? Date.parse(rec.startedAt) : gates[0]?.log?.startedAt ?? null,
      endedAt: rec.endedAt ? Date.parse(rec.endedAt) : null,
      head: rec.head ?? null,
      commit: rec.commit ?? null,
      lint: rec.lint ?? null,
      plan: rec.plan ?? null,
      judge: rec.judge ?? null,
      fix: rec.fix ?? null,
      gates,
    });
  }

  const last = out[out.length - 1];
  const running = out.some((r) => r.gates.some((g) => g.log?.running));

  return {
    stem,
    spec: ledger?.spec ?? jsonIf(join(base, `${stem}.probe`, String(last?.round ?? 1), 'run.json'))?.spec ?? null,
    request: ledger?.request ?? null,
    /* A ledger written when the previous round ended says `blocked` while the loop that was
       started afterwards is thinking. What the files are doing outranks what the record last
       said about a round that is over. */
    status: running ? 'running' : ledger?.status ?? (last ? 'running' : 'unknown'),
    outcome: running ? null : ledger?.outcome ?? null,
    startedAt: ledger?.startedAt ? Date.parse(ledger.startedAt) : out[0]?.startedAt ?? null,
    updatedAt: Math.max(0, ...out.flatMap((r) => r.gates.map((g) => g.log?.endedAt ?? 0))) || null,
    rounds: out,
    running,
  };
}
