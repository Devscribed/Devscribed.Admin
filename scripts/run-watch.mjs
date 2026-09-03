#!/usr/bin/env node
/**
 * run-watch — the board, following whatever is moving.
 *
 * `run-report.mjs` writes one self-contained page: everything the reader needs is baked in,
 * which is what makes it worth attaching to an issue and opening months later. The cost of
 * that is a snapshot of one run. A run you actually want to watch is a run in flight, and
 * re-running the generator and hitting reload loses the scroll position and every open step.
 *
 * So this serves the same page over http, lets the reader pick — a spec, then one of the
 * things run against it — and pushes that one a new payload whenever its directory changes.
 * Nothing about the file changes: opened as a file it is the snapshot it always was, because
 * a `file://` page has the null origin and may not fetch its own directory, which is the whole
 * reason a server exists here rather than a poll.
 *
 * Two kinds of thing are watched, and neither is the other's special case: a **ship run**
 * under `.workflow/runs`, and a **refine loop** under `.workflow/refine`, addressed as
 * `refine:<stem>`. The loop was invisible here until it was added, and a loop is where the
 * hours before an implementation go.
 *
 * One watcher covers each whole directory rather than one per entry. A run that starts while
 * the page is open has no watcher to attach, so watching each separately would leave a new run
 * invisible until a reload — which is exactly when someone is looking.
 *
 * The payloads are the generators' own `--json`, so there is one definition of what a report
 * is. A second reader that reconstructed it would drift from the page it is meant to feed.
 *
 *   node scripts/run-watch.mjs [runId|refine:stem] [--port 4300] [--open]
 */

import { createServer } from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, watch } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { buildIndex } from './spec-index.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = join(ROOT, '.workflow', 'runs');
const REFINE = join(ROOT, '.workflow', 'refine');

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

const index = () => buildIndex(ROOT);
const entriesOf = (idx) => [...idx.specs.flatMap((s) => s.entries), ...idx.orphans];

const first = index();
const allEntries = entriesOf(first);
if (!allEntries.length) die('nothing on disk: no runs and no refine loops');

const current = (() => {
  const p = join(ROOT, '.workflow/current');
  return existsSync(p) ? readFileSync(p, 'utf8').trim() : null;
})();

/* What a person opening the board wants to see first is whatever is moving; failing that, the
   run the pipeline last touched. */
const byRecency = [...allEntries].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
const defaultEntry = positional[0]
  ?? byRecency.find((e) => e.running)?.id
  ?? (current && allEntries.some((e) => e.id === current) ? current : byRecency[0].id);
if (!allEntries.some((e) => e.id === defaultEntry)) die(`no such run or loop: ${defaultEntry}`);

const PORT = Number(opt('port', 4300));

const isRefine = (id) => String(id).startsWith('refine:');
const generator = (id) => (isRefine(id)
  ? [join(ROOT, 'scripts/refine-report.mjs'), String(id).slice(7)]
  : [join(ROOT, 'scripts/run-report.mjs'), id]);

const report = (id, ...a) => execFileSync(process.execPath, [...generator(id), ...a], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});

/* The page is generated once. Everything that changes afterwards — including the whole of a
   different run — arrives as a payload, so a reload is never needed and never loses what the
   reader had open. */
const pagePath = join(tmpdir(), `run-watch-${process.pid}.html`);
report(defaultEntry, '--out', pagePath);
const page = readFileSync(pagePath, 'utf8');

/** res → entry id it is watching. */
const clients = new Map();
const lastPayload = new Map();
let lastIndex = '';

const frame = (event, data) => `event: ${event}\ndata: ${data}\n\n`;

function payload(id) {
  try {
    /* Re-encoded compactly rather than shipped as the generator prints it. Two reasons, and
       the second is the one that matters: an SSE frame is newline-delimited, and parsing here
       proves the payload is whole. An entry mid-write is the normal case, not an error —
       `ship.mjs` truncates a verdict before it fills it, and a refine log is appended to a
       line at a time — and a half-written read must be skipped rather than pushed. The last
       good payload stands until the next change. */
    return JSON.stringify(JSON.parse(report(id, '--json')));
  } catch (e) {
    process.stderr.write(`run-watch: ${id} skipped — ${e.message.split('\n')[0]}\n`);
    return null;
  }
}

