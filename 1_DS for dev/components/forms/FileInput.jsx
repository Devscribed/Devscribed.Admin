import React from 'react';

/* Blue's error message: absolute, 8px, `*`-prefixed, 16px below the field — `TextInput`'s
   `messageSlot`, copied rather than shared because the two live in different files and the
   geometry is the point of the copy. `hint` takes the same slot for §4's reason: a hint that
   sat in flow would push the field below it every time an error replaced it. */
const messageSlot = {
  position: 'absolute', fontSize: 8, bottom: -16, left: 0, whiteSpace: 'nowrap',
};

/**
 * FileInput — §47. Nothing in blue accepts a file: prod uploads only an avatar, through a
 * cropper of its own, and offers every document as a row in a table. So this is **designed,
 * not measured** — but it is designed as `TextInput`'s sibling, and every value in it is
 * `TextInput`'s.
 *
 * The field box, the label, the focus and error treatments and the message slot are the same
 * ones `TextInput` draws, so a CV field in a column of text fields sits at the same height on
 * the same baseline with the same ring. What is different is only what a file field has to be:
 * a leading affordance where the value would start, blue's neutral `Button` treatment at 32px
 * (the height `IconButton` already takes inside a 44px field), and the chosen name after it.
 *
 * **The `<input type="file">` is the whole hit area**, laid transparently over the row rather
 * than hidden beside it. That is what makes this one control instead of three: a hidden input
 * with a `<button>` trigger gives the caller two tab stops for one field and puts the focus
 * ring on the half that is not focused, and forwarding a click from a `<div onClick>` is the
 * pattern §21, §22 and §26 all had to undo. Here the browser opens the picker on a click, on
 * `Enter` and on `Space`, with nothing scripted, and the focus state is read off the input and
 * painted on the row so a keyboard user can see where they are.
 *
 * **There is no clear control.** The one considered — a trailing cross, as yellow drew — has
 * no outcome worth an affordance: on the booking form a CV is required, so clearing it only
 * produces an invalid form that re-choosing would fix anyway, and on the manage page the
 * chooser exists to *replace* a CV that the API has no way to remove. It would also have to
 * sit above the input to be clickable, which is the hit area this control is built out of.
 */
export const FileInput = React.forwardRef(function FileInput({
  label, accept, fileName, fileNameTestId,
  chooseLabel = 'Choose file', emptyLabel = 'No file chosen',
  error, errorId, hint, hintId, disabled,
  /* `onSelect` hands back the `File` the browser gave, or `null` — the caller owns what a file
     means, exactly as `Calendar`'s does. A caller's own `onChange` still runs. */
  onSelect, onChange, onFocus, onBlur,
  /* `id` wires the label's `htmlFor`, falling back to `useId`; `style` addresses the `<input>`
     and `wrapperStyle` the box around it, which is §35's split on `TextInput`. */
  id, style, wrapperStyle, ...rest
}, ref) {
  const [focused, setFocused] = React.useState(false);
  const generatedId = React.useId();
  const inputId = id || generatedId;

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
        </label>
      )}
      <div style={{ position: 'relative' }}>
        {/* Decoration: everything it states, the input beneath it states to a reader — its
            label names it, its own value is the file it holds, and the message below is wired
            by the caller's `aria-describedby`. */}
        <div
          aria-hidden="true"
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
            width: '100%', minHeight: 44, padding: '0 6px',
            fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-s)',
            backgroundColor: '#fff',
            border: `1.5px solid ${error ? 'var(--status-error)' : focused ? 'var(--color-blue)' : 'var(--border-default)'}`,
            borderRadius: 'var(--radius-l)',
            boxShadow: error ? 'var(--shadow-error-glow)' : focused ? 'var(--shadow-focus-input)' : 'none',
            transition: 'var(--transition-border-focus)',
            opacity: disabled ? 0.6 : 1,
            boxSizing: 'border-box',
          }}
        >
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              height: 32, padding: '0 12px',
              border: '1.5px solid var(--border-default)', borderRadius: 'var(--radius-l)',
              backgroundColor: 'var(--surface-card)', color: 'var(--action-neutral-text)',
              fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-button)',
              boxSizing: 'border-box',
            }}
          >
            {chooseLabel}
          </span>
          <span
            data-testid={fileName ? fileNameTestId : undefined}
            style={{
              flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: fileName ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {fileName || emptyLabel}
          </span>
        </div>
        <input
          {...rest}
          ref={ref}
          id={inputId}
          type="file"
          accept={accept}
          disabled={disabled}
          onFocus={(e) => { setFocused(true); if (onFocus) onFocus(e); }}
          onBlur={(e) => { setFocused(false); if (onBlur) onBlur(e); }}
          onChange={(e) => {
            if (onChange) onChange(e);
            if (onSelect) onSelect((e.target.files && e.target.files[0]) || null);
          }}
          style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
            width: '100%', height: '100%',
            opacity: 0,
            cursor: disabled ? 'not-allowed' : 'pointer',
            zIndex: 1,
            ...style,
          }}
        />
        {message}
      </div>
    </div>
  );
});
