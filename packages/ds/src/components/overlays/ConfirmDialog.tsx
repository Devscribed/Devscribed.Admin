import React from 'react';
import { CloseIcon } from '../icons/Icon';
import { Button } from '../core/Button';
import { useDialogFocus } from './useDialogFocus';

export interface ConfirmDialogProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  acceptBtnText: string;
  declineBtnText: string;
  onClose: () => void;
  onAccept: () => void;
  transparentOverlay?: boolean;
  /** §40 — `data-testid` for the two buttons, which the component draws itself. */
  acceptTestId?: string;
  declineTestId?: string;
  /**
   * §40 — what to focus when the dialog opens. Defaults to the first focusable element in the
   * panel. Focus is trapped while open and returned to the opener on close, and `Escape` closes.
   * The same treatment §8 gave `Modal`, from the same implementation.
   */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** §41 — a request is in flight: the accept button spins, and nothing here can be pressed. */
  busy?: boolean;
  /**
   * §41 — whether pressing accept also closes. True suits a confirmation that starts work
   * nobody waits on; pass `false` when the caller closes it on the result instead.
   */
  closeOnAccept?: boolean;
  /** §40 — every other attribute reaches the panel; `style` merges over the painted one. */
}

/**
 * ConfirmDialog — `Modal`'s shell over a question: a description block and a right-aligned
 * decline/accept pair, at a higher z-index so it can be raised *from* a `Modal`.
 *
 * Two deliberate differences from `Modal`. **The accept button is primary, even when the
 * action is destructive** — the dialog's whole job is to ask, and a red button in a red-titled
 * dialog makes the answer look like the warning. **The scrim does not close it.** A dialog
 * asking a question a stray click must not answer is closed by the ×, or by answering.
 */
export function ConfirmDialog({
  title, description, open, onClose, onAccept,
  acceptBtnText = 'Confirm', declineBtnText = 'Cancel', transparentOverlay,
  /* §40 — this component draws both buttons, so only it can tag them; `...rest` reaches the
     panel. A confirmation a suite has to press has to be pressable by name. */
  acceptTestId, declineTestId, initialFocusRef, style,
  /* §41 — a confirmation that starts work nobody waits on can dismiss itself on accept. One
     that awaits a result the reader has to see cannot: `busy` spins the accept button and blocks
     both controls, and `closeOnAccept={false}` leaves the dialog standing so the caller closes
     it when the work actually finishes. */
  busy, closeOnAccept = true,
  ...rest
}: ConfirmDialogProps) {
  const [closeHover, setCloseHover] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const titleId = React.useId();

  useDialogFocus({ open, onClose, panelRef, initialFocusRef });

  if (!open) return null;
  const handleAccept = () => {
    if (busy) return;
    if (onAccept) onAccept();
    if (closeOnAccept && onClose) onClose();
  };
  return (
    <React.Fragment>
      <div style={{ position: 'fixed', inset: 0, zIndex: 2001, backgroundColor: transparentOverlay ? 'transparent' : 'var(--color-overlay-scrim)' }} onClick={(e) => e.stopPropagation()} />
      <div
        {...rest}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          backgroundColor: 'var(--surface-overlay)', boxShadow: 'var(--shadow-modal)', padding: 'var(--space-7)',
          border: 'var(--border-width-hairline) solid var(--border-default)', borderRadius: 'var(--radius-l)',
          width: '100%', maxWidth: 600, zIndex: 2001, outline: 'none',
          ...style,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-7)' }}>
          <div id={titleId} style={{ width: '100%', fontFamily: 'var(--font-family-base)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-xl)', lineHeight: 'var(--line-height-m)', color: 'var(--text-tertiary)' }}>{title}</div>
          {/* The close mark scales rather than filling on hover — `IconButton`'s rule (§10). */}
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close dialog." onMouseEnter={() => setCloseHover(true)} onMouseLeave={() => setCloseHover(false)} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, color: 'var(--text-secondary)', transform: closeHover ? 'scale(1.1)' : 'none', transition: 'transform 0.3s' }}><CloseIcon /></button>
        </div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ width: '100%', color: 'var(--text-primary)', marginBottom: 'var(--space-7)', fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-base)' }}>{description}</div>
          <div style={{ display: 'flex', alignSelf: 'flex-end', gap: 'var(--space-4)' }}>
            {/* The composition owns the width, which is §1: a `Button` does not decide how
                much of a row it takes, so these two are told to fill their 100px slots. */}
            <div style={{ minWidth: 100 }}><Button style={{ width: '100%' }} disabled={busy} onClick={onClose} data-testid={declineTestId}>{declineBtnText}</Button></div>
            <div style={{ minWidth: 100 }}><Button style={{ width: '100%' }} variant="primary" preloader={busy} disabled={busy} onClick={handleAccept} data-testid={acceptTestId}>{acceptBtnText}</Button></div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}
