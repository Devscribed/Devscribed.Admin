import React from 'react';

/* ::placeholder can't be an inline style; injected once into <head> rather than rendered as a
   sibling element, which would break consumers' adjacent-sibling and :nth-child rules. */
if (typeof document !== 'undefined' && !document.getElementById('ds-text-input-style')) {
  const el = document.createElement('style');
  el.id = 'ds-text-input-style';
  el.textContent = '.ds-text-input::placeholder { color: var(--text-secondary); opacity: 1; }';
  document.head.appendChild(el);
}

/**
 * TextInput — labeled text field recreated from components/shared/forms/ValidationTextInput
 * and the global `.form-control` / `.input-label` / `.errorInput` rules in index.scss.
 */
export function TextInput({ label, description, error, placeholder, value, onChange, type = 'text' }) {
  const [focused, setFocused] = React.useState(false);
  const inputStyle = {
    display: 'block',
    width: '100%',
    minHeight: 44,
    fontFamily: 'var(--font-family-base)',
    fontSize: 'var(--font-size-s)',
    color: 'var(--text-primary)',
    backgroundColor: '#fff',
    border: `1.5px solid ${error ? 'var(--status-error)' : focused ? 'var(--color-blue)' : 'var(--border-default)'}`,
    borderRadius: description ? 0 : 'var(--radius-l)',
    borderTopLeftRadius: 'var(--radius-l)',
    borderBottomLeftRadius: 'var(--radius-l)',
    borderTopRightRadius: description ? 0 : 'var(--radius-l)',
    borderBottomRightRadius: description ? 0 : 'var(--radius-l)',
    padding: 10,
    outline: 'none',
    boxShadow: error ? 'var(--shadow-error-glow)' : focused ? 'var(--shadow-focus-input)' : 'none',
    transition: 'var(--transition-border-focus)',
    boxSizing: 'border-box',
  };
  return (
    <div>
      {label && (
        <label style={{ display: 'inline-block', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-xs)', lineHeight: '21px', color: 'var(--text-secondary)', marginBottom: 4, padding: '10px 0 0 10px' }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative', display: description ? 'grid' : 'block', gridTemplateColumns: description ? '40% 60%' : undefined, alignItems: 'center' }}>
        <input
          className="ds-text-input"
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={inputStyle}
        />
        {description && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minWidth: 50, fontSize: 12, color: '#4f4f4f', backgroundColor: 'var(--color-gray-light)', borderTopRightRadius: 'var(--radius-l)', borderBottomRightRadius: 'var(--radius-l)' }}>
            {description}
          </div>
        )}
        {error && (
          <div style={{ position: 'absolute', fontSize: 8, bottom: -16, left: 0, color: 'var(--status-error)', whiteSpace: 'nowrap' }}>*{error}</div>
        )}
      </div>
    </div>
  );
}
