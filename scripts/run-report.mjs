/**
 * A run, walked through step by step: what each agent was given, what it did with it, why it
 * ruled the way it did, and where the router sent the work next.
 *
 * This is not the digest. `run-digest.mjs` writes a small committable record of tool calls;
 * this writes one self-contained HTML page a person opens to understand a run — or to watch
 * one that is still going.
 *
 * **It must work on an unfinished run.** That is not a nicety: a run you want to look at is
 * usually a run that is stuck, and the artefacts of a stuck run are exactly the ones that are
 * missing. So every source is optional and every step reports which of its parts exist. An
 * attempt with a `.start.json` and no `.log` is *running*; one with neither, whose
 * `stage-start` the journal recorded anyway, was *killed*.
 *
 * Sources, in order of authority:
 *
 *   1. `stages/<stage>.attempt-<n>.start.json` and `.prompt.md` — written by `ship.mjs`
 *      *before* the agent starts: the prompt, the model, the session being resumed. The
 *      prompt used to exist nowhere, which meant "what did the reviewer actually see?" was
 *      unanswerable after the fact.
 *   2. `stages/<stage>.attempt-<n>.log` — the agent's own `--output-format json` summary:
 *      session, cost, tokens, turns, wall clock, and its closing message.
 *   3. `stages/<stage>.attempt-<n>.json` — the verdict, and `.md` — the stage report.
 *   4. `events.jsonl` — tool calls, for timing, and `route` events, which carry the router's
 *      own reason for every decision. Reconstructing those reasons from the verdicts would be
 *      a guess; this is the record.
 *
 * The journal stamps every call made while the run holds the lock with the *current stage*,
 * including the operator's own shell, so it is trusted for "how long did this command take"
 * and never for "who ran it" — attribution goes through session ids taken from (1) and (2).
 *
 *   node scripts/run-report.mjs [runId] [--out <path>] [--json] [--open]
 *   node scripts/run-report.mjs --from-json <payload> --out <path>
 *
 * The page is the one thing here that is not about a run: `--from-json` renders whatever
 * payload it is handed, which is how `refine-report.mjs` draws a refine loop without a second
 * copy of this markup drifting away from it.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { agentSummary, parseAgentLog } from './refine-read.mjs';
import { priceOf, ratesFromAllRuns, sessionUsage } from './usage-recover.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = join(ROOT, '.workflow', 'runs');

const argv = process.argv.slice(2);
const TAKES_VALUE = new Set(['--out', '--from-json']);
const flag = (n) => {
  const i = argv.indexOf(n);
  return i === -1 ? null : argv[i + 1];
};
const asJson = argv.includes('--json');
const positional = argv.filter((a, i) => !a.startsWith('--') && !TAKES_VALUE.has(argv[i - 1]));

/* The page is the one thing here that is not about a run: it draws whatever payload it is
   given, and `refine-report.mjs` produces one for a thing that is not a run at all. Rendering
   from a file is what lets that exist without a second copy of eight hundred lines of markup
   drifting away from this one. */
const fromJson = flag('--from-json');
if (fromJson) {
  const given = JSON.parse(readFileSync(fromJson, 'utf8'));
  const target = flag('--out') ?? join(ROOT, '.workflow', 'report.html');
  writeFileSync(target, pageHtml(given));
  console.log(target);
  process.exit(0);
}

const runId =
  positional[0] ??
  readdirSync(RUNS)
    .filter((d) => statSync(join(RUNS, d)).isDirectory())
    .sort()
    .pop();

const dir = join(RUNS, runId);
if (!existsSync(dir)) {
  console.error(`no run directory at ${dir}`);
  process.exit(1);
}

/**
 * A run whose `init` died before it wrote `run.json` is the extreme case of the rule this file
 * already lives by: every source is optional. It is also the case a person is most likely to
 * click on, because a directory nobody can account for is exactly what invites a click — so it
 * opens and says what happened, with whatever its journal and stages did manage to record,
 * rather than taking the board down with it.
 *
 * `baseRef` is HEAD so every diff and log this asks git for comes back empty instead of
 * failing: there is no base to measure from, and pretending otherwise would invent a diff.
 */
const run = existsSync(join(dir, 'run.json'))
  ? JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'))
  : {
    runId,
    spec: null,
    branch: null,
    baseRef: 'HEAD',
    status: 'half-created',
    halt: { reason: 'init не завершился', detail: 'run.json не был записан — прогон умер до того, как оркестратор его создал' },
    stages: {},
    notes: [],
  };

