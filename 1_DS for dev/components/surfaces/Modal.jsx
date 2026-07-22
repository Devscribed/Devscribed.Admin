import React from 'react';

const Close = () => (
  <svg viewBox="0 0 14 14" width={14} height={14} fill="currentColor" aria-hidden>
    <path d="M7 8.05L1.75 13.3c-.15.15-.325.225-.525.225s-.375-.075-.525-.225a.71.71 0 010-1.05L5.95 7 .7 1.75a.71.71 0 010-1.05C.85.55 1.025.475 1.225.475s.375.075.525.225L7 5.95l5.25-5.25c.15-.15.325-.225.525-.225s.375.075.525.225.225.325.225.525-.075.375-.225.525L8.05 7l5.25 5.25c.15.15.225.325.225.525s-.075.375-.225.525-.325.225-.525.225-.375-.075-.525-.225L7 8.05z"/>
  </svg>
);

export function Modal({ open, title, onClose, actions, children, width = 420, style }) {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(36,31,26,.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, zIndex: 100,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: width,
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-modal)',
        padding: '24px 26px', ...style,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 18,
        }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--fs-20)',
            letterSpacing: '-.3px', color: 'var(--text)',
          }}>{title}</div>
          {onClose && (
            <button onClick={onClose} aria-label="Close" style={{
              border: 'none', background: 'transparent',
              color: 'var(--text-faint)', cursor: 'pointer', padding: 4, display: 'flex',
            }}><Close /></button>
          )}
        </div>
        {children}
        {actions && (
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>{actions}</div>
        )}
      </div>
    </div>
  );
}
