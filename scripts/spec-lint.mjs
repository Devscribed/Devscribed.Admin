#!/usr/bin/env node
/**
 * spec-lint — the decidable half of judging a specification.
 *
 * A spec bundle is three files that share a base path:
 *
 *   specs/<area>/NN-name.md            behaviour  — EARS requirements, decision tables
 *   specs/<area>/NN-name.contracts.md  contracts  — routes, messages, testids, data model
 *   specs/<area>/NN-name.cases.md      cases      — test cases, each declaring what it asserts
 *
 * Everything checked here is a join or a regex. Nothing here needs a model, and no repair it
 * asks for adds a rule to the document — which is what keeps a refine loop from growing the
 * thing it is refining.
 *
 *   node scripts/spec-lint.mjs specs/requests/02-client-participants.md [--json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();

/* ── budgets ──────────────────────────────────────────────────────────────── */

/**
 * The budget is per requirement, not absolute. An absolute cap punishes a large feature; what is
 * actually being fought is prose accreting around rules, and that shows up as lines per rule.
 */
const BUDGET = {
  scaffold: 120, // summary, actors, matrices, acceptance criteria
  perRequirement: 7, // heading, rule, blank, and room for one decision
  requirementLines: 12, // one rule, stated once, reasoning not included
};

/* ── EARS ─────────────────────────────────────────────────────────────────── */

/** The five patterns. Everything else is prose pretending to be a rule. */
const EARS = [
  { name: 'ubiquitous', re: /^THE SYSTEM SHALL /i },
  { name: 'event', re: /^WHEN .+?, THE SYSTEM SHALL /i },
  { name: 'state', re: /^WHILE .+?, THE SYSTEM SHALL /i },
  { name: 'optional', re: /^WHERE .+?, THE SYSTEM SHALL /i },
  { name: 'unwanted', re: /^IF .+?, THEN THE SYSTEM SHALL /i },
  { name: 'complex', re: /^(WHILE|WHERE) .+?, (WHEN|IF) .+?, (THEN )?THE SYSTEM SHALL /i },
];

/* ── prose hazards ────────────────────────────────────────────────────────── */

/**
 * A pointer carries information by reference: the reader must open the other document to learn
 * the rule. Naming another spec for provenance does not match these — "reuses the invitation
 * built in user-management 03" says where a thing came from, not what it does.
 */
const POINTER = [
  /\bunchanged from\b/i,
  /\bexactly as .{0,40}\bspec\b/i,
  /\bas spec \d+ (defines|does|has|states)/i,
  /\bspec \d+'s (message|contract|shape|rule|refusal|body)/i,
  /\bper spec \d+\b/i,
  /\bsee spec\b/i,
  /\bspec \d+ requirement \d+/i,
  /\bthe same .{0,40} spec \d+ already (uses|defines|has)/i,
  /\b(defines|defined) it\b/i,
];

/** A number in prose about something a table already counts. The table moves; the number lies. */
const PROSE_COUNT =
  /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,3})\s+(?:of the\b|ids\b|rows\b|sites\b|cases\b|sections\b|columns\b|statements\b|call sites\b)|\bthe (?:two|three|four|five|six|seven|eight|nine|ten|\d{1,3}) (?:above|below)\b/i;

/** A line number into code goes stale on the next edit to that file. */
const CODE_LINE_CITE = /\b[\w./-]+\.(?:ts|tsx|mjs|js|prisma|json|sql)\s*:\s*\d+/;

/** A repo path worth checking exists. */
const REPO_PATH = /\b((?:apps|packages|e2e|scripts|infra|specs|docs)\/[\w./@-]+\.[a-z]{2,4})\b/g;

/* ── findings ─────────────────────────────────────────────────────────────── */

const findings = [];
const add = (rule, file, line, message, fix) =>
  findings.push({ rule, file, line, message, fix });

/* ── parsing ──────────────────────────────────────────────────────────────── */

