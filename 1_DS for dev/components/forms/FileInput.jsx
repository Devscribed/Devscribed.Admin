import React, { useRef, useState } from 'react';
import { Button } from '../actions/Button.jsx';
import { IconButton } from '../actions/IconButton.jsx';

const Cross = () => (
  <svg viewBox="0 0 12 12" width={11} height={11} fill="currentColor" aria-hidden>
    <path d="M1.4 11.3 .7 10.6 5.3 6 .7 1.4 1.4.7 6 5.3 10.6.7l.7.7L6.7 6l4.6 4.6-.7.7L6 6.7 1.4 11.3Z" />
  </svg>
);

export function FileInput({
  label, error, hint, accept, chooseLabel = 'Choose file', clearLabel = 'Remove file',
  emptyLabel = 'No file chosen', fileName, fileNameTestId, onSelect, disabled,
  style, wrapperStyle, ...rest
}) {
  const input = useRef(null);
  const [focus, setFocus] = useState(false);
  const borderColor = error ? 'var(--error-500)' : (focus ? 'var(--accent)' : 'var(--border-strong)');

  const clear = () => {
    if (input.current) input.current.value = '';
    onSelect && onSelect(null);
  };

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
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-6)',
        minHeight: 'var(--field-h-lg)',
        border: `1.5px solid ${borderColor}`, borderRadius: 'var(--radius-lg)',
        padding: '0 6px 0 6px',
        background: 'var(--bg-field)',
        boxShadow: focus ? (error ? 'var(--shadow-glow-error)' : 'var(--shadow-glow-accent)') : 'none',
        transition: 'border-color .15s, box-shadow .15s',
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}>
        <Button
          type="button" variant="secondary" size="sm" disabled={disabled}
          onClick={() => input.current && input.current.click()}
        >{chooseLabel}</Button>
        <span data-testid={fileName ? fileNameTestId : undefined} style={{
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'var(--font-text)', fontSize: 'var(--fs-14)',
          color: fileName ? 'var(--text)' : 'var(--text-muted)',
        }}>{fileName || emptyLabel}</span>
        {fileName && !disabled && (
          <IconButton label={clearLabel} size={26} onClick={clear}><Cross /></IconButton>
        )}
        {/* The real control stays in the accessibility tree — it is what the label
            points at and what a test drives — but is never drawn. */}
        <input
          {...rest}
          ref={input}
          type="file"
          accept={accept}
          disabled={disabled}
          onFocus={(e) => { setFocus(true); rest.onFocus && rest.onFocus(e); }}
          onBlur={(e) => { setFocus(false); rest.onBlur && rest.onBlur(e); }}
          onChange={(e) => {
            const file = e.target.files && e.target.files[0];
            onSelect && onSelect(file || null);
          }}
          style={{
            position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
            overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
          }}
        />
      </div>
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
