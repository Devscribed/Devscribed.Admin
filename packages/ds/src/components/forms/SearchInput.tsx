import React from 'react';
import { MagnifyIcon, CloseIcon } from '../icons/Icon';

export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Called by the clear cross, which only renders while the field has a value. */
  onClear?: () => void;
  /** Bordered field. `false` is the borderless variant, for a search that sits inside a
   *  surface that already has an edge. */
  outlined?: boolean;
  /** §26 — style for the 44px positioning root; `...rest` and `style` address the `<input>`. */
  wrapperStyle?: React.CSSProperties;
  /** §26 — accessible name for the clear cross. Defaults to `Clear search`. */
  clearLabel?: string;
}

/* ::placeholder can't be an inline style; injected once into <head> rather than rendered as a
   sibling element, which would break consumers' adjacent-sibling and :nth-child rules. */
if (typeof document !== 'undefined' && !document.getElementById('ds-search-input-style')) {
  const el = document.createElement('style');
  el.id = 'ds-search-input-style';
  el.textContent = '.ds-search-input::placeholder { color: var(--text-secondary); opacity: 1; }';
  document.head.appendChild(el);
}

/**
 * SearchInput — a 44px field with a magnifier at the leading edge and, once there is something
 * to clear, a cross at the trailing one.
 *
 * `outlined` is the standalone field: a 1.5px border at `--radius-l`, both glyphs inset 10px,
 * an inset shadow on hover and the system's focus ring. Without it the field is borderless and
 * the glyphs sit flush at the edges — for a search that lives inside a surface that already
 * has an edge of its own.
 *
 * The focus glow here is 10px rather than the 7px every other field takes. A search field is
 * usually the only control in its row, with nothing beside it for the wider glow to crowd.
 */
export function SearchInput({
  placeholder = 'Search…', value, onChange, onClear, outlined = false,
  /* §26 — `...rest` and `style` address the `<input>`, so `data-testid`, `aria-label` and
     `name` land where a test and a reader look for them. `wrapperStyle` is separate on purpose:
     the root is the 44px positioning box the glyphs are pinned to, and a caller placing this
     field in a row is sizing that box, not the input inside it. `TextInput` (§35) and `Select`
     (§21) carry the same split, for the same reason. */
  wrapperStyle, style, clearLabel = 'Clear search', ...rest
}: SearchInputProps) {
  const [focused, setFocused] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const handleClear = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onClear && onClear();
    if (inputRef.current) inputRef.current.focus();
  };
  return (
    <div style={{ position: 'relative', width: '100%', height: 'var(--control-height)', ...wrapperStyle }}>
      <span style={{ position: 'absolute', left: outlined ? 10 : 0, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, color: 'var(--text-secondary)' }}>
        <MagnifyIcon width="16" height="16" />
      </span>
      <input
        {...rest}
        ref={inputRef}
        className="ds-search-input"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: '100%', height: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-family-base)',
          fontSize: 'var(--font-size-s)', color: 'var(--text-primary)', caretColor: 'var(--text-primary)',
          backgroundColor: outlined ? 'var(--surface-card)' : 'transparent', cursor: 'text', outline: 'none',
          borderRadius: outlined ? 'var(--radius-l)' : 0,
          border: outlined ? `var(--border-width-control) solid ${focused ? 'var(--color-blue)' : 'var(--border-default)'}` : 'none',
          /* 10px, not the 7px every other field takes — see the note above. */
          boxShadow: outlined ? (focused ? 'inset 0 2px 2px rgb(0 0 0 / 5%), 0 0 10px rgb(1 104 250 / 50%)' : hover ? 'inset 0 0 3px 0 rgba(0, 0, 0, 0.1)' : 'none') : 'none',
          padding: outlined ? 'var(--space-4) var(--space-10) var(--space-4) var(--space-12)' : 'var(--space-4) var(--space-10)',
          transition: 'var(--transition-border-focus)',
          ...style,
        }}
      />
      {!!(value && String(value).length) && (
        /* §26 — a real `<button>` with a name. It empties the field, which is an action, and
           an action reachable only by pointer is one a keyboard user cannot take. */
        <button type="button" aria-label={clearLabel} onClick={handleClear} style={{ position: 'absolute', right: outlined ? 10 : 0, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <CloseIcon width="12" height="12" aria-hidden />
        </button>
      )}
    </div>
  );
}
