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

/** `specs/requests/02-client-participants.md` -> `requests-02` */
export function stemFor(spec) {
  const m = spec.replace(/\\/g, '/').match(/specs\/([^/]+)\/(\d+)/);
  return m ? `${m[1]}-${m[2]}` : spec.replace(/[^\w]+/g, '-');
}
