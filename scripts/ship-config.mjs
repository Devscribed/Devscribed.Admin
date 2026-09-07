#!/usr/bin/env node
/**
 * ship-config — the one reader of `.claude/ai-workflow.config.json`, and its validator.
 *
 * The config is keyed by track, and each track writes out every stage it runs in full.
 * Nothing is inherited between tracks: what a person reads under `patch` is what `patch`
 * runs. The cost of that is three places to edit when an agent is renamed, which is what
 * `validate` is for — a name that no longer resolves is an error before a run starts, not a
 * stage that dies twenty minutes in.
 *
 * Everything that reads configuration goes through here. A second reader with its own
 * defaults is how a setting comes to mean one thing to `ship` and another to `wf`.
 *
 *   node scripts/ship-config.mjs            # validate, then print what each track resolves to
 *   node scripts/ship-config.mjs --track patch
 *   node scripts/ship-config.mjs --json
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_REL = '.claude/ai-workflow.config.json';

/** Stage order. Every track declares all of these; one it does not run is `enabled: false`. */
export const STAGES = ['preflight', 'pre_implement', 'implement', 'static_gate', 'review', 'qa'];

/** Stages that no track may disable — the ones that check the result rather than read intent. */
const ALWAYS_ON = ['static_gate', 'qa'];

/** Stages whose work is done by an agent, and therefore need `agent` and `model`. */
const AGENT_STAGES = ['pre_implement', 'implement', 'review', 'qa'];

const MODELS = ['opus', 'sonnet', 'haiku', 'fable'];
const QA_LEVELS = ['unit', 'int', 'e2e'];

/* Closed key sets. An unknown key is an error rather than something ignored: `shardsize` for
   `shardSize` changes nothing, reports nothing, and is found by wondering why a run behaved
   the way the config says it should not. */
const KEYS = {
  root: ['shipConfig', 'breakers', 'isolation', 'protectedBranches', 'refine'],
  track: ['match', 'branchPrefix', 'requiresRefine', 'stages', 'convergence', 'timeoutMin'],
  /* A stage block itself: whether it runs, and which of its shapes does. */
  stage: ['enabled', 'use', 'shapes'],
  /* What one shape may say. A shape is complete on its own — nothing is merged into it. */
  shape: {
    preflight: [],
    pre_implement: ['agent', 'model'],
    implement: ['agent', 'model', 'shardAgent', 'shardModel', 'maxShards'],
    static_gate: ['script'],
    review: ['agent', 'model', 'shardAgent', 'shardModel', 'shardSize'],
    qa: ['agent', 'model', 'levels', 'skipE2eIfLowerFailed'],
  },
  convergence: ['maxCodeAttempts', 'maxHandoffReplans', 'infraRetries', 'autoContestAfter'],
  breakers: ['runTimeoutMin', 'runTokenCap'],
  isolation: ['concurrentRuns', 'e2eEnv'],
};

/** Keys a person writes for themselves. They are documentation and are never read as settings. */
const isComment = (k) => k.startsWith('$');
const settings = (o) => Object.keys(o ?? {}).filter((k) => !isComment(k));

/* ── reading ─────────────────────────────────────────────────────────────── */

/** Parse the config. Throws with the file's own path on a syntax error. */
export function readConfig(root = HERE) {
  const path = join(root, CONFIG_REL);
  let text;
  try { text = readFileSync(path, 'utf8'); }
  catch { throw new Error(`${CONFIG_REL} is missing`); }
  try { return JSON.parse(text); }
  catch (e) { throw new Error(`${CONFIG_REL} will not parse: ${e.message}`); }
}

/** Parse and validate. This is what everything that runs a stage should call. */
export function loadConfig(root = HERE) {
  const cfg = readConfig(root);
  const problems = validate(cfg, root);
  if (problems.length) {
    throw new Error(`${CONFIG_REL} is not valid:\n  ${problems.join('\n  ')}\n`
      + '  Run `npm run config` to see this list on its own.');
  }
  return cfg;
}

/** The names of the declared tracks, in the order they are matched. */
export const trackNames = (cfg) => settings(cfg.shipConfig);

/**
 * The track a document belongs to, resolved from its path, or named outright.
 *
 * First match wins, in declaration order, so a track written later cannot capture a path an
 * earlier one already claims. `validate` refuses a config where two tracks claim the same one.
 */
