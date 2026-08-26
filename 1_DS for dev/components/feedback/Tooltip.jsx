import React, { useId, useState } from 'react';

const PLACEMENTS = {
  bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6 },
  top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6 },
  left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: 6 },
  right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 6 },
};

/**
 * A reason attached to the thing it explains. Shown on hover *and* on focus, because
 * the patterns that need it — a disabled delete, a last-admin guard — are exactly the
 * ones a keyboard reaches without a pointer ever arriving.
 *
 * The bubble carries an id and the caller points `aria-describedby` at it, so the
 * reason is announced rather than merely seen. `render` hands that id back for the
 * cases where the anchor is built by the caller.
 */
export function Tooltip({ content, id, placement = 'bottom', testId, style, children }) {
  const generated = useId();
  const tooltipId = id || `tooltip-${generated}`;
  const [shown, setShown] = useState(false);

  const anchor = typeof children === 'function' ? children(tooltipId) : children;

  return (
    <span
      style={{ position: 'relative', display: 'block', ...style }}
      onMouseEnter={() => setShown(true)}
      onMouseLeave={() => setShown(false)}
      // Focus events bubble in React, so a focusable anchor anywhere inside reveals it.
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
    >
      {anchor}
      {content && (
        <span
          id={tooltipId}
          role="tooltip"
          data-testid={testId}
          style={{
            position: 'absolute',
            zIndex: 70,
            width: 'max-content',
            maxWidth: 240,
            padding: '7px 10px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-pop)',
            fontFamily: 'var(--font-text)',
            fontSize: 'var(--fs-12)',
            lineHeight: 'var(--lh-normal)',
            color: 'var(--text-sub)',
            // Never hidden from assistive technology: `aria-describedby` has to resolve
            // whether or not a pointer is anywhere near it.
            visibility: shown ? 'visible' : 'hidden',
            opacity: shown ? 1 : 0,
            transition: 'opacity var(--duration-fast) var(--easing-standard)',
            pointerEvents: 'none',
            ...PLACEMENTS[placement],
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
