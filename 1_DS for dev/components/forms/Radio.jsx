import React from 'react';

export function Radio({ checked, onChange, label, disabled, name, value, style, ...rest }) {
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      fontFamily: 'var(--font-text)', fontSize: 'var(--fs-15)', color: 'var(--text-sub)',
      cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none',
      opacity: disabled ? 0.55 : 1, ...style,
    }} {...rest}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%',
        background: 'var(--bg-field)',
        border: checked ? '6px solid var(--accent)' : '1.5px solid var(--border-strong)',
        display: 'inline-flex', flexShrink: 0, boxSizing: 'border-box',
        transition: 'border-color .12s, border-width .12s',
      }} />
      <input type="radio" name={name} value={value} checked={!!checked} disabled={disabled}
        onChange={(e) => onChange && onChange(e.target.checked)}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
      {label}
    </label>
  );
}

export function RadioGroup({ value, onChange, options = [], name = 'radio', direction = 'column', disabled, style, ...rest }) {
  return (
    <div role="radiogroup" style={{ display: 'flex', flexDirection: direction, gap: direction === 'row' ? 20 : 12, ...style }} {...rest}>
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        const od = disabled || (typeof o === 'object' && o.disabled);
        return (
          <Radio key={v} name={name} value={v} label={l} checked={v === value} disabled={od}
            onChange={() => onChange && onChange(v)} />
        );
      })}
    </div>
  );
}
