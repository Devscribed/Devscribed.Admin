import React from 'react';
import { CloseIcon } from '../icons/Icon.jsx';
import { useDialogFocus } from './useDialogFocus.js';

/**
 * Modal — centered dialog recreated from components/shared/Modal.
 * Opens by animating up from 80% to 50% vertical position with a fade.
 */
export function Modal({
  title, open, onClose, children,
  /* §8 — prod's Modal is a plain <div> that closes only by click, so blue measured no dialog
     role, no `Escape`, no focus trap and no focus return. None of that is a design decision;
     it is a keyboard user being unable to use the dialog at all. The behaviour itself moved to
     `useDialogFocus` when §40 found `ConfirmDialog` had the identical gap. */
  initialFocusRef, style, ...rest
}) {
  const [closeHover, setCloseHover] = React.useState(false);
  const panelRef = React.useRef(null);
  const titleId = React.useId();

  useDialogFocus({ open, onClose, panelRef, initialFocusRef });

  if (!open) return null;
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1001, backgroundColor: 'var(--color-overlay-scrim)' }}
      onClick={onClose}
    >
      <div
        {...rest}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          backgroundColor: '#fff', boxShadow: 'var(--shadow-modal)', padding: 24,
          border: '1px solid var(--border-default)', borderRadius: 'var(--radius-l)',
          maxWidth: '70%', minWidth: 360, maxHeight: '98%', overflow: 'auto', outline: 'none',
          ...style,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div id={titleId} style={{ fontFamily: 'var(--font-family-base)', fontWeight: 'var(--font-weight-semibold)', fontSize: 20, lineHeight: '24px', color: 'var(--text-tertiary)' }}>{title}</div>
          {/* .closeBtn svg{13x13; fill:$appGray; transition:transform .3s} :hover svg{scale(1.1)} */}
          <button type="button" aria-label="Close dialog" onClick={onClose} onMouseEnter={() => setCloseHover(true)} onMouseLeave={() => setCloseHover(false)}
            style={{ display: 'flex', width: 13, height: 13, color: 'var(--text-secondary)', transform: closeHover ? 'scale(1.1)' : 'none', transition: 'transform 0.3s' }}>
            <CloseIcon />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
