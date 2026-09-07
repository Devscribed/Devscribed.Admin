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
 *
 * PATCH-018 — the message used to be pushed down by a 150px top margin, on the reasoning that
 * it should land where a full-page list's rows would have been. It made the state a different
 * shape everywhere the empty block is not a whole page: inside a modal, and under a screen that
 * has already drawn two tables above it, where the sentence ended up against the bottom of the
 * viewport with nothing near it. The state now centres in the box its caller gives it, with the
 * same vertical padding a loading block carries — the wait and the emptiness are the same box,
 * so replacing one with the other moves nothing.
 */
export function EmptyState({
  message = 'No data to display', children,
  /* §28 — everything reaches the wrapper. The only node on the screen saying why a list is
     empty is the one a test most needs to name, and the one that most often needs a `role`. */
  style, ...rest
}: EmptyStateProps) {
  return (
    <div {...rest} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-9) 0', ...style }}>
      <div style={{ /* @literal 0.8px is this one line's tracking */ fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-xl)', color: 'var(--text-secondary)', letterSpacing: '0.8px', textAlign: 'center' }}>
        {children != null && children !== '' ? children : message}
      </div>
    </div>
  );
}
