import React from 'react';

export interface CheckboxProps {
  label: string;
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  id?: string;
}

/**
 * Checkbox — recreated from components/shared/forms/CustomCheckbox (native checkbox + label).
 */
export function Checkbox({ label, checked, onChange, id }: CheckboxProps) {
  const inputId = id || label;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-family-base)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-s)', lineHeight: '21px', color: '#4f4f4f', cursor: 'pointer', userSelect: 'none' }}>
      <input
        type="checkbox"
        id={inputId}
        checked={checked}
        onChange={onChange}
        /* CustomCheckbox.module.scss styles only the wrapper and the 10px gap — the box itself is
           an unstyled native checkbox (13x13, the browser's own accent; measured rgb(1,117,255)
           in prod-screens/03.png, i.e. Chrome's default, not $appBlue). */
        style={{ marginRight: 10, cursor: 'pointer' }}
      />
      {/* the deployed build pads every <label> with 10px 0 0 10px (see the label note in
          CLAUDE.md): the gap from box to text measures 20px, not the module's 10
          (uploads/…policies copy 2, 2x: box ends 973, text starts 1015). */}
      <label htmlFor={inputId} style={{ cursor: 'pointer', paddingLeft: 10 }}>{label}</label>
    </div>
  );
}
