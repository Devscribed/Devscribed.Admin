#!/usr/bin/env node
/**
 * static-gate — the checks a reviewer reading a diff cannot be relied on to make.
 *
 * The gate exists for one narrow reason: the reviewer is a model, and there are changes it
 * might not notice in a large diff that would let a bad run *pass*. Everything a checklist
 * could enforce by reading is left to the reviewer, because a wrong reviewer costs a note or
 * an appeal, while a wrong pass costs a merge.
 *
 *   1. The implementation may not edit the specification it is being checked against.
 *   2. The implementation may not weaken the checks that judge it.
 *   3. The test tree must typecheck. `tsconfig.build.json` excludes `test`, so nothing else
 *      compiles the integration suites until they run — and a suite that does not compile
 *      reports nothing while the log says the cases passed.
 *   4. Every message in the spec's Error Messages table exists in `packages/validation`.
 *   5. Every `data-testid` the spec requires is rendered, and every one the diff adds is named
 *      in the spec.
 *   6. Every custom property `Geometry & motion` names is declared, and no property the spec
 *      names is declared under a different spelling. Not "every property the spec names
 *      exists" — a `## DS gaps` row says a property does not yet exist, and that is allowed.
 *   7. Every export the spec's `Shared code` table names exists.
 *   8. Every typeface `--font-family-*` names is fetched by something in the tree.
 *
 * Rules 3 to 8 answer questions with one right answer that no amount of reading a diff
 * reliably produces: a string that exists nowhere, an id nothing renders, a file that does not
 * compile, two spellings of one value in two files, a typeface only the author's machine has.
 * Everything a rule here cannot settle mechanically it reports as a note.
 *
 * Rules 1 and 2 read `git diff` directly. There is no file walker, no symbol parser and no
 * bespoke copy of a lint rule — design-system token rules already exist as oxlint config in
 * `1_DS for dev/_adherence.oxlintrc.json`, and reimplementing them here would be a second
 * source of truth that drifts.
 *
 * Output is a verdict in the schema the agents use, so `wf verdict` routes it identically.
 *
 * Usage:
 *   node scripts/static-gate.mjs [--base <ref>] [--out <file>] [--json]
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });

const run = (() => {
  const cur = join(ROOT, '.workflow/current');
  if (!existsSync(cur)) return null;
  const p = join(ROOT, '.workflow/runs', readFileSync(cur, 'utf8').trim(), 'run.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
})();

const base = opt('base') ?? run?.baseRef;
/* Rule 1 asks a different question from the other rules. They ask "what is in the change" and
   want the whole diff; it asks "did the implementation stage edit its own contract" and wants
   only what this run produced. Those differ the moment a run starts with `--from`, because the
   diff then contains commits made before the run — including the deliberate, human spec fix
   that a halt asked for. Judging that by the diff accused the implementer of an edit it had
   not made and, worse, told it to revert one. */
const runStart = run?.headAtInit ?? base;
if (!base) {
  process.stderr.write('static-gate: no diff base — start a run or pass --base <ref>\n');
  process.exit(1);
}

const findings = [];
let seq = 0;
const add = (f) => findings.push({ id: `S${++seq}`, severity: 'blocker', target: 'code', ...f });

const isTest = (p) => /\.(spec|test)\.(ts|tsx|js|mjs)$/.test(p);
const isSource = (p) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(p);

/* ── 0. the work is committed ────────────────────────────────────────────── */

/* Every gate downstream reads `git diff <base>...HEAD`. Work left in the working tree is
   invisible to all of them, so a run whose implementation was never committed reaches the
   reviewer as an empty change and the reviewer judges nothing. This is the first rule
   because a diff with nothing in it makes every rule below vacuous — they all pass, and
   the run advances on a branch that carries no work. */

/* `base...HEAD`, not `base` — the two-dot form against a working tree counts uncommitted
   edits as present, which is the very thing this rule exists to catch. Three dots is also
   exactly what the reviewer and QA read, so the gate asks their question and not a
   neighbouring one. */
const carried = git('diff', '--name-only', `${base}...HEAD`, '--', '.', ':(exclude).workflow')
  .split('\n').filter(Boolean);

