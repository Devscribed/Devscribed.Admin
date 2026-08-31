import React from 'react';
import { CloseIcon } from '../icons/Icon.jsx';

/**
 * MenuDrawer — right-edge slide-in drawer recreated from components/shared/MenuDrawer.
 */
export function MenuDrawer({ open, onClose, children }) {
  return (
    <React.Fragment>
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 2001 }} onClick={onClose} />}
      <div
        style={{
          backgroundColor: '#fff', width: 340, position: 'fixed', top: 60, right: 0, bottom: 0,
          zIndex: 2002, display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(105%)',
          transition: 'transform 0.3s', boxShadow: 'var(--shadow-drawer)',
        }}
      >
        <div style={{ padding: '25px 30px', flexGrow: 1, overflowY: 'auto' }}>
          <button onClick={onClose} style={{ display: 'flex', width: 13, height: 13, marginBottom: 20, color: 'var(--text-secondary)' }}><CloseIcon /></button>
          {children}
        </div>
      </div>
    </React.Fragment>
  );
}
