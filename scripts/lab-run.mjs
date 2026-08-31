/**
 * Run one agent, once, against a scratch run — the experiment harness.
 *
 * `ship.mjs` runs a whole pipeline and decides what happens next. This runs a single stage
 * against a base..head range you choose, captures exactly what ship captures, and then gets
 * out of the way. It exists so a change to an agent can be measured before it is trusted:
 * the same diff, the same model, one variable moved.
 *
 * ROOT is the working directory rather than the script's own location, so a copy of this file
 * dropped into a `git worktree` measures that worktree and not the repository it came from.
 *
 *   node scripts/lab-run.mjs --agent code-reviewer --run lab-1 --base <sha> \
 *        --prompt prompt.md [--model opus] [--fuse 25]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = argv.indexOf(n);
  return i === -1 ? d : argv[i + 1];
};

const agent = flag('--agent');
const runId = flag('--run');
const promptFile = flag('--prompt');
const model = flag('--model', 'opus');
const fuseMin = Number(flag('--fuse', '30'));
const base = flag('--base');
if (!agent || !runId || !promptFile) {
  console.error('need --agent, --run and --prompt');
  process.exit(1);
}

const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

const dir = join(ROOT, '.workflow', 'runs', runId);
mkdirSync(join(dir, 'stages'), { recursive: true });

const runPath = join(dir, 'run.json');
if (!existsSync(runPath)) {
  writeFileSync(
    runPath,
    `${JSON.stringify(
      {
        runId,
        spec: flag('--spec', 'specs/documents/04-signature-providers.md'),
        task: runId,
        branch: git('rev-parse', '--abbrev-ref', 'HEAD') || 'detached',
        baseRef: base ?? git('rev-parse', 'HEAD~1'),
        headAtInit: git('rev-parse', 'HEAD'),
        status: 'lab',
        createdAt: new Date().toISOString(),
        stages: {},
        budget: { codeAttempts: 0, handoffReplans: 0, infra: 0 },
        findingHistory: {},
        contested: [],
        notes: [],
      },
      null,
      2,
    )}\n`,
  );
}
/* The journal hook reads `.workflow/current` to decide where to write, so a lab run must
   claim it the same way a real one does — otherwise the tool calls land in the last real
   run's journal and quietly corrupt its coverage numbers. */
writeFileSync(join(ROOT, '.workflow', 'current'), runId);

const run = JSON.parse(readFileSync(runPath, 'utf8'));
const stage = flag('--stage', agent === 'code-reviewer' ? 'review' : agent === 'qa' || agent === 'qa-lab' ? 'qa' : agent);

/* Count attempts by their start record, not their log. An attempt that crashes never writes a
   log, so counting logs makes the next run reuse the same number and overwrite the evidence of
   the one that failed — which is the run you most wanted to keep. */
let attempt = 1;
while (existsSync(join(dir, 'stages', `${stage}.attempt-${attempt}.start.json`))) attempt++;
const stem = join(dir, 'stages', `${stage}.attempt-${attempt}`);

const verdictPath = `.workflow/runs/${runId}/${stage}.verdict.json`;
const verdictAbs = join(ROOT, verdictPath);
if (existsSync(verdictAbs)) execFileSync('node', ['-e', `require('fs').rmSync(${JSON.stringify(verdictAbs)})`], { cwd: ROOT });

const prompt = readFileSync(promptFile, 'utf8')
  .split('{{RUN}}')
  .join(runId)
  .split('{{VERDICT}}')
  .join(verdictPath)
  .split('{{BASE}}')
  .join(run.baseRef)
  .split('{{ATTEMPT}}')
  .join(String(attempt));

writeFileSync(`${stem}.prompt.md`, prompt);
writeFileSync(
  `${stem}.start.json`,
  `${JSON.stringify(
    { stage, attempt, agent, model, resumedSession: null, fuseMin, startedAt: new Date().toISOString(), baseRef: run.baseRef, head: git('rev-parse', 'HEAD') },
    null,
    2,
  )}\n`,
);

