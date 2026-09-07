import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where a local E2E run lives: which ports it holds, and which database it writes to.
 *
 * One module rather than three constants, because the Playwright config, the global setup
 * and the tests' own API client all have to agree, and they run in different processes.
 *
 * **Both halves exist so that a run can happen beside a working dev environment.** Before
 * them the suite could only run on 3000/4000 — the ports `npm run dev` holds — and against
 * whatever database `apps/api/.env` names, which is the one a developer is looking at. So
 * the honest options were to stop working or to skip the suite, and the suite is what got
 * skipped.
 *
 * Defaults are unchanged: 3000, 4000, and now `devscribed_e2e`. Nobody has to learn any of
 * this to run `npm run test:e2e`.
 */

const NEWLINE = String.fromCharCode(10);

/** How many times the run steps aside, and by how much, before it gives up. */
const PORT_STEP = 100;
const PORT_ATTEMPTS = 10;

const REQUESTED_WEB = Number(process.env.E2E_WEB_PORT) || 3000;
const REQUESTED_API = Number(process.env.E2E_API_PORT) || 4000;

const CLAIMED = claimPorts();

/** The web app's port. `E2E_WEB_PORT=3100` moves it, and everything below follows. */
export const WEB_PORT = CLAIMED.web;

/** The API's port. Read by the API through `PORT`, and by the tests through `API_ORIGIN`. */
export const API_PORT = CLAIMED.api;

/**
 * The address the suite points at.
 *
 * `E2E_BASE_URL` wins and starts nothing: that is the mode that runs these same tests
 * against a deployment, where there is one address and `/api/*` goes through the web app's
 * rewrite.
 */
export const REMOTE = process.env.E2E_BASE_URL;
export const WEB_ORIGIN = REMOTE ?? `http://localhost:${WEB_PORT}`;

/**
 * Where the tests' own API calls go — the preconditions, not the thing under test.
 *
 * Locally that is the API directly. Against a deployment it is the web address, because
 * the API has no public one.
 */
export const API_ORIGIN =
  process.env.E2E_API_URL ?? REMOTE ?? `http://localhost:${API_PORT}`;

/**
 * The database a local run writes to.
 *
 * **Not `devscribed_dev`.** The suite creates organizations, envelopes and accounts in
 * every case and cleans up none of them, and for as long as this was unset it did all of
 * that in the database the developer was working in — silently, because nothing about a
 * green run says which server it talked to.
 *
 * The port is learned from `apps/api/.env` for the reason `apps/api/test/database-url.ts`
 * learns it there: a developer with a native Postgres on 5433 has to remap the container,
 * and `.env` is untracked and machine-local.
 *
 * **CI has no `.env`, so CI must set `E2E_DATABASE_URL`** — see the e2e job in
 * `.github/workflows/test.yml`. Without it the fallback below points at a developer's
 * compose port on a runner where nothing listens there, and the run dies at the API's
 * `predev` migration with `P1001` before a single test starts.
 *
 * `prisma migrate deploy` creates the database when it is missing, so no compose change and
 * no `docker compose down -v` is needed on a machine that already has its data volume.
 */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? databaseFromDotEnv() ?? FALLBACK_DATABASE_URL();

function FALLBACK_DATABASE_URL(): string {
  return 'postgresql://devscribed:devscribed@localhost:5433/devscribed_e2e';
}

function databaseFromDotEnv(): string | null {
  for (const root of checkouts()) {
    const url = databaseIn(join(root, 'apps', 'api', '.env'));
    if (url) return url;
  }
  return null;
}

/**
 * This checkout first, then the one it was branched from.
 *
 * `apps/api/.env` is untracked, so a git worktree has none: an agent working in
 * `.claude/worktrees/<name>` would fall through to the port below and meet `P1000` against a
 * server that is not the one this machine runs. The main checkout answers the same question
 * about the same machine, so it is read rather than guessed.
 */
function checkouts(): string[] {
  const here = join(__dirname, '..');
  try {
    const common = spawnSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd: here, encoding: 'utf8', timeout: 10_000 },
    );
    const gitDir = (common.stdout ?? '').trim();
    if (!gitDir) return [here];
    const main = join(gitDir, '..');
    return main === here ? [here] : [here, main];
  } catch {
    return [here];
  }
}

