import React from 'react';
import { Sidebar } from '../navigation/Sidebar';
import { Navbar } from './Navbar';

export interface AppShellProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /** Active sidebar section title. */
  section?: string;
  /** Active sidebar sub-item title. */
  sub?: string | null;
  onSelect?: (section: string, sub?: string) => void;
  onLogoClick?: () => void;
  trackerCounter?: string;
  onOpenTracker?: () => void;
  userName?: string;
  onAccountNavigate?: (item: string) => void;
  /** Replaces the default `Sidebar` — pass one carrying this product's own `items`. */
  sidebar?: React.ReactNode;
  /** Replaces the default Navbar; pass null for no top bar. */
  navbar?: React.ReactNode;
  /**
   * Below `--layout-breakpoint-desktop` the rail is a drawer; this opens it. It has no effect
   * above the breakpoint, where the rail is always in view.
   */
  menuOpen?: boolean;
  /** Scrim click and the sidebar's own close button. */
  onMenuClose?: () => void;
  children?: React.ReactNode;
}

/**
 * The whole app frame: nav rail, top bar and the scrolling content well.
 * The well is the one place page padding (25px) and the page background (#f8fafc) are set —
 * screens render straight into `children` and own nothing outside their own content.
 *
 * §14 — a fixed 290px rail beside a 60/80px navbar, switching at `--layout-breakpoint-desktop`.
 * Every value in that switch is a token (`--layout-*`, `--shadow-drawer`), and the switch itself
 * lives in `base.css` rather than here: a media query cannot be an inline style, which is the
 * same reason `PageTitle` reaches for a class.
 *
 * Below the breakpoint the rail *becomes* the drawer — `MenuDrawer`'s geometry, applied to the
 * node that is already holding the navigation. Wrapping a second copy in a real `MenuDrawer`
 * would put two of every nav row in the document, and with them two of every `data-testid` and
 * two of every `aria-current`.
 */
export function AppShell({
  section, sub, onSelect, onLogoClick,
  trackerCounter, onOpenTracker, userName, onAccountNavigate,
  sidebar, navbar, menuOpen, onMenuClose, children, style, ...rest
}: AppShellProps) {
  const drawer = React.useRef<HTMLDivElement | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  /* Callers pass a fresh arrow every render; keeping the latest in a ref is what lets the
     effect below depend on `menuOpen` alone rather than re-running — and re-moving focus —
     on every render the drawer happens to be open for. */
  const close = React.useRef(onMenuClose);
  close.current = onMenuClose;

  /* §14 — the drawer sits before the navbar in document order, so a reader who opened it with
     the hamburger would Tab *past* the navigation they just asked for. Focus moves in with it
     and comes back out when it closes, and Escape leaves — the same three rules `Modal` needs
     for the same reason (§8). */
  React.useEffect(() => {
    if (!menuOpen) return undefined;
    opener.current = document.activeElement as HTMLElement | null;
    const first = drawer.current && drawer.current.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (first) first.focus({ preventScroll: true });
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape' && close.current) close.current(); };
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('keydown', escape);
      if (opener.current && opener.current.focus) opener.current.focus({ preventScroll: true });
    };
  }, [menuOpen]);

  return (
    <div {...rest} style={{ display: 'flex', height: '100vh', fontFamily: 'var(--font-family-base)', background: '#fff', ...style }}>
      <div ref={drawer} className="ds-app-shell-nav" data-open={menuOpen ? '' : undefined}>
        {sidebar !== undefined ? sidebar : (
          <Sidebar active={section} activeSub={sub} onSelect={onSelect} onLogoClick={onLogoClick} onClose={onMenuClose} />
        )}
      </div>
      {/* MenuDrawer's own scrim: a full-bleed click target under the panel, no paint of its own. */}
      {menuOpen && <div className="ds-app-shell-scrim" onClick={onMenuClose} />}
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0 }}>
        {navbar !== undefined ? navbar : (
          <Navbar trackerCounter={trackerCounter} onOpenTracker={onOpenTracker} userName={userName} onAccountNavigate={onAccountNavigate} />
        )}
        <div style={{ flexGrow: 1, overflowY: 'auto', background: '#f8fafc' }}>
          <div style={{ height: '100%', marginLeft: 'auto', marginRight: 'auto', width: '100%', padding: 25, boxSizing: 'border-box' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