function read(file) {
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8').split('\n');
}

/** Strip markdown emphasis, code ticks and links so a pattern can match the sentence. */
function plain(s) {
  return s
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();
}

/** Rows of the first markdown table that follows `fromLine`, as arrays of trimmed cells. */
function tableAfter(lines, fromLine) {
  const rows = [];
  let i = fromLine;
  while (i < lines.length && !lines[i].trim().startsWith('|')) {
    if (lines[i].trim().startsWith('#')) return { rows, header: [], end: i };
    i += 1;
  }
  const header = splitRow(lines[i]);
  i += 2; // header + separator
  for (; i < lines.length; i += 1) {
    if (!lines[i].trim().startsWith('|')) break;
    rows.push({ cells: splitRow(lines[i]), line: i + 1 });
  }
  return { rows, header, end: i };
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** Sections keyed by heading, carrying their body lines. */
function sections(lines, depth) {
  const marker = '#'.repeat(depth) + ' ';
  const out = [];
  let cur = null;
  lines.forEach((raw, idx) => {
    if (raw.startsWith(marker)) {
      if (cur) out.push(cur);
      cur = { title: raw.slice(marker.length).trim(), line: idx + 1, body: [], start: idx };
    } else if (cur && /^#{1,6} /.test(raw) && !raw.startsWith(marker + '#')) {
      const level = raw.match(/^(#+)/)[1].length;
      if (level <= depth) {
        out.push(cur);
        cur = null;
      } else cur.body.push(raw);
    } else if (cur) cur.body.push(raw);
  });
  if (cur) out.push(cur);
  return out;
}

/* ── the bundle ───────────────────────────────────────────────────────────── */

function loadBundle(specPath) {
  const base = specPath.replace(/\.md$/, '');
  const files = {
    behaviour: specPath,
    contracts: `${base}.contracts.md`,
    cases: `${base}.cases.md`,
  };
  const lines = {};
  for (const [k, f] of Object.entries(files)) {
    const l = read(f);
    if (!l) {
      console.error(`spec-lint: missing bundle member ${f}`);
      process.exit(2);
    }
    lines[k] = l;
  }
  return { files, lines };
}

/* ── requirements ─────────────────────────────────────────────────────────── */

const REQ_HEADING = /^#{3,4} (REQ-\d{2}-\d{3}) — (.+)$/;

function parseRequirements(lines, file) {
  const reqs = [];
  let cur = null;
  lines.forEach((raw, idx) => {
    const m = raw.match(REQ_HEADING);
    if (m) {
      if (cur) reqs.push(cur);
      cur = { id: m[1], title: m[2], line: idx + 1, body: [], file };
      return;
    }
    if (cur && /^#{1,4} /.test(raw)) {
      reqs.push(cur);
      cur = null;
      return;
    }
    if (cur) cur.body.push(raw);
  });
  if (cur) reqs.push(cur);
  return reqs;
}

/** The rule sentence: the first non-empty, non-directive, non-table paragraph. */
function ruleSentence(req) {
  const out = [];
  for (const raw of req.body) {
    const t = raw.trim();
    if (!t) {
      if (out.length) break;
      continue;
    }
    if (t.startsWith('|') || t.startsWith('```') || t.startsWith('decision-table:')) break;
    out.push(t);
  }
  return plain(out.join(' '));
}

/* ── decision tables ──────────────────────────────────────────────────────── */

/**
 * decision-table: keys=(a, b) domains=(a: x|y, b: p|q)
 *
 * Every element of the cross product gets a row. A cell nobody wrote is a state the product
 * reaches and the spec never answers — the defect class that costs a whole pipeline run.
 */
const DT_DIRECTIVE = /^decision-table:\s*keys=\(([^)]*)\)\s*domains=\((.*)\)\s*$/;

function parseDomains(spec) {
  const domains = {};
  // split on commas that are followed by "<name>:" — values themselves use "|"
  const parts = spec.split(/,\s*(?=[A-Za-z_][\w]*\s*:)/);
  for (const p of parts) {
    const m = p.match(/^\s*([A-Za-z_][\w]*)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    domains[m[1]] = m[2].split('|').map((v) => v.trim()).filter(Boolean);
  }
  return domains;
}

function checkDecisionTables(lines, file) {
  lines.forEach((raw, idx) => {
    const t = raw.trim().replace(/^`|`$/g, '');
    const m = t.match(DT_DIRECTIVE);
    if (!m) return;
    const keys = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const domains = parseDomains(m[2]);
    const missingDomain = keys.filter((k) => !domains[k]);
    if (missingDomain.length) {
      add('table/no-domain', file, idx + 1,
        `decision table declares keys (${keys.join(', ')}) with no domain for ${missingDomain.join(', ')}`,
        'declare every key\'s domain, or drop the key');
      return;
    }
    const { rows, header } = tableAfter(lines, idx + 1);
    if (!rows.length) {
      add('table/empty', file, idx + 1, 'decision-table directive with no table under it');
      return;
    }
    const keyCols = keys.map((k) => header.findIndex((h) => plain(h).toLowerCase() === k.toLowerCase()));
    const missingCol = keys.filter((k, i) => keyCols[i] === -1);
    if (missingCol.length) {
      add('table/no-column', file, idx + 1,
        `declared key(s) ${missingCol.join(', ')} have no column in the table (header: ${header.join(' | ')})`);
      return;
    }
    const seen = new Set();
    for (const row of rows) {
      const tuple = keys.map((k, i) => plain(row.cells[keyCols[i]] ?? ''));
      const unknown = tuple
        .map((v, i) => (domains[keys[i]].includes(v) ? null : `${keys[i]}=${v}`))
        .filter(Boolean);
      if (unknown.length) {
        add('table/off-domain', file, row.line,
          `row uses value(s) outside the declared domain: ${unknown.join(', ')}`,
          'widen the domain, or correct the cell');
        continue;
      }
      seen.add(tuple.join(' '));
    }
    const cross = keys.reduce((acc, k) => acc.flatMap((t) => domains[k].map((v) => [...t, v])), [[]]);
    const holes = cross.filter((t) => !seen.has(t.join(' ')));
    if (holes.length) {
      add('table/incomplete', file, idx + 1,
        `${holes.length} of ${cross.length} cells have no row: ` +
          holes.slice(0, 8).map((t) => `(${t.join(', ')})`).join(', ') +
          (holes.length > 8 ? ', …' : ''),
        'give every cell a row — a named outcome, or the word unreachable with its reason');
    }
  });
}

/* ── contracts ────────────────────────────────────────────────────────────── */

const ROUTE_RE = /^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)$/;

function parseContracts(lines, file) {
  const routes = new Map(); // "POST /api/x" -> { statuses:Set, messages:Set, line }
  const messages = new Map(); // export -> { routes:Set, text, line }
  const testids = new Map(); // id -> { line, asserted }

  const secs = sections(lines, 2);
  for (const sec of secs) {
    const title = plain(sec.title).toLowerCase();
    const body = sec.body;
    if (title.startsWith('routes')) {
      const { rows, header } = tableAfter(body, 0);
      const ci = (n) => header.findIndex((h) => plain(h).toLowerCase() === n);
      const [cRoute, cOk, cErr] = [ci('route'), ci('success'), ci('errors')];
      for (const row of rows) {
        const key = plain(row.cells[cRoute] ?? '');
        if (!ROUTE_RE.test(key)) {
          add('route/malformed', file, sec.start + row.line,
            `route cell is not "METHOD /path": ${key}`);
          continue;
        }
        const statuses = new Set();
        const messagesHere = new Set();
        for (const cell of [row.cells[cOk], row.cells[cErr]]) {
          const txt = plain(cell ?? '');
          for (const s of txt.match(/\b[1-5]\d\d\b/g) ?? []) statuses.add(s);
          for (const e of txt.match(/\b(?:[A-Z][A-Z0-9_]*_)?MESSAGES\.[\w.]+/g) ?? []) messagesHere.add(e);
        }
        routes.set(key, { statuses, messages: messagesHere, line: sec.start + row.line });
      }
    }
    if (title.startsWith('error messages')) {
      const { rows, header } = tableAfter(body, 0);
      const ci = (n) => header.findIndex((h) => plain(h).toLowerCase() === n);
      const [cExp, cRoute, cText] = [ci('export'), ci('route'), ci('message')];
      for (const row of rows) {
        const exp = plain(row.cells[cExp] ?? '');
        if (!/^(?:[A-Z][A-Z0-9_]*_)?MESSAGES\.[\w.]+$/.test(exp)) {
          add('message/malformed', file, sec.start + row.line,
            `export cell is not an EXPORT.key: ${exp}`);
          continue;
        }
        const rs = new Set(
          (plain(row.cells[cRoute] ?? '').match(/(?:GET|POST|PUT|PATCH|DELETE)\s+[^\s,;]+/g) ?? [])
            .map((s) => s.trim()),
        );
        messages.set(exp, { routes: rs, text: plain(row.cells[cText] ?? ''), line: sec.start + row.line });
      }
    }
    if (title.includes('data-testid')) {
      const { rows, header } = tableAfter(body, 0);
      const ci = (n) => header.findIndex((h) => plain(h).toLowerCase() === n);
      const [cId, cAss] = [ci('id'), ci('asserted')];
      for (const row of rows) {
        const id = plain(row.cells[cId] ?? '');
        if (!id) continue;
        testids.set(id, { line: sec.start + row.line, asserted: plain(row.cells[cAss] ?? '') });
      }
    }
  }
  return { routes, messages, testids };
}

/* ── cases ────────────────────────────────────────────────────────────────── */

const CASE_HEADING = /^#{3} (TC-\d{2}-(?:UNIT|INT|E2E)-\d{2,3})\b/;
const FIELD = /^-\s+\*\*(Level|Covers|Asserts|Selectors|Steps|Expected Result):\*\*\s*(.*)$/;

function parseCases(lines, file) {
  const cases = [];
  let cur = null;
  let field = null;
  lines.forEach((raw, idx) => {
    const h = raw.match(CASE_HEADING);
    if (h) {
      if (cur) cases.push(cur);
      cur = { id: h[1], line: idx + 1, fields: {}, file };
      field = null;
      return;
    }
    if (!cur) return;
    const f = raw.match(FIELD);
    if (f) {
      field = f[1];
      cur.fields[field] = f[2];
      cur.fields[`${field}@line`] = idx + 1;
      return;
    }
    if (field && /^\s+\S/.test(raw)) cur.fields[field] += ' ' + raw.trim();
    else if (!raw.trim()) field = null;
  });
  if (cur) cases.push(cur);
  return cases;
}

/** "POST /api/x → 409 SOME_MESSAGES.key" repeated, separated by ";" */
const ASSERT_RE =
  /^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)\s*(?:->|→)\s*([1-5]\d\d)(?:\s+((?:[A-Z][A-Z0-9_]*_)?MESSAGES\.[\w.]+))?$/;

/* ── checks ───────────────────────────────────────────────────────────────── */

function checkProse(lines, file, { skipHeadings = [] } = {}) {
  let inFence = false;
  let skipping = false;
  lines.forEach((raw, idx) => {
    if (raw.trim().startsWith('```')) inFence = !inFence;
    if (inFence) return;
    if (/^#{1,6} /.test(raw)) {
      const t = plain(raw.replace(/^#+\s*/, '')).toLowerCase();
      skipping = skipHeadings.some((h) => t.startsWith(h));
    }
    if (skipping) return;
    const line = raw.trim();
    if (!line) return;
    for (const re of POINTER) {
      if (re.test(line)) {
        add('pointer/cross-spec', file, idx + 1,
          `a rule carried by reference: "${line.slice(0, 110)}"`,
          'state the rule here — the status, the message, the shape — so the reader never opens the other document');
        break;
      }
    }
    if (PROSE_COUNT.test(line)) {
      add('prose/count', file, idx + 1,
        `a count in prose about something a table holds: "${line.slice(0, 110)}"`,
        'delete the number, or derive it in the table itself');
    }
    if (CODE_LINE_CITE.test(line)) {
      add('cite/line-number', file, idx + 1,
        `a line number into code: "${line.match(CODE_LINE_CITE)[0]}"`,
        'name the symbol instead — a line number goes stale on the next edit');
    }
  });
}

function checkPaths(lines, file) {
  const seen = new Set();
  lines.forEach((raw, idx) => {
    for (const m of raw.matchAll(REPO_PATH)) {
      const p = m[1];
      if (seen.has(p)) continue;
      seen.add(p);
      if (!fs.existsSync(path.join(ROOT, p))) {
        add('path/missing', file, idx + 1, `cited path does not exist: ${p}`,
          'correct the path, or delete the sentence if it states no rule');
      }
    }
  });
}

function checkRequirements(reqs, file) {
  const byId = new Map();
  for (const r of reqs) {
    if (byId.has(r.id)) {
      add('req/duplicate-id', file, r.line, `${r.id} is defined twice (first at line ${byId.get(r.id).line})`);
      continue;
    }
    byId.set(r.id, r);

    const sentence = ruleSentence(r);
    if (!sentence) {
      add('req/empty', file, r.line, `${r.id} has no rule sentence`);
      continue;
    }
    const pattern = EARS.find((p) => p.re.test(sentence));
    if (!pattern) {
      add('req/ears', file, r.line,
        `${r.id} matches no EARS pattern: "${sentence.slice(0, 120)}"`,
        'WHEN <trigger>, THE SYSTEM SHALL <response> — or WHILE / WHERE / IF…THEN / bare THE SYSTEM SHALL');
    }
    const shalls = (sentence.match(/\bSHALL\b/gi) ?? []).length;
    if (shalls > 1) {
      add('req/singular', file, r.line,
        `${r.id} states ${shalls} responses in one requirement`,
        'one requirement, one response — split it');
    }
    const hasTable = r.body.some((l) => l.trim().startsWith('decision-table:') || l.trim().startsWith('`decision-table:'));
    if (!hasTable) {
      const statuses = new Set(sentence.match(/\b[1-5]\d\d\b/g) ?? []);
      if (statuses.size > 1) {
        add('req/singular', file, r.line,
          `${r.id} names ${statuses.size} status codes (${[...statuses].join(', ')}) in one requirement`,
          'one observable outcome per requirement, or move the branching into a decision table');
      }
    }
    const len = r.body.filter((l) => l.trim()).length;
    if (len > BUDGET.requirementLines && !hasTable) {
      add('req/verbose', file, r.line,
        `${r.id} is ${len} lines; the budget is ${BUDGET.requirementLines}`,
        'a rule, not the reasoning that produced it');
    }
  }
  return byId;
}

function checkCases(cases, reqs, contracts, files) {
  const covered = new Set();
  const usedTestids = new Set();

  for (const c of cases) {
    const f = c.fields;
    for (const required of ['Level', 'Covers', 'Steps', 'Expected Result']) {
      if (!f[required]) add('case/missing-field', files.cases, c.line, `${c.id} has no ${required} field`);
    }
    for (const id of (f.Covers ?? '').match(/REQ-\d{2}-\d{3}/g) ?? []) {
      if (!reqs.has(id)) {
        add('case/unknown-req', files.cases, f['Covers@line'] ?? c.line,
          `${c.id} covers ${id}, which no requirement defines`);
      } else covered.add(id);
    }
    if (f.Asserts) {
      const parts = f.Asserts.split(';').map((s) => plain(s).trim()).filter(Boolean);
      for (const part of parts) {
        const m = part.match(ASSERT_RE);
        if (!m) {
          add('case/assert-malformed', files.cases, f['Asserts@line'] ?? c.line,
            `${c.id}: "${part}" is not "METHOD /path → status [MESSAGES.key]"`);
          continue;
        }
        const [, method, p, status, msg] = m;
        const key = `${method} ${p}`;
        const route = contracts.routes.get(key);
        if (!route) {
          add('case/route-unknown', files.cases, f['Asserts@line'] ?? c.line,
            `${c.id} asserts ${key}, which the Routes table does not carry`,
            'add the route to contracts, or correct the path');
          continue;
        }
        if (!route.statuses.has(status)) {
          add('case/status-mismatch', files.cases, f['Asserts@line'] ?? c.line,
            `${c.id} expects ${status} from ${key}; contracts declare ${[...route.statuses].sort().join(', ')}`,
            'one of the two is wrong — decide which, in the document');
        }
        if (msg) {
          const rec = contracts.messages.get(msg);
          if (!rec) {
            add('case/message-unknown', files.cases, f['Asserts@line'] ?? c.line,
              `${c.id} asserts ${msg}, which the Error Messages table does not carry`);
          } else if (rec.routes.size && !rec.routes.has(key)) {
            add('case/message-route', files.cases, f['Asserts@line'] ?? c.line,
              `${c.id} asserts ${msg} on ${key}; the table lists it for ${[...rec.routes].join(', ')}`);
          }
        }
      }
    }
    for (const tok of (f.Selectors ?? '').match(/`([^`]+)`/g) ?? []) {
      const id = tok.replace(/`/g, '').trim();
      const norm = id.replace(/\{[^}]*\}/g, '{id}');
      if (contracts.testids.has(id)) usedTestids.add(id);
      else if (contracts.testids.has(norm)) usedTestids.add(norm);
    }
    if (f.Level === 'E2E' && !f.Selectors) {
      add('case/no-selectors', files.cases, c.line, `${c.id} is E2E and names no selectors`);
    }
  }

  for (const [id, r] of reqs) {
    if (!covered.has(id)) {
      add('req/uncovered', r.file, r.line, `${id} is covered by no test case`,
        'add a case whose Covers names it, or delete the requirement');
    }
  }
  for (const [id, t] of contracts.testids) {
    if (!usedTestids.has(id)) {
      add('testid/unused', files.contracts, t.line, `${id} is in the table and no case asserts it`,
        'assert it in a case, or take it out of the table');
    }
  }
}

