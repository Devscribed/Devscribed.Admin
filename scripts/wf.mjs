#!/usr/bin/env node
/**
 * wf — the run state machine and routing engine for the spec-to-ship pipeline.
 *
 * This file holds every decision the pipeline makes about *where a defect belongs* and
 * *whether to retry*. The agents produce verdicts; this decides what happens next. Keeping
 * that here rather than in a prompt is the point: routing must be the same on every run.
 *
 * The whole policy is three rules, applied in this order to every finding:
 *
 *   1. ADDRESS   Every finding names where the defect lives — code | handoff | spec | self.
 *                The address decides the route. Only `code` is ever retried.
 *   2. WITNESS   A finding may block only if it carries something another party can check:
 *                a failing test, a concrete failure scenario, or a quoted rule. No witness,
 *                no blocking — it degrades to a note and is handed to the human at the end.
 *   3. APPEAL    The implementer may contest a finding once with a counter-witness. A
 *                contested finding is never retried; the run halts for a human. Contesting
 *                cannot produce a pass, so there is nothing to game.
 *
 * Everything else — time and token fuses — is a fuse, not a check: it understands nothing
 * and therefore cannot be wrong about the code.
 *
 * Usage:
 *   node scripts/wf.mjs init --spec <path> [--task <slug>]
 *   node scripts/wf.mjs preflight
 *   node scripts/wf.mjs stage <name> --start|--end
 *   node scripts/wf.mjs verdict <stage> --file <verdict.json>
 *   node scripts/wf.mjs contest --finding <id> --reason <text>
 *   node scripts/wf.mjs status [--json]
 *   node scripts/wf.mjs log [--tail N]
 *   node scripts/wf.mjs abort --reason <text>
 */

