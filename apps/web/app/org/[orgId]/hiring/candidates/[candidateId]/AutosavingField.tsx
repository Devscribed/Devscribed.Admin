'use client';

import { useEffect, useState } from 'react';
import { HIRING_MESSAGES } from '@devscribed/validation';
import { Button, InfoBanner, TextArea } from '@/ds';
import { timeOf, useAutosave } from '@/hiring/useAutosave';

/** How long "Saved just now" holds before it becomes a clock time (04 §UI Notes). */
const JUST_NOW_MS = 60_000;

/**
 * One plain-text field that saves itself — interview notes, or a conclusion.
 *
 * Everything about this component answers to one constraint: someone is on a live call
 * while typing into it. So the saved indicator sits in the label row, which reserves
 * its height whether or not it has text; the failure banner appears *below* the field
 * rather than above it; and neither ever replaces what is in the editor.
 *
 * The label row is `TextArea`'s `trailing` slot (ledger §33), which Phase 4 built one phase
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
  const editor = useAutosave({ initial, save });
  const [recent, setRecent] = useState(false);

  useEffect(() => {
    if (!editor.savedAt) return;
    setRecent(true);
    const timer = setTimeout(() => setRecent(false), JUST_NOW_MS);
    return () => clearTimeout(timer);
  }, [editor.savedAt]);

  useEffect(() => registerDirty?.(editor.isDirty), [registerDirty, editor.isDirty]);

  const failed = editor.state === 'failed';

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
         * Blue pins its textarea at a flat 100px, because prod's one textarea is a comment
         * box and 100px is what it measures. `height: auto` hands the sizing back to `rows`,
         * which is the platform's own answer and the one the spec is written in — and it is
         * the whole reason the notes field is the tallest thing on the page while the
         * conclusion under it is not.
         */
        style={{ height: 'auto' }}
        /*
         * The indicator, in the label row (ledger §33). The row's height does not depend on
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

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: 'var(--space-3)',
        }}
      >
        <Button onClick={editor.save} data-testid={`${testId}-save`}>
          Save
        </Button>
      </div>

      {failed && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          {/*
            `role="alert"` rather than the page's own announcement slot: this belongs to one
            field, it appears under that field, and the member is looking at it. The page's
            banner under `PageHeader` reports what happened to the *page*.
          */}
          <InfoBanner variant="error" role="alert" data-testid="card-save-error">
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              {HIRING_MESSAGES.card.saveFailed}
              <Button onClick={editor.retry} data-testid="card-save-retry">
                {HIRING_MESSAGES.card.retry}
              </Button>
            </span>
          </InfoBanner>
        </div>
      )}
    </div>
  );
}

function indicator(
  state: ReturnType<typeof useAutosave>['state'],
  savedAt: Date | null,
  recent: boolean,
): string {
  if (state === 'saving') return 'Saving…';
  // A failure is carried by the banner below the field; repeating it up here would say
  // the same thing twice and leave no room for the last time a save did work.
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
