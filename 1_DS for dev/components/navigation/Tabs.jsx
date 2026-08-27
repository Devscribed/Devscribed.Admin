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
        const disabled = typeof it === 'string' ? false : !!it.disabled;
        const testId = typeof it === 'string' ? undefined : it.testId;
        const active = v === value;
        const label = (
          <span style={{
            display: 'block',
            fontFamily: 'var(--font-display)', fontWeight: active ? 600 : 500,
            fontSize: 'var(--fs-14)', letterSpacing: '.3px',
            color: disabled ? 'var(--text-faint)' : (active ? 'var(--text)' : 'var(--text-muted)'),
            transition: 'color .15s',
          }}>{l}</span>
        );
        const underline = (
          <div style={{
            marginTop: 12, marginBottom: -1.5,
            height: 3, borderRadius: 3,
            background: active ? 'var(--accent)' : 'transparent',
          }} />
        );
        // Disabled placeholder tabs (Projects/Roles/Payments today, Vacation until
        // spec 07) render as a non-interactive span — greyed label, no underline,
        // no click — rather than an anchor, so they can never fire `onChange`.
        if (disabled) {
          return (
            <span key={v} data-testid={testId} aria-disabled="true"
              style={{ paddingBottom: 12, cursor: 'not-allowed' }}>
              {label}{underline}
            </span>
          );
        }
        return (
          <a key={v} href="#" data-testid={testId}
            onClick={(e) => { e.preventDefault(); onChange && onChange(v); }}
            style={{ textDecoration: 'none', cursor: 'pointer', paddingBottom: 12 }}>
            {label}{underline}
          </a>
        );
      })}
    </div>
  );
}
