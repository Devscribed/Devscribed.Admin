import React, { useId, useState } from 'react';

export function Textarea({ label, error, hint, trailing, rows = 4, id, style, wrapperStyle, ...rest }) {
  const [focus, setFocus] = useState(false);
  const generatedId = useId();
  const fieldId = id || generatedId;
  const borderColor = error ? 'var(--error-500)' : (focus ? 'var(--accent)' : 'var(--border-strong)');
  const ring = focus
    ? (error ? 'var(--shadow-glow-error)' : 'var(--shadow-glow-accent)')
    : 'none';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', ...wrapperStyle }}>
      {(label || trailing) && (
        // The label row is a row so `trailing` can sit at its far end — a saved-at
        // indicator, a character count — without displacing the field below it. It
        // keeps its height whether or not either side has anything in it, so text
        // appearing there never nudges what someone is typing into.
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          gap: 12, minHeight: 17, marginBottom: 6,
        }}>
          <label htmlFor={fieldId} style={{
            display: 'block',
            fontFamily: 'var(--font-display)', fontSize: 'var(--fs-11)', letterSpacing: 1,
            textTransform: 'uppercase',
            color: error ? 'var(--error-500)' : 'var(--text-muted)',
          }}>{label}</label>
          {trailing}
        </div>
      )}
      <textarea
        {...rest}
        id={fieldId}
        rows={rows}
        onFocus={(e) => { setFocus(true); rest.onFocus && rest.onFocus(e); }}
        onBlur={(e) => { setFocus(false); rest.onBlur && rest.onBlur(e); }}
        style={{
          width: '100%', resize: 'vertical',
          border: `1.5px solid ${borderColor}`, borderRadius: 'var(--radius-lg)',
          padding: '11px 12px',
          fontFamily: 'var(--font-text)', fontSize: 'var(--fs-15)',
          lineHeight: 'var(--lh-normal)', color: 'var(--text)',
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