import { createHash } from 'node:crypto';
import {
  appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WF = join(ROOT, '.workflow');
const RUNS = join(WF, 'runs');
const CURRENT = join(WF, 'current');
const LOCK = join(WF, 'lock');
const CONFIG = join(ROOT, '.claude', 'ai-workflow.config.json');

/* ── stage order ─────────────────────────────────────────────────────────── */

const STAGES = ['preflight', 'pre_implement', 'implement', 'static_gate', 'review', 'qa'];

/**
 * Which addresses each stage may hand out. A gate that cannot read the spec has no
 * business judging it — restricting authority is how false positives stay rare without
 * a validator per failure mode.
 */
const AUTHORITY = {
  preflight:     ['self'],
  pre_implement: ['spec', 'self'],
  /* The implementer normally passes — the gates that follow judge its work, not it. But it
     is the first party to read every requirement closely enough to hit a contradiction, and
     a run that makes it implement something impossible anyway is a run nobody wanted. */
  implement:     ['spec'],
  static_gate:   ['code', 'self'],
  review:        ['code', 'handoff', 'spec'],
  qa:            ['code', 'spec'],
};

/** Priority order for routing. A spec defect makes fixing code pointless, so it wins. */
const TARGET_PRIORITY = ['spec', 'self', 'handoff', 'code'];

/* ── small helpers ───────────────────────────────────────────────────────── */

const now = () => new Date().toISOString();
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

/**
 * Path out of one `git status --porcelain` line. The status column is two characters, but
 * a leading space is lost the moment the output passes through anything that trims, so this
 * tolerates one or two. A rename reads `R old -> new`; the new path is the one that exists.
 */
function porcelainPath(line) {
  const rest = line.replace(/^\s*\S{1,2}\s+/, '').replace(/^"|"$/g, '');
  return rest.includes(' -> ') ? rest.split(' -> ').pop() : rest;
}

function fail(msg) {
  process.stderr.write(`wf: ${msg}\n`);
  process.exit(1);
}

function config() {
  if (!existsSync(CONFIG)) fail(`missing ${relative(ROOT, CONFIG)}`);
  return read(CONFIG);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

/* ── run state ───────────────────────────────────────────────────────────── */

function runDir(runId) { return join(RUNS, runId); }

function currentRunId() {
  if (!existsSync(CURRENT)) fail('no active run — start one with `wf init --spec <path>`');
  return readFileSync(CURRENT, 'utf8').trim();
}

function loadRun(runId = currentRunId()) {
  const p = join(runDir(runId), 'run.json');
  if (!existsSync(p)) fail(`run ${runId} has no run.json`);
  return read(p);
}

/**
 * A halt is a halt. Without this, a driver that ignores the exit code keeps feeding verdicts
 * into a run that already stopped for a human, and the counters carry on climbing behind a
 * decision nobody made.
 */
function refuseIfHalted(run) {
  if (!run.halt) return;
  fail(
    `run is halted (${run.halt.reason}): ${run.halt.detail}\n`
    + '    A halt asks for a person, not another attempt. Resolve it and start a new run, '
    + 'or `wf abort` and begin again.',
  );
}

/**
 * Single-writer discipline. Every mutation goes through here so run.json can never be
 * clobbered by a read-modify-write race between two stages.
 */
function saveRun(run) {
  run.updatedAt = now();
  writeFileSync(join(runDir(run.runId), 'run.json'), `${JSON.stringify(run, null, 2)}\n`);
  return run;
}

function event(run, obj) {
  appendFileSync(
    join(runDir(run.runId), 'events.jsonl'),
    `${JSON.stringify({ ts: now(), runId: run.runId, stage: run.status, ...obj })}\n`,
  );
}

/* ── the three rules ─────────────────────────────────────────────────────── */

/** Stable identity for a finding. Symbol, never line — line numbers move, symbols don't. */
const findingKey = (f) => `${f.rule}@${f.file ?? '-'}#${f.symbol ?? '-'}`;

/**
 * Rule 2. A finding blocks only if someone other than its author can check it.
 * Returns null when the witness holds, or the reason it does not.
 */
function witnessDefect(f) {
  const w = f.witness;
  if (!w || typeof w !== 'object') return 'no witness object';
  const detail = typeof w.detail === 'string' ? w.detail.trim() : '';
  if (detail.length < 12) return 'witness detail is empty or too short to check';
  switch (w.kind) {
    case 'test':
      return w.test ? null : 'witness kind "test" needs a test id';
    case 'rule':
      return w.source ? null : 'witness kind "rule" needs a source (file:line)';
    case 'scenario':
      return null;
    default:
      return `unknown witness kind "${w.kind}"`;
  }
}

/**
 * Applies rules 1 and 2 to a raw verdict and returns the findings split into what may
 * block and what may not. Nothing here judges the code — only the shape of the claim.
 */
function classify(stage, findings) {
  const allowed = AUTHORITY[stage] ?? [];
  const blockers = [];
  const notes = [];
  const rejected = [];

  for (const f of findings ?? []) {
    if (!f.target) { rejected.push({ f, why: 'finding has no target' }); continue; }
    if (!allowed.includes(f.target)) {
      rejected.push({ f, why: `${stage} may not address "${f.target}" (allowed: ${allowed.join(', ')})` });
      continue;
    }
    if (f.severity === 'note') { notes.push(f); continue; }
    const defect = witnessDefect(f);
    if (defect) { notes.push({ ...f, severity: 'note', demoted: defect }); continue; }
    blockers.push(f);
  }
  return { blockers, notes, rejected };
}

/* ── routing ─────────────────────────────────────────────────────────────── */

function halt(run, reason, detail) {
  run.status = 'halted';
  run.halt = { reason, detail, at: now() };
  event(run, { event: 'halt', reason, detail });
  saveRun(run);
  return { action: 'halt', reason, detail };
}

function goto(run, stage, why) {
  run.status = stage;
  run.stages[stage].status = 'pending';
  event(run, { event: 'route', to: stage, why });
  saveRun(run);
  return { action: 'goto', stage, why };
}

/**
 * The routing decision. Everything above produced facts; this is the only place that
 * chooses what happens next, and it is deliberately short enough to read in one sitting.
 */
function route(run, stage, verdict, classified) {
  const cfg = config();
  const { blockers } = classified;

  /* An environment failure is not a finding about the code at all. It never costs a
     code attempt — otherwise a stopped container burns the budget on a healthy diff. */
  if (verdict.status === 'error') {
    run.budget.infra += 1;
    event(run, { event: 'infra-error', count: run.budget.infra, detail: verdict.error ?? null });
    if (run.budget.infra > cfg.convergence.infraRetries) {
      return halt(run, 'infra-error', `environment failed ${run.budget.infra}× at ${stage}: ${verdict.error ?? 'unspecified'}`);
    }
    saveRun(run);
    return { action: 'retry-stage', stage, why: 'infrastructure error, attempt not counted' };
  }

  /* Rule 3. A contested finding is never retried — two parties disagreeing about a fact
     is exactly when a human is cheaper than another opus attempt. */
  const contested = blockers.filter((f) => run.contested.some((c) => c.key === findingKey(f)));
  if (contested.length) {
    return halt(run, 'contested', `${contested.length} finding(s) contested by the implementer: ${contested.map(findingKey).join(', ')}`);
  }

  if (!blockers.length) {
    run.stages[stage].status = 'passed';
    const next = STAGES[STAGES.indexOf(stage) + 1];
    if (!next) {
      run.status = 'ready';
      event(run, { event: 'ready' });
      saveRun(run);
      return { action: 'ready' };
    }
    return goto(run, next, `${stage} passed`);
  }

  run.stages[stage].status = 'blocked';

  /* Auto-contest. A blocker that survives two implement attempts has been tried and not
     fixed; that is a de facto counter-witness. This one line replaces the no-progress
     and oscillation detectors — it catches the same situations, earlier. */
  for (const f of blockers) {
    const key = findingKey(f);
    run.findingHistory[key] = (run.findingHistory[key] ?? 0) + 1;
    if (run.findingHistory[key] >= cfg.convergence.autoContestAfter) {
      return halt(run, 'stuck-finding', `"${key}" survived ${run.findingHistory[key]} attempts — the requirement is ambiguous or the finding is wrong`);
    }
  }

  const target = TARGET_PRIORITY.find((t) => blockers.some((f) => f.target === t));
  const forTarget = blockers.filter((f) => f.target === target);
  const summary = forTarget.map((f) => `${f.rule} (${f.file ?? '-'})`).join('; ');

  switch (target) {
    case 'spec':
      /* CLAUDE.md is unambiguous: the spec wins and changes to it are deliberate. A
         pipeline that edits specs to make itself pass is the worst failure available. */
      return halt(run, 'spec-defect', `${stage} found a defect in the spec: ${summary}`);

    case 'self':
      return halt(run, 'gate-rule-defect', `${stage} reports its own rule is wrong: ${summary}`);

    case 'handoff':
      if (run.budget.handoffReplans >= cfg.convergence.maxHandoffReplans) {
        return halt(run, 'spec-ambiguity', `the plan was rebuilt ${run.budget.handoffReplans}× and ${stage} still rejects it — the spec is ambiguous: ${summary}`);
      }
      run.budget.handoffReplans += 1;
      run.budget.codeAttempts = 0; // different plan, fresh slate for the implementer
      return goto(run, 'pre_implement', `replan: ${summary}`);

    case 'code':
      run.budget.codeAttempts += 1;
      if (run.budget.codeAttempts > cfg.convergence.maxCodeAttempts) {
        return halt(run, 'budget-exhausted', `${run.budget.codeAttempts} code attempts without converging: ${summary}`);
      }
      return goto(run, 'implement', `fix ${forTarget.length} blocker(s): ${summary}`);

    default:
      return halt(run, 'unroutable', `blockers carry no recognised target: ${summary}`);
  }
}

/* ── commands ────────────────────────────────────────────────────────────── */

function cmdInit(args) {
  const specRel = args.spec;
  if (!specRel) fail('init needs --spec <path>');
  const specPath = resolve(ROOT, specRel);
  if (!existsSync(specPath)) fail(`spec not found: ${specRel}`);

  const cfg = config();
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (cfg.protectedBranches.includes(branch)) {
    fail(`refusing to start on protected branch "${branch}" — this branch deploys itself. Create a working branch first.`);
  }
  if (existsSync(LOCK)) {
    fail(`another run holds ${relative(ROOT, LOCK)} (${readFileSync(LOCK, 'utf8').trim()}). Runs share ports and databases, so they are serialised.`);
  }

  const slug = args.task ?? specRel.replace(/^specs\//, '').replace(/\.md$/, '').replace(/[\/_]/g, '-');
  const runId = `${now().replace(/[:.]/g, '-').slice(0, 19)}_${slug}`;
  mkdirSync(join(runDir(runId), 'stages'), { recursive: true });

  const run = {
    runId,
    spec: specRel,
    specSha: sha256(readFileSync(specPath, 'utf8')),
    task: args.title ?? slug,
    branch,
    /* The diff every gate reads is measured from here. It defaults to HEAD because a run
       normally starts before any code exists — but a run that resumes work after a spec was
       corrected starts with the implementation already committed, and taking HEAD there would
       hand the reviewer an empty diff and a clean bill of health for code nobody looked at. */
    baseRef: git('rev-parse', args.from ?? 'HEAD'),
    status: 'preflight',
    createdAt: now(),
    updatedAt: now(),
    stages: Object.fromEntries(STAGES.map((s) => [s, { status: 'pending', attempts: 0 }])),
    budget: {
      codeAttempts: 0,
      handoffReplans: 0,
      infra: 0,
    },
    findingHistory: {},
    contested: [],
    notes: [],
    halt: null,
  };

  writeFileSync(CURRENT, `${runId}\n`);
  writeFileSync(LOCK, `${runId} pid=${process.pid} ${now()}\n`);
  saveRun(run);
  event(run, { event: 'init', spec: specRel, branch });

  process.stdout.write(`run ${runId}\nspec ${specRel}\nbranch ${branch}\nnext preflight\n`);
}

/**
 * Preflight. Deterministic, no model, and deliberately unforgiving: everything it checks
 * is something that, left broken, makes a later stage lie rather than fail.
 */
function cmdPreflight() {
  const run = loadRun();
  const cfg = config();
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  add('branch-not-protected', !cfg.protectedBranches.includes(branch), `on "${branch}"`);

  const specPath = resolve(ROOT, run.spec);
  add('spec-unchanged', existsSync(specPath) && sha256(readFileSync(specPath, 'utf8')) === run.specSha,
    'spec sha256 matches the one recorded at init');

  /* A worktree carries tracked files only. apps/api/.env is untracked by design, so an
     isolated run starts without it and dies on its first query with a message that looks
     like a Prisma bug. Check it here, where the cause is still visible. */
  add('api-env-present', existsSync(join(ROOT, 'apps/api/.env')),
    'apps/api/.env exists (untracked — a fresh worktree does not get one)');

  add('node-modules-present', existsSync(join(ROOT, 'node_modules')), 'dependencies installed');

  /* Ports 3000 and 4000 are fixed in e2e/playwright.config.ts. Anything already listening on
     them is a server this run did not start, and with CI=1 Playwright refuses to attach —
     so QA cannot run at all. Catching it here costs a millisecond; catching it in QA costs
     the unit and integration suites first, and then a stage that reports nothing about the
     code. This is the one preflight check that a long run should repeat before QA. */
  const held = [3000, 4000].filter((port) => {
    try {
      return execFileSync('netstat', ['-ano'], { encoding: 'utf8' })
        .split('\n').some((l) => /LISTENING/.test(l) && new RegExp(`[:.]${port}\\s`).test(l));
    } catch { return false; }
  });
  add('e2e-ports-free', held.length === 0,
    held.length ? `${held.join(' and ')} already listening — stop that server or QA cannot run`
      : '3000 and 4000 are free for the e2e suite');
  add('prisma-client-generated', existsSync(join(ROOT, 'node_modules/.prisma/client')),
    'prisma client generated (postinstall runs it from apps/api)');

  const migrations = existsSync(join(ROOT, 'apps/api/prisma/migrations'))
    ? readdirSync(join(ROOT, 'apps/api/prisma/migrations')).filter((d) => /^\d/.test(d))
    : [];
  add('migration-baseline', true, `${migrations.length} migrations recorded as the baseline`);

  /* The run's own bookkeeping does not count as dirt: `init` writes run.json before
     preflight runs, so a naive check fails on the files the run just created. What matters
     is that no *unrelated* change is in flight to be attributed to this run's diff. */
  const dirty = git('status', '--porcelain').split('\n')
    .filter(Boolean)
    .map(porcelainPath)
    .filter((p) => p && !p.startsWith('.workflow/'));
  add('worktree-clean', dirty.length === 0,
    dirty.length ? `${dirty.length} uncommitted change(s): ${dirty.slice(0, 3).join(', ')}` : 'nothing in flight outside .workflow/');

  run.preflight = { at: now(), checks, migrations };
  const failed = checks.filter((c) => !c.ok);
  run.stages.preflight.status = failed.length ? 'blocked' : 'passed';
  run.stages.preflight.attempts += 1;

  for (const c of checks) process.stdout.write(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(26)} ${c.detail}\n`);

  if (failed.length) {
    halt(run, 'preflight', failed.map((c) => c.name).join(', '));
    process.stdout.write(`\nhalted: preflight — ${failed.length} check(s) failed\n`);
    process.exit(2);
  }
  goto(run, 'pre_implement', 'preflight passed');
  process.stdout.write('\nnext pre_implement\n');
}

function cmdStage(args) {
  const stage = args._[1];
  if (!STAGES.includes(stage)) fail(`unknown stage "${stage}"`);
  const run = loadRun();
  refuseIfHalted(run);
  if (args.start) {
    run.stages[stage].status = 'running';
    run.stages[stage].attempts += 1;
    run.stages[stage].startedAt = now();
    run.status = stage;
    event(run, { event: 'stage-start', name: stage, attempt: run.stages[stage].attempts });
  } else if (args.end) {
    run.stages[stage].endedAt = now();
    event(run, { event: 'stage-end', name: stage });
  }
  saveRun(run);
  process.stdout.write(`${stage}: ${run.stages[stage].status} (attempt ${run.stages[stage].attempts})\n`);
}

function cmdVerdict(args) {
  const stage = args._[1];
  if (!AUTHORITY[stage]) fail(`stage "${stage}" does not produce verdicts`);
  if (!args.file) fail('verdict needs --file <verdict.json>');
  const verdict = read(resolve(ROOT, args.file));

  const run = loadRun();
  refuseIfHalted(run);
  const classified = classify(stage, verdict.findings);

  /* A gate that hands out addresses it does not own is itself broken. Say so instead of
     silently dropping the finding — a dropped blocker is how a pipeline lies. */
  if (classified.rejected.length) {
    for (const r of classified.rejected) {
      process.stdout.write(`rejected  ${r.f.rule ?? '(no rule)'} — ${r.why}\n`);
    }
    const detail = classified.rejected.map((r) => r.why).join('; ');
    halt(run, 'gate-authority', `${stage} produced findings outside its authority: ${detail}`);
    process.stdout.write(`\nhalted: gate-authority\n`);
    process.exit(2);
  }

  run.notes.push(...classified.notes.map((n) => ({ stage, ...n })));
  writeFileSync(
    join(runDir(run.runId), 'stages', `${stage}.attempt-${run.stages[stage].attempts || 1}.json`),
    `${JSON.stringify(verdict, null, 2)}\n`,
  );
  run.stages[stage].lastVerdict = verdict.status ?? (classified.blockers.length ? 'blocked' : 'pass');

  for (const f of classified.blockers) process.stdout.write(`blocker   [${f.target}] ${findingKey(f)}\n`);
  for (const n of classified.notes) {
    process.stdout.write(`note      [${n.target}] ${n.rule}${n.demoted ? ` — demoted: ${n.demoted}` : ''}\n`);
  }

  const decision = route(run, stage, verdict, classified);
  process.stdout.write(`\n${decision.action}${decision.stage ? ` ${decision.stage}` : ''}${decision.reason ? ` (${decision.reason})` : ''}\n`);
  if (decision.why) process.stdout.write(`${decision.why}\n`);
  if (decision.detail) process.stdout.write(`${decision.detail}\n`);
  if (decision.action === 'halt') process.exit(2);
}

function cmdContest(args) {
  if (!args.finding || !args.reason) fail('contest needs --finding <key|id> and --reason <counter-witness>');
  const run = loadRun();
  const key = args.finding;
  if (run.contested.some((c) => c.key === key)) fail(`"${key}" is already contested — one appeal per finding`);
  run.contested.push({ key, reason: args.reason, at: now() });
  event(run, { event: 'contest', key, reason: args.reason });
  saveRun(run);
  process.stdout.write(`contested ${key}\nA contested finding is never retried. Re-submit the verdict to halt for a human.\n`);
}

function cmdAbort(args) {
  const run = loadRun();
  halt(run, 'aborted', args.reason ?? 'aborted by operator');
  process.stdout.write('halted: aborted\n');
}

function cmdStatus(args) {
  const run = loadRun();
  if (args.json) { process.stdout.write(`${JSON.stringify(run, null, 2)}\n`); return; }
  const cfg = config();
  const mark = { passed: 'ok', blocked: 'XX', running: '..', pending: '  ' };
  process.stdout.write(`run     ${run.runId}\n`);
  process.stdout.write(`spec    ${run.spec}\n`);
  process.stdout.write(`branch  ${run.branch}\n`);
  process.stdout.write(`status  ${run.status}${run.halt ? ` — ${run.halt.reason}` : ''}\n\n`);
  for (const s of STAGES) {
    const st = run.stages[s];
    process.stdout.write(`  ${mark[st.status] ?? '  '}  ${s.padEnd(15)} ${String(st.attempts).padStart(2)} attempt(s)  ${st.lastVerdict ?? ''}\n`);
  }
  process.stdout.write(`\nbudget  code ${run.budget.codeAttempts}/${cfg.convergence.maxCodeAttempts}`);
  process.stdout.write(`  replans ${run.budget.handoffReplans}/${cfg.convergence.maxHandoffReplans}`);
  process.stdout.write(`  infra ${run.budget.infra}/${cfg.convergence.infraRetries}\n`);
  if (run.contested.length) process.stdout.write(`contested ${run.contested.map((c) => c.key).join(', ')}\n`);
  if (run.notes.length) process.stdout.write(`notes   ${run.notes.length} non-blocking finding(s) for the human\n`);
  if (run.halt) process.stdout.write(`\nhalt    ${run.halt.reason}\n        ${run.halt.detail}\n`);

  /* "Where is it now" is the question status is actually asked, and a stage name does not
     answer it while an agent has been working for four minutes. Show the last few calls. */
  const events = readEvents(run);
  const agentEvents = events.filter((e) => e.agentType);
  const recent = (agentEvents.length ? agentEvents : events).slice(-5);
  if (recent.length) {
    const last = Date.parse(events[events.length - 1].ts);
    const idle = Math.round((Date.now() - last) / 1000);
    process.stdout.write(`\nlast activity (${idle}s ago)\n`);
    for (const e of recent) process.stdout.write(`  ${formatEvent(e)}\n`);
  }
  const tools = agentEvents.filter((e) => e.event === 'tool');
  if (tools.length) {
    const ms = tools.reduce((a, e) => a + (e.durationMs ?? 0), 0);
    process.stdout.write(`\n${tools.length} agent tool call(s), ${(ms / 1000).toFixed(0)}s of tool time\n`);
  }
}

/** One readable line per event. The raw record is always in events.jsonl; this is the view. */
function formatEvent(e) {
  const time = e.ts.slice(11, 19);
  const who = (e.agentType ?? (e.agentId ? 'agent' : 'main')).slice(0, 15).padEnd(15);

  if (e.event !== 'tool') {
    const detail = e.reason ? `${e.reason} — ${e.detail ?? ''}`
      : e.to ? `→ ${e.to}${e.why ? ` (${e.why})` : ''}`
      : e.name ?? e.key ?? e.spec ?? '';
    return `${time}  ${who} ${e.event.padEnd(12)} ${String(detail).slice(0, 90)}`;
  }

  const i = e.input ?? {};
  const what = i.redacted ? '[redacted]'
    : i.command ?? i.file_path ?? i.path ?? i.pattern ?? (i.text ? i.text.slice(0, 60) : '');
  const ms = e.durationMs != null ? `${String(e.durationMs).padStart(6)}ms` : '         ';
  const mark = e.ok === false ? ' FAILED' : '';
  return `${time}  ${who} ${String(e.tool ?? '').padEnd(12)}${ms}${mark}  ${String(what).replace(/\s+/g, ' ').slice(0, 74)}`;
}

function readEvents(run) {
  const p = join(runDir(run.runId), 'events.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').trim().split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function cmdLog(args) {
  const run = loadRun();
  let events = readEvents(run);
  if (args.agents) events = events.filter((e) => e.agentType);
  if (args.stage) events = events.filter((e) => e.stage === args.stage);
  const tail = args.tail ? events.slice(-Number(args.tail)) : events;

  for (const e of tail) {
    process.stdout.write(args.full ? `${JSON.stringify(e)}\n` : `${formatEvent(e)}\n`);
  }
  if (!args.full && tail.length) {
    process.stdout.write(`\n${tail.length} of ${events.length} event(s). --full for raw, --agents to drop this session's own calls.\n`);
  }
}

/**
 * Emit one line per meaningful change, for a monitor to consume. Not a log tail: a stage
 * that starts, an attempt that is spent, a verdict, a halt. Silence is reported too — a run
 * that stopped making progress looks exactly like a run that is thinking, and only the clock
 * tells them apart.
 */
function cmdWatch(args) {
  const every = Number(args.interval ?? 15) * 1000;
  const stallAfter = Number(args.stall ?? 8) * 60_000;
  let prev = null;
  let lastActivity = Date.now();
  let stallReported = 0;

  const t = () => new Date().toTimeString().slice(0, 8);
  const emit = (s) => process.stdout.write(`${s}\n`);

  const tick = () => {
    let run;
    try { run = loadRun(); } catch { return; } // mid-write; try again next tick

    const events = readEvents(run);
    const now = { status: run.status, halt: run.halt?.reason ?? null, budget: { ...run.budget } };
    for (const s of STAGES) now[s] = `${run.stages[s].status}/${run.stages[s].attempts}`;

    if (events.length !== (prev?.events ?? 0)) { lastActivity = Date.now(); stallReported = 0; }
    now.events = events.length;

    if (prev) {
      const budgetMoved = ['codeAttempts', 'infra', 'handoffReplans']
        .some((k) => now.budget[k] !== prev.budget[k]);

      for (const s of STAGES) {
        if (now[s] === prev[s]) continue;
        const [status, attempts] = now[s].split('/');
        const spent = attempts !== prev[s].split('/')[1];
        emit(`${t()} ${s} → ${status}${spent ? ` (attempt ${attempts})` : ''}`);

        /* The runaway signature: the same stage starts again with nothing else in between
           and no budget spent. Every legitimate repeat costs something — a code attempt, an
           infra retry, a replan — so a free repeat means the driver and the router disagree
           about what happened, and the loop will keep paying for a full agent each lap. */
        if (spent && s === prev.lastStarted && !budgetMoved) {
          now.freeRestarts = (prev.freeRestarts ?? 0) + 1;
          /* One free restart is ordinary: an operator stopped a stage and resumed, or a
             process was killed before it could report. The runaway does it every lap, so the
             warning waits for the second — a monitor that cries wolf gets read as noise, and
             then it is worth nothing on the lap that matters. */
          if (now.freeRestarts >= 2) {
            emit(`${t()} LOOP? ${s} restarted ${now.freeRestarts}× with no budget spent — the router is not accepting the verdict`);
          }
        } else if (spent) {
          now.freeRestarts = 0;
        }
        if (spent) now.lastStarted = s;
      }
      /* Both survive a tick in which nothing changed; without this the counter resets to zero
         on the first quiet poll and the second free restart never looks like the second. */
      now.lastStarted ??= prev.lastStarted;
      now.freeRestarts ??= prev.freeRestarts ?? 0;
      if (now.budget.codeAttempts !== prev.budget.codeAttempts) {
        emit(`${t()} code attempt ${now.budget.codeAttempts} spent`);
      }
      if (now.budget.infra !== prev.budget.infra) {
        emit(`${t()} environment failure ${now.budget.infra} — attempt not counted`);
      }
      if (now.budget.handoffReplans !== prev.budget.handoffReplans) {
        emit(`${t()} plan rejected — replanning`);
      }
      const failures = events.filter((e) => e.ok === false).length;
      if (failures > (prev.failures ?? 0)) {
        const last = events.filter((e) => e.ok === false).pop();
        emit(`${t()} tool failed: ${last.tool} — ${String(last.input?.command ?? last.input?.file_path ?? '').slice(0, 70)}`);
      }
      now.failures = failures;
    } else {
      now.failures = events.filter((e) => e.ok === false).length;
      emit(`${t()} watching ${run.runId} — at ${run.status}`);
    }

    const idle = Date.now() - lastActivity;
    if (idle > stallAfter && idle - stallReported > stallAfter) {
      stallReported = idle;
      /* An event is only written when a tool call *finishes*, so one long command — the e2e
         suite is twelve minutes of it — looks exactly like a hang. The PreToolUse hook already
         records start times in .pending.json, so distinguish the two rather than crying hang
         at every slow command: a monitor that is wrong about this teaches you to ignore it. */
      const inFlight = (() => {
        try {
          const m = JSON.parse(readFileSync(join(runDir(run.runId), '.pending.json'), 'utf8'));
          const newest = Object.values(m).map(Date.parse).filter(Number.isFinite).sort().pop();
          return newest && newest > lastActivity ? newest : null;
        } catch { return null; }
      })();

      emit(inFlight
        ? `${t()} ${run.status}: a tool call has been in flight ${Math.round((Date.now() - inFlight) / 60000)}m — working, not hung`
        : `${t()} no activity for ${Math.round(idle / 60000)}m at ${run.status}`);
    }

    prev = now;

    if (run.status === 'ready') { emit(`${t()} READY — ${run.branch} is green, open the PR yourself`); process.exit(0); }
    if (run.status === 'halted') { emit(`${t()} HALTED ${run.halt.reason} — ${run.halt.detail}`); process.exit(2); }
  };

  tick();
  setInterval(tick, every);
}

function cmdRelease() {
  if (existsSync(LOCK)) execFileSync('node', ['-e', `require('fs').unlinkSync(${JSON.stringify(LOCK)})`]);
  process.stdout.write('lock released\n');
}

/* ── entry ───────────────────────────────────────────────────────────────── */

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
mkdirSync(RUNS, { recursive: true });

switch (cmd) {
  case 'init':      cmdInit(args); break;
  case 'preflight': cmdPreflight(); break;
  case 'stage':     cmdStage(args); break;
  case 'verdict':   cmdVerdict(args); break;
  case 'contest':   cmdContest(args); break;
  case 'abort':     cmdAbort(args); break;
  case 'status':    cmdStatus(args); break;
  case 'log':       cmdLog(args); break;
  case 'watch':     cmdWatch(args); break;
  case 'release':   cmdRelease(); break;
  default:
    process.stdout.write(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, '').replace(/^ \* ?/gm, ''));
    process.exit(cmd ? 1 : 0);
}
