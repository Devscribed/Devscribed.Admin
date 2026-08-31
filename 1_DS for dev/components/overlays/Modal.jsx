import React from 'react';
import { CloseIcon } from '../icons/Icon.jsx';

/**
 * Modal — centered dialog recreated from components/shared/Modal.
 * Opens by animating up from 80% to 50% vertical position with a fade.
 */
export function Modal({ title, open, onClose, children }) {
  const [closeHover, setCloseHover] = React.useState(false);
  if (!open) return null;
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1001, backgroundColor: 'var(--color-overlay-scrim)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          backgroundColor: '#fff', boxShadow: 'var(--shadow-modal)', padding: 24,
          border: '1px solid var(--border-default)', borderRadius: 'var(--radius-l)',
          maxWidth: '70%', minWidth: 360, maxHeight: '98%', overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-family-base)', fontWeight: 'var(--font-weight-semibold)', fontSize: 20, lineHeight: '24px', color: 'var(--text-tertiary)' }}>{title}</div>
          {/* .closeBtn svg{13x13; fill:$appGray; transition:transform .3s} :hover svg{scale(1.1)} */}
          <button onClick={onClose} onMouseEnter={() => setCloseHover(true)} onMouseLeave={() => setCloseHover(false)}
            style={{ display: 'flex', width: 13, height: 13, color: 'var(--text-secondary)', transform: closeHover ? 'scale(1.1)' : 'none', transition: 'transform 0.3s' }}>
            <CloseIcon />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
