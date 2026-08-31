import React from 'react';

const badgeVariants = {
  active: { backgroundColor: 'var(--status-success)', color: '#fff' },
  inactive: { backgroundColor: 'var(--status-error)', color: '#fff' },
  outlinedActive: { border: '1px solid var(--status-success)', color: 'var(--status-success)' },
  outlinedInactive: { border: '1px solid var(--color-error-outline)', color: 'var(--status-error)' },
};

/**
 * Badge — status pill recreated from components/shared/ActivityBadge.
 * Solid variants for active/inactive states; outlined variants for lower-emphasis contexts.
 */
export function Badge({ status = 'active', outlined, children }) {
  const key = outlined ? (status === 'active' ? 'outlinedActive' : 'outlinedInactive') : (status === 'active' ? 'active' : 'inactive');
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-s)',
        fontFamily: 'var(--font-family-base)',
        fontWeight: 'var(--font-weight-medium)',
        fontSize: 'var(--font-size-s)',
        lineHeight: '16px',
        padding: '4px 8px',
        ...badgeVariants[key],
      }}
    >
      {children ?? (status === 'active' ? 'Active' : 'Inactive')}
    </span>
  );
}