export function trackFor(cfg, docPath, override = null, root = HERE) {
  const names = trackNames(cfg);
  if (override) {
    if (!cfg.shipConfig?.[override]) throw new Error(`no track "${override}" — have ${names.join(', ')}`);
    return { name: override, ...cfg.shipConfig[override] };
  }
  /* Repo-relative, forward slashes. A `match` is anchored at `specs/`, so an absolute path —
     which is what a model pastes and what a shell completes — matched no track at all. */
  const path = String(docPath ?? '')
    .replace(/\\/g, '/')
    .replace(`${resolve(root).replace(/\\/g, '/')}/`, '')
    .replace(/^\.\//, '');
  const hit = names.find((n) => new RegExp(cfg.shipConfig[n].match).test(path));
  if (!hit) throw new Error(`no track matches ${path} — have ${names.join(', ')}`);
  return { name: hit, ...cfg.shipConfig[hit] };
}

/**
 * One stage of one track, in the shape that will run.
 *
 * A stage block says whether it runs and which of its `shapes` does; a shape is complete on its
 * own. Nothing is merged: what is written under the shape is what comes back, plus `enabled`
 * and the shape's name. Two things can name the shape, and the file is the first of them:
 *
 * - **`"use": "<name>"` in the block** — the track's standing choice, and what a person reading
 *   the config sees.
 * - **`--plan-shape` / `--implement-shape` / `--review-shape`** — one run's choice, which beats
 *   the standing one and is recorded in `run.json`.
 *
 * An unknown name throws rather than falling back: a run silently taking something else is a
 * run whose result cannot be attributed to the shape that produced it.
 */
export function stageFor(cfg, track, stage, shape = null) {
  const t = cfg.shipConfig?.[track];
  if (!t) throw new Error(`no track "${track}" — have ${trackNames(cfg).join(', ')}`);
  if (!STAGES.includes(stage)) throw new Error(`no stage "${stage}" — have ${STAGES.join(', ')}`);
  const block = t.stages?.[stage] ?? {};
  const chosen = shape ?? block.use ?? null;
  if (!chosen) return { shape: null, enabled: block.enabled };
  const s = block.shapes?.[chosen];
  if (!s) {
    const have = settings(block.shapes).join(', ') || '(none)';
    throw new Error(`no ${track}/${stage} shape "${chosen}" — have ${have}`);
  }
  const { $comment, ...rest } = s;
  return { shape: chosen, enabled: block.enabled, ...rest };
}

/** Every shape a stage offers, in the order the file lists them. */
export const shapesOf = (cfg, track, stage) => settings(cfg.shipConfig?.[track]?.stages?.[stage]?.shapes);

/** The stage timeout for a track, in minutes. */
export const timeoutFor = (cfg, track, stage, fallback = 45) =>
  cfg.shipConfig?.[track]?.timeoutMin?.[stage] ?? fallback;

/** The convergence budgets for a track. */
export const convergenceFor = (cfg, track) => cfg.shipConfig?.[track]?.convergence ?? {};

/* ── validating ──────────────────────────────────────────────────────────── */

/**
 * Every problem with the config, as sentences naming the path that is wrong.
 *
 * It answers one question: would every stage of every track start? So it checks the things
 * that are silent at the point of failure — a misspelled key, an agent whose definition was
 * renamed, a model that does not exist, a gate switched off — and not the things a stage
 * would report about itself.
 */
export function validate(cfg, root = HERE) {
  const p = [];
  const agentExists = (name) => existsSync(join(root, '.claude', 'agents', `${name}.md`));

  const closed = (obj, allowed, where) => {
    for (const k of settings(obj)) {
      if (!allowed.includes(k)) {
        p.push(`${where}: unknown key "${k}" — allowed: ${allowed.join(', ')}`);
      }
    }
  };
  const posInt = (v, where) => {
    if (!Number.isInteger(v) || v < 0) p.push(`${where}: expected a whole number ≥ 0, got ${JSON.stringify(v)}`);
  };

  closed(cfg, KEYS.root, CONFIG_REL);
  for (const k of KEYS.root) if (cfg[k] === undefined) p.push(`${CONFIG_REL}: "${k}" is missing`);

  if (!cfg.shipConfig || typeof cfg.shipConfig !== 'object') {
    p.push('shipConfig: missing, or not an object');
    return p; // nothing below this is checkable
  }

  const names = trackNames(cfg);
  if (!names.length) p.push('shipConfig: declares no tracks');

  for (const name of names) {
    const t = cfg.shipConfig[name];
    const at = `shipConfig.${name}`;
    if (!t || typeof t !== 'object') { p.push(`${at}: not an object`); continue; }
    closed(t, KEYS.track, at);
    for (const k of KEYS.track) if (t[k] === undefined) p.push(`${at}: "${k}" is missing`);

    /* A track nothing can match is a track that will never run. */
    if (typeof t.match === 'string') {
      try { new RegExp(t.match); }
      catch (e) { p.push(`${at}.match: not a valid regular expression — ${e.message}`); }
    } else if (t.match !== undefined) p.push(`${at}.match: expected a string`);

    if (typeof t.branchPrefix !== 'string' || !t.branchPrefix.endsWith('/')) {
      p.push(`${at}.branchPrefix: expected a string ending in "/", got ${JSON.stringify(t.branchPrefix)}`);
    }
    if (typeof t.requiresRefine !== 'boolean') {
      p.push(`${at}.requiresRefine: expected true or false, got ${JSON.stringify(t.requiresRefine)}`);
    }

    /* ── stages ── */
    const declared = settings(t.stages);
    for (const s of declared) {
      if (!STAGES.includes(s)) p.push(`${at}.stages: unknown stage "${s}" — the pipeline runs ${STAGES.join(', ')}`);
    }
    for (const s of STAGES) {
      if (!declared.includes(s)) {
        p.push(`${at}.stages: "${s}" is missing — every track declares all six, and one it does not run is { "enabled": false }`);
      }
    }

    for (const s of STAGES) {
      const block = t.stages?.[s];
      if (block === undefined) continue;
      const sat = `${at}.stages.${s}`;
      if (!block || typeof block !== 'object') { p.push(`${sat}: not an object`); continue; }
      closed(block, KEYS.stage, sat);

      if (typeof block.enabled !== 'boolean') {
        p.push(`${sat}.enabled: expected true or false, got ${JSON.stringify(block.enabled)}`);
      }
      if (block.enabled === false && ALWAYS_ON.includes(s)) {
        p.push(`${sat}.enabled: ${s} may not be disabled on any track — it is what checks the result. `
          + 'Skip it for one run with `--skip ' + s + '` if that is what you mean.');
      }
      if (block.enabled !== true) continue; // nothing below applies to a stage that does not run
      if (s === 'preflight') continue;      // a fixed script, with nothing to choose

      /* `use` and `shapes` come as a pair, and `use` must name one of them. A block that names
         a shape it does not have is the config claiming something that does not exist, and the
         run that asks for it is the wrong place to find that out. */
      const names = settings(block.shapes);
      if (!block.shapes || typeof block.shapes !== 'object' || !names.length) {
        p.push(`${sat}.shapes: expected at least one named shape`);
        continue;
      }
      if (typeof block.use !== 'string' || !names.includes(block.use)) {
        p.push(`${sat}.use: ${JSON.stringify(block.use)} is not one of ${names.join(', ')}`);
      }

      /* Every shape, under the same rules, whether or not `use` names it — a shape that names a
         renamed agent otherwise fails at the moment somebody asks for it, which is the worst
         time to find out. */
      for (const name of names) {
        const sh = block.shapes[name];
        const w = `${sat}.shapes.${name}`;
        if (!sh || typeof sh !== 'object') { p.push(`${w}: not an object`); continue; }
        closed(sh, KEYS.shape[s], w);

        if (AGENT_STAGES.includes(s)) {
          if (!sh.agent) p.push(`${w}: "agent" is missing`);
          else if (!agentExists(sh.agent)) p.push(`${w}.agent: no definition at .claude/agents/${sh.agent}.md`);
          if (!sh.model) p.push(`${w}: "model" is missing`);
          else if (!MODELS.includes(sh.model)) p.push(`${w}.model: "${sh.model}" is not one of ${MODELS.join(', ')}`);
        }
        if (s === 'static_gate') {
          if (!sh.script) p.push(`${w}: "script" is missing`);
          else if (!existsSync(join(root, sh.script))) p.push(`${w}.script: no file at ${sh.script}`);
        }
        if (sh.shardAgent !== undefined) {
          if (!agentExists(sh.shardAgent)) p.push(`${w}.shardAgent: no definition at .claude/agents/${sh.shardAgent}.md`);
          if (!sh.shardModel) p.push(`${w}: "shardModel" is missing, and "shardAgent" is set`);
          else if (!MODELS.includes(sh.shardModel)) p.push(`${w}.shardModel: "${sh.shardModel}" is not one of ${MODELS.join(', ')}`);
        } else {
          /* A shard setting with nobody to apply it to reads as "this shape splits" to whoever
             edits the file next, and it does not. */
          for (const k of ['shardModel', 'shardSize', 'maxShards']) {
            if (sh[k] !== undefined) p.push(`${w}.${k}: set without a "shardAgent", so nothing reads it`);
          }
        }
        if (sh.shardSize !== undefined) posInt(sh.shardSize, `${w}.shardSize`);
        if (sh.maxShards !== undefined) posInt(sh.maxShards, `${w}.maxShards`);
        if (s === 'qa') {
          if (!Array.isArray(sh.levels) || !sh.levels.length) p.push(`${w}.levels: expected a non-empty array`);
          else for (const l of sh.levels) {
            if (!QA_LEVELS.includes(l)) p.push(`${w}.levels: "${l}" is not one of ${QA_LEVELS.join(', ')}`);
          }
          if (typeof sh.skipE2eIfLowerFailed !== 'boolean') {
            p.push(`${w}.skipE2eIfLowerFailed: expected true or false`);
          }
        }
      }
    }

    /* ── budgets and fuses ── */
    const at2 = `${at}.convergence`;
    if (t.convergence && typeof t.convergence === 'object') {
      closed(t.convergence, KEYS.convergence, at2);
      for (const k of KEYS.convergence) {
        if (t.convergence[k] === undefined) p.push(`${at2}: "${k}" is missing`);
        else posInt(t.convergence[k], `${at2}.${k}`);
      }
      /* A track with no plan stage cannot replan; a budget above zero there promises a stage
         that will never run. */
      if (t.stages?.pre_implement?.enabled === false && t.convergence.maxHandoffReplans > 0) {
        p.push(`${at2}.maxHandoffReplans: ${t.convergence.maxHandoffReplans} on a track whose pre_implement is disabled — there is no stage to replan, so this must be 0`);
      }
    } else p.push(`${at2}: missing, or not an object`);

    if (t.timeoutMin && typeof t.timeoutMin === 'object') {
      for (const k of settings(t.timeoutMin)) {
        if (!STAGES.includes(k)) p.push(`${at}.timeoutMin: unknown stage "${k}"`);
        else if (!(t.timeoutMin[k] > 0)) p.push(`${at}.timeoutMin.${k}: expected a number greater than 0`);
        else if (t.stages?.[k]?.enabled === false) p.push(`${at}.timeoutMin.${k}: a timeout for a stage this track does not run`);
      }
    } else p.push(`${at}.timeoutMin: missing, or not an object`);
  }

  /* Two tracks claiming one path makes resolution depend on key order, which is not something
     a person editing this file should have to hold. */
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = cfg.shipConfig[names[i]]?.match;
      const b = cfg.shipConfig[names[j]]?.match;
      if (typeof a !== 'string' || typeof b !== 'string') continue;
      if (a === b) p.push(`shipConfig.${names[i]} and shipConfig.${names[j]} declare the same match "${a}"`);
    }
  }

  /* ── the shared blocks ── */
  if (cfg.breakers && typeof cfg.breakers === 'object') {
    closed(cfg.breakers, KEYS.breakers, 'breakers');
    for (const k of KEYS.breakers) {
      if (cfg.breakers[k] === undefined) p.push(`breakers: "${k}" is missing`);
      else if (!(cfg.breakers[k] > 0)) p.push(`breakers.${k}: expected a number greater than 0`);
    }
  } else p.push('breakers: missing, or not an object');

  if (cfg.isolation && typeof cfg.isolation === 'object') {
    closed(cfg.isolation, KEYS.isolation, 'isolation');
    /* The lock in `wf` allows one run and nothing reads this number. Refusing any other value
       keeps it a stated invariant rather than a setting that looks adjustable and is not. */
    if (cfg.isolation.concurrentRuns !== 1) {
      p.push('isolation.concurrentRuns: must be 1 — the run lock allows one, and ports, both '
        + 'databases and the mail sink are shared. Raising it here changes nothing.');
    }
  } else p.push('isolation: missing, or not an object');

  if (!Array.isArray(cfg.protectedBranches) || !cfg.protectedBranches.length) {
    p.push('protectedBranches: expected a non-empty array');
  }

  /* Refine is the one block that is not per-track. Its shape is checked lightly — the loop
     reports its own configuration errors, and it runs before a run exists to break. */
  const rc = cfg.refine;
  if (!rc || typeof rc !== 'object') p.push('refine: missing, or not an object');
  else {
    const names = settings(rc.shapes);
    if (!names.includes(rc.use)) {
      p.push(`refine.use: ${JSON.stringify(rc.use)} is not one of ${names.join(', ') || '(none declared)'}`);
    }
    for (const name of names) {
      const sh = rc.shapes[name];
      for (const key of ['judgeAgent', 'fixerAgent', 'shardAgent']) {
        if (sh[key] && !agentExists(sh[key])) p.push(`refine.shapes.${name}.${key}: no definition at .claude/agents/${sh[key]}.md`);
      }
      for (const key of ['judgeModel', 'fixerModel', 'shardModel']) {
        if (sh[key] && !MODELS.includes(sh[key])) p.push(`refine.shapes.${name}.${key}: "${sh[key]}" is not one of ${MODELS.join(', ')}`);
      }
      /* Same rule the stages have: a shard model with no shard agent is a setting nothing reads. */
      if (!sh.shardAgent && sh.shardModel) {
        p.push(`refine.shapes.${name}.shardModel: set without a "shardAgent", so nothing reads it`);
      }
    }
    if (!Array.isArray(rc.blockingRules) || !rc.blockingRules.length) {
      p.push('refine.blockingRules: expected a non-empty array — an empty register demotes every blocker');
    }
  }

  return p;
}

