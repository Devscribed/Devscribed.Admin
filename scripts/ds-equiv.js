#!/usr/bin/env node
/**
 * Gate A — proof that a change moved no code.
 *
 * Two phases of this project rewrite every file in the design system while intending to
 * change nothing that runs. The port adds type annotations; the language pass rewrites
 * comments. Both are large enough that reading the diff is not proof of anything.
 *
 * TypeScript's own transpiler erases exactly the two things those phases add — types and
 * comments — and emits the JavaScript underneath. Strip both sides that way, flatten
 * whitespace, and require the results to be byte-identical. What survives is the program.
 *
 * It is a stricter check than a rendering test: `.filter(Boolean)` and `.filter((x) => x)`
 * behave identically and no snapshot would separate them, but they are different programs
 * and this says so.
 *
 * Usage
 *   ds-equiv.js <a> <b>                 two files
 *   ds-equiv.js --map <baseDir> <dir>   every file in <dir>, against its twin in <baseDir>
 *   ds-equiv.js --git <rev> [path...]   the working tree against a revision
 *   ...with --tokens to resolve var() on both sides first (Gate B).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ts = require('typescript');

const REPO = path.resolve(__dirname, '..');
const rel = (p) => path.relative(REPO, p) || p;

/**
 * `jsx: Preserve` keeps JSX as JSX, so a `.jsx` and a `.tsx` of the same component reduce
 * to the same text; anything else would have to agree on a runtime import too.
 */
function strip(source, ext) {
  return ts
    .transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.Preserve,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        removeComments: true,
      },
      fileName: `input${ext}`,
      reportDiagnostics: false,
    })
    .outputText.replace(/\s+/g, ' ')
    .trim();
}

/**
 * Import specifiers are the one thing the port is allowed to change: `./Icon.jsx` becomes
 * `./Icon` once the files are `.tsx` and a bundler is resolving them. Normalising the
 * extension away keeps that from reading as a code change, and the specifier itself is
 * still compared.
 */
const normaliseSpecifiers = (text) =>
  text.replace(/(from\s*|import\s*\(\s*)(['"])([^'"]+?)\.(jsx|tsx|js|ts)\2/g, '$1$2$3$2');

function normalise(source, ext, { tokens }) {
  let text = source;
  if (tokens) {
    const { resolve, unknownTokens } = require('./ds-token-resolve.js');
    const unknown = unknownTokens(text);
    if (unknown.length) throw new Error(`unknown token(s): ${unknown.map((n) => '--' + n).join(', ')}`);
    text = resolve(text, undefined, { forJs: true });
    // What is being compared here is resolved *values*, not how they were spelled. Three
    // normalisations make the two sides meet, and each one is a spelling difference the token
    // substitution necessarily introduces:
    //
    //   quotes   `--font-family-base` is `'Poppins', sans-serif`, so the same font arrives as
    //            `'Poppins, sans-serif'` from the token and `"'Poppins', sans-serif"` from a
    //            literal.
    //   hex      `#fff` becomes `var(--color-white)`, which resolves to `#FFFFFF`.
    //   px       `padding: 8` becomes `padding: 'var(--space-3)'`, which resolves to `'8px'` —
    //            and a bare number on a length property *is* px, which is why React adds it.
    //
    // The cost is that this mode cannot tell `1.5` from `'1.5px'`, or a string from an
    // identifier of the same spelling. Gate A is strict about all of it and is what guards the
    // phases that move code; this one is only ever asked whether two sets of values agree.
    return normaliseSpecifiers(strip(text, ext))
      .replace(/\\?['"]/g, '')
      .replace(/#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])\b/g, (_, r, g, b) => `#${r}${r}${g}${g}${b}${b}`)
      .replace(/#[0-9a-fA-F]{6}\b/g, (h) => h.toLowerCase())
      .replace(/(\d)px\b/g, '$1');
  }
  return normaliseSpecifiers(strip(text, ext));
}

/** The first place the two texts part company, with a little of each side around it. */
function firstDifference(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const from = Math.max(0, i - 60);
  return { at: i, a: a.slice(from, i + 60), b: b.slice(from, i + 60) };
}

function compare(aPath, bPath, opts) {
  let a, b;
  try {
    a = normalise(read(aPath), path.extname(name(aPath)), opts);
    b = normalise(read(bPath), path.extname(name(bPath)), opts);
  } catch (e) {
    return { ok: false, label: label(bPath), reason: e.message };
  }
  if (a === b) return { ok: true, label: label(bPath) };
  const d = firstDifference(a, b);
  return {
    ok: false,
    label: label(bPath),
    reason: `diverges at character ${d.at}\n      was: …${d.a}…\n      now: …${d.b}…`,
  };
}

/** A path is either on disk or `rev:path` in git. */
const isGit = (p) => typeof p === 'object';
const name = (p) => (isGit(p) ? p.path : p);
const label = (p) => (isGit(p) ? `${p.rev}:${p.path}` : rel(p));
const read = (p) =>
  isGit(p)
    ? execFileSync('git', ['show', `${p.rev}:${p.path}`], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 }).toString()
    : fs.readFileSync(p, 'utf8');

const SOURCE = /\.(jsx|tsx|js|ts)$/;
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return SOURCE.test(e.name) && !e.name.endsWith('.d.ts') ? [p] : [];
  });

/** `Badge.tsx` in the new tree answers to `Badge.jsx` in the old one. */
function twin(baseDir, relPath) {
  const stem = path.join(baseDir, relPath.replace(SOURCE, ''));
  for (const ext of ['.jsx', '.tsx', '.js', '.ts']) if (fs.existsSync(stem + ext)) return stem + ext;
  return null;
}

function main(argv) {
  const tokens = argv.includes('--tokens');
  const args = argv.filter((a) => a !== '--tokens');
  const opts = { tokens };
  let pairs = [];

  if (args[0] === '--map') {
    const [, baseDir, dir] = args;
    for (const file of walk(dir).sort()) {
      const relPath = path.relative(dir, file);
      const base = twin(baseDir, relPath);
      if (!base) {
        pairs.push({ missing: true, label: rel(file) });
        continue;
      }
      pairs.push({ a: base, b: file });
    }
  } else if (args[0] === '--git') {
    const [, rev, ...paths] = args;
    const listed = execFileSync('git', ['ls-files', '-z', ...(paths.length ? paths : ['.'])], { cwd: REPO })
      .toString()
      .split('\0')
      .filter((p) => p && SOURCE.test(p) && !p.endsWith('.d.ts'));
    for (const p of listed) pairs.push({ a: { rev, path: p }, b: path.join(REPO, p) });
  } else if (args.length === 2) {
    pairs.push({ a: args[0], b: args[1] });
  } else {
    console.error(fs.readFileSync(__filename, 'utf8').match(/ \* Usage[\s\S]*?\*\//)[0].replace(/^ \*ic?/gm, ''));
    process.exit(2);
  }

  const results = pairs.map((p) =>
    p.missing ? { ok: false, label: p.label, reason: 'no counterpart in the baseline tree' } : compare(p.a, p.b, opts),
  );
  const failed = results.filter((r) => !r.ok);
  for (const r of failed) console.error(`  FAIL  ${r.label}\n      ${r.reason}`);
  const gate = tokens ? 'B (tokens resolved)' : 'A';
  console.log(`Gate ${gate}: ${results.length - failed.length}/${results.length} equivalent`);
  process.exit(failed.length ? 1 : 0);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { strip, normalise, compare };
