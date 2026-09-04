/**
 * usage-recover — what a stage spent when it was killed before it could say.
 *
 * Cost and token totals reach the orchestrator only in the closing `result` message the SDK
 * sends. A stage killed by its fuse never sends one, so the board showed the most expensive
 * attempt of a run as free — and the run's headline cost was short by more than everything
 * else in it put together.
 *
 * They are recoverable, from two places neither of which is the stage log:
 *
 * **The session transcript.** `~/.claude/projects/<slug>/<session>.jsonl` records every
 * message with its real usage. The stage log does not: its per-message `usage` are streaming
 * chunk deltas under a different accounting, and summing them is wrong by 72x on output and
 * 1.8x on cache reads — measured, not assumed, which is why this reads the transcript instead.
 *
 * The transcript writes each message more than once, so usage is summed over **unique
 * `message.id`**. Deduplicated that way it reproduces the SDK's own totals exactly — out,
 * cache read and cache write all three, to the token, on a stage that did report them.
 *
 * **The rates**, fitted from the run's own stages that did report a cost. Nothing is
 * hardcoded: least squares over (output, cacheRead, cacheWrite) against `costUSD` per model,
 * so the figure self-calibrates and no price list here can go stale. A cost derived this way
 * is an estimate and is always labelled one.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * `D:\git_repos\Devscribed.Admin` -> `D--git-repos-Devscribed-Admin`
 *
 * Every character that is not a letter or a digit becomes a dash — which is why the drive
 * colon and the separator after it collapse into two, and why the underscore in a directory
 * name and the dot in this one become dashes as well.
 */
const slugFor = (root) => root.replace(/[^A-Za-z0-9]/g, '-');

/**
 * Usage for one session, summed over unique message ids.
 *
 * `null` when the transcript is not on this machine — a run copied from elsewhere keeps its
 * logs and not the operator's session store, and a figure invented for it would be worse than
 * none.
 */
export function sessionUsage(root, sessionId) {
  if (!sessionId) return null;
  const dir = join(homedir(), '.claude', 'projects', slugFor(root));
  if (!existsSync(dir)) return null;
  const file = join(dir, `${sessionId}.jsonl`);
  if (!existsSync(file)) return null;

  const byId = new Map();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    const u = m.message?.usage;
    const id = m.message?.id;
    if (!u || !id || byId.has(id)) continue;
    byId.set(id, u);
  }
  if (!byId.size) return null;

  const t = { out: 0, cacheRead: 0, cacheWrite: 0, inp: 0, messages: byId.size };
  for (const u of byId.values()) {
    t.out += u.output_tokens ?? 0;
    t.cacheRead += u.cache_read_input_tokens ?? 0;
    t.cacheWrite += u.cache_creation_input_tokens ?? 0;
    t.inp += u.input_tokens ?? 0;
  }
  return t;
}

/**
 * Per-token rates for one model, solved from stages that reported both usage and cost.
 *
 * Input tokens are left out of the fit: with a cached prompt there are a handful of them per
 * pass, so the column is near zero, the system is ill-conditioned, and the solver answers with
 * a coefficient in the thousands of dollars per million that fits the noise. Their
 * contribution to a bill is a rounding error; leaving them out costs accuracy nothing and
 * makes the other three trustworthy.
 *
 * `null` under three samples — fewer than unknowns is not a fit, it is an interpolation
 * through whatever happened to be there.
 */
export function fitRates(samples) {
  const S = samples.filter((s) => s.cost > 0);
  if (S.length < 3) return null;

  const k = 3;
  const A = S.map((s) => [s.out, s.cacheRead, s.cacheWrite]);
  const y = S.map((s) => s.cost);
  const AtA = Array.from({ length: k }, () => Array(k).fill(0));
  const Aty = Array(k).fill(0);
  for (let n = 0; n < A.length; n += 1) {
    for (let p = 0; p < k; p += 1) {
      Aty[p] += A[n][p] * y[n];
      for (let q = 0; q < k; q += 1) AtA[p][q] += A[n][p] * A[n][q];
    }
  }

  const M = AtA.map((row, p) => [...row, Aty[p]]);
  for (let p = 0; p < k; p += 1) {
    let piv = p;
    for (let q = p + 1; q < k; q += 1) if (Math.abs(M[q][p]) > Math.abs(M[piv][p])) piv = q;
    [M[p], M[piv]] = [M[piv], M[p]];
    if (Math.abs(M[p][p]) < 1e-30) return null;
    for (let q = 0; q < k; q += 1) {
      if (q === p) continue;
      const f = M[q][p] / M[p][p];
      for (let z = p; z <= k; z += 1) M[q][z] -= f * M[p][z];
    }
  }
  const rate = { out: M[0][k] / M[0][0], cacheRead: M[1][k] / M[1][1], cacheWrite: M[2][k] / M[2][2] };
  if (!Number.isFinite(rate.out) || rate.out <= 0) return null;

  /* The residual travels with the rates, because a cost derived from them is quoted with it. */
  let worst = 0;
  for (const s of S) {
    const est = s.out * rate.out + s.cacheRead * rate.cacheRead + s.cacheWrite * rate.cacheWrite;
    worst = Math.max(worst, Math.abs(est - s.cost) / s.cost);
  }
  return { ...rate, samples: S.length, worstErr: worst };
}

/** What those tokens would have cost at those rates. `null` if either is missing. */
export function priceOf(tokens, rates) {
  if (!tokens || !rates) return null;
  return +(tokens.out * rates.out
    + tokens.cacheRead * rates.cacheRead
    + tokens.cacheWrite * rates.cacheWrite).toFixed(2);
}

/**
 * Rates per model, fitted over every stage on this machine that reported both usage and cost.
 *
 * Deliberately not per run. A rate belongs to the model, and one run rarely holds enough
 * completed stages to solve three unknowns — the run this was written for had two, so a
 * run-local fit returned nothing and the killed stage stayed unpriced. Widening the sample to
 * the whole `.workflow/runs` tree costs one pass over files already on disk.
 */
export function ratesFromAllRuns(runsDir) {
  if (!existsSync(runsDir)) return {};
  const byModel = {};
  for (const run of readdirSync(runsDir)) {
    const stages = join(runsDir, run, 'stages');
    if (!existsSync(stages)) continue;
    collectInto(byModel, stages);
  }
  const out = {};
  for (const [model, samples] of Object.entries(byModel)) {
    const r = fitRates(samples);
    if (r) out[model] = r;
  }
  return out;
}

/** Every `modelUsage` row a run's stage logs recorded, as fitting samples keyed by model. */
export function ratesFromRun(stagesDir) {
  if (!existsSync(stagesDir)) return {};
  const byModel = {};
  collectInto(byModel, stagesDir);
  const out = {};
  for (const [model, samples] of Object.entries(byModel)) {
    const r = fitRates(samples);
    if (r) out[model] = r;
  }
  return out;
}

function collectInto(byModel, stagesDir) {
  for (const name of readdirSync(stagesDir).filter((n) => n.endsWith('.log'))) {
    let result = null;
    for (const line of readFileSync(join(stagesDir, name), 'utf8').split('\n')) {
      if (!line) continue;
      let m;
      try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'result') result = m;
    }
    for (const [model, u] of Object.entries(result?.modelUsage ?? {})) {
      if (u.costUSD == null) continue;
      (byModel[model] ??= []).push({
        out: u.outputTokens ?? 0,
        cacheRead: u.cacheReadInputTokens ?? 0,
        cacheWrite: u.cacheCreationInputTokens ?? 0,
        cost: u.costUSD,
      });
    }
  }
}
