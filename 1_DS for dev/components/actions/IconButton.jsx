import React from 'react';

export function IconButton({ label, size = 34, active, disabled, style, children, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      {...rest}
      type={rest.type || 'button'}
      aria-label={label}
      disabled={disabled}
      onMouseEnter={(e) => { setHover(true); rest.onMouseEnter && rest.onMouseEnter(e); }}
      onMouseLeave={(e) => { setHover(false); rest.onMouseLeave && rest.onMouseLeave(e); }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, padding: 0,
        border: '1.5px solid transparent', borderRadius: 'var(--radius-sm)',
        background: hover && !disabled ? 'var(--hover-bg-tint)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transition: 'background var(--duration-base) var(--easing-standard),color var(--duration-base) var(--easing-standard)',
        ...style,
      }}
    >{children}</button>
  );
}
