import React from 'react';
import { CloseIcon } from '../icons/Icon';
import { useBreakpoint } from '../../useViewport';

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
  /**
   * The panel's actions. Below `sm` this is a **sticky footer** while the body scrolls under
   * it (design-system 01 §10.51); above `sm` it is the last block in the panel.
   */
  actions?: React.ReactNode;
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
 *
 * **Below `sm` it is a sheet, and there it is four rules** (design-system 01 §10.54-55): full
 * width, rounded at the top, capped at 92% of the screen, rising from the bottom rather than
 * sliding in from the side — and trapping focus, with `aria-modal`. The exception above was
 * argued from "the list behind it is still live". At 92% of a 360px screen nothing is behind it,
 * so the reason is gone at that width and only at that width.
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
  actions,
  className,
  style,
  children,
  ...rest
}: MenuDrawerProps) {
  /* §10.54 — below `sm` this is a sheet at 92% of the screen, so there is no live content
     behind it and the reason it does not trap focus is gone. At that width only, it traps and
     carries `aria-modal`. */
  const sheet = useBreakpoint() === 'xs';
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

    /* §10.54 — the trap, and only in the sheet form. `MenuDrawer`'s three rules are deliberately
       not `Modal`'s four (§51): this is a panel beside live content a reader may Tab out of. At
       92% of a 360px screen there is no live content behind it, so the exception's own reason is
       gone at that width and the fourth rule applies. Capture phase, wrapping both ways, like
       `useDialogFocus`. */
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panel.current) return;
      const focusable = Array.from(
        panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!panel.current.contains(active)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    if (sheet) document.addEventListener('keydown', trap, true);

    return () => {
      document.removeEventListener('keydown', escape);
      if (sheet) document.removeEventListener('keydown', trap, true);
      if (opener.current && opener.current.focus && document.contains(opener.current)) {
        opener.current.focus({ preventScroll: true });
      }
    };
  }, [open, sheet]);

  return (
    <React.Fragment>
      {open && <div className="ds-menu-drawer-scrim" style={top === undefined ? undefined : { top }} onClick={onClose} />}
      <div
        {...rest}
        ref={panel}
        className={['ds-menu-drawer', 'ds-sheet', className].filter(Boolean).join(' ')}
        /* §10.55 — `aria-modal` only in the sheet form, where it is true. Above `sm` this is a
           panel beside a live list that a reader may Tab out of, and saying otherwise would be a
           lie to a screen reader. */
        aria-modal={sheet ? true : undefined}
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
        {/* Head, body and actions rather than one padded scroller. Below `sm` the classes make
            the body the only thing that scrolls and pin the actions under it; above `sm` they
            carry no rules and the three simply stack in the column the panel already is. */}
        <div className="ds-sheet-head" style={{ padding: 'var(--space-9) var(--space-10) 0' }}>
          <button
            type="button"
            className="ds-dialog-close"
            aria-label={closeLabel}
            data-testid={closeTestId}
            onClick={onClose}
            style={{ display: 'flex', width: 13, height: 13, marginBottom: 'var(--space-7)', color: 'var(--text-secondary)' }}
          >
            <CloseIcon aria-hidden />
          </button>
        </div>
        <div className="ds-sheet-body" style={{ padding: '0 var(--space-10) var(--space-9)', flexGrow: 1, overflowY: 'auto' }}>
          {children}
        </div>
        {actions && (
          <div className="ds-sheet-actions" data-testid="sheet-actions">{actions}</div>
        )}
      </div>
    </React.Fragment>
  );
}
