import { readdirSync } from 'node:fs';

/**
 * Where a spec's bundle and its ledger live.
 *
 * One copy, because two would drift and both are used to decide things: the refine loop names
 * its ledger from the stem, and `wf init` looks that ledger up again to find out whether the
 * spec it is about to build was ever judged.
 */

/** The members of a bundle, whether or not each exists. */
export const bundleMembers = (spec) => {
  const base = spec.replace(/\.md$/, '');
  return [`${base}.contracts.md`, `${base}.cases.md`, `${base}.design.md`];
};

/**
 * Everything one repair may touch, which is wider than the bundle: the area README carries
 * blast radius and backward compatibility for every spec in it, and a spec's siblings carry
 * its mock and the renderings the mock is judged against. A gate that commits only the bundle
 * leaves those repairs uncommitted, and the next round is then judged against a range holding
 * half of what was repaired.
 *
 * Not for measuring growth — that is the bundle's line count and nothing else's.
 */
export const repairPaths = (spec) => {
  const norm = spec.replace(/\\/g, '/');
  const base = norm.replace(/\.md$/, '');
  const slash = base.lastIndexOf('/');
  const dir = slash === -1 ? '.' : base.slice(0, slash);
  const stem = base.slice(slash + 1);

  const siblings = [];
  try {
    for (const name of readdirSync(dir)) {
      if (name !== `${stem}.md` && name.startsWith(`${stem}.`)) siblings.push(`${dir}/${name}`);
    }
  } catch {
    /* the area does not exist yet */
  }
  return [...new Set([...bundleMembers(spec), ...siblings, `${dir}/README.md`])];
};

/** `specs/requests/02-client-participants.md` -> `requests-02` */
export function stemFor(spec) {
  const m = spec.replace(/\\/g, '/').match(/specs\/([^/]+)\/(\d+)/);
  return m ? `${m[1]}-${m[2]}` : spec.replace(/[^\w]+/g, '-');
}