if (carried.length === 0) {
  const uncommitted = git('status', '--short', '--', '.', ':(exclude).workflow')
    .split('\n').filter(Boolean);
  add({
    rule: 'pipeline/work-uncommitted',
    file: uncommitted[0]?.slice(3) ?? '(nothing on disk either)',
    claim: uncommitted.length
      ? `no commit on this branch carries the implementation; ${uncommitted.length} file(s) are modified in the working tree and invisible to every gate that reads the diff`
      : 'no commit on this branch carries an implementation, and the working tree is empty too',
    witness: {
      kind: 'command',
      detail: `\`git diff --name-only ${base}...HEAD -- . ':(exclude).workflow'\` prints nothing.`
        + (uncommitted.length
          ? ` \`git status --short\` shows: ${uncommitted.join(', ')}.`
          : ' `git status --short` shows nothing either.'),
      source: `git diff ${base}...HEAD`,
    },
    suggestedFix: uncommitted.length
      ? 'commit the working-tree changes onto this branch in one commit, naming the attempt, then re-run the gate'
      : 'implement the document; nothing has been written',
  });
}

/* ── 1. the contract is not the implementation's to edit ─────────────────── */

for (const file of git('diff', '--name-only', runStart, '--', 'specs').split('\n').filter(Boolean)) {
  add({
    rule: 'pipeline/spec-immutable',
    file,
    claim: 'the implementation stage modified a specification file',
    witness: {
      kind: 'rule',
      detail: 'CLAUDE.md: "When behaviour and spec disagree, the spec wins — change the spec first, deliberately." A run that edits its own contract can no longer be checked against it.',
      source: 'CLAUDE.md',
    },
    suggestedFix: 'revert the spec edit and raise a finding with target "spec" instead — that halts the run for a human, which is the intended path',
  });
}

/* ── 2. the checks are not the implementation's to weaken ────────────────── */

/* Two of these are code constructs and two are only ever written in a comment, and the ones that
   are code are read against the line's code alone. A detector that reads prose finds `as any` in
   "answered the same as any other stranger" and charges the implementation with a cast it never
   wrote — and the retry that answers it spends a whole attempt deleting a sentence. */
const SUPPRESSIONS = [
  [/\.(skip|only)\s*\(/, 'a skipped or focused test', true, 'code'],
  [/@ts-ignore|@ts-expect-error/, 'a suppressed type error', false, 'comment'],
  [/\bas\s+any\b/, 'an `as any` cast', false, 'code'],
  [/eslint-disable/, 'a disabled lint rule', false, 'comment'],
];

/**
 * One diff line with its comments and string literals blanked, leaving the code it states.
 *
 * String literals go first, so that a `//` inside one — `"https://host/a//b"` — is gone before
 * anything looks for a comment. The other order truncates the line at the URL and loses the cast
 * that follows it, which is the false negative that matters here: a missed suppression ships.
 */
const codeOnly = (l) => l
  .replace(/\/\*[\s\S]*?(?:\*\/|$)/g, ' ')
  .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, ' ')
  .replace(/\/\/.*$/, ' ');

/* Split on the header rather than on "\ndiff --git ": the first chunk has no leading
   newline, so a naive split leaves its header attached and the first file of every diff
   gets parsed as "diff". That bug hid rule 2 entirely the first time this ran. */
