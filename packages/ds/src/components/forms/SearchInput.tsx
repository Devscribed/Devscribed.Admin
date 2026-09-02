import React from 'react';
import { MagnifyIcon, CloseIcon } from '../icons/Icon';

export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Called by the clear cross, which only renders while the field has a value. */
  onClear?: () => void;
  /** Bordered field. Defaults to `false` (borderless), as in source — every real call site in
   *  the app passes `outlined`. */
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
 * SearchInput — components/shared/forms/SearchForm/SearchInput. `outlined` (the variant every
 * call site in the app passes) gives the 1.5px field with the magnifier at 10px, an inset hover
 * shadow and a blue focus ring; the component's own default is the borderless variant, with the
 * icons flush at the edges — same default as in source.
 * SearchInput.module.scss: .root{width:100%;height:44px}
 * .searchIconContainer{20x20; svg 16x16 fill $appGray}
 * input{padding:10px 30px; border:none; 14px; caret+color $appBlack}
 * .outlinedInput input{padding:10px 30px 10px 40px; border:1.5px solid $appGrayLight;
 *   radius:8px; :hover{box-shadow:0 0 3px 0 rgba(0,0,0,.1) inset};
 *   :focus{border-color:$appBlue; box-shadow:inset 0 2px 2px rgb(0 0 0/5%), 0 0 10px rgb(1 104 250/50%)}}
 * .closeIconContainer{20x20; right:0 (10px when outlined); svg 12x12 fill $appGray} — rendered
 * only while the field has a value.
 */
export function SearchInput({
  placeholder = 'Search…', value, onChange, onClear, outlined = false,
  /* §26 — blue forwards nothing, so `data-testid`, `aria-label` and `name` never reached the
     `<input>`. `wrapperStyle` is separate on purpose: the root is the 44px positioning box the
     icons are pinned to, and a caller placing this field in a row is sizing that box, not the
     input inside it. */
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
    <div style={{ position: 'relative', width: '100%', height: 44, ...wrapperStyle }}>
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
          backgroundColor: outlined ? '#fff' : 'transparent', cursor: 'text', outline: 'none',
          borderRadius: outlined ? 'var(--radius-l)' : 0,
          border: outlined ? `1.5px solid ${focused ? 'var(--color-blue)' : 'var(--border-default)'}` : 'none',
          /* the search field's focus glow is 10px, not the 7px used by .form-control */
          boxShadow: outlined ? (focused ? 'inset 0 2px 2px rgb(0 0 0 / 5%), 0 0 10px rgb(1 104 250 / 50%)' : hover ? 'inset 0 0 3px 0 rgba(0, 0, 0, 0.1)' : 'none') : 'none',
          padding: outlined ? '10px 30px 10px 40px' : '10px 30px',
          transition: 'var(--transition-border-focus)',
          ...style,
        }}
      />
      {!!(value && String(value).length) && (
        /* §26 — prod's clear cross is a `<span onClick>`: a control that empties the field and
           cannot be reached without a pointer. */
        <button type="button" aria-label={clearLabel} onClick={handleClear} style={{ position: 'absolute', right: outlined ? 10 : 0, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <CloseIcon width="12" height="12" aria-hidden />
        </button>
      )}
    </div>
  );
}
