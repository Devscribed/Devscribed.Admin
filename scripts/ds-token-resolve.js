#!/usr/bin/env node
/**
 * The token map, and the substitution that lets Gate B see through it.
 *
 * Phase 4 replaces literals with token references: `padding: '4px 8px'` becomes
 * `padding: 'var(--space-1) var(--space-3)'`. Nothing in the source can tell whether that
 * was the right pair of tokens — `--space-2` is 6px and would read just as plausibly.
 *
 * So the check runs the other way. Every `var(--x)` on *both* sides is resolved back to the
 * literal it stands for, and the two resolved files must then be identical under
 * `ds-equiv.js`. A correct substitution round-trips to the same pixels; a wrong one, or an
 * invented token, does not.
 *
 * Both sides resolve through the *current* map, because a phase that adds a token needs the
 * old side (which holds the literal) and the new side (which holds the name) to meet.
 *
 * Run directly to inspect one file: `node scripts/ds-token-resolve.js <file>`.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

/** Where tokens live now, and where they lived before. First hit wins. */
const TOKEN_DIRS = [
  path.join(REPO, 'packages/ds/src/tokens'),
  path.join(REPO, '1_DS for dev/tokens'),
];

function tokenDir() {
  const found = TOKEN_DIRS.find((d) => fs.existsSync(d));
  if (!found) throw new Error(`no token directory found; looked in:\n  ${TOKEN_DIRS.join('\n  ')}`);
  return found;
}

/**
 * `--name: value;` where `value` may itself hold `;`-free parenthesised commas
 * (`rgba(0, 0, 0, .12)`) and may span lines (`--shadow-modal`). Scanning to the first
 * semicolon at paren-depth zero is what a regex cannot do.
 */
function parseDeclarations(css) {
  const out = new Map();
  const re = /--([A-Za-z0-9-]+)\s*:/g;
  let m;
  while ((m = re.exec(css))) {
    let i = re.lastIndex;
    let depth = 0;
    while (i < css.length) {
      const c = css[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ';' && depth === 0) break;
      i++;
    }
    out.set(m[1], stripComments(css.slice(re.lastIndex, i)).trim().replace(/\s+/g, ' '));
    re.lastIndex = i;
  }
  return out;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

function buildMap(dir = tokenDir()) {
  const map = new Map();
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.css')) continue;
    for (const [k, v] of parseDeclarations(fs.readFileSync(path.join(dir, f), 'utf8'))) map.set(k, v);
  }
  return map;
}

/**
 * `var(--a)` and `var(--a, fallback)`. Aliases chain (`--surface-sunken` →
 * `--color-gray-table-header` → `#EEF2F5`), so this runs until nothing changes. The cap
 * catches a cycle rather than hanging on it.
 *
 * `forJs` is for the one token whose value contains quotes — `--font-family-base` is
 * `'Poppins', sans-serif`, and dropping that verbatim inside `fontFamily: 'var(…)'` ends the
 * string early and leaves the file unparseable. The quotes carry no pixels, so under `forJs`
 * they are dropped; `ds-equiv.js` flattens quoting on both sides to match.
 */
function resolve(text, map = buildMap(), { forJs = false } = {}) {
  const value = (v) => (forJs ? v.replace(/['"]/g, '') : v);
  const one = (s) =>
    s.replace(/var\(\s*--([A-Za-z0-9-]+)\s*(?:,([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, (whole, name, fallback) => {
      if (map.has(name)) return value(map.get(name));
      if (fallback !== undefined) return value(fallback.trim());
      return whole;
    });
  let prev = text;
  for (let i = 0; i < 12; i++) {
    const next = one(prev);
    if (next === prev) return next;
    prev = next;
  }
  throw new Error('token resolution did not settle in 12 passes — a var() cycle?');
}

/** Names a file mentions that the map has never heard of. Phase 4's invented-token catch. */
function unknownTokens(text, map = buildMap()) {
  const names = new Set();
  for (const m of text.matchAll(/var\(\s*--([A-Za-z0-9-]+)/g)) if (!map.has(m[1])) names.add(m[1]);
  return [...names];
}

module.exports = { buildMap, resolve, unknownTokens, tokenDir };

if (require.main === module) {
  const [file] = process.argv.slice(2);
  const map = buildMap();
  if (!file) {
    console.log(`${map.size} tokens from ${path.relative(REPO, tokenDir())}`);
    for (const [k, v] of map) console.log(`  --${k}: ${v}`);
    process.exit(0);
  }
  const src = fs.readFileSync(file, 'utf8');
  const unknown = unknownTokens(src, map);
  if (unknown.length) {
    console.error(`unknown tokens in ${file}: ${unknown.map((n) => '--' + n).join(', ')}`);
    process.exit(1);
  }
  process.stdout.write(resolve(src, map));
}