for (const chunk of git('diff', '-U0', base, '--', 'apps', 'packages', 'e2e').split(/^diff --git /m)) {
  const file = chunk.match(/^a\/(\S+)/)?.[1];
  if (!file || !isSource(file)) continue;

  for (const line of chunk.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    for (const [re, what, testsOnly, where] of SUPPRESSIONS) {
      if (!re.test(where === 'code' ? codeOnly(line) : line) || (testsOnly && !isTest(file))) continue;
      add({
        rule: 'pipeline/no-detector-weakening',
        file,
        claim: `${what} was added`,
        witness: {
          kind: 'rule',
          detail: `The diff adds ${what}:\n    ${line.slice(1).trim()}\nA change that makes the checks weaker passes the gate without making the code correct.`,
          source: 'CLAUDE.md',
        },
        suggestedFix: 'fix the underlying defect, or contest this finding with the reason the suppression is correct here',
      });
    }
  }

  if (!isTest(file)) continue;

  /* An assertion that was commented out is still gone. Counting the "+ // await expect(…)"
     line as an added assertion made removed == added and hid the simplest weakening there
     is — so a commented assertion is its own finding and never counts towards the total. */
  const isAssertion = (l) => /\b(expect|assert)\s*\(/.test(l);
  const isCommented = (l) => /^[+-]\s*(\/\/|\/\*|\*(?!\/))/.test(l);
  const lines = chunk.split('\n');

  for (const l of lines) {
    if (!l.startsWith('+') || l.startsWith('+++') || !isAssertion(l) || !isCommented(l)) continue;
    add({
      rule: 'pipeline/no-detector-weakening',
      file,
      claim: 'an assertion was commented out',
      witness: {
        kind: 'rule',
        detail: `The diff comments out an assertion:\n    ${l.slice(1).trim()}\nThe test still runs and still passes, and it no longer checks anything.`,
        source: 'CLAUDE.md',
      },
      suggestedFix: 'restore the assertion, or contest with the reason it is now wrong',
    });
  }

  const count = (sign) => lines.filter(
    (l) => l.startsWith(sign) && !l.startsWith(`${sign}${sign}${sign}`) && isAssertion(l) && !isCommented(l),
  ).length;
  const removed = count('-');
  const added = count('+');
  if (removed > added) {
    add({
      rule: 'pipeline/no-detector-weakening',
      file,
      claim: `${removed - added} more assertion(s) removed than added`,
      witness: {
        kind: 'rule',
        detail: `The diff removes ${removed} assertion(s) and adds ${added} in a test file. Net-negative assertions in a change meant to add behaviour is the signature of fixing the test instead of the code.`,
        source: 'CLAUDE.md',
      },
      suggestedFix: 'restore the assertions, or contest with the reason each removed one is now wrong',
    });
  }
}

/* `git grep` exits 1 when nothing matches, which execFileSync raises. Every search below
   treats "no match" as an answer rather than as a failure. */
const gitQuiet = (...a) => { try { return git(...a); } catch { return ''; } };
const matches = (needle, ...pathspec) =>
  gitQuiet('grep', '-l', '--fixed-strings', '--', needle, '--', ...pathspec).split('\n').filter(Boolean);

/* ── 3. the test tree must typecheck ─────────────────────────────────────── */

const TSC = join(ROOT, 'node_modules/typescript/bin/tsc');
const TS_PROJECTS = [
  ['apps/api/tsconfig.json', 'apps/api'],
  ['packages/validation/tsconfig.json', 'packages/validation'],
];

for (const [project, scope] of TS_PROJECTS) {
  if (!existsSync(TSC) || !existsSync(join(ROOT, project))) continue;
  if (!git('diff', '--name-only', base, '--', scope).trim()) continue;

  let out = '';
  try {
    execFileSync(process.execPath, [TSC, '-p', project, '--noEmit'], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    continue;
  } catch (e) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }

  const errors = out.split('\n').filter((l) => /error TS\d+/.test(l));
  if (!errors.length) continue;
  add({
    rule: 'pipeline/test-tree-typecheck',
    file: errors[0].match(/^([^(]+)\(/)?.[1]?.replace(/\\/g, '/') ?? project,
    claim: `${project} does not compile: ${errors.length} type error(s)`,
    witness: {
      kind: 'command',
      detail: `node_modules/typescript/bin/tsc -p ${project} --noEmit\n${errors.slice(0, 5).join('\n')}`,
      source: project,
    },
    suggestedFix: 'fix the type errors — a spec file that does not compile runs none of its cases, and the suite reports only the files that did',
  });
}

/* ── 4 and 5. the spec's own tables, against the repository ──────────────── */

/**
 * The whole bundle, not the behaviour file alone.
 *
 * A spec is one document in three files, and the tables this gate checks against live in the
 * other two: the `data-testid` list and the routes are in `<name>.contracts.md`, the cases in
 * `<name>.cases.md`. Reading only `<name>.md` made every id the spec names in its contracts
 * read as named nowhere — seventeen blockers on one run, of which fourteen were the gate not
 * having opened the file that names them, and the implementer was sent to delete ids the spec
 * requires.
 */
const specText = (() => {
  if (!run?.spec) return null;
  const base = run.spec.replace(/\.md$/, '');
  const members = [run.spec, `${base}.contracts.md`, `${base}.cases.md`, `${base}.design.md`];
  const found = members
    .map((m) => join(ROOT, m))
    .filter((p) => existsSync(p))
    .map((p) => readFileSync(p, 'utf8'));
  return found.length ? found.join('\n') : null;
})();

/* Split rather than match: a multiline `$` ends at the first newline, so an end-of-section
   lookahead written that way captures nothing and every rule below silently passes. Splitting
   on the heading marker cannot make that mistake, and `###` subheadings stay inside the block. */
const section = (heading) => {
  const block = `\n${specText ?? ''}`.split('\n## ').find((b) => b.startsWith(heading));
  return block ? block.slice(block.indexOf('\n') + 1) : '';
};

/* 4. Every row of the Error Messages table is a promise that the string exists in one place.
   A row whose text is nowhere in `packages/validation` is implemented nowhere, and a test
   asserting the constant the route happens to return certifies the divergence instead of
   catching it — which is why reading the diff does not find this one. */

/* A message long enough to wrap is stored as two concatenated literals, so it never appears
   contiguously and a plain search reports every long message as missing. Erasing the seam —
   quotes, the joining `+`, and the line break — lets the whole message be compared whole.
   Matching a prefix instead would be worse than useless here: the permission messages differ
   only in their last two words, so any prefix rule passes a message that is not implemented. */
const seamless = (s) => s.replace(/["'`+]/g, '').replace(/\s+/g, ' ');
const validationText = seamless(gitQuiet('grep', '-h', '', '--', 'packages/validation'));
const present = (text) => validationText.includes(seamless(text));

/* The column holding the message, found by its heading rather than by its position. The table
   has carried a `Route` column since specs began naming the route that emits each message, so
   cell 2 is a URL — and a rule that searches `packages/validation` for a URL path reports every
   row as unimplemented, which is what it did on a spec whose messages were all in place. */
/* A spec that WITHDRAWS a message tabulates it under `### Withdrawn` in this same section,
   and the whole content of such a row is that the string must no longer exist anywhere. Read
   as a live row it is a promise that is deliberately false, and every spec that removes a
   message is blocked for keeping its own word. The rows checked are the ones above that
   heading. */
const messageRows = section('Error Messages')
  .split(/\n###\s+Withdrawn/)[0]
  .split('\n')
  .filter((l) => l.startsWith('|') && !/^\|\s*-+/.test(l));
const messageCol = (() => {
  const header = messageRows[0]?.split('|').map((c) => c.trim().toLowerCase()) ?? [];
  const i = header.indexOf('message');
  return i === -1 ? 2 : i;
})();

for (const line of messageRows) {
  const cells = line.split('|').map((c) => c.trim());
  const message = cells[messageCol];
  if (!message || message.toLowerCase() === 'message') continue;

  /* A row carrying a placeholder cannot be matched whole. The longest literal run either side
     of the substitution is what the code must contain, and a short one says too little to
     search for. */
  const probe = message.split(/\{[^}]*\}/).sort((a, b) => b.length - a.length)[0]?.trim() ?? '';
  if (probe.length < 12) continue;

  if (!present(probe)) {
    add({
      rule: 'spec/message-not-implemented',
      file: run.spec,
      symbol: cells[1],
      claim: `the Error Messages row "${cells[1]}" names a string that exists nowhere in packages/validation`,
      witness: {
        kind: 'command',
        detail: `git grep -lF -- ${JSON.stringify(probe)} -- packages/validation\n(no match)`,
        source: run.spec,
      },
      suggestedFix: 'add the message to packages/validation and emit it from the route the spec names, or raise a spec finding if the row restates another spec\'s message',
    });
    continue;
  }

  const inApp = matches(probe, 'apps').filter((f) => !/\.(spec|test)\.tsx?$/.test(f));
  if (inApp.length) {
    add({
      severity: 'note',
      rule: 'spec/message-duplicated',
      file: inApp[0],
      symbol: cells[1],
      claim: `"${cells[1]}" is in packages/validation and also written out in ${inApp.length} file(s) under apps`,
      witness: { kind: 'command', detail: `git grep -lF -- ${JSON.stringify(probe)} -- apps\n${inApp.join('\n')}`, source: run.spec },
      suggestedFix: 'import the shared constant, or contest if the literal is an internal Error string rather than a user-facing message',
    });
  }
}

/* 5. The id list is a contract in both directions: an id the spec requires and nothing renders
   makes its E2E case unfalsifiable, and an id the diff invents is a selector no spec names. */

/* The table's first cell, not every backtick in the section. The prose around the table talks
   about ids too — including the sentence naming the ones this spec *removes* — and harvesting
   those asks the implementer to render an id the spec has just retired. */
const specIds = section('Required data-testid Attributes')
  .split('\n')
  .filter((l) => l.startsWith('|') && !/^\|\s*-+/.test(l))
  .flatMap((l) => [...(l.split('|')[1] ?? '').matchAll(/`([^`]+)`/g)].map((m) => m[1]))
  .filter((id) => /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(id));

/* An id the screen composes — `` data-testid={`signing-provider-option-${key}`} `` — never
   appears whole in the source. The prefix alone is not evidence, because it is also a
   substring of every sibling id spelled out in full; the prefix immediately followed by a
   substitution is. */
const rendered = (id) => {
  if (matches(id, 'apps/web').length) return true;
  const parts = id.split('-');
  for (let n = parts.length - 1; n >= 1; n -= 1) {
    if (matches(`${parts.slice(0, n).join('-')}-\${`, 'apps/web').length) return true;
  }
  return false;
};

for (const id of new Set(specIds)) {
  if (rendered(id)) continue;
  add({
    rule: 'spec/testid-not-rendered',
    file: run.spec,
    symbol: id,
    claim: `the spec requires \`${id}\` and no component under apps/web renders it`,
    witness: { kind: 'command', detail: `git grep -lF -- ${JSON.stringify(id)} -- apps/web\n(no match)`, source: run.spec },
    suggestedFix: 'render the id, or raise a spec finding — an id asserted absent that nothing ever renders makes its case pass for every provider and prove nothing',
  });
}

if (specText) {
  for (const chunk of git('diff', '-U0', base, '--', 'apps/web').split(/^diff --git /m)) {
    const file = chunk.match(/^a\/(\S+)/)?.[1];
    if (!file) continue;
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      for (const m of line.matchAll(/data-testid\s*=\s*['"{]?\s*['"]([^'"]+)['"]/g)) {
        if (specText.includes(m[1])) continue;
        add({
          rule: 'spec/testid-unnamed',
          file,
          symbol: m[1],
          claim: `\`${m[1]}\` is added by this diff and named in no spec`,
          witness: { kind: 'rule', detail: `The diff adds a selector the spec does not name:\n    ${line.slice(1).trim()}`, source: run.spec },
          suggestedFix: 'use the id the spec names, or raise a spec finding to have it named — selectors are the spec\'s to define',
        });
      }
    }
  }
}

/* 6. A custom property the spec names is a promise in exactly the way a message is: the
   document says a value has a name, and a stylesheet declaring a different name leaves the
   spec describing a product that does not exist. The gate asks the mechanical half — is
   anything called this — because reading a diff answers it only by accident, and a reviewer
   who sees the property used and the block declared has no reason to compare the two spellings
   against a table in another file. */

const declaredProperties = (() => {
  /* POSIX ERE, which is what `git grep -E` speaks: `\s` is not a class there, and a pattern
     written with it matches nothing while reporting no error — every property then reads as
     undeclared and every spec blocks. */
  const text = gitQuiet('grep', '-h', '-E', '--', '^[[:space:]]*--[a-z0-9-]+[[:space:]]*:', '--', 'packages/ds', 'apps/web');
  return new Set([...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
})();

/* A spec that WITHDRAWS a property tabulates it under `### Withdrawn`, where the whole content
   of the row is that the name must no longer exist — read as a live row it blocks the spec for
   keeping its own word, which is the mistake rule 4 already learned.

   Rule 4 truncates at that heading, which is right for one section of one file and wrong here:
   these rules read the whole bundle, so truncating discards every member after whichever file
   happened to contain a `### Withdrawn` — and the check then passes by having read almost
   nothing. Cut the block out and keep what follows it. */
const withoutWithdrawn = (text) => text.replace(/\n###\s+Withdrawn[\s\S]*?(?=\n#{1,3} |$)/g, '\n');

/* Backticked only. Prose names a family of tokens (`--space-*`, "a --surface- colour") and
   harvesting those asks for a declaration of something that was never one property. */
const specProperties = new Set(
  [...withoutWithdrawn(specText ?? '').matchAll(/`(--[a-z0-9]+(?:-[a-z0-9]+)+)`/g)].map((m) => m[1]),
);

/* Two questions, not one. "Is every property the spec names declared?" is the wrong one: a
   `## DS gaps` row exists precisely to say a property does NOT yet exist, and asking it of a
   whole bundle reports the open gaps a spec is allowed to have. The two that have one right
   answer are these. */

/* 6a. A property named in `## Geometry & motion` is a reservation the implementation owes —
   the table's whole content is that something is held at a size, and a reservation nothing
   declares is not held. Unlike DS gaps, this section never describes what is missing. */
const geometrySection = withoutWithdrawn(section('Geometry & motion'));
for (const prop of new Set([...geometrySection.matchAll(/`(--[a-z0-9]+(?:-[a-z0-9]+)+)`/g)].map((m) => m[1]))) {
  if (declaredProperties.has(prop)) continue;
  add({
    rule: 'spec/reservation-not-declared',
    file: run.spec,
    symbol: prop,
    claim: `\`${prop}\` holds an element's size in the Geometry & motion table and no stylesheet declares it`,
    witness: {
      kind: 'command',
      detail: `git grep -hE '^[[:space:]]*${prop}[[:space:]]*:' -- packages/ds apps/web\n(no match)`,
      source: run.spec,
    },
    suggestedFix: 'declare the property, or raise a spec finding — an element the spec says is held at a fixed size is held by nothing (UI-01)',
  });
}

/* 6b. A property the spec names that is declared under a DIFFERENT spelling. This is the one
   reading a diff cannot answer: the reviewer sees the property declared and sees it used, and
   has no reason to compare either against a table in a third file. Firing only when a sibling
   name exists is what keeps it silent on a spec whose vocabulary simply predates the current
   design system — there the name is absent, not misspelt. */
const segmentsOf = (name) => name.slice(2).split('-');
const siblingsOf = (name) => {
  const a = segmentsOf(name);
  return [...declaredProperties].filter((d) => {
    const b = segmentsOf(d);
    if (a[0] !== b[0]) return false;
    const [short, long] = a.length < b.length ? [a, b] : [b, a];
    return long.length - short.length === 1 && short.every((s) => long.includes(s));
  });
};

for (const prop of specProperties) {
  if (declaredProperties.has(prop)) continue;
  const siblings = siblingsOf(prop);
  if (!siblings.length) continue;
  add({
    rule: 'spec/property-spelt-differently',
    file: run.spec,
    symbol: prop,
    claim: `the spec names \`${prop}\`, which is declared nowhere, while ${siblings.map((s) => `\`${s}\``).join(' and ')} is declared`,
    witness: {
      kind: 'rule',
      detail: `The spec and the stylesheet hold two spellings of one value. Neither side is wrong on its own, and nothing that reads only one of them can tell.`,
      source: run.spec,
    },
    suggestedFix: 'settle on one spelling in both places, or raise a spec finding if the two names are genuinely two values (CR-30)',
  });
}

/* 7. `### Shared code` is the table of what a spec adds and where. An export named there and
   written nowhere is the same defect as a message that exists nowhere, and it hides in the
   same place: the screens that were going to call it were built to call something else, so
   everything compiles and every test passes. */

/* `Shared code` is written as a `###` under a `##` section, so `section()` — which splits on
   `\n## ` — cannot find it: the split lands inside the marker and the block it yields starts
   with `# Shared code`. Read the subsection on its own terms. */
const subsection = (heading) => {
  const m = new RegExp(`\\n###\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n#{1,3} |$)`).exec(specText ?? '');
  return m ? m[1] : '';
};

const sharedRows = (section('Shared code') || subsection('Shared code'))
  .split('\n')
  .filter((l) => l.startsWith('|') && !/^\|\s*-+/.test(l));

for (const line of sharedRows) {
  const cells = line.split('|').map((c) => c.trim());
  /* The identifier, not the signature: the table writes `fn(a, b)` so the reader can see the
     arity, and no source file contains that spelling. */
  const symbol = (cells[1]?.match(/`([A-Za-z_$][\w$]*)/) ?? [])[1];
  if (!symbol || symbol.length < 4) continue;
  if (matches(symbol, 'packages', 'apps').length) continue;
  add({
    rule: 'spec/export-not-implemented',
    file: run.spec,
    symbol,
    claim: `\`${symbol}\` is named in the Shared code table and exists nowhere under packages or apps`,
    witness: { kind: 'command', detail: `git grep -lF -- ${JSON.stringify(symbol)} -- packages apps\n(no match)`, source: run.spec },
    suggestedFix: 'add the export where the table puts it, or raise a spec finding if the row describes something another spec already ships under a different name',
  });
}

/* 8. A typeface the tokens name and nothing anywhere fetches. This is not about the diff — it
   is a standing property of the product, checked here because it is invisible everywhere else:
   a machine with the family installed draws the product as designed, and the machine without
   it draws whatever its generic sans is, with nothing on screen saying which.

   What this answers is the total absence: no rule anywhere names the family. It does NOT
   answer whether a stylesheet that names it is reached at runtime — a rule behind a CSP, an
   `@import` a bundler hoists somewhere it is refused, a file no entry point imports all leave
   the family named and unfetched, and none of them is visible to a grep. Nor does it check
   the weights or the scripts, where a face absent in one weight is resolved down silently
   rather than refused. Those halves of UI-06 are the reviewer's and QA's. */

const fontSources = gitQuiet(
  'grep', '-h', '-E', '--', '@font-face|next/font|fonts\\.googleapis\\.com|@import',
  '--', 'packages/ds', 'apps/web',
);

/* The FIRST family of each stack, not every quoted name in it. Everything after the first is
   a fallback the product deliberately does not ship — `'SF Mono'` is on the machine or it is
   not, and asking the repository to load it is asking for the opposite of a fallback. The
   first entry is the one the product names, and the one somebody has to fetch. */
const namedFamilies = new Set(
  [...gitQuiet('grep', '-h', '-E', '--', '^[[:space:]]*--font-family-[a-z0-9-]+[[:space:]]*:', '--', 'packages/ds')
    .matchAll(/--font-family-[a-z0-9-]+\s*:\s*([^;]+);/g)]
    .map((m) => (m[1].split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, ''))
    .filter((f) => f && !/^(sans-serif|serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|inherit|cursive|fantasy)$/i.test(f)),
);

for (const family of namedFamilies) {
  if (fontSources.includes(family) || fontSources.includes(family.replace(/ /g, '+'))) continue;
  add({
    rule: 'ds/asset-not-loaded',
    file: 'packages/ds/src/tokens',
    symbol: family,
    claim: `\`--font-family-*\` names "${family}" and nothing under packages/ds or apps/web fetches it`,
    witness: {
      kind: 'rule',
      detail: `No @font-face, next/font or stylesheet import mentions "${family}". A machine that happens to have it installed draws the product as designed; one without draws its generic fallback, in whatever weights that fallback has.`,
      source: 'packages/ds/README.md — rule 2, tokens',
    },
    suggestedFix: 'load the family in every weight the tokens ask for, or name a family that is loaded (UI-06)',
  });
}

/* ── verdict ─────────────────────────────────────────────────────────────── */

const verdict = {
  stage: 'static_gate',
  status: findings.length ? 'blocked' : 'pass',
  base,
  findings,
};

if (opt('out')) writeFileSync(resolve(ROOT, opt('out')), `${JSON.stringify(verdict, null, 2)}\n`);

if (argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
} else {
  process.stdout.write(`static-gate: ${verdict.status}  (diff against ${base.slice(0, 8)})\n`);
  for (const f of findings) process.stdout.write(`  [${f.target}] ${f.rule}\n    ${f.file}\n    ${f.claim}\n`);
}

process.exit(findings.length ? 2 : 0);
