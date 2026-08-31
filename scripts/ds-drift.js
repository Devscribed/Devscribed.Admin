#!/usr/bin/env node
/**
 * Reports drift between the vendored design system and the design project that owns it.
 *
 * `_ds_manifest.json` is written by the design project's compiler and lists what the
 * upstream library knows about. `index.js` is what the app can actually import. When we
 * add a component to the vendored copy the two disagree, and until now nothing said so.
 *
 * Every disagreement must carry a ledger number — see specs/design-system/ledger.md.
 * Exits non-zero when they disagree, so the check can gate a push.
 */
const fs = require('fs');
const path = require('path');

const ds = path.join(__dirname, '..', '1_DS for dev');
const source = fs.readFileSync(path.join(ds, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ds, '_ds_manifest.json'), 'utf8'));

// `export { Radio, RadioGroup } from './forms/Radio.jsx'` — with `as`, the app imports the alias.
const exported = [...source.matchAll(/export\s*\{([^}]*)\}\s*from/g)]
  .flatMap((m) => m[1].split(','))
  .map((name) => name.trim().split(/\s+as\s+/).pop())
  .filter(Boolean);

const declared = manifest.components.map((c) => c.name);
const localOnly = exported.filter((name) => !declared.includes(name)).sort();
const unreachable = declared.filter((name) => !exported.includes(name)).sort();

const columns = (names) => {
  const width = Math.max(...names.map((n) => n.length)) + 2;
  return names
    .reduce((rows, name, i) => {
      if (i % 5 === 0) rows.push([]);
      rows[rows.length - 1].push(name.padEnd(width));
      return rows;
    }, [])
    .map((row) => `   ${row.join('').trimEnd()}`)
    .join('\n');
};

console.log(`components in _ds_manifest.json (compiler-generated):  ${declared.length}`);
console.log(`components exported by index.js (importable by app):   ${exported.length}`);
if (localOnly.length) {
  console.log(`\nlocal-only, invisible to the design project:\n${columns(localOnly)}`);
}
if (unreachable.length) {
  console.log(`\ndeclared upstream but not exported here:\n${columns(unreachable)}`);
}
if (!localOnly.length && !unreachable.length) console.log('\nno drift.');

process.exit(localOnly.length + unreachable.length > 0 ? 1 : 0);
