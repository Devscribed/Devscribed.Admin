import React from 'react';

export function Skeleton({ rows = 3, height = 18, gap = 'var(--sp-6)', style, ...rest }) {
  return (
    // Decorative by construction: the surrounding copy carries the "loading" meaning,
    // so a screen reader is told once rather than once per row.
    <div {...rest} aria-hidden style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} style={{
          height,
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-sunken)',
          // Widths taper so a block of rows reads as content rather than as a bar chart.
          width: index === rows - 1 ? '62%' : '100%',
        }} />
      ))}
    </div>
  );
}
