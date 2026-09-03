'use client';

import { Button, FormActions, Modal } from '@devscribed/ds';

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
    // A document is what this panel holds, so it takes a width rather than being sized by
    // its content — the system's `Modal` caps it at 70% of the viewport either way.
    <Modal open={open} title="Preview" onClose={onClose} style={{ width: 860 }}>
      <div data-testid="template-preview-modal">
        <iframe
          title="Template preview"
          data-testid="template-preview-frame"
          sandbox=""
          srcDoc={html}
          style={{
            width: '100%',
            height: '60vh',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-l)',
            background: 'var(--surface-card)',
          }}
        />
        <p
          style={{
            margin: 'var(--space-3) 0 0',
            fontSize: 'var(--font-size-s)',
            color: 'var(--text-secondary)',
          }}
        >
          Preview uses sample values. No member data is used.
        </p>

        <div style={{ marginTop: 'var(--space-9)' }}>
          <FormActions>
            <Button onClick={onClose} data-testid="template-preview-close-btn">
              Close
            </Button>
          </FormActions>
        </div>
      </div>
    </Modal>
  );
}
