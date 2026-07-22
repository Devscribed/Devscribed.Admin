import React from 'react';

export function Tabs({ items = [], value, onChange, style }) {
  return (
    <div style={{
      display: 'flex', gap: 26,
      borderBottom: '1.5px solid var(--divider)', ...style,
    }}>
      {items.map((it) => {
        const v = typeof it === 'string' ? it : it.value;
        const l = typeof it === 'string' ? it : it.label;
        const active = v === value;
        return (
          <a key={v} href="#"
            onClick={(e) => { e.preventDefault(); onChange && onChange(v); }}
            style={{ textDecoration: 'none', cursor: 'pointer', paddingBottom: 12 }}>
            <span style={{
              display: 'block',
              fontFamily: 'var(--font-display)', fontWeight: active ? 600 : 500,
              fontSize: 'var(--fs-14)', letterSpacing: '.3px',
              color: active ? 'var(--text)' : 'var(--text-muted)',
              transition: 'color .15s',
            }}>{l}</span>
            <div style={{
              marginTop: 12, marginBottom: -1.5,
              height: 3, borderRadius: 3,
              background: active ? 'var(--accent)' : 'transparent',
            }} />
          </a>
        );
      })}
    </div>
  );
}