const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return '';
  }
};
const readIf = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const jsonIf = (p) => {
  const t = readIf(p);
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

const STAGE_ORDER = ['preflight', 'pre_implement', 'implement', 'static_gate', 'review', 'qa'];
const AGENT_OF = { pre_implement: 'pre-implementer', implement: 'implementer', review: 'code-reviewer-lead', qa: 'qa' };

/* ── the journal ──────────────────────────────────────────────────────────── */

/** Written by `wf.mjs` as the run advances, so they are the run moving whoever was at the
 *  keyboard. `agent-stop` is deliberately not here: it fires for any session that ends,
 *  including the operator's, and a stage ending already writes `stage-end`. */
const ORCHESTRATOR_EVENTS = new Set(['init', 'stage-start', 'stage-end', 'route', 'ready', 'infra-error']);

const journal = (readIf(join(dir, 'events.jsonl')) ?? '')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

/* ── one step per attempt ─────────────────────────────────────────────────── */

/** The one model that did the work; every invocation also shows a near-free chore model. */
function principalModel(usage) {
  const paid = Object.entries(usage ?? {}).filter(([, u]) => (u.costUSD ?? 0) > 0.005);
  return (paid.sort((a, b) => b[1].costUSD - a[1].costUSD)[0] ?? [null])[0];
}

const MAX_TEXT = 200_000; // a prompt or a report past this is pathological; say so rather than embed it
const clip = (s) => (s && s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}\n\n… обрезано, всего ${s.length} символов` : s);

function collectSteps() {
  const stagesDir = join(dir, 'stages');
  const seen = new Set();
  const steps = [];

  const files = existsSync(stagesDir) ? readdirSync(stagesDir) : [];
  const attemptsFromFiles = new Set();
  for (const f of files) {
    const m = f.match(/^(.+?)\.attempt-(\d+)\.(log|json|md|prompt\.md|start\.json)$/);
    if (m) attemptsFromFiles.add(`${m[1]}|${m[2]}`);
  }
  /* An attempt the orchestrator announced and that left nothing behind was killed; the budget
     it spent bought no verdict, and that is the most interesting kind of step to see. */
  for (const stage of STAGE_ORDER) {
    const starts = journal.filter((e) => e.stage === stage && e.event === 'stage-start');
    starts.forEach((_, i) => attemptsFromFiles.add(`${stage}|${i + 1}`));
  }

  for (const key of attemptsFromFiles) {
    const [stage, nStr] = key.split('|');
    const attempt = Number(nStr);
    if (seen.has(key)) continue;
    seen.add(key);

    const stem = join(stagesDir, `${stage}.attempt-${attempt}`);
    const start = jsonIf(`${stem}.start.json`);
    const log = agentSummary(`${stem}.log`);
    /* A stage in flight has no summary — that arrives with its last message. Its stream has
       everything the board needs to show it is alive, and without this the session id is
       unknown, so no tool call is attributed to it and a working agent renders as one that has
       made no calls and spent all its time thinking. Which is what a dead one looks like. */
    const live = log ? null : parseAgentLog(`${stem}.log`);
    const verdict = jsonIf(`${stem}.json`);
    const prompt = clip(readIf(`${stem}.prompt.md`));
    const report = clip(readIf(`${stem}.md`)) ?? clip(readIf(join(stagesDir, `${stage}.md`)));

    const startEvent = journal.filter((e) => e.stage === stage && e.event === 'stage-start')[attempt - 1];
    /**
     * When this attempt stopped occupying the pipeline — the first `stage-end` of its own
     * stage or, sooner, any other stage starting.
     *
     * The obvious version, "the Nth `stage-end` of this stage", is wrong the moment an attempt
     * is killed: a stage with five starts and four ends has no index alignment left, and the
     * killed attempt silently inherits the end time of the attempt that replaced it. On the
     * run this was written against that turned a 3-minute abort into a 13-minute one, which
     * is the difference between "we noticed instantly" and "we wasted a cycle".
     */
    const endEvent = startEvent
      ? journal.find(
          (e) =>
            Date.parse(e.ts) > Date.parse(startEvent.ts) &&
            ((e.event === 'stage-end' && e.stage === stage) || e.event === 'stage-start'),
        )
      : null;

    const isScript = !AGENT_OF[stage];
    let startedAt = start ? Date.parse(start.startedAt) : startEvent ? Date.parse(startEvent.ts) : null;
    let endedAt = null;
    let state = 'done';

    if (log) {
      endedAt = existsSync(`${stem}.log`) ? statSync(`${stem}.log`).mtimeMs : null;
      if (startedAt == null && endedAt != null) startedAt = endedAt - (log.duration_ms ?? 0);
    } else if (endEvent) {
      endedAt = Date.parse(endEvent.ts);
      state = isScript ? 'done' : 'aborted';
    } else if (startedAt != null) {
      state = 'running';
      endedAt = Date.now();
    }
    if (isScript) state = verdict ? 'done' : state;
    if (!log && !verdict && state !== 'running') state = 'aborted';

    const wallSec = startedAt != null && endedAt != null ? Math.round((endedAt - startedAt) / 1000) : 0;

    steps.push({
      stage,
      attempt,
      agent: isScript ? null : (start?.agent ?? AGENT_OF[stage]),
      script: isScript,
      state,
      model: log ? principalModel(log.modelUsage) : (live?.model ?? start?.model ?? null),
      sessionId: log?.session_id ?? live?.sessionId ?? null,
      resumedSession: start?.resumedSession ?? null,
      fuseMin: start?.fuseMin ?? null,
      headAtStart: start?.head ?? null,
      startedAt,
      endedAt,
      wallSec,
      apiSec: Math.round((log?.duration_api_ms ?? 0) / 1000),
      turns: log?.num_turns ?? live?.turns ?? null,
      calls: live?.calls ?? null,
      /**
       * `null` where the closing `result` never arrived — a killed or in-flight stage — and a
       * number only where one did. Zero would say the stage cost nothing, which is the one
       * thing it did not do: the implement attempt the fuse killed ran 345 turns and 244 tool
       * calls and showed on the board as free.
       */
      costUsd: log ? +(log.total_cost_usd ?? 0).toFixed(2) : null,
      tokens: log
        ? {
          out: log.usage?.output_tokens ?? 0,
          cacheRead: log.usage?.cache_read_input_tokens ?? 0,
          cacheWrite: log.usage?.cache_creation_input_tokens ?? 0,
        }
        : null,
      stopReason: log?.stop_reason ?? null,
      prompt,
      result: clip(log?.result ?? null),
      report,
      status: verdict?.status ?? (state === 'running' ? 'running' : state === 'aborted' ? 'aborted' : null),
      findings: verdict?.findings ?? [],
      covered: verdict?.covered ?? null,
      suites: verdict?.suites ?? null,
      has: {
        prompt: !!prompt,
        log: !!log,
        verdict: !!verdict,
        report: !!report,
        start: !!start,
      },
    });
  }

  return steps.filter((s) => s.startedAt != null).sort((a, b) => a.startedAt - b.startedAt);
}

const steps = collectSteps();

/* ── tool calls, attributed by session ────────────────────────────────────── */

function attachTools() {
  const bySession = new Map();
  for (const s of steps) {
    s.tools = [];
    s.byTool = {};
    s.toolSec = 0;
    if (!s.sessionId) continue;
    if (!bySession.has(s.sessionId)) bySession.set(s.sessionId, []);
    bySession.get(s.sessionId).push(s);
  }

  const byStage = new Map();
  for (const s of steps) {
    if (!byStage.has(s.stage)) byStage.set(s.stage, []);
    byStage.get(s.stage).push(s);
  }

  for (const e of journal) {
    if (e.event !== 'tool') continue;
    let candidates = e.sessionId ? bySession.get(e.sessionId) : null;
    /* A sub-agent runs in a session of its own, which no step records — only the agent the
       orchestrator started is in `bySession`. Matching those by stage instead is what makes a
       shard's work visible at all; without it the whole of a sharded review is silence.
       `agentType` is what keeps this safe: the operator's own shell is journaled under this
       stage too, and it is the one caller that carries no agent. */
    let byStageGuess = false;
    if (!candidates && e.agentType) { candidates = byStage.get(e.stage); byStageGuess = true; }
    if (!candidates) continue;
    const t = Date.parse(e.ts);
    /* A resumed session spans several attempts, so a call belongs to the latest attempt that
       had already started when it was made. The 30s slack covers the gap between the
       orchestrator recording a start and the agent's first call landing.
       A session the step recorded is trusted without an upper bound, because that is what a
       resume looks like. The stage guess gets one: an agent working in this copy long after
       the run ended is stamped with the run's stage too, and is otherwise indistinguishable
       from a shard of it. A sub-agent runs inside its parent's window; a stranger does not. */
    let target = null;
    for (const c of candidates) {
      if (t < c.startedAt - 30_000) continue;
      if (byStageGuess && t > (c.endedAt ?? Date.now()) + 30_000) continue;
      if (!target || c.startedAt > target.startedAt) target = c;
    }
    if (!target) continue;
    const sec = (e.durationMs ?? 0) / 1000;
    target.toolSec += sec;
    target.byTool[e.tool] = (target.byTool[e.tool] ?? 0) + 1;
    target.tools.push({
      at: Math.max(0, Math.round((t - target.startedAt) / 1000)),
      /* Absolute, not only the offset: "how long ago" has to survive being read on a page
         that has been open longer than the payload is old. */
      ts: t,
      tool: e.tool,
      /* A short id is a name and survives whole; only a long one is a hash worth cutting. */
      actor: e.agentType
        ? (e.agentId && e.agentId !== 'main'
          ? `${e.agentType}·${String(e.agentId).length <= 12 ? e.agentId : String(e.agentId).slice(0, 8)}`
          : e.agentType)
        : null,
      sec: +sec.toFixed(1),
      ok: e.ok !== false,
      what: String(e.input?.command ?? e.input?.file_path ?? e.input?.pattern ?? e.input?.path ?? '')
        .replace(/\s+/g, ' ')
        .slice(0, 400),
    });
  }
  for (const s of steps) {
    s.toolSec = Math.round(s.toolSec);
    s.calls = s.tools.length;
    s.thinkSec = Math.max(0, s.wallSec - s.toolSec);
    s.thinkPct = s.wallSec ? Math.round((s.thinkSec / s.wallSec) * 100) : 0;
    s.tokPerSec = s.apiSec && s.tokens ? +(s.tokens.out / s.apiSec).toFixed(1) : null;
  }
}
attachTools();

/* ── what each attempt committed ──────────────────────────────────────────── */

function attachCommits() {
  const log = git('log', '--format=%H%x09%cI%x09%s', `${run.baseRef}..HEAD`).trim();
  const commits = log
    ? log.split('\n').map((l) => {
        const [sha, iso, subject] = l.split('\t');
        return { sha, at: Date.parse(iso), subject };
      })
    : [];
  for (const s of steps) {
    s.commits = commits
      .filter((c) => s.startedAt != null && c.at >= s.startedAt && c.at <= (s.endedAt ?? Date.now()))
      .map((c) => ({
        sha: c.sha.slice(0, 7),
        subject: c.subject,
        stat: git('show', '--stat', '--format=', c.sha).trim().split('\n').slice(-1)[0]?.trim() ?? '',
      }));
  }
}
attachCommits();

/* ── routing: the router's own words ──────────────────────────────────────── */

/** Read from the router rather than copied, so the report cannot drift from the rule. */
function targetPriority() {
  const m = (readIf(join(ROOT, 'scripts', 'wf.mjs')) ?? '').match(/const TARGET_PRIORITY = \[([^\]]+)\]/);
  return m ? m[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean) : ['spec', 'self', 'handoff', 'code'];
}
const PRIORITY = targetPriority();
const isBlocker = (f) => f.severity !== 'note' && f.severity !== 'info';
const findingKey = (f) => `${f.rule}@${f.file ?? '-'}#${f.symbol ?? '-'}`;

const decisions = (() => {
  const out = [];
  let from = 'preflight';
  for (const e of journal) {
    if (e.event === 'stage-end') from = e.name ?? e.stage ?? from;
    const at = Date.parse(e.ts);
    if (e.event === 'route') out.push({ at, from, to: e.to, why: e.why, kind: 'route' });
    if (e.event === 'infra-error')
      out.push({ at, from: e.stage, to: e.stage, kind: 'infra', why: `сбой среды №${e.count} — попытка не засчитана${e.detail ? `: ${e.detail}` : ''}` });
    if (e.event === 'halt') out.push({ at, from, to: null, kind: 'halt', why: `${e.reason ?? ''} — ${e.detail ?? ''}` });
    if (e.event === 'ready') out.push({ at, from, to: null, kind: 'ready', why: 'все гейты пройдены' });
  }
  return out;
})();

const WHY_TARGET = {
  spec: 'дефект в спеке делает починку кода бессмысленной, поэтому spec выигрывает всегда и прогон останавливается для человека',
  self: 'гейт сообщает, что неверно его собственное правило — это тоже человек, а не ретрай',
  handoff: 'виноват план, а не код: чинить код по неверному плану преждевременно, поэтому работа уходит в pre_implement, и счётчик кодовых попыток обнуляется — план другой, отсчёт заново',
  code: 'обычный путь: работа возвращается реализатору, и это единственный адрес, который вообще ретраится',
};

function attachRouting() {
  const firstSeen = new Map();
  for (const s of steps) {
    for (const f of s.findings) {
      const k = findingKey(f);
      f._key = k;
      f._carriedFrom = firstSeen.get(k) ?? null;
      if (!firstSeen.has(k)) firstSeen.set(k, `${s.stage} ${s.attempt}`);
    }

    s.routedAway = s.endedAt ? (decisions.find((d) => d.at >= s.endedAt - 2500) ?? null) : null;
    s.routedHere = s.startedAt ? ([...decisions].reverse().find((d) => d.at <= s.startedAt + 2500 && d.to === s.stage) ?? null) : null;

    const blockers = s.findings.filter(isBlocker);
    if (blockers.length) {
      const winner = PRIORITY.find((t) => blockers.some((f) => f.target === t)) ?? null;
      s.routing = {
        winner,
        priority: PRIORITY,
        why: WHY_TARGET[winner] ?? null,
        cause: blockers.filter((f) => f.target === winner).map((f) => f.id),
        alongside: blockers.filter((f) => f.target !== winner).map((f) => ({ id: f.id, target: f.target })),
      };
    } else s.routing = null;
  }
}
attachRouting();

/* ── review coverage ──────────────────────────────────────────────────────── */

const ROOT_POSIX = ROOT.split('\\').join('/');
const PREFIXES = [`${ROOT_POSIX}/`, `/${ROOT_POSIX[0].toLowerCase()}${ROOT_POSIX.slice(2)}/`];
const toRepoPath = (s) => {
  let t = String(s).split('\\').join('/');
  for (const p of PREFIXES) t = t.split(p).join('');
  return t;
};

function coverage() {
  const sizes = new Map();
  for (const line of git('diff', '--numstat', `${run.baseRef}...HEAD`, '--', '.', ':(exclude).workflow').trim().split('\n')) {
    const [a, r, p] = line.split('\t');
    if (p) sizes.set(p, (+a || 0) + (+r || 0));
  }
  const passes = steps.filter((s) => s.stage === 'review' && s.sessionId);
  const bySid = new Map(passes.map((p) => [p.sessionId, p.attempt]));
  const named = new Map();
  for (const e of journal) {
    if (e.event !== 'tool') continue;
    const n = bySid.get(e.sessionId);
    if (!n) continue;
    const i = e.input ?? {};
    const text = toRepoPath([i.file_path, i.command, i.path, i.pattern, i.glob].filter(Boolean).join(' '));
    for (const p of sizes.keys()) if (text.includes(p)) (named.get(p) ?? named.set(p, new Set()).get(p)).add(n);
  }
  for (const p of passes) p.coverageNamed = [...named.values()].filter((s) => s.has(p.attempt)).length;
  return {
    files: sizes.size,
    perPass: passes.map((p) => ({ attempt: p.attempt, named: p.coverageNamed })),
    never: [...sizes.keys()].filter((p) => !named.has(p)).sort((a, b) => sizes.get(b) - sizes.get(a)).map((p) => ({ path: p, lines: sizes.get(p) })),
  };
}
const cov = coverage();

/* ── totals ───────────────────────────────────────────────────────────────── */

/**
 * What the stages that died never reported, recovered from the session store.
 *
 * A resumed stage shares its session with the attempt it continues, so the transcript holds
 * both and the later attempt's own reported total is subtracted to leave the killed one's.
 * Cost is priced from rates fitted on this run's completed stages and is marked `estimated`
 * wherever it is shown; tokens are exact.
 */
(function recoverKilled() {
  const rates = ratesFromAllRuns(RUNS);
  for (const s of steps) {
    if (s.script || s.tokens || !s.sessionId) continue;
    const whole = sessionUsage(ROOT, s.sessionId);
    if (!whole) continue;
    const shared = steps.filter((o) => o !== s && o.sessionId === s.sessionId && o.tokens);
    const t = {
      out: whole.out - shared.reduce((a, o) => a + o.tokens.out, 0),
      cacheRead: whole.cacheRead - shared.reduce((a, o) => a + o.tokens.cacheRead, 0),
      cacheWrite: whole.cacheWrite - shared.reduce((a, o) => a + o.tokens.cacheWrite, 0),
    };
    if (t.out <= 0) continue;
    s.tokens = t;
    s.tokensRecovered = true;
    const r = rates[s.model] ?? rates['claude-opus-5'] ?? null;
    s.costUsd = priceOf(t, r);
    s.costEstimated = s.costUsd != null;
    s.costErrPct = r ? Math.round(r.worstErr * 100) : null;
  }
})();

const agents = steps.filter((s) => !s.script && s.state === 'done');
/** Every invocation that spent money, whether or not it lived to report it. */
const billable = steps.filter((s) => !s.script && s.costUsd != null);
const t0 = steps.length ? Math.min(...steps.map((s) => s.startedAt)) : Date.now();
const t1 = steps.length ? Math.max(...steps.map((s) => s.endedAt ?? Date.now())) : Date.now();

const totals = {
  wallSec: Math.round((t1 - t0) / 1000),
  apiSec: agents.reduce((a, s) => a + s.apiSec, 0),
  toolSec: steps.reduce((a, s) => a + s.toolSec, 0),
  /* Over everything that spent, not over everything that finished. A killed attempt is billed
     like any other, and leaving it out is what made this run's headline read $15.62 when the
     stage the fuse cut short had cost roughly three times the rest of it together. */
  costUsd: +billable.reduce((a, s) => a + (s.costUsd ?? 0), 0).toFixed(2),
  outTokens: billable.reduce((a, s) => a + (s.tokens?.out ?? 0), 0),
  cacheTokens: billable.reduce((a, s) => a + (s.tokens?.cacheRead ?? 0) + (s.tokens?.cacheWrite ?? 0), 0),
  estimated: billable.filter((s) => s.costEstimated).length,
  /* Invocations whose closing summary never arrived, counted over every step rather than over
     `agents` — which is filtered to finished ones, so a killed stage is not in it and counting
     nulls there always answers zero. Their cost and tokens are in none of the figures above,
     and the board says how many rather than letting the totals read complete. */
  unaccounted: steps.filter((s) => !s.script && s.state === 'aborted').length,
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
  b.costUsd = +(b.costUsd + (s.costUsd ?? 0)).toFixed(2);
  b.outTokens += s.tokens?.out ?? 0;
  b.turns += s.turns ?? 0;
}

const payload = {
  runId,
  spec: run.spec,
  branch: run.branch,
  status: run.status,
  baseRef: run.baseRef,
  halt: run.halt ?? null,
  budget: run.budget ?? null,
  contested: run.contested ?? [],
  findingHistory: run.findingHistory ?? {},
  diff: git('diff', '--shortstat', `${run.baseRef}...HEAD`, '--', '.', ':(exclude).workflow').trim(),
  generatedAt: new Date().toISOString(),
  priority: PRIORITY,
  t0,
  t1,
  /* When the run last moved, and when this payload was built. The difference between them is
     the silence, and silence is the only thing that tells a thinking agent from a dead one.
     Which makes *whose* activity counts the whole question: the journal stamps every call made
     while the run holds the lock, including the operator's own shell in the same working copy.
     Counting those would reset the silence to zero every time somebody typed, and the board
     would report a dead run as alive — the one error it exists to prevent. An event counts
     when it carries an agent, or when the orchestrator wrote it. */
  lastEventAt: Math.max(
    0,
    /* Read from what the report already attributed to a step, so the badge and the per-step
       lines cannot tell different stories about when this run last moved. */
    ...steps.flatMap((s) => (s.tools.length ? [s.tools[s.tools.length - 1].ts] : [])),
    ...journal.filter((e) => ORCHESTRATOR_EVENTS.has(e?.event)).map((e) => Date.parse(e.ts) || 0),
  ) || null,
  generatedAt: Date.now(),
  totals,
  byStage: Object.values(byStage),
  steps,
  decisions,
  coverage: cov,
};

if (asJson) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

/* ── the page ─────────────────────────────────────────────────────────────── */

/* Hoisted deliberately: `--from-json` calls it before this line is reached, which is what
   makes a page out of a payload this script did not build. */
function pageHtml(payload) {
const DATA = JSON.stringify(payload).split('<').join('\\u003c').split('\u2028').join('\\u2028').split('\u2029').join('\\u2029');

return `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Прогон · ${payload.runId}</title>
<style>
/* Material 3, light scheme, no network dependencies. */
:root{
  --primary:#6750A4; --on-primary:#fff; --primary-container:#EADDFF; --on-primary-container:#21005D;
  --secondary:#625B71; --secondary-container:#E8DEF8; --on-secondary-container:#1D192B;
  --error:#B3261E; --error-container:#F9DEDC; --on-error-container:#410E0B;
  --ok:#146C2E; --ok-container:#D7F2DE; --on-ok-container:#052E12;
  --warn:#7A5900; --warn-container:#FFEFC6; --on-warn-container:#241A00;
  --surface:#FEF7FF; --surface-1:#F7F2FA; --surface-2:#F3EDF7; --surface-3:#EEE8F4; --surface-5:#E6E0EC;
  --on-surface:#1D1B20; --on-surface-var:#49454F; --outline:#79747E; --outline-var:#CAC4D0;
  --e1:0 1px 2px rgba(0,0,0,.30),0 1px 3px 1px rgba(0,0,0,.15);
  --e2:0 1px 2px rgba(0,0,0,.30),0 2px 6px 2px rgba(0,0,0,.15);
  --mono:ui-monospace,"Cascadia Mono","Segoe UI Mono",Menlo,Consolas,monospace;
  --sans:system-ui,"Segoe UI Variable Text","Segoe UI",Roboto,-apple-system,sans-serif;
  --rail:296px;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--surface);color:var(--on-surface);font:400 14px/1.5 var(--sans);
     -webkit-font-smoothing:antialiased}
button{font:inherit;color:inherit}
.mono{font-family:var(--mono);font-size:12.5px}
.dim{color:var(--on-surface-var)}

/* top app bar */
.appbar{position:sticky;top:0;z-index:30;background:var(--surface-2);box-shadow:var(--e1)}
.appbar-in{max-width:1500px;margin:0 auto;padding:14px 24px}
.appbar h1{margin:0;font-size:20px;font-weight:500;letter-spacing:0;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.appbar .meta{margin-top:4px;font-size:12.5px;color:var(--on-surface-var)}
.metrics{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.metric{background:var(--surface);border-radius:12px;padding:7px 13px;min-width:104px;box-shadow:var(--e1)}
.metric .k{font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;color:var(--on-surface-var)}
.metric .v{font-size:19px;font-weight:500;line-height:1.25;margin-top:1px}
.metric .s{font-size:11px;color:var(--on-surface-var)}

/* layout */
.shell{max-width:1500px;margin:0 auto;padding:20px 24px 120px;display:grid;
       grid-template-columns:var(--rail) minmax(0,1fr);gap:24px;align-items:start}
@media(max-width:1080px){.shell{grid-template-columns:1fr}.rail{position:static!important;max-height:none!important}}

/* stepper rail */
.rail{position:sticky;top:150px;max-height:calc(100vh - 176px);overflow:auto;
      background:var(--surface-1);border-radius:16px;padding:10px;box-shadow:var(--e1)}
.rail h3{margin:6px 8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--on-surface-var);font-weight:600}
.stepitem{display:grid;grid-template-columns:26px 1fr auto;gap:9px;align-items:center;width:100%;
          background:none;border:0;text-align:left;padding:8px 9px;border-radius:12px;cursor:pointer;position:relative}
.stepitem:hover{background:var(--surface-3)}
.stepitem.on{background:var(--secondary-container);color:var(--on-secondary-container)}
.stepitem .dot{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;
               font-size:11px;font-weight:600;color:#fff;background:var(--outline)}
.stepitem .nm{font-size:13px;line-height:1.25}
.stepitem .nm small{display:block;font-size:11px;color:var(--on-surface-var)}
.stepitem.on .nm small{color:var(--on-secondary-container);opacity:.8}
.stepitem .tm{font-family:var(--mono);font-size:11px;color:var(--on-surface-var)}
.rail .connector{height:8px;margin-left:22px;border-left:2px solid var(--outline-var)}

/* cards */
.card{background:var(--surface-1);border-radius:16px;box-shadow:var(--e1);margin-bottom:16px;overflow:hidden}
.card>h2{margin:0;padding:16px 20px 12px;font-size:16px;font-weight:500;display:flex;align-items:center;gap:10px}
.card .body{padding:0 20px 18px}

/* step card */
.step{scroll-margin-top:168px}
.step-head{display:grid;grid-template-columns:34px 1fr auto;gap:12px;align-items:center;
           width:100%;background:none;border:0;padding:14px 18px;cursor:pointer;text-align:left}
.step-head:hover{background:var(--surface-2)}
.step-head .idx{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;
                color:#fff;font-weight:600;font-size:13px;background:var(--outline)}
.step-head .ttl{font-size:15px;font-weight:500;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.step-head .sub{font-size:12px;color:var(--on-surface-var);margin-top:2px}
.step-head .caret{transition:transform .18s;color:var(--on-surface-var);font-size:18px}
.step.open .step-head .caret{transform:rotate(180deg)}
.step .panel{display:none;border-top:1px solid var(--outline-var)}
.step.open .panel{display:block}

/* tabs */
.tabs{display:flex;gap:2px;padding:0 12px;border-bottom:1px solid var(--outline-var);overflow-x:auto}
.tab{background:none;border:0;padding:12px 14px;cursor:pointer;font-size:13px;font-weight:500;
     color:var(--on-surface-var);border-bottom:3px solid transparent;white-space:nowrap}
.tab:hover{color:var(--on-surface);background:var(--surface-2)}
.tab.on{color:var(--primary);border-bottom-color:var(--primary)}
.tab .badge{display:inline-block;min-width:18px;padding:0 5px;margin-left:6px;border-radius:9px;
            background:var(--surface-5);font-size:11px;font-weight:600;color:var(--on-surface-var)}
.tab.on .badge{background:var(--primary-container);color:var(--on-primary-container)}
.pane{display:none;padding:16px 20px 20px}
.pane.on{display:block}

/* chips */
.chip{display:inline-flex;align-items:center;gap:5px;border-radius:8px;padding:2px 9px;
      font-size:11.5px;font-weight:600;line-height:19px;white-space:nowrap}
.c-pass{background:var(--ok-container);color:var(--on-ok-container)}
.c-block{background:var(--error-container);color:var(--on-error-container)}
.c-note{background:var(--warn-container);color:var(--on-warn-container)}
.c-info{background:var(--surface-5);color:var(--on-surface-var)}
.c-run{background:var(--primary-container);color:var(--on-primary-container)}
.c-code{background:#E0E7FF;color:#312E81}.c-spec{background:#FCE7F3;color:#831843}
.c-handoff{background:var(--surface-5);color:var(--on-surface-var)}.c-self{background:var(--surface-5);color:var(--on-surface-var)}
.chip.out{background:none;border:1px solid var(--outline-var);color:var(--on-surface-var);font-weight:500}

/* filter bar */
.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 14px}
.fbtn{border:1px solid var(--outline-var);background:none;border-radius:8px;padding:6px 13px;
      font-size:13px;cursor:pointer;color:var(--on-surface-var)}
.fbtn:hover{background:var(--surface-2)}
.fbtn.on{background:var(--secondary-container);color:var(--on-secondary-container);border-color:transparent;font-weight:500}

/* tables */
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--outline-var);vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--on-surface-var);font-weight:600;white-space:nowrap}
td.n,th.n{text-align:right;font-family:var(--mono);font-size:12px;white-space:nowrap}
tr.tot td{font-weight:600;background:var(--surface-2)}

/* text blocks */
pre.txt{background:var(--surface-3);border-radius:12px;padding:14px 16px;overflow:auto;
        max-height:520px;font-family:var(--mono);font-size:12px;line-height:1.55;white-space:pre-wrap;
        word-break:break-word;margin:0}
.md{background:var(--surface-3);border-radius:12px;padding:14px 18px;max-height:640px;overflow:auto;
    font-size:13.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.empty{color:var(--on-surface-var);font-style:italic;padding:10px 0}

/* findings */
.find{border:1px solid var(--outline-var);border-radius:12px;padding:13px 15px;margin-bottom:12px;background:var(--surface)}
.find.blocker{border-left:4px solid var(--error)}
.find.note{border-left:4px solid var(--warn)}
.find .fh{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
.find .rule{font-family:var(--mono);font-size:11.5px;color:var(--on-surface-var);margin-bottom:6px;word-break:break-word}
.find .claim{font-size:13.5px;line-height:1.55}
.find details{margin-top:9px}
.find summary{cursor:pointer;font-size:12.5px;color:var(--primary);font-weight:500;user-select:none}
.find .deep{margin-top:9px;padding:11px 13px;background:var(--surface-2);border-radius:10px;font-size:12.5px;line-height:1.6}
.find .deep b{display:block;margin:0 0 3px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--on-surface-var)}
.find .deep .blk+.blk{margin-top:11px}

/* routing callout */
.route{background:var(--primary-container);color:var(--on-primary-container);border-radius:12px;
       padding:13px 16px;margin-bottom:14px;font-size:13.5px;line-height:1.6}
.route .arrow{font-weight:600}
.prio{display:inline-flex;gap:4px;align-items:center;margin-left:4px}
.prio i{font-style:normal;background:rgba(255,255,255,.55);border-radius:6px;padding:1px 7px;font-size:11.5px;font-family:var(--mono)}
.prio i.win{background:var(--primary);color:#fff;font-weight:700}

/* gantt */
.gantt{padding:6px 20px 14px}
.grow{position:relative;height:26px;margin-bottom:3px}
.glab{position:absolute;left:0;top:5px;width:104px;font-family:var(--mono);font-size:11px;color:var(--on-surface-var)}
.gtrack{position:absolute;left:110px;right:6px;top:0;height:26px}
.gbar{position:absolute;top:3px;height:20px;border-radius:6px;color:#fff;font-size:11px;line-height:20px;
      padding:0 7px;white-space:nowrap;overflow:hidden;cursor:pointer;box-shadow:var(--e1)}
.gbar:hover{filter:brightness(1.12)}
.gbar.abort{background:repeating-linear-gradient(45deg,#B3261E,#B3261E 5px,#8C1D18 5px,#8C1D18 10px)}
.gbar.running{background:linear-gradient(90deg,var(--primary),#9A82DB);animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{50%{opacity:.62}}
.ggate{position:absolute;top:2px;width:3px;height:22px;background:var(--outline);border-radius:2px}
.gaxis{position:relative;height:18px;margin:6px 6px 0 110px;border-top:1px solid var(--outline-var)}
.gtick{position:absolute;font-size:10.5px;color:var(--on-surface-var);transform:translateX(-50%);top:3px;font-family:var(--mono)}

/* bars */
.sr{display:grid;grid-template-columns:132px 1fr 96px;gap:10px;align-items:center;margin-bottom:6px;font-size:12.5px}
.sr .n2{font-family:var(--mono);font-size:11.5px;color:var(--on-surface-var);text-align:right}
.sbar{height:16px;border-radius:8px;overflow:hidden;display:flex;background:var(--surface-5)}
.sbar i{display:block;height:100%}
.i-think{background:#B9AEDC}.i-tools{background:var(--primary)}

.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 18px;font-size:13px;align-items:baseline}
.kv dt{color:var(--on-surface-var);white-space:nowrap}
.kv dd{margin:0;font-family:var(--mono);font-size:12.5px;word-break:break-all}
.note-callout{background:var(--warn-container);color:var(--on-warn-container);border-radius:12px;padding:12px 15px;font-size:13px;line-height:1.6;margin-bottom:14px}
/* The last thing the agent did, on every step. On a running one it is the difference between
   working and stopped, so it is the one line here that moves on its own. */
/* A flex row, not a clipped line: the command is the part that may be cut and the time is the
   part that must survive, so the command shrinks and the time is pinned to the right. Clipping
   the whole line loses the time first, which is the one thing being read. */
.act{display:flex;gap:6px;align-items:baseline;margin-top:4px;font-size:11.5px;
  color:var(--on-surface-var);white-space:nowrap;min-width:0}
.act .ico{flex:0 0 auto;width:10px;opacity:.55}
.act .who{flex:0 0 auto}
/* A grid item defaults to min-width:auto and refuses to shrink below its content, so without
   this the whole head grows to fit the command and pushes the time out past the card. */
.step-head .hd{min-width:0}
.act .what{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;opacity:.6;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.act .ago{flex:0 0 auto;margin-left:auto;padding-left:10px;opacity:.55}
/* Re-rendered on every push, so the fade runs exactly when something new arrived — and never
   on a tick, when nothing did. */
.act.live{color:var(--primary);animation:actin .7s ease-out}
.act.live .ico{animation:blink 1.2s steps(1) infinite}
@keyframes blink{50%{opacity:.12}}
@keyframes actin{from{background:rgba(103,80,164,.16)}to{background:transparent}}
.stepitem .nm small.live{color:var(--primary);opacity:.9}
.dot.beat{animation:pulse 1.6s ease-in-out infinite}
/* ── the two views above a run ─────────────────────────────────────────────
   A run id is a fact about the pipeline; the spec is the thing being worked on. So the board
   opens on the specs, a spec opens on what has been run against it, and a run opens on what
   it did — each level answering one question instead of one list answering none. */
/* Every container below sets its own display, which beats the browser's rule for [hidden].
   Without this a hidden view is hidden and its header, its metrics and its button are not. */
[hidden]{display:none!important}
.crumbs{display:flex;align-items:center;gap:6px;margin:0 0 8px;font-size:12.5px;flex-wrap:wrap}
.crumbs a{color:var(--primary);cursor:pointer;text-decoration:none}
.crumbs a:hover{text-decoration:underline}
.crumbs i{opacity:.4;font-style:normal}
.board{max-width:1180px;margin:22px auto;padding:0 22px}
.specrow{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;cursor:pointer;
  border:1px solid transparent;text-align:left;width:100%;background:transparent;color:inherit;font:inherit}
.specrow:hover{background:var(--surface-2,rgba(0,0,0,.03));border-color:var(--divider,#E7E0EC)}
.specrow + .specrow{margin-top:2px}
.specrow .lead{min-width:0;flex:1 1 auto}
.specrow .nm{display:block;font-weight:500;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.specrow .sub{display:block;font-size:12px;opacity:.62;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.specrow .num{flex:0 0 auto;font-size:12px;opacity:.7;font-variant-numeric:tabular-nums;text-align:right;min-width:74px}
.specrow .num b{display:block;font-weight:600;font-size:13px;opacity:.95}
.specdot{flex:0 0 auto;width:9px;height:9px;border-radius:50%;background:var(--divider,#CAC4D0)}
.specdot.on{background:var(--primary)}
.grouphd{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;opacity:.55;margin:18px 0 6px;padding:0 14px}
.grouphd:first-child{margin-top:0}
.kindchip{flex:0 0 auto;font-size:11px;padding:2px 8px;border-radius:8px;background:var(--secondary-container);
  color:var(--on-secondary-container)}
.kindchip.refine{background:#EADDFF;color:#21005D}
.livebadge{position:fixed;left:22px;bottom:22px;z-index:40;padding:8px 14px;border-radius:14px;
  background:var(--secondary-container);color:var(--on-secondary-container);font-size:12px;font-variant-numeric:tabular-nums}
.livebadge.lost{background:#F9DEDC;color:#410E0B}
/* Quiet is not yet wrong — an agent thinking is quiet. Stalled has crossed the point where a
   person should look, so it says so instead of pulsing reassuringly. */
.livebadge.quiet{background:#FFF3D6;color:#4A3B00}
.livebadge.stalled{background:#F9DEDC;color:#410E0B;animation:pulse 1.6s ease-in-out infinite}
.gbar{transition:width .5s ease,left .5s ease}
.gbar.running{transition:none}
.fab{position:fixed;right:22px;bottom:22px;z-index:40;display:flex;flex-direction:column;gap:10px}
.fab button{width:auto;padding:13px 18px;border:0;border-radius:16px;background:var(--primary);color:#fff;
            box-shadow:var(--e2);cursor:pointer;font-size:13px;font-weight:500}
.fab button.sec{background:var(--secondary-container);color:var(--on-secondary-container)}
</style></head>
<body>
<div class="appbar"><div class="appbar-in">
  <div class="crumbs" id="crumbs" hidden></div>
  <h1><span id="hdTitle"></span> <span id="hdStatus"></span></h1>
  <div class="meta" id="hdMeta"></div>
  <div class="metrics" id="hdMetrics"></div>
</div></div>

<div class="board" id="viewIndex" hidden>
  <div class="card"><h2>Спеки</h2><div class="body" id="specList"></div></div>
</div>

<div class="board" id="viewSpec" hidden>
  <div class="card"><h2>Прогоны этой спеки</h2><div class="body" id="specRuns"></div></div>
</div>

<div id="viewRun">
<div class="shell">
  <nav class="rail"><h3>Шаги прогона</h3><div id="rail"></div></nav>
  <div>
    <div class="card"><h2>Хронология</h2><div class="gantt" id="gantt"></div></div>
    <div class="toolbar" id="filters"></div>
    <div id="steps"></div>
    <div class="card" id="cardRounds" hidden><h2>Раунды</h2><div class="body" id="rounds"></div></div>
    <div class="card" id="cardRouting"><h2>Маршрут: каждое решение роутера</h2><div class="body" id="routing"></div></div>
    <div class="card" id="cardSplit"><h2>Размышление против инструментов</h2><div class="body" id="split"></div></div>
    <div class="card" id="cardStages"><h2>По стадиям</h2><div class="body" id="stages"></div></div>
    <div class="card" id="cardCov"><h2>Покрытие ревью</h2><div class="body" id="cov"></div></div>
  </div>
</div>
</div>

<div class="fab" id="fab">
  <button class="sec" id="toggleAll">Развернуть всё</button>
</div>

<script id="run-data" type="application/json">${DATA}</script>
<script>
let D = JSON.parse(document.getElementById('run-data').textContent);

/* Everything below re-runs on every update, so what the reader has done to the page lives
   out here instead of in the DOM: which steps are open, which tab each one shows, which
   filter is on. Re-reading that from the markup would lose it, because the markup is what
   gets replaced. */
let stepEls = [];
let bound = false;
let first = true;
let allOpen = false;
let cursor = 0;
let activeFilter = 0;
let viewT0 = 0;
let viewSpan = 1;
const openIds = new Set();
const activeTab = new Map();

const COLOR ={ pre_implement:'#7E57C2', implement:'#3B6FD4', review:'#D4761B', qa:'#0F8F82', static_gate:'#79747E', preflight:'#79747E',
                lint:'#79747E', judge:'#D4761B', fix:'#3B6FD4' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* Round once, then split. Flooring the minutes off an unrounded value while rounding the
   seconds prints 0:60 for anything just under a minute — which only shows up once a caller
   passes a live, fractional number. */
const mmss = s => { const t = Math.round(s); return Math.floor(t/60) + ':' + String(t%60).padStart(2,'0'); };
const hhmm = ms => new Date(ms).toTimeString().slice(0,8);
const pctOf = (a,b) => b ? Math.round(a/b*100) : 0;
const nfmt = n => (n ?? 0).toLocaleString('ru-RU');
/* Cost and tokens live only in the closing summary the SDK sends. A stage killed by its fuse
   has none, and they cannot be recovered from the stream — its per-message usage is chunk
   deltas under different accounting. So the board says the figure is missing, never zero. */
const NO_SUMMARY = 'нет — убит до сводки';
const isBlocker = f => f.severity !== 'note' && f.severity !== 'info';
const stateChip = st => ({done:'', running:'<span class="chip c-run">идёт</span>', aborted:'<span class="chip c-block">убит</span>'}[st] ?? '');
const verdictChip = s => {
  const m = { pass:'c-pass', blocked:'c-block', fail:'c-block', error:'c-info', running:'c-run', aborted:'c-block' };
  return s ? '<span class="chip ' + (m[s]||'c-info') + '">' + esc(s) + '</span>' : '';
};

function render() {

/* ── header ─────────────────────────────────────────────────────────── */
const isRefine = D.kind === 'refine';
document.title = (isRefine ? 'Рефайн · ' : 'Прогон · ') + D.runId;
document.getElementById('hdTitle').textContent = D.spec || D.runId;
document.getElementById('hdStatus').innerHTML =
  verdictChip(D.status) + (D.totals.running ? ' <span class="chip c-run">' + (isRefine ? 'луп идёт' : 'прогон идёт') + '</span>' : '') +
  (D.halt ? ' <span class="chip c-block">' + (isRefine ? 'стоп' : 'halt') + ': ' + esc(D.halt.reason || '') + '</span>' : '');
document.getElementById('hdMeta').innerHTML =
  hhmm(D.t0) + ' → ' + hhmm(D.t1) +
  (D.branch ? ' · ветка <span class="mono">' + esc(D.branch) + '</span>' : '') +
  (D.diff ? ' · ' + esc(D.diff) : '') +
  (isRefine ? ' · ' + D.rounds.length + ' раунд(ов)' + (D.request ? ' · запрос: ' + esc(D.request) : '') : '') +
  (D.budget ? ' · бюджет: код ' + D.budget.codeAttempts + ', переплан ' + D.budget.handoffReplans + ', среда ' + D.budget.infra : '');

/* A refine loop has no diff and no review, so the two cards that are about those say nothing
   true about it; a run whose init died has no steps, so none of the four analyses has anything
   to analyse. Hidden rather than left empty: an empty card reads as a finding of zero — a
   coverage table saying 0 of 0 is indistinguishable from one saying nothing was reviewed. */
const bare = !D.steps.length;
document.getElementById('cardRouting').hidden = isRefine || bare;
document.getElementById('cardCov').hidden = isRefine || bare || !D.coverage;
document.getElementById('cardSplit').hidden = bare;
document.getElementById('cardStages').hidden = bare;
document.getElementById('cardRounds').hidden = !isRefine;

const T = D.totals;
document.getElementById('hdMetrics').innerHTML = [
  ['Время', mmss(T.wallSec), T.invocations + ' вызовов' + (T.aborted ? ' + ' + T.aborted + ' убит' : '') + (T.running ? ' + ' + T.running + ' идёт' : '')],
  ['Стоимость', '$' + T.costUsd, T.turns + ' ходов' + (T.estimated ? ' · ' + T.estimated + ' оценено' : '')
    + (T.unaccounted ? ' · без ' + T.unaccounted + ' убит.' : '')],
  /* Output alone is a thousandth of what the run actually moves: every turn re-reads the whole
     accumulated context, so a long stage is cache reads and almost nothing else. Showing only
     the output made a 131M-token run read as 79k. */
  ['Токенов', (T.outTokens/1000).toFixed(0) + 'k вых.',
    T.cacheTokens ? nfmt(Math.round(T.cacheTokens/1e6)) + 'M кэш' : (T.tokPerSec + ' ток/с')],
  ['Размышление', pctOf(T.apiSec, T.wallSec) + '%', mmss(T.apiSec) + ' в API'],
  ['Инструменты', pctOf(T.toolSec, T.wallSec) + '%', T.calls + ' вызовов'],
  ['Блокеры', String(T.blockers), T.notes + ' заметок'],
].map(([k,v,s]) => '<div class="metric"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>').join('');

/* ── gantt ──────────────────────────────────────────────────────────── */
(function(){
  const span = Math.max(1, D.t1 - D.t0);
  viewT0 = D.t0; viewSpan = span;
  const lanes = [...new Set(D.steps.map(s => s.stage))];
  const rows = lanes.map(lane => {
    const bars = D.steps.filter(s => s.stage === lane).map(s => {
      const l = (s.startedAt - D.t0) / span * 100;
      const w = Math.max(((s.endedAt ?? Date.now()) - s.startedAt) / span * 100, 0.4);
      if (s.script) return '<div class="ggate" style="left:' + l.toFixed(2) + '%" title="' + esc(s.stage + ' ' + s.attempt + ': ' + (s.status||'')) + '"></div>';
      const cls = s.state === 'aborted' ? ' abort' : s.state === 'running' ? ' running' : '';
      const bg = cls ? '' : ';background:' + (COLOR[s.stage] || '#79747E');
      const label = s.state === 'aborted' ? s.attempt + '✗' : s.attempt + ' · ' + mmss(s.wallSec) + (s.costUsd ? ' · $' + s.costUsd : '');
      const grows = s.state === 'running' ? ' data-start="' + s.startedAt + '" data-attempt="' + s.attempt + '"' : '';
      return '<div class="gbar' + cls + '" data-go="' + s.stage + '-' + s.attempt + '"' + grows + ' style="left:' + l.toFixed(2) + '%;width:' + w.toFixed(2) + '%' + bg + '" title="' + esc(s.stage + ' ' + s.attempt + ' · ' + (s.status||s.state)) + '">' + esc(label) + '</div>';
    }).join('');
    return '<div class="grow"><div class="glab">' + esc(lane) + '</div><div class="gtrack">' + bars + '</div></div>';
  }).join('');
  const ticks = Array.from({length:7}, (_,i) => '<div class="gtick" style="left:' + (i/6*100) + '%">' + hhmm(D.t0 + span*i/6) + '</div>').join('');
  document.getElementById('gantt').innerHTML = rows + '<div class="gaxis">' + ticks + '</div>';
})();

/* ── rail ───────────────────────────────────────────────────────────── */
document.getElementById('rail').innerHTML = D.steps.map((s,i) => {
  const bad = s.findings.some(isBlocker) || s.state === 'aborted';
  const dot = s.script ? '#79747E' : (COLOR[s.stage] || '#79747E');
  const last = s.tools && s.tools.length ? s.tools[s.tools.length - 1] : null;
  /* On a step that is going, what it is doing beats what model it is: the model does not
     change and the tool is the only thing on this line that ever moves. */
  const under = s.state === 'running' && last
    ? '<small class="live">' + esc(last.actor && last.actor !== s.agent ? last.actor + ' · ' + last.tool : last.tool) + '</small>'
    : '<small>' + esc(s.model || (s.script ? 'скрипт' : '')) + '</small>';
  return (i ? '<div class="connector"></div>' : '') +
    '<button class="stepitem" data-idx="' + i + '">' +
      '<span class="dot' + (s.state === 'running' ? ' beat' : '') + '" style="background:' + dot + '">' + (s.script ? '·' : s.attempt) + '</span>' +
      '<span class="nm">' + esc(s.stage) + under + '</span>' +
      '<span class="tm">' + (s.script ? '—' : mmss(s.wallSec)) + (bad ? ' ●' : '') + '</span>' +
    '</button>';
}).join('');

/* ── steps ──────────────────────────────────────────────────────────── */
function findingHtml(f) {
  const sev = isBlocker(f) ? 'blocker' : 'note';
  const w = f.witness;
  const deep = [
    w && w.detail ? '<div class="blk"><b>Свидетельство' + (w.kind ? ' · ' + esc(w.kind) : '') + '</b>' + esc(w.detail) + (w.source ? '<br><span class="mono dim">' + esc(w.source) + '</span>' : '') + '</div>' : '',
    f.suggestedFix ? '<div class="blk"><b>Предложенная починка</b>' + esc(f.suggestedFix) + '</div>' : '',
  ].join('');
  return '<div class="find ' + sev + '">' +
    '<div class="fh">' +
      '<span class="chip ' + (sev === 'blocker' ? 'c-block' : 'c-note') + '">' + esc(f.severity) + '</span>' +
      '<span class="chip c-' + esc(f.target) + '">→ ' + esc(f.target) + '</span>' +
      '<b>' + esc(f.id) + '</b>' +
      (f._carriedFrom ? '<span class="chip out">повтор из ' + esc(f._carriedFrom) + '</span>' : '') +
      '<span class="mono dim">' + esc(f.file || '') + (f.symbol ? '#' + esc(f.symbol) : '') + (f.line ? ':' + f.line : '') + '</span>' +
    '</div>' +
    '<div class="rule">' + esc(f.rule) + '</div>' +
    '<div class="claim">' + esc(f.claim) + '</div>' +
    (deep ? '<details><summary>Свидетельство и починка</summary><div class="deep">' + deep + '</div></details>' : '') +
  '</div>';
}

/* The last thing the agent actually did. On a running step it is the answer to "is it alive",
   so it carries a live clock; on a finished one the wall time it happened at is more use than
   a distance from now. The actor is named only when it is not the agent the orchestrator
   started — that is a sub-agent, and whose work it is matters more than the tool. */
function actHtml(s) {
  const t = s.tools && s.tools.length ? s.tools[s.tools.length - 1] : null;
  if (!t) return '';
  const live = s.state === 'running';
  const who = t.actor && t.actor !== s.agent ? '<b>' + esc(t.actor) + '</b> · ' : '';
  const when = live ? '' : hhmm(t.ts || (s.startedAt + t.at * 1000));
  return '<span class="act' + (live ? ' live' : '') + '"' + (t.ts ? ' data-ts="' + t.ts + '"' : '') + '>' +
    '<span class="ico">' + (live ? '▸' : '↳') + '</span>' +
    '<span class="who">' + who + esc(t.tool) + '</span>' +
    (t.what ? '<span class="what">' + esc(t.what.slice(0, 160)) + '</span>' : '') +
    '<span class="ago">' + when + '</span></span>';
}

function routeHtml(s) {
  const bits = [];
  if (s.routedHere) bits.push('<div><span class="arrow">← пришло сюда:</span> ' + esc(s.routedHere.why) + '</div>');
  if (s.routing) {
    const prio = D.priority.map(t => '<i class="' + (t === s.routing.winner ? 'win' : '') + '">' + t + '</i>').join('');
    bits.push('<div style="margin-top:8px"><span class="arrow">Победил адрес:</span> <b>' + esc(s.routing.winner) + '</b>' +
      '<span class="prio">' + prio + '</span></div>' +
      (s.routing.why ? '<div style="margin-top:4px">' + esc(s.routing.why) + '</div>' : '') +
      '<div style="margin-top:4px">Причина маршрута: <b>' + s.routing.cause.join(', ') + '</b>' +
      (s.routing.alongside.length
        ? '. Поехали следом, не будучи причиной: ' + s.routing.alongside.map(a => a.id + ' (' + a.target + ')').join(', ')
        : '') + '</div>');
  }
  if (s.routedAway) bits.push('<div style="margin-top:8px"><span class="arrow">→ ушло в ' + esc(s.routedAway.to || s.routedAway.kind) + ':</span> ' + esc(s.routedAway.why) + '</div>');
  return bits.length ? '<div class="route">' + bits.join('') + '</div>' : '';
}

function paneReceived(s) {
  const meta = '<dl class="kv">' +
    '<dt>Агент</dt><dd>' + esc(s.agent || 'скрипт') + '</dd>' +
    '<dt>Модель</dt><dd>' + esc(s.model || '—') + '</dd>' +
    (s.resumedSession ? '<dt>Продолжает сессию</dt><dd>' + esc(s.resumedSession) + '</dd>' : '') +
    (s.sessionId ? '<dt>Своя сессия</dt><dd>' + esc(s.sessionId) + '</dd>' : '') +
    (s.fuseMin ? '<dt>Предохранитель</dt><dd>' + s.fuseMin + ' мин</dd>' : '') +
    (s.headAtStart ? '<dt>HEAD на старте</dt><dd>' + esc(s.headAtStart.slice(0,10)) + '</dd>' : '') +
  '</dl>';
  const prompt = s.prompt
    ? '<h4 style="margin:16px 0 8px;font-size:13px">Промпт, который получил агент</h4><pre class="txt">' + esc(s.prompt) + '</pre>'
    : (s.script
      ? '<div class="note-callout">Скрипт-гейт: ни промпта, ни модели. Только вердикт.</div>'
      : '<div class="note-callout">Промпт не записан: этот прогон старше, чем захват входных данных. Оба оркестратора — <span class="mono">ship.mjs</span> и <span class="mono">refine-loop.mjs</span> — пишут промпт до того, как дёрнут агента, так что у новых прогонов здесь будет ровно то, что он получил.</div>');
  return routeHtml(s) + meta + prompt;
}

function paneDid(s) {
  const commits = s.commits && s.commits.length
    ? '<h4 style="margin:0 0 8px;font-size:13px">Коммиты в окне этого шага</h4><table><tr><th>SHA</th><th>Сообщение</th><th>Объём</th></tr>' +
      s.commits.map(c => '<tr><td class="mono">' + esc(c.sha) + '</td><td>' + esc(c.subject) + '</td><td class="dim">' + esc(c.stat) + '</td></tr>').join('') +
      '</table>'
    : '';
  const result = s.result
    ? '<h4 style="margin:16px 0 8px;font-size:13px">Заключительное сообщение агента</h4><div class="md">' + esc(s.result) + '</div>'
    : '<div class="empty">Заключительного сообщения нет' + (s.state === 'running' ? ' — шаг ещё идёт.' : s.state === 'aborted' ? ' — процесс был убит.' : '.') + '</div>';
  const report = s.report
    ? '<details style="margin-top:14px"><summary style="cursor:pointer;color:var(--primary);font-weight:500">Отчёт стадии целиком (' + s.report.length.toLocaleString('ru-RU') + ' символов)</summary><div class="md" style="margin-top:10px">' + esc(s.report) + '</div></details>'
    : '';
  return commits + result + report;
}

function paneVerdict(s) {
  if (!s.findings.length && !s.status) return '<div class="empty">Вердикта нет.</div>';
  const suites = s.suites ? '<h4 style="margin:14px 0 8px;font-size:13px">Прогоны тестов</h4><table><tr><th>Уровень</th><th>Результат</th><th>Комментарий</th></tr>' +
    ['unit','int','e2e'].map(k => {
      const x = s.suites[k]; if (!x) return '';
      const res = x.skipped ? '<span class="chip c-info">пропущен</span>'
        : (x.passed ?? 0) + ' ✓' + (x.failed ? ' / ' + x.failed + ' ✗' : '') + (x.ms ? ' · ' + (typeof x.ms === 'number' ? (x.ms/1000).toFixed(1) + ' с' : esc(x.ms)) : '');
      return '<tr><td><b>' + k + '</b></td><td>' + res + '</td><td class="dim" style="font-size:12px">' + esc(x.reason || x.note || (x.files||[]).join(', ')) + '</td></tr>';
    }).join('') + '</table>' : '';
  const cov = s.covered ? '<div class="note-callout"><b>Заявленное покрытие:</b> ' +
      (s.covered.files != null ? s.covered.files + ' из ' + (s.covered.of ?? '?') + ' файлов. ' : '') +
      esc(s.covered.note || '') +
      (s.coverageNamed != null ? '<br><b>Измеренное по журналу:</b> ' + s.coverageNamed + ' из ' + D.coverage.files + '.' : '') +
    '</div>' : (s.coverageNamed != null ? '<div class="note-callout"><b>Измеренное покрытие:</b> ' + s.coverageNamed + ' из ' + D.coverage.files + ' файлов дифа.</div>' : '');
  const bl = s.findings.filter(isBlocker), nt = s.findings.filter(f => !isBlocker(f));
  return routeHtml(s) + cov +
    (bl.length ? '<h4 style="margin:0 0 10px;font-size:13px">Блокеры — ' + bl.length + '</h4>' + bl.map(findingHtml).join('') : '') +
    (nt.length ? '<h4 style="margin:18px 0 10px;font-size:13px">Заметки — ' + nt.length + ' <span class="dim" style="font-weight:400">(не возвращают работу, копятся для человека)</span></h4>' + nt.map(findingHtml).join('') : '') +
    (!bl.length && !nt.length ? '<div class="empty">Находок нет — чистый ' + esc(s.status || '') + '.</div>' : '') + suites;
}

function paneTools(s) {
  if (!s.tools.length) return '<div class="empty">Вызовов инструментов в журнале нет.</div>';
  const mix = Object.entries(s.byTool).sort((a,b) => b[1]-a[1])
    .map(([t,n]) => '<span class="chip out">' + esc(t) + ' · ' + n + '</span>').join(' ');
  const rows = s.tools.map(t =>
    '<tr><td class="n">+' + t.at + 'с</td><td>' + esc(t.tool) + '</td><td class="n">' + (t.sec >= 1 ? t.sec + ' с' : '') + '</td>' +
    '<td class="mono" style="word-break:break-all">' + esc(t.what) + '</td></tr>').join('');
  return '<div style="margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap">' + mix + '</div>' +
    '<table><tr><th class="n">Смещение</th><th>Инструмент</th><th class="n">Длит.</th><th>Что</th></tr>' + rows + '</table>';
}

function paneMetrics(s) {
  const bar = '<div class="sr"><span>время шага</span><div class="sbar">' +
    '<i class="i-think" style="width:' + s.thinkPct + '%"></i><i class="i-tools" style="width:' + (100-s.thinkPct) + '%"></i>' +
    '</div><span class="n2">' + s.thinkPct + '% / ' + (100-s.thinkPct) + '%</span></div>';
  return bar + '<dl class="kv" style="margin-top:14px">' + [
    ['Состояние', s.state + (s.stopReason ? ' · ' + s.stopReason : '')],
    ['Wall', mmss(s.wallSec)],
    ['В API (размышление и генерация)', s.apiSec ? mmss(s.apiSec) : '—'],
    ['В инструментах', s.toolSec + ' с в ' + s.calls + ' вызовах'],
    ['Ходов', s.turns ?? '—'],
    ['Выходных токенов', s.tokens
      ? nfmt(s.tokens.out) + (s.tokensRecovered ? ' · из транскрипта сессии' : (s.tokPerSec ? ' · ' + s.tokPerSec + ' ток/с' : ''))
      : NO_SUMMARY],
    ['Кэш прочитан / записан', s.tokens ? nfmt(s.tokens.cacheRead) + ' / ' + nfmt(s.tokens.cacheWrite) : NO_SUMMARY],
    ['Стоимость', s.costUsd == null ? NO_SUMMARY
      : s.costEstimated
        ? '≈$' + s.costUsd + ' — оценка по ставкам этого прогона' + (s.costErrPct ? ', ±' + s.costErrPct + '%' : '')
        : '$' + s.costUsd],
    ['Артефакты', Object.entries(s.has).filter(([,v]) => v).map(([k]) => k).join(', ') || 'нет'],
  ].map(([k,v]) => '<dt>' + k + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>';
}

const TABS = [
  ['Получил', paneReceived, s => s.prompt ? 1 : 0],
  ['Сделал', paneDid, s => (s.commits||[]).length],
  ['Вердикт', paneVerdict, s => s.findings.length],
  ['Инструменты', paneTools, s => s.calls],
  ['Метрики', paneMetrics, () => 0],
];

document.getElementById('steps').innerHTML = (bare
  ? '<div class="card"><div class="body"><p class="dim" style="margin:0">Ни одного шага. ' +
    (D.status === 'half-created'
      ? 'Оркестратор не дописал <span class="mono">run.json</span> — прогон умер на инициализации, и всё, что от него осталось, это имя директории.'
      : 'Прогон ещё ничего не запустил.') + '</p></div></div>'
  : '') + D.steps.map((s,i) => {
  const bl = s.findings.filter(isBlocker).length, nt = s.findings.length - bl;
  const color = COLOR[s.stage] || '#79747E';
  const sub = [
    s.model || (s.script ? 'скрипт-гейт' : ''),
    s.script ? null : mmss(s.wallSec) + ' (' + s.thinkPct + '% размышление)',
    /* A killed stage has no cost, not a cost of nothing. Saying so beside the turns it did
       run is what keeps the most expensive attempt of a run from reading as the cheapest. */
    s.script ? null
      : s.costUsd == null ? 'стоимость неизвестна'
        : (s.costEstimated ? '≈$' + s.costUsd + ' (оценка)' : '$' + s.costUsd),
    s.turns ? s.turns + ' ходов' : null,
    s.calls ? s.calls + ' вызовов инстр.' : null,
    s.resumedSession ? '↻ продолжает сессию' : null,
  ].filter(Boolean).join(' · ');
  const tabs = TABS.map(([name,,count], ti) => {
    const c = count(s);
    return '<button class="tab' + (ti===0?' on':'') + '" data-s="' + i + '" data-t="' + ti + '">' + name +
      (c ? '<span class="badge">' + c + '</span>' : '') + '</button>';
  }).join('');
  const panes = TABS.map(([,fn], ti) => '<div class="pane' + (ti===0?' on':'') + '" data-s="' + i + '" data-t="' + ti + '">' + (s.script && ti < 4 ? '<div class="empty">Скрипт-гейт: ни промпта, ни модели. Только вердикт.</div>' + (ti===2 ? paneVerdict(s) : '') : fn(s)) + '</div>').join('');
  return '<div class="card step" id="' + s.stage + '-' + s.attempt + '" data-idx="' + i + '"' +
    (bl ? ' data-bad="1"' : '') + (s.state !== 'done' ? ' data-odd="1"' : '') + '>' +
    '<button class="step-head"><span class="idx" style="background:' + color + '">' + (s.script ? '·' : s.attempt) + '</span>' +
      '<span class="hd"><span class="ttl">' + esc(s.label || (s.stage + ' ' + s.attempt)) + ' ' + verdictChip(s.status) + ' ' + stateChip(s.state) +
        (bl ? '<span class="chip c-block">' + bl + ' блок.</span>' : '') +
        (nt ? '<span class="chip c-note">' + nt + ' зам.</span>' : '') +
      '</span><span class="sub">' + esc(sub) + '</span>' + actHtml(s) + '</span>' +
      '<span class="caret">▾</span></button>' +
    '<div class="panel"><div class="tabs">' + tabs + '</div>' + panes + '</div></div>';
}).join('');

/* ── interaction ────────────────────────────────────────────────────── */
stepEls = [...document.querySelectorAll('.step')];
function openStep(i, scroll) {
  const el = stepEls[i]; if (!el) return;
  el.classList.add('open'); openIds.add(el.id);
  document.querySelectorAll('.stepitem').forEach(b => b.classList.toggle('on', +b.dataset.idx === i));
  if (scroll) el.scrollIntoView({ block:'start' });
}

/* Put back what the reader had before this render replaced the markup. A step is remembered
   by its id rather than by its index: an attempt that starts while the page is open shifts
   every index after it, and restoring by position would reopen the wrong steps. */
stepEls.forEach(el => {
  if (allOpen || openIds.has(el.id)) el.classList.add('open');
  const t = activeTab.get(el.id);
  if (t != null) {
    el.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    el.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.dataset.t === t));
  }
});

if (!bound) {
document.addEventListener('click', e => {
  const head = e.target.closest('.step-head');
  if (head) { const el = head.closest('.step'); el.classList.toggle('open');
    if (el.classList.contains('open')) { openIds.add(el.id); openStep(+el.dataset.idx, false); }
    else openIds.delete(el.id);
    return; }
  const tab = e.target.closest('.tab');
  if (tab) {
    const { s, t } = tab.dataset;
    const step = tab.closest('.step');
    if (step) activeTab.set(step.id, t);
    document.querySelectorAll('.tab[data-s="' + s + '"]').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    document.querySelectorAll('.pane[data-s="' + s + '"]').forEach(p => p.classList.toggle('on', p.dataset.t === t));
    return;
  }
  const item = e.target.closest('.stepitem');
  if (item) { openStep(+item.dataset.idx, true); return; }
  const bar = e.target.closest('[data-go]');
  if (bar) { const el = document.getElementById(bar.dataset.go); if (el) { el.classList.add('open'); openStep(+el.dataset.idx, true); } }
});
}

const FILTERS = [
  ['все', () => true],
  ['с блокерами', el => el.dataset.bad === '1'],
  ['незавершённые', el => el.dataset.odd === '1'],
];
document.getElementById('filters').innerHTML = FILTERS.map(([n],i) =>
  '<button class="fbtn' + (i===activeFilter?' on':'') + '" data-f="' + i + '">' + n + '</button>').join('') +
  '<span class="dim" style="margin-left:auto;font-size:12px">клик по полосе на диаграмме открывает шаг · j / k — следующий и предыдущий</span>';
const keepNow = FILTERS[activeFilter][1];
stepEls.forEach(el => { el.style.display = keepNow(el) ? '' : 'none'; });

if (!bound) {
document.getElementById('filters').addEventListener('click', e => {
  const b = e.target.closest('.fbtn'); if (!b) return;
  activeFilter = +b.dataset.f;
  document.querySelectorAll('.fbtn').forEach(x => x.classList.toggle('on', x === b));
  const keep = FILTERS[activeFilter][1];
  stepEls.forEach(el => { el.style.display = keep(el) ? '' : 'none'; });
});

document.getElementById('toggleAll').addEventListener('click', e => {
  allOpen = !allOpen;
  stepEls.forEach(el => { el.classList.toggle('open', allOpen); if (allOpen) openIds.add(el.id); else openIds.delete(el.id); });
  e.target.textContent = allOpen ? 'Свернуть всё' : 'Развернуть всё';
});

document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea')) return;
  if (e.key === 'j' || e.key === 'k') {
    cursor = Math.max(0, Math.min(stepEls.length - 1, cursor + (e.key === 'j' ? 1 : -1)));
    stepEls[cursor].classList.add('open'); openStep(cursor, true);
  }
});
}

/* ── routing log ────────────────────────────────────────────────────── */
document.getElementById('routing').innerHTML =
  '<p class="dim" style="margin-top:0">Порядок приоритета адресов — <span class="mono">' + D.priority.join(' → ') + '</span>. ' +
  'Один вердикт может нести блокеры с разными адресами, но маршрут берётся один: побеждает самый приоритетный из присутствующих, ' +
  'остальные едут следом. Текст в колонке «почему» написан самим роутером в момент решения.</p>' +
  '<table><tr><th class="n">Время</th><th>Откуда</th><th>Куда</th><th>Почему</th></tr>' +
  D.decisions.map(d => '<tr><td class="n">' + hhmm(d.at) + '</td><td>' + esc(d.from) + '</td>' +
    '<td>' + (d.to ? esc(d.to) : '<b>' + esc(d.kind) + '</b>') + '</td><td>' + esc(d.why) + '</td></tr>').join('') +
  '</table>';

/* ── think/tools split ──────────────────────────────────────────────── */
document.getElementById('split').innerHTML =
  '<p class="dim" style="margin-top:0">Время в API почти линейно по выходным токенам — ' + D.totals.tokPerSec +
  ' ток/с в среднем. Длительность ≈ токены ÷ ' + D.totals.tokPerSec + ' + инструменты (' + mmss(D.totals.apiSec) +
  ' + ' + mmss(D.totals.toolSec) + ' + ' + D.totals.orchestrationSec + ' с оркестрации = ' + mmss(D.totals.wallSec) + ').</p>' +
  D.steps.filter(s => !s.script && s.wallSec).map(s =>
    '<div class="sr"><span>' + esc(s.stage) + ' ' + s.attempt + '</span><div class="sbar">' +
    '<i class="i-think" style="width:' + s.thinkPct + '%"></i><i class="i-tools" style="width:' + (100-s.thinkPct) + '%"></i>' +
    '</div><span class="n2">' + s.toolSec + ' с инстр.</span></div>').join('');

/* ── stages ─────────────────────────────────────────────────────────── */
document.getElementById('stages').innerHTML =
  '<table><tr><th>Стадия</th><th>Модель</th><th class="n">Вызовов</th><th class="n">Wall</th><th class="n">Ходов</th>' +
  '<th class="n">Токенов</th><th class="n">% ток.</th><th class="n">$</th><th class="n">% денег</th><th class="n">Размышл.</th></tr>' +
  D.byStage.map(b => '<tr><td>' + esc(b.stage) + '</td><td class="mono">' + esc(b.model||'') + '</td>' +
    '<td class="n">' + b.invocations + '</td><td class="n">' + mmss(b.wallSec) + '</td><td class="n">' + b.turns + '</td>' +
    '<td class="n">' + nfmt(b.outTokens) + '</td><td class="n">' + pctOf(b.outTokens, D.totals.outTokens) + '%</td>' +
    '<td class="n">' + b.costUsd.toFixed(2) + '</td><td class="n">' + pctOf(b.costUsd*100, D.totals.costUsd*100) + '%</td>' +
    '<td class="n">' + pctOf(b.wallSec-b.toolSec, b.wallSec) + '%</td></tr>').join('') + '</table>';

/* ── rounds, on a refine loop ───────────────────────────────────────── */
if (isRefine) document.getElementById('rounds').innerHTML =
  '<p class="dim" style="margin-top:0">Каждый раунд — ворота по возрастанию цены: T0 бесплатен, ' +
  'T1 — те же ворота, на которых останавливается ship, T2 — судья. Раунд заканчивается коммитом, ' +
  'и следующий судит этот коммит, а не документ заново.</p>' +
  '<table><tr><th class="n">Раунд</th><th class="n">T0</th><th>T1 план</th><th>T2 судья</th><th>Починка</th><th>Коммит</th></tr>' +
  D.rounds.map(r => '<tr><td class="n">' + r.round + '</td>' +
    '<td class="n">' + (r.lint == null ? '—' : r.lint === 0 ? 'чисто' : r.lint) + '</td>' +
    '<td>' + (r.plan ? esc(r.plan.status) + (r.plan.specBlockers ? ' · ' + r.plan.specBlockers + ' в спеку' : '') : '—') + '</td>' +
    '<td>' + (r.judge ? r.judge.blockers + ' блок. / ' + r.judge.notes + ' зам. · ' + esc(r.judge.mode || '') : '—') + '</td>' +
    '<td>' + (r.fix ? 'починено ' + r.fix.fixed + ', решено ' + r.fix.decided + ', человеку ' + r.fix.left : '—') + '</td>' +
    '<td class="mono">' + (r.commit ? esc(r.commit) : '—') + '</td></tr>').join('') +
  '</table>';

/* ── coverage ───────────────────────────────────────────────────────── */
if (D.coverage) document.getElementById('cov').innerHTML =
  D.coverage.perPass.map(p => '<div class="sr"><span>review ' + p.attempt + '</span>' +
    '<div class="sbar"><i class="i-tools" style="width:' + pctOf(p.named, D.coverage.files) + '%"></i></div>' +
    '<span class="n2">' + p.named + ' / ' + D.coverage.files + '</span></div>').join('') +
  '<p style="margin-top:14px">Ни одним проходом не названы: <b>' + D.coverage.never.length + '</b> из ' + D.coverage.files + '.</p>' +
  (D.coverage.never.length ? '<table><tr><th class="n">Строк</th><th>Файл</th></tr>' +
    D.coverage.never.map(f => '<tr><td class="n">' + f.lines + '</td><td class="mono">' + esc(f.path) + '</td></tr>').join('') + '</table>' : '') +
  '<p class="dim" style="font-size:12px">Файл считается названным, когда его путь встретился в собственном вызове инструмента ревью. ' +
  'Пути нормализуются: <span class="mono">Read</span> на Windows отдаёт абсолютный путь с обратными слэшами, и без нормализации ' +
  'реестр не засчитывает ни одного чтения.</p>';

bound = true;
if (first) { first = false; if (D.steps.length) openStep(0, false); }
/* Fill the live clocks now rather than leaving them blank until the first tick, a second
   later — the gap is small and it is the first thing the eye lands on. */
tick();
}

/* ── the second hand ────────────────────────────────────────────────────
   Between two pushes nothing arrives, and an agent can think for minutes without touching a
   tool. Redrawing the page on a timer would be a lie about new data; not moving at all is a
   lie about being stuck. So the clock — and only the clock — advances locally: the running
   bar grows, its own elapsed time counts, and the silence is named. Everything that is a
   fact about the run still arrives from the run. */
function tick() {
  const now = Date.now();
  const span = Math.max(viewSpan, now - viewT0);

  document.querySelectorAll('.gbar.running[data-start]').forEach(el => {
    const startedAt = +el.dataset.start;
    const sec = (now - startedAt) / 1000;
    el.style.width = Math.min(100 - (startedAt - viewT0) / span * 100, Math.max((now - startedAt) / span * 100, 0.4)).toFixed(2) + '%';
    el.textContent = el.dataset.attempt + ' · ' + mmss(sec);
  });

  document.querySelectorAll('.act.live[data-ts]').forEach(el => {
    const ms = now - +el.dataset.ts;
    const ago = el.querySelector('.ago');
    if (ago) ago.textContent = ms < 2000 ? 'только что' : ms < 60000 ? Math.round(ms / 1000) + ' с назад' : mmss(ms / 1000) + ' назад';
  });

  const wall = document.querySelector('#hdMetrics .metric .v');
  if (wall && D.totals.running) wall.textContent = mmss(D.totals.wallSec + (now - D.generatedAt) / 1000);

  return now;
}

render();

/* ── the three views ────────────────────────────────────────────────────
   Specs, then what has been run against one, then one run. The deepest view is the report
   this page has always been; the two above it exist because a flat list of run ids answers
   "which run is 14-44-29" and never "where is spec 02", which is the question people arrive
   with. Only the run view survives on a file:// snapshot — the other two are a live index. */
let IDX = null;
let view = 'run';
let openSpec = null;

const VIEWS = { index: 'viewIndex', spec: 'viewSpec', run: 'viewRun' };
const specOf = (p) => (IDX ? IDX.specs.find((s) => s.path === p) ?? null : null);
const entryOf = (id) => {
  if (!IDX) return null;
  for (const s of [...IDX.specs, { entries: IDX.orphans }]) {
    const e = s.entries.find((x) => x.id === id);
    if (e) return e;
  }
  return null;
};

function show(v) {
  view = v;
  for (const [k, id] of Object.entries(VIEWS)) document.getElementById(id).hidden = k !== v;
  document.getElementById('fab').hidden = v !== 'run';
  document.getElementById('crumbs').hidden = !IDX;
  document.getElementById('hdMetrics').hidden = v !== 'run';
}

function crumbs() {
  const el = document.getElementById('crumbs');
  if (!IDX) { el.hidden = true; return; }
  /* Taken from the payload on screen rather than from what was clicked to get here: a run
     opened from a link, or one whose payload arrived after the view switched, would otherwise
     be filed under whichever spec the reader happened to pass through. */
  if (view === 'run') {
    const e = entryOf(D.runId);
    if (e) openSpec = e.spec ?? null;
  }
  const bits = ['<a data-go="#">Спеки</a>'];
  if (view !== 'index') {
    const s = specOf(openSpec);
    if (s) bits.push('<i>›</i><a data-go="#spec:' + esc(s.path) + '">' + esc(s.key) + '</a>');
    if (view === 'run') bits.push('<i>›</i><span>' + esc(D.runId) + '</span>');
  }
  el.innerHTML = bits.join('');
}

const wallOf = (sec) => (sec >= 3600 ? Math.round(sec / 360) / 10 + ' ч' : Math.round(sec / 60) + ' мин');

function renderIndex() {
  document.title = 'Спеки · борд';
  document.getElementById('hdTitle').textContent = 'Спеки';
  document.getElementById('hdStatus').innerHTML =
    IDX.specs.some((s) => s.running) ? '<span class="chip c-run">что-то идёт</span>' : '';
  const touched = IDX.specs.filter((s) => s.entries.length);
  const untouched = IDX.specs.filter((s) => !s.entries.length);
  document.getElementById('hdMeta').innerHTML =
    touched.length + ' из ' + IDX.specs.length + ' спек что-то запускали · $' +
    touched.reduce((a, s) => a + s.totals.costUsd, 0).toFixed(2) + ' всего';

  const row = (s) => '<button class="specrow" data-go="#spec:' + esc(s.path) + '">' +
    '<span class="specdot' + (s.running ? ' on' : '') + '"></span>' +
    '<span class="lead"><span class="nm">' + esc(s.key) + ' · ' + esc(s.title || s.path) + '</span>' +
    '<span class="sub">' + (s.entries.length
      ? s.entries.slice(0, 3).map((x) => esc(x.kind === 'refine' ? 'refine' : 'ship') + ' ' + esc(x.detail || x.status)).join(' · ')
        + (s.entries.length > 3 ? ' · +' + (s.entries.length - 3) : '')
      : 'ничего не запускалось') +
    (s.dependsOn.length ? ' · зависит от ' + esc(s.dependsOn.join(', ')) : '') + '</span></span>' +
    (s.entries.length
      /* Cost sums; wall clock does not. A run abandoned in August and stamped again in
         September spans a fortnight of nobody working, and four of those add up to a number
         that reads as effort and is calendar. */
      ? '<span class="num"><b>$' + s.totals.costUsd.toFixed(2) + '</b>' + s.entries.length + ' прогон(ов)</span>'
      : '') + '</button>';

  document.getElementById('specList').innerHTML =
    (touched.length ? '<div class="grouphd">Работа велась</div>' + touched.map(row).join('') : '') +
    (untouched.length ? '<div class="grouphd">Пока не запускалось</div>' + untouched.map(row).join('') : '') +
    (IDX.orphans.length
      ? '<div class="grouphd">Прогоны без спеки — она переименована или удалена</div>' +
        IDX.orphans.map((e) => '<button class="specrow" data-go="#' + esc(e.id) + '">' +
          '<span class="specdot"></span><span class="lead"><span class="nm">' + esc(e.id) + '</span>' +
          '<span class="sub">' + esc(e.status) + '</span></span></button>').join('')
      : '');
}

function renderSpec(path) {
  const s = specOf(path);
  if (!s) { location.hash = ''; return; }
  document.title = s.key + ' · борд';
  document.getElementById('hdTitle').textContent = s.key + ' · ' + (s.title || '');
  document.getElementById('hdStatus').innerHTML = s.running ? '<span class="chip c-run">идёт</span>' : '';
  document.getElementById('hdMeta').innerHTML =
    '<span class="mono">' + esc(s.path) + '</span>' +
    (s.dependsOn.length ? ' · зависит от <b>' + esc(s.dependsOn.join(', ')) + '</b>' : '') +
    ' · ' + s.totals.ship + ' ship, ' + s.totals.refine + ' refine · $' + s.totals.costUsd.toFixed(2) +
    (s.totals.blockers ? ' · <b>' + s.totals.blockers + '</b> блокеров за всё время' : '');

  document.getElementById('specRuns').innerHTML = s.entries.length
    ? s.entries.map((e) => '<button class="specrow" data-go="#' + esc(e.id) + '">' +
        '<span class="specdot' + (e.running ? ' on' : '') + '"></span>' +
        '<span class="kindchip' + (e.kind === 'refine' ? ' refine' : '') + '">' + (e.kind === 'refine' ? 'refine' : 'ship') + '</span>' +
        '<span class="lead"><span class="nm">' + esc(e.label) + ' ' + verdictChip(e.status) + '</span>' +
        '<span class="sub">' + (e.detail ? esc(e.detail) + ' · ' : '') +
          (e.startedAt ? hhmm(e.startedAt) : '') +
          (e.blockers ? ' · ' + e.blockers + ' блок.' : '') + (e.notes ? ' · ' + e.notes + ' зам.' : '') +
          (e.branch ? ' · ' + esc(e.branch) : '') + '</span></span>' +
        '<span class="num"><b>$' + e.costUsd.toFixed(2) + '</b>' + wallOf(e.wallSec) + '</span></button>').join('')
    : '<p class="dim">По этой спеке ещё ничего не запускали.</p>';
}

/* The hash is the whole of the navigation state, so a reload lands where the reader was and a
   link is worth sending to someone. */
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (IDX && (!h || h === 'specs')) { show('index'); renderIndex(); crumbs(); return; }
  if (h.startsWith('spec:')) { openSpec = h.slice(5); show('spec'); renderSpec(openSpec); crumbs(); return; }
  if (h && h !== D.runId) { wanted(h); return; }
  show('run');
  crumbs();
}

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (!go) return;
  e.preventDefault();
  location.hash = go.dataset.go.replace(/^#/, '');
  route();
});
addEventListener('hashchange', route);

/* Asking for a run the page is not holding: the payload has to arrive before it can be drawn,
   so the switch happens when it does. */
let wanted = () => {};

/* ── live ───────────────────────────────────────────────────────────────
   Served over http by run-watch.mjs, the page follows the run: the watcher pushes a fresh
   payload whenever the run directory changes, and the whole view is drawn again from it.
   Opened as a file it stays exactly what it was — a snapshot — because a file:// page has the
   null origin and may not fetch its own directory. */
if (location.protocol === 'http:' || location.protocol === 'https:') {
  const live = document.createElement('div');
  live.className = 'livebadge';
  live.textContent = '● следит';
  document.body.appendChild(live);

  let es = null;
  let shown = D.runId;

  /* Switching runs keeps nothing: the ids belong to the run that is leaving, so an open step
     or a chosen tab would either miss or, worse, land on an unrelated step that happens to be
     called review-2 as well. */
  function reset() {
    openIds.clear(); activeTab.clear();
    activeFilter = 0; allOpen = false; cursor = 0; first = true;
  }

  function connect(entry) {
    if (es) es.close();
    live.classList.remove('lost');
    live.textContent = '● следит';
    es = new EventSource('feed' + (entry ? '?entry=' + encodeURIComponent(entry) : ''));

    /* The index is pushed to everyone on every change, whichever view they are on: a run that
       starts while somebody is reading another one has no watcher to attach, and a board that
       only learns about it on reload is blind exactly when someone is looking. */
    es.addEventListener('index', (ev) => {
      IDX = JSON.parse(ev.data);
      if (view === 'run') crumbs(); else route();
      if (!location.hash) route();
    });

    es.addEventListener('payload', (ev) => {
      const next = JSON.parse(ev.data);
      if (next.runId !== shown) { reset(); shown = next.runId; }
      D = next;
      /* Drawn only where it is visible. A payload arriving while the reader is on the index is
         still kept, so opening the run is instant and never shows the state it had on load. */
      if (view === 'run') render();
      beat();
    });

    es.onerror = () => { live.textContent = '○ связь потеряна'; live.className = 'livebadge lost'; };
  }

  /* A run asked for from a list: already held, so draw it; otherwise the switch waits for the
     payload the reconnect brings. */
  wanted = (id) => {
    if (id === shown) { show('run'); render(); crumbs(); return; }
    connect(id);
    const once = (ev) => {
      if (JSON.parse(ev.data).runId !== id) return;
      es.removeEventListener('payload', once);
      show('run');
      crumbs();
    };
    es.addEventListener('payload', once);
  };

  /* What the badge says is the difference between "thinking" and "stopped", which is the one
     question a page like this has to answer and the one an animation cannot. A run in flight
     shows how long the journal has been quiet; a finished one shows when it last changed. */
  function beat() {
    const now = tick();
    if (!D.totals.running) {
      live.className = 'livebadge';
      /* On a run that has stopped, when it last did anything is the useful number. When the
         page was generated is not — that is a fact about the page. */
      live.textContent = D.lastEventAt
        ? '● последняя активность ' + hhmm(D.lastEventAt)
        : '● обновлено ' + hhmm(D.generatedAt);
      return;
    }
    const quiet = D.lastEventAt ? (now - D.lastEventAt) / 1000 : null;
    live.className = 'livebadge' + (quiet != null && quiet > 180 ? ' stalled' : quiet != null && quiet > 60 ? ' quiet' : '');
    live.textContent = quiet == null ? '● идёт' : '● идёт · тихо ' + mmss(quiet);
  }

  setInterval(beat, 1000);

  const hash = decodeURIComponent(location.hash.slice(1));
  connect(hash && !hash.startsWith('spec:') ? hash : null);
}

route();
</script>
</body></html>`;
}

const out = flag('--out') ?? join(dir, 'report.html');
writeFileSync(out, pageHtml(payload));
console.log(out);
console.log(
  `  ${mmss(totals.wallSec)} · $${totals.costUsd} · ${totals.invocations} вызовов` +
    `${totals.aborted ? ` (+${totals.aborted} убито)` : ''}${totals.running ? ` (+${totals.running} идёт)` : ''} · ` +
    `${(totals.outTokens / 1000).toFixed(0)}k токенов при ${totals.tokPerSec} ток/с · ` +
    `${totals.blockers} блокеров, ${totals.notes} заметок · покрытие ревью ${cov.files - cov.never.length}/${cov.files}`,
);

function mmss(s) {
  return `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
}
