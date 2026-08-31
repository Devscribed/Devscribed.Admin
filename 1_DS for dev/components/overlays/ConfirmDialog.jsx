import React from 'react';
import { CloseIcon } from '../icons/Icon.jsx';
import { Button } from '../core/Button.jsx';
import { useDialogFocus } from './useDialogFocus.js';

/**
 * ConfirmDialog — recreated from components/shared/ConfirmDialog: same shell as Modal but
 * z-index 2001, a description block and a right-aligned decline/accept pair. The accept
 * button is PRIMARY (blue) in source, even for destructive confirmations, and clicking the
 * scrim does not close the dialog — only the close button or a button does.
 */
export function ConfirmDialog({
  title, description, open, onClose, onAccept,
  acceptBtnText = 'Confirm', declineBtnText = 'Cancel', transparentOverlay,
  /* §40 — blue destructures eight props and forwards nothing, and it draws both buttons itself,
     so `data-testid` reached neither the panel nor either control. Prod has no test ids; a
     confirmation a suite has to press does. */
  acceptTestId, declineTestId, initialFocusRef, style,
  /* §41 — prod's confirmations are fire-and-forget, so blue dismisses on accept and has no
     notion of a request being in flight. Ours await one whose result the member has to see.
     `busy` paints the accept button's preloader and blocks both controls; `closeOnAccept={false}`
     leaves the dialog up so the caller can close it when the work actually finishes. */
  busy, closeOnAccept = true,
  ...rest
}) {
  const [closeHover, setCloseHover] = React.useState(false);
  const panelRef = React.useRef(null);
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
          backgroundColor: '#fff', boxShadow: 'var(--shadow-modal)', padding: 20,
          border: '1px solid var(--border-default)', borderRadius: 'var(--radius-l)',
          width: '100%', maxWidth: 600, zIndex: 2001, outline: 'none',
          ...style,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div id={titleId} style={{ width: '100%', fontFamily: 'var(--font-family-base)', fontWeight: 'var(--font-weight-semibold)', fontSize: 20, lineHeight: '24px', color: 'var(--text-tertiary)' }}>{title}</div>
          {/* .closeBtn svg{13x13; fill:$appGray; transition:transform .3s} :hover svg{scale(1.1)} */}
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close dialog." onMouseEnter={() => setCloseHover(true)} onMouseLeave={() => setCloseHover(false)} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, color: 'var(--text-secondary)', transform: closeHover ? 'scale(1.1)' : 'none', transition: 'transform 0.3s' }}><CloseIcon /></button>
        </div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ width: '100%', color: 'var(--text-primary)', marginBottom: 20, fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-base)' }}>{description}</div>
          <div style={{ display: 'flex', alignSelf: 'flex-end', gap: 10 }}>
            {/* the width used to come from Button's own `width: '100%'`; it is passed here
                now that §1 has removed it, so these two still fill their 100px slots. */}
            <div style={{ minWidth: 100 }}><Button style={{ width: '100%' }} disabled={busy} onClick={onClose} data-testid={declineTestId}>{declineBtnText}</Button></div>
            <div style={{ minWidth: 100 }}><Button style={{ width: '100%' }} variant="primary" preloader={busy} disabled={busy} onClick={handleAccept} data-testid={acceptTestId}>{acceptBtnText}</Button></div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}
