import React from 'react';
import { RequiredMark } from './FormField';
import { CrossIcon } from '../icons/Icon';
import { Chip } from '../core/Chip';

export interface SelectOption {
  label: string;
  value: string;
  /** §21 — shown but not selectable: `aria-disabled`, no hover, `--text-secondary` ink. The
   *  arrow keys still land on it, which is the point — a hidden option reads as a bug. */
  disabled?: boolean;
  /** §21 — trailing note on the row, e.g. why it is disabled. Drawn inside the option, so it
   *  is part of the option's accessible name rather than something only seen. */
  hint?: React.ReactNode;
  /** §21 — `data-testid` for the row. This component draws the listbox, so only it can tag. */
  testId?: string;
}

/** An option is either a full record or the bare string that stands for both label and value. */
export type SelectOptionLike = SelectOption | string;

export interface SelectProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onChange' | 'value' | 'defaultValue'> {
  label?: string;
  /** §64 — draws the label's trailing asterisk and sets `aria-required` on the combobox. */
  required?: boolean;
  /** Defaults to `Select...`. */
  placeholder?: string;
  /** A single option, or an array when `isMulti`. */
  value?: SelectOptionLike | SelectOptionLike[];
  options?: SelectOptionLike[];
  onChange?: (option: SelectOptionLike | SelectOptionLike[]) => void;
  /** §21 — renders a text input inside the control and filters the list case-insensitively. */
  isSearchable?: boolean;
  /** Greys the value and the indicators, and blocks pointer events. */
  isDisabled?: boolean;
  /** Renders the selection as removable `Chip`s. */
  isMulti?: boolean;
  /** §36 — the menu closes when an option is chosen, for `isMulti` as much as for single.
   *  Pass `false` to keep it open for a control whose whole job is picking several at once. */
  closeMenuOnSelect?: boolean;
  /** Red border and red glow — the same refusal treatment every field in the system takes. */
  error?: boolean;
  /** Message under the control: 10px / -20px in `dropdown`, 8px / -16px in `formik`. */
  errorMessage?: React.ReactNode;
  /** §21 — id (and test id) for that message, so it can be an `aria-describedby` target. */
  errorId?: string;
  /** §21 — persistent help text. Shares the error's slot; the error wins when both are given. */
  hint?: React.ReactNode;
  /** §21 — id for the hint node, so it can be an `aria-describedby` target. */
  hintId?: string;
  /** Suppresses the blue selected-row highlight, for a list whose options render a two-line
   *  description and value — a solid fill over two lines of type is unreadable. */
  withDescription?: boolean;
  /** Renders an option, in the menu and in the closed control, as the caller wants it. */
  formatOptionLabel?: (option: SelectOptionLike, meta: { context: 'menu' | 'value' }) => React.ReactElement | string;
  /** `dropdown` — a 4px control with the menu 10px below it and a 150px floor, for a filter
   *  standing on its own. `formik` — an 8px control with the menu 8px below, for a field in a
   *  form, where it has to match the `TextInput`s above and below it. */
  variant?: 'dropdown' | 'formik';
  /** §21 — `data-testid` per chip, which is a different node from the option that made it. */
  chipTestId?: (option: SelectOptionLike) => string | undefined;
  /** §29 — offers a `Create "…"` row when the query matches no option. */
  allowCreate?: boolean;
  onCreate?: (label: string) => void;
  /** §29 — `data-testid` for that create row. */
  createTestId?: string;
  /** §21 — id of the combobox node, which the `<label>`'s `htmlFor` also points at.
   *  Falls back to a generated id. */
  id?: string;
  /** §21 — style for the positioning wrapper; `...rest` and `style` address the combobox. */
  wrapperStyle?: React.CSSProperties;
}

