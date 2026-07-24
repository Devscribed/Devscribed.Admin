'use client';

import type { ReactNode } from 'react';

/**
 * The title block every screen inside the shell opens with — Grotesk 27px, optional
 * subtitle, optional trailing action. Values follow the app template's page header.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 20,
        flexWrap: 'wrap',
        marginBottom: 22,
      }}
    >
      <div>
        <h1
          data-testid="page-title"
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
        {subtitle && (
          <div style={{ fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>{subtitle}</div>
        )}
      </div>
      {action}
    </div>
  );
}
