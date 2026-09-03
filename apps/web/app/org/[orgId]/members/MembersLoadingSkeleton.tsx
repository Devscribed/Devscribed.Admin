'use client';

import type { CSSProperties } from 'react';

/**
 * Skeleton rows matching the table layout (spec 04 UI Notes / TC-04-E2E-09).
 *
 * The design system has no `Skeleton`, and this is one of the few places where that is an
 * omission rather than a decision — everything else that waits in this product uses
 * `Preloader` (§23, §69), and a list that already knows its own shape is the one case where
 * dots say less than an outline of what is coming. Repainted onto the system's tokens and
 * its `Table` geometry (§48: a one-line row is 70px), and left here until a second screen
 * wants it; on the day one does, it moves out.
 */
export function MembersLoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      data-testid="members-loading-skeleton"
      aria-busy="true"
      aria-label="Loading members"
      style={{
        background: 'var(--surface-card)',
        border: 'var(--border-width-hairline) solid var(--border-subtle)',
        borderRadius: 'var(--radius-l)',
        overflow: 'hidden',
      }}
    >
      <div style={{ height: 52, background: 'var(--color-gray-table-header)' }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-5)',
            minHeight: 70,
            padding: '0 var(--space-7)',
            borderTop: 'var(--border-width-hairline) solid var(--border-subtle)',
          }}
        >
          <span style={barStyle('38%', 12)} />
          <span style={barStyle('14%', 20, 'var(--radius-pill)')} />
          <span style={barStyle('26%', 12)} />
        </div>
      ))}
    </div>
  );
}

function barStyle(
  width: number | string,
  height: number,
  borderRadius: string = 'var(--radius-s)',
): CSSProperties {
  return {
    display: 'inline-block',
    width,
    height,
    borderRadius,
    background: 'var(--surface-sunken)',
  };
}
