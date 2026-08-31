import React from 'react';
import { MiniTracker } from './MiniTracker.jsx';
import { AccountMenu } from './AccountMenu.jsx';

/**
 * Top bar of the app shell: mini tracker on the left, account menu on the right.
 * PageTitle is commented out in prod's Navbar, so there is no heading here.
 * Pass `children` to put something between the two (it takes the free space).
 */
export function Navbar({ trackerCounter = '00:00:00', onOpenTracker, userName, onAccountNavigate, children }) {
  return (
    <nav style={{ width: '100%', height: 80, flexShrink: 0, padding: '0 25px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', background: '#fff' }}>
      <div style={{ marginLeft: -15 }}><MiniTracker counter={trackerCounter} onClick={onOpenTracker} /></div>
      {children}
      <div style={{ marginLeft: 'auto' }}><AccountMenu name={userName} onNavigate={onAccountNavigate} /></div>
    </nav>
  );
}
