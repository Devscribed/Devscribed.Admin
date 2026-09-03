'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input, Modal } from '@/ds';
import {
  CLIENT_MESSAGES,
  CLIENT_USER_MESSAGES,
  validateClientContactEmail,
} from '@devscribed/validation';
import type { ClientContactRow } from '../types';

/**
 * Requests spec 03 — invite a person at this client to be a contact.
 *
 * One address field. The submit control is disabled only while the call is in flight,
 * never for validation: clicking an invalid form shows the error and focuses the field.
 * An address that already contacts a client of the organization keeps the modal open with
 * the error under the field and the typed address intact, and that error is
 * `CLIENT_USER_MESSAGES.alreadyLinked` from the shared validation package — no
 * user-facing message is written here.
 */
export function InviteContactModal({
  open,
  orgId,
  clientId,
  onClose,
  onInvited,
}: {
  open: boolean;
  orgId: string;
  clientId: string;
  onClose: () => void;
  onInvited: (contact: ClientContactRow) => void;
}) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setEmailError(null);
    setFormError(null);
    setSubmitting(false);
  }, [open]);

  function focusEmail(): void {
    document
      .querySelector<HTMLInputElement>('[data-testid="client-contact-invite-email"]')
      ?.focus();
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    const parsed = validateClientContactEmail(email);
    if (!parsed.valid) {
      setEmailError(parsed.error);
      setFormError(null);
      focusEmail();
      return;
    }

    setEmailError(null);
    setFormError(null);
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/clients/${clientId}/contacts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ email: parsed.value }),
        },
      );
      if (response.status === 201) {
        const body = (await response.json().catch(() => null)) as
          | { contact: ClientContactRow }
          | null;
        setSubmitting(false);
        if (body?.contact) onInvited(body.contact);
        onClose();
        return;
      }
      const body = await response.json().catch(() => null);
      if (response.status === 409) {
        // The address already contacts a client of this workspace: the modal stays open
        // with the typed address where it is.
        setEmailError(body?.message ?? CLIENT_USER_MESSAGES.alreadyLinked);
        focusEmail();
      } else if (body?.fields?.email) {
        setEmailError(body.fields.email as string);
        focusEmail();
      } else {
        setFormError(body?.message ?? CLIENT_MESSAGES.toastServerError);
      }
    } catch {
      setFormError(CLIENT_MESSAGES.toastServerError);
    }
    setSubmitting(false);
  }

  return (
    <Modal
      open={open}
      title="Invite contact"
      onClose={() => {
        if (!submitting) onClose();
      }}
      width={480}
      data-testid="client-contact-invite-modal"
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onClose}
            disabled={submitting}
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="client-contact-invite-form"
            variant="primary"
            size="lg"
            loading={submitting}
            data-testid="client-contact-invite-submit"
            style={{ flex: 1 }}
          >
            {submitting ? 'Sending' : 'Send invitation'}
          </Button>
        </>
      }
    >
      <form id="client-contact-invite-form" onSubmit={submit} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
          <div>
            <Input
              label="Email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (emailError) setEmailError(null);
              }}
              error={emailError ?? undefined}
              data-testid="client-contact-invite-email"
            />
            {emailError && (
              <div
                data-testid="client-contact-invite-error-email"
                style={{
                  fontFamily: 'var(--font-text)',
                  fontSize: 'var(--fs-12)',
                  color: 'var(--error-500)',
                  marginTop: 'var(--sp-2)',
                }}
              >
                {emailError}
              </div>
            )}
          </div>

          <div
            style={{
              fontFamily: 'var(--font-text)',
              fontSize: 'var(--fs-13)',
              color: 'var(--text-muted)',
            }}
          >
            They will be emailed an invitation. Once they accept, requests can be addressed
            to them and they can answer in the product.
          </div>

          {formError && (
            <div
              style={{
                fontFamily: 'var(--font-text)',
                fontSize: 'var(--fs-13)',
                color: 'var(--error-500)',
              }}
            >
              {formError}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
