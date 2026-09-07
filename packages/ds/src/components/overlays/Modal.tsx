import React from 'react';
import { CloseIcon } from '../icons/Icon';
import { useDialogFocus } from './useDialogFocus';
import { useHoverState } from '../../useViewport';

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
  /**
   * The dialog's actions. In the sheet form below `sm` this becomes a **sticky footer** while the
   * body scrolls under it; above `sm` it is the last row of the panel and nothing about it is
   * special (design-system 01 §10.51).
   *
   * There is no `variant="sheet"` to pass. The form is the component's own, decided by width in
   * `base.css`, because §10.56 says a screen chooses its overlay by meaning and never by width —
   * so there is nothing here for a caller to set and no default to override.
   *
   * Without it a sheet has no footer and the body scrolls to its end, which is correct for a
   * dialog whose actions belong with the text they follow.
   */
  actions?: React.ReactNode;
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
  initialFocusRef, actions, className, style, ...rest
}: ModalProps) {
  const [closeHover, setCloseHover] = useHoverState();
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
        /* §10.49-51 — the sheet form below `sm`. The class is always on the panel and the
           media query in `base.css` is what switches: a JavaScript branch here would put the
           form back into hydration, and would let a caller reach it. */
        className={["ds-sheet", className].filter(Boolean).join(" ")}
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
        <div className="ds-sheet-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-7)' }}>
          <div id={titleId} style={{ fontFamily: 'var(--font-family-base)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-xl)', lineHeight: 'var(--line-height-m)', color: 'var(--text-tertiary)' }}>{title}</div>
          {/* The close mark scales rather than filling on hover — `IconButton`'s rule (§10),
              inline here because this shell draws its own. */}
          <button type="button" className="ds-dialog-close" aria-label="Close dialog" onClick={onClose} onMouseEnter={() => setCloseHover(true)} onMouseLeave={() => setCloseHover(false)}
            style={{ display: 'flex', width: 13, height: 13, color: 'var(--text-secondary)', transform: closeHover ? 'scale(1.1)' : 'none', transition: 'transform 0.3s' }}>
            <CloseIcon />
          </button>
        </div>
        <div className="ds-sheet-body">{children}</div>
        {actions && (
          <div className="ds-sheet-actions" data-testid="sheet-actions">{actions}</div>
        )}
      </div>
    </div>
  );
}
