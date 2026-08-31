import React from 'react';

/**
 * IconButton — §10. Blue never promoted this to a component, but it specifies the treatment
 * exactly: the Modal and ConfirmDialog close buttons are a bare glyph in `--text-secondary`
 * that scales to 1.1 on hover over 0.3s, with no background, border or radius of its own
 * ("icon buttons (modal close) scale to 1.1", readme → Visual foundations → Hover states).
 * This is that button with a label and a hit area, so a glyph-only control is still reachable
 * by name and still big enough to press.
 *
 * `active` paints the glyph with the primary blue, which is what blue does everywhere a
 * control reads as current (nav links, popover rows, tabs).
 */
export const IconButton = React.forwardRef(function IconButton({
  label, size = 34, active, disabled, style, children, onMouseEnter, onMouseLeave, type = 'button', ...rest
}, ref) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      aria-label={label}
      disabled={disabled}
      onMouseEnter={(e) => { setHover(true); if (onMouseEnter) onMouseEnter(e); }}
      onMouseLeave={(e) => { setHover(false); if (onMouseLeave) onMouseLeave(e); }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, padding: 0, background: 'transparent', border: 0,
        color: active ? 'var(--action-primary)' : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transform: hover && !disabled ? 'scale(1.1)' : 'none',
        transition: 'transform var(--duration-hover), var(--transition-color-hover)',
        ...style,
      }}
    >
      {children}
    </button>
  );
});
