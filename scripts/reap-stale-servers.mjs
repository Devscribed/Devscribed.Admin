#!/usr/bin/env node
/**
 * reap-stale-servers — kill this repository's dev servers that nobody is waiting for.
 *
 * An agent that starts `npm run dev` and never stops it leaves a `nest start --watch` and a
 * `next dev` behind. They outlive the session that started them, and they are not merely
 * idle: the watcher recompiles on every file the next agent touches, holds
 * `node_modules/.prisma/client/query_engine-windows.dll.node` open so `prisma generate`
 * fails with EPERM, and keeps a port that the next run then reports as busy. The symptoms
 * arrive nowhere near the cause — a type error in a file nobody edited, an EPERM on a
 * rename, a port conflict — and each one costs a session to diagnose.
 *
 * ## What it will kill
 *
 * All four must hold. Each one is here because dropping it kills something it should not.
 *
 *  1. **It is ours.** The command line names this repository's path or one of its
 *     workspaces. A machine runs other checkouts, and their servers are not our business.
 *  2. **It is a server**, not a build or a test run: a dev script, a Nest watcher, a Next
 *     dev server, or a compiled `apps/api/dist/main`.
 *  3. **It is old** — older than the threshold, two hours by default. This is the honest
 *     proxy for "hung", and it is also what makes the reaper safe to run at the start of
 *     every E2E run: the servers that run is about to start are seconds old, and so is
 *     every process of the agent doing the reaping.
 *  4. **Nothing in its process tree holds a protected port.** 3000 and 4000 belong to
 *     whoever is working. The question is asked of the tree and not of the process,
 *     because a pair started with `npm run dev` holds its port two processes below the one
 *     that matches — judging the top by its own ports spares the server and kills
 *     everything holding it up.
 *
 * ## Why not "the parent is gone"
 *
 * Orphanhood reads like the right test and is a trap: Windows reuses process ids, so a
 * child list built from `ParentProcessId` can pick up an unrelated process that merely
 * inherited a dead pid. Walking such a tree once reached into a *different repository* and
 * killed a watcher there. Where this script does descend into children it requires the
 * child to be younger than its parent, which no reused pid can fake.
 *
 * Usage:
 *   node scripts/reap-stale-servers.mjs [--dry-run] [--max-age-minutes 120] [--quiet]
 *
 * Disable entirely with E2E_REAP=0. Threshold also from E2E_REAP_MAX_AGE_MINUTES.
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

const DRY_RUN = flag('dry-run');
const QUIET = flag('quiet');
const MAX_AGE_MINUTES = Number(
  opt('max-age-minutes') ?? process.env.E2E_REAP_MAX_AGE_MINUTES ?? 120,
);

/** Ports that belong to a person at a keyboard. Never reaped, at any age. */
const PROTECTED_PORTS = new Set(
  (process.env.E2E_REAP_PROTECT ?? '3000,4000').split(',').map((p) => Number(p.trim())),
);

/** What a server of ours looks like on a command line. */
const SERVER_MARKERS = [
  '@devscribed/api',
  '@devscribed/web',
  'nest start',
  'nest.js',
  'apps/api/dist/main',
  'apps\\api\\dist\\main',
  'next dev',
  'next-server',
];

const say = (line) => { if (!QUIET) process.stderr.write(`reap: ${line}\n`); };

/**
 * Every candidate process, as `{ pid, ppid, ageMinutes, ports, command }`.
 *
 * Platform-specific because there is no portable way to ask, and deliberately conservative
 * where the answer is unavailable: a platform this cannot inspect reaps nothing rather
 * than guessing.
 */
function inventory() {
  return process.platform === 'win32' ? inventoryWindows() : inventoryPosix();
}

