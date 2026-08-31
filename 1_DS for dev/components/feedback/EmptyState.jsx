import React from 'react';

/**
 * EmptyState — recreated from components/shared/EmptyStatePlaceholder
 * (a single centered gray message, no illustration in source).
 * Source takes the text as `children: string` — the `message` prop is kept as an alias, but
 * every call site in the app passes children, so children win when both are given.
 */
export function EmptyState({ message = 'No data to display', children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ marginTop: 150, fontFamily: 'var(--font-family-base)', fontSize: 20, color: 'var(--text-secondary)', letterSpacing: '0.8px', textAlign: 'center' }}>
        {children != null && children !== '' ? children : message}
      </div>
    </div>
  );
}
