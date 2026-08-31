import React from 'react';
import { MenuIcon } from '../icons/Icon.jsx';
import { MiniTracker } from './MiniTracker.jsx';
import { AccountMenu } from './AccountMenu.jsx';

/**
 * Top bar of the app shell: mini tracker on the left, account menu on the right.
 * PageTitle is commented out in prod's Navbar, so there is no heading here.
 * Pass `children` to put something between the two (it takes the free space).
 *
 * §15 — the height moves to `.ds-navbar` because prod is 80px on the desktop breakpoint and
 * 60px below it (`--layout-navbar-height-*`), and a media query cannot be an inline style.
 * `tracker` and `account` exist because prod is a time tracker and blue measured the one
 * navbar it had: a product with no timesheets has no counter to show, and the account row is
 * where a consuming app needs its own items and its own test hooks.
 */
export function Navbar({
  trackerCounter = '00:00:00', onOpenTracker, tracker = true, onMenuClick,
  account, userName, onAccountNavigate, children, className, style, ...rest
}) {
  return (
    <nav {...rest} className={['ds-navbar', className].filter(Boolean).join(' ')}
      style={{ width: '100%', flexShrink: 0, padding: '0 25px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', background: '#fff', ...style }}>
      {/* The drawer's opener. Hidden above the breakpoint by `.ds-navbar-menu`, where the rail
          is already in view — the counterpart to the sidebar's own close button. */}
      {onMenuClick && (
        <button type="button" className="ds-navbar-menu" aria-label="Open navigation"
          onClick={onMenuClick} style={{ marginRight: 'var(--space-6)', color: 'var(--text-secondary)' }}>
          <MenuIcon />
        </button>
      )}
      {tracker && <div style={{ marginLeft: -15 }}><MiniTracker counter={trackerCounter} onClick={onOpenTracker} /></div>}
      {children}
      <div style={{ marginLeft: 'auto' }}>
        {account !== undefined ? account : <AccountMenu name={userName} onNavigate={onAccountNavigate} />}
      </div>
    </nav>
  );
}
