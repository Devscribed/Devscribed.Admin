import React, { useState, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const Chev = () => (
  <svg viewBox="0 0 12 8" width={12} height={8} fill="currentColor" style={{ transform: 'rotate(180deg)' }} aria-hidden>
    <path d="M5.99991 0.924943C5.89991 0.924943 5.80824 0.94161 5.72491 0.974943C5.64157 1.00828 5.55824 1.06661 5.47491 1.14994L0.524905 6.09994C0.391572 6.23328 0.329072 6.41244 0.337405 6.63744C0.345739 6.86244 0.416572 7.04161 0.549905 7.17494C0.716572 7.34161 0.895739 7.41244 1.08741 7.38744C1.27907 7.36244 1.44991 7.28328 1.59991 7.14994L5.99991 2.74994L10.3999 7.14994C10.5332 7.28328 10.7124 7.35828 10.9374 7.37494C11.1624 7.39161 11.3416 7.31661 11.4749 7.14994C11.6416 7.01661 11.7124 6.84161 11.6874 6.62494C11.6624 6.40828 11.5832 6.22494 11.4499 6.07494L6.5249 1.14994C6.44157 1.06661 6.35824 1.00828 6.2749 0.974943C6.19157 0.94161 6.09991 0.924943 5.99991 0.924943Z"/>
  </svg>
);

/** Space kept between the field and the edge of the viewport when the list has to flip up. */
const VIEWPORT_MARGIN = 8;
/** The gap the list used to get from `marginTop: 6` while it was a sibling of the field. */
const LIST_GAP = 6;

export function Select({ label, value, options = [], onChange, placeholder = 'Select…', error, disabled, style, wrapperStyle, ...rest }) {
  const [open, setOpen] = useState(false);
  /**
   * Viewport coordinates for the option list. The list is rendered in a portal on
   * `document.body` (see below), so it is positioned `fixed` from the trigger's own
   * `getBoundingClientRect()` rather than flowing under it.
   */
  const [rect, setRect] = useState(null);
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const box = trigger.getBoundingClientRect();
    const below = window.innerHeight - box.bottom - VIEWPORT_MARGIN;
    const above = box.top - VIEWPORT_MARGIN;
    // Flip above the field only when there is genuinely more room there — a list that
    // jumps sides on every scroll tick is worse than one that scrolls internally.
    const flip = below < 180 && above > below;
    setRect({
      left: box.left,
      width: box.width,
      top: flip ? null : box.bottom + LIST_GAP,
      bottom: flip ? window.innerHeight - box.top + LIST_GAP : null,
      maxHeight: Math.max(120, (flip ? above : below) - LIST_GAP),
    });
  }, []);

  // Layout, not passive: the list mounts with no `rect` and would paint one frame at
  // `left: 0; width: 0` before a passive effect could measure the trigger — a visible
  // flash in the corner of the screen. Measuring before the browser paints removes it.
  // (React 19 no longer warns about this hook during server rendering, and `open` is
  // false there in any case.)
  useLayoutEffect(() => {
    if (!open) return;
    measure();

    const close = (e) => {
      // The list no longer lives inside `ref`, so an outside click has to clear both the
      // field and the portalled panel — otherwise `mousedown` would unmount the list
      // before the option's own `click` ever fired, and picking a value would do nothing.
      const inField = ref.current && ref.current.contains(e.target);
      const inList = listRef.current && listRef.current.contains(e.target);
      if (!inField && !inList) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      // Escape must hand the caret back to where the user was, not to the document.
      if (triggerRef.current) triggerRef.current.focus();
    };
    // Capture phase: an ancestor scroll container (a card, a table, a modal body) scrolls
    // without bubbling a scroll event to the window, and the fixed panel would otherwise
    // stay behind while the field it belongs to moved away.
    const reposition = () => measure();

    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, measure]);

  const borderColor = error ? 'var(--error-500)' : (open && !disabled ? 'var(--accent)' : 'var(--border-strong)');
  const current = options.find((o) => (typeof o === 'string' ? o : o.value) === value);
  const label2 = current ? (typeof current === 'string' ? current : current.label) : placeholder;

  const list = (
    <div
      ref={listRef}
      role="listbox"
      style={{
        position: 'fixed',
        left: rect ? rect.left : 0,
        width: rect ? rect.width : 0,
        top: rect && rect.top !== null ? rect.top : undefined,
        bottom: rect && rect.bottom !== null ? rect.bottom : undefined,
        maxHeight: rect ? rect.maxHeight : undefined,
        overflowY: 'auto',
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-pop)',
        // A child of <body>, so this only has to order against other body-level layers:
        // above the Modal overlay (100) so a Select inside a dialog works, below the app's
        // toasts (200) so a message is never hidden behind an open list.
        zIndex: 150,
      }}>
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        const isCurrent = v === value;
        return (
          <a key={v} href="#" role="option" aria-selected={isCurrent}
            onClick={(e) => {
              e.preventDefault();
              onChange && onChange(v);
              setOpen(false);
              // Focus goes back to the field so the next Tab continues from the form,
              // not from the top of the document.
              if (triggerRef.current) triggerRef.current.focus();
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-bg-tint)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = isCurrent ? 'var(--accent-soft)' : 'transparent')}
            style={{
              display: 'block', padding: '10px 14px',
              fontFamily: 'var(--font-text)', fontSize: 'var(--fs-14)',
              textDecoration: 'none',
              color: isCurrent ? 'var(--accent)' : 'var(--text)',
              background: isCurrent ? 'var(--accent-soft)' : 'transparent',
            }}>{l}</a>
        );
      })}
    </div>
  );

  return (
    <div ref={ref} style={{ position: 'relative', ...wrapperStyle }}>
      {label && (
        <label style={{
          display: 'block', fontFamily: 'var(--font-display)', fontSize: 'var(--fs-11)',
          letterSpacing: 1, textTransform: 'uppercase',
          color: error ? 'var(--error-500)' : 'var(--text-muted)', marginBottom: 6,
        }}>{label}</label>
      )}
      <button
        ref={triggerRef}
        type="button" disabled={disabled} onClick={() => !disabled && setOpen((v) => !v)}
        aria-haspopup="listbox" aria-expanded={open} {...rest}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', height: 'var(--field-h-lg)',
          border: `1.5px solid ${borderColor}`, borderRadius: 'var(--radius-lg)',
          padding: '0 6px 0 12px',
          fontFamily: 'var(--font-text)', fontSize: 'var(--fs-15)',
          color: current ? 'var(--text)' : 'var(--text-muted)',
          background: 'var(--bg-field)', cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          transition: 'border-color .15s', ...style,
        }}>
        <span style={{ textAlign: 'left' }}>{label2}</span>
        <span style={{ padding: 8, color: 'var(--text-faint)', display: 'flex' }}><Chev /></span>
      </button>
      {/*
        The list is portalled to <body> instead of being absolutely positioned inside this
        wrapper. Cards and tables clip their children (`overflow: hidden`) to keep their
        rounded corners, which cropped the open list to a few pixels wherever a Select sat
        inside one. Escaping the DOM subtree is the only fix that cannot be re-broken by a
        future ancestor. `document` is guarded for server rendering; `open` is only ever
        true after a click, so the server never reaches this branch anyway.
      */}
      {open && typeof document !== 'undefined' && createPortal(list, document.body)}
    </div>
  );
}
