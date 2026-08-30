/**
 * What the lab arms are doing right now.
 *
 * A sharded review is many agents at once, and the only place their progress is visible is
 * the journal each one writes into. This turns that into one screen: how far each arm is, how
 * many shards have reported, what each of them found, and when anything last happened.
 *
 * Silence is the signal worth watching. Both crashes in this lab looked the same from outside
 * — work in flight, then no events, no stderr, no log — so an arm whose journal has not moved
 * is called out rather than left to look busy.
 *
 *   node scripts/lab-watch.mjs            # snapshot
 *   node scripts/lab-watch.mjs --follow   # refresh every 30s until both roots finish
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/* Find the lab runs rather than naming them: every `ds-lab-*` worktree, its newest `lab-*`
   run. A watcher that has to be edited to follow a new experiment gets edited wrong. */
function discover() {
  const out = [];
  for (const w of readdirSync('D:/git_repos').filter((d) => d.startsWith('ds-lab-'))) {
    const runs = `D:/git_repos/${w}/.workflow/runs`;
    if (!existsSync(runs)) continue;
    const lab = readdirSync(runs)
      .filter((r) => r.startsWith('lab-'))
      .map((r) => ({ run: r, at: statSync(`${runs}/${r}`).mtimeMs }))
      .sort((a, b) => b.at - a.at)[0];
    if (lab) out.push({ name: `${w.replace('ds-lab-', '')} · ${lab.run}`, dir: `D:/git_repos/${w}`, run: lab.run });
  }
  return out;
}
const only = process.argv.find((a) => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1]);
const ARMS = discover().filter((a) => !only || a.run.toLowerCase().includes(only.toLowerCase()) || a.name.toLowerCase().includes(only.toLowerCase()));

const STALL_MS = 15 * 60_000; // a fleet of subagents generating verdicts makes no tool calls at all
const follow = process.argv.includes('--follow');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clock = (ms) => `${Math.floor(ms / 60000)}m${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}s`;

/**
 * Read a JSON file that something else is writing right now.
 *
 * Every file this watcher looks at is being produced by a live agent, so `existsSync` is true
 * a moment before the content is complete and a plain `JSON.parse` dies on half a document.
 * A partial file is not an error here — it means "in flight", which is exactly the state worth
 * displaying.
 */
function readJson(path) {
  try {
    const raw = readFileSync(path, 'utf8');
    return raw.trim() ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function claudeProcs() {
  try {
    return execFileSync('wmic', ['process', 'where', "name='claude.exe'", 'get', 'ProcessId'], { encoding: 'utf8' })
      .split('\n')
      .filter((l) => /\d/.test(l)).length;
  } catch {
    return -1;
  }
}

function snapshot(arm) {
  const d = `${arm.dir}/.workflow/runs/${arm.run}`;
  if (!existsSync(d)) return { missing: true };
  const jp = `${d}/events.jsonl`;
  const lines = existsSync(jp) ? readFileSync(jp, 'utf8').split('\n').filter(Boolean) : [];
  const events = lines.map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter(Boolean);

  const startFile = `${d}/stages/review.attempt-1.start.json`;
  const startedAt = readJson(startFile)?.startedAt ? Date.parse(readJson(startFile).startedAt) : null;
  const lastAt = events.length ? Date.parse(events[events.length - 1].ts) : null;

  const shards = readdirSync(d)
    .map((f) => f.match(/^review-shard-(\d+)\.verdict\.json$/))
    .filter(Boolean)
    .map((m) => {
      const v = readJson(`${d}/${m[0]}`);
      if (!v) return { n: Number(m[1]), writing: true };
      const f = v.findings ?? [];
      return {
        n: Number(m[1]),
        status: v.status,
        scope: v.covered?.scope ?? '?',
        read: (v.covered?.read ?? []).length,
        blockers: f.filter((x) => x.severity !== 'note' && x.severity !== 'info').length,
        notes: f.filter((x) => x.severity === 'note' || x.severity === 'info').length,
      };
    })
    .sort((a, b) => a.n - b.n);

  const rootPath = `${d}/review.verdict.json`;
  const root = readJson(rootPath);

  const byTool = {};
  for (const e of events) if (e.event === 'tool') byTool[e.tool] = (byTool[e.tool] ?? 0) + 1;

  return { events: events.length, startedAt, lastAt, shards, root, byTool, stalled: lastAt && Date.now() - lastAt > STALL_MS && !root };
}

async function render() {
  const now = new Date().toTimeString().slice(0, 8);
  console.log(`\n\u2500\u2500 ${now}  ·  ${claudeProcs()} claude processes alive`);
  for (const arm of ARMS) {
    const s = snapshot(arm);
    if (s.missing) {
      console.log(`\n${arm.name}: no run directory`);
      continue;
    }
    const age = s.startedAt ? clock(Date.now() - s.startedAt) : '?';
    const quiet = s.lastAt ? clock(Date.now() - s.lastAt) : '?';
    console.log(`\n${arm.name}  ${age} elapsed · ${s.events} events · last activity ${quiet} ago${s.stalled ? '   ** STALLED **' : ''}`);
    console.log(`   tools: ${Object.entries(s.byTool).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(', ') || 'none yet'}`);
    /* Shards answer their parent as text, so there are no files to count here. What they are
       doing is visible only in their transcripts — `scripts/lab-peek.mjs`. */
    if (!s.shards.length) console.log('   shards: answering by text — see `node scripts/lab-peek.mjs`');
    for (const sh of s.shards) {
      if (sh.writing) console.log(`   shard ${sh.n}: writing its verdict…`);
      else console.log(`   shard ${sh.n}: ${sh.status} · read ${sh.read}/${sh.scope} · ${sh.blockers} blockers, ${sh.notes} notes`);
    }
    if (s.root) {
      const f = s.root.findings ?? [];
      const b = f.filter((x) => x.severity !== 'note' && x.severity !== 'info').length;
      console.log(`   ROOT: ${s.root.status} · ${b} blockers, ${f.length - b} notes · read ${(s.root.covered?.read ?? []).length}/${s.root.covered?.of ?? s.root.covered?.slice ?? '?'}`);
    } else {
      console.log('   ROOT: not written yet');
    }
  }
}

await render();
while (follow) {
  const done = ARMS.every((a) => existsSync(`${a.dir}/.workflow/runs/${a.run}/review.verdict.json`));
  if (done) {
    console.log('\nboth roots have signed. done.');
    break;
  }
  await sleep(30_000);
  await render();
}
