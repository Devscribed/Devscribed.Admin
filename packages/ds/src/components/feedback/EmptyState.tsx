import React from 'react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The message. §65 — a node, not a string: an empty state whose only content is a sentence
   * is a dead end, and the way out of it belongs *in* the state rather than under it. A
   * message can be followed by the action that fills the list.
   */
  children?: React.ReactNode;
  /** Alias for `children`; every call site in the app uses children instead. */
  message?: React.ReactNode;
  /** §28 — every other attribute reaches the wrapper; `style` merges over the painted one. */
}

/**
 * EmptyState — a single centred grey message where a list would be. No illustration: an empty
 * list is a fact, not an occasion.
 *
 * `message` and `children` are the same slot. Children win when both are given.
 */
export function EmptyState({
  message = 'No data to display', children,
  /* §28 — everything reaches the wrapper. The only node on the screen saying why a list is
     empty is the one a test most needs to name, and the one that most often needs a `role`. */
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
