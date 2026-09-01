import React from 'react';
import { IconButton } from '../core/IconButton.jsx';
import { CloseIcon } from '../icons/Icon.jsx';

/**
 * Toast / ToastHost — a transient confirmation, and the corner it stacks in.
 *
 * §54 — prod uses `react-toastify`, which blue did not recreate, so there is nothing to
 * measure and `InfoBanner` (§6, §7, §24) was standing in for it. That surrogate held while
 * a screen had exactly one thing to confirm and it could sit in the page: `InfoBanner` is a
 * static panel with no enter, no exit, no queue and no notion of time. The candidate
 * database is the first screen with several — a calendar was opened, an interview was
 * moved, another was called off — and a panel in the flow would push the table down under
 * the reader on each one.
 *
 * The paint is `InfoBanner`'s, not a second skin: the same 1px status line over the same
 * 10%-of-status fill, the same 16px mark, the same `--font-size-xs` in `--text-tertiary`,
 * and the same `IconButton` dismiss (§10, §24). What is genuinely new is the three things
 * a banner has never had to do:
 *
 * - **It arrives and it leaves.** 0.3s ease-in-out both ways — `--duration-hover` and
 *   `--ease-standard`, which is every other motion in blue — sliding in from the edge it
 *   is pinned to. A toast that appeared instantly and vanished instantly reads as a glitch
 *   rather than as a message.
 * - **It goes away by itself.** `duration` is a real prop with a real default, and the
 *   timer holds while the pointer is over the message or focus is inside it: a message
 *   somebody is reading must not be taken away mid-sentence.
 * - **They stack.** `ToastHost` is a column, oldest at the top, so a second action taken
 *   before the first has faded adds a line rather than replacing one. That is the whole
 *   argument for a host component: a single fixed slot would lose a message.
 *
 * The **queue is the caller's**, deliberately. This pair draws and times what it is given;
 * which messages exist and when they are dropped is application state, exactly as
 * `AppShell` takes `menuOpen`/`onMenuClose` rather than owning the drawer.
 *
 * **Must be pushed upstream as designed, not measured** — although only the motion and the
 * stacking are; the surface is `InfoBanner`'s, values unchanged.
 */

const tones = {
  info: { line: 'var(--status-info)', fill: 'var(--color-info-tint)' },
  success: { line: 'var(--status-success)', fill: 'rgba(39, 199, 154, 0.1)' },
  error: { line: 'var(--status-error)', fill: 'var(--color-error-tint)' },
};

/** How long a message stands before it withdraws itself. */
const DEFAULT_DURATION = 5000;
/** The enter and the exit, which must match `--duration-hover` in `base.css`. */
const MOTION_MS = 300;

export function Toast({
  tone = 'info',
  duration = DEFAULT_DURATION,
  /** Called once the exit has finished, so the caller drops it from its own queue. */
  onDismiss,
  dismissLabel = 'Dismiss',
  children,
  style,
  ...rest
}) {
  const paint = tones[tone] || tones.info;
  const [shown, setShown] = React.useState(false);
  const [held, setHeld] = React.useState(false);
  const leaving = React.useRef(false);

  // Mounted off-screen, then moved: a transition needs two frames to have anything to
  // interpolate between, and setting both in one commit paints the final state directly.
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const leave = React.useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    setShown(false);
    // The caller is told when the exit is over rather than when it starts, so the row is
    // still in the document while it slides out.
    setTimeout(() => onDismiss && onDismiss(), MOTION_MS);
  }, [onDismiss]);

  React.useEffect(() => {
    if (!duration || held) return undefined;
    const timer = setTimeout(leave, duration);
    return () => clearTimeout(timer);
  }, [duration, held, leave]);

  return (
    <div
      {...rest}
      /* `status` on each message rather than on the column: the host is the live region,
         and a nested one would announce the same arrival twice. */
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: 6,
        borderRadius: 'var(--radius-l)',
        border: `1px solid ${paint.line}`,
        backgroundColor: paint.fill,
        boxShadow: 'var(--shadow-popover)',
        overflow: 'hidden',
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateX(0)' : 'translateX(16px)',
        transition: `opacity var(--duration-hover) var(--ease-standard), transform var(--duration-hover) var(--ease-standard)`,
        ...style,
      }}
    >
      <span style={{ display: 'flex', width: 16, height: 16, color: paint.line }}>
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="8" opacity="0.15" /><rect x="7.1" y="6.5" width="1.8" height="6" rx="0.9" /><rect x="7.1" y="3.5" width="1.8" height="1.8" rx="0.9" /></svg>
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: 'var(--font-family-base)',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-tertiary)',
        }}
      >
        {children}
      </span>
      {onDismiss && (
        <IconButton label={dismissLabel} size={20} onClick={leave} style={{ flexShrink: 0, color: paint.line }}>
          <CloseIcon width="10" height="10" />
        </IconButton>
      )}
    </div>
  );
}

/**
 * The corner they stack in: fixed to the bottom-right, above every overlay, and a polite
 * live region so an arriving message is read without interrupting anything.
 *
 * It renders nothing at all while empty — an empty fixed box would still sit over the
 * bottom-right of every screen, and a pointer would find it there.
 */
export function ToastHost({ children, label, style, ...rest }) {
  const empty = React.Children.count(children) === 0;
  if (empty) return null;

  return (
    <div
      {...rest}
      role="status"
      aria-live="polite"
      aria-label={label}
      style={{
        position: 'fixed',
        right: 25,
        bottom: 25,
        /* Above `MenuDrawer` (2002) and its scrim: a confirmation raised from inside a
           panel has to be readable without closing the panel that raised it. */
        zIndex: 3000,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        width: 360,
        maxWidth: 'calc(100vw - 50px)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
