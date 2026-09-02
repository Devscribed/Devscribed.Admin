import React from 'react';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Accessible name — the button draws only a glyph, so this is the only name it has. */
  label: string;
  /** Hit area in px. The glyph inside keeps its own size. Default 34. */
  size?: number;
  /** Paints the glyph with the primary blue, as anything reading as *current* is painted. */
  active?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
  type?: 'button' | 'submit';
}

/**
 * IconButton — §10. A glyph-only control: a bare mark in `--text-secondary` on no background,
 * border or radius of its own, scaling to 1.1 on hover over 0.3s. **Icon buttons scale; they do
 * not fill** — that is the system's hover rule for a control with no box.
 *
 * The label and the hit area are what make it a control rather than a picture. A glyph has no
 * text to be named by, so `label` is required, and 34px is the smallest square worth aiming at.
 *
 * `active` paints the glyph with the primary blue, which is how anything reading as *current*
 * is painted throughout — nav links, popover rows, tabs.
 *
 * Takes a `ref` to the `<button>`, which is what a popover trigger anchors to.
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({
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
