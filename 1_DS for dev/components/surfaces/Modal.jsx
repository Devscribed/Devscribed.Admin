import React, { useCallback, useEffect, useId, useRef } from 'react';

const Close = () => (
  <svg viewBox="0 0 14 14" width={14} height={14} fill="currentColor" aria-hidden>
    <path d="M7 8.05L1.75 13.3c-.15.15-.325.225-.525.225s-.375-.075-.525-.225a.71.71 0 010-1.05L5.95 7 .7 1.75a.71.71 0 010-1.05C.85.55 1.025.475 1.225.475s.375.075.525.225L7 5.95l5.25-5.25c.15-.15.325-.225.525-.225s.375.075.525.225.225.325.225.525-.075.375-.225.525L8.05 7l5.25 5.25c.15.15.225.325.225.525s-.075.375-.225.525-.325.225-.525.225-.375-.075-.525-.225L7 8.05z"/>
  </svg>
);

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A real dialog, and the only one: `role="dialog"`, `aria-modal`, `Escape` closes,
 * focus is trapped while it is open and returned to the invoking control when it
 * closes.
 *
 * Focus behaviour lives here rather than in each caller because a second dialog
 * component — or a caller that reimplemented the trap — is exactly how two dialogs in
 * one product end up behaving differently. `initialFocusRef` is the one thing a caller
 * decides, and it exists for the destructive case: a cancellation dialog must open on
 * its dismissive control, never on the button that cannot be undone.
 */
export function Modal({
  open,
  title,
  onClose,
  actions,
  children,
  width = 420,
  /** Focused on open. Defaults to the first focusable element in the panel. */
  initialFocusRef,
  style,
  ...rest
}) {
  const panel = useRef(null);
  const restoreTo = useRef(null);
  const titleId = `modal-title-${useId()}`;

  const focusables = useCallback(
    () => [...(panel.current?.querySelectorAll(FOCUSABLE) ?? [])].filter((node) => node.offsetParent !== null),
    [],
  );

  // Remember what had focus, move into the dialog, and hand it back on close — even
  // when the dialog closes because the thing that opened it went away.
  useEffect(() => {
    if (!open) return undefined;
    restoreTo.current = document.activeElement;
    const target = initialFocusRef?.current ?? focusables()[0];
    target?.focus();

    return () => {
      const previous = restoreTo.current;
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open, initialFocusRef, focusables]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const nodes = focusables();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      // Wrap at both ends, and pull focus back in if it has escaped the panel entirely.
      if (event.shiftKey && (active === first || !panel.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.current?.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose, focusables]);

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(36,31,26,.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, zIndex: 100,
    }} onClick={onClose}>
      <div
        {...rest}
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: width,
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-modal)',
          padding: '24px 26px', ...style,
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 18,
        }}>
          <div id={titleId} style={{
            fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--fs-20)',
            letterSpacing: '-.3px', color: 'var(--text)',
          }}>{title}</div>
          {onClose && (
            <button onClick={onClose} aria-label="Close" style={{
              border: 'none', background: 'transparent',
              color: 'var(--text-faint)', cursor: 'pointer', padding: 4, display: 'flex',
            }}><Close /></button>
          )}
        </div>
        {children}
        {actions && (
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>{actions}</div>
        )}
      </div>
    </div>
  );
}
