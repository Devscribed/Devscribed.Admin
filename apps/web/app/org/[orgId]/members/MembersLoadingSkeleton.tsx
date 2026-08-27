'use client';

import type { CSSProperties } from 'react';

/**
 * Skeleton rows matching the table layout (spec 04 UI Notes / TC-04-E2E-09). No
 * `Skeleton` primitive exists in the design system yet (see this spec's design doc,
 * DS gaps) — approximated here with static, token-colored placeholder bars rather
 * than inventing an animation the DS hasn't specified.
 */
export function MembersLoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      data-testid="members-loading-skeleton"
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-2xl)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: 52,
          background: 'var(--bg-header)',
        }}
      />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minHeight: 62,
            padding: '0 18px',
            borderTop: '1px solid var(--divider)',
          }}
        >
          <span style={barStyle(32, 32, '50%')} />
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
  borderRadius: string = 'var(--radius-xs)',
): CSSProperties {
  return {
    display: 'inline-block',
    width,
    height,
    borderRadius,
    background: 'var(--bg-header)',
  };
}
