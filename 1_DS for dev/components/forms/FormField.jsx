import React from 'react';

/* The deployed app puts `padding: 10px 0 0 10px` on every <label>, so a label block measures
   35px and its text starts 10px right of the control's left edge. That rule is not in
   src/index.scss — it is measured off the deploy (see VERIFICATION.md) and lives here once so
   no screen has to repeat it. */
export const fieldLabelStyle = {
  display: 'inline-block', fontWeight: 400, fontSize: 12, lineHeight: '21px',
  color: 'var(--text-secondary)', marginBottom: 4, whiteSpace: 'nowrap', padding: '10px 0 0 10px',
};

/** Just the label, for controls that render their own input. */
export function FieldLabel({ htmlFor, children, style }) {
  if (!children) return null;
  return <label htmlFor={htmlFor} style={{ ...fieldLabelStyle, ...style }}>{children}</label>;
}

/**
 * Label + control wrapper for anything that is not a system input (a read-only value, a
 * third-party picker, a custom widget). System inputs (TextInput, Select, TextArea) already
 * render their own label — do not wrap those.
 */
export function FormField({ label, htmlFor, width, children, style }) {
  return (
    <div style={{ width, ...style }}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
    </div>
  );
}