/** The E2E database on whichever server that `.env` names, or null if it names none. */
function databaseIn(envPath: string): string | null {
  try {
    if (!existsSync(envPath)) return null;
    const line = readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('DATABASE_URL='));
    if (!line) return null;
    const url = new URL(line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, ''));
    url.pathname = '/devscribed_e2e';
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Where this run's servers go, decided before anything reads a port.
 *
 * Playwright checks `webServer.port` before it calls `globalSetup` and says only that the
 * port is taken. Read literally that means "stop working or skip the suite", and skipping
 * is what happens. It is not what the message means: **the run can move**, so it moves
 * itself — the requested pair first, then the same pair a hundred higher, and so on.
 *
 * Everything follows the choice, as it always did: the servers, `baseURL`, the rewrite
 * target and the signing links in the mail sink. Two things carry it to the processes that
 * did not make it — `E2E_WEB_PORT` and `E2E_API_PORT` are exported into the environment, so
 * workers and both web servers inherit them, and the pair is written to
 * `e2e/.last-ports.json` so a person can find the run that is going.
 *
 * The decision runs at config load, which is the first code of ours to execute, and only
 * under `CI` — without it `reuseExistingServer` is on and a busy port is somebody reusing
 * their own servers on purpose.
 *
 * Child processes because there is no synchronous way to ask either question, and this
 * module is imported synchronously by a config that cannot await.
 */
function claimPorts(): { web: number; api: number } {
  const requested = { web: REQUESTED_WEB, api: REQUESTED_API };

  // A run against a deployment starts nothing, so it holds no port.
  if (process.env.E2E_BASE_URL || !process.env.CI) return requested;
  // Workers load the config too, and by then the servers this run started are listening.
  // The runner has already exported its choice, which is what a worker inherits; deciding
  // again here would move every worker off the servers the run is using.
  if (process.env.TEST_WORKER_INDEX !== undefined) return requested;

  // Servers nobody is waiting for are killed before the ports are read, so a stale watcher
  // costs this run nothing rather than pushing it a hundred ports along.
  spawnSync(
    process.execPath,
    [join(__dirname, '..', 'scripts', 'reap-stale-servers.mjs')],
    { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'ignore', 'inherit'] },
  );

  const candidates: number[] = [];
  for (let i = 0; i < PORT_ATTEMPTS; i += 1) {
    candidates.push(requested.web + i * PORT_STEP, requested.api + i * PORT_STEP);
  }

  const busy = probeBusy(candidates);
  for (let i = 0; i < PORT_ATTEMPTS; i += 1) {
    const web = requested.web + i * PORT_STEP;
    const api = requested.api + i * PORT_STEP;
    if (busy.has(web) || busy.has(api)) continue;

    if (i > 0) {
      process.stderr.write(
        `e2e: ${requested.web}/${requested.api} busy — this run takes ${web}/${api}${NEWLINE}`,
      );
    }
    // Exported, not merely returned: the two web servers and every worker are separate
    // processes that never call this function.
    process.env.E2E_WEB_PORT = String(web);
    process.env.E2E_API_PORT = String(api);
    remember(web, api);
    return { web, api };
  }

  throw new Error(
    [
      `No free pair from ${requested.web}/${requested.api} through`,
      `${requested.web + (PORT_ATTEMPTS - 1) * PORT_STEP}/`
        + `${requested.api + (PORT_ATTEMPTS - 1) * PORT_STEP}.`,
      '',
      'Something is holding every candidate. `node scripts/reap-stale-servers.mjs --dry-run`',
      'lists the servers of this repository that nobody is waiting for; anything else on',
      'those ports belongs to someone and is not ours to move.',
    ].join(NEWLINE),
  );
}

/** The candidates something is already listening on. */
function probeBusy(ports: number[]): Set<number> {
  const probe = spawnSync(
    process.execPath,
    [
      '-e',
      [
        "const net=require('net');",
        'const ports=process.argv.slice(1).map(Number);',
        // **Connect, do not bind.** A bind test lies on Windows: a server listening on
        // 0.0.0.0 does not stop a second bind to 127.0.0.1, so every port looks free and
        // the guard never fires. Reaching the thing is the only honest question.
        'Promise.all(ports.map(p=>new Promise(r=>{',
        "const s=net.connect({port:p,host:'127.0.0.1'});",
        's.setTimeout(1000);',
        "s.once('connect',()=>{s.destroy();r(p);});",
        "s.once('error',()=>r(0));",
        "s.once('timeout',()=>{s.destroy();r(0);});",
        '})))',
        ".then(x=>process.stdout.write(x.filter(Boolean).join(',')));",
      ].join(''),
      ...ports.map(String),
    ],
    { encoding: 'utf8', timeout: 15_000 },
  );

  return new Set(
    (probe.stdout ?? '').trim().split(',').filter(Boolean).map(Number),
  );
}

/**
 * Leaves the choice where a person can read it. Never a source of truth — the run that
 * wrote it may be long over — which is why nothing reads it back.
 */
function remember(web: number, api: number): void {
  try {
    writeFileSync(
      join(__dirname, '.last-ports.json'),
      `${JSON.stringify({ web, api, at: new Date().toISOString() }, null, 2)}${NEWLINE}`,
    );
  } catch {
    // Remembering is a convenience. A read-only checkout still runs.
  }
}
