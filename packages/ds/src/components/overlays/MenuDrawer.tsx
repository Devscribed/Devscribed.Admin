import React from 'react';
import { CloseIcon } from '../icons/Icon';

export interface MenuDrawerProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
  /**
   * §51 — where the panel and its scrim start. Defaults to the shell's navbar height, which
   * switches with the shell's own breakpoint; pass a value only for a host whose header is not
   * that navbar.
   */
  top?: number | string;
  /** §51 — accessible name for the close button, which the component draws itself. */
  closeLabel?: string;
  /** §51 — `data-testid` for that button, for the same reason. */
  closeTestId?: string;
  children: React.ReactNode;
  /** §51 — every other attribute reaches the panel; `style` merges over the painted one. */
}

/**
 * MenuDrawer — the right-edge slide-in panel.
 *
 * §51 — **it hangs from the shell's navbar, not from a number.** A hard-coded `top: 60px` is
 * the mobile navbar height written as a literal, and above `--layout-breakpoint-desktop` the
 * navbar is 80px (§14) — so the panel and its scrim covered the last 20px of the header they
 * were meant to hang from. The default tracks `--layout-navbar-height-*` across that same
 * breakpoint, in `base.css` because a breakpoint cannot be an inline style, and `top` overrides
 * it for a host whose header is something else.
 *
 * Focus moves in when it opens and returns to the opener when it closes, and `Escape` leaves.
 * That is deliberately **three** rules rather than `Modal`'s four: focus is not trapped, because
 * like the shell's own rail this is a panel a reader may Tab out of into the page behind it.
 */
export function MenuDrawer({
  open,
  onClose,
  /** §51 — where the panel starts. Defaults to the shell's navbar height (`base.css`). */
  top,
  /** §51 — accessible name for the close button, which the component draws itself. */
  closeLabel = 'Close',
  /** §51 — `data-testid` for it, for the same reason. */
  closeTestId,
  style,
  children,
  ...rest
}: MenuDrawerProps) {
  const panel = React.useRef<HTMLDivElement | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  /* Callers pass a fresh arrow every render; keeping the latest in a ref is what lets the
     effect below depend on `open` alone rather than re-running — and re-moving focus — on
     every render the drawer happens to be open for. §61's argument, and it matters more here:
     the state this panel edits lives in the screen that renders it, so it re-renders on every
     keystroke inside it. */
  const close = React.useRef(onClose);
  close.current = onClose;

  React.useEffect(() => {
    if (!open) return undefined;
    opener.current = document.activeElement as HTMLElement | null;
    const first = panel.current && panel.current.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (first) first.focus({ preventScroll: true });
    /* Escape on the bubble, and only when nothing inside has claimed it — a `Select` with an
       open listbox owns the key first and says so. §8's rule, which every dialog-shaped thing
       in the system takes. */
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && close.current) close.current(); };
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('keydown', escape);
      if (opener.current && opener.current.focus && document.contains(opener.current)) {
        opener.current.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return (
    <React.Fragment>
      {open && <div className="ds-menu-drawer-scrim" style={top === undefined ? undefined : { top }} onClick={onClose} />}
      <div
        {...rest}
        ref={panel}
        className="ds-menu-drawer"
        /* §51 — the panel is never unmounted, only translated off-screen, so without help
           everything in it stays in the tab order and in the accessibility tree while it is
           shut. `data-open` drives the slide and a `visibility` step that lands after it
           (`base.css`), exactly as §14's rail does; `inert` covers the 300ms in between, where
           the panel is still painted and already on its way out. Unmounting the children would
           answer all of it and lose the animation. */
        data-open={open ? '' : undefined}
        inert={!open}
        style={{ ...(top === undefined ? null : { top }), ...style }}
      >
        <div style={{ padding: '25px 30px', flexGrow: 1, overflowY: 'auto' }}>
          <button
            type="button"
            aria-label={closeLabel}
            data-testid={closeTestId}
            onClick={onClose}
            style={{ display: 'flex', width: 13, height: 13, marginBottom: 20, color: 'var(--text-secondary)' }}
          >
            <CloseIcon aria-hidden />
          </button>
          {children}
        </div>
      </div>
    </React.Fragment>
  );
}
