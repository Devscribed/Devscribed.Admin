#!/usr/bin/env node
/**
 * ui-check — the mechanical half of `.claude/skills/ui-craft/`.
 *
 * Four of the thirty-eight rules are decidable from the source, and these are those four. It
 * REPORTS and never gates, for the reason `ds:check` does: a lint that fails the build the day
 * it is written is a lint somebody turns off. The exit code is 0 whatever it finds.
 *
 *   node scripts/ui-check.mjs                      every tracked file under apps/web and packages/ds
 *   node scripts/ui-check.mjs apps/web/app/org     only what is under that path
 *   node scripts/ui-check.mjs --json
 *
 * What it cannot see is most of what the page is about, and it never claims otherwise: a flag
 * cleared correctly today by three separate returns is UC-01's shape and not its defect, and it
 * is reported as a shape.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const paths = argv.filter((a) => !a.startsWith('--'));

const findings = [];
const add = (rule, file, line, message, why) =>
  findings.push({ rule, file, line, message, why });

const files = execFileSync(
  'git',
  ['ls-files', ...(paths.length ? paths : ['apps/web', 'packages/ds'])],
  { cwd: ROOT, encoding: 'utf8' },
)
  .split('\n')
  .filter((f) => /\.(tsx|ts)$/.test(f) && !/\.(spec|test)\.tsx?$/.test(f));

/** The 1-based line an index falls on. */
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** The slice from an opening brace at `from` to its match. */
function block(text, from) {
  let depth = 0;
  let i = from;
  for (; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(from, i + 1);
    }
  }
  return text.slice(from);
}

/* ── UC-02, UC-06 — a request with no failure path ────────────────────────── */

/**
 * An `await fetch(` inside an effect whose enclosing body has no `catch`. The rejection reaches
 * nothing, and a screen keeps whatever state it was in — most often a control drawing an empty
 * list, which is the same picture as a successful read of nothing.
 */
function unguardedFetch(text, file) {
  for (const m of text.matchAll(/useEffect\(\s*\(\)\s*=>\s*\{/g)) {
    const body = block(text, m.index + m[0].length - 1);
    if (!body.includes('await fetch(')) continue;
    if (body.includes('catch')) continue;
    add('uc/unguarded-fetch', file, lineOf(text, m.index),
      'an effect awaits fetch and has no catch',
      'UC-02, UC-06 — the rejection reaches nothing and the screen keeps the state it was in');
  }
}

/* ── UC-01 — an in-flight flag cleared outside `finally` ──────────────────── */

const FLAG = /^(loading|saving|busy|submitting|sending|pending|syncing|deleting|working)/i;

function flagOutsideFinally(text, file) {
  const raised = new Set(
    [...text.matchAll(/set([A-Z]\w*)\(\s*true\s*\)/g)].map((m) => m[1]).filter((n) => FLAG.test(n)),
  );
  for (const name of raised) {
    const resets = [...text.matchAll(new RegExp(`set${name}\\(\\s*false\\s*\\)`, 'g'))];
    if (!resets.length) {
      add('uc/flag-never-cleared', file, lineOf(text, text.indexOf(`set${name}(true)`)),
        `${name} is raised and never cleared`,
        'UC-01 — the control it guards stays disabled for the life of the screen');
      continue;
    }
    const inFinally = resets.some((r) =>
      /finally\s*\{[^{}]*$/.test(text.slice(Math.max(0, r.index - 400), r.index)),
    );
    if (inFinally) continue;
    add('uc/flag-outside-finally', file, lineOf(text, resets[0].index),
      `${name} is cleared on ${resets.length === 1 ? 'one path' : `${resets.length} paths`}, not in a finally`,
      'UC-01 — a shape, not yet a defect: the first early return added past a reset strands it');
  }
}

/* ── UC-18 — a transition on a property that lays out ───────────── */

/**
 * Properties whose animation forces layout on every frame. `box-shadow` and `filter` are
 * deliberately absent: they only paint, and the design system's own hover treatment transitions
 * both — a report that argues with the normative document is a report nobody finishes reading.
 */
const EXPENSIVE = [
  'width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding',
];

function expensiveTransition(text, file) {
  /* Inline style objects — `transition: 'width 0.2s ease'` — and stylesheet declarations. */
  for (const m of text.matchAll(/transition(?:Property)?\s*:\s*(['"`])([^'"`]+)\1/g)) {
    const value = m[2];
    const hit = EXPENSIVE.find((p) => new RegExp(`(^|[\\s,])${p}\\b`).test(value));
    if (!hit) continue;
    add('uc/expensive-transition', file, lineOf(text, m.index),
      `transition animates \`${hit}\``,
      'UC-18 — every frame lays out or paints; move the box with transform, fade it with opacity');
  }
}

/* ── UC-20 — a key that is not a stable id ────────────────────────────────── */

function indexKey(text, file) {
  for (const m of text.matchAll(/key=\{\s*(i|idx|index|[a-z]?Index)\s*\}/g)) {
    add('uc/index-key', file, lineOf(text, m.index),
      `key={${m[1]}} is a position, not an identity`,
      'UC-20 — a sort or a filter renames every row; correct only where order and length never change');
  }
}

/* ── run ──────────────────────────────────────────────────────────────────── */

for (const file of files) {
  let text;
  try {
    text = readFileSync(resolve(ROOT, file), 'utf8');
  } catch {
    continue; // deleted in the working tree, still tracked
  }
  unguardedFetch(text, file);
  flagOutsideFinally(text, file);
  expensiveTransition(text, file);
  indexKey(text, file);
}

findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));

if (asJson) {
  console.log(JSON.stringify({ scanned: files.length, findings }, null, 2));
} else if (!findings.length) {
  console.log(`ui-check: ${files.length} files — nothing to report`);
} else {
  for (const f of findings) {
    console.log(`${f.file}:${f.line}  ${f.rule}`);
    console.log(`    ${f.message}`);
    console.log(`    ${f.why}`);
  }
  const byRule = findings.reduce((m, f) => m.set(f.rule, (m.get(f.rule) ?? 0) + 1), new Map());
  console.log(`\n${findings.length} across ${files.length} files:`);
  for (const [rule, n] of [...byRule].sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${rule}`);
  console.log('\nThis is a report. It does not gate, and the exit code is 0.');
}

process.exit(0);
