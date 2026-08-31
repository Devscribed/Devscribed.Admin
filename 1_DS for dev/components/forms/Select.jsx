import React from 'react';

/**
 * Select — the app's react-select 5.5.6 wrappers.
 * `variant="dropdown"` (default) mirrors shared/forms/DropdownSelect: the control keeps
 * react-select's own 4px radius and the menu sits 10px below with a 150px min width.
 * `variant="formik"` mirrors CustomFormikSelect / AutocompleteSelect: control radius 8,
 * menu 8px below, and an 8px error message 16px under the field instead of 10px/20px.
 * Everything not listed in those files is the library default, reproduced here.
 */
const N = { n5: 'hsl(0, 0%, 95%)', n10: 'hsl(0, 0%, 90%)', n20: 'hsl(0, 0%, 80%)', n40: 'hsl(0, 0%, 60%)', n60: 'hsl(0, 0%, 40%)', n80: 'hsl(0, 0%, 20%)' };

function CrossIcon({ size = 14 }) {
  return (
    <svg height={size} width={size} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false" style={{ display: 'inline-block', lineHeight: 1 }}>
      <path d="M14.348 14.849c-.469.469-1.229.469-1.697 0L10 11.819l-2.651 3.03c-.469.469-1.229.469-1.697 0-.469-.469-.469-1.229 0-1.697l2.758-3.15-2.759-3.152c-.469-.469-.469-1.228 0-1.697.469-.469 1.228-.469 1.697 0L10 8.183l2.651-3.031c.469-.469 1.228-.469 1.697 0 .469.469.469 1.229 0 1.697l-2.758 3.152 2.758 3.15c.469.469.469 1.229 0 1.698z" />
    </svg>
  );
}

function Chip({ label, onRemove }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div style={{ display: 'flex', minWidth: 0, margin: 2, background: '#fff', border: '1px solid var(--border-default)', borderLeft: '7px solid var(--color-blue)', borderRadius: 8, padding: '4px 0 4px 4px', color: '#000', cursor: 'pointer', boxSizing: 'border-box' }}>
      <span style={{ fontSize: 14, fontWeight: 400, padding: '0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span
        onClick={(e) => { e.stopPropagation(); onRemove && onRemove(); }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ display: 'flex', alignItems: 'center', paddingLeft: 4, paddingRight: 4, background: '#fff', borderRadius: 12, color: hover ? 'var(--border-default)' : 'var(--text-secondary)', fontWeight: 400 }}
      >
        <CrossIcon />
      </span>
    </div>
  );
}

