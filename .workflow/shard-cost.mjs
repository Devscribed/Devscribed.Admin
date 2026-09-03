/* Where a shard's time actually goes: shared context, its own files, or generation.
   Time is attributed to a tool call as the gap until the next one, which lumps the model's
   thinking in with whatever it was doing before — that is the point, since thinking is the
   thing being located. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SHARED = /04-signature-providers\.md|CLAUDE\.md|checklist\.md|SKILL\.md|handoff\.json/;
const base = join(homedir(), '.claude', 'projects');

const rows = [];
const only = process.argv[2];
for (const slug of readdirSync(base).filter((d) => d.startsWith('D--git-repos-ds-lab') && (!only || d.includes(only)))) {
  const dir = join(base, slug);
  for (const sess of readdirSync(dir)) {
    const subs = join(dir, sess, 'subagents');
    if (!existsSync(subs)) continue;
    for (const f of readdirSync(subs).filter((x) => x.endsWith('.jsonl'))) {
      const path = join(subs, f);
      const meta = JSON.parse(readFileSync(path.replace('.jsonl', '.meta.json'), 'utf8'));
      if (meta.agentType !== 'review-shard') continue;

      const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
      const calls = [];
      let out = 0;
      let model = '';
      let effort = '';
      for (const l of lines) {
        let e;
        try {
          e = JSON.parse(l);
        } catch {
          continue;
        }
        if (e.message?.role === 'assistant') {
          out += e.message.usage?.output_tokens ?? 0;
          model = e.message.model ?? model;
          effort = e.effort ?? effort;
        }
        const c = e.message?.content;
        if (!Array.isArray(c)) continue;
        for (const b of c) if (b.type === 'tool_use') calls.push({ t: Date.parse(e.timestamp ?? 0), shared: SHARED.test(JSON.stringify(b.input ?? {})) });
      }
      if (calls.length < 2) continue;
      calls.sort((a, b) => a.t - b.t);
      const span = (calls[calls.length - 1].t - calls[0].t) / 1000;
      let sharedSec = 0;
      for (let i = 0; i < calls.length - 1; i++) if (calls[i].shared) sharedSec += (calls[i + 1].t - calls[i].t) / 1000;
      rows.push({
        what: (meta.description ?? '').slice(0, 30),
        model: model.replace('claude-', '').replace('-5', ''),
        effort,
        calls: calls.length,
        span: Math.round(span),
        sharedSec: Math.round(sharedSec),
        pct: Math.round((sharedSec / span) * 100),
        outK: Math.round(out / 1000),
        rate: +(out / span).toFixed(1),
      });
    }
  }
}

rows.sort((a, b) => b.span - a.span);
console.log('shard                          model  effort  calls  span  shared-ctx   out-tok  tok/s');
for (const r of rows) {
  console.log(
    `${r.what.padEnd(30)} ${r.model.padEnd(6)} ${(r.effort || '?').padEnd(7)} ${String(r.calls).padStart(4)} ${String(r.span).padStart(5)}s ${String(r.sharedSec).padStart(5)}s ${String(r.pct).padStart(3)}%  ${String(r.outK).padStart(5)}k ${String(r.rate).padStart(6)}`,
  );
}
const tot = rows.reduce((a, r) => ({ span: a.span + r.span, shared: a.shared + r.sharedSec, out: a.out + r.outK }), { span: 0, shared: 0, out: 0 });
console.log(`\n${rows.length} shards · ${tot.span}s of span · ${tot.shared}s on shared context (${Math.round((tot.shared / tot.span) * 100)}%) · ${tot.out}k output tokens`);
