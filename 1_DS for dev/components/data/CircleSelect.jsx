import React from 'react';

/**
 * CircleSelect — the grey "N+" counter circle that follows CircleList in Team overview's
 * filter panel. In source this is GeneralDropdownSelect (a bare react-select 5.5.6) styled by
 * GeneralDropdownSelect/CustomStyles/CircleControlStyle.tsx and given CustomCheckboxOption
 * rows, with `DropdownIndicator: null`, `isSearchable={false}` and `value={null}` — so the
 * control never shows a value, only the placeholder.
 * CircleControlStyle: control{flex column;justify-content:center;position:relative;padding:0;
 * margin:0;36x36;background:#ccc;border-radius:50%;border:2px solid (#00B6FF when focused,
 * else #FFFFFF);cursor:pointer;transition:transform .2s, z-index .2s;font-size:16;outline:none;
 * z-index:1000; &:hover{transform:scale(1.1)}}, placeholder{padding:0;margin:0;flex column
 * centred;color:#000000;font-size:15}, menu{...base, min-width:300px;width:100%;background:#fff;
 * border:none;border-radius:4;box-shadow:0 6px 12px rgb(0 0 0 / 18%);z-index:1000},
 * menuList{...base, padding:8px;background:#FEFEFE;border-radius:4px;width:100%}.
 * Rows come from CheckBoxOption.module.scss: .optionLayout{flex row space-between;
 * margin-bottom:3px} .optionLabel{400;15px/20px;$appBlack}; the checkbox is
 * CheckboxForOption — a bare native <input type="checkbox"> with an empty label, so it renders
 * at the browser default with no custom styling at all.
 */
export function CircleSelect({ count = 0, options = [], checked = {}, onOptionChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const [hover, setHover] = React.useState(false);
  return (
    <div ref={ref} style={{ position: 'relative', fontFamily: 'var(--font-family-base)' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative',
          padding: 0, margin: 0, width: 36, height: 36, background: '#ccc', borderRadius: '50%',
          borderWidth: 2, borderStyle: 'solid', borderColor: open ? '#00B6FF' : '#FFFFFF',
          cursor: 'pointer', transition: 'transform 0.2s, z-index 0.2s', fontSize: 16, outline: 'none',
          zIndex: 1000, transform: hover ? 'scale(1.1)' : undefined, boxSizing: 'border-box',
        }}
      >
        <span style={{ padding: 0, margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#000000', fontSize: 15 }}>{count}+</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 8, marginBottom: 8, minWidth: 300, width: '100%', background: '#fff', border: 'none', borderRadius: 4, boxShadow: '0 6px 12px rgb(0 0 0 / 18%)', zIndex: 1000, boxSizing: 'border-box' }}>
          <div style={{ padding: 8, background: '#FEFEFE', borderRadius: 4, width: '100%', maxHeight: 300, overflowY: 'auto', boxSizing: 'border-box' }}>
            {options.map((opt) => (
              <div key={opt.value} onClick={() => onOptionChange && onOptionChange(opt)} style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3, cursor: 'pointer' }}>
                <div style={{ fontWeight: 400, fontSize: 15, lineHeight: '20px', color: 'var(--text-primary)' }}>{opt.label}</div>
                <span style={{ display: 'inline-flex', alignItems: 'center', fontWeight: 400, fontSize: 'var(--font-size-s)', lineHeight: '21px', color: '#4f4f4f', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!checked[opt.value]} onChange={() => onOptionChange && onOptionChange(opt)} style={{ margin: 0, cursor: 'pointer' }} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
