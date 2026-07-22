import React from 'react';

export function Eye({ size = 18, style, ...rest }) {
  return (
    <svg {...rest} viewBox="0 0 20 20" width={size} height={size} fill="currentColor" aria-hidden style={style}>
      <path d="M10 4c-3.9 0-7.2 2.4-8.7 5.6a1 1 0 0 0 0 .8C2.8 13.6 6.1 16 10 16s7.2-2.4 8.7-5.6a1 1 0 0 0 0-.8C17.2 6.4 13.9 4 10 4Zm0 10.2c-3 0-5.6-1.8-6.9-4.2C4.4 7.6 7 5.8 10 5.8s5.6 1.8 6.9 4.2c-1.3 2.4-3.9 4.2-6.9 4.2Z" />
      <circle cx="10" cy="10" r="2.6" />
    </svg>
  );
}

export function EyeOff({ size = 18, style, ...rest }) {
  return (
    <svg {...rest} viewBox="0 0 20 20" width={size} height={size} fill="currentColor" aria-hidden style={style}>
      <path d="M10 4c-1.1 0-2.2.2-3.1.5l1.5 1.5c.5-.1 1.1-.2 1.6-.2 3 0 5.6 1.8 6.9 4.2-.6 1.1-1.5 2.1-2.5 2.8l1.3 1.3c1.4-1 2.5-2.4 3.2-3.7a1 1 0 0 0 0-.8C17.2 6.4 13.9 4 10 4Z" />
      <path d="M3.1 2.9 1.9 4.1l2.2 2.2c-1.1 1-2 2.2-2.6 3.3a1 1 0 0 0 0 .8C3 13.6 6.1 16 10 16c1.4 0 2.7-.3 3.9-.9l2.2 2.2 1.2-1.2L3.1 2.9Zm4.1 6.5 3.4 3.4a2.6 2.6 0 0 1-3.4-3.4Zm-1.3-1.3 1 1a4.4 4.4 0 0 0 5.9 5.9l.9.9c-.8.2-1.7.3-2.6.3-3 0-5.6-1.8-6.9-4.2.6-1.2 1.5-2.2 2.6-2.9Z" />
    </svg>
  );
}
