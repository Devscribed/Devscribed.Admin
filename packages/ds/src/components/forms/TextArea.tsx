import React from 'react';
import { RequiredMark } from './FormField';

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  /** §25 — the message under the field, `*`-prefixed and painted with the error treatment.
   *  A node, not a boolean: this is `TextInput`'s §3 collapse of `error` + `errorMessage`. */
  error?: React.ReactNode;
  /** §25 — id (and test id) for the error node, so it can be an `aria-describedby` target. */
  errorId?: string;
  /** §33 — a node at the trailing end of the **label row**: a character count, an autosave
   *  indicator. Not inside the field, which is `TextInput`'s answer (§5) — a multi-line field has
   *  no unambiguous right edge. The label row's height does not depend on the value, so an
   *  indicator can appear, change and leave without moving the field beneath it. */
  trailing?: React.ReactNode;
  /** §25 — every other attribute reaches the `<textarea>`; `style` merges over the painted one,
   *  and `id` also wires the label's `htmlFor`. Falls back to a generated id. */
}

/* The message slot: absolute, 8px, 16px below the field — the same slot and geometry
   `TextInput` pins its own message into (§4), so the two fields never disagree about how far
   below them anything else may sit. */
const messageSlot: React.CSSProperties = {
  position: 'absolute', fontSize: 8, bottom: -16, left: 0, whiteSpace: 'nowrap',
};

/**
 * TextArea — `TextInput`'s multi-line twin: the same 1.5px box, the same focus ring, the same
 * error treatment and the same message slot. It is 100px tall and does not resize, because a
 * handle that grows a field inside a dialog grows it past the dialog.
 */
export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({
  label, placeholder, value, onChange, error, errorId,
  /* §25 — everything reaches the `<textarea>`, and `id` wires the label's `htmlFor` so the
     two are actually associated. Both are `TextInput`'s §3 and §4; this field is its twin and
     takes the same shape. */
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
  /* The label's 7px margin has no layout effect on its own — it is inline, and the block-level
     textarea starts on the next line regardless. Inside the flex row below it *would* have one,
     so it is zeroed there: the field sits at the same y with a trailing node and without one,
     which is the whole reason the slot is in this row. */
  const labelNode = label ? (
    <label
      htmlFor={fieldId}
      style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: trailing ? 0 : 7, padding: '10px 0 0 10px' }}
    >
      {label}
      {rest.required && <RequiredMark />}
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
