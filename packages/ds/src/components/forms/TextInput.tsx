import React from 'react';
import { RequiredMark } from './FormField';

export interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  /** Grey suffix box fused to the right of the field (splits the row into a 40/60 grid). */
  description?: string;
  /** Message under the field, `*`-prefixed and painted with the error treatment. */
  error?: React.ReactNode;
  /** §4 — id (and test id) for the error node, so it can be an `aria-describedby` target. */
  errorId?: string;
  /** §4 — persistent help text. Shares the error's slot; the error wins when both are given. */
  hint?: React.ReactNode;
  /** §4 — id for the hint node, so it can be an `aria-describedby` target. */
  hintId?: string;
  /** §5 — control drawn inside the field's right edge, e.g. a password reveal toggle. */
  trailing?: React.ReactNode;
  /** §35 — style for the field's box; `...rest` and `style` address the `<input>`. The same
   *  slot `Select` (§21) and `SearchInput` (§26) carry, for the same reason. */
  wrapperStyle?: React.CSSProperties;
  type?: string;
  /** §3 — every other attribute reaches the `<input>`; `style` merges over the painted one, and
   *  `id` also wires the label's `htmlFor`. Falls back to a generated id. */
}

/* ::placeholder can't be an inline style; injected once into <head> rather than rendered as a
   sibling element, which would break consumers' adjacent-sibling and :nth-child rules. */
if (typeof document !== 'undefined' && !document.getElementById('ds-text-input-style')) {
  const el = document.createElement('style');
  el.id = 'ds-text-input-style';
  el.textContent = '.ds-text-input::placeholder { color: var(--text-secondary); opacity: 1; }';
  document.head.appendChild(el);
}

/* The message slot: absolute, 8px, `*`-prefixed for an error, 16px below the field. `hint` (§4)
   takes the same slot and the same geometry deliberately — a hint that sat in flow would push
   the field below it every time an error replaced it, and a hint drawn larger than the error it
   swaps with would make the swap jump. One slot, one geometry, error wins when both are given. */
const messageSlot: React.CSSProperties = {
  /* @literal 8px is deliberately off the type scale. It is the smallest text in the product and
     the only thing set at this size; putting it on the scale would invite something else to
     reach for it. */
  position: 'absolute', fontSize: 8, bottom: -16, left: 0, whiteSpace: 'nowrap',
};

/**
 * TextInput — the labelled text field, and the shape every other field in the system follows:
 * a 12px label inset 10px above a 44px box with a 1.5px border, `--shadow-focus-input` on focus
 * and `--shadow-error-glow` when the value is refused, over a message slot pinned below.
 */
export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(function TextInput({
  label, description, error, errorId, hint, hintId, trailing,
  placeholder, value, onChange, type = 'text',
  /* §3 — everything reaches the `<input>`: `data-testid`, `readOnly`, `autoFocus`, `onBlur`,
     `name`, `required` and every `aria-*`. `id` wires the label's `htmlFor` as well, so the
     label is actually the input's name rather than text that happens to sit above it. */
  id, style, onFocus, onBlur,
  /* §35 — style for the field's own box, which `...rest` and `style` cannot reach because they
     address the `<input>`. `Select` (§21) and `SearchInput` (§26) carry the same slot for the
     same reason: a caller placing a field in a row is sizing that box, not the input inside it.
     The three are siblings and agree by design. */
  wrapperStyle, ...rest
}, ref) {
  const [focused, setFocused] = React.useState(false);
  const generatedId = React.useId();
  const inputId = id || generatedId;
  const inputStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    minHeight: 'var(--control-height)',
    fontFamily: 'var(--font-family-base)',
    fontSize: 'var(--font-size-s)',
    color: 'var(--text-primary)',
    backgroundColor: 'var(--surface-card)',
    border: `var(--border-width-control) solid ${error ? 'var(--status-error)' : focused ? 'var(--color-blue)' : 'var(--border-default)'}`,
    borderRadius: description ? 0 : 'var(--radius-l)',
    borderTopLeftRadius: 'var(--radius-l)',
    borderBottomLeftRadius: 'var(--radius-l)',
    borderTopRightRadius: description ? 0 : 'var(--radius-l)',
    borderBottomRightRadius: description ? 0 : 'var(--radius-l)',
    padding: 'var(--space-4)',
    /* §5 — room for the trailing control, so a long value never runs under it. */
    /* @literal 44 is `--control-height` used as a width — the trailing slot is square — and is
       written as a number because it is a clearance, not a height. */
    paddingRight: trailing ? 44 : 'var(--space-4)',
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
        <label htmlFor={inputId} style={{ display: 'inline-block', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-xs)', lineHeight: 'var(--line-height-label)', color: 'var(--text-secondary)', marginBottom: 'var(--space-1)', padding: 'var(--space-4) 0 0 var(--space-4)' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minWidth: 50, fontSize: 'var(--font-size-xs)', /* @literal see `Checkbox` */ color: '#4f4f4f', backgroundColor: 'var(--color-gray-light)', borderTopRightRadius: 'var(--radius-l)', borderBottomRightRadius: 'var(--radius-l)' }}>
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
