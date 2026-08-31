import React from 'react';
import { Sidebar } from '../navigation/Sidebar.jsx';
import { Navbar } from './Navbar.jsx';

/**
 * The whole app frame: nav rail, top bar and the scrolling content well.
 * The well is the one place page padding (25px) and the page background (#f8fafc) are set —
 * screens render straight into `children` and own nothing outside their own content.
 */
export function AppShell({
  section, sub, onSelect, onLogoClick,
  trackerCounter, onOpenTracker, userName, onAccountNavigate,
  navbar, children,
}) {
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'var(--font-family-base)', background: '#fff' }}>
      <div style={{ flexShrink: 0, borderRight: '1px solid var(--border-subtle)' }}>
        <Sidebar active={section} activeSub={sub} onSelect={onSelect} onLogoClick={onLogoClick} />
      </div>
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
