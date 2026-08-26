import React from 'react';

export function Card({ title, action, padded = true, clip = true, children, style, ...rest }) {
  return (
    <div {...rest} style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-2xl)',
      boxShadow: 'var(--shadow-card)',
      // Clipping is what rounds an edge-to-edge Table's square corners to the card's
      // radius — and it is also what cuts off any popover opened inside the card, since
      // a Select or a Combobox drops its list into the card's own box. A card that hosts
      // one turns it off.
      overflow: clip ? 'hidden' : 'visible',
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
