/**
 * criteria — the closed registers a judge may block under, read from the register itself.
 *
 * Two documents carry them: `.claude/skills/spec-review/references/admission-criteria.md` for the
 * spec judge and `.claude/skills/code-review/references/blocking-criteria.md` for the review. Each
 * is a set of markdown tables whose first cell is the id, so adding a criterion is an edit to
 * the page a judge reads and nothing else — there is no second list here to keep in step.
 *
 * Enforcing the ids in a script rather than in a prompt is what makes the register closed. A
 * judge that files under an id nobody wrote down has invented a rule, and a rule that appears
 * only in one pass is exactly how a loop stops converging: the next round meets an objection
 * the round before never raised, and the spec grows a section answering it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REGISTERS = {
  spec: '.claude/skills/spec-review/references/admission-criteria.md',
  review: '.claude/skills/code-review/references/blocking-criteria.md',
};

const cache = new Map();

/**
 * Every id the register declares, and the severity its row gives it.
 *
 * A register that cannot be read comes back empty, and an empty register enforces nothing —
 * a missing file must not turn every blocker in the repository into a note without saying so.
 * Callers check `ids.size` before enforcing.
 */
export function readRegister(root, which) {
  const path = join(root, REGISTERS[which]);
  const key = `${which}:${path}`;
  if (cache.has(key)) return cache.get(key);

  const out = { path: REGISTERS[which], ids: new Set(), severity: new Map() };
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\|\s*((?:S|CR)-\d+)\s*\|(.*)$/);
      if (!m) continue;
      out.ids.add(m[1]);
      const cells = m[2].split('|').map((c) => c.trim());
      const sev = cells.find((c) => c === 'blocks' || c === 'note');
      if (sev) out.severity.set(m[1], sev);
    }
  }
  cache.set(key, out);
  return out;
}

/**
 * Demote, in place, every blocker that names no criterion or one the register does not carry,
 * and every blocker under a criterion the register itself marks `note`. Returns what was
 * demoted, each with the reason, for the caller to print.
 *
 * `extra` is a predicate for the ids a register does not own but the caller accepts — the
 * review takes a numbered requirement of the spec under review, which is not in any register
 * and is still a written rule.
 */
export function enforceCriteria(findings, register, { extra = () => false } = {}) {
  const demoted = [];
  if (!register.ids.size) return demoted;

  for (const f of findings ?? []) {
    if (f.severity !== 'blocker') continue;
    const id = typeof f.criterion === 'string' ? f.criterion.trim() : '';
    let why = null;
    if (!id) why = 'names no criterion';
    else if (!register.ids.has(id) && !extra(id)) why = `criterion "${id}" is not in the register`;
    else if (register.severity.get(id) === 'note') why = `criterion ${id} is note-only`;
    if (!why) continue;
    f.severity = 'note';
    f.demotedFrom = 'blocker';
    f.demoted = why;
    demoted.push(f);
  }
  return demoted;
}
