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
 * The button row that closes a form. By default it is capped at 240px and pushed right, its
 * buttons splitting that width evenly; `leading` takes a destructive action and switches the
 * row to full width, pushing that one button to the far left of the others.
 */
export function FormActions({ children, leading, maxWidth = 240, align = 'right', gap = 10 }: FormActionsProps) {
  const full = align === 'full' || !!leading;
  return (
    <div
      style={{
        display: 'flex', width: '100%', maxWidth: full ? '100%' : maxWidth,
        marginLeft: align === 'left' ? 0 : 'auto', gap,
        /* §63 — the row ends at the right edge, in every alignment but `left`.
           `full` widens the box to 100% and stops the slots stretching, and with nothing
           saying where they go a flex row packs them at the start: every dialog drew `Cancel`
           and its primary against the *left* edge of a 520px modal. `leading` is the tell that
           this is wrong — pushing a destructive button left with `marginRight: auto` only
           reads as "pushed left" if everything beside it is otherwise right. `align="left"`
           is how to ask for the other thing. */
        justifyContent: align === 'left' ? 'flex-start' : 'flex-end',
      }}
    >
      {leading && <div style={{ marginRight: 'auto' }}>{leading}</div>}
      {/* `display: grid` stretches the child to fill the slot. This is the composition that
          decides a button's width, which is why `Button` itself does not (§1). */}
      {React.Children.map(children, (child) => (
        <div style={{ display: 'grid', flex: full ? '0 0 auto' : 1, minWidth: full ? 100 : 0 }}>{child}</div>
      ))}
    </div>
  );
}
