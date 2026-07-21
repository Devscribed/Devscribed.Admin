import React from 'react';

export function SectionLabel({ children, style, ...rest }) {
  return (
    <div {...rest} style={{
      fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--fs-11)',
      letterSpacing: 1, textTransform: 'uppercase',
      color: 'var(--text-muted)', ...style,
    }}>{children}</div>
  );
}