function checkE2ESelectorsDeclared(cases, contracts, files) {
  for (const c of cases) {
    const raw = c.fields.Selectors;
    if (!raw) continue;
    for (const tok of raw.match(/`([^`]+)`/g) ?? []) {
      const id = tok.replace(/`/g, '').trim();
      const norm = id.replace(/\{[^}]*\}/g, '{id}');
      if (!contracts.testids.has(id) && !contracts.testids.has(norm)) {
        add('testid/unknown', files.cases, c.fields['Selectors@line'] ?? c.line,
          `${c.id} asserts ${id}, which the data-testid table does not carry`,
          'add it to the table, or correct the id');
      }
    }
  }
}

function checkAcceptance(lines, cases, file) {
  const ids = new Set(cases.map((c) => c.id));
  const secs = sections(lines, 2).filter((s) => plain(s.title).toLowerCase().startsWith('acceptance'));
  for (const sec of secs) {
    const { rows, header } = tableAfter(sec.body, 0);
    const ci = (n) => header.findIndex((h) => plain(h).toLowerCase().startsWith(n));
    const [cId, cObs] = [ci('#'), ci('observed by')];
    if (cObs === -1) {
      add('ac/no-observer-column', file, sec.line,
        'the Acceptance Criteria table has no "Observed by" column',
        'name the case that would fail if the criterion were not met');
      continue;
    }
    for (const row of rows) {
      const ac = plain(row.cells[cId] ?? '');
      const obs = (plain(row.cells[cObs] ?? '').match(/TC-\d{2}-(?:UNIT|INT|E2E)-\d{2,3}/g) ?? []);
      if (!obs.length) {
        add('ac/unobserved', file, sec.start + row.line, `${ac} names no observing case`);
        continue;
      }
      for (const o of obs) {
        if (!ids.has(o)) add('ac/unknown-case', file, sec.start + row.line, `${ac} names ${o}, which does not exist`);
      }
    }
  }
}

