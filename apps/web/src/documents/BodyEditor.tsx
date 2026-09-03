'use client';

import { useRef } from 'react';
import { Button } from '@devscribed/ds';

interface ToolbarAction {
  label: string;
  title: string;
  before: string;
  after: string;
}

/**
 * The mockup's toolbar. Each button wraps the selection (or drops an empty pair at the
 * caret) in the tag it names — every one of these is on the server's sanitizer
 * allow-list, so nothing the toolbar produces can be stripped on save.
 */
const ACTIONS: ToolbarAction[] = [
  { label: 'B', title: 'Bold', before: '<strong>', after: '</strong>' },
  { label: 'I', title: 'Italic', before: '<em>', after: '</em>' },
  { label: 'U', title: 'Underline', before: '<u>', after: '</u>' },
  { label: 'H1', title: 'Heading 1', before: '<h1>', after: '</h1>' },
  { label: 'H2', title: 'Heading 2', before: '<h2>', after: '</h2>' },
  { label: 'H3', title: 'Heading 3', before: '<h3>', after: '</h3>' },
  { label: '•', title: 'Bulleted list', before: '<ul>\n  <li>', after: '</li>\n</ul>' },
  { label: '1.', title: 'Numbered list', before: '<ol>\n  <li>', after: '</li>\n</ol>' },
  {
    label: '▤',
    title: 'Table',
    before: '<table>\n  <tbody>\n    <tr>\n      <td>',
    after: '</td>\n    </tr>\n  </tbody>\n</table>',
  },
  { label: '─', title: 'Horizontal rule', before: '<hr />', after: '' },
  {
    label: '⤓',
    title: 'Page break',
    before: '<div style="page-break-after:always"></div>',
    after: '',
  },
];

/**
 * A plain `<textarea>` rather than a contenteditable rich-text surface with inert
 * placeholder chips. A chip editor that never lets `{{key}}` be half-deleted is a real
 * piece of engineering, and a half-built one silently corrupts template bodies — which
 * is the one thing this feature cannot afford. The author edits the HTML directly; the
 * server sanitizes it on every save and hands back exactly what was stored.
 */
export function BodyEditor({
  value,
  readOnly,
  onChange,
}: {
  value: string;
  readOnly: boolean;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function apply(action: ToolbarAction): void {
    const area = ref.current;
    if (!area || readOnly) return;

    const start = area.selectionStart;
    const end = area.selectionEnd;
    const selected = value.slice(start, end);
    const next = `${value.slice(0, start)}${action.before}${selected}${action.after}${value.slice(end)}`;
    onChange(next);

    // Restore the caret inside the inserted tag rather than after it, so typing
    // continues where the author expects.
    const caret = start + action.before.length + selected.length;
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(caret, caret);
    });
  }

  return (
    <div
      style={{
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-l)',
        overflow: 'hidden',
        background: 'var(--surface-card)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-1)',
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-sunken)',
        }}
      >
        {ACTIONS.map((action) => (
          <Button
            key={action.title}
            type="button"
            title={action.title}
            aria-label={action.title}
            disabled={readOnly}
            onClick={() => apply(action)}
          >
            {action.label}
          </Button>
        ))}
      </div>

      <textarea
        ref={ref}
        value={value}
        readOnly={readOnly}
        data-testid="template-body-editor"
        aria-label="Template body"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        style={{
          display: 'block',
          width: '100%',
          minHeight: 380,
          border: 'none',
          outline: 'none',
          resize: 'vertical',
          padding: 'var(--space-6) var(--space-7)',
          fontFamily: 'var(--font-family-mono)',
          fontSize: 'var(--font-size-s)',
          lineHeight: 'var(--line-height-base)',
          color: 'var(--text-primary)',
          background: readOnly ? 'var(--surface-sunken)' : 'var(--surface-card)',
        }}
      />
    </div>
  );
}
