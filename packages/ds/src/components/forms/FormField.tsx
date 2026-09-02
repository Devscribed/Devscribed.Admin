import React from 'react';

export interface FieldLabelProps {
  htmlFor?: string;
  /** §64 — appends the `aria-hidden` asterisk. The requirement itself is the control's. */
  required?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  width?: number | string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/* The field-label treatment, in one place. Every label in the system is 12px regular in
   `--text-secondary`, inset 10px from the control's left edge and 10px down from whatever is
   above it, so a label block measures 35px. `TextInput`, `TextArea` and `Select` each render
   this inline because they draw their own label; anything else reaches for it here. */
export const fieldLabelStyle: React.CSSProperties = {
  display: 'inline-block', fontWeight: 400, fontSize: 12, lineHeight: '21px',
  color: 'var(--text-secondary)', marginBottom: 4, whiteSpace: 'nowrap', padding: '10px 0 0 10px',
};

/**
 * §64 — the trailing asterisk on a required field's label.
 *
 * A form where everything is required needs no marker. One where some things are and some are
 * not does: the vacancy dialog asks for five things and three of them are mandatory, and a
 * form that only tells you which on submit is a form you have to submit to read.
 *
 * `aria-hidden`, always. The requirement itself reaches a reader through the control's own
 * `required` / `aria-required` — which every one of these forwards (§3, §25, §21) — and a
 * label announced as "Title star" says the same thing a second time, worse.
 */
export function RequiredMark() {
  return <span aria-hidden="true">*</span>;
}

/** Just the label, for controls that render their own input. */
export function FieldLabel({ htmlFor, required, children, style }: FieldLabelProps) {
  if (!children) return null;
  return (
    <label htmlFor={htmlFor} style={{ ...fieldLabelStyle, ...style }}>
      {children}
      {required && <RequiredMark />}
    </label>
  );
}

/**
 * Label + control wrapper for anything that is not a system input (a read-only value, a
 * third-party picker, a custom widget). System inputs (TextInput, Select, TextArea) already
 * render their own label — do not wrap those.
 */
export function FormField({ label, htmlFor, required, width, children, style }: FormFieldProps) {
  return (
    <div style={{ width, ...style }}>
      <FieldLabel htmlFor={htmlFor} required={required}>{label}</FieldLabel>
      {children}
    </div>
  );
}
