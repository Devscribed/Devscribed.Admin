import React from 'react';

/**
 * Tooltip — §62. A dark bubble on hover and on focus, wrapping any trigger.
 *
 * **Designed, not measured**, with one qualification that matters to the push: prod has no
 * tooltip *component*, but it does have tooltips — two of its tables hand
 * `data-tooltip-content` to a library instance — so this is a shape the product already uses
 * and had never promoted, rather than a new idea. Every value is built out of tokens that
 * exist: `--text-primary` for the fill, white ink at `--font-size-xs`, `--radius-m`,
 * `--shadow-popover`, and the 200px cap that keeps a reason to about two lines.
 *
 * It exists because of the row it was written for. A blocked action must be **shown and
 * blocked** rather than hidden — an action that vanishes is indistinguishable from a bug —
 * and the reason it is blocked has to be readable by everyone the block applies to. A native
 * `title` is not that: no major browser opens one from the keyboard, so the one person who
 * cannot see why is the one who did not arrive with a pointer.
 *
 * The trigger keeps its own focusability, and points at the bubble through
 * `aria-describedby`. Pass a **function** as `children` to receive that attribute and put it
 * where it belongs; pass a node and the wrapper carries the relationship for it.
 *
 * `pointer-events: none` on the bubble, so it can never sit between a pointer and the thing
 * it is describing.
 */
export function Tooltip({
  content,
  placement = 'top',
  /** Long enough that a pointer crossing the row does not raise it. */
  delay = 200,
  maxWidth = 200,
  children,
  id,
  style,
  ...rest
}) {
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef(null);
  const auto = React.useId();
  const tipId = id || `${auto}-tooltip`;

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  React.useEffect(() => () => clearTimeout(timer.current), []);

  const pos = {
    top: { bottom: '100%', left: '50%', transform: 'translate(-50%, -8px)' },
    bottom: { top: '100%', left: '50%', transform: 'translate(-50%, 8px)' },
    left: { right: '100%', top: '50%', transform: 'translate(-8px, -50%)' },
    right: { left: '100%', top: '50%', transform: 'translate(8px, -50%)' },
  }[placement];

  return (
    <span
      {...rest}
      style={{ position: 'relative', display: 'inline-flex', ...style }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {typeof children === 'function'
        ? children({ 'aria-describedby': content ? tipId : undefined })
        : children}
      {open && content && (
        <span
          role="tooltip"
          id={tipId}
          style={{
            position: 'absolute',
            ...pos,
            zIndex: 2100,
            maxWidth,
            width: 'max-content',
            padding: '6px 10px',
            backgroundColor: 'var(--text-primary)',
            color: '#fff',
            borderRadius: 'var(--radius-m)',
            boxShadow: 'var(--shadow-popover)',
            fontFamily: 'var(--font-family-base)',
            fontSize: 'var(--font-size-xs)',
            lineHeight: '18px',
            textAlign: 'left',
            pointerEvents: 'none',
            whiteSpace: 'normal',
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
