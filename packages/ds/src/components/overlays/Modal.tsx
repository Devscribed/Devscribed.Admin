import React from 'react';
import { CloseIcon } from '../icons/Icon';
import { useDialogFocus } from './useDialogFocus';

export interface ModalProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * §8 — what to focus when the dialog opens. Defaults to the first focusable element in the
   * panel. Focus is trapped while open and returned to the opener on close, and `Escape` closes.
   */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Modal — the centred dialog: a white panel on a scrim, capped at 70% of the viewport with a
 * 360px floor, scrolling inside itself rather than growing past the screen.
 */
export function Modal({
  title, open, onClose, children,
  /* §8 — the dialog is a real `role="dialog" aria-modal`, and focus moves into it, is trapped
     while it is open, and returns to the opener when it closes; `Escape` leaves. A panel that
     only closes by click is one a keyboard user cannot leave. The behaviour lives in
     `useDialogFocus`, shared with `ConfirmDialog` (§40). */
  initialFocusRef, style, ...rest
}: ModalProps) {
  const [closeHover, setCloseHover] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
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
          backgroundColor: 'var(--surface-overlay)', boxShadow: 'var(--shadow-modal)', padding: 'var(--space-8)',
          border: 'var(--border-width-hairline) solid var(--border-default)', borderRadius: 'var(--radius-l)',
          maxWidth: '70%', minWidth: 360, maxHeight: '98%', overflow: 'auto', outline: 'none',
          ...style,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-7)' }}>
          <div id={titleId} style={{ fontFamily: 'var(--font-family-base)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-xl)', lineHeight: 'var(--line-height-m)', color: 'var(--text-tertiary)' }}>{title}</div>
          {/* The close mark scales rather than filling on hover — `IconButton`'s rule (§10),
              inline here because this shell draws its own. */}
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