function inventoryWindows() {
  /* One PowerShell round trip: processes joined to their listening ports. CreationDate is
     absent for a process that exits mid-query, and those rows are dropped rather than
     defaulted — an unknown age must never read as old. */
  const script = [
    "$ErrorActionPreference='SilentlyContinue';",
    '$listen=@{};',
    'Get-NetTCPConnection -State Listen | ForEach-Object {',
    ' $k=[int]$_.OwningProcess;',
    ' if(-not $listen.ContainsKey($k)){$listen[$k]=New-Object System.Collections.ArrayList};',
    ' [void]$listen[$k].Add([int]$_.LocalPort) };',
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe' or Name='cmd.exe'\" |",
    ' ForEach-Object {',
    '  if($_.CreationDate){',
    '   [pscustomobject]@{',
    '    pid=[int]$_.ProcessId; ppid=[int]$_.ParentProcessId;',
    '    started=$_.CreationDate.ToUniversalTime().ToString("o");',
    '    ports=@(if($listen.ContainsKey([int]$_.ProcessId)){$listen[[int]$_.ProcessId]}else{@()});',
    '    command=[string]$_.CommandLine } } } |',
    ' ConvertTo-Json -Compress -Depth 3',
  ].join('');

  const out = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', timeout: 30_000, windowsHide: true },
  );
  if (out.status !== 0 || !out.stdout.trim()) return [];

  let rows;
  try { rows = JSON.parse(out.stdout); } catch { return []; }
  if (!Array.isArray(rows)) rows = [rows];

  const now = Date.now();
  return rows
    .filter((r) => r && r.command)
    .map((r) => ({
      pid: r.pid,
      ppid: r.ppid,
      ageMinutes: (now - Date.parse(r.started)) / 60_000,
      ports: Array.isArray(r.ports) ? r.ports : r.ports === undefined ? [] : [r.ports],
      command: r.command,
    }))
    .filter((r) => Number.isFinite(r.ageMinutes));
}

function inventoryPosix() {
  /* etimes is elapsed seconds, which is the age directly. lsof supplies the ports; without
     it every process reads as holding none, so the protected-port rule could not be
     enforced and nothing is reaped. */
  const ps = spawnSync('ps', ['-eo', 'pid=,ppid=,etimes=,args='], {
    encoding: 'utf8', timeout: 15_000,
  });
  if (ps.status !== 0 || !ps.stdout) return [];

  const lsof = spawnSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'], {
    encoding: 'utf8', timeout: 15_000,
  });
  if (lsof.status !== 0) {
    say('lsof unavailable — not reaping, because protected ports cannot be identified');
    return [];
  }

  const ports = new Map();
  let current = null;
  for (const line of lsof.stdout.split(/\r?\n/)) {
    if (line.startsWith('p')) current = Number(line.slice(1));
    else if (line.startsWith('n') && current !== null) {
      const port = Number(line.split(':').pop());
      if (Number.isFinite(port)) {
        if (!ports.has(current)) ports.set(current, []);
        ports.get(current).push(port);
      }
    }
  }

  return ps.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map((m) => ({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      ageMinutes: Number(m[3]) / 60,
      ports: ports.get(Number(m[1])) ?? [],
      command: m[4],
    }));
}

/** Does this command line belong to a server of this repository? */
function isOurServer(command) {
  const normalized = command.replace(/\\/g, '/');
  const rootish = ROOT.replace(/\\/g, '/');
  if (!normalized.includes(rootish) && !normalized.includes('@devscribed/')) return false;
  return SERVER_MARKERS.some((m) => normalized.includes(m.replace(/\\/g, '/')));
}

function main() {
  if (process.env.E2E_REAP === '0') return;

  const all = inventory();
  if (all.length === 0) return;

  /* Descend, but only into a child younger than its parent. A reused pid cannot satisfy
     that, which is the whole reason the check is here. */
  const tree = (root) => {
    const found = new Map();
    const walk = (proc) => {
      if (found.has(proc.pid)) return;
      found.set(proc.pid, proc);
      for (const child of all) {
        if (child.ppid !== proc.pid || child.pid === proc.pid) continue;
        if (child.ageMinutes > proc.ageMinutes) continue;
        walk(child);
      }
    };
    walk(root);
    return [...found.values()];
  };

  const doomed = new Map();
  for (const candidate of all) {
    if (!isOurServer(candidate.command)) continue;
    if (candidate.ageMinutes < MAX_AGE_MINUTES) continue;

    /* The protected port is asked of the whole tree, never of the root alone. A person's
       pair is started with `npm run dev`, and that npm process holds no port at all — the
       port is two processes further down. Judging the root by its own ports would spare
       the server and kill everything holding it up. */
    const family = tree(candidate);
    if (family.some((p) => p.ports.some((port) => PROTECTED_PORTS.has(port)))) continue;

    for (const proc of family) doomed.set(proc.pid, proc);
  }

  for (const proc of doomed.values()) {
    const where = proc.ports.length ? ` port ${proc.ports.join(',')}` : '';
    const age = Math.round(proc.ageMinutes);
    say(`${DRY_RUN ? 'would stop' : 'stopping'} ${proc.pid}${where}, idle ${age}m — ` +
        `${proc.command.slice(0, 70)}`);
    if (DRY_RUN) continue;
    // Nothing waits on the result: a process that refuses to die shows up as a busy port,
    // and the port claim then moves the run rather than stopping it.
    try { process.kill(proc.pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

main();
