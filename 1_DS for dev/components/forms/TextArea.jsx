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
  id, style, onFocus, onBlur,
  /* §33 — a node at the trailing end of the **label row**: a character count, an autosave
     indicator. It goes there rather than inside the field, which is `TextInput`'s answer (§5),
     because a multi-line field has no unambiguous right edge to pin anything to — the text
     reaches it on some lines and not others, and the scrollbar takes it when there is one.
     The label row is the one place above the field whose height does not depend on the value,
     which is what lets an indicator appear, change and leave without moving the field below it. */
  trailing,
  ...rest
}, ref) {
  const [focused, setFocused] = React.useState(false);
  const generatedId = React.useId();
  const fieldId = id || generatedId;
  /* prod renders a plain <label> (display: inline), so its margin-bottom: 7px has no layout
     effect — the block-level textarea simply starts on the next line. In the row below it would
     have one, so it is zeroed there: the field sits at the same y with a trailing node and
     without one, which is the whole reason the slot is in this row. */
  const labelNode = label ? (
    <label
      htmlFor={fieldId}
      style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: trailing ? 0 : 7, padding: '10px 0 0 10px' }}
    >
      {label}
    </label>
  ) : null;

  return (
    <div style={{ position: 'relative' }}>
      {trailing ? (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-5)' }}>
          {labelNode || <span />}
          <span style={{ flexShrink: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{trailing}</span>
        </div>
      ) : (
        labelNode
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
