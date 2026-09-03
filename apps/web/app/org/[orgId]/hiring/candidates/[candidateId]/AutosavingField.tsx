'use client';

import { useEffect, useRef, useState } from 'react';
import { HIRING_MESSAGES } from '@devscribed/validation';
import { Button, TextArea } from '@devscribed/ds';
import { timeOf, useAutosave } from '@/hiring/useAutosave';
import { useToast } from '@/toast';

/** How long "Saved just now" holds before it becomes a clock time (04 §UI Notes). */
const JUST_NOW_MS = 60_000;

/**
 * One plain-text field that saves itself — interview notes, or a conclusion.
 *
 * Everything about this component answers to one constraint: someone is on a live call
 * while typing into it. So the saved indicator sits in the label row, which reserves
 * its height whether or not it has text; a failed save is reported by a toast floating
 * over the page rather than by anything drawn under the field; and neither ever replaces
 * what is in the editor.
 *
 * The label row is `TextArea`'s `trailing` slot (decisions §33), which Phase 4 built one phase
 * early for the cancel dialog's character count — including the part that matters here, the
 * label's `margin-bottom` zeroed inside the row so the field sits at the same y with a
 * trailing node and without one.
 *
 * The indicator does not tick. It reads "Saved just now" for a minute and then changes
 * once to a clock time — a relative time counting upwards would be motion at the edge
 * of vision for the length of an interview.
 */
export function AutosavingField({
  label,
  testId,
  placeholder,
  rows,
  initial,
  save,
  registerDirty,
}: {
  label: string;
  /** `card-notes` or `card-conclusion` — the spec's prefix for this field's test ids. */
  testId: string;
  placeholder: string;
  rows: number;
  initial: string;
  save: (value: string) => Promise<{ savedAt: string }>;
  /** Lets the page ask, on navigation, whether anything is still unsaved. */
  registerDirty?: (isDirty: () => boolean) => () => void;
}) {
  /* The app's one toast queue: a failure is raised into it, and taken down again from it. */
  const { push, dismiss } = useToast();
  const editor = useAutosave({ initial, save });
  const [recent, setRecent] = useState(false);

  useEffect(() => {
    if (!editor.savedAt) return;
    setRecent(true);
    const timer = setTimeout(() => setRecent(false), JUST_NOW_MS);
    return () => clearTimeout(timer);
  }, [editor.savedAt]);

  useEffect(() => registerDirty?.(editor.isDirty), [registerDirty, editor.isDirty]);

  /**
   * The failure, as a toast that **stands**: `autoClose: 0`, because the plate carries the
   * retry and a retry that withdrew itself after a few seconds mid-interview would be a way
   * back that was there and then was not. It leaves when the retry is pressed (the plate
   * dismisses on any click inside it, the retry's included), when the × is pressed, or —
   * below — when the field stops being in a failed state by any other route: the `Save`
   * button under it, or an edit that restarts the autosave.
   *
   * Raised from an effect on the *state* rather than from the failing call, so a retry that
   * fails again raises a fresh plate for a fresh failure, and a success takes the old one
   * down whichever control produced it. `role="alert"` is the plate's own.
   */
  const failureToast = useRef<number | null>(null);
  const { retry } = editor;
  useEffect(() => {
    if (editor.state === 'failed') {
      failureToast.current = push({
        tone: 'error',
        // One id for both fields: it names the announcement, and the spec knows it by this.
        testId: 'card-save-error',
        autoClose: 0,
        message: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {HIRING_MESSAGES.card.saveFailed}
            <Button onClick={retry} data-testid="card-save-retry">
              {HIRING_MESSAGES.card.retry}
            </Button>
          </span>
        ),
      });
      return;
    }
    if (failureToast.current !== null) {
      dismiss(failureToast.current);
      failureToast.current = null;
    }
  }, [editor.state, push, dismiss, retry, testId]);

  // A field that unmounts — the section collapsed, the page left — takes its plate with it.
  useEffect(
    () => () => {
      if (failureToast.current !== null) dismiss(failureToast.current);
    },
    [dismiss],
  );

  return (
    <div>
      <TextArea
        label={label}
        rows={rows}
        placeholder={placeholder}
        value={editor.value}
        onChange={(event) => editor.change(event.target.value)}
        data-testid={`${testId}-input`}
        /*
         * The system pins its textarea at a flat 100px, which suits a comment
         * box and 100px is what it measures. `height: auto` hands the sizing back to `rows`,
         * which is the platform's own answer and the one the spec is written in — and it is
         * the whole reason the notes field is the tallest thing on the page while the
         * conclusion under it is not.
         */
        style={{ height: 'auto' }}
        /*
         * The indicator, in the label row (decisions §33). The row's height does not depend on
         * the value, and the label's `margin-bottom` is zeroed inside it, so this appears,
         * changes and empties without the field beneath it moving a pixel.
         *
         * The 12px `--text-secondary` it used to carry itself is the slot's own type now, so
         * only the test id and the no-wrap are left here.
         */
        trailing={
          <span data-testid={`${testId}-saved-at`} style={{ whiteSpace: 'nowrap' }}>
            {indicator(editor.state, editor.savedAt, recent)}
          </span>
        }
      />

      {/*
        The announcements, kept apart from the visible indicator on purpose. If the
        indicator itself were the live region, every autosave would be spoken — which
        over an hour-long interview is the noise 04 §09.40 rules out.
      */}
      <span aria-live="polite" data-testid={`${testId}-announcer`} style={VISUALLY_HIDDEN}>
        {editor.announced ?? ''}
      </span>

      {/*
        The explicit save, and it is the **primary** action of the block it closes. It was the
        neutral variant, which put the one button on this half of the card in the same paint as
        `View vacancy` up in the header — and left a member who does not trust an autosave with
        nothing on the screen that looks like the thing that saves.

        It is **disabled while there is nothing to save**, which is not a new rule: `useAutosave`
        has always refused a write for text the server already holds, so the button was
        promising work that would not happen. `dirty` is only that refusal, said out loud. A
        failed save leaves the editor dirty, so the toast's `Retry` is not the only way back.
      */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: 'var(--space-3)',
        }}
      >
        <Button
          variant="primary"
          onClick={editor.save}
          disabled={editor.state === 'saving' || !editor.dirty}
          // The design's own floor, so the button closing the notes field and the one
          // closing the conclusion are the same size rather than the width of their label.
          style={{ minWidth: 96 }}
          data-testid={`${testId}-save`}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function indicator(
  state: ReturnType<typeof useAutosave>['state'],
  savedAt: Date | null,
  recent: boolean,
): string {
  if (state === 'saving') return 'Saving…';
  // A failure is carried by the toast; repeating it up here would say the same thing
  // twice and leave no room for the last time a save did work.
  if (!savedAt) return '';
  return recent ? 'Saved just now' : `Saved ${timeOf(savedAt)}`;
}

/** Present to a screen reader, absent to everything else. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
} as const;
