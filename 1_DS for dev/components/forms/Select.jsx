import React from 'react';
import { CrossIcon } from '../icons/Icon.jsx';
import { Chip } from '../core/Chip.jsx';

/**
 * Select — the app's react-select 5.5.6 wrappers.
 * `variant="dropdown"` (default) mirrors shared/forms/DropdownSelect: the control keeps
 * react-select's own 4px radius and the menu sits 10px below with a 150px min width.
 * `variant="formik"` mirrors CustomFormikSelect / AutocompleteSelect: control radius 8,
 * menu 8px below, and an 8px error message 16px under the field instead of 10px/20px.
 * Everything not listed in those files is the library default, reproduced here.
 *
 * §21 — and the library default blue did not reproduce is *the control being a control*.
 * react-select renders a focusable combobox with a listbox, arrow keys, `Escape`, and a text
 * input when `isSearchable`; blue measured the painted box and left a `<div onClick>`, so the
 * prop was accepted and did nothing (`Tracker` has passed `isSearchable` since it was written).
 * The paint below is unchanged — what is new is the keyboard, the roles, per-option `disabled`
 * / `hint` / `testId`, and `allowCreate`.
 */
const N = { n5: 'hsl(0, 0%, 95%)', n10: 'hsl(0, 0%, 90%)', n20: 'hsl(0, 0%, 80%)', n40: 'hsl(0, 0%, 60%)', n60: 'hsl(0, 0%, 40%)', n80: 'hsl(0, 0%, 20%)' };

/* ::placeholder can't be an inline style; injected once into <head> rather than rendered as a
   sibling element, which would break consumers' adjacent-sibling and :nth-child rules. */
if (typeof document !== 'undefined' && !document.getElementById('ds-select-style')) {
  const el = document.createElement('style');
  el.id = 'ds-select-style';
  el.textContent = '.ds-select-input::placeholder { color: var(--text-secondary); opacity: 1; }';
  document.head.appendChild(el);
}

/* §29 — the value of the synthetic `Create "…"` row. Prod uses react-select, never
   react-select/creatable, so this row has no production precedent to measure. */
const CREATE = '__ds_create__';

/* The message slot: absolute, under the control, and the same one a hint takes (§21). */
const messageSlot = { position: 'absolute', left: 0, whiteSpace: 'nowrap' };

const labelOf = (o) => (o == null ? '' : typeof o === 'string' ? o : o.label);
/* Options are matched by value where they carry one — an id list is the case blue's own kit
   never had, and matching on the label there would collapse two people with the same name. */
const keyOf = (o) => (o == null ? '' : typeof o === 'string' ? o : (o.value != null ? o.value : o.label));

