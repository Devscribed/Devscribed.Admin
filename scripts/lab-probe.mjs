/**
 * Ask one shard reviewer about one file, and print what it found.
 *
 * A full pass costs a quarter of an hour and dispatches a fleet. A prompt rule can be
 * tested for the price of a single subagent: give it the file the defect lives in, the
 * spec, and nothing else, and see whether the rule makes the defect visible.
 *
 *   node scripts/lab-probe.mjs --files apps/api/src/documents/envelope-completion.ts \
 *     --model sonnet --effort medium --base <sha> [--spec <path>] [--label baseline]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = argv.indexOf(n);
  return i === -1 ? d : argv[i + 1];
};

const files = (flag('--files') ?? '').split(',').filter(Boolean);
const model = flag('--model', 'sonnet');
const effort = flag('--effort', 'medium');
const spec = flag('--spec', 'specs/documents/04-signature-providers.md');
const base = flag('--base', 'HEAD~1');
const label = flag('--label', `${model}-${effort}`);
const fuseMin = Number(flag('--fuse', '12'));
if (!files.length) {
  console.error('need --files a,b,c');
  process.exit(1);
}

const dir = join(ROOT, '.workflow', 'probes');
mkdirSync(dir, { recursive: true });
const stem = join(dir, `${label}-${files[0].split('/').pop().replace(/\W+/g, '_')}`);

const prompt = `You are reviewing one shard of a change against \`${spec}\`.

Diff base: \`${base}\`. Your shard number is 1.

Your files, and nothing else:

${files.map((f) => `- \`${f}\``).join('\n')}

Work your sweeps over them and return your verdict as your final message, one fenced JSON
block, exactly as your agent definition specifies.`;

writeFileSync(`${stem}.prompt.md`, prompt);
console.log(`▶ ${model}/${effort} · ${files.length} file(s) · ${label}`);
const started = Date.now();
const r = spawnSync(
  'claude',
  ['-p', prompt, '--agent', 'code-reviewer-sweeps', '--permission-mode', 'acceptEdits', '--output-format', 'json', '--model', model, '--effort', effort],
  { cwd: ROOT, encoding: 'utf8', timeout: fuseMin * 60_000, maxBuffer: 32 * 1024 * 1024 },
);
const secs = Math.round((Date.now() - started) / 1000);
writeFileSync(`${stem}.log`, `${r.stdout ?? ''}\n${r.stderr ?? ''}`);

let out = null;
try {
  out = JSON.parse(r.stdout);
} catch {
  /* the log holds the raw text */
}
const text = out?.result ?? r.stdout ?? '';
/* The shard answers in text. Take the last fenced block, since it reasons above it. */
const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
let verdict = null;
for (const b of blocks.reverse()) {
  try {
    verdict = JSON.parse(b);
    break;
  } catch {
    /* keep looking */
  }
}
if (verdict) writeFileSync(`${stem}.json`, `${JSON.stringify(verdict, null, 2)}\n`);

const findings = Array.isArray(verdict) ? verdict : (verdict?.findings ?? []);
const blockers = findings.filter((f) => f.severity !== 'note' && f.severity !== 'info');
console.log(
  `◼ ${secs}s · ${out ? `$${(out.total_cost_usd ?? 0).toFixed(3)}` : 'no json'} · ${out ? `${out.usage?.output_tokens ?? 0} out-tok` : ''} · ${
    verdict ? `${blockers.length} blockers, ${findings.length - blockers.length} notes` : 'NO VERDICT PARSED'
  }`,
);
if (verdict?.sweeps) console.log(`  sweeps: ${JSON.stringify(verdict.sweeps)}`);
for (const f of findings)
  console.log(`  ${f.severity === 'note' || f.severity === 'info' ? 'note ' : 'BLOCK'} ${(f.file || '?').split('/').pop()}#${f.symbol ?? ''} — ${(f.claim || '').replace(/\s+/g, ' ').slice(0, 190)}`);
if (!verdict) console.log(text.slice(-700));