export function Select({
  /* react-select 5.5.6 default placeholder is the literal 'Select...' (Select-*.esm.js:962);
     the app never overrides it on the holiday-members field, so it must be three periods. */
  label, placeholder = 'Select...', value, options = [], onChange, isSearchable, isDisabled, isMulti,
  error, errorMessage, withDescription, formatOptionLabel, variant = 'dropdown',
}) {
  const [open, setOpen] = React.useState(false);
  const [arrowHover, setArrowHover] = React.useState(false);
  const [clearHover, setClearHover] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const formik = variant === 'formik';
  const labelOf = (o) => (typeof o === 'string' ? o : o.label);
  const selectedList = isMulti ? (value || []) : [];
  const hasValue = isMulti ? selectedList.length > 0 : !!value;
  // react-select DropdownIndicator defaults: neutral20 (rest), neutral40 (rest+hover),
  // neutral60 (focused), neutral80 (focused+hover), neutral10 when disabled.
  const arrowColor = isDisabled ? N.n10 : open ? (arrowHover ? N.n80 : N.n60) : (arrowHover ? N.n40 : N.n20);
  return (
    <div ref={ref} style={{ width: '100%', position: 'relative', fontFamily: 'var(--font-family-base)', pointerEvents: isDisabled ? 'none' : undefined }}>
      {label && (
        /* global .input-label */
        <label style={{ display: 'inline-block', fontWeight: 400, fontSize: 'var(--font-size-xs)', lineHeight: '21px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', marginBottom: 4, padding: '10px 0 0 10px' }}>{label}</label>
      )}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between',
          position: 'relative', minHeight: 44, boxSizing: 'border-box', background: '#fff',
          borderWidth: 1.5, borderStyle: 'solid',
          borderColor: error ? 'var(--status-error)' : open ? 'var(--color-blue)' : 'var(--border-default)',
          borderRadius: formik ? 8 : 4, cursor: 'default', outline: 0, fontSize: 'var(--font-size-s)',
          transition: 'all 100ms',
          boxShadow: error ? 'var(--shadow-error-glow)' : open ? 'var(--shadow-focus-input)' : 'none',
        }}
      >
        {/* ValueContainer: padding 2px 8px — the control itself has no padding, the right-side
           gap comes only from the indicator's own padding below. */}
        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', padding: '2px 8px', overflow: 'hidden', flex: 1, position: 'relative' }}>
          {isMulti
            ? (selectedList.length
              ? selectedList.map((o) => (
                <Chip key={labelOf(o)} label={labelOf(o)} onRemove={() => onChange && onChange(selectedList.filter((s) => labelOf(s) !== labelOf(o)))} />
              ))
              : <span style={{ marginLeft: 2, marginRight: 2, color: 'var(--text-secondary)' }}>{placeholder}</span>)
            : (hasValue
              /* singleValue: color neutral80 (never overridden), neutral40 when disabled. */
              ? <span style={{ marginLeft: 2, marginRight: 2, maxWidth: 'calc(100% - 8px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isDisabled ? N.n40 : N.n80 }}>
                {formatOptionLabel ? formatOptionLabel(value, { context: 'value' }) : labelOf(value)}
              </span>
              /* placeholder colour is the one react-select default DropdownSelect overrides. */
              : <span style={{ marginLeft: 2, marginRight: 2, color: 'var(--text-secondary)' }}>{placeholder}</span>)}
        </span>
        {/* indicatorSeparator (1px, neutral20 / neutral10 disabled) + dropdownIndicator —
           DropdownSelect.tsx overrides neither, but it does hide clearIndicator; the Formik-based
           selects don't, so a multi value there shows react-select's clear cross (neutral20,
           neutral40 on hover) as in prod-screens/31, 33. */}
        <span style={{ display: 'flex', alignItems: 'center', alignSelf: 'stretch', flexShrink: 0 }}>
          {formik && isMulti && hasValue && !isDisabled && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange && onChange([]); }}
              onMouseEnter={() => setClearHover(true)}
              onMouseLeave={() => setClearHover(false)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, color: clearHover ? N.n40 : N.n20, transition: 'color 150ms' }}
            >
              <CrossIcon size={20} />
            </span>
          )}
          <span style={{ alignSelf: 'stretch', width: 1, backgroundColor: isDisabled ? N.n10 : N.n20, marginTop: 8, marginBottom: 8 }} />
          <span
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
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, boxSizing: 'border-box', marginTop: formik ? 8 : 10, minWidth: formik ? undefined : 150, paddingTop: 5, paddingBottom: 5, background: '#fff', borderRadius: 8, boxShadow: '0 6px 12px rgb(0 0 0 / 18%)', zIndex: 1000 }}>
          {/* menuList: 4px vertical padding, maxHeight 300 with its own scroll. */}
          <div style={{ paddingTop: 4, paddingBottom: 4, maxHeight: 300, overflowY: 'auto', position: 'relative', boxSizing: 'border-box' }}>
            {options
              /* hideSelectedOptions defaults to true when isMulti */
              .filter((opt) => !isMulti || !selectedList.some((s) => labelOf(s) === labelOf(opt)))
              .map((opt) => {
                const l = labelOf(opt);
                /* option{backgroundColor: isSelected && !withDescription ? blue : …} — with a
                   description renderer the selected row is NOT highlighted; keyboard focus has
                   no highlight either, because the override drops react-select's primary25. */
                const selected = !isMulti && !withDescription && hasValue && labelOf(value) === l;
                return (
                  <div
                    key={l}
                    onClick={() => { onChange && onChange(isMulti ? selectedList.concat([opt]) : opt); if (!isMulti) setOpen(false); }}
                    /* DropdownSelect sets font-size only on the control, so the menu keeps the
                       inherited 16px body size; CustomFormikSelect sets menu/menuList to 14. */
                    style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: formik ? 'var(--font-size-s)' : 'var(--font-size-base)', cursor: 'default', userSelect: 'none', backgroundColor: selected ? 'var(--color-blue)' : 'transparent', color: selected ? '#fff' : 'var(--text-primary)' }}
                    onMouseEnter={(e) => { if (!selected) e.currentTarget.style.backgroundColor = 'rgba(0, 122, 255, 0.1)'; }}
                    onMouseLeave={(e) => { if (!selected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    {formatOptionLabel ? formatOptionLabel(opt, { context: 'menu' }) : l}
                  </div>
                );
              })}
            {/* NoOptionsMessage: neutral40, 8px 12px, centred. */}
            {options.length === 0 && (
              <div style={{ padding: '8px 12px', textAlign: 'center', fontSize: formik ? 'var(--font-size-s)' : 'var(--font-size-base)', color: N.n40 }}>No options</div>
            )}
          </div>
        </div>
      )}
      {error && errorMessage && (
        <div style={{ position: 'absolute', left: 0, fontSize: formik ? 8 : 10, bottom: formik ? -16 : -20, color: 'var(--status-error)', whiteSpace: 'nowrap' }}>{errorMessage}</div>
      )}
    </div>
  );
}