/* ── the command ─────────────────────────────────────────────────────────── */

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };

  let cfg;
  try { cfg = readConfig(HERE); }
  catch (e) { process.stderr.write(`${e.message}\n`); process.exit(1); }

  const problems = validate(cfg, HERE);
  if (problems.length) {
    process.stderr.write(`${CONFIG_REL} — ${problems.length} problem(s)\n\n`);
    for (const x of problems) process.stderr.write(`  ${x}\n`);
    process.stderr.write('\n');
    process.exit(1);
  }

  const only = opt('track');
  const names = only ? [only] : trackNames(cfg);
  if (only && !cfg.shipConfig[only]) {
    process.stderr.write(`no track "${only}" — have ${trackNames(cfg).join(', ')}\n`);
    process.exit(1);
  }

  if (argv.includes('--json')) {
    const out = {};
    for (const n of names) {
      out[n] = { ...cfg.shipConfig[n], resolved: Object.fromEntries(STAGES.map((s) => [s, stageFor(cfg, n, s)])) };
    }
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    process.exit(0);
  }

  process.stdout.write(`${CONFIG_REL} — valid\n`);
  for (const n of names) {
    const t = cfg.shipConfig[n];
    const c = t.convergence ?? {};
    process.stdout.write(`\n${n}  ${t.match}  →  ${t.branchPrefix}  `
      + `refine ${t.requiresRefine ? 'required' : 'not required'}  `
      + `code ${c.maxCodeAttempts}, replans ${c.maxHandoffReplans}, infra ${c.infraRetries}\n`);
    for (const s of STAGES) {
      const st = stageFor(cfg, n, s);
      const all = shapesOf(cfg, n, s);
      let how = 'a preflight script';
      if (st.enabled === false) how = '—';
      else if (st.script) how = `node ${st.script}`;
      else if (st.agent) {
        how = `${st.agent} on ${st.model}`;
        if (st.shardAgent) how += `, shards ${st.shardAgent} on ${st.shardModel}`;
        if (st.shardSize) how += `, ${st.shardSize}/shard`;
        if (st.maxShards) how += `, ≤${st.maxShards} at once`;
        if (st.levels) how += `, levels ${st.levels.join('+')}`;
      }
      const timeout = t.timeoutMin?.[s] ? `  ${t.timeoutMin[s]}m` : '';
      /* Which shape is running, and what else this stage could be asked for. Reading one block
         answers the first; only this line answers the second. */
      const others = all.filter((v) => v !== st.shape);
      const alt = st.shape
        ? `  [${st.shape}${others.length ? `; also ${others.join(', ')}` : ''}]`
        : '';
      process.stdout.write(`  ${st.enabled === false ? '  ' : 'on'}  ${s.padEnd(14)} ${how}${timeout}${alt}\n`);
    }
  }
}