function checkBudget(lines, file, requirementCount) {
  const budget = BUDGET.scaffold + BUDGET.perRequirement * requirementCount;
  const n = lines.length;
  if (n > budget) {
    add('size/budget', file, 1,
      `${n} lines for ${requirementCount} requirements; the budget is ${budget} ` +
        `(${BUDGET.scaffold} + ${BUDGET.perRequirement} per requirement)`,
      'move tables into the contracts file, or cut the reasoning behind the rules');
  }
}

function checkGrowth(specPath) {
  let base;
  try {
    base = execFileSync('git', ['show', `HEAD:${specPath}`], { encoding: 'utf8', cwd: ROOT });
  } catch {
    return; // new file, nothing to grow from
  }
  const before = base.split('\n').length;
  const after = read(path.join(ROOT, specPath)).length;
  const growth = (after - before) / before;
  if (growth > 0.05) {
    add('size/growth', specPath, 1,
      `the behaviour file grew ${(growth * 100).toFixed(1)}% since HEAD (${before} → ${after} lines)`,
      'a repair states a rule; it does not add feature and does not copy the code into the document');
  }
}

/* ── main ─────────────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const specPath = args.find((a) => !a.startsWith('--'));
if (!specPath) {
  console.error('usage: node scripts/spec-lint.mjs <spec path> [--json]');
  process.exit(2);
}

const { files, lines } = loadBundle(specPath);

const reqs = checkRequirements(parseRequirements(lines.behaviour, files.behaviour), files.behaviour);
const contracts = parseContracts(lines.contracts, files.contracts);
const cases = parseCases(lines.cases, files.cases);

checkProse(lines.behaviour, files.behaviour, { skipHeadings: ['known gaps', 'out of scope'] });
checkProse(lines.contracts, files.contracts);
checkPaths(lines.behaviour, files.behaviour);
checkPaths(lines.contracts, files.contracts);
checkDecisionTables(lines.behaviour, files.behaviour);
checkDecisionTables(lines.contracts, files.contracts);
checkCases(cases, reqs, contracts, files);
checkE2ESelectorsDeclared(cases, contracts, files);
checkAcceptance(lines.behaviour, cases, files.behaviour);
checkBudget(lines.behaviour, files.behaviour, reqs.size);
checkGrowth(specPath);

findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));

if (asJson) {
  console.log(JSON.stringify({ spec: specPath, findings }, null, 2));
} else if (!findings.length) {
  console.log(`spec-lint: ${specPath} — clean`);
  console.log(
    `  ${reqs.size} requirements, ${cases.length} cases, ${contracts.routes.size} routes, ` +
      `${contracts.messages.size} messages, ${contracts.testids.size} testids`,
  );
} else {
  for (const f of findings) {
    console.log(`${f.file}:${f.line}  ${f.rule}`);
    console.log(`    ${f.message}`);
    if (f.fix) console.log(`    → ${f.fix}`);
  }
  console.log(`\n${findings.length} finding(s)`);
}

process.exit(findings.length ? 1 : 0);
