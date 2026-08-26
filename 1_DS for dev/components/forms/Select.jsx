import React, { useState, useRef, useEffect } from 'react';

const Chev = () => (
  <svg viewBox="0 0 12 8" width={12} height={8} fill="currentColor" style={{ transform: 'rotate(180deg)' }} aria-hidden>
    <path d="M5.99991 0.924943C5.89991 0.924943 5.80824 0.94161 5.72491 0.974943C5.64157 1.00828 5.55824 1.06661 5.47491 1.14994L0.524905 6.09994C0.391572 6.23328 0.329072 6.41244 0.337405 6.63744C0.345739 6.86244 0.416572 7.04161 0.549905 7.17494C0.716572 7.34161 0.895739 7.41244 1.08741 7.38744C1.27907 7.36244 1.44991 7.28328 1.59991 7.14994L5.99991 2.74994L10.3999 7.14994C10.5332 7.28328 10.7124 7.35828 10.9374 7.37494C11.1624 7.39161 11.3416 7.31661 11.4749 7.14994C11.6416 7.01661 11.7124 6.84161 11.6874 6.62494C11.6624 6.40828 11.5832 6.22494 11.4499 6.07494L6.5249 1.14994C6.44157 1.06661 6.35824 1.00828 6.2749 0.974943C6.19157 0.94161 6.09991 0.924943 5.99991 0.924943Z"/>
  </svg>
);

export function Select({ label, value, options = [], onChange, placeholder = 'Select…', error, disabled, style, wrapperStyle, ...rest }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const currentRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  // A long list opens scrolled to the top, which for a hundreds-of-rows picker means
  // opening nowhere near what is currently chosen.
  useEffect(() => {
    if (open && currentRef.current) currentRef.current.scrollIntoView({ block: 'nearest' });
  }, [open]);
  const borderColor = error ? 'var(--error-500)' : (open && !disabled ? 'var(--accent)' : 'var(--border-strong)');
  const current = options.find((o) => (typeof o === 'string' ? o : o.value) === value);
  const label2 = current ? (typeof current === 'string' ? current : current.label) : placeholder;
  // An option may be shown-but-unselectable: hiding an entry makes a missing one
  // indistinguishable from a bug, so the reason travels with it in `hint`.
  return (
    <div ref={ref} style={{ position: 'relative', ...wrapperStyle }}>
      {label && (
        <label style={{
          display: 'block', fontFamily: 'var(--font-display)', fontSize: 'var(--fs-11)',
          letterSpacing: 1, textTransform: 'uppercase',
          color: error ? 'var(--error-500)' : 'var(--text-muted)', marginBottom: 6,
        }}>{label}</label>
      )}
      <button
        type="button" disabled={disabled} onClick={() => !disabled && setOpen((v) => !v)} {...rest}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', height: 'var(--field-h-lg)',
          border: `1.5px solid ${borderColor}`, borderRadius: 'var(--radius-lg)',
          padding: '0 6px 0 12px',
          fontFamily: 'var(--font-text)', fontSize: 'var(--fs-15)',
          color: current ? 'var(--text)' : 'var(--text-muted)',
          background: 'var(--bg-field)', cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          transition: 'border-color .15s', ...style,
        }}>
        <span style={{ textAlign: 'left' }}>{label2}</span>
        <span style={{ padding: 8, color: 'var(--text-faint)', display: 'flex' }}><Chev /></span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 6,
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-pop)', zIndex: 30,
          // A long list scrolls inside the popover instead of running off the viewport;
          // a time-zone picker is hundreds of rows and would otherwise be unreachable.
          overflowY: 'auto', overflowX: 'hidden', maxHeight: 300,
          overscrollBehavior: 'contain',
        }}>
          {options.map((o) => {
            const v = typeof o === 'string' ? o : o.value;
            const l = typeof o === 'string' ? o : o.label;
            const hint = typeof o === 'string' ? null : o.hint;
            const off = typeof o === 'string' ? false : !!o.disabled;
            const testId = typeof o === 'string' ? undefined : o.testId;
            const isCurrent = v === value;
            return (
              <a key={v} href="#"
                ref={isCurrent ? currentRef : undefined}
                data-testid={testId}
                aria-disabled={off || undefined}
                onClick={(e) => { e.preventDefault(); if (off) return; onChange && onChange(v); setOpen(false); }}
                onMouseEnter={(e) => { if (!off) e.currentTarget.style.background = 'var(--hover-bg-tint)'; }}
                onMouseLeave={(e) => (e.currentTarget.style.background = isCurrent ? 'var(--accent-soft)' : 'transparent')}
                style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
                  padding: '10px 14px',
                  fontFamily: 'var(--font-text)', fontSize: 'var(--fs-14)',
                  textDecoration: 'none',
                  cursor: off ? 'not-allowed' : 'pointer',
                  color: off ? 'var(--text-faint)' : (isCurrent ? 'var(--accent)' : 'var(--text)'),
                  background: isCurrent ? 'var(--accent-soft)' : 'transparent',
                }}>
                <span>{l}</span>
                {hint && (
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--text-muted)' }}>{hint}</span>
                )}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
