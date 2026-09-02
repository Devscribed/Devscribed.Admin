#!/usr/bin/env node
/**
 * The adherence check for rules 1 and 2 in `packages/ds/README.md`.
 *
 * It reports, it does not gate. A lint that fails the build the day it is written is a lint
 * somebody turns off; this one prints a count that should go down.
 *
 * **What counts as a violation is narrower than "a number in a file".** Only values inside a
 * style object are design values:
 *
 *   - a JSX `style={{ … }}` attribute,
 *   - a `const` annotated `React.CSSProperties` (or a `Record` of them),
 *   - a function whose declared return type is `React.CSSProperties`.
 *
 * An `<svg viewBox="0 0 12 8">` is intrinsic geometry, a logo's `fill="#007AFF"` is artwork,
 * and neither re-themes. Tokenising them would be a category error.
 *
 * A literal that is deliberately not a token says so with `@literal <reason>` in a comment on
 * the line or the line above — `Toast`'s plate is the worked example. Those are counted and
 * listed separately, so the exemption is visible rather than silent.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const REPO = path.resolve(__dirname, '..');
const ROOT = path.join(REPO, 'packages/ds/src');

/**
 * Which properties carry a value from the **shared vocabulary**, and are therefore the ones
 * rule 2 is about. This is the distinction that makes the rule worth keeping:
 *
 *   `padding: 8` is the spacing scale's third step, and belongs to every component at once.
 *   `minWidth: 360` is *this modal's* floor, and belongs to nothing else.
 *
 * Tokenising the second is not discipline, it is noise — it puts a name in the vocabulary that
 * one call site will ever read, and the next person has to look it up to find out it means 360.
 * So a component's own dimensions and offsets are out of scope, and colour, spacing, radius and
 * type are in.
 */
const SPACE_PROPS = new Set([
  'padding', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
  'margin', 'marginLeft', 'marginRight', 'marginTop', 'marginBottom',
  'gap', 'rowGap', 'columnGap',
]);
const RADIUS_PROPS = new Set([
  'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
  'borderBottomLeftRadius', 'borderBottomRightRadius',
]);
const TYPE_PROPS = new Set(['fontSize', 'letterSpacing']);
/** The one shared control metric that is a length on an ordinary property. */
const CONTROL_PROPS = new Set(['height', 'minHeight', 'borderWidth']);
const CONTROL_VALUES = new Map([[44, '--control-height'], [1.5, '--border-width-control']]);

const LENGTH_PROPS = new Set([...SPACE_PROPS, ...RADIUS_PROPS, ...TYPE_PROPS, ...CONTROL_PROPS]);

/**
 * A `px` inside a string is only a spacing value on a property that takes one. A shadow's
 * offset, a transform's distance and an animation's timing are geometry belonging to the
 * effect, and the shared ones already have tokens of their own in `tokens/effects.css` —
 * `--shadow-*`, `--duration-*`, `--transition-*` — which is where that vocabulary is checked.
 */
const PX_PROPS = new Set([...LENGTH_PROPS, 'lineHeight', 'border', 'borderTop', 'borderRight',
  'borderBottom', 'borderLeft', 'outline', 'flexBasis', 'width', 'height', 'minWidth', 'maxWidth']);
const UNITLESS = new Set([]);

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const PX = /\b\d+(?:\.\d+)?px\b/g;

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });

function isStyleObject(node) {
  const parent = node.parent;
  if (!parent) return false;
  // style={{ … }}
  if (ts.isJsxExpression(parent) && parent.parent && ts.isJsxAttribute(parent.parent)) {
    return parent.parent.name.getText() === 'style';
  }
  // const x: React.CSSProperties = { … }  /  Record<string, React.CSSProperties>
  if (ts.isVariableDeclaration(parent) && parent.type) return /CSSProperties/.test(parent.type.getText());
  if (ts.isPropertyAssignment(parent)) return isStyleObject(parent.parent);
  // return { … } from a function typed : React.CSSProperties
  if (ts.isReturnStatement(parent) || ts.isParenthesizedExpression(parent) || ts.isArrowFunction(parent)) {
    let fn = parent;
    while (fn && !ts.isFunctionDeclaration(fn) && !ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) fn = fn.parent;
    return !!(fn && fn.type && /CSSProperties/.test(fn.type.getText()));
  }
  if (ts.isConditionalExpression(parent) || ts.isSpreadAssignment(parent) || ts.isBinaryExpression(parent)) {
    return isStyleObject(parent);
  }
  return false;
}

