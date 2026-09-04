/**
 * The shard plan for one spec-review pass: who reads what, and which questions they answer.
 *
 * The axis is the **bundle file**, not the subject. A shard that is handed a family of criteria
 * and no file list reads the whole bundle to answer them, which is the reading the split exists
 * to avoid; a shard handed one file reads one file. The register's `where` column says which
 * file answers each criterion, so adding a criterion places itself.
 *
 * `judge` criteria never reach a shard: a contradiction lives between two regions and a scope
 * question is about the whole document, so neither can be settled from one file.
 *
 * Nothing here is a judgement. The plan is a function of the register and the files on disk, so
 * two passes over one document shard it the same way and a comparison between them measures the
 * judge rather than the split.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readRegister } from './criteria.mjs';

/** Which bundle member each `where` value names, and what a shard enumerates from it. */
const MEMBERS = [
  {
    where: 'behaviour',
    suffix: '.md',
    label: 'the behaviour file',
    enumerate: 'every requirement, every invariant it states absolutely, and every claim it makes about code that exists today',
  },
  {
    where: 'contracts',
    suffix: '.contracts.md',
    label: 'the contracts file',
    enumerate: 'every route, message, column, validation rule, screen state and edge case, and every claim any of them makes about code that exists today',
  },
  {
    where: 'cases',
    suffix: '.cases.md',
    label: 'the cases file',
    enumerate: 'every test case: the route to the state it asserts, whether its expected result follows from its steps, and the level it sits at',
  },
  {
    where: 'design',
    suffix: '.design.md',
    label: 'the design file',
    enumerate: 'every surface it draws and every claim it makes about code that exists today',
  },
];

export function shardPlan(root, spec) {
  const reg = readRegister(root, 'spec');
  const stem = spec.replace(/\.md$/, '');

  const shards = [];
  const missing = [];
  for (const m of MEMBERS) {
    const path = m.where === 'behaviour' ? `${stem}.md` : `${stem}${m.suffix}`;
    const abs = join(root, path);
    const ids = [...reg.ids].filter((id) => {
      const w = reg.where.get(id);
      return w === m.where || w === 'any';
    }).sort();
    if (!existsSync(abs)) {
      /* A member the bundle does not have. Its own criteria fall to the judge rather than
         quietly going unanswered — a criterion nobody was asked is the failure this whole
         register exists to make visible. */
      const own = ids.filter((id) => reg.where.get(id) === m.where);
      if (own.length) missing.push({ member: m.where, path, ids: own });
      continue;
    }
    if (!ids.length) continue;
    shards.push({
      shard: shards.length + 1,
      member: m.where,
      label: m.label,
      file: path,
      lines: readFileSync(abs, 'utf8').split(/\r?\n/).length,
      enumerate: m.enumerate,
      criteria: ids.map((id) => ({
        id,
        severity: reg.severity.get(id) ?? 'blocks',
        question: reg.question.get(id) ?? '',
      })),
    });
  }

  const judgeIds = [...reg.ids].filter((id) => (reg.where.get(id) ?? 'judge') === 'judge').sort();
  const unplaced = [...reg.ids].filter((id) => !reg.where.has(id)).sort();

  return {
    spec,
    register: reg.path,
    shards,
    judge: judgeIds.map((id) => ({ id, question: reg.question.get(id) ?? '' })),
    unplaced,
    missingMembers: missing,
  };
}

/**
 * One shard's prompt. Everything it may use is in here: its file, its questions, and the shape
 * of the answer. It is given no register to read and no family name to interpret — a shard that
 * has to look a criterion up has been handed a document, not a question.
 */
export function shardPrompt(plan, shard, { range = null } = {}) {
  const lines = [
    `You are shard ${shard.shard} of ${plan.shards.length} on the specification \`${plan.spec}\`.`,
    ``,
    `## Your file`,
    ``,
    `\`${shard.file}\` — ${shard.label}, ${shard.lines} lines. **Read all of it, and nothing else`,
    `of the bundle.** The other members are held by other shards; a statement in one of them is`,
    `not yours to report on, however wrong it looks.`,
    ``,
    `You may read the repository — the code, \`CLAUDE.md\`, \`packages/validation\`, the schema —`,
    `as evidence for the questions below. That is what settles a claim about what exists today.`,
    ``,
    `## Enumerate`,
    ``,
    `${shard.enumerate}.`,
    ``,
    `Build the list before you answer anything about it. A sweep that produced no list did not`,
    `run, and zero enumerated items is a failed sweep rather than a clean one.`,
    ``,
    `## Your questions, and the whole of them`,
    ``,
  ];
  for (const c of shard.criteria) {
    lines.push(`- **${c.id}** (${c.severity}) — ${c.question}`);
  }
  lines.push(
    ``,
    `Answer each one for **your file**: \`clear\`, \`claim\`, or \`n/a\` when your file has no such`,
    `subject. Report a \`claim\` when the answer is no. You never set severity and you never`,
    `block — the judge decides what a claim is worth.`,
    ``,
  );
  if (range) {
    lines.push(
      `## This pass judges a change`,
      ``,
      `The range is \`${range}\`. Sweep the lines that commit changed in your file and the rules`,
      `those lines touch. A statement outside the range is one an earlier pass accepted.`,
      ``,
    );
  }
  lines.push(
    `## Your answer`,
    ``,
    `Write it to \`${shard.out}\` — that file is the only output of this pass; a judgement that is`,
    `not in it did not happen. Then print the same JSON and nothing after it.`,
    ``,
    '```json',
    JSON.stringify(
      {
        shard: shard.shard,
        file: shard.file,
        enumerated: [
          { item: 'REQ-03-004 cites hasCapability in packages/validation', settledBy: 'grep -n "export function hasCapability" packages/validation/src/capabilities.ts', ok: true },
        ],
        counts: { enumerated: 34, ok: 33, claims: 1 },
        criteria: { 'S-01': 'clear', 'S-03': 'claim', 'S-06': 'n/a' },
        claims: [
          {
            id: `S${shard.shard}-C1`,
            criterion: 'S-03',
            file: shard.file,
            symbol: 'Routes',
            line: 41,
            claim: 'the route is documented as answering 403; the controller answers 404',
            witness: {
              kind: 'command',
              detail: 'grep -n "NotFoundException" apps/api/src/clients/clients.controller.ts → :88',
              source: 'apps/api/src/clients/clients.controller.ts:88',
            },
            confidence: 'high',
            suggestedFix: 'state 404 in the Errors cell',
          },
        ],
      },
      null,
      2,
    ),
    '```',
    ``,
    `\`criteria\` carries every id you were given, and \`enumerated\` every item you listed — not`,
    `only the ones that failed.`,
  );
  return lines.join('\n');
}
