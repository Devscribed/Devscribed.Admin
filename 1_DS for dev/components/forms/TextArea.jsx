import React from 'react';

/* Blue's error message: absolute, 8px, 16px below the field — the same slot and geometry
   `TextInput` pins its own message into (§4), so the two fields never disagree about how far
   below them anything else may sit. */
const messageSlot = {
  position: 'absolute', fontSize: 8, bottom: -16, left: 0, whiteSpace: 'nowrap',
};

/**
 * TextArea — shared/forms/textAreas/TextArea: a `.form-control` textarea with an inline
 * 12px label above it and an absolutely-positioned 8px error message below.
 * TextArea.module.scss: .root{position:relative} .label{color:$appGray;margin-bottom:7px;
 * font-size:12px} textarea{width:100%;resize:none;height:100px}
 * .errorMessage{position:absolute;font-size:8px;bottom:-16px;left:0;color:$errorColor;
 * white-space:nowrap}. The rest comes from the global `.form-control` / `.errorInput`.
 */
export const TextArea = React.forwardRef(function TextArea({
  label, placeholder, value, onChange, error, errorId,
  /* §25 — blue forwards nothing, so `data-testid`, `name`, `required`, `readOnly` and every
     `aria-*` vanished before the DOM, and the `<label>` was associated with nothing. Both are
     `TextInput`'s §3 and §4, which this field is the twin of; it gets the same shape. */
  id, style, onFocus, onBlur, ...rest
}, ref) {
  const [focused, setFocused] = React.useState(false);
  const generatedId = React.useId();
  const fieldId = id || generatedId;
  return (
    <div style={{ position: 'relative' }}>
      {/* prod renders a plain <label> (display: inline), so its margin-bottom: 7px has no
          layout effect — the block-level textarea simply starts on the next line. */}
      {label && (
        <label htmlFor={fieldId} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 7, padding: '10px 0 0 10px' }}>{label}</label>
      )}
      <textarea
        {...rest}
        ref={ref}
        id={fieldId}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onFocus={(e) => { setFocused(true); if (onFocus) onFocus(e); }}
        onBlur={(e) => { setFocused(false); if (onBlur) onBlur(e); }}
        style={{
          display: 'block', width: '100%', height: 100, minHeight: 44, resize: 'none',
          fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-s)',
          color: 'var(--text-primary)', caretColor: 'var(--text-primary)', backgroundColor: '#fff',
          border: `1.5px solid ${error ? 'var(--status-error)' : focused ? 'var(--color-blue)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-l)', padding: 10, outline: 'none',
          boxShadow: error ? 'var(--shadow-error-glow)' : focused ? 'var(--shadow-focus-input)' : 'none',
          transition: 'var(--transition-border-focus)', boxSizing: 'border-box',
          ...style,
        }}
      />
      {/* §25 — `error` is the message itself rather than a boolean paired with `errorMessage`,
          which is the collapse §3 already made on `TextInput`: one prop cannot be set without
          the other, and only one of them could ever carry a node. */}
      {error && (
        <div style={{ ...messageSlot, color: 'var(--status-error)' }}>
          *<span id={errorId} data-testid={errorId}>{error}</span>
        </div>
      )}
    </div>
  );
});
