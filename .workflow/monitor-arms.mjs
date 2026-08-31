/* Watch both sharded arms. Reports progress every minute, and shouts if an arm stops
   producing journal events without having written a verdict — the shape both earlier crashes
   had: work in flight, then silence, no stderr, no log. */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ARMS = [
  { name: 'A ledger', dir: 'D:/git_repos/ds-lab-review', run: 'lab-A2' },
  { name: 'B slice', dir: 'D:/git_repos/ds-lab-slice', run: 'lab-B2' },
];
const STALL_MS = 6 * 60_000;
const started = Date.now();
const last = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hhmm = () => new Date().toTimeString().slice(0, 8);

function procs() {
  try {
    return execFileSync('wmic', ['process', 'where', "name='claude.exe'", 'get', 'ProcessId'], { encoding: 'utf8' })
      .split('\n')
      .filter((l) => /\d/.test(l)).length;
  } catch {
    return -1;
  }
}

function look(arm) {
  const d = `${arm.dir}/.workflow/runs/${arm.run}`;
  const jp = `${d}/events.jsonl`;
  const events = existsSync(jp) ? readFileSync(jp, 'utf8').split('\n').filter(Boolean).length : 0;
  const mtime = existsSync(jp) ? statSync(jp).mtimeMs : 0;
  const shardVerdicts = existsSync(d) ? readdirSync(d).filter((f) => /^review-shard-\d+\.verdict\.json$/.test(f)).length : 0;
  const done = existsSync(`${d}/review.verdict.json`);
  return { events, mtime, shardVerdicts, done };
}

for (let tick = 0; tick < 90; tick++) {
  const line = [];
  let allDone = true;
  for (const arm of ARMS) {
    const s = look(arm);
    const prev = last.get(arm.name);
    const stalled = prev && s.events === prev.events && Date.now() - s.mtime > STALL_MS && !s.done;
    last.set(arm.name, s);
    if (!s.done) allDone = false;
    line.push(`${arm.name}: ${String(s.events).padStart(4)} ev · ${s.shardVerdicts} shard verdicts${s.done ? ' · ROOT DONE' : ''}${stalled ? '  ** STALLED **' : ''}`);
  }
  console.log(`${hhmm()} +${String(Math.round((Date.now() - started) / 60000)).padStart(3)}m  ${procs()} claude  |  ${line.join('  |  ')}`);
  if (allDone) {
    console.log('both roots have written their verdict');
    break;
  }
  await sleep(60_000);
}
