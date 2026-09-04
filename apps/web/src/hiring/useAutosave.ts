'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createAutosave,
  saveFailedMessage,
  type Autosave,
  type AutosaveState,
} from '@devscribed/validation';

export interface UseAutosave {
  /** What the textarea renders. Never replaced by a save, successful or not. */
  value: string;
  state: AutosaveState;
  /** When the server last accepted a write, or null if it has not this session. */
  savedAt: Date | null;
  /** What the polite live region should say, or null for the routine case. */
  announced: string | null;
  change(next: string): void;
  save(): void;
  retry(): void;
  isDirty(): boolean;
  /**
   * The same question `isDirty()` answers, as a value a render can read.
   *
   * The loop is the authority on this and the unload guard asks it directly — but a guard is
   * called at a moment, and a Save button has to *look* right between moments. Nothing here
   * re-renders when the loop's own flag changes, so the fact is mirrored into state: the
   * value the field holds against the last one the server accepted.
   */
  dirty: boolean;
}

/**
 * The card's two text editors, wired to the autosave loop in `@devscribed/validation`.
 *
 * The hook owns three things the loop deliberately does not: the value the textarea
 * renders, the time of the last accepted write, and what gets announced aloud.
 *
 * Announcements follow 04 §09.40 — every failure and every explicit save, and no
 * routine autosave. A live region that spoke every two seconds would talk over the
 * interview it is there to help record; the visible indicator carries that case.
 *
 * The editor's text is React state and is never written from a response. A save that
 * fails leaves the field exactly as it was, cursor included, because nothing here ever
 * sets it from anywhere but a keystroke.
 */
export function useAutosave(options: {
  initial: string;
  save: (value: string) => Promise<{ savedAt: string }>;
}): UseAutosave {
  const [value, setValue] = useState(options.initial);
  // The last text the server took. Not the initial prop for the life of the editor: after
  // an autosave the field and the server agree again, and a Save button that stayed lit
  // would be offering a write that `run` below refuses to make.
  const [accepted, setAccepted] = useState(options.initial);
  const [state, setState] = useState<AutosaveState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [announced, setAnnounced] = useState<string | null>(null);

  // Read through a ref so the loop below is created once. Recreating it on every
  // keystroke would drop the pending countdown along with it.
  const save = useRef(options.save);
  save.current = options.save;

  /** True only for the write a member asked for by pressing Save or Retry. */
  const explicit = useRef(false);
  const loop = useRef<Autosave<string> | null>(null);

  if (loop.current === null) {
    loop.current = createAutosave<string>({
      save: async (next) => {
        // Read and cleared here so a failure cannot leave the flag set for whichever
        // autosave happens to come next.
        const asked = explicit.current;
        explicit.current = false;

        const result = await save.current(next);
        const at = new Date(result.savedAt);
        setAccepted(next);
        setSavedAt(at);
        if (asked) setAnnounced(`Saved at ${timeOf(at)}`);
      },
      onStateChange: (next) => {
        setState(next);
        if (next === 'failed') setAnnounced(saveFailedMessage());
      },
    });
    loop.current.reset(options.initial);
  }

  useEffect(() => {
    const current = loop.current!;
    return () => current.cancel();
  }, []);

  const change = useCallback((next: string) => {
    setValue(next);
    // A keystroke retracts a failure announcement: the member is already acting on it,
    // and a live region repeating itself through an interview is noise.
    setAnnounced(null);
    loop.current!.change(next);
  }, []);

  const run = useCallback(() => {
    const current = loop.current!;
    // Nothing outstanding: pressing Save on text the server already holds must not
    // manufacture a request, nor a fresh "Saved" time for a write that never happened.
    if (!current.isDirty()) return;
    explicit.current = true;
    // Failures reach the screen through `onStateChange`, so there is nothing to do
    // with the rejection here beyond keeping it off the console.
    void current.flush().catch(() => undefined);
  }, []);

  // Stable, so a page asking "is anything unsaved?" does not re-subscribe on every
  // keystroke.
  const isDirty = useCallback(() => loop.current!.isDirty(), []);

  return { value, state, savedAt, announced, change, save: run, retry: run, isDirty, dirty: value !== accepted };
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** 24-hour, like every other time on an internal screen. */
export const timeOf = (at: Date): string => `${pad(at.getHours())}:${pad(at.getMinutes())}`;
