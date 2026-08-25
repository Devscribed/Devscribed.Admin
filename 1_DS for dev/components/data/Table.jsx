import React from 'react';

export function Table({ columns = [], rows = [], rowHref, rowTestId, onRowClick, style }) {
  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-2xl)', overflow: 'hidden', ...style,
    }}>
      <div style={{
        display: 'flex', height: 52, padding: '0 18px',
        background: 'var(--bg-header)',
        fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--fs-11)',
        letterSpacing: 1.2, textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}>
        {columns.map((c, i) => (
          <div key={i} style={{ flex: c.flex || 1, display: 'flex', alignItems: 'center', justifyContent: c.align || 'flex-start' }}>{c.label}</div>
        ))}
      </div>
      {rows.map((r, ri) => {
        // A linked row is a real anchor, so middle-click and copy-address work; the
        // caller intercepts onClick to keep navigation client-side.
        const href = typeof rowHref === 'function' ? rowHref(r) : rowHref;
        const Row = href ? 'a' : 'div';
        return (
        <Row key={r.id ?? ri}
          href={href || undefined}
          data-testid={typeof rowTestId === 'function' ? rowTestId(r) : rowTestId}
          onClick={onRowClick ? (e) => onRowClick(r, e) : undefined}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-bg-tint)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          style={{
            display: 'flex', minHeight: 62, padding: '0 18px', alignItems: 'center',
            borderTop: '1px solid var(--divider)',
            fontFamily: 'var(--font-text)', fontSize: 'var(--fs-15)', color: 'var(--text)',
            textDecoration: 'none',
            cursor: href || onRowClick ? 'pointer' : 'default',
            opacity: r.dim ? 0.65 : 1,
            transition: 'background .12s',
          }}>
          {columns.map((c, ci) => (
            <div key={ci} style={{
              flex: c.flex || 1, minWidth: 0, textAlign: c.align === 'flex-end' ? 'right' : (c.align === 'center' ? 'center' : 'left'),
              display: 'flex', justifyContent: c.align || 'flex-start', alignItems: 'center',
              fontFamily: c.mono ? 'var(--font-display)' : 'var(--font-text)',
              fontWeight: c.mono ? 600 : 400,
            }}>{typeof c.render === 'function' ? c.render(r) : r[c.key]}</div>
          ))}
        </Row>
        );
      })}
    </div>
  );
}
