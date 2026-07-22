import React from 'react';

const Wordmark = () => (
  <div style={{
    fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--fs-24)',
    letterSpacing: '-.5px', color: 'var(--text)',
  }}>
    Team<span style={{ color: 'var(--accent)' }}>merly</span>
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: 2,
      background: 'var(--amber-500)', marginLeft: 3, verticalAlign: 'middle',
    }} />
  </div>
);

export function AuthLayout({ title, subtitle, footer, style, children, ...rest }) {
  return (
    <div {...rest} style={{
      minHeight: '100vh', width: '100%', boxSizing: 'border-box',
      background: 'var(--bg)', padding: 'var(--sp-12) var(--sp-8)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 'var(--sp-10)',
      ...style,
    }}>
      <Wordmark />
      <div style={{
        width: '100%', maxWidth: 480, boxSizing: 'border-box',
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-card)',
        padding: 'var(--sp-16)',
      }}>
        {title && (
          <h1 style={{
            margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600,
            fontSize: 'var(--fs-22)', letterSpacing: '-.2px', color: 'var(--text)',
          }}>{title}</h1>
        )}
        {subtitle && (
          <p style={{
            margin: '6px 0 0', fontFamily: 'var(--font-text)', fontSize: 'var(--fs-14)',
            lineHeight: 'var(--lh-normal)', color: 'var(--text-muted)',
          }}>{subtitle}</p>
        )}
        <div style={{ marginTop: (title || subtitle) ? 'var(--sp-12)' : 0 }}>{children}</div>
      </div>
      {footer && (
        <div style={{
          fontFamily: 'var(--font-text)', fontSize: 'var(--fs-14)', color: 'var(--text-muted)',
        }}>{footer}</div>
      )}
    </div>
  );
}
