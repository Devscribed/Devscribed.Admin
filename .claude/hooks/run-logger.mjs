#!/usr/bin/env node
/**
 * run-logger — writes one NDJSON line per agent event into the active run's journal.
 *
 * Registered on SubagentStart / PreToolUse / PostToolUse / PostToolUseFailure / SubagentStop.
 * Agents can forget to log; a hook cannot, which is why the journal is written here and not
 * from a prompt.
 *
 * Three rules this file exists to keep:
 *
 *   Truncate.  A single Read returns a whole file. Bodies over BLOB_THRESHOLD go to blobs/
 *              and the line keeps a size and a sha256. Without this a run's journal is
 *              hundreds of megabytes.
 *   Redact.    .env, Info.txt and anything shaped like a credential never reach the file.
 *              A journal containing a secret is worse than no journal, so a suspect event
 *              is dropped whole rather than patched.
 *   Never block. Always exits 0. A broken logger must not be able to stop the pipeline.
 *
 * Durations come from pairing PreToolUse with PostToolUse on tool_use_id.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.CLAUDE_PROJECT_DIR
  ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const BLOB_THRESHOLD = 2048;
const PENDING = new Map(); // survives only within a process; the on-disk map below spans them

const SECRET_PATHS = [/(^|\/)\.env(\.|$)/i, /(^|\/)Info\.txt$/i, /\.pem$/i, /\.tfstate/i];
/**
 * Deliberately narrow. A generic "long base64-ish run" rule was tried first and redacted
 * every large legitimate output — a minified bundle, a data URI, a 5000-character file —
 * which quietly emptied the journal of exactly the content it exists to keep. Secret paths
 * are already covered by SECRET_PATHS; these catch a credential pasted into a command or
 * printed by one.
 */
const SECRET_SHAPES = [
  /\b(?:sk|pk|ghp|gho|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{16,}\b/,
  /(password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*["']?[^\s"',}]{8,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\baws_secret_access_key\b/i,
];

const out = (s) => process.stdout.write(s);

function activeRunDir() {
  const cur = join(ROOT, '.workflow', 'current');
  if (!existsSync(cur)) return null;
  const id = readFileSync(cur, 'utf8').trim();
  const dir = join(ROOT, '.workflow', 'runs', id);
  return existsSync(dir) ? { id, dir } : null;
}

const looksSecret = (text) => SECRET_SHAPES.some((re) => re.test(text));

function summarise(value, dir) {
  if (value == null) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (looksSecret(text)) return { redacted: true, bytes: text.length };
  if (text.length <= BLOB_THRESHOLD) return typeof value === 'string' ? { text } : value;

  const sha = createHash('sha256').update(text).digest('hex');
  const blobs = join(dir, 'blobs');
  mkdirSync(blobs, { recursive: true });
  const file = join(blobs, `${sha.slice(0, 16)}.txt`);
  if (!existsSync(file)) writeFileSync(file, text);
  return { bytes: text.length, sha256: sha, ref: `blobs/${sha.slice(0, 16)}.txt` };
}

function touchesSecret(input) {
  const p = input?.file_path ?? input?.path ?? '';
  if (typeof p === 'string' && SECRET_PATHS.some((re) => re.test(p))) return true;
  const cmd = input?.command;
  return typeof cmd === 'string' && SECRET_PATHS.some((re) => re.test(cmd));
}

function pendingStore(dir) {
  return join(dir, '.pending.json');
}

function rememberStart(dir, id, ts) {
  try {
    const p = pendingStore(dir);
    const map = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
    map[id] = ts;
    // Bound the map: a long run would otherwise accumulate every tool call ever started.
    const keys = Object.keys(map);
    if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete map[k];
    writeFileSync(p, JSON.stringify(map));
  } catch { /* the journal is best-effort by design */ }
}

function takeStart(dir, id) {
  if (PENDING.has(id)) { const t = PENDING.get(id); PENDING.delete(id); return t; }
  try {
    const p = pendingStore(dir);
    if (!existsSync(p)) return null;
    const map = JSON.parse(readFileSync(p, 'utf8'));
    const t = map[id] ?? null;
    if (t) { delete map[id]; writeFileSync(p, JSON.stringify(map)); }
    return t;
  } catch { return null; }
}

async function main() {
  const phase = process.argv[2] ?? 'unknown';
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  let e;
  try { e = JSON.parse(raw || '{}'); } catch { return; }

  const active = activeRunDir();
  if (!active) return; // no run in flight: nothing to attribute the event to
  const { id: runId, dir } = active;

  const ts = new Date().toISOString();
  const stage = (() => {
    try { return JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')).status; } catch { return null; }
  })();

  const common = {
    ts,
    runId,
    stage,
    agentId: e.agent_id ?? null,
    agentType: e.agent_type ?? null,
    sessionId: e.session_id ?? null,
  };

  let line = null;

  switch (phase) {
    case 'subagent-start':
      line = { ...common, event: 'agent-start' };
      break;

    case 'subagent-stop': {
      /* Reasoning is not in the hook payload — it lives in the session transcript. Snapshot
         the path now, while it still exists, so a later compaction cannot erase it. */
      line = { ...common, event: 'agent-stop', transcript: e.transcript_path ?? null };
      if (e.transcript_path && existsSync(e.transcript_path)) {
        try {
          const think = join(dir, 'thinking');
          mkdirSync(think, { recursive: true });
          writeFileSync(
            join(think, `${(e.agent_id ?? 'main').replace(/[^\w-]/g, '')}.jsonl`),
            readFileSync(e.transcript_path, 'utf8'),
          );
          line.transcriptSaved = true;
        } catch { line.transcriptSaved = false; }
      }
      break;
    }

    case 'tool-pre':
      if (e.tool_use_id) { PENDING.set(e.tool_use_id, ts); rememberStart(dir, e.tool_use_id, ts); }
      return; // the paired post event carries the record

    case 'tool-post':
    case 'tool-fail': {
      const started = e.tool_use_id ? takeStart(dir, e.tool_use_id) : null;
      const secret = touchesSecret(e.tool_input);
      line = {
        ...common,
        event: 'tool',
        tool: e.tool_name ?? null,
        toolUseId: e.tool_use_id ?? null,
        ok: phase === 'tool-post',
        durationMs: started ? Date.parse(ts) - Date.parse(started) : null,
        input: secret ? { redacted: true } : summarise(e.tool_input, dir),
        output: secret ? { redacted: true } : summarise(e.tool_output ?? e.error ?? null, dir),
      };
      break;
    }

    default:
      return;
  }

  if (line) {
    try { appendFileSync(join(dir, 'events.jsonl'), `${JSON.stringify(line)}\n`); } catch { /* never block */ }
  }
}

main().catch(() => {}).finally(() => { out(''); process.exit(0); });
