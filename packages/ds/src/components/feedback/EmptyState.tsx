import React from 'react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The message. Blue types this `string`, because prod's empty states are one sentence and
   * nothing else — but §65 is that an empty state whose only content is a sentence is a dead
   * end, and the way out of it belongs *in* the state rather than under it. A node, so a
   * message can be followed by the action that fills the list.
   */
  children?: React.ReactNode;
  /** Alias for `children`; every call site in the app uses children instead. */
  message?: React.ReactNode;
  /** §28 — every other attribute reaches the wrapper; `style` merges over the painted one. */
}

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
}: EmptyStateProps) {
  return (
    <div {...rest} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
      <div style={{ marginTop: 150, fontFamily: 'var(--font-family-base)', fontSize: 20, color: 'var(--text-secondary)', letterSpacing: '0.8px', textAlign: 'center' }}>
        {children != null && children !== '' ? children : message}
      </div>
    </div>
  );
}
