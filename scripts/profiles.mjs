/**
 * profiles — which agents a stage runs, and on which models.
 *
 * A stage that offers more than one shape carries a `profiles` map and a `profile` naming the
 * default. Resolving it here rather than at each call site is what lets one run be told to go
 * one way and the next another, without an edit to the config between them: every caller takes
 * the same override argument and records the name it resolved.
 *
 * A stage with no `profiles` map is its own settings, unchanged. An override naming a profile
 * that does not exist throws rather than falling back — a run silently taking the default is a
 * run whose result cannot be attributed.
 */

export function stageProfile(cfg, stage, override = null) {
  const s = cfg.stages?.[stage] ?? {};
  if (!s.profiles) return { profile: null, ...s };
  const name = override ?? s.profile ?? Object.keys(s.profiles)[0];
  const p = s.profiles[name];
  if (!p) {
    throw new Error(`no ${stage} profile "${name}" — have ${Object.keys(s.profiles).join(', ')}`);
  }
  const { profiles, profile, ...rest } = s;
  return { profile: name, ...rest, ...p };
}
