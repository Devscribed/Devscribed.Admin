'use client';

/**
 * The one message that has to survive a navigation (03 §11.65).
 *
 * Deleting a candidate from their own card is the only action in hiring whose outcome
 * cannot be shown where it was taken: the card 404s the moment the flag is set, so the
 * screen that reports it is the list the member lands on. A toast raised and then
 * unmounted a frame later is a toast nobody reads.
 *
 * `sessionStorage`, not the query string, and the reason is the name. `?deleted=Jane%20Doe`
 * would put a candidate's name in the address bar, in browser history and in any link
 * copied out of it — for a message whose whole life is one page load. This tab, this
 * visit, read once and gone.
 *
 * Every access is guarded: a browser refusing storage loses the confirmation and nothing
 * else, which is the right thing to lose.
 */

const KEY = 'teammerly.hiring.candidateDeleted';

/** Left for the list the delete is about to land on. */
export function rememberDeletedCandidate(fullName: string): void {
  try {
    window.sessionStorage.setItem(KEY, fullName);
  } catch {
    // The delete still happened and the list still shows them gone.
  }
}

/**
 * The name left by a delete, if this arrival is the one that followed it.
 *
 * **Taken, not read**: a reload of the list a minute later is not the same event, and a
 * confirmation that reappeared on every visit would stop meaning anything.
 */
export function takeDeletedCandidate(): string | null {
  try {
    const name = window.sessionStorage.getItem(KEY);
    if (name !== null) window.sessionStorage.removeItem(KEY);
    return name;
  } catch {
    return null;
  }
}
