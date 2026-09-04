/**
 * The autosave loop behind the candidate card's notes and conclusion (04 §04).
 *
 * It lives in this package rather than in the web app for the reason the unit level
 * exists: the rules below — when a save fires, when it does not, and what a failure
 * stops — are the ones TC-H04-UNIT-02 pins down, and they are testable only away from
 * a rendered component. Nothing here touches the DOM or React; the screen supplies the
 * `save` function and renders whatever `onStateChange` reports.
 *
 * The four rules, all of them from someone typing during a live interview:
 *
 * 1. **Nothing saves while they are typing.** The countdown restarts on every
 *    keystroke, so a burst of typing produces one save, after it stops.
 * 2. **Saves never overlap.** Keystrokes arriving during a save are coalesced into a
 *    single following save rather than racing the one in flight.
 * 3. **A failure stops the loop.** A failing endpoint must not be retried every two
 *    seconds for the length of an interview. It resumes when the member retries, or
 *    when they edit again — which is itself a statement that they still want it saved.
 * 4. **An explicit save is immediate.** It flushes and cancels the pending countdown,
 *    because a member who pressed the button has stopped trusting the automatic one.
 */

/** Two seconds after typing stops (04 §04.16). */
export const AUTOSAVE_DELAY_MS = 2000;

export type AutosaveState =
  /** Nothing typed since the last write. */
  | 'idle'
  /** Edited, with a save due once the countdown elapses. */
  | 'pending'
  | 'saving'
  | 'saved'
  /** The last write failed. No further autosave fires until a retry or an edit. */
  | 'failed';

export interface AutosaveOptions<T> {
  /** Resolves when the write succeeded; rejects when it did not. */
  save: (value: T) => Promise<unknown>;
  /** Every transition, in order. The screen's only source of what to render. */
  onStateChange?: (state: AutosaveState) => void;
  delayMs?: number;
}

export interface Autosave<T> {
  /** A keystroke. Restarts the countdown and never writes immediately. */
  change(value: T): void;
  /** The Save button: writes now, cancelling any pending countdown. */
  flush(): Promise<void>;
  /** The retry beside a failure. Resumes the loop the failure stopped. */
  retry(): Promise<void>;
  /**
   * Seeds the loop with the value the server already holds — on mount, and after a
   * refetch. Nothing is written, and typing back to this value is not a change.
   */
  reset(value: T): void;
  /** Whether there is text the server has not accepted yet. */
  isDirty(): boolean;
  state(): AutosaveState;
  /** Drops the countdown. An in-flight save is left to finish. */
  cancel(): void;
}

export function createAutosave<T>(options: AutosaveOptions<T>): Autosave<T> {
  const delayMs = options.delayMs ?? AUTOSAVE_DELAY_MS;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let state: AutosaveState = 'idle';
  /** The most recent value seen, saved or not. */
  let current: T | undefined;
  /** The last value the server accepted, so an unchanged field is never re-sent. */
  let saved: T | undefined;
  /** Whether this loop has written anything, as opposed to merely being seeded. */
  let wrote = false;
  let saving = false;
  /** Set when a keystroke arrives mid-save — rule 2's single following save. */
  let queued = false;

  function moveTo(next: AutosaveState): void {
    if (state === next) return;
    state = next;
    options.onStateChange?.(next);
  }

  function cancelTimer(): void {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  function dirty(): boolean {
    return current !== undefined && current !== saved;
  }

  async function write(): Promise<void> {
    cancelTimer();
    // Nothing outstanding: an explicit save on untouched text must not manufacture a
    // request, nor a new "Saved" time for a write that never happened.
    if (!dirty()) return;
    if (saving) {
      // Rule 2. The in-flight write is left alone; this one becomes the write that
      // follows it, however many keystrokes arrive before then.
      queued = true;
      return;
    }

    const attempt = current as T;
    saving = true;
    moveTo('saving');
    let failure: unknown = null;
    try {
      await options.save(attempt);
      saved = attempt;
      wrote = true;
    } catch (error) {
      failure = error;
    }
    saving = false;

    if (failure !== null) {
      // Rule 3. `current` is untouched, so the editor keeps its text and a retry has
      // something to send. The countdown is not re-armed.
      queued = false;
      moveTo('failed');
      throw failure;
    }

    const deferred = queued;
    queued = false;
    if (deferred && dirty()) {
      // A write came due while that one was in flight. It runs now, once, carrying
      // every keystroke since — rather than being dropped or racing what just finished.
      await write();
      return;
    }
    // Still dirty with nothing deferred means the member is mid-burst and the
    // countdown is running; that is `pending`, not a save this loop owes anyone.
    moveTo(dirty() ? 'pending' : 'saved');
  }

  /** Swallowed on the automatic path: a failed autosave is a state, not an exception. */
  function writeQuietly(): void {
    void write().catch(() => undefined);
  }

  return {
    change(value: T): void {
      current = value;
      cancelTimer();
      if (!dirty()) {
        // Typed back to what the server already holds. Nothing to save, and no reason
        // to keep an error on screen about text that no longer exists.
        moveTo(saving ? 'saving' : wrote ? 'saved' : 'idle');
        return;
      }
      moveTo('pending');
      timer = setTimeout(writeQuietly, delayMs);
    },
    reset(value: T): void {
      cancelTimer();
      current = value;
      saved = value;
      queued = false;
      moveTo(wrote ? 'saved' : 'idle');
    },
    flush(): Promise<void> {
      return write();
    },
    retry(): Promise<void> {
      return write();
    },
    isDirty: dirty,
    state: () => state,
    cancel: cancelTimer,
  };
}
