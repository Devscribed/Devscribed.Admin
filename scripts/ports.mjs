#!/usr/bin/env node
/**
 * ports — which pair a suite run would take, asked the way the suite asks it.
 *
 * The E2E suite does not need 3000 and 4000. Under `CI` it reaps this repository's stale dev
 * servers and then steps both ports by `PORT_STEP` until a free pair answers, exporting the
 * choice so the servers and workers inherit it. So "3000 is busy" is not a reason a run cannot
 * happen; "every pair in the ladder is busy" is.
 *
 * `e2e/environment.ts` owns that policy at suite runtime and keeps its own copy of the ladder,
 * because it is CommonJS and is loaded synchronously by a Playwright config that cannot await
 * an import. This module is the copy the *scripts* ask — `wf preflight`, and anything else that
 * wants to know before spending a stage. `--check` compares the two and fails if they have
 * drifted, so the duplication is loud rather than silent.
 *
 *   node scripts/ports.mjs           # the pair a CI run would take, or why there is none
 *   node scripts/ports.mjs --json
 *   node scripts/ports.mjs --check   # the two ladders still agree
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Kept identical to `e2e/environment.ts`. `--check` is what keeps them that way. */
export const PORT_STEP = 100;
export const PORT_ATTEMPTS = 10;
export const BASE_WEB = 3000;
export const BASE_API = 4000;

/**
 * The candidates something is already listening on.
 *
 * **Connect, do not bind.** On Windows a server on `0.0.0.0` does not prevent a second bind to
 * `127.0.0.1`, so a bind test reports every port free and the guard never fires.
 */
export function probeBusy(ports) {
  const probe = spawnSync(
    process.execPath,
    ['-e', [
      "const net=require('net');",
      'const ports=process.argv.slice(1).map(Number);',
      'Promise.all(ports.map(p=>new Promise(r=>{',
      "const s=net.connect({port:p,host:'127.0.0.1'});",
      's.setTimeout(1000);',
      "s.once('connect',()=>{s.destroy();r(p);});",
      "s.once('error',()=>r(0));",
      "s.once('timeout',()=>{s.destroy();r(0);});",
      '})))',
      ".then(x=>process.stdout.write(x.filter(Boolean).join(',')));",
    ].join(''), ...ports.map(String)],
    { encoding: 'utf8', timeout: 15_000 },
  );
  return new Set((probe.stdout ?? '').trim().split(',').filter(Boolean).map(Number));
}

/**
 * The pair a suite run would take now, or null when the whole ladder is held.
 *
 * This asks only what is listening. It does not reap: killing a server is the suite's decision
 * at the moment it needs the port, not a side effect of somebody asking a question.
 */
export function freePair({ web = BASE_WEB, api = BASE_API } = {}) {
  const candidates = [];
  for (let i = 0; i < PORT_ATTEMPTS; i += 1) candidates.push(web + i * PORT_STEP, api + i * PORT_STEP);
  const busy = probeBusy(candidates);
  for (let i = 0; i < PORT_ATTEMPTS; i += 1) {
    const w = web + i * PORT_STEP;
    const a = api + i * PORT_STEP;
    if (!busy.has(w) && !busy.has(a)) return { web: w, api: a, step: i, busy };
  }
  return null;
}

/** The last pair in the ladder, for a message that says how far the search went. */
export const ladderEnd = () =>
  `${BASE_WEB + (PORT_ATTEMPTS - 1) * PORT_STEP}/${BASE_API + (PORT_ATTEMPTS - 1) * PORT_STEP}`;

/** Whether this module and `e2e/environment.ts` still describe the same ladder. */
export function laddersAgree() {
  let text;
  try { text = readFileSync(join(ROOT, 'e2e', 'environment.ts'), 'utf8'); }
  catch { return { ok: false, why: 'e2e/environment.ts is missing' }; }
  const num = (name) => Number(text.match(new RegExp(`const ${name} = (\\d+)`))?.[1]);
  const theirs = {
    PORT_STEP: num('PORT_STEP'),
    PORT_ATTEMPTS: num('PORT_ATTEMPTS'),
    BASE_WEB: Number(text.match(/E2E_WEB_PORT\)\s*\|\|\s*(\d+)/)?.[1]),
    BASE_API: Number(text.match(/E2E_API_PORT\)\s*\|\|\s*(\d+)/)?.[1]),
  };
  const mine = { PORT_STEP, PORT_ATTEMPTS, BASE_WEB, BASE_API };
  const off = Object.keys(mine).filter((k) => mine[k] !== theirs[k]);
  return off.length
    ? { ok: false, why: off.map((k) => `${k}: scripts/ports.mjs ${mine[k]}, e2e/environment.ts ${theirs[k] ?? '?'}`).join('; ') }
    : { ok: true };
}

/* ── the command ─────────────────────────────────────────────────────────── */

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);

  if (argv.includes('--check')) {
    const r = laddersAgree();
    process.stdout.write(r.ok
      ? `ports: scripts/ports.mjs and e2e/environment.ts agree — ${BASE_WEB}/${BASE_API}, step ${PORT_STEP}, ${PORT_ATTEMPTS} attempts\n`
      : `ports: the two ladders have drifted — ${r.why}\n`);
    process.exit(r.ok ? 0 : 1);
  }

  const pair = freePair();
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(pair ? { web: pair.web, api: pair.api, step: pair.step } : null)}\n`);
    process.exit(pair ? 0 : 1);
  }
  if (!pair) {
    process.stderr.write(`ports: no free pair from ${BASE_WEB}/${BASE_API} through ${ladderEnd()}.\n`
      + '  `node scripts/reap-stale-servers.mjs --dry-run` lists the servers of this repository\n'
      + '  nobody is waiting for; anything else on those ports belongs to someone.\n');
    process.exit(1);
  }
  process.stdout.write(pair.step === 0
    ? `${pair.web}/${pair.api} — the default pair is free\n`
    : `${pair.web}/${pair.api} — ${BASE_WEB}/${BASE_API} is held, this is ${pair.step} step(s) along\n`);
}
