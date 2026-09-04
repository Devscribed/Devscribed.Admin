/**
 * spec-index — every spec, and everything that has been run against it.
 *
 *   node scripts/spec-index.mjs [--json]
 *
 * The board opens on this. A run id is a fact about the pipeline, not about the work: a spec
 * that took eleven runs is eleven rows of an undifferentiated list, and the question a person
 * actually arrives with — "where is spec 02" — is the one such a list answers worst. So the
 * unit here is the spec, and the runs hang under it: the ship runs from `.workflow/runs`, and
 * the refine loop from `.workflow/refine`, which until now the board could not see at all.
 *
 * Cheap on purpose. It is rebuilt on every filesystem change while somebody watches, so it
 * reads `run.json` and the tail of what it must, and never the transcripts — those are read
 * once, for the one entry a reader has open.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { agentSummary, readLoop, refineStems } from './refine-read.mjs';

const jsonIf = (p) => {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
};
const statIf = (p) => { try { return statSync(p); } catch { return null; } };

/* A stage log is read for one number and rewritten while a run is in flight, so it is cached
   against what would have changed it. Without this the index re-parses megabytes on every
   keystroke-sized event in the runs directory. */
const costCache = new Map();
function logCost(path) {
  const st = statIf(path);
  if (!st) return 0;
  const key = `${path}|${st.mtimeMs}|${st.size}`;
  if (costCache.has(key)) return costCache.get(key);
  const v = +(agentSummary(path)?.total_cost_usd ?? 0);
  costCache.set(key, v);
  return v;
}

/* ── the specs themselves ─────────────────────────────────────────────────── */

/**
 * `specs/requests/02-request-topics.md` — the head of a bundle, not its members — and the
 * lighter documents beside it, `specs/bugs/BUG-NNN-*.md` and `specs/patches/PATCH-NNN-*.md`.
 *
 * The lighter two are named by prefix rather than by a leading number, and a bundle-shaped
 * pattern alone left every bug and patch run filed under "no document" on the board.
 */
const DOC_NAME = /^(?:(\d+)|(?:BUG|PATCH)-(\d+))-.+\.md$/;

function specFiles(root) {
  const base = join(root, 'specs');
  if (!existsSync(base)) return [];
  const out = [];
  for (const area of readdirSync(base)) {
    const dir = join(base, area);
    if (!statIf(dir)?.isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      const m = f.match(DOC_NAME);
      if (!m) continue;
      if (/\.(contracts|cases|design)\.md$/.test(f)) continue;
      out.push({ area, file: f, path: `specs/${area}/${f}`, num: m[1] ?? m[2] });
    }
  }
  return out;
}

/** Title and dependencies, from the frontmatter the spec skill writes. Read by line rather
 *  than parsed as YAML: the block is fixed in shape and a parser is a dependency to install. */
