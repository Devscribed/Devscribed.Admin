'use client';

import { useEffect, useState } from 'react';
import { HIRING_MESSAGES } from '@devscribed/validation';
import { Button, InfoBanner, Textarea } from '@/ds';
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
      <Textarea
        label={label}
        rows={rows}
        placeholder={placeholder}
        value={editor.value}
        onChange={(event) => editor.change(event.target.value)}
        data-testid={`${testId}-input`}
        trailing={
          <span
            data-testid={`${testId}-saved-at`}
            style={{
              fontFamily: 'var(--font-text)',
              fontSize: 'var(--fs-12)',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
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
          marginTop: 'var(--sp-4)',
        }}
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={editor.save}
          data-testid={`${testId}-save`}
        >
          Save
        </Button>
      </div>

      {failed && (
        <div style={{ marginTop: 'var(--sp-4)' }}>
          <InfoBanner tone="error" data-testid="card-save-error">
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
              {HIRING_MESSAGES.card.saveFailed}
              <Button
                variant="ghost"
                size="sm"
                onClick={editor.retry}
                data-testid="card-save-retry"
              >
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
