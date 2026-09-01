'use client';

import { parseCandidateScope, type CandidateScope } from '@devscribed/validation';

/**
 * Where the candidate list's scope comes from, and where it is kept (03 §08.36, §08.37).
 *
 * The scope is **navigation, not a filter**, and everything here follows from that. It
 * lives in the URL, so a link, a bookmark and a Back from a candidate card all land on
 * the tab they left. It is remembered per browser, so somebody who works in one scope is
 * not returned to the other every morning. And it survives `Clear filters`, because
 * clearing what narrows a list is not the same as changing which list is being narrowed.
 *
 * Kept out of the screen because the order of the three sources is the whole rule: the
 * URL wins over the memory, and the memory over the default — a shared `?scope=mine` must
 * open `mine` for a colleague whose last choice was `all`.
 */

/** Per browser and per member's habit, in the shape `SlotPicker` established. */
export const CANDIDATE_SCOPE_KEY = 'teammerly.hiring.candidateScope';

/**
 * The scope to open on, read once at mount.
 *
 * Read from `window` rather than from `useSearchParams`, because this is the only piece
 * of URL state the screen has and a hook that opts the route into dynamic rendering is a
 * high price for one string. A browser refusing storage, or a host with no URL to read,
 * still gets the default rather than an exception.
 */
export function initialCandidateScope(): CandidateScope {
  try {
    const asked = new URLSearchParams(window.location.search).get('scope');
    if (asked !== null) return parseCandidateScope(asked);
    return parseCandidateScope(window.localStorage.getItem(CANDIDATE_SCOPE_KEY));
  } catch {
    return 'all';
  }
}

/**
 * Puts the applied scope in the address bar and in the member's memory.
 *
 * `history.replaceState` rather than `router.replace`: nothing about the page changes on
 * the server, and pushing an entry would make Back walk the tab strip rather than leave
 * the screen. `all` clears the parameter instead of spelling out the default, so the
 * canonical address of the list stays the address the rail links to.
 */
export function rememberCandidateScope(scope: CandidateScope): void {
  try {
    const url = new URL(window.location.href);
    if (scope === 'mine') url.searchParams.set('scope', scope);
    else url.searchParams.delete('scope');
    window.history.replaceState(null, '', url.toString());
  } catch {
    // A host that will not let the address be rewritten still shows the right tab.
  }

  try {
    window.localStorage.setItem(CANDIDATE_SCOPE_KEY, scope);
  } catch {
    // The choice still applies to this visit; it simply will not be remembered.
  }
}
