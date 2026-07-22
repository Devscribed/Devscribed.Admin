import React, { useState } from 'react';

const Magnify = () => (
  <svg viewBox="0 0 14 14" width={15} height={15} fill="currentColor" aria-hidden>
    <path d="M13.35 13.3562C13.2566 13.4481 13.131 13.4998 13 13.5C12.8672 13.4994 12.7397 13.448 12.6437 13.3562L9.94372 10.65C8.80659 11.6051 7.34462 12.0844 5.86273 11.9878C4.38083 11.8912 2.99343 11.2263 1.98988 10.1316C0.986331 9.03698 0.444121 7.59717 0.476333 6.11248C0.508545 4.62779 1.11269 3.21286 2.16277 2.16277C3.21286 1.11269 4.62779 0.508545 6.11248 0.476333C7.59717 0.444121 9.03698 0.986331 10.1316 1.98988C11.2263 2.99343 11.8912 4.38083 11.9878 5.86273C12.0844 7.34462 11.6051 8.80659 10.65 9.94373L13.35 12.6437C13.3972 12.6903 13.4347 12.7457 13.4603 12.8069C13.486 12.868 13.4991 12.9337 13.4991 13C13.4991 13.0663 13.486 13.1319 13.4603 13.1931C13.4347 13.2542 13.3972 13.3097 13.35 13.3562Z" />
  </svg>
);

export function SearchField({ style, ...rest }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ position: 'relative', ...style }}>
      <span style={{
        position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
        display: 'flex', color: 'var(--text-faint)', pointerEvents: 'none',
      }}><Magnify /></span>
      <input
        {...rest}
        onFocus={(e) => { setFocus(true); rest.onFocus && rest.onFocus(e); }}
        onBlur={(e) => { setFocus(false); rest.onBlur && rest.onBlur(e); }}
        placeholder={rest.placeholder || 'Search…'}
        style={{
          width: '100%', height: 'var(--field-h)', border: `1.5px solid ${focus ? 'var(--accent)' : 'var(--border-strong)'}`,
          borderRadius: 'var(--radius-lg)', padding: '0 12px 0 36px',
          fontFamily: 'var(--font-text)', fontSize: 'var(--fs-14)',
          background: 'var(--bg-field)', color: 'var(--text)', outline: 'none',
          boxShadow: focus ? 'var(--shadow-glow-accent)' : 'none',
          cursor: rest.disabled ? 'not-allowed' : 'text',
          opacity: rest.disabled ? 0.55 : 1,
          transition: 'border-color .15s, box-shadow .15s',
        }}
      />
    </div>
  );
}
