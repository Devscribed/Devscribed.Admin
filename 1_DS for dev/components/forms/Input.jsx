import React, { useState } from 'react';

export function Input({ label, error, hint, style, wrapperStyle, ...rest }) {
  const [focus, setFocus] = useState(false);
  const borderColor = error ? 'var(--error-500)' : (focus ? 'var(--accent)' : 'var(--border-strong)');
  const ring = focus
    ? (error ? 'var(--shadow-glow-error)' : 'var(--shadow-glow-accent)')
    : 'none';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', ...wrapperStyle }}>
      {label && (
        <label style={{
          display: 'block',
          fontFamily: 'var(--font-display)', fontSize: 'var(--fs-11)', letterSpacing: 1,
          textTransform: 'uppercase',
          color: error ? 'var(--error-500)' : 'var(--text-muted)',
          marginBottom: 6,
        }}>{label}</label>
      )}
      <input
        {...rest}
        onFocus={(e) => { setFocus(true); rest.onFocus && rest.onFocus(e); }}
        onBlur={(e) => { setFocus(false); rest.onBlur && rest.onBlur(e); }}
        style={{
          height: 'var(--field-h-lg)', width: '100%',
          border: `1.5px solid ${borderColor}`, borderRadius: 'var(--radius-lg)',
          padding: '0 12px',
          fontFamily: 'var(--font-text)', fontSize: 'var(--fs-15)', color: 'var(--text)',
          background: 'var(--bg-field)', outline: 'none',
          boxShadow: ring, transition: 'border-color .15s, box-shadow .15s',
          cursor: rest.disabled ? 'not-allowed' : 'text',
          opacity: rest.disabled ? 0.55 : 1,
          ...style,
        }}
      />
      {(error || hint) && (
        <div style={{
          fontFamily: 'var(--font-text)', fontSize: 'var(--fs-12)',
          color: error ? 'var(--error-500)' : 'var(--text-muted)',
          marginTop: 5,
        }}>{error || hint}</div>
      )}
    </div>
  );
}
