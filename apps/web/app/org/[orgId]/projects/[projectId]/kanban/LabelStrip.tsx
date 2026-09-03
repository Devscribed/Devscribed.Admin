'use client';

import type { CSSProperties } from 'react';
import { Chip } from '@devscribed/ds';
import type { TaskLabelChip } from './types';

/**
 * A task's labels, on the system's `Chip` (§20, §37).
 *
 * `LabelChip` is gone. It hand-drew a pill — background, border, radius, a colour dot, a bare
 * `<button>` for the cross — and every one of those is `Chip`'s already. The dot is the
 * interesting deletion: §20 gives every chip a **7px accent edge**, and a coloured square
 * beside a coloured edge is the same fact drawn twice. The label's colour is that edge now.
 *
 * The colour is still the one place a raw `#RRGGBB` is honoured, and it is not a token because
 * it is not the system's to choose — a person picked it, per label, in this organization's
 * settings.
 */
export function labelChipStyle(color: string): CSSProperties {
  return { borderLeftColor: color, maxWidth: 160 };
}

/**
 * The first `max` labels plus a `+N` for the rest. A layout, not a component: three chips and
 * a count is an arrangement of `Chip`, and there is nothing in it the system would own.
 *
 * Read-only — a card is a glance, and labels are edited on the task's own page.
 */
export function LabelStrip({
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
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
      {visible.map((label) => (
        <Chip
          key={label.id}
          label={label.name}
          data-testid={`${testIdPrefix}-${label.id}`}
          style={labelChipStyle(label.color)}
        />
      ))}
      {overflow > 0 && (
        <span
          style={{
            margin: 'var(--space-1)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--text-secondary)',
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
