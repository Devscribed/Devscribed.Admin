import React from 'react';

export function Toggle({ options = [], value, onChange, style }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      background: 'var(--bg-sunken)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-pill)', padding: 3, ...style,
    }}>
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        const on = v === value;
        return (
          <button key={v} type="button" onClick={() => onChange && onChange(v)} style={{
            border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 'var(--fs-12)',
            padding: '5px 13px', borderRadius: 'var(--radius-seg)',
            background: on ? 'var(--bg-panel)' : 'transparent',
            color: on ? 'var(--text)' : 'var(--text-muted)',
            boxShadow: on ? 'var(--shadow-toggle)' : 'none',
          }}>{l}</button>
        );
      })}
    </div>
  );
}
