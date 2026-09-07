#!/usr/bin/env node
/**
 * `npm run spec` · `npm run refine` · `npm run bug` · `npm run patch` · `npm run ship` — open
 * Claude Code on this repository's own workflow, so the things a person starts here have a
 * command that does not have to be remembered.
 *
 *   npm run spec   -- projects and their members
 *   npm run refine -- specs/requests/01-requests.md
 *   npm run bug    -- the members list 500s when a project is archived
 *   npm run patch  -- the recipient select belongs above the project select
 *   npm run ship   -- specs/documents/04-signature-providers.md
 *   npm run ship   -- patch specs/patches/PATCH-004-recipient-first.md
 *
 * Under yarn the `--` is not needed: `yarn spec projects and their members`.
 *
 * Interactive on purpose, not `-p`. `/spec` settles its architectural forks by asking, and a
 * headless run would answer them itself — which is the one thing that skill is written not to
 * do. `/ship` prints a stage at a time and a person reads it as it goes.
 *
 * `ship` here is the skill, which checks the spec exists and the branch is not `main`, then
 * runs the orchestrator and explains the outcome. `npm run ship:run` is the orchestrator on
 * its own, with no model either side of it.
 *
 * `refine` judges a spec before any of that. It dispatches the spec judge on a clean
 * context and applies what comes back; `/spec` dispatches the same agent as its last step.
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [skill, ...rest] = process.argv.slice(2);

if (!skill) {
  process.stderr.write('claude-cmd: which skill? (spec | refine | bug | patch | ship)\n');
  process.exit(1);
}

/* One argument, not a shell string: the words a person types are the prompt, and joining them
   here keeps quoting out of it entirely. */
const prompt = [`/${skill}`, ...rest].join(' ');

const r = spawnSync('claude', [prompt], { cwd: ROOT, stdio: 'inherit' });

if (r.error?.code === 'ENOENT') {
  process.stderr.write(
    'claude-cmd: the `claude` CLI is not on PATH.\n'
    + '  Install it from https://claude.com/claude-code, then run this again.\n',
  );
  process.exit(127);
}
if (r.error) {
  process.stderr.write(`claude-cmd: ${r.error.message}\n`);
  process.exit(1);
}

/* A signal is not an exit code, and reporting one as 0 would tell npm the run succeeded. */
process.exit(r.status ?? (r.signal ? 1 : 0));
