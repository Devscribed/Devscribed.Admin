import React from 'react';

/**
 * §62 — the dark bubble a blocked action gives its reason in. Shown on hover **and on focus**,
 * which is the whole point: a native `title` is not keyboard-reachable in any major browser,
 * so the one person who could not see why an action is blocked is the one without a pointer.
 */
export interface TooltipProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'content' | 'children'> {
  /** The reason. Nothing is drawn without it, so a conditional tooltip is `content={cond ? … : null}`. */
  content?: React.ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Milliseconds before it appears, so a pointer crossing the trigger does not raise it. */
  delay?: number;
  maxWidth?: number;
  /** Explicit id for the bubble, when the trigger has to name it itself. */
  id?: string;
  /**
   * A node, and the wrapper carries `aria-describedby` for it — or a function, which receives
   * `{ 'aria-describedby' }` to spread onto the real trigger.
   */
  children?: React.ReactNode | ((props: { 'aria-describedby'?: string }) => React.ReactNode);
}

/**
 * Tooltip — §62. A dark bubble on hover and on focus, wrapping any trigger.
 *
 * Every value is built from tokens that already exist: `--text-primary` for the fill, white ink
 * at `--font-size-xs`, `--radius-m`, `--shadow-popover`, and a 200px cap that holds a reason to
 * about two lines. Anything longer than two lines is a sentence that belongs on the page.
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
}: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const auto = React.useId();
  const tipId = id || `${auto}-tooltip`;

  const show = () => {
    clearTimeout(timer.current!);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current!);
    setOpen(false);
  };
  React.useEffect(() => () => clearTimeout(timer.current!), []);

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
            padding: 'var(--space-2) var(--space-4)',
            backgroundColor: 'var(--text-primary)',
            color: 'var(--text-on-accent)',
            borderRadius: 'var(--radius-m)',
            boxShadow: 'var(--shadow-popover)',
            fontFamily: 'var(--font-family-base)',
            fontSize: 'var(--font-size-xs)',
            lineHeight: 'var(--line-height-xs)',
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
