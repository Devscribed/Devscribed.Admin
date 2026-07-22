import React from 'react';

const Check = () => (
  <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12.5l4.5 4.5L19 6.5" />
  </svg>
);

export function Checkbox({ checked, onChange, label, disabled, style, ...rest }) {
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      fontFamily: 'var(--font-text)', fontSize: 'var(--fs-15)', color: 'var(--text-sub)',
      cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none',
      opacity: disabled ? 0.55 : 1, ...style,
    }} {...rest}>
      <span style={{
        width: 20, height: 20, borderRadius: 'var(--radius-xs)',
        background: checked ? 'var(--accent)' : 'var(--bg-field)',
        border: checked ? 'none' : '1.5px solid var(--border-strong)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', flexShrink: 0,
        transition: 'background .12s, border-color .12s',
      }}>
        {checked && <Check />}
      </span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange && onChange(e.target.checked)} disabled={disabled}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
      {label}
    </label>
  );
}
