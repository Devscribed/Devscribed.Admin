import React from 'react';

export function Card({ title, action, padded = true, children, style, ...rest }) {
  return (
    <div {...rest} style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-2xl)',
      boxShadow: 'var(--shadow-card)',
      overflow: 'hidden',
      ...style,
    }}>
      {(title || action) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '18px 24px 0',
        }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--fs-16)',
            letterSpacing: '-.2px', color: 'var(--text)',
          }}>{title}</div>
          {action}
        </div>
      )}
      <div style={{ padding: padded ? '20px 24px 24px' : 0 }}>{children}</div>
    </div>
  );
}
