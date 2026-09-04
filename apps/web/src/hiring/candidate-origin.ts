'use client';

/**
 * Which list a candidate card was opened from, so its back link can say so (04 §01.8).
 *
 * The card has three doors — the candidate database, a vacancy's board, and the calendar
 * invite's deep link — and only the first two are lists. A back link reading `Back` would
 * name no place at all, and one hard-coded to `Candidates` would send somebody who was
 * working a board to a screen they were not on.
 *
 * **The list records itself; the card reads the last record.** Every other shape was worse:
 * hooking each door means the row click, the row's `href`, the kebab's `View candidate` and
 * the reschedule action all have to remember separately, and the one that forgets is a back
 * link that lies. A screen that says where it is while it is there cannot be gone round.
 *
 * `sessionStorage`, not the query string, for the reason
 * [`candidate-deleted`](./candidate-deleted.ts) gives and one more of its own: the address
 * being remembered carries the list's **search term**, which may be a person's name, and
 * `?back=%2F…%3Fsearch%3DJane` would copy that into the card's own URL, its history entry
 * and every link shared out of it. This tab, this visit.
 *
 * Kept per organization, because the shell has an organization switcher: an address
 * remembered under one org is not a place the next one can go, and a back link into
 * somebody else's list would 404 at best.
 */

export interface CandidateOrigin {
  /** What the link says — `Board` or `Candidates`, never a bare "Back". */
  label: string;
  /** Where it goes, path and query, exactly as the list stood when it was left. */
  href: string;
}

const KEY = 'teammerly.hiring.candidateOrigin';

interface StoredOrigin extends CandidateOrigin {
  orgId: string;
}

/**
 * Called by a list while it is on screen, whenever its own address changes.
 *
 * Writing on arrival rather than on departure is what makes the filters survive: the
 * candidates list rewrites its query string as filters are applied
 * ([`candidate-list`](./candidate-list.ts)), so the last address recorded is the last one
 * the member actually looked at.
 */
export function rememberCandidateOrigin(orgId: string, origin: CandidateOrigin): void {
  try {
    const stored: StoredOrigin = { ...origin, orgId };
    window.sessionStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // The card still opens, and still offers the database as its way back.
  }
}

/**
 * The list to go back to, or `null` when this tab has not been on one.
 *
 * **Read, never taken.** A card is reloaded during an interview — the deep link is opened
 * twice, the page is refreshed after a dropped connection — and a back link that worked
 * once and then reverted to a different destination is worse than one that was always
 * generic.
 */
export function readCandidateOrigin(orgId: string): CandidateOrigin | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw === null) return null;
    const stored = JSON.parse(raw) as Partial<StoredOrigin>;
    if (stored.orgId !== orgId) return null;
    if (typeof stored.label !== 'string' || typeof stored.href !== 'string') return null;
    // Only ever a path inside this app: a stored value is not a place to take an
    // origin from, and `//evil.example` is a URL a bare `href` would honour.
    if (!stored.href.startsWith(`/org/${orgId}/`)) return null;
    return { label: stored.label, href: stored.href };
  } catch {
    return null;
  }
}