/**
 * Select — the system's dropdown, in two densities.
 *
 * `variant="dropdown"` (default) is the standalone filter: a 4px control with the menu 10px
 * below it and a 150px floor. `variant="formik"` is the one that lives in a form: an 8px
 * control with the menu 8px below, and a message slot matching `TextInput`'s (8px, -16px)
 * rather than the looser 10px/-20px a filter can afford. The two differ only where a form
 * forces them to.
 *
 * §21 — **it is a real combobox.** A painted box with a click handler is not one: it cannot be
 * reached by Tab, walked with arrows, left with `Escape`, or announced as anything, and a
 * `isSearchable` prop on it is a prop that does nothing. This is `role="combobox"` over a
 * `role="listbox"`, with a roving `aria-activedescendant`, a real text input when searchable,
 * per-option `disabled` / `hint` / `testId`, and `allowCreate`.
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

/* §29 — the value of the synthetic `Create "…"` row. Namespaced so it can never collide with
   a real option's value. */
const CREATE = '__ds_create__';

/* The message slot: absolute, under the control, and the same one a hint takes (§21). */
const messageSlot: React.CSSProperties = { position: 'absolute', left: 0, whiteSpace: 'nowrap' };

/* Both dispatch on what they are handed at runtime — a bare string, a record, or nothing. */
const labelOf = (o: any): string => (o == null ? '' : typeof o === 'string' ? o : o.label);
/* Options are matched by value where they carry one. Matching on the label instead would
   collapse two people with the same name into one option. */
const keyOf = (o: any): string => (o == null ? '' : typeof o === 'string' ? o : (o.value != null ? o.value : o.label));

