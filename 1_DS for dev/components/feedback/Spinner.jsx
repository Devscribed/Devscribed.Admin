import React from 'react';

export function Spinner({ size = 15, style, ...rest }) {
  return (
    <svg {...rest} viewBox="0 0 16 16" width={size} height={size} fill="none" aria-hidden style={style}>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <path d="M8 1.75A6.25 6.25 0 0 1 14.25 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.7s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}
