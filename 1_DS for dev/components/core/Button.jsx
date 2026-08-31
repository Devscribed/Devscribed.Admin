import React from 'react';

const spinKeyframes = `@keyframes ds-btn-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
/* Button.module.scss .title svg{margin-top:6px;width:20px;height:20px;fill:#fff}. The margin-top
   has no layout effect on an inline svg, and the icon measures dead centre in prod
   (prod-screens/03.png: ink 1449-1487 vs button 1425-1511, 2x), so the box is centred here. */
.ds-btn-title { display: flex; align-items: center; justify-content: center; }
.ds-btn-title > svg { width: 20px; height: 20px; fill: #fff; }`;

/* Injected once into <head> rather than rendered next to the button: a sibling <style> is a
   real element, so it breaks a consumer's `button + button` rules and :nth-child counts. */
if (typeof document !== 'undefined' && !document.getElementById('ds-btn-style')) {
  const el = document.createElement('style');
  el.id = 'ds-btn-style';
  el.textContent = spinKeyframes;
  document.head.appendChild(el);
}

function base(variant, disabled) {
  const common = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    padding: '0 8px',
    height: 44,
    border: '1.5px solid transparent',
    borderRadius: 'var(--radius-l)',
    fontFamily: 'var(--font-family-base)',
    fontSize: 16,
    fontWeight: 'var(--font-weight-button)',
    lineHeight: '24px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'var(--transition-opacity-hover), var(--transition-filter-hover)',
    boxSizing: 'border-box',
  };
  if (variant === 'primary') {
    return { ...common, backgroundColor: 'var(--action-primary)', borderColor: 'var(--action-primary)', color: 'var(--action-primary-text)' };
  }
  if (variant === 'delete') {
    return { ...common, backgroundColor: 'var(--action-danger)', borderColor: 'var(--action-danger)', color: 'var(--action-danger-text)' };
  }
  return { ...common, backgroundColor: 'var(--surface-card)', borderColor: 'var(--border-default)', color: 'var(--action-neutral-text)' };
}

/**
 * Button — primary action control, recreated from components/shared/Button.
 * Variants: default (outlined neutral), primary (solid blue), delete (solid red).
 * Hover: default fades to 60% opacity; primary/delete brighten via filter — never darken with a new color.
 */
export function Button({ variant, icon, preloader, disabled, children, onClick, type = 'button' }) {
  const [hover, setHover] = React.useState(false);
  const style = base(variant, disabled);
  if (hover && !disabled) {
    if (variant === 'primary' || variant === 'delete') style.filter = 'brightness(90%)';
    else style.opacity = 0.6;
  }
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={style}
    >
      {(icon || preloader) && <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, flexShrink: 0 }}>{icon}</span>}
      <span className="ds-btn-title" style={{ margin: '0 10px' }}>{children}</span>
      {(icon || preloader) && (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, flexShrink: 0 }}>
          {preloader && (
            <span style={{ display: 'flex', width: 20, height: 20, animation: 'ds-btn-spin 2s linear infinite' }}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3">
                <circle cx="12" cy="12" r="9" opacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" />
              </svg>
            </span>
          )}
        </span>
      )}
    </button>
  );
}
