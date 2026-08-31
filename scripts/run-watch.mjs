#!/usr/bin/env node
/**
 * run-watch — the report, following whichever run you are looking at.
 *
 * `run-report.mjs` writes one self-contained page: everything the reader needs is baked in,
 * which is what makes it worth attaching to an issue and opening months later. The cost of
 * that is a snapshot of one run. A run you actually want to watch is a run in flight, and
 * re-running the generator and hitting reload loses the scroll position and every open step.
 *
 * So this serves the same page over http, lets the reader pick a run in it, and pushes that
 * run a new payload whenever its directory changes. Nothing about the file changes: opened as
 * a file it is the snapshot it always was, because a `file://` page has the null origin and
 * may not fetch its own directory — which is the whole reason a server exists here rather
 * than a poll.
 *
 * One watcher covers the whole runs directory rather than one per run. A run that starts
 * while the page is open has no watcher to attach, so watching each run separately would
 * leave a new run invisible until a reload — which is exactly when someone is looking.
 *
 * The payload is the generator's own `--json`, so there is one definition of what a run is.
 * A second reader that reconstructed it would drift from the page it is meant to feed.
 *
 *   node scripts/run-watch.mjs [runId] [--port 4300] [--open]
 */

import { createServer } from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, watch } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = join(ROOT, '.workflow', 'runs');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const die = (m) => { process.stderr.write(`run-watch: ${m}\n`); process.exit(1); };

/* A flag that takes a value swallows the token after it, or `--port 4300` reads as a request
   to watch a run called "4300". */
const VALUE_FLAGS = new Set(['--port']);
const positional = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith('--')) { if (VALUE_FLAGS.has(argv[i])) i += 1; continue; }
  positional.push(argv[i]);
}

if (!existsSync(RUNS)) die(`no runs directory at ${RUNS}`);

/** Every run on disk, newest first. `run.json` is the record; a directory without one is a
 *  half-created run and is listed by its name alone rather than hidden. */
function listRuns() {
  const out = [];
  for (const id of readdirSync(RUNS)) {
    const dir = join(RUNS, id);
    try { if (!statSync(dir).isDirectory()) continue; } catch { continue; }
    let meta = {};
    try { meta = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')); } catch { /* half-created */ }
    out.push({
      id,
      spec: meta.spec ?? null,
      task: meta.task ?? null,
      status: meta.status ?? 'unknown',
      stage: meta.stage ?? null,
      updatedAt: meta.updatedAt ?? null,
    });
  }
  return out.sort((a, b) => String(b.id).localeCompare(String(a.id)));
}

const runs = listRuns();
if (!runs.length) die('no runs on disk');

const current = (() => {
  const p = join(ROOT, '.workflow/current');
  return existsSync(p) ? readFileSync(p, 'utf8').trim() : null;
})();

const defaultRun = positional[0] ?? (current && runs.some((r) => r.id === current) ? current : runs[0].id);
if (!runs.some((r) => r.id === defaultRun)) die(`no such run: ${defaultRun}`);

const PORT = Number(opt('port', 4300));
const report = (...a) => execFileSync(process.execPath, [join(ROOT, 'scripts/run-report.mjs'), ...a], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});

/* The page is generated once. Everything that changes afterwards — including the whole of a
   different run — arrives as a payload, so a reload is never needed and never loses what the
   reader had open. */
const pagePath = join(tmpdir(), `run-watch-${process.pid}.html`);
report(defaultRun, '--out', pagePath);
const page = readFileSync(pagePath, 'utf8');

/** res → runId it is watching. */
const clients = new Map();
const lastPayload = new Map();
let lastRuns = '';

const frame = (event, data) => `event: ${event}\ndata: ${data}\n\n`;

function payload(runId) {
  try {
    /* Re-encoded compactly rather than shipped as the generator prints it. Two reasons, and
       the second is the one that matters: an SSE frame is newline-delimited, and parsing here
       proves the payload is whole. A run mid-write is the normal case, not an error —
       `ship.mjs` truncates a verdict before it fills it — and a half-written read must be
       skipped rather than pushed. The last good payload stands until the next change. */
    return JSON.stringify(JSON.parse(report(runId, '--json')));
  } catch (e) {
    process.stderr.write(`run-watch: ${runId} skipped — ${e.message.split('\n')[0]}\n`);
    return null;
  }
}

function pushRuns(only) {
  const next = JSON.stringify(listRuns());
  if (next === lastRuns && !only) return;
  lastRuns = next;
  const f = frame('runs', next);
  for (const res of only ? [only] : clients.keys()) res.write(f);
}

function pushPayload(runId, only) {
  const watching = only ? [only] : [...clients].filter(([, id]) => id === runId).map(([res]) => res);
  if (!watching.length) return;
  const next = payload(runId);
  if (!next) return;
  if (next === lastPayload.get(runId) && !only) return;
  lastPayload.set(runId, next);
  const f = frame('payload', next);
  for (const res of watching) res.write(f);
  process.stdout.write(`  ${runId} → ${(next.length / 1024).toFixed(0)}kB → ${watching.length} client(s)\n`);
}

/* One change is many events — a verdict lands as a create, a write and a close, and an agent
   log grows a line at a time. Collect the runs that moved and settle once past the burst. */
const dirty = new Set();
let timer = null;
watch(RUNS, { recursive: true }, (_ev, file) => {
  if (!file) return;
  const id = String(file).split(/[\\/]/)[0];
  if (id) dirty.add(id);
  clearTimeout(timer);
  timer = setTimeout(() => {
    pushRuns();
    for (const id2 of dirty) pushPayload(id2);
    dirty.clear();
  }, 400);
});

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/feed') {
    const wanted = url.searchParams.get('run');
    const runId = runs.some((r) => r.id === wanted) || (wanted && existsSync(join(RUNS, wanted)))
      ? wanted : defaultRun;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': hello\n\n');
    clients.set(res, runId);
    req.on('close', () => clients.delete(res));
    /* The page was generated when the server started, for one run. A reader who arrives later,
       or who picks a different run, is brought up to date at once rather than at the next
       change — which on a finished run never comes. */
    pushRuns(res);
    pushPayload(runId, res);
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(page);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found\n');
}).listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  process.stdout.write(`run-watch: ${runs.length} run(s), opening ${defaultRun}\n  ${url}\n  watching ${RUNS}\n`);
  if (argv.includes('--open')) {
    const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  }
});