function scan(file) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  const lines = src.split('\n');
  const found = [];
  const broken = [];

  /**
   * An `@literal` marker exempts **the style object it is written in**, or written just above.
   * That is the unit the reason is actually about: "this object's values are this component's
   * own" is one statement, and repeating it on every line of a paint would be noise.
   */
  const exempt = (node) => {
    // The *outermost* style object, so a note above `const badgeSizes = { m: {…}, s: {…} }`
    // covers the rows inside it rather than only the object it is literally attached to.
    let obj = null;
    for (let n = node; n; n = n.parent) if (ts.isObjectLiteralExpression(n) && isStyleObject(n)) obj = n;
    if (!obj) obj = node;
    // From the start of the statement that declares it, so leading comments are in range.
    let stmt = obj;
    while (stmt.parent && !ts.isStatement(stmt) && !ts.isJsxAttribute(stmt)) stmt = stmt.parent;
    const from = Math.max(0, Math.min(stmt.getFullStart(), obj.getFullStart()));
    const m = /@literal\s+(.+?)(?:\*\/|\n|$)/.exec(src.slice(from, obj.getEnd()));
    return m ? m[1].trim() : null;
  };

  const report = (node, kind, text) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    found.push({ line: line + 1, kind, text, exempt: exempt(node) });
  };

  const visitProp = (prop) => {
    if (!ts.isPropertyAssignment(prop)) return;
    const name = prop.name.getText().replace(/['"]/g, '');
    const value = prop.initializer;
    const each = (n) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) {
        const t = n.getText();
        for (const m of t.matchAll(HEX)) report(n, 'hex', m[0]);
        if (PX_PROPS.has(name)) for (const m of t.matchAll(PX)) report(n, 'px', m[0]);
      } else if (ts.isNumericLiteral(n) || (ts.isPrefixUnaryExpression(n) && ts.isNumericLiteral(n.operand))) {
        if (!LENGTH_PROPS.has(name) || n.getText() === '0') return;
        const value = Math.abs(Number(n.getText()));
        if (CONTROL_PROPS.has(name) && !CONTROL_VALUES.has(value)) return;
        report(n, 'bare', `${name}: ${n.getText()}`);
      } else {
        n.forEachChild(each);
      }
    };
    each(value);
  };

  /**
   * A token substitution swaps a number for a string, and there is one place that silently
   * changes meaning: `marginTop: -20` becoming `marginTop: -'var(--space-7)'`. Unary minus on
   * a string is `NaN` at runtime and `number` to the compiler, so neither `tsc` nor the
   * value gate sees it — the resolved text reads `-20px` either way. It is always a mistake,
   * so it is an error here rather than a count.
   */
  const guard = (node) => {
    if (ts.isPrefixUnaryExpression(node) && ts.isStringLiteral(node.operand)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
      broken.push({ line: line + 1, text: node.getText() });
    }
    node.forEachChild(guard);
  };
  guard(sf);

  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node) && isStyleObject(node)) node.properties.forEach(visitProp);
    node.forEachChild(visit);
  };
  visit(sf);
  return { found, broken };
}

const files = walk(ROOT).sort();
let open = 0;
let exempted = 0;
const rows = [];
let malformed = 0;
for (const f of files) {
  const { found: hits, broken } = scan(f);
  for (const b of broken) {
    console.error(`  BROKEN  ${path.relative(REPO, f)}:${b.line}  ${b.text}  — a negated string is NaN`);
    malformed++;
  }
  if (!hits.length) continue;
  const rel = path.relative(REPO, f);
  const live = hits.filter((h) => !h.exempt);
  open += live.length;
  exempted += hits.length - live.length;
  if (live.length) rows.push([rel, live]);
}

/**
 * Rule 4's mechanical half: nothing outside the package reaches past its index. A deep import
 * makes a component file part of the surface, and then moving it is a breaking change.
 */
function deepImports() {
  const roots = ['apps', 'e2e', 'packages'].map((d) => path.join(REPO, d)).filter(fs.existsSync);
  const hits = [];
  const scanDir = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === 'dist') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { scanDir(p); continue; }
      if (!/\.(ts|tsx|js|jsx|mjs)$/.test(e.name)) continue;
      if (p.startsWith(path.join(REPO, 'packages/ds') + path.sep)) continue; // its own internals
      const text = fs.readFileSync(p, 'utf8');
      for (const m of text.matchAll(/from\s+['"](@devscribed\/ds\/[^'"]+)['"]/g)) {
        if (m[1] === '@devscribed/ds/styles.css') continue; // the one published sub-path
        hits.push(`${path.relative(REPO, p)}  ${m[1]}`);
      }
    }
  };
  roots.forEach(scanDir);
  return hits;
}

const verbose = process.argv.includes('--verbose');
for (const [rel, hits] of rows) {
  console.log(`\n${rel}  (${hits.length})`);
  for (const h of verbose ? hits : hits.slice(0, 6)) console.log(`  ${String(h.line).padStart(4)}  ${h.kind.padEnd(4)} ${h.text}`);
  if (!verbose && hits.length > 6) console.log(`  … ${hits.length - 6} more`);
}
console.log(`\nadherence: ${open} value${open === 1 ? '' : 's'} outside the token vocabulary, ${exempted} exempted with a stated reason`);
const deep = deepImports();
for (const d of deep) console.error(`  DEEP IMPORT  ${d}`);
if (deep.length) console.error(`${deep.length} import${deep.length === 1 ? '' : 's'} past the package index`);

if (malformed) {
  console.error(`${malformed} malformed substitution${malformed === 1 ? '' : 's'} — these are bugs, not style`);
  process.exit(1);
}
