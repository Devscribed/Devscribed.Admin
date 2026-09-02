import React from 'react';
import { RequiredMark } from './FormField.jsx';

/* ::placeholder can't be an inline style; injected once into <head> rather than rendered as a
   sibling element, which would break consumers' adjacent-sibling and :nth-child rules. */
if (typeof document !== 'undefined' && !document.getElementById('ds-text-input-style')) {
  const el = document.createElement('style');
  el.id = 'ds-text-input-style';
  el.textContent = '.ds-text-input::placeholder { color: var(--text-secondary); opacity: 1; }';
  document.head.appendChild(el);
}

/* Blue's error message: absolute, 8px, `*`-prefixed, 16px below the field. `hint` (§4) takes the
   same slot and the same geometry deliberately — a hint that sat in flow would push the field
   below it every time an error replaced it, and a hint drawn larger than the error it swaps with
   would make the swap jump. One slot, one geometry, error wins when both are given. */
const messageSlot = {
  position: 'absolute', fontSize: 8, bottom: -16, left: 0, whiteSpace: 'nowrap',
};

/**
 * TextInput — labeled text field recreated from components/shared/forms/ValidationTextInput
 * and the global `.form-control` / `.input-label` / `.errorInput` rules in index.scss.
 */
export const TextInput = React.forwardRef(function TextInput({
  label, description, error, errorId, hint, hintId, trailing,
  placeholder, value, onChange, type = 'text',
  /* §3 — blue forwards nothing, so `data-testid`, `readOnly`, `autoFocus`, `onBlur`, `name`,
     `required` and every `aria-*` vanished before reaching the DOM. `id` is new here too: blue's
     <label> has no `htmlFor`, which is an accessibility gap rather than a measured choice. */
  id, style, onFocus, onBlur,
  /* §35 — style for the field's own box, which `...rest` and `style` cannot reach because they
     address the `<input>`. `Select` (§21) and `SearchInput` (§26) both grew this for the same
     reason and in the same words: a caller placing this field in a row is sizing that box, not
     the input inside it. The three are siblings and disagreed only because they were measured
     separately. */
  wrapperStyle, ...rest
}, ref) {
  const [focused, setFocused] = React.useState(false);
  const generatedId = React.useId();
  const inputId = id || generatedId;
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
    /* §5 — room for the trailing control, so a long value never runs under it. */
    paddingRight: trailing ? 44 : 10,
    outline: 'none',
    boxShadow: error ? 'var(--shadow-error-glow)' : focused ? 'var(--shadow-focus-input)' : 'none',
    transition: 'var(--transition-border-focus)',
    boxSizing: 'border-box',
    ...style,
  };
  const message = error
    ? <div style={{ ...messageSlot, color: 'var(--status-error)' }}>*<span id={errorId} data-testid={errorId}>{error}</span></div>
    : hint
      ? <div style={{ ...messageSlot, color: 'var(--text-secondary)' }}><span id={hintId}>{hint}</span></div>
      : null;
  return (
    <div style={wrapperStyle}>
      {label && (
        <label htmlFor={inputId} style={{ display: 'inline-block', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-xs)', lineHeight: '21px', color: 'var(--text-secondary)', marginBottom: 4, padding: '10px 0 0 10px' }}>
          {label}
          {/* §64 — `required` also reaches the `<input>` through `...rest`, which is what a
              reader is told; this is only what a reader is shown. */}
          {rest.required && <RequiredMark />}
        </label>
      )}
      <div style={{ position: 'relative', display: description ? 'grid' : 'block', gridTemplateColumns: description ? '40% 60%' : undefined, alignItems: 'center' }}>
        <input
          {...rest}
          ref={ref}
          id={inputId}
          className="ds-text-input"
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onFocus={(e) => { setFocused(true); if (onFocus) onFocus(e); }}
          onBlur={(e) => { setFocused(false); if (onBlur) onBlur(e); }}
          style={inputStyle}
        />
        {description && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minWidth: 50, fontSize: 12, color: '#4f4f4f', backgroundColor: 'var(--color-gray-light)', borderTopRightRadius: 'var(--radius-l)', borderBottomRightRadius: 'var(--radius-l)' }}>
            {description}
          </div>
        )}
        {/* §5 — the trailing slot sits over the field's own right padding. It is positioned
            against the input, so it is not combined with `description`, which splits the row
            into a grid. Nothing in the app uses both. */}
        {trailing && (
          <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
            {trailing}
          </span>
        )}
        {message}
      </div>
    </div>
  );
});
