/* Where a sharded review's wall clock goes: the root planning before it dispatches, the
   shards running in parallel, and the root working alone after the last one returns.
   Optimising shard size and shard effort moves only the middle term. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const base = join(homedir(), '.claude', 'projects');
const only = process.argv[2];
const stamps = (p) =>
  readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      try {
        return Date.parse(JSON.parse(l).timestamp);
      } catch {
        return NaN;
      }
    })
    .filter((x) => !Number.isNaN(x));

const s = (ms) => `${Math.round(ms / 1000)}s`;
const pct = (a, b) => `${Math.round((a / b) * 100)}%`;

for (const slug of readdirSync(base).filter((d) => d.startsWith('D--git-repos-ds-lab'))) {
  const arm = slug.replace('D--git-repos-ds-lab-', '');
  if (only && arm !== only) continue;
  const dir = join(base, slug);
  for (const sess of readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
    const ts = stamps(join(dir, sess)).sort((a, b) => a - b);
    if (ts.length < 5) continue;
    const t0 = ts[0];
    const t1 = ts[ts.length - 1];
    const subs = join(dir, sess.replace('.jsonl', ''), 'subagents');
    if (!existsSync(subs)) continue;
    let lo = Infinity;
    let hi = -Infinity;
    let n = 0;
    for (const f of readdirSync(subs).filter((x) => x.endsWith('.jsonl'))) {
      const st = stamps(join(subs, f));
      if (!st.length) continue;
      n++;
      lo = Math.min(lo, ...st);
      hi = Math.max(hi, ...st);
    }
    if (n < 2) continue;
    const total = t1 - t0;
    console.log(
      `${arm.padEnd(7)} ${s(total).padStart(6)}  ·  plan ${s(lo - t0).padStart(5)} ${pct(lo - t0, total).padStart(4)}` +
        `  ·  ${n} shards ${s(hi - lo).padStart(6)} ${pct(hi - lo, total).padStart(4)}` +
        `  ·  root alone ${s(Math.max(0, t1 - hi)).padStart(6)} ${pct(Math.max(0, t1 - hi), total).padStart(4)}`,
    );
  }
}
