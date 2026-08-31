import React from 'react';
import { CloseIcon } from '../icons/Icon.jsx';
import { Button } from '../core/Button.jsx';

/**
 * ConfirmDialog — recreated from components/shared/ConfirmDialog: same shell as Modal but
 * z-index 2001, a description block and a right-aligned decline/accept pair. The accept
 * button is PRIMARY (blue) in source, even for destructive confirmations, and clicking the
 * scrim does not close the dialog — only the close button or a button does.
 */
export function ConfirmDialog({ title, description, open, onClose, onAccept, acceptBtnText = 'Confirm', declineBtnText = 'Cancel', transparentOverlay }) {
  const [closeHover, setCloseHover] = React.useState(false);
  if (!open) return null;
  const handleAccept = () => { onAccept && onAccept(); onClose && onClose(); };
  return (
    <React.Fragment>
      <div style={{ position: 'fixed', inset: 0, zIndex: 2001, backgroundColor: transparentOverlay ? 'transparent' : 'var(--color-overlay-scrim)' }} onClick={(e) => e.stopPropagation()} />
      <div
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          backgroundColor: '#fff', boxShadow: 'var(--shadow-modal)', padding: 20,
          border: '1px solid var(--border-default)', borderRadius: 'var(--radius-l)',
          width: '100%', maxWidth: 600, zIndex: 2001,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ width: '100%', fontFamily: 'var(--font-family-base)', fontWeight: 'var(--font-weight-semibold)', fontSize: 20, lineHeight: '24px', color: 'var(--text-tertiary)' }}>{title}</div>
          {/* .closeBtn svg{13x13; fill:$appGray; transition:transform .3s} :hover svg{scale(1.1)} */}
          <button onClick={onClose} aria-label="Close dialog." onMouseEnter={() => setCloseHover(true)} onMouseLeave={() => setCloseHover(false)} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, color: 'var(--text-secondary)', transform: closeHover ? 'scale(1.1)' : 'none', transition: 'transform 0.3s' }}><CloseIcon /></button>
        </div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ width: '100%', color: 'var(--text-primary)', marginBottom: 20, fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-base)' }}>{description}</div>
          <div style={{ display: 'flex', alignSelf: 'flex-end', gap: 10 }}>
            {/* the width used to come from Button's own `width: '100%'`; it is passed here
                now that §1 has removed it, so these two still fill their 100px slots. */}
            <div style={{ minWidth: 100 }}><Button style={{ width: '100%' }} onClick={onClose}>{declineBtnText}</Button></div>
            <div style={{ minWidth: 100 }}><Button style={{ width: '100%' }} variant="primary" onClick={handleAccept}>{acceptBtnText}</Button></div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}