export function Select({
  /* react-select 5.5.6 default placeholder is the literal 'Select...' (Select-*.esm.js:962);
     the app never overrides it on the holiday-members field, so it must be three periods. */
  label, placeholder = 'Select...', value, options = [], onChange, isSearchable, isDisabled, isMulti,
  error, errorMessage, errorId, hint, hintId, withDescription, formatOptionLabel, variant = 'dropdown',
  /* §21 — blue draws the chip, the create row and the listbox itself and gives no way to tag
     any of them; per-option `testId` covers the rows. Same shape as §4 and §16. */
  chipTestId, createTestId, allowCreate, onCreate, id, wrapperStyle, onFocus, onBlur, ...rest
}) {
  const [open, setOpen] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(-1);
  const [arrowHover, setArrowHover] = React.useState(false);
  const [clearHover, setClearHover] = React.useState(false);
  const [hovered, setHovered] = React.useState(-1);
  const ref = React.useRef(null);
  const inputRef = React.useRef(null);
  const controlRef = React.useRef(null);
  const generatedId = React.useId();
  const controlId = id || generatedId;
  const listId = `${controlId}-listbox`;
  React.useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const formik = variant === 'formik';
  const selectedList = isMulti ? (value || []) : [];
  const hasValue = isMulti ? selectedList.length > 0 : !!value;

  /* hideSelectedOptions defaults to true when isMulti; the search then narrows what is left,
     which is what react-select's own default filter does (case-insensitive substring). */
  const visible = options
    .filter((opt) => !isMulti || !selectedList.some((s) => keyOf(s) === keyOf(opt)))
    .filter((opt) => !isSearchable || !query || labelOf(opt).toLowerCase().includes(query.trim().toLowerCase()));
  const exact = options.some((opt) => labelOf(opt).toLowerCase() === query.trim().toLowerCase());
  const rows = allowCreate && query.trim() && !exact
    ? visible.concat([{ value: CREATE, label: `Create "${query.trim()}"` }])
    : visible;

  const isDisabledRow = (opt) => typeof opt !== 'string' && opt.disabled === true;

  /* react-select focuses an option as soon as the menu has one — the selected one if there is
     one, else the first — so the active row is derived from the list rather than stored against
     it. An index pinned when the menu opened goes stale the moment the options arrive (they are
     usually fetched) or the query narrows them, and a combobox with nothing focused swallows
     `Enter`. Defaulting to the selection also means opening a filled control highlights nothing
     new: the selected row already paints blue. */
  const selectedIndex = !isMulti && hasValue ? rows.findIndex((o) => keyOf(o) === keyOf(value)) : -1;
  const activeIndex = open && rows.length
    ? (active >= 0 ? Math.min(active, rows.length - 1) : Math.max(selectedIndex, 0))
    : -1;

  function commit(opt) {
    if (isDisabledRow(opt)) return;
    if (keyOf(opt) === CREATE) {
      onCreate && onCreate(query.trim());
    } else if (isMulti) {
      onChange && onChange(selectedList.concat([opt]));
    } else {
      onChange && onChange(opt);
    }
    setQuery('');
    setActive(-1);
    if (!isMulti) setOpen(false);
  }

  function move(delta) {
    if (!open) { setOpen(true); setActive(-1); return; }
    if (!rows.length) return;
    setActive((activeIndex + delta + rows.length) % rows.length);
  }

  function onKeyDown(e) {
    if (isDisabled) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return; }
    if (e.key === 'Home' && open) { e.preventDefault(); setActive(0); return; }
    if (e.key === 'End' && open) { e.preventDefault(); setActive(rows.length - 1); return; }
    if (e.key === 'Enter' || (e.key === ' ' && !isSearchable)) {
      if (!open) { e.preventDefault(); setOpen(true); setActive(-1); return; }
      if (activeIndex >= 0) { e.preventDefault(); commit(rows[activeIndex]); }
      return;
    }
    if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); setQuery(''); setActive(-1); return; }
    if (e.key === 'Tab') { setOpen(false); return; }
    /* react-select drops the last value on Backspace in an empty input, which is the only way
       a chip comes off without a pointer. */
    if (e.key === 'Backspace' && isMulti && isSearchable && !query && selectedList.length) {
      onChange && onChange(selectedList.slice(0, -1));
    }
  }

  // react-select DropdownIndicator defaults: neutral20 (rest), neutral40 (rest+hover),
  // neutral60 (focused), neutral80 (focused+hover), neutral10 when disabled.
  const arrowColor = isDisabled ? N.n10 : open ? (arrowHover ? N.n80 : N.n60) : (arrowHover ? N.n40 : N.n20);
  /* Blue lit the border on `open` because clicking is the only way it could open. react-select
     lights it on `isFocused` — the same border, one state earlier — and a control that can now
     be reached by Tab has to show that it has been. */
  const lit = open || focused;
  const activeId = activeIndex >= 0 ? `${controlId}-option-${activeIndex}` : undefined;

  /* §21 — the combobox node is the `<input>` when the control is searchable and the control
     box itself when it is not; both are "the control" to a pointer and to a reader, so that is
     where `...rest` (and with it `data-testid` and every `aria-*`) lands. */
  const comboProps = {
    ...rest,
    role: 'combobox',
    'aria-expanded': open,
    'aria-controls': open ? listId : undefined,
    'aria-haspopup': 'listbox',
    'aria-activedescendant': activeId,
    'aria-disabled': isDisabled || undefined,
    onKeyDown,
    onFocus: (e) => { setFocused(true); if (isSearchable) setOpen(true); if (onFocus) onFocus(e); },
    onBlur: (e) => { setFocused(false); if (onBlur) onBlur(e); },
  };

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative', fontFamily: 'var(--font-family-base)', pointerEvents: isDisabled ? 'none' : undefined, ...wrapperStyle }}>
      {label && (
        /* global .input-label */
        <label htmlFor={controlId} style={{ display: 'inline-block', fontWeight: 400, fontSize: 'var(--font-size-xs)', lineHeight: '21px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', marginBottom: 4, padding: '10px 0 0 10px' }}>{label}</label>
      )}
      <div
        ref={controlRef}
        {...(isSearchable ? {} : { ...comboProps, id: controlId, tabIndex: isDisabled ? -1 : 0 })}
        onClick={() => {
          if (isDisabled) return;
          if (isSearchable) { setOpen(true); inputRef.current && inputRef.current.focus(); }
          else setOpen((o) => !o);
        }}
        style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between',
          position: 'relative', minHeight: 44, boxSizing: 'border-box', background: '#fff',
          borderWidth: 1.5, borderStyle: 'solid',
          borderColor: error ? 'var(--status-error)' : lit ? 'var(--color-blue)' : 'var(--border-default)',
          borderRadius: formik ? 8 : 4, cursor: 'default', outline: 0, fontSize: 'var(--font-size-s)',
          transition: 'all 100ms',
          boxShadow: error ? 'var(--shadow-error-glow)' : lit ? 'var(--shadow-focus-input)' : 'none',
        }}
      >
        {/* ValueContainer: padding 2px 8px — the control itself has no padding, the right-side
           gap comes only from the indicator's own padding below. */}
        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', padding: '2px 8px', overflow: 'hidden', flex: 1, position: 'relative' }}>
          {isMulti && selectedList.map((o) => (
            <Chip
              key={keyOf(o)}
              label={labelOf(o)}
              data-testid={chipTestId ? chipTestId(o) : undefined}
              onRemove={() => onChange && onChange(selectedList.filter((s) => keyOf(s) !== keyOf(o)))}
            />
          ))}
          {!isMulti && hasValue && !query && (
            /* singleValue: color neutral80 (never overridden), neutral40 when disabled. */
            <span style={{ marginLeft: 2, marginRight: 2, maxWidth: 'calc(100% - 8px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isDisabled ? N.n40 : N.n80 }}>
              {formatOptionLabel ? formatOptionLabel(value, { context: 'value' }) : labelOf(value)}
            </span>
          )}
          {/* placeholder colour is the one react-select default DropdownSelect overrides. */}
          {!hasValue && !isSearchable && <span style={{ marginLeft: 2, marginRight: 2, color: 'var(--text-secondary)' }}>{placeholder}</span>}
          {isSearchable && (
            <input
              {...comboProps}
              ref={inputRef}
              id={controlId}
              className="ds-select-input"
              type="text"
              autoComplete="off"
              disabled={isDisabled}
              placeholder={hasValue ? '' : placeholder}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(-1); }}
              /* react-select's Input: no border, no background, inherits the control's type,
                 and grows to fill what the value and the chips leave. */
              style={{ flex: '1 1 auto', minWidth: 2, margin: 2, border: 0, padding: 0, outline: 0, background: 'transparent', font: 'inherit', color: N.n80, boxSizing: 'border-box' }}
            />
          )}
        </span>
        {/* indicatorSeparator (1px, neutral20 / neutral10 disabled) + dropdownIndicator —
           DropdownSelect.tsx overrides neither, but it does hide clearIndicator; the Formik-based
           selects don't, so a multi value there shows react-select's clear cross (neutral20,
           neutral40 on hover) as in prod-screens/31, 33. */}
        <span style={{ display: 'flex', alignItems: 'center', alignSelf: 'stretch', flexShrink: 0 }}>
          {formik && isMulti && hasValue && !isDisabled && (
            <button
              type="button"
              aria-label="Clear all"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onChange && onChange([]); }}
              onMouseEnter={() => setClearHover(true)}
              onMouseLeave={() => setClearHover(false)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, color: clearHover ? N.n40 : N.n20, transition: 'color 150ms' }}
            >
              <CrossIcon width="20" height="20" />
            </button>
          )}
          <span style={{ alignSelf: 'stretch', width: 1, backgroundColor: isDisabled ? N.n10 : N.n20, marginTop: 8, marginBottom: 8 }} />
          <span
            aria-hidden="true"
            onMouseEnter={(e) => { e.stopPropagation(); setArrowHover(true); }}
            onMouseLeave={() => setArrowHover(false)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, color: arrowColor, transition: 'color 150ms' }}
          >
            <svg height="20" width="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style={{ display: 'inline-block', lineHeight: 1 }}>
              <path d="M4.516 7.548c0.436-0.446 1.043-0.481 1.576 0l3.908 3.747 3.908-3.747c0.533-0.481 1.141-0.446 1.574 0 0.436 0.445 0.408 1.197 0 1.615-0.406 0.418-4.695 4.502-4.695 4.502-0.217 0.223-0.502 0.335-0.787 0.335s-0.57-0.112-0.789-0.335c0 0-4.287-4.084-4.695-4.502s-0.436-1.17 0-1.615z" />
            </svg>
          </span>
        </span>
      </div>
      {/* Unmounted when closed, as blue's menu is and as react-select's is — a listbox left in
          the document keeps every option's `data-testid` reachable by a query that should have
          found nothing. `aria-controls` is dropped with it rather than pointing at a node that
          is not there. */}
      {open && (
      <div
        id={listId}
        role="listbox"
        aria-label={label}
        style={{ position: 'absolute', top: '100%', left: 0, right: 0, boxSizing: 'border-box', marginTop: formik ? 8 : 10, minWidth: formik ? undefined : 150, paddingTop: 5, paddingBottom: 5, background: '#fff', borderRadius: 8, boxShadow: '0 6px 12px rgb(0 0 0 / 18%)', zIndex: 1000 }}
      >
        {/* menuList: 4px vertical padding, maxHeight 300 with its own scroll. */}
        <div style={{ paddingTop: 4, paddingBottom: 4, maxHeight: 300, overflowY: 'auto', position: 'relative', boxSizing: 'border-box' }}>
          {rows.map((opt, i) => {
            const l = labelOf(opt);
            const disabled = isDisabledRow(opt);
            /* option{backgroundColor: isSelected && !withDescription ? blue : …} — with a
               description renderer the selected row is NOT highlighted. */
            const selected = !isMulti && !withDescription && hasValue && keyOf(value) === keyOf(opt);
            /* The override drops react-select's primary25, so prod's keyboard-focused row has
               no highlight at all — unusable the moment the arrow keys exist (§21). It gets the
               tint the pointer already gets, not a new value. */
            const tinted = !selected && !disabled && (i === activeIndex || i === hovered);
            return (
              <div
                key={keyOf(opt) || l}
                id={`${controlId}-option-${i}`}
                role="option"
                aria-selected={selected}
                aria-disabled={disabled || undefined}
                data-testid={keyOf(opt) === CREATE ? createTestId : (typeof opt !== 'string' ? opt.testId : undefined)}
                onClick={() => commit(opt)}
                /* Keeps the caret in the search input: a click here must not blur it, or the
                   menu closes under the pointer before the click lands. */
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(-1)}
                /* DropdownSelect sets font-size only on the control, so the menu keeps the
                   inherited 16px body size; CustomFormikSelect sets menu/menuList to 14. */
                style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
                  width: '100%', boxSizing: 'border-box', padding: '8px 12px',
                  fontSize: formik ? 'var(--font-size-s)' : 'var(--font-size-base)',
                  cursor: 'default', userSelect: 'none',
                  backgroundColor: selected ? 'var(--color-blue)' : tinted ? 'rgba(0, 122, 255, 0.1)' : 'transparent',
                  color: selected ? '#fff' : disabled ? 'var(--text-secondary)' : 'var(--text-primary)',
                }}
              >
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {formatOptionLabel ? formatOptionLabel(opt, { context: 'menu' }) : l}
                </span>
                {/* §21 — the reason a row is unavailable, drawn beside it and *inside* it, so it
                    is part of the option's accessible name rather than something only seen. */}
                {typeof opt !== 'string' && opt.hint && (
                  <span style={{ flexShrink: 0, fontSize: 'var(--font-size-xs)', color: selected ? '#fff' : 'var(--text-secondary)' }}>{opt.hint}</span>
                )}
              </div>
            );
          })}
          {/* NoOptionsMessage: neutral40, 8px 12px, centred. */}
          {rows.length === 0 && (
            <div style={{ padding: '8px 12px', textAlign: 'center', fontSize: formik ? 'var(--font-size-s)' : 'var(--font-size-base)', color: N.n40 }}>No options</div>
          )}
        </div>
      </div>
      )}
      {/* §21 — `errorId`, and a `hint` sharing the error's slot and geometry. Both are §4's
          call on `TextInput`, for §4's reason: a hint drawn anywhere else would move the field
          every time an error replaced it. One slot, error wins when both are given. */}
      {error && errorMessage
        ? <div style={{ ...messageSlot, fontSize: formik ? 8 : 10, bottom: formik ? -16 : -20, color: 'var(--status-error)' }}><span id={errorId} data-testid={errorId}>{errorMessage}</span></div>
        : hint
          ? <div style={{ ...messageSlot, fontSize: formik ? 8 : 10, bottom: formik ? -16 : -20, color: 'var(--text-secondary)' }}><span id={hintId}>{hint}</span></div>
          : null}
    </div>
  );
}