export function Select({
  /* Three periods, not an ellipsis character: this string is compared against in tests and
     copied into specs, and the two are indistinguishable on screen and not in a file. */
  label, placeholder = 'Select...', value, options = [], onChange, isSearchable, isDisabled, isMulti,
  /* §36 — the menu closes on select, for multi as much as for single. Left open, a
     multi-select covers whatever sits under it with a list that has often just emptied —
     the filter bar picks a position and the category row below it disappears behind
     `No options`. A caller that really is picking several at once passes `false`. */
  closeMenuOnSelect = true,
  error, errorMessage, errorId, hint, hintId, withDescription, formatOptionLabel, variant = 'dropdown',
  /* §21 — the chip, the create row and the listbox are all drawn by this component, so only
     this component can tag them; per-option `testId` covers the rows. Same shape as §4 and
     §16: whoever renders a node owns its test id. */
  chipTestId, createTestId, allowCreate, onCreate, id, wrapperStyle, onFocus, onBlur,
  /* §64 — there is no native control under this one to carry `required`, so it is a prop.
     It draws the label's asterisk and sets `aria-required` on the combobox. */
  required,
  ...rest
}: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(-1);
  const [arrowHover, setArrowHover] = React.useState(false);
  const [clearHover, setClearHover] = React.useState(false);
  const [hovered, setHovered] = React.useState(-1);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const controlRef = React.useRef<HTMLDivElement | null>(null);
  const generatedId = React.useId();
  const controlId = id || generatedId;
  const listId = `${controlId}-listbox`;
  React.useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const formik = variant === 'formik';
  const selectedList = isMulti ? ((value || []) as SelectOptionLike[]) : [];
  const hasValue = isMulti ? selectedList.length > 0 : !!value;

  /* A multi-select hides what is already chosen; the search then narrows what is left, on a
     case-insensitive substring of the label. */
  const matches = (opt: SelectOptionLike) => labelOf(opt).toLowerCase().includes(query.trim().toLowerCase());
  const visible = options
    .filter((opt) => !isMulti || !selectedList.some((s) => keyOf(s) === keyOf(opt)))
    .filter((opt) => !isSearchable || !query || matches(opt));
  /* §29 — the row appears when the query matches **no option at all**, not when it matches no
     option *exactly*. The looser test offers `Create "Eng"` while `English` is sitting in the
     list above it. The test runs over `options` rather than over `visible`, so a name already
     chosen in an `isMulti` control still counts as matching — otherwise picking `React` would
     make the next `React` look creatable. */
  const unmatched = !options.some(matches);
  const rows = allowCreate && query.trim() && unmatched
    ? visible.concat([{ value: CREATE, label: `Create "${query.trim()}"` }])
    : visible;

  const isDisabledRow = (opt: SelectOptionLike) => typeof opt !== 'string' && opt.disabled === true;

  /* The active row is **derived** from the list rather than stored against it: the selected
     option if there is one, else the first. An index pinned when the menu opened goes stale the
     moment the options arrive (they are usually fetched) or the query narrows them, and a
     combobox with nothing focused swallows `Enter`. Defaulting to the selection also means
     opening a filled control highlights nothing new — the chosen row already paints blue. */
  const selectedIndex = !isMulti && hasValue ? rows.findIndex((o) => keyOf(o) === keyOf(value)) : -1;
  const activeIndex = open && rows.length
    ? (active >= 0 ? Math.min(active, rows.length - 1) : Math.max(selectedIndex, 0))
    : -1;

  function commit(opt: SelectOptionLike) {
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
    if (closeMenuOnSelect) setOpen(false);
  }

  function move(delta: number) {
    if (!open) { setOpen(true); setActive(-1); return; }
    if (!rows.length) return;
    setActive((activeIndex + delta + rows.length) % rows.length);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
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
    /* Both, and both are needed. `stopPropagation` is for a host listening on an ancestor
       node; `preventDefault` is how a dialog listening on `document` is told the key was
       already answered. React dispatches from `document` itself, so stopping propagation there
       never reaches a second `document` listener — without the `preventDefault`, `Escape` on a
       `Select` inside a drawer would close both. */
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setQuery(''); setActive(-1); return; }
    if (e.key === 'Tab') { setOpen(false); return; }
    /* Backspace in an empty input drops the last chip. It is the only way one comes off
       without a pointer — the crosses are inside the control, after the input. */
    if (e.key === 'Backspace' && isMulti && isSearchable && !query && selectedList.length) {
      onChange && onChange(selectedList.slice(0, -1));
    }
  }

  // The arrow darkens in two steps: once when the control is open, once under the pointer.
  // Disabled it goes lighter than rest, which is the only state where it is not a control.
  const arrowColor = isDisabled ? N.n10 : open ? (arrowHover ? N.n80 : N.n60) : (arrowHover ? N.n40 : N.n20);
  /* Lit on focus, not on open: a control that can be reached by Tab has to show that it has
     been, and `open` is one state too late for a keyboard. */
  const lit = open || focused;
  const activeId = activeIndex >= 0 ? `${controlId}-option-${activeIndex}` : undefined;

  /* §21 — the combobox node is the `<input>` when the control is searchable and the control
     box itself when it is not; both are "the control" to a pointer and to a reader, so that is
     where `...rest` (and with it `data-testid` and every `aria-*`) lands. */
  const comboProps: React.HTMLAttributes<HTMLElement> = {
    ...rest,
    role: 'combobox',
    'aria-expanded': open,
    'aria-controls': open ? listId : undefined,
    'aria-haspopup': 'listbox',
    'aria-activedescendant': activeId,
    'aria-disabled': isDisabled || undefined,
    'aria-required': required || undefined,
    onKeyDown,
    onFocus: (e) => { setFocused(true); if (isSearchable) setOpen(true); if (onFocus) onFocus(e); },
    onBlur: (e) => { setFocused(false); if (onBlur) onBlur(e); },
  };

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative', fontFamily: 'var(--font-family-base)', pointerEvents: isDisabled ? 'none' : undefined, ...wrapperStyle }}>
      {label && (
        /* The system's field-label treatment, inline because this control draws its own. */
        <label htmlFor={controlId} style={{ display: 'inline-block', fontWeight: 400, fontSize: 'var(--font-size-xs)', lineHeight: 'var(--line-height-label)', whiteSpace: 'nowrap', color: 'var(--text-secondary)', marginBottom: 'var(--space-1)', padding: 'var(--space-4) 0 0 var(--space-4)' }}>
          {label}
          {/* §64 — an explicit prop, unlike the three fields with a native control under
              them: there is no `<input required>` here to read it off, and `aria-required`
              on the combobox is set from the same flag. */}
          {required && <RequiredMark />}
        </label>
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
          position: 'relative', minHeight: 'var(--control-height)', boxSizing: 'border-box', background: 'var(--surface-card)',
          borderWidth: 'var(--border-width-control)', borderStyle: 'solid',
          borderColor: error ? 'var(--status-error)' : lit ? 'var(--color-blue)' : 'var(--border-default)',
          borderRadius: formik ? 'var(--radius-l)' : 'var(--radius-s)', cursor: 'default', outline: 0, fontSize: 'var(--font-size-s)',
          transition: 'all 100ms',
          boxShadow: error ? 'var(--shadow-error-glow)' : lit ? 'var(--shadow-focus-input)' : 'none',
        }}
      >
        {/* The value area carries the padding; the control itself has none, so the gap at the
           right edge comes only from the indicator's own padding below. */}
        <span style={{ /* @literal 2px, below the scale: the value area's own inset, so a chip sits clear of the border */ display: 'flex', flexWrap: 'wrap', alignItems: 'center', padding: '2px var(--space-3)', overflow: 'hidden', flex: 1, position: 'relative' }}>
          {isMulti && selectedList.map((o) => (
            <Chip
              key={keyOf(o)}
              label={labelOf(o)}
              data-testid={chipTestId ? chipTestId(o) : undefined}
              onRemove={() => onChange && onChange(selectedList.filter((s) => keyOf(s) !== keyOf(o)))}
            />
          ))}
          {!isMulti && hasValue && !query && (
            /* The chosen value's ink, one step lighter when the control is disabled. */
            <span style={{ /* @literal 2px matches the chips beside it; the 8px is the arrow's own clearance */ marginLeft: 2, marginRight: 2, maxWidth: 'calc(100% - 8px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isDisabled ? N.n40 : N.n80 }}>
              {formatOptionLabel ? formatOptionLabel(value as SelectOptionLike, { context: 'value' }) : labelOf(value)}
            </span>
          )}
          {/* The placeholder takes `--text-secondary`: it is not a value. */}
          {!hasValue && !isSearchable && <span style={{ /* @literal 2px, matching the value it stands in for */ marginLeft: 2, marginRight: 2, color: 'var(--text-secondary)' }}>{placeholder}</span>}
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
              /* No border, no background: the control around it is the field. It inherits the
                 type and grows to fill whatever the value and the chips leave. */
              style={{ /* @literal 2px, matching the chips it grows between */ flex: '1 1 auto', minWidth: 2, margin: 2, border: 0, padding: 0, outline: 0, background: 'transparent', font: 'inherit', color: N.n80, boxSizing: 'border-box' }}
            />
          )}
        </span>
        {/* A 1px separator and the arrow. The clear-all cross appears only on a `formik`
           multi-select: that is the one case where a value is a *set* somebody may want to
           empty in one move, and a filter's single value is cleared by picking another. */}
        <span style={{ display: 'flex', alignItems: 'center', alignSelf: 'stretch', flexShrink: 0 }}>
          {formik && isMulti && hasValue && !isDisabled && (
            <button
              type="button"
              aria-label="Clear all"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onChange && onChange([]); }}
              onMouseEnter={() => setClearHover(true)}
              onMouseLeave={() => setClearHover(false)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-3)', color: clearHover ? N.n40 : N.n20, transition: 'color 150ms' }}
            >
              <CrossIcon width="20" height="20" />
            </button>
          )}
          <span style={{ alignSelf: 'stretch', width: 1, backgroundColor: isDisabled ? N.n10 : N.n20, marginTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }} />
          <span
            aria-hidden="true"
            onMouseEnter={(e) => { e.stopPropagation(); setArrowHover(true); }}
            onMouseLeave={() => setArrowHover(false)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-3)', color: arrowColor, transition: 'color 150ms' }}
          >
            <svg height="20" width="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style={{ display: 'inline-block', lineHeight: 1 }}>
              <path d="M4.516 7.548c0.436-0.446 1.043-0.481 1.576 0l3.908 3.747 3.908-3.747c0.533-0.481 1.141-0.446 1.574 0 0.436 0.445 0.408 1.197 0 1.615-0.406 0.418-4.695 4.502-4.695 4.502-0.217 0.223-0.502 0.335-0.787 0.335s-0.57-0.112-0.789-0.335c0 0-4.287-4.084-4.695-4.502s-0.436-1.17 0-1.615z" />
            </svg>
          </span>
        </span>
      </div>
      {/* Unmounted when closed — a listbox left in the document keeps every option's
          `data-testid` reachable by a query that should have found nothing. `aria-controls` is
          dropped with it rather than pointing at a node that is not there. */}
      {open && (
      <div
        id={listId}
        role="listbox"
        aria-label={label}
        style={{ position: 'absolute', top: '100%', left: 0, right: 0, boxSizing: 'border-box', marginTop: formik ? 'var(--space-3)' : 'var(--space-4)', minWidth: formik ? undefined : 150, /* @literal 5px end caps, below the scale — `AccountMenu`'s panel takes the same. */ paddingTop: 5, paddingBottom: 5, background: 'var(--surface-overlay)', borderRadius: 'var(--radius-l)', boxShadow: '0 6px 12px rgb(0 0 0 / 18%)', zIndex: 1000 }}
      >
        {/* The list scrolls at 300px rather than growing: a menu taller than that runs off
            whatever it was opened from. */}
        <div style={{ paddingTop: 'var(--space-1)', paddingBottom: 'var(--space-1)', maxHeight: 300, overflowY: 'auto', position: 'relative', boxSizing: 'border-box' }}>
          {rows.map((opt, i) => {
            const l = labelOf(opt);
            const disabled = isDisabledRow(opt);
            /* A row with a two-line description is never highlighted: a solid fill under two
               lines of type is unreadable, which is what `withDescription` is for. */
            const selected = !isMulti && !withDescription && hasValue && keyOf(value) === keyOf(opt);
            /* The keyboard-focused row takes the same tint the pointer already gets, rather
               than a colour of its own: arrowing to a row and hovering it are the same act. */
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
                /* A form's menu is 14px, matching the fields around it; a standalone filter's
                   is the inherited 16px body size. */
                style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)',
                  width: '100%', boxSizing: 'border-box', padding: 'var(--space-3) var(--space-5)',
                  fontSize: formik ? 'var(--font-size-s)' : 'var(--font-size-base)',
                  cursor: 'default', userSelect: 'none',
                  backgroundColor: selected ? 'var(--color-blue)' : tinted ? 'rgba(0, 122, 255, 0.1)' : 'transparent',
                  color: selected ? 'var(--text-on-accent)' : disabled ? 'var(--text-secondary)' : 'var(--text-primary)',
                }}
              >
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {formatOptionLabel ? formatOptionLabel(opt, { context: 'menu' }) : l}
                </span>
                {/* §21 — the reason a row is unavailable, drawn beside it and *inside* it, so it
                    is part of the option's accessible name rather than something only seen. */}
                {typeof opt !== 'string' && opt.hint && (
                  <span style={{ flexShrink: 0, fontSize: 'var(--font-size-xs)', color: selected ? 'var(--text-on-accent)' : 'var(--text-secondary)' }}>{opt.hint}</span>
                )}
              </div>
            );
          })}
          {/* NoOptionsMessage: neutral40, 8px 12px, centred. */}
          {rows.length === 0 && (
            <div style={{ padding: 'var(--space-3) var(--space-5)', textAlign: 'center', fontSize: formik ? 'var(--font-size-s)' : 'var(--font-size-base)', color: N.n40 }}>No options</div>
          )}
        </div>
      </div>
      )}
      {/* §21 — `errorId`, and a `hint` sharing the error's slot and geometry. Both are §4's
          call on `TextInput`, for §4's reason: a hint drawn anywhere else would move the field
          every time an error replaced it. One slot, error wins when both are given. */}
      {error && errorMessage
        ? <div style={{ /* @literal 8px and 10px are the message slot's two sizes, deliberately off the type scale — see `TextInput`'s `messageSlot`. The looser pair belongs to the standalone filter, which has room under it that a field in a form does not. */ ...messageSlot, fontSize: formik ? 8 : 10, bottom: formik ? -16 : -20, color: 'var(--status-error)' }}><span id={errorId} data-testid={errorId}>{errorMessage}</span></div>
        : hint
          ? <div style={{ /* @literal 8px and 10px are the message slot's two sizes, deliberately off the type scale — see `TextInput`'s `messageSlot`. The looser pair belongs to the standalone filter, which has room under it that a field in a form does not. */ ...messageSlot, fontSize: formik ? 8 : 10, bottom: formik ? -16 : -20, color: 'var(--text-secondary)' }}><span id={hintId}>{hint}</span></div>
          : null}
    </div>
  );
}
