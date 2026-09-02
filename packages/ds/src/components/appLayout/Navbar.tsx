import React from 'react';
import { MenuIcon } from '../icons/Icon';
import { MiniTracker } from './MiniTracker';
import { AccountMenu } from './AccountMenu';

export interface NavbarProps extends React.HTMLAttributes<HTMLElement> {
  trackerCounter?: string;
  onOpenTracker?: () => void;
  /** Draws the mini tracker. False in a product with no timesheets. Default true. */
  tracker?: boolean;
  /** Opens the navigation drawer below the breakpoint; draws the hamburger when given. */
  onMenuClick?: () => void;
  /** Replaces the default `AccountMenu`. */
  account?: React.ReactNode;
  userName?: string;
  onAccountNavigate?: (item: string) => void;
  /** Optional content between the tracker and the account menu. */
  children?: React.ReactNode;
}

/**
 * Top bar of the app shell: mini tracker on the left, account menu on the right. There is
 * deliberately no page heading here — the page owns its own `PageTitle`, one `<h1>` per screen.
 * Pass `children` to put something between the two (it takes the free space).
 *
 * §15 — the height lives in `.ds-navbar` rather than inline, because it is 80px above
 * `--layout-breakpoint-desktop` and 60px below it (`--layout-navbar-height-*`) and a media
 * query cannot be an inline style.
 *
 * `tracker` and `account` are both replaceable: a product with no timesheets has no counter to
 * show, and the account row is where a screen needs its own items and its own test hooks.
 */
export function Navbar({
  trackerCounter = '00:00:00', onOpenTracker, tracker = true, onMenuClick,
  account, userName, onAccountNavigate, children, className, style, ...rest
}: NavbarProps) {
  return (
    <nav {...rest} className={['ds-navbar', className].filter(Boolean).join(' ')}
      style={{ width: '100%', flexShrink: 0, padding: '0 var(--space-9)', display: 'flex', alignItems: 'center', borderBottom: 'var(--border-width-hairline) solid var(--border-subtle)', background: 'var(--surface-card)', ...style }}>
      {/* The drawer's opener. Hidden above the breakpoint by `.ds-navbar-menu`, where the rail
          is already in view — the counterpart to the sidebar's own close button. */}
      {onMenuClick && (
        <button type="button" className="ds-navbar-menu" aria-label="Open navigation"
          onClick={onMenuClick} style={{ marginRight: 'var(--space-6)', color: 'var(--text-secondary)' }}>
          <MenuIcon />
        </button>
      )}
      {tracker && <div style={{ /* @literal cancels the pill's own leading offset; the pair is one measurement */ marginLeft: -15 }}><MiniTracker counter={trackerCounter} onClick={onOpenTracker} /></div>}
      {children}
      <div style={{ marginLeft: 'auto' }}>
        {account !== undefined ? account : <AccountMenu name={userName} onNavigate={onAccountNavigate} />}
      </div>
    </nav>
  );
}
