/**
 * Look inside a running agent, and inside every subagent it dispatched.
 *
 * The run journal cannot answer this. It records tool calls, stamps them with whichever stage
 * holds the lock, and says nothing at all while a model is generating — so a fleet of
 * subagents composing their verdicts looks exactly like a fleet that has died. Worse, a
 * subagent's calls are attributed to the session that spawned it, so six reviewers reading in
 * parallel appear as one reviewer reading very fast.
 *
 * The transcripts do answer it. Claude Code writes one JSONL per session under
 * `~/.claude/projects/<slug>/`, and a session that spawns subagents gets a `subagents/`
 * directory beside it, one file per child, each with a `.meta.json` naming its type and the
 * job it was given. They are written as the work happens, which makes them the only live view
 * of a fleet.
 *
 *   node scripts/lab-peek.mjs                     # every arm, every subagent, one line each
 *   node scripts/lab-peek.mjs --tail <id>         # the last thing that subagent said
 *   node scripts/lab-peek.mjs --full <id>         # everything it said
 *   node scripts/lab-peek.mjs --root <arm>        # the parent's own last message
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECTS = join(homedir(), '.claude', 'projects');
/* Discover the arms rather than listing them: one entry per `ds-lab-*` project directory.
   A hard-coded list silently shows the wrong experiment the moment a new worktree appears,
   which is exactly what it did. */
const ARMS = readdirSync(PROJECTS)
  .filter((d) => d.startsWith('D--git-repos-ds-lab'))
  .map((slug) => ({ name: slug.replace('D--git-repos-ds-lab-', ''), slug }));

const argv = process.argv.slice(2);
const TAKES = new Set(['--tail', '--full', '--root']);
const flag = (n) => {
  const i = argv.indexOf(n);
  return i === -1 ? null : argv[i + 1];
};

const ago = (ms) => {
  const s = Math.round((Date.now() - ms) / 1000);
  return s < 90 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
};

/** Assistant prose from a transcript, in order. Tool calls and results are left out. */
function saidBy(path) {
  const out = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const c = e.message?.content;
    if (!Array.isArray(c)) continue;
    for (const b of c) if (b.type === 'text' && b.text?.trim()) out.push(b.text);
  }
  return out;
}

/** The tool calls in a transcript, so a silent agent can still be shown to be working. */
function toolsIn(path) {
  const counts = {};
  let last = null;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const c = e.message?.content;
    if (!Array.isArray(c)) continue;
    for (const b of c)
      if (b.type === 'tool_use') {
        counts[b.name] = (counts[b.name] ?? 0) + 1;
        last = b;
      }
  }
  return { counts, last };
}

/** The newest root session of an arm: the transcript with a `subagents/` directory beside it. */
function rootOf(slug) {
  const dir = join(PROJECTS, slug);
  if (!existsSync(dir)) return null;
  const sessions = readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ id: f.replace(/\.jsonl$/, ''), path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  /* The newest session is the current root, whether or not it has dispatched yet. Preferring
     the newest session that *has* children instead silently shows a finished older run the
     moment a new root is still warming up. */
  if (!sessions[0]) return null;
  const subs = join(dir, sessions[0].id, 'subagents');
  return { ...sessions[0], subs: existsSync(subs) ? subs : null };
}

const one = flag('--tail') ?? flag('--full');
if (one) {
  for (const arm of ARMS) {
    const root = rootOf(arm.slug);
    if (!root?.subs) continue;
    const f = readdirSync(root.subs).find((x) => x.startsWith(`agent-${one}`) || x === `${one}.jsonl` || x.includes(one));
    if (!f || !f.endsWith('.jsonl')) continue;
    const said = saidBy(join(root.subs, f));
    const meta = JSON.parse(readFileSync(join(root.subs, f.replace('.jsonl', '.meta.json')), 'utf8'));
    console.log(`── ${meta.agentType} · ${meta.description}\n`);
    console.log(argv.includes('--full') ? said.join('\n\n───\n\n') : (said[said.length - 1] ?? '(has not spoken yet)'));
    process.exit(0);
  }
  console.error(`no subagent matching ${one}`);
  process.exit(1);
}

const rootArm = flag('--root');
if (rootArm) {
  const arm = ARMS.find((a) => a.name.toLowerCase() === rootArm.toLowerCase());
  const root = rootOf(arm.slug);
  const said = saidBy(root.path);
  console.log(`── root of arm ${arm.name} · ${root.id.slice(0, 8)} · last written ${ago(statSync(root.path).mtimeMs)} ago\n`);
  console.log(said[said.length - 1] ?? '(has not spoken yet)');
  process.exit(0);
}

const only = argv.find((a) => !a.startsWith('--') && !TAKES.has(argv[argv.indexOf(a) - 1]));
for (const arm of ARMS) {
  if (only && !arm.name.toLowerCase().includes(only.toLowerCase())) continue;
  const root = rootOf(arm.slug);
  if (!root) continue;
  const rt = toolsIn(root.path);
  console.log(`\n══ arm ${arm.name} · root ${root.id.slice(0, 8)} · last written ${ago(root.mtime)} ago`);
  console.log(`   root tools: ${Object.entries(rt.counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
  if (!root.subs) {
    console.log('   no subagents');
    continue;
  }
  const files = readdirSync(root.subs).filter((f) => f.endsWith('.jsonl'));
  if (!files.length) console.log('   no subagents yet');
  for (const f of files.sort()) {
    const p = join(root.subs, f);
    const id = f.replace(/^agent-|\.jsonl$/g, '');
    const meta = JSON.parse(readFileSync(p.replace('.jsonl', '.meta.json'), 'utf8'));
    const mtime = statSync(p).mtimeMs;
    const { counts, last } = toolsIn(p);
    const said = saidBy(p);
    const quiet = Date.now() - mtime;
    const state = quiet > 120_000 ? 'finished' : 'working';
    console.log(
      `   ${id.slice(0, 10)}  ${state.padEnd(8)} ${ago(mtime).padStart(7)} ago · ${Object.values(counts).reduce((a, b) => a + b, 0)} tool calls · ${said.length} messages`,
    );
    console.log(`      ${meta.agentType} — ${meta.description}`);
    if (state === 'working' && last) console.log(`      now: ${last.name} ${JSON.stringify(last.input?.file_path ?? last.input?.command ?? last.input?.pattern ?? '').slice(0, 90)}`);
    const tail = said[said.length - 1];
    if (tail) {
      const verdict = tail.match(/"status"\s*:\s*"(\w+)"/);
      const blockers = (tail.match(/"severity"\s*:\s*"blocker"/g) ?? []).length;
      const notes = (tail.match(/"severity"\s*:\s*"note"/g) ?? []).length;
      if (verdict) console.log(`      said: ${verdict[1]} · ${blockers} blockers, ${notes} notes`);
      else console.log(`      said: ${tail.replace(/\s+/g, ' ').slice(0, 100)}…`);
    }
  }
}
console.log('\n--tail <id> for the last message, --full <id> for all of it, --root A|B for the parent');
