'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, FormActions, InfoBanner, Modal, TextInput } from '@devscribed/ds';
import { MESSAGES, validateEmail } from '@devscribed/validation';

/**
 * Change Email modal (spec 06 · Main Flow B). Mirrors `InviteModal`: a `<form>` in the
 * body, blur+submit validation, an `InfoBanner` for the server error. On success the whole
 * form is replaced by the confirmation message — no toast (design doc: the toast is
 * reserved for the Edit Information save).
 *
 * The buttons sit in `FormActions` (§63) inside the dialog rather than in an `actions` slot
 * the system's `Modal` does not have, and the dialog takes the system's own width rather
 * than naming one — which is D1, layout included.
 */
export function ChangeEmailModal({
  open,
  currentEmail,
  onClose,
}: {
  open: boolean;
  currentEmail: string;
  onClose: () => void;
}) {
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Form state resets on next open (design — Interactions).
  useEffect(() => {
    if (!open) return;
    setNewEmail('');
    setEmailError(null);
    setBanner(null);
    setSubmitting(false);
    setSentTo(null);
  }, [open]);

  const emailValid = validateEmail(newEmail).valid;

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  function blurEmail() {
    const result = validateEmail(newEmail);
    setEmailError(result.valid ? null : result.error);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const result = validateEmail(newEmail);
    if (!result.valid) {
      setEmailError(result.error);
      return;
    }

    setEmailError(null);
    setBanner(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/account/change-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ newEmail: result.value }),
      });

      if (response.ok) {
        setSubmitting(false);
        setSentTo(result.value);
        return;
      }

      const body = await response.json().catch(() => null);
      setBanner(
        response.status >= 400 && response.status < 500
          ? (body?.message ?? MESSAGES.generic)
          : MESSAGES.generic,
      );
    } catch {
      setBanner(MESSAGES.generic);
    }
    setSubmitting(false);
  }

  // Success body — replaces the form, only a Close affordance remains.
  if (sentTo) {
    return (
      <Modal open={open} title="Change email" onClose={handleClose}>
        <div
          data-testid="change-email-confirmation-message"
          role="alert"
          aria-live="polite"
          style={{
            fontSize: 'var(--font-size-base)',
            lineHeight: 'var(--line-height-base)',
            color: 'var(--text-tertiary)',
          }}
        >
          A confirmation link has been sent to {sentTo}. Please check your inbox.
        </div>
        <div style={{ marginTop: 'var(--space-9)' }}>
          <FormActions>
            <Button type="button" variant="primary" onClick={handleClose}>
              Close
            </Button>
          </FormActions>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} title="Change email" onClose={handleClose}>
      <form id="change-email-form" onSubmit={submit} noValidate data-testid="change-email-form">
        <div
          style={{
            marginBottom: 'var(--space-7)',
            fontSize: 'var(--font-size-s)',
            color: 'var(--text-tertiary)',
          }}
        >
          Current email: {currentEmail}
        </div>

        <TextInput
          label="New email address"
          type="email"
          placeholder="you@company.com"
          value={newEmail}
          onChange={(event) => {
            setNewEmail(event.target.value);
            // A server error stops applying the moment the visitor edits the email.
            setBanner(null);
          }}
          onBlur={blurEmail}
          readOnly={submitting}
          data-testid="change-email-new-input"
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? 'field-error-newEmail' : undefined}
          error={emailError ?? undefined}
          errorId="field-error-newEmail"
          style={submitting ? { opacity: 0.55 } : undefined}
        />

        {banner && (
          <div style={{ marginTop: 'var(--space-6)' }}>
            <InfoBanner
              variant="error"
              role="alert"
              aria-live="polite"
              data-testid="change-email-error"
            >
              {banner}
            </InfoBanner>
          </div>
        )}

        <div style={{ marginTop: 'var(--space-9)' }}>
          <FormActions>
            <Button type="button" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              preloader={submitting}
              disabled={!emailValid}
              data-testid="change-email-submit-button"
            >
              {submitting ? 'Sending' : 'Send confirmation'}
            </Button>
          </FormActions>
        </div>
      </form>
    </Modal>
  );
}
