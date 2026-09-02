'use client';

import type { ReactNode } from 'react';

/**
 * Common page header for every report screen — spec reports/01 §Screens ·
 * Report shell. Renders `reports-page`, `reports-page-title`, `reports-page-sub`
 * and a right-side action group so the placeholder screens can share the same
 * chrome as the fully-implemented Amounts Owed screen.
 */
export function ReportShellHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      data-testid="reports-page"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 20,
        flexWrap: 'wrap',
        marginBottom: 16,
      }}
    >
      <div>
        <h1
          data-testid="reports-page-title"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'var(--fs-27)',
            letterSpacing: '-.6px',
            margin: '0 0 5px',
            color: 'var(--text)',
          }}
        >
          {title}
        </h1>
        {subtitle !== undefined && (
          <div
            data-testid="reports-page-sub"
            style={{ fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}
