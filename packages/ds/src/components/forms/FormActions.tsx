import React from 'react';

export interface FormActionsProps {
  children?: React.ReactNode;
  /** Destructive action pinned to the left (switches the row to full width). */
  leading?: React.ReactNode;
  /** Cap for the right-aligned row. Default 240. */
  maxWidth?: number;
  align?: 'right' | 'left' | 'full';
  gap?: number;
}

/**
 * The button row that closes a form. AddProjectForm/AddTimeForm cap it at 240 and push it
 * right (`marginLeft:auto`), buttons splitting the width evenly; EditTimeForm goes full width
 * with a destructive button pushed left via `leading`.
 */
export function FormActions({ children, leading, maxWidth = 240, align = 'right', gap = 10 }: FormActionsProps) {
  const full = align === 'full' || !!leading;
  return (
    <div
      style={{
        display: 'flex', width: '100%', maxWidth: full ? '100%' : maxWidth,
        marginLeft: align === 'left' ? 0 : 'auto', gap,
        /* §63 — the row ends at the right edge.
           `full` widens the box to 100% and stops the slots stretching, and with nothing
           saying where they go a flex row packs them at the start: every dialog in the app
           drew `Cancel` and its primary against the *left* edge of a 520px modal. That is
           not what `full` was measured to mean — blue's own `full` call site pushes a
           destructive button left with `marginRight: auto`, which only reads as "pushed
           left" if everything beside it is otherwise right. `align="left"` is still the way
           to ask for the other thing, and `right` already ended right by way of the 240 cap
           plus `margin-left: auto`, so nothing that was correct moves. */
        justifyContent: align === 'left' ? 'flex-start' : 'flex-end',
      }}
    >
      {leading && <div style={{ marginRight: 'auto' }}>{leading}</div>}
      {/* `display: grid` stretches the child to fill the slot, which is what Button's own
          `width: '100%'` did for it before §1 removed that. */}
      {React.Children.map(children, (child) => (
        <div style={{ display: 'grid', flex: full ? '0 0 auto' : 1, minWidth: full ? 100 : 0 }}>{child}</div>
      ))}
    </div>
  );
}
