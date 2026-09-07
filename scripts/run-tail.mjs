#!/usr/bin/env node
/**
 * run-tail — one line per change in a ship run, then stop.
 *
 *   node scripts/run-tail.mjs            # the active run
 *   node scripts/run-tail.mjs <runId>    # a named one
 *
 * The counterpart of `refine-tail` for the pipeline, and it exists for the same reason: a
 * watcher needs the artefacts, not the orchestrator's stdout, and it needs them as a handful of
 * lines rather than a stream.
 *
 * **Every line names the run id.** A rehearsal once drove a run to `ready` on fabricated
 * verdicts and left it as the active one; a watcher that reports a status without saying whose
 * status it is turns that into a green pipeline nobody built.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argId = process.argv[2] || null;
const everyMs = Number(process.argv[3] ?? 30000);

const readIf = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const TERMINAL = new Set(['ready', 'halted', 'aborted', 'failed']);

function snapshot() {
  const id = argId ?? readIf(join(ROOT, '.workflow/current'))?.trim();
  if (!id) return { line: 'no active run', done: false };

  const raw = readIf(join(ROOT, '.workflow/runs', id, 'run.json'));
  if (!raw) return { line: `${id}: starting`, done: false };

  let run;
  try { run = JSON.parse(raw); } catch { return { line: `${id}: run.json is mid-write`, done: false }; }

  const stages = Object.entries(run.stages ?? [])
    .filter(([, s]) => s.status && s.status !== 'pending')
    .map(([k, s]) => `${k}:${s.lastVerdict ?? s.status}${s.attempts > 1 ? `#${s.attempts}` : ''}`)
    .join(' ');

  const halt = run.halt ? `  HALT ${run.halt.reason}` : '';
  return {
    line: `${id}  ${run.status ?? '?'}  |  ${stages || 'nothing settled yet'}${halt}`,
    done: TERMINAL.has(run.status) || Boolean(run.halt),
  };
}

let last = null;
const tick = () => {
  let s;
  try { s = snapshot(); } catch (e) { s = { line: `run-tail: ${e.message}`, done: false }; }
  if (s.line !== last) {
    process.stdout.write(`${s.line}\n`);
    last = s.line;
  }
  if (s.done) process.exit(0);
  setTimeout(tick, everyMs);
};
tick();
