'use client';

import type { ReactNode } from 'react';
import { PageTitle } from '@devscribed/ds';

/**
 * The title block every screen inside the shell opens with. The heading itself is the system's
 * `PageTitle`, whose type steps 16 → 20 → 24px with the viewport; the subtitle and the
 * trailing action are this app's composition around it.
 *
 * Both the title and the subtitle take nodes rather than strings: the candidate card needs to
 * tag the name and the email inside them, and the heading level and its `page-title` belong to
 * the design system either way.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 'var(--space-7)',
        flexWrap: 'wrap',
        marginBottom: 'var(--space-7)',
      }}
    >
      <div>
        <PageTitle data-testid="page-title">{title}</PageTitle>
        {subtitle && (
          <div
            style={{
              marginTop: 'var(--space-1)',
              fontSize: 'var(--font-size-s)',
              color: 'var(--text-tertiary)',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}
