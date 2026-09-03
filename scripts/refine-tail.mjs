#!/usr/bin/env node
/**
 * refine-tail — one line per change in a running refine loop, then stop.
 *
 *   node scripts/refine-tail.mjs requests-02
 *
 * Built for a watcher rather than a person: it prints nothing while nothing happens, one line
 * when anything moves, and exits when the loop reaches a terminal status. That makes it usable
 * as the command behind a monitor, where every line printed becomes a notification.
 *
 * It reads the artefacts, never the loop's stdout. A pipeline that filters that stdout buffers
 * it in blocks, so the file a watcher tails stays empty for twenty minutes while the run is
 * perfectly healthy — which is indistinguishable from a hang, and was read as one.
 */

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readLoop } from './refine-read.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stem = process.argv[2];
const everyMs = Number(process.argv[3] ?? 20000);

if (!stem) {
  process.stdout.write('usage: node scripts/refine-tail.mjs <stem> [poll ms]\n');
  process.exit(2);
}

const min = (ms) => `${(ms / 60000).toFixed(1)}m`;
const money = (n) => `$${n.toFixed(2)}`;

/** What the loop looks like right now, as one line. Identical lines are not printed twice. */
function snapshot() {
  const loop = readLoop(ROOT, stem);
  const parts = [];

  for (const r of loop.rounds) {
    const bits = [];
    if (r.lint != null) bits.push(r.lint ? `T0 ${r.lint} finding(s)` : 'T0 clean');
    if (r.judge) bits.push(`T2 ${r.judge.blockers}b/${r.judge.notes}n ${r.judge.mode}`);
    if (r.plan) bits.push(`T1 ${r.plan.status}${r.plan.specBlockers ? ` ${r.plan.specBlockers} spec` : ''}`);
    if (r.fix) bits.push(`fix ${r.fix.fixed}/${r.fix.decided}/${r.fix.left}`);
    if (r.growth != null) bits.push(`+${r.growth}`);

    /* A gate in flight is the whole point of watching: the ledger says nothing about it until
       it ends, so the line comes from the log the agent is still writing. */
    const live = r.gates.find((g) => g.log?.running);
    if (live) {
      bits.push(`${live.label} running ${min(Date.now() - (live.log.startedAt ?? Date.now()))}`
        + ` ${live.log.calls} calls ${money(live.log.costUsd)}`);
    }
    if (bits.length) parts.push(`r${r.round}: ${bits.join(' · ')}`);
  }

  const tail = loop.status === 'running' ? 'running'
    : `${loop.status}${loop.outcome?.reason ? ` — ${loop.outcome.reason}` : ''}`;
  return `${parts.join('  |  ')}  ||  ${tail}`;
}

let last = null;
const tick = () => {
  if (!existsSync(resolve(ROOT, '.workflow/refine', `${stem}.loop.json`))) {
    process.stdout.write(`${stem}: no ledger yet\n`);
    return true;
  }
  const now = snapshot();
  if (now !== last) {
    process.stdout.write(`${now}\n`);
    last = now;
  }
  /* A cost that only moves by a cent is not an event. Anything else in the line is. */
  return !now.endsWith('running');
};

const loopOnce = () => {
  let done = false;
  try { done = tick(); } catch (e) { process.stdout.write(`refine-tail: ${e.message}\n`); }
  if (done) process.exit(0);
  setTimeout(loopOnce, everyMs);
};
loopOnce();
