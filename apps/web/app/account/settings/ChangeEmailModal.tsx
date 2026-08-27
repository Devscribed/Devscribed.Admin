'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, InfoBanner, Input, Modal } from '@/ds';
import { errorNode } from '@/field-error';
import { MESSAGES, validateEmail } from '@devscribed/validation';

/**
 * Change Email modal (spec 06 · Main Flow B). Mirrors `InviteModal`: a `<form>` in the
 * body, buttons in the `Modal actions` footer, blur+submit validation, an `InfoBanner`
 * for the server error. On success the whole form is replaced by the confirmation
 * message — no toast (design doc: the toast is reserved for the Edit Information save).
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
      <Modal
        open={open}
        title="Change email"
        onClose={handleClose}
        width={480}
        actions={
          <Button type="button" variant="primary" size="lg" onClick={handleClose} style={{ flex: 1 }}>
            Close
          </Button>
        }
      >
        <div
          data-testid="change-email-confirmation-message"
          role="alert"
          aria-live="polite"
          style={{ fontSize: 'var(--fs-15)', lineHeight: 'var(--lh-normal)', color: 'var(--text-sub)' }}
        >
          A confirmation link has been sent to {sentTo}. Please check your inbox.
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title="Change email"
      onClose={handleClose}
      width={480}
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={handleClose}
            disabled={submitting}
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="change-email-form"
            variant="primary"
            size="lg"
            loading={submitting}
            disabled={!emailValid}
            data-testid="change-email-submit-button"
            style={{ flex: 1 }}
          >
            {submitting ? 'Sending' : 'Send confirmation'}
          </Button>
        </>
      }
    >
      <form id="change-email-form" onSubmit={submit} noValidate data-testid="change-email-form">
        <div
          style={{
            marginBottom: 'var(--sp-7)',
            fontSize: 'var(--fs-14)',
            color: 'var(--text-sub)',
          }}
        >
          Current email: {currentEmail}
        </div>

        <Input
          label="New email address"
          type="email"
          placeholder="you@company.com"
          value={newEmail}
          onChange={(event: { target: { value: string } }) => {
            setNewEmail(event.target.value);
            // A server error stops applying the moment the visitor edits the email.
            setBanner(null);
          }}
          onBlur={blurEmail}
          readOnly={submitting}
          data-testid="change-email-new-input"
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? 'field-error-newEmail' : undefined}
          error={emailError ? errorNode('newEmail', emailError) : undefined}
          style={submitting ? { opacity: 0.55 } : undefined}
          wrapperStyle={{ gap: 0 }}
        />

        {banner && (
          <div style={{ marginTop: 'var(--sp-8)' }}>
            <InfoBanner tone="error" role="alert" aria-live="polite" data-testid="change-email-error">
              {banner}
            </InfoBanner>
          </div>
        )}
      </form>
    </Modal>
  );
}
