import React from 'react';

/**
 * TextArea — shared/forms/textAreas/TextArea: a `.form-control` textarea with an inline
 * 12px label above it and an absolutely-positioned 8px error message below.
 * TextArea.module.scss: .root{position:relative} .label{color:$appGray;margin-bottom:7px;
 * font-size:12px} textarea{width:100%;resize:none;height:100px}
 * .errorMessage{position:absolute;font-size:8px;bottom:-16px;left:0;color:$errorColor;
 * white-space:nowrap}. The rest comes from the global `.form-control` / `.errorInput`.
 */
export function TextArea({ label, placeholder, value, onChange, error, errorMessage }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <div style={{ position: 'relative' }}>
      {/* prod renders a plain <label> (display: inline), so its margin-bottom: 7px has no
          layout effect — the block-level textarea simply starts on the next line. */}
      {label && (
        <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 7, padding: '10px 0 0 10px' }}>{label}</label>
      )}
      <textarea
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          display: 'block', width: '100%', height: 100, minHeight: 44, resize: 'none',
          fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-s)',
          color: 'var(--text-primary)', caretColor: 'var(--text-primary)', backgroundColor: '#fff',
          border: `1.5px solid ${error ? 'var(--status-error)' : focused ? 'var(--color-blue)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-l)', padding: 10, outline: 'none',
          boxShadow: error ? 'var(--shadow-error-glow)' : focused ? 'var(--shadow-focus-input)' : 'none',
          transition: 'var(--transition-border-focus)', boxSizing: 'border-box',
        }}
      />
      {error && errorMessage && (
        <span style={{ position: 'absolute', fontSize: 8, bottom: -16, left: 0, color: 'var(--status-error)', whiteSpace: 'nowrap' }}>{errorMessage}</span>
      )}
    </div>
  );
}
