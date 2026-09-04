'use client';

import {
  APPLICATION_STATUSES,
  criterionFilterParam,
  parseCandidateScope,
  parseCriterionFilterParam,
  type ApplicationStatus,
  type CandidateScope,
  type CriterionFilter,
} from '@devscribed/validation';

/**
 * The candidate list's address — what is being asked, written where a browser can hold it
 * (03 §08.37, §09.53).
 *
 * The scope was the first thing to live here, and the reason it gave is the reason
 * everything else followed it: *"a link, a bookmark and a Back from a candidate card all
 * land on the tab they left"*. A Back from a candidate card that landed on the right tab
 * of an unfiltered list would still have thrown away the query the member spent four
 * controls building, and a filter drawer is not a thing anybody wants to fill in twice.
 *
 * So the **whole** question is in the query string: the scope, the search, the four
 * filters and the page. Three things fall out of that, and all three are wanted:
 *
 * - **Back from a card restores the list exactly**, because the card remembers an address
 *   rather than a screen ([`candidate-origin`](./candidate-origin.ts)).
 * - **A reload keeps the query.** A filter drawer wiped by an accidental refresh was
 *   always a small betrayal; it just had nowhere to be reported.
 * - **The query can be sent to somebody.** Spec 03 rules out *saved filter sets or
 *   shareable filter URLs beyond the query string* — this is the query string, which is
 *   the line that clause draws rather than the one it forbids.
 *
 * The URL is written with `history.replaceState`, never `router.replace`: nothing about
 * the page changes on the server, and pushing an entry per keystroke would make Back walk
 * the filter drawer rather than leave the screen.
 *
 * The parameters are **the endpoint's own**, spelled identically, so this module builds
 * the request as well as the address. Two builders would be two chances for the URL to
 * describe a list the server was never asked for.
 */

/** Per browser and per member's habit, in the shape `SlotPicker` established. */
export const CANDIDATE_SCOPE_KEY = 'teammerly.hiring.candidateScope';

/** Everything the list is asking, in the shape both the request and the URL take. */
export interface CandidateListAddress {
  scope: CandidateScope;
  /** The **applied** search, which is the debounced one — never what is mid-word. */
  search: string;
  statuses: ApplicationStatus[];
  vacancyIds: string[];
  categoryIds: string[];
  /** Empty in `mine`, where the interviewer is the viewer by definition (03 §09.48). */
  interviewerIds: string[];
  criteria: CriterionFilter[];
  page: number;
}

const EMPTY: CandidateListAddress = {
  scope: 'all',
  search: '',
  statuses: [],
  vacancyIds: [],
  categoryIds: [],
  interviewerIds: [],
  criteria: [],
  page: 1,
};

/**
 * The query, for the endpoint and for the address bar alike.
 *
 * Defaults are **absent**, never spelled out: `?scope=all&page=1` is the same list as no
 * query at all, and the canonical address of the list has to stay the address the rail
 * links to.
 */
export function candidateListQuery(address: CandidateListAddress): URLSearchParams {
  const params = new URLSearchParams();
  if (address.search.trim()) params.set('search', address.search.trim());
  for (const status of address.statuses) params.append('status', status);
  for (const id of address.vacancyIds) params.append('vacancyId', id);
  for (const id of address.categoryIds) params.append('categoryId', id);
  for (const id of address.interviewerIds) params.append('interviewerId', id);
  for (const filter of address.criteria) params.append('criterion', criterionFilterParam(filter));
  if (address.scope === 'mine') params.set('scope', address.scope);
  if (address.page > 1) params.set('page', String(address.page));
  return params;
}

/**
 * The list to open on, read once at mount from the query the **router** reports.
 *
 * The router's, not `window.location`'s, and the difference cost a test. A card's back
 * link hands its address to `router.push`, and during that transition this screen mounts
 * before `window.location.search` has caught up — so a list restored from `window` opened
 * empty and then wrote its own emptiness back over the address it had just been given.
 * `useSearchParams` is the value Next keeps in step with the route being rendered, which
 * is exactly the question being asked here. The caller passes it in, so this stays a
 * function of its argument and the hook stays on the screen.
 *
 * **Nothing here is validated against the organization**, and it must not be: an id from
 * another org, a criterion naming a deleted one, an operator a type does not answer — all
 * of them are the server's `422 invalid_filter` to give (03 §Validation), and a client
 * that quietly dropped them would show an unfiltered list under a URL that claimed
 * otherwise. The only things refused here are values that are not of the right *kind*,
 * because a `status` of `banana` names no column this screen can even draw a chip for.
 */
export function readCandidateListAddress(search: string): CandidateListAddress {
  try {
    const params = new URLSearchParams(search);
    const asked = params.get('scope');
    return {
      scope: asked !== null ? parseCandidateScope(asked) : rememberedScope(),
      search: params.get('search') ?? '',
      statuses: params
        .getAll('status')
        .filter((status): status is ApplicationStatus =>
          APPLICATION_STATUSES.includes(status as ApplicationStatus),
        ),
      vacancyIds: params.getAll('vacancyId'),
      categoryIds: params.getAll('categoryId'),
      interviewerIds: params.getAll('interviewerId'),
      criteria: params
        .getAll('criterion')
        .map(parseCriterionFilterParam)
        .filter((filter): filter is CriterionFilter => filter !== null),
      page: readPage(params.get('page')),
    };
  } catch {
    return EMPTY;
  }
}

/** The last scope this browser was left on, or the default when it will not say. */
function rememberedScope(): CandidateScope {
  try {
    return parseCandidateScope(window.localStorage.getItem(CANDIDATE_SCOPE_KEY));
  } catch {
    return 'all';
  }
}

/** A page that is not a whole number above zero is not a page anybody linked to. */
function readPage(raw: string | null): number {
  if (raw === null) return 1;
  const page = Number(raw);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/**
 * Puts the applied question in the address bar, and the applied scope in the member's
 * memory.
 *
 * **The whole address is given, path included**, rather than the query being spliced onto
 * whatever `window.location` currently reads. That is the write-side half of the read-side
 * rule above: during a client-side navigation the two disagree for a moment, and a query
 * spliced onto a path that had not caught up would `replaceState` the list's filters onto
 * the *candidate card's* address. The path this screen lives at is a constant, so there is
 * nothing to look up.
 *
 * The scope alone is remembered per browser: somebody who works in one scope should not be
 * returned to the other every morning, whereas a filter that outlived its afternoon would
 * be a list narrowed by a question nobody remembers asking.
 */
export function rememberCandidateList(href: string, scope: CandidateScope): void {
  try {
    window.history.replaceState(null, '', href);
  } catch {
    // A host that will not let the address be rewritten still shows the right list.
  }

  try {
    window.localStorage.setItem(CANDIDATE_SCOPE_KEY, scope);
  } catch {
    // The choice still applies to this visit; it simply will not be remembered.
  }
}

/** The list's own address, which is what both the URL and a card's back link want. */
export function candidateListHref(orgId: string, address: CandidateListAddress): string {
  const query = candidateListQuery(address).toString();
  return `/org/${orgId}/hiring/candidates${query ? `?${query}` : ''}`;
}
