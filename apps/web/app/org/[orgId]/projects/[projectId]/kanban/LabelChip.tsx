'use client';

/**
 * Spec 14 §Task Cards / §Task Detail — Labels. A tiny reusable label pill:
 *   - color dot (server-supplied `#RRGGBB` — the ONE place hex is honored raw)
 *   - name (truncated when the row is tight)
 *   - optional trailing ✕ for the removable variant on the task detail sidebar.
 *
 * Everything else — the pill background, border, text color — is DS tokens.
 */

import type { CSSProperties } from 'react';
import { CloseIcon } from '@/layout/icons';
import type { TaskLabelChip } from './types';

export function LabelChip({
  label,
  onRemove,
  testId,
  removeTestId,
  size = 'sm',
}: {
  label: TaskLabelChip;
  onRemove?: () => void;
  testId?: string;
  removeTestId?: string;
  size?: 'sm' | 'md';
}) {
  const isMd = size === 'md';
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: isMd ? '3px 10px' : '2px 8px',
    borderRadius: 999,
    background: 'var(--bg-sunken)',
    border: '1px solid var(--divider)',
    fontFamily: 'var(--font-display)',
    fontSize: isMd ? 'var(--fs-12)' : 'var(--fs-11)',
    fontWeight: 500,
    color: 'var(--text-sub)',
    maxWidth: 160,
    lineHeight: 1.4,
  };
  return (
    <span data-testid={testId} style={style}>
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: label.color,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label.name}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          data-testid={removeTestId}
          aria-label={`Remove label ${label.name}`}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <CloseIcon size={10} />
        </button>
      )}
    </span>
  );
}

/**
 * Overflow-aware chip strip for task cards. Renders the first N chips plus a
 * "+M" pill; nothing responds to clicks — labels are read-only on cards.
 */
export function LabelChipStrip({
  labels,
  max = 3,
  testIdPrefix,
}: {
  labels: readonly TaskLabelChip[];
  max?: number;
  testIdPrefix: string;
}) {
  if (labels.length === 0) return null;
  const visible = labels.slice(0, max);
  const overflow = labels.length - visible.length;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        alignItems: 'center',
      }}
    >
      {visible.map((label) => (
        <LabelChip
          key={label.id}
          label={label}
          testId={`${testIdPrefix}-${label.id}`}
        />
      ))}
      {overflow > 0 && (
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'var(--fs-11)',
            color: 'var(--text-muted)',
            background: 'var(--bg-sunken)',
            borderRadius: 999,
            padding: '2px 8px',
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
