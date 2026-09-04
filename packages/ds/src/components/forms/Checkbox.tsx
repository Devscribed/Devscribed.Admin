import React from 'react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  id?: string;
  /** §79 — style for the row, which `...rest` and `style` cannot reach: they address the
   *  `<input>`. `TextInput`'s `wrapperStyle` (§35) for the same reason. */
  wrapperStyle?: React.CSSProperties;
}

/**
 * Checkbox — a native checkbox and its label. The box itself is the browser's own: it is one
 * of the few controls an operating system draws better than a stylesheet can, and a
 * hand-painted one loses the platform's focus, contrast and high-contrast-mode behaviour.
 *
 * §79 — **everything reaches the `<input>`**: `data-testid`, `disabled`, `required`, `name`
 * and every `aria-*`. It forwarded nothing at all, which is rule 3's first clause unmet on a
 * control that is nothing *but* an input — a checkbox no test can find and no reader can be
 * told about. `disabled` also greys the row and drops the pointer cursor, because a label
 * that still invites a click on a box that cannot take one is the one part of this the
 * platform does not draw for us.
 */
export function Checkbox({ label, checked, onChange, id, disabled, wrapperStyle, style, ...rest }: CheckboxProps) {
  const inputId = id || label;
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-family-base)',
        fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-s)',
        lineHeight: 'var(--line-height-label)',
        /* @literal a step off `--text-tertiary` (#54595E); reconciling them is a visual decision. */
        color: disabled ? 'var(--text-secondary)' : '#4f4f4f',
        cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none',
        ...wrapperStyle,
      }}
    >
      <input
        {...rest}
        type="checkbox"
        id={inputId}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        /* Deliberately unstyled: 13x13 in the browser's own accent colour, not the system's
           blue. The box is the platform's, and the label beside it is ours. */
        style={{ marginRight: 'var(--space-4)', cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
      />
      {/* 20px from box to text: the input's own 10px margin plus this 10px. A checkbox label
          sits further from its control than a field label sits from its field, because here
          the two are on one line and the gap is the only thing separating them. */}
      <label
        htmlFor={inputId}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer', paddingLeft: 'var(--space-4)' }}
      >
        {label}
      </label>
    </div>
  );
}
