import React from 'react';
import { createPortal } from 'react-dom';
import { useHoverState } from '../../useViewport';

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
 *
 * PATCH-021 — and the bubble is a portal, `position: fixed`, measured off the trigger. Hung
 * inside the trigger's own box it was subject to every ancestor between it and the page: a
 * scroller clipped it at its edge, and a trigger only a few pixels wide squeezed it. It is
 * the same answer §95 gives `Select`'s listbox, for the same reason.
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
  const [open, setOpen] = useHoverState();
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const auto = React.useId();
  const tipId = id || `${auto}-tooltip`;
  const anchorRef = React.useRef<HTMLSpanElement | null>(null);
  const bubbleRef = React.useRef<HTMLSpanElement | null>(null);

  const show = () => {
    clearTimeout(timer.current!);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current!);
    setOpen(false);
  };
  React.useEffect(() => () => clearTimeout(timer.current!), []);

  /* §95 — the bubble is a **portal** into `document.body`, `position: fixed`, measured off
     the trigger's rectangle, which is the answer `Popover` and `Select`'s listbox already
     take. Drawn inside the trigger's own box it belonged to whatever the trigger sat in:
     any ancestor with an `overflow` other than `visible` clipped it, and an absolutely
     positioned trigger squeezed it to its own few pixels — a bubble beside a 14px marker in
     a scrolling grid came out cut mid-word.
     Re-placed on every scroll and resize while it is open. */
  const [pos, setPos] = React.useState<React.CSSProperties | null>(null);
  const place = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = bubbleRef.current ? bubbleRef.current.offsetWidth : 0;
    const height = bubbleRef.current ? bubbleRef.current.offsetHeight : 0;
    /* @literal 8px is the bubble's own gap from the trigger, and the margin it keeps from
       the window's edge. One number for both: the bubble never touches anything. */
    const gap = 8;
    /* Centred on the trigger, then held inside the window. A trigger against the right edge
       would otherwise put half its bubble outside it, which is where the clipping this
       replaced used to happen anyway. */
    const centre = (value: number, size: number, limit: number) =>
      Math.max(gap, Math.min(value - size / 2, limit - gap - size));
    if (placement === 'top' || placement === 'bottom') {
      setPos({
        left: centre(rect.left + rect.width / 2, width, window.innerWidth),
        ...(placement === 'top'
          ? { top: Math.max(gap, rect.top - gap - height) }
          : { top: rect.bottom + gap }),
      });
    } else {
      setPos({
        top: centre(rect.top + rect.height / 2, height, window.innerHeight),
        ...(placement === 'left'
          ? { left: Math.max(gap, rect.left - gap - width) }
          : { left: rect.right + gap }),
      });
    }
  }, [placement]);

  React.useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place, content]);

  /* Rendered through the body when there is one; on the server it stays in place, which is
     never painted anyway. */
  const mount = (node: React.ReactNode) =>
    typeof document !== 'undefined' ? createPortal(node, document.body) : node;

  return (
    <span
      {...rest}
      ref={anchorRef}
      style={{ position: 'relative', display: 'inline-flex', ...style }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {typeof children === 'function'
        ? children({ 'aria-describedby': content ? tipId : undefined })
        : children}
      {open && content && mount(
        <span
          role="tooltip"
          id={tipId}
          ref={bubbleRef}
          style={{
            position: 'fixed',
            ...(pos || {}),
            /* Invisible for the one paint before the layout effect has measured it —
               `opacity`, never `visibility`, which is the same window §55 names. */
            opacity: pos ? 1 : 0,
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
