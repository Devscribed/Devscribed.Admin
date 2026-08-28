#!/usr/bin/env node
/**
 * guard-protected-branch — a PreToolUse hook that refuses the small number of commands
 * whose cost in this repository is a deployment.
 *
 * `main` deploys itself: a push to main runs the suite and deploys dev, and a `v*` tag on
 * main deploys prod. Those are one keystroke away from any agent holding Bash, and no
 * verdict downstream can undo them. This is the one place the pipeline says no outright
 * rather than reporting a finding.
 *
 * It also catches `prisma generate` from the repository root, which produces a client that
 * cannot find apps/api/.env — the app then starts and fails its first query with "client
 * password must be a string", a symptom that has nothing to do with the real cause.
 *
 * Deny decisions are returned as JSON; everything else exits 0 and the normal permission
 * flow applies.
 */

import { execFileSync } from 'node:child_process';
import { writeSync } from 'node:fs';

const PROTECTED = ['main', 'master'];

/**
 * Written with writeSync, not process.stdout.write. stdout to a pipe is asynchronous, and
 * exiting immediately after a buffered write drops it — which here means a refusal that
 * silently becomes an approval. This is the one place in the pipeline where losing output
 * costs a deployment.
 */
const deny = (reason) => {
  writeSync(1, JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
};

const currentBranch = () => {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch { return null; }
};

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  let e;
  try { e = JSON.parse(raw || '{}'); } catch { return; }
  if (e.tool_name !== 'Bash') return;

  const cmd = String(e.tool_input?.command ?? '');
  if (!cmd.trim()) return;

  /* Split on separators so `cd x && git push origin main` is inspected too. */
  const parts = cmd.split(/&&|\|\||;|\n/).map((s) => s.trim()).filter(Boolean);

  for (const part of parts) {
    if (/^git\s+push\b/.test(part)) {
      const target = PROTECTED.find((b) => new RegExp(`(^|\\s)(${b}|HEAD:${b}|[^\\s:]+:${b})(\\s|$)`).test(part));
      const branch = currentBranch();
      const implicit = !/\s\S+\s\S+/.test(part) && PROTECTED.includes(branch);
      if (target || implicit) {
        deny(
          `Refused: this would push to ${target ?? branch}, and that branch deploys itself — `
          + 'a push runs the suite and deploys dev; a v* tag deploys prod. The pipeline stops at a '
          + 'green branch and a human opens the PR. Push a working branch instead.',
        );
      }
    }

    if (/^git\s+tag\b/.test(part) && /\bv\d/.test(part)) {
      deny(
        'Refused: a v* tag on main triggers the production deploy. Release tags come from '
        + '`npm run release`, run by a human.',
      );
    }

    /* Anchored to the start of the segment. An unanchored match denied any command that
       merely *mentioned* prisma generate — including a test fixture quoting it — which is
       a refusal nobody can act on and the fastest way to get a guard switched off. */
    if (/^(?:npx\s+|pnpm\s+|yarn\s+|npm\s+exec\s+)?prisma\s+generate\b/.test(part)
        && !/apps[/\\]api/.test(part) && !/--schema/.test(part)) {
      const cwd = e.cwd ?? '';
      if (!/apps[/\\]api/.test(cwd)) {
        deny(
          'Refused: `prisma generate` outside apps/api produces a client that cannot find '
          + 'apps/api/.env, and the app then fails its first query with "client password must be '
          + 'a string". Run it from apps/api, or run `npm install` from the root.',
        );
      }
    }
  }
}

main().catch(() => {}).finally(() => process.exit(0));
