import React from 'react';

export interface CheckboxProps {
  label: string;
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  id?: string;
}

/**
 * Checkbox — a native checkbox and its label. The box itself is the browser's own: it is one
 * of the few controls an operating system draws better than a stylesheet can, and a
 * hand-painted one loses the platform's focus, contrast and high-contrast-mode behaviour.
 */
export function Checkbox({ label, checked, onChange, id }: CheckboxProps) {
  const inputId = id || label;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-family-base)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-s)', lineHeight: 'var(--line-height-label)', /* @literal a step off `--text-tertiary` (#54595E); reconciling them is a visual decision. */ color: '#4f4f4f', cursor: 'pointer', userSelect: 'none' }}>
      <input
        type="checkbox"
        id={inputId}
        checked={checked}
        onChange={onChange}
        /* Deliberately unstyled: 13x13 in the browser's own accent colour, not the system's
           blue. The box is the platform's, and the label beside it is ours. */
        style={{ marginRight: 'var(--space-4)', cursor: 'pointer' }}
      />
      {/* 20px from box to text: the input's own 10px margin plus this 10px. A checkbox label
          sits further from its control than a field label sits from its field, because here
          the two are on one line and the gap is the only thing separating them. */}
      <label htmlFor={inputId} style={{ cursor: 'pointer', paddingLeft: 'var(--space-4)' }}>{label}</label>
    </div>
  );
}
