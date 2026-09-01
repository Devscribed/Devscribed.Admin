import React from 'react';
import { CloseIcon } from '../icons/Icon.jsx';

/**
 * MenuDrawer — right-edge slide-in drawer recreated from components/shared/MenuDrawer.
 *
 * §51 — blue pins the panel at `top: 60px`, which is not a drawer offset at all: it is
 * `--layout-navbar-height-mobile`, written as a number because the recreation had one
 * viewport to recreate. Above 1200px this shell's navbar is 80px (§14), so the panel and
 * its scrim covered the last 20px of the header they were meant to hang from. The default
 * now tracks the shell's own navbar across the shell's own breakpoint — both tokens and
 * the switch already exist, and `base.css` reads them rather than naming a third value —
 * and `top` overrides it for a host whose header is something else.
 *
 * The rest is the same omission in the same place. Blue's drawer forwards nothing, so it
 * cannot be tagged or named; its close button is an icon with no accessible name; nothing
 * moves focus into a panel that has just covered the page, and `Escape` does not leave it.
 * `AppShell` needed all four the moment its rail *became* this drawer (§14) and got them
 * there — this is the same treatment, on the component that lends it the geometry, and
 * deliberately the same three rules rather than `Modal`'s four: like the rail, this panel
 * is one a reader may Tab out of.
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
}) {
  const panel = React.useRef(null);
  const opener = React.useRef(null);
  /* Callers pass a fresh arrow every render; keeping the latest in a ref is what lets the
     effect below depend on `open` alone rather than re-running — and re-moving focus — on
     every render the drawer happens to be open for. §14's own note, and it matters more
     here: the state this panel edits lives in the screen that renders it, so it re-renders
     on every keystroke inside it. */
  const close = React.useRef(onClose);
  close.current = onClose;

  React.useEffect(() => {
    if (!open) return undefined;
    opener.current = document.activeElement;
    const first = panel.current && panel.current.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (first) first.focus({ preventScroll: true });
    /* Escape on the bubble, and only when nothing inside has claimed it — a `Select` with
       an open listbox owns the key first and says so. §8's correction, which every
       dialog-shaped thing now takes. */
    const escape = (e) => { if (e.key === 'Escape' && !e.defaultPrevented && close.current) close.current(); };
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
        /* §51 — the panel is never unmounted, only translated off-screen, so everything in
           it stays in the tab order, in the accessibility tree and on the page while it is
           shut. Blue has no keyboard to have noticed with. `data-open` drives the slide and
           a `visibility` step that lands after it (`base.css`), exactly as §14's rail does;
           `inert` covers the 300ms in between, where the panel is still painted and already
           on its way out. Unmounting the children would answer all of it and lose the
           animation. */
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
