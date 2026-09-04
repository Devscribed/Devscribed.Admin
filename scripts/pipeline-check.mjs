#!/usr/bin/env node
/**
 * pipeline-check — the pipeline's own parts still agree with each other.
 *
 * `npm run config` answers one question: would every stage start? This answers the ones after
 * it, which are all the same shape — two places name the same thing and only one of them was
 * edited:
 *
 *   - an agent definition whose `name:` no longer matches its filename;
 *   - a lead that dispatches a `subagent_type` nobody defines;
 *   - the hook matchers in `.claude/settings.json`, a second list of agent names;
 *   - a setting the config accepts and validates that **no script reads** — the worst of them,
 *     because `npm run config` prints it back and a person believes it took effect;
 *   - an agent bound by a contract in `.claude/agents/references/` that does not read it;
 *   - the E2E port ladder, which `e2e/environment.ts` and `scripts/ports.mjs` each keep.
 *
 *   node scripts/pipeline-check.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STAGES, loadConfig, stageFor, trackNames } from './ship-config.mjs';
import { laddersAgree } from './ports.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS = join(ROOT, '.claude', 'agents');

let bad = 0;
const ok = (cond, msg, detail = '') => {
  if (!cond) bad++;
  process.stdout.write(`${cond ? '  ok  ' : '  FAIL'}  ${msg}\n${!cond && detail ? `        ${detail}\n` : ''}`);
};
const head = (s) => process.stdout.write(`\n${s}\n`);

/* ── the configuration ───────────────────────────────────────────────────── */

let cfg;
try {
  cfg = loadConfig(ROOT);
} catch (e) {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
}

/* ── the agent definitions ───────────────────────────────────────────────── */

const defs = new Map();
for (const f of readdirSync(AGENTS).filter((f) => f.endsWith('.md') && f !== 'VARIANTS.md')) {
  const text = readFileSync(join(AGENTS, f), 'utf8');
  defs.set(f.replace(/\.md$/, ''), { text, name: text.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? null });
}

head('Agent definitions');
for (const [stem, d] of defs) {
  ok(d.name === stem, `${stem}.md declares its own name`, `declares "${d.name ?? '(none)'}"`);
}

head('Dispatch names');
for (const [stem, d] of defs) {
  const named = [...new Set([...d.text.matchAll(/subagent_type\s*[:=]?\s*"([a-z0-9-]+)"/gi)].map((m) => m[1]))];
  const unknown = named.filter((n) => !defs.has(n));
  ok(!unknown.length, `${stem} dispatches only agents that exist`, `unknown: ${unknown.join(', ')}`);
}

head('Hook matchers');
const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));
for (const event of ['SubagentStart', 'SubagentStop']) {
  const matchers = (settings.hooks?.[event] ?? []).map((h) => h.matcher).filter(Boolean);
  const missed = [...defs.keys()].filter((stem) => !matchers.some((m) => new RegExp(m).test(stem)));
  ok(matchers.length > 0 && !missed.length, `${event} matches every agent`,
    `unmatched: ${missed.join(', ')} — matchers: ${matchers.join(' | ')}`);
}

head('Contracts are read where they bind');
const VERDICT = 'references/verdict-contract.md';
const LEAD = 'references/lead-contract.md';
const writesVerdicts = [...defs.keys()].filter((n) => /^(code-reviewer|spec-reviewer|implementer)/.test(n));
for (const a of writesVerdicts) ok(defs.get(a).text.includes(VERDICT), `${a} reads the verdict contract`);
for (const a of [...defs.keys()].filter((n) => n.endsWith('-lead'))) {
  ok(defs.get(a).text.includes(LEAD), `${a} reads the lead contract`);
}

/* ── settings nothing reads ──────────────────────────────────────────────── */

/**
 * Every stage key the config accepts is named by a script that runs a stage.
 *
 * A key that only the validator knows about is worse than no key: `npm run config` prints it
 * back, so a person who sets it believes the pipeline took it. `effort` and `shardEffort` were
 * both of those, and the printer reported a reasoning effort nothing ever applied.
 */
head('Every setting has a reader');
const READERS = ['ship.mjs', 'wf.mjs', 'review-slice.mjs', 'run-digest.mjs', 'ship-config.mjs', 'refine-loop.mjs']
  .map((f) => ({ file: f, text: existsSync(join(ROOT, 'scripts', f)) ? readFileSync(join(ROOT, 'scripts', f), 'utf8') : '' }));

/** `ship-config.mjs` declares and prints every key, so naming one there is not reading it. */
const readsOutsideConfig = (key) => READERS.some((r) => r.file !== 'ship-config.mjs' && r.text.includes(key));

const stageKeys = new Set();
for (const track of trackNames(cfg)) {
  for (const stage of STAGES) {
    const block = cfg.shipConfig[track].stages?.[stage] ?? {};
    for (const variant of ['default', ...Object.keys(block.variants ?? {})]) {
      let s;
      try { s = stageFor(cfg, track, stage, variant); } catch { continue; }
      for (const k of Object.keys(s)) if (!k.startsWith('$') && k !== 'variant') stageKeys.add(k);
    }
  }
}
for (const k of [...stageKeys].sort()) {
  ok(readsOutsideConfig(k), `stages.*.${k} is read by a script that runs a stage`);
}
for (const k of Object.keys(cfg.breakers ?? {}).filter((k) => !k.startsWith('$'))) {
  ok(readsOutsideConfig(k), `breakers.${k} is read`);
}

/* ── the port ladder ─────────────────────────────────────────────────────── */

head('The E2E port ladder');
const ladders = laddersAgree();
ok(ladders.ok, 'scripts/ports.mjs and e2e/environment.ts describe the same ladder', ladders.why ?? '');

/* ── the result ──────────────────────────────────────────────────────────── */

process.stdout.write(`\n${bad ? `${bad} problem(s)` : 'the pipeline agrees with itself'}\n`);
process.exit(bad ? 1 : 0);