function pushIndex(only) {
  const idx = index();
  /* `generatedAt` moves on every build and nothing reads it, so comparing with it in would
     push the whole index on every filesystem event that changed nothing. */
  const stable = JSON.stringify({ specs: idx.specs, orphans: idx.orphans });
  if (stable === lastIndex && !only) return;
  lastIndex = stable;
  const f = frame('index', JSON.stringify(idx));
  for (const res of only ? [only] : clients.keys()) res.write(f);
}

function pushPayload(id, only) {
  const watching = only ? [only] : [...clients].filter(([, w]) => w === id).map(([res]) => res);
  if (!watching.length) return;
  const next = payload(id);
  if (!next) return;
  if (next === lastPayload.get(id) && !only) return;
  lastPayload.set(id, next);
  const f = frame('payload', next);
  for (const res of watching) res.write(f);
  process.stdout.write(`  ${id} → ${(next.length / 1024).toFixed(0)}kB → ${watching.length} client(s)\n`);
}

/* One change is many events — a verdict lands as a create, a write and a close, and an agent
   log grows a line at a time. Collect what moved and settle once past the burst. */
const dirty = new Set();
let timer = null;
const settle = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    pushIndex();
    for (const id of dirty) pushPayload(id);
    dirty.clear();
  }, 400);
};

if (existsSync(RUNS)) {
  watch(RUNS, { recursive: true }, (_ev, file) => {
    if (!file) return;
    const id = String(file).split(/[\\/]/)[0];
    if (id) dirty.add(id);
    settle();
  });
}

if (existsSync(REFINE)) {
  watch(REFINE, { recursive: true }, (_ev, file) => {
    if (!file) return;
    /* `requests-02.probe/2/stages/pre_implement.log` and `requests-02.loop.json` are the same
       loop. Everything a loop writes is named for its stem, which is what makes one rule
       enough here. */
    const head = String(file).split(/[\\/]/)[0];
    const stem = head.match(/^(.+?)\.(probe|loop\.json|verdict\.json|fix\.json)$/)?.[1];
    if (stem) dirty.add(`refine:${stem}`);
    settle();
  });
}

const open = (url) => {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
};

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/feed') {
    /* `run` is the name this endpoint used when a run was the only thing it could serve. It is
       still accepted so a link somebody kept still opens what it named. */
    const wanted = url.searchParams.get('entry') ?? url.searchParams.get('run');
    const known = wanted && (isRefine(wanted)
      ? existsSync(join(REFINE, `${wanted.slice(7)}.loop.json`)) || existsSync(join(REFINE, `${wanted.slice(7)}.probe`))
      : existsSync(join(RUNS, wanted)));
    const id = known ? wanted : defaultEntry;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': hello\n\n');
    clients.set(res, id);
    req.on('close', () => clients.delete(res));
    /* The page was generated when the server started, for one entry. A reader who arrives
       later, or who picks a different one, is brought up to date at once rather than at the
       next change — which on a finished run never comes. */
    pushIndex(res);
    pushPayload(id, res);
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(page);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found\n');
});

/* Asked to open the board twice, open the board — do not fail because the first one is still
   up. The port being taken is the ordinary case for a command someone runs whenever they want
   to look at a run, and the watcher already there serves everything on disk, so it is the same
   page either way. */
server.on('error', (e) => {
  const url = `http://localhost:${PORT}`;
  if (e.code !== 'EADDRINUSE') { process.stderr.write(`run-watch: ${e.message}\n`); process.exit(1); }
  process.stdout.write(`run-watch: already serving on ${PORT}\n  ${url}\n`);
  if (argv.includes('--open')) open(url);
  process.exit(0);
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  const ship = allEntries.filter((e) => e.kind === 'ship').length;
  const loops = allEntries.length - ship;
  process.stdout.write(
    `run-watch: ${first.specs.filter((s) => s.entries.length).length} spec(s), ${ship} run(s), ${loops} loop(s)\n`
    + `  opening ${defaultEntry}\n  ${url}\n  watching ${RUNS}\n  watching ${REFINE}\n`,
  );
  if (argv.includes('--open')) open(url);
});
