import React from 'react';
import { RequiredMark } from './FormField';
import { CloseIcon } from '../icons/Icon';

export interface FileInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onSelect'> {
  label?: string;
  /** Comma-separated extension or MIME list, straight onto the `<input>`. */
  accept?: string;
  /** The chosen file's name, owned by the caller. `null` draws `emptyLabel`. */
  fileName?: string | null;
  /** §47 — test id for that node, drawn only when there is a name to tag. */
  fileNameTestId?: string;
  /** §73 — the file's weight, already formatted. Drawn after the name, one ink quieter. */
  fileSize?: string;
  /** §73 — drops the chosen file. Omit and no cross is drawn. */
  onClear?: () => void;
  /** Accessible name for that cross. Defaults to `Remove {fileName}`. */
  clearLabel?: string;
  clearTestId?: string;
  /** Leading affordance's text. Default `Choose file`. */
  chooseLabel?: string;
  /** What the value slot reads before anything is chosen. Default `No file chosen`. */
  emptyLabel?: string;
  /** Message under the field, `*`-prefixed and painted with the error treatment. */
  error?: React.ReactNode;
  /** §4's shape — id (and test id) for the error node, so it can be described by. */
  errorId?: string;
  /** Persistent help text, **in flow** under the row. The error replaces it when both exist. */
  hint?: React.ReactNode;
  /** §4's shape — id for the hint node. */
  hintId?: string;
  /** The `File` the browser handed over, or `null`. A caller's own `onChange` still runs. */
  onSelect?: (file: File | null) => void;
  /** §35's split — `style` and `...rest` address the `<input>`, this the box around it. */
  wrapperStyle?: React.CSSProperties;
}

/**
 * FileInput — §47, **repainted by §73**.
 *
 * §47 drew it as `TextInput`'s sibling — a 44px field box with a 1.5px border, a leading 32px
 * chooser inside it and the file's name where a value would be — on the argument that a CV
 * field in a column of text fields should sit at the same height on the same baseline with the
 * same ring. What that produced is a control that **looks like a field you can type in and is
 * not one**: a bordered 44px box whose only interactive part is a button, next to three boxes
 * that take a caret.
 *
 * It is a row now: the chooser as a real `Button`, and beside it either the chosen file — name,
 * weight, and a cross to drop it — or the words that say there is none. Nothing about a file
 * field needs the box; what it needed the box for was to look like its neighbours, and it is
 * not one of them.
 *
 * **A `<label>` is the chooser**, not a `<button>` forwarding a click. The browser opens the
 * picker from a label with nothing scripted, which is what keeps this one control rather than
 * three, and it is `aria-hidden` so the field's *own* label stays the input's accessible name.
 * The input itself is visually hidden but **still focusable and still the labelled control**,
 * so there is exactly one tab stop, `Enter` and `Space` open the picker natively, and the ring
 * is read off the input and painted on the chooser — which is §47's argument, kept.
 *
 * **There is a clear control**, which §47 declined. Its reasoning was that clearing a required
 * CV only produces an invalid form. That is true and beside the point: a person who has
 * attached the wrong document wants it gone before they choose again, and the alternative is
 * re-choosing to overwrite a name they can still see. It is the last thing in the row, after
 * the name it removes.
 *
 * The message sits **in flow**, unlike `TextInput`'s absolutely-pinned slot (§4). That slot
 * exists so an error never moves the field; here the hint is permanent — the accepted formats
 * and the size cap are worth reading before a file is chosen, not after one is refused — and a
 * permanent message pinned outside the flow overlaps whatever is under it.
 */
export const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(function FileInput({
  label, accept, fileName, fileNameTestId, fileSize,
  chooseLabel = 'Choose file', emptyLabel = 'No file chosen',
  clearLabel, clearTestId, onClear,
  error, errorId, hint, hintId, disabled,
  /* `onSelect` hands back the `File` the browser gave, or `null` — the caller owns what a file
     means, exactly as `Calendar`'s `onSelect` does. A caller's own `onChange` still runs. */
  onSelect, onChange, onFocus, onBlur,
  /* `id` wires the label's `htmlFor`, falling back to `useId`; `style` addresses the `<input>`
     and `wrapperStyle` the box around it, which is §35's split on `TextInput`. */
  id, style, wrapperStyle, ...rest
}, ref) {
  const [focused, setFocused] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const generatedId = React.useId();
  const inputId = id || generatedId;

  const message = error
    ? (
      <div style={{ marginTop: 6, fontSize: 'var(--font-size-xs)', lineHeight: '18px', color: 'var(--status-error)' }}>
        *<span id={errorId} data-testid={errorId}>{error}</span>
      </div>
    )
    : hint
      ? (
        <div style={{ marginTop: 6, fontSize: 'var(--font-size-xs)', lineHeight: '18px', color: 'var(--text-secondary)' }}>
          <span id={hintId}>{hint}</span>
        </div>
      )
      : null;

  return (
    <div style={wrapperStyle}>
      {label && (
        <label htmlFor={inputId} style={{ display: 'inline-block', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-xs)', lineHeight: '21px', color: 'var(--text-secondary)', marginBottom: 4, padding: '10px 0 0 10px' }}>
          {label}
          {rest.required && <RequiredMark />}
        </label>
      )}

      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-5)' }}>
        {/* Visually hidden and still the control: focusable, labelled, and the thing the ring
            below is read off. Never `display: none`, which would take it out of the tab order
            and leave the picker reachable only by pointer. */}
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
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, ...style }}
        />

        {/* `aria-hidden`, so the field's own label stays the input's accessible name rather
            than being concatenated with the word on the chooser. */}
        <label
          htmlFor={inputId}
          aria-hidden="true"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            height: 'var(--control-height)', padding: '0 18px',
            backgroundColor: 'var(--surface-card)',
            border: `var(--border-width-control) solid ${error ? 'var(--status-error)' : 'var(--border-default)'}`,
            borderRadius: 'var(--radius-l)',
            fontFamily: 'var(--font-family-base)', fontSize: 16,
            fontWeight: 'var(--font-weight-button)', lineHeight: '24px',
            color: 'var(--action-neutral-text)',
            boxShadow: focused ? 'var(--shadow-focus-input)' : 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : hover && !disabled ? 0.6 : 1,
            transition: 'var(--transition-opacity-hover), var(--transition-border-focus)',
            boxSizing: 'border-box',
          }}
        >
          {chooseLabel}
        </label>

        {fileName ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0, fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-s)', color: 'var(--text-primary)' }}>
            <span
              data-testid={fileNameTestId}
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}
            >
              {fileName}
            </span>
            {fileSize && (
              <span style={{ flexShrink: 0, color: 'var(--text-secondary)' }}>{fileSize}</span>
            )}
            {onClear && (
              <button
                type="button"
                aria-label={clearLabel || `Remove ${fileName}`}
                data-testid={clearTestId}
                onClick={onClear}
                disabled={disabled}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24, flexShrink: 0,
                  background: 'none', border: 'none', borderRadius: 'var(--radius-s)',
                  color: 'var(--text-secondary)', cursor: disabled ? 'not-allowed' : 'pointer',
                }}
              >
                <CloseIcon width="12" height="12" />
              </button>
            )}
          </span>
        ) : (
          <span style={{ fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}>
            {emptyLabel}
          </span>
        )}
      </div>

      {message}
    </div>
  );
});
