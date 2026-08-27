#!/usr/bin/env node
/**
 * What changed since the last release — the single definition of it.
 *
 * Three callers, one answer, which is the point. `release-it` shows this before asking for
 * a bump, writes it into `CHANGELOG.md` after bumping, and puts it in the body of the
 * GitHub release; if any of those had its own idea of the commit range or the formatting,
 * the file and the release notes would quietly drift apart.
 *
 *   node scripts/changelog.mjs --print        # the entries, to stdout, touching nothing
 *   node scripts/changelog.mjs 1.4.0          # prepend a v1.4.0 section to CHANGELOG.md
 *
 * Why this rather than `@release-it/conventional-changelog`: that plugin reads both the
 * version bump and the section headings out of `feat:` / `fix:` prefixes, and this
 * repository does not write them. Its commit subjects are sentences — "Stop the template
 * editor conflicting with itself" — which the conventional parser files under "other" and
 * counts as no change at all, producing an empty changelog and never bumping anything.
 * Rather than change how the project writes commits to suit a tool, the tool lists what
 * was committed and a human picks the bump.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const printOnly = args.includes('--print');
const version = args.find((arg) => !arg.startsWith('--'));

if (!printOnly && !version) {
  process.stderr.write('usage: changelog.mjs <version> | changelog.mjs --print\n');
  process.exit(2);
}

const FILE = 'CHANGELOG.md';
const HEADER = `# Changelog

Every released version, newest first. Written by \`scripts/changelog.mjs\` during
\`npm run release\` — edit a section afterwards if a line deserves better words than its
commit subject had, but do not hand-add a version here: the tag is what makes a release.
`;

/** The previous release, or nothing on the first one. */
function previousTag() {
  try {
    // stderr is swallowed rather than inherited: with no tags yet `git describe` writes
    // "fatal: No names found", which is the expected answer on a first release and reads
    // like a failure if it reaches the console.
    return execFileSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

const from = previousTag();
const range = from ? `${from}..HEAD` : 'HEAD';

// `--no-merges`, because a merge commit's subject names a branch rather than a change.
const entries = execFileSync(
  'git',
  ['log', '--no-merges', '--pretty=format:- %s (%h)', range],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter((line) => line.trim().length > 0)
  // The release commit of the previous run is bookkeeping, not a change.
  .filter((line) => !/^- Release v\d/.test(line));

const body = entries.length > 0 ? entries.join('\n') : '- No changes recorded.';

if (printOnly) {
  process.stdout.write(`${body}\n`);
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
const section = `## v${version} — ${today}\n\n${body}\n`;

const existing = existsSync(FILE) ? readFileSync(FILE, 'utf8') : '';
// Keep everything from the first version heading onwards; the header is rewritten so a
// change to its wording reaches an existing file.
const previousSections = existing.includes('\n## ')
  ? existing.slice(existing.indexOf('\n## ') + 1)
  : '';

writeFileSync(FILE, `${HEADER}\n${section}\n${previousSections}`.replace(/\n{3,}$/, '\n'), 'utf8');

// Staged here so the release commit carries it whatever release-it decides to add.
execFileSync('git', ['add', FILE], { stdio: 'inherit' });

process.stderr.write(`CHANGELOG.md: ${entries.length} entries under v${version}\n`);