function frontmatter(root, path) {
  const text = readFileSync(join(root, path), 'utf8');
  const end = text.indexOf('\n---', 4);
  const head = text.startsWith('---') && end > 0 ? text.slice(4, end) : '';
  const title = head.match(/^title:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '')
    ?? text.match(/^#\s+(.+)$/m)?.[1]?.trim()
    ?? null;
  const inline = head.match(/^depends-on:\s*\[(.*)\]/m)?.[1];
  const dependsOn = inline
    ? inline.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    : (head.match(/^depends-on:\s*\n((?:\s+-\s+.+\n?)+)/m)?.[1] ?? '')
      .split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  return { title, dependsOn };
}

/* ── entries ──────────────────────────────────────────────────────────────── */

const isBlocker = (f) => f?.severity && f.severity !== 'note' && f.severity !== 'info';

function shipEntries(root) {
  const base = join(root, '.workflow', 'runs');
  if (!existsSync(base)) return [];
  const out = [];
  for (const id of readdirSync(base)) {
    const dir = join(base, id);
    if (!statIf(dir)?.isDirectory()) continue;
    const run = jsonIf(join(dir, 'run.json'));

    let costUsd = 0;
    const stages = join(dir, 'stages');
    if (existsSync(stages)) for (const f of readdirSync(stages)) if (f.endsWith('.log')) costUsd += logCost(join(stages, f));

    const findings = run?.notes?.filter((n) => n.rule) ?? [];
    const stageRunning = Object.entries(run?.stages ?? {}).find(([, s]) => s.status === 'running')?.[0] ?? null;
    const startedAt = run?.createdAt ? Date.parse(run.createdAt) : statIf(dir)?.birthtimeMs ?? null;
    const updatedAt = run?.updatedAt ? Date.parse(run.updatedAt) : statIf(dir)?.mtimeMs ?? null;

    out.push({
      kind: 'ship',
      id,
      spec: run?.spec ?? null,
      /* Which pipeline the document earned. A run started before tracks existed carries none,
         and `spec` is what it ran. */
      track: run?.track ?? (run ? 'spec' : null),
      label: id.replace(/_.*$/, '').replace('T', ' ').replace(/-(\d\d)-(\d\d)$/, ':$1:$2'),
      status: run?.status ?? 'half-created',
      /* A run that never wrote `run.json` is a preflight that died. It is listed rather than
         hidden, because a directory nobody can account for is worse than a row saying so. */
      detail: run ? (run.halt?.reason ?? stageRunning) : 'init не завершился',
      branch: run?.branch ?? null,
      startedAt,
      updatedAt,
      wallSec: startedAt && updatedAt ? Math.round((updatedAt - startedAt) / 1000) : 0,
      costUsd: +costUsd.toFixed(2),
      blockers: findings.filter(isBlocker).length,
      notes: findings.filter((f) => !isBlocker(f)).length,
      /* A killed run keeps the stage it died in marked `running` forever, so the stage is not
         evidence of anything. Only the run's own status is: it is what the orchestrator wrote
         last, and it is written on the way out. And a run with no `run.json` at all is not
         running — its `init` died — which matters because the board opens on whatever is
         moving, and a dead directory claiming to move is what it would open on. */
      running: !!run && !['ready', 'halted', 'aborted', 'failed'].includes(run.status),
    });
  }
  return out;
}

function refineEntries(root) {
  return refineStems(root).map((stem) => {
    const l = readLoop(root, stem);
    const last = l.rounds[l.rounds.length - 1];
    const gate = last?.gates.find((g) => g.log?.running) ?? [...(last?.gates ?? [])].reverse()[0] ?? null;
    const judged = l.rounds.map((r) => r.judge).filter(Boolean).slice(-1)[0] ?? null;
    return {
      kind: 'refine',
      id: `refine:${stem}`,
      spec: l.spec,
      label: `refine · ${l.rounds.length} раунд(ов)`,
      status: l.status,
      detail: l.running
        ? `раунд ${last?.round ?? 1} · ${gate?.label ?? '—'}`
        : l.outcome?.reason ?? null,
      branch: null,
      startedAt: l.startedAt,
      updatedAt: l.updatedAt,
      wallSec: l.startedAt && l.updatedAt ? Math.round((l.updatedAt - l.startedAt) / 1000) : 0,
      costUsd: +l.rounds.reduce((a, r) => a + r.gates.reduce((b, g) => b + (g.log?.costUsd ?? 0), 0), 0).toFixed(2),
      blockers: judged?.blockers ?? l.rounds.reduce((a, r) => a + (r.plan?.specBlockers ?? 0), 0),
      notes: judged?.notes ?? 0,
      running: l.running,
    };
  });
}

/* ── the index ────────────────────────────────────────────────────────────── */

export function buildIndex(root) {
  const entries = [...refineEntries(root), ...shipEntries(root)];
  const specs = new Map();

  for (const s of specFiles(root)) {
    const fm = frontmatter(root, s.path);
    specs.set(s.path, {
      key: `${s.area}/${s.num}`,
      path: s.path,
      area: s.area,
      num: s.num,
      title: fm.title,
      dependsOn: fm.dependsOn,
      entries: [],
    });
  }

  /* A run whose spec is gone — renamed, renumbered, deleted — still happened, and the hours it
     spent are still an answer to "where did the week go". It gets a group of its own rather
     than being dropped or filed under whatever spec now holds its number. */
  const orphans = [];
  for (const e of entries) {
    const group = e.spec && specs.get(e.spec);
    if (group) group.entries.push(e); else orphans.push(e);
  }

  const finish = (list) => {
    list.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    return list;
  };

  const out = [...specs.values()].map((s) => {
    finish(s.entries);
    return {
      ...s,
      running: s.entries.some((e) => e.running),
      lastAt: Math.max(0, ...s.entries.map((e) => e.updatedAt ?? 0)) || null,
      totals: {
        ship: s.entries.filter((e) => e.kind === 'ship').length,
        refine: s.entries.filter((e) => e.kind === 'refine').length,
        costUsd: +s.entries.reduce((a, e) => a + e.costUsd, 0).toFixed(2),
        wallSec: s.entries.reduce((a, e) => a + e.wallSec, 0),
        blockers: s.entries.reduce((a, e) => a + e.blockers, 0),
      },
    };
  });

  /* Touched first, and among the untouched the newest spec — which is the one being written. */
  out.sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0)
    || (b.lastAt ?? 0) - (a.lastAt ?? 0)
    || b.path.localeCompare(a.path));

  return { generatedAt: Date.now(), specs: out, orphans: finish(orphans) };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const index = buildIndex(root);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(index, null, 2));
  } else {
    for (const s of index.specs) {
      if (!s.entries.length) continue;
      console.log(`\n${s.path}  ${s.title ?? ''}`);
      for (const e of s.entries) {
        const kind = e.kind === 'ship' && e.track && e.track !== 'spec' ? `ship:${e.track}` : e.kind;
        console.log(`  ${e.running ? '●' : '○'} ${kind.padEnd(10)} ${e.id.padEnd(46)} ${String(e.status).padEnd(12)} ${e.detail ?? ''}`);
      }
    }
    if (index.orphans.length) {
      console.log('\nбез спеки:');
      for (const e of index.orphans) console.log(`  ${e.kind} ${e.id} ${e.status}`);
    }
  }
}
