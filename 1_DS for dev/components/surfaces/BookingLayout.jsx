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

export function BookingLayout({ wordmark, style, children, ...rest }) {
  return (
    <div {...rest} style={{
      minHeight: '100vh', width: '100%', boxSizing: 'border-box',
      background: 'var(--bg)',
      padding: 'var(--sp-16) var(--sp-10) var(--sp-24)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      ...style,
    }}>
      <div style={{
        width: '100%', maxWidth: 880, boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-12)',
      }}>
        {wordmark || <Wordmark />}
        <div style={{ width: '100%' }}>{children}</div>
      </div>
    </div>
  );
}
