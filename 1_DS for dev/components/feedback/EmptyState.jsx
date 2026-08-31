import React from 'react';

/**
 * EmptyState — recreated from components/shared/EmptyStatePlaceholder
 * (a single centered gray message, no illustration in source).
 * Source takes the text as `children: string` — the `message` prop is kept as an alias, but
 * every call site in the app passes children, so children win when both are given.
 */
export function EmptyState({
  message = 'No data to display', children,
  /* §28 — blue forwards nothing, so `data-testid` and `role` never reached the DOM. The only
     node on the screen saying why a list is empty is the one a test most needs to name. */
  style, ...rest
}) {
  return (
    <div {...rest} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
      <div style={{ marginTop: 150, fontFamily: 'var(--font-family-base)', fontSize: 20, color: 'var(--text-secondary)', letterSpacing: '0.8px', textAlign: 'center' }}>
        {children != null && children !== '' ? children : message}
      </div>
    </div>
  );
}
