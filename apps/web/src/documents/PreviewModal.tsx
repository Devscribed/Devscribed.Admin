'use client';

import { Button, Modal } from '@/ds';

/**
 * Template bodies are author-controlled HTML. Rendering them anywhere in the application
 * origin would turn a malicious template into session theft, so the preview is confined
 * to an iframe with an *empty* `sandbox` — no `allow-scripts`, no `allow-same-origin`.
 * `srcDoc` rather than a blob URL keeps the document opaque and same-request.
 */
export function PreviewModal({
  open,
  html,
  onClose,
}: {
  open: boolean;
  html: string;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      title="Preview"
      width={860}
      onClose={onClose}
      actions={
        <Button variant="secondary" onClick={onClose} data-testid="template-preview-close-btn">
          Close
        </Button>
      }
    >
      <div data-testid="template-preview-modal">
        <iframe
          title="Template preview"
          data-testid="template-preview-frame"
          sandbox=""
          srcDoc={html}
          style={{
            width: '100%',
            height: '60vh',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--paper-0)',
          }}
        />
        <p
          style={{
            margin: 'var(--sp-4) 0 0',
            fontSize: 'var(--fs-13)',
            color: 'var(--text-muted)',
          }}
        >
          Preview uses sample values. No member data is used.
        </p>
      </div>
    </Modal>
  );
}