const journalBefore = existsSync(join(dir, 'events.jsonl')) ? readFileSync(join(dir, 'events.jsonl'), 'utf8').split('\n').length : 0;

/* Reasoning effort is a property of the session, and subagents inherit it — there is no way to
   ask for a thoughtful parent and cheap children. The default is `xhigh`, second of five, so
   every measurement taken without this flag was taken at nearly the top of the range. */
const effort = flag('--effort');

console.log(`▶ ${agent} (${model}${effort ? `, effort ${effort}` : ', effort default'}) · ${stage} attempt ${attempt} · fuse ${fuseMin}m · run ${runId}`);
const started = Date.now();
const claudeArgs = ['-p', prompt, '--agent', agent, '--permission-mode', 'acceptEdits', '--output-format', 'json', '--model', model];
if (effort) claudeArgs.push('--effort', effort);
/* An MCP server has to be named on the command line to be loaded in headless mode; a
   `.mcp.json` sitting in the project is offered for approval interactively and simply is not
   there when nobody can approve it. `--strict-mcp-config` keeps the experiment honest by
   loading this file and nothing the developer happens to have configured globally. */
const mcp = flag('--mcp-config');
if (mcp) claudeArgs.push('--mcp-config', mcp, '--strict-mcp-config');
const r = spawnSync('claude', claudeArgs, {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: fuseMin * 60_000,
  maxBuffer: 64 * 1024 * 1024,
});
const secs = Math.round((Date.now() - started) / 1000);
writeFileSync(`${stem}.log`, `${r.stdout ?? ''}\n${r.stderr ?? ''}`);
/* How the child ended, separately from what it said. A run that dies mid-work leaves an empty
   log and no clue; status, signal and the spawn error are the difference between "the agent
   failed" and "something outside killed it". */
writeFileSync(
  `${stem}.exit.json`,
  `${JSON.stringify({ status: r.status, signal: r.signal, error: r.error ? { code: r.error.code, message: r.error.message } : null, seconds: secs, stdoutBytes: (r.stdout ?? '').length, stderrBytes: (r.stderr ?? '').length }, null, 2)}\n`,
);
console.log(`  child: status=${r.status} signal=${r.signal ?? '-'} stdout=${(r.stdout ?? '').length}B stderr=${(r.stderr ?? '').length}B`);
if ((r.stderr ?? '').trim()) console.log(`  stderr: ${r.stderr.trim().slice(0, 600)}`);

let out = null;
try {
  out = JSON.parse(r.stdout);
} catch {
  /* the log has the raw text either way */
}

const journalAfter = existsSync(join(dir, 'events.jsonl')) ? readFileSync(join(dir, 'events.jsonl'), 'utf8').split('\n').length : 0;
const verdict = existsSync(verdictAbs) ? JSON.parse(readFileSync(verdictAbs, 'utf8')) : null;
if (verdict) writeFileSync(`${stem}.json`, `${JSON.stringify(verdict, null, 2)}\n`);

const blockers = (verdict?.findings ?? []).filter((f) => f.severity !== 'note' && f.severity !== 'info').length;
const notes = (verdict?.findings ?? []).length - blockers;

console.log(
  [
    `◼ ${secs}s`,
    out ? `$${(out.total_cost_usd ?? 0).toFixed(2)}` : 'no json',
    out ? `${out.num_turns} turns` : '',
    out ? `${(out.usage?.output_tokens ?? 0).toLocaleString('en-US')} out-tok` : '',
    `${journalAfter - journalBefore} journal events`,
    verdict ? `verdict ${verdict.status} · ${blockers} blockers, ${notes} notes` : 'NO VERDICT',
  ]
    .filter(Boolean)
    .join(' · '),
);
if (verdict?.covered) console.log(`  covered: ${JSON.stringify(verdict.covered).slice(0, 400)}`);
if (r.error) console.log(`  spawn error: ${r.error.code ?? r.error.message}`);
