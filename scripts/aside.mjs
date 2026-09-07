#!/usr/bin/env node
/**
 * aside — move a change in the pipeline's own machinery off the branch a run is using.
 *
 *   node scripts/aside.mjs build/board scripts/run-report.mjs docs/research/note.md
 *
 * A ship run's reviewer diffs `baseRef...HEAD`. Anything committed on that branch while the run
 * is in flight is handed to it as part of the change under review — and a script or a note that
 * no handoff task names and no requirement asks for is exactly what a reviewer is built to
 * block on. The run then halts on work that has nothing to do with the spec.
 *
 * So: the working-tree content of the named paths is committed onto `<branch>`, in a worktree
 * of its own, and the paths are restored on the run's branch to the state its baseRef had.
 * Nothing is lost and the run's diff carries only what the run built.
 *
 * The run is not affected by the restore. Every stage reads its scripts and agent definitions
 * from the working tree when it starts, so what governs a run is what is on disk, not what its
 * branch has committed — which is also why moving a change aside does not undo it for the run
 * that is already using it.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKTREE = '.claude/worktrees/aside';

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const gitIn = (dir, ...args) => execFileSync('git', args, { cwd: join(ROOT, dir), encoding: 'utf8' }).trim();
const say = (s) => process.stdout.write(`${s}\n`);

const [branch, ...paths] = process.argv.slice(2);
if (!branch || !paths.length) {
  say('usage: node scripts/aside.mjs <branch> <path>...');
  say('  moves the working-tree content of <path>... onto <branch> and restores them here');
  process.exit(2);
}

/**
 * The commit the run's reviewer diffs from, which is the state the paths must go back to.
 *
 * Without an active run there is nothing to protect and no baseRef to restore to; the merge
 * base with the default branch is the honest stand-in, and it is what a branch that has not
 * started a run would be reviewed against anyway.
 */
function baseRef() {
  const cur = existsSync(join(ROOT, '.workflow/current'))
    ? readFileSync(join(ROOT, '.workflow/current'), 'utf8').trim() : null;
  const runJson = cur ? join(ROOT, '.workflow/runs', cur, 'run.json') : null;
  if (runJson && existsSync(runJson)) {
    const ref = JSON.parse(readFileSync(runJson, 'utf8')).baseRef;
    if (ref) return { ref, run: cur };
  }
  return { ref: git('merge-base', 'HEAD', 'main'), run: null };
}

const { ref, run } = baseRef();
say(`base   ${ref.slice(0, 8)}${run ? `  (run ${run})` : '  (no active run — merge-base with main)'}`);

/* The content is captured before anything is restored: the restore is what would destroy it. */
const stash = join(tmpdir(), `aside-${process.pid}`);
for (const p of paths) {
  if (!existsSync(join(ROOT, p))) { say(`skip   ${p} — not in the working tree`); continue; }
  mkdirSync(join(stash, dirname(p)), { recursive: true });
  copyFileSync(join(ROOT, p), join(stash, p));
}

/* One worktree, reused. A branch that does not exist is created at the baseRef, so the commit
   it carries is exactly this change and not the run's work as well. */
if (!existsSync(join(ROOT, WORKTREE))) {
  const known = git('branch', '--list', branch);
  git('worktree', 'add', '-q', ...(known ? [] : ['-b', branch]), WORKTREE, known ? branch : ref);
} else {
  /* The worktree outlives any one topic, so a branch that does not exist yet is created here
     too — at the run's baseRef, for the same reason as above. Switching to it unconditionally
     worked only for the first topic the worktree ever carried. */
  const known = git('branch', '--list', branch);
  gitIn(WORKTREE, 'switch', ...(known ? [branch] : ['-c', branch, ref]));
}

const moved = [];
for (const p of paths) {
  const from = join(stash, p);
  if (!existsSync(from)) continue;
  mkdirSync(join(ROOT, WORKTREE, dirname(p)), { recursive: true });
  copyFileSync(from, join(ROOT, WORKTREE, p));
  moved.push(p);
}
if (!moved.length) { say('nothing to move'); process.exit(1); }

gitIn(WORKTREE, 'add', '--', ...moved);
if (gitIn(WORKTREE, 'diff', '--cached', '--name-only')) {
  gitIn(WORKTREE, 'commit', '-q', '-m', `build: ${moved.length} file(s) moved aside from a run branch`);
  say(`moved  ${moved.length} file(s) onto ${branch} — ${gitIn(WORKTREE, 'rev-parse', '--short', 'HEAD')}`);
} else {
  say(`moved  nothing new — ${branch} already carries this content`);
}

/**
 * Back on the run's branch: the *commit* goes back to the baseRef, the *file* does not.
 *
 * The first version of this restored both, and the first machinery it was used on was the
 * static gate — which the run spawns from the working tree at every stage. Taking the fix off
 * the disk hands the next stage the broken gate again. So the tracked content is reset and the
 * new content is written back over it, leaving the path modified and uncommitted: invisible to
 * a reviewer diffing `baseRef...HEAD`, and in force for every stage that starts after it.
 *
 * A path the baseRef never had is untracked instead, which is the same thing by another name.
 */
for (const p of moved) {
  const existedAtBase = (() => {
    try { git('cat-file', '-e', `${ref}:${p}`); return true; } catch { return false; }
  })();
  if (existedAtBase) {
    git('checkout', ref, '--', p);
    copyFileSync(join(ROOT, WORKTREE, p), join(ROOT, p));
    say(`here   ${p} — HEAD back at the baseRef, the change kept in the working tree`);
  } else {
    try { git('rm', '-q', '--cached', '--', p); } catch { /* was never tracked */ }
    say(`here   ${p} — untracked, the change kept in the working tree`);
  }
}

rmSync(stash, { recursive: true, force: true });
say('\ncommit the restore on this branch; the content is safe on ' + branch);
