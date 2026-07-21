import React from 'react';

export function NavItem({ icon, label, active, badge, arrow, style, ...rest }) {
  return (
    <a href="#" {...rest} style={{
      display: 'flex', alignItems: 'center',
      fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 'var(--fs-15)',
      color: active ? 'var(--accent)' : 'var(--text-sub)',
      background: active ? 'var(--accent-soft)' : 'transparent',
      border: `1px solid ${active ? 'var(--accent-border)' : 'transparent'}`,
      borderRadius: 'var(--radius-lg)', padding: '10px 12px', marginBottom: 6,
      textDecoration: 'none', cursor: 'pointer',
      transition: 'background .15s',
      ...style,
    }}
    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--hover-bg-tint)'; }}
    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
      {icon && <span style={{ display: 'flex', marginRight: 12, color: active ? 'var(--accent)' : 'var(--text-faint)', width: 20 }}>{icon}</span>}
      <span>{label}</span>
      {badge != null && (
        <span style={{
          marginLeft: 'auto', minWidth: 18, height: 18, padding: '0 5px',
          borderRadius: 'var(--radius-md)', background: 'var(--accent)', color: 'var(--on-accent)',
          fontFamily: 'var(--font-text)', fontSize: 'var(--fs-11)', fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{badge}</span>
      )}
      {arrow && (
        <span style={{
          marginLeft: badge != null ? 8 : 'auto', display: 'flex',
          transform: arrow === 'open' ? 'rotate(0deg)' : 'rotate(180deg)',
          color: 'var(--text-faint)', transition: 'transform .2s',
        }}>
          <svg viewBox="0 0 12 8" width={12} height={8} fill="currentColor" aria-hidden>
            <path d="M6 .9c-.1 0-.2 0-.3.1L.5 6c-.1.1-.2.3-.2.6 0 .2.1.4.2.5.2.2.4.3.6.2.2 0 .3-.1.5-.2L6 2.7l4.4 4.4c.1.1.3.2.5.2s.4-.1.5-.2c.2-.1.3-.3.2-.5 0-.2-.1-.4-.2-.5L6.5 1c-.1-.1-.2-.1-.3-.1z" />
          </svg>
        </span>
      )}
    </a>
  );
}
