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
      /* Whole minutes, deliberately. Every line printed here is a notification somebody reads,
         and a gate that reports each tool call produces thirty of them per pass — which is how
         a watcher gets switched off and the run goes dark again. A minute is often enough to
         show it is alive and rare enough to stay readable. */
      const mins = Math.floor((Date.now() - (live.log.startedAt ?? Date.now())) / 60000);
      bits.push(`${live.label} running ${mins}m ${live.log.calls} calls ${money(live.log.costUsd)}`);
    }
    if (bits.length) parts.push(`r${r.round}: ${bits.join(' · ')}`);
  }

  const tail = loop.status === 'running' ? 'running'
    : `${loop.status}${loop.outcome?.reason ? ` — ${loop.outcome.reason}` : ''}`;
  const line = `${parts.join('  |  ')}  ||  ${tail}`;
  /* The line carries the call count and the spend; the key does not. Otherwise every tool call
     is a change and the heartbeat becomes the firehose. */
  return { line, key: line.replace(/\d+ calls \$[\d.]+/g, '') };
}

let last = null;
const tick = () => {
  if (!existsSync(resolve(ROOT, '.workflow/refine', `${stem}.loop.json`))) {
    process.stdout.write(`${stem}: no ledger yet\n`);
    return true;
  }
  const now = snapshot();
  if (now.key !== last) {
    process.stdout.write(`${now.line}\n`);
    last = now.key;
  }
  return !now.line.endsWith('running');
};

const loopOnce = () => {
  let done = false;
  try { done = tick(); } catch (e) { process.stdout.write(`refine-tail: ${e.message}\n`); }
  if (done) process.exit(0);
  setTimeout(loopOnce, everyMs);
};
loopOnce();
