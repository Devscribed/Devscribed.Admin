'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input, Modal } from '@/ds';
import { errorNode } from '@/field-error';
import { useToast } from '@/toast';
import { CLIENT_MESSAGES, validateClientName } from '@devscribed/validation';
import type { ClientSummary } from './types';

/**
 * Create-vs-edit is a discriminated union rather than two booleans so a stale
 * `clientId` cannot survive a mode flip. Edit carries the current name so the
 * input reflects the row the caller clicked without waiting on a fetch.
 */
type Mode = { kind: 'create' } | { kind: 'edit'; clientId: string; currentName: string };

/**
 * Create / Rename Client modal (spec organization/01 §Screens). One name field
 * with an inline error. Submit is *never* disabled for validation (CLAUDE.md
 * rule); it re-runs the request, and 409 `client_name_taken` keeps the modal
 * open with the inline error set to `CLIENT_MESSAGES.nameDuplicate`.
 */
export function ClientModal({
  open,
  mode,
  orgId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  mode: Mode;
  orgId: string;
  onClose: () => void;
  onSuccess?: (client: ClientSummary) => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = mode.kind === 'edit';

  useEffect(() => {
    if (!open) return;
    setName(mode.kind === 'edit' ? mode.currentName : '');
    setNameError(null);
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  function blurName() {
    if (name.trim().length === 0) return; // don't show "required" while empty on blur
    const result = validateClientName(name);
    setNameError(result.valid ? null : result.error);
  }

  function handleNameChange(value: string) {
    setName(value);
    if (nameError) setNameError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const result = validateClientName(name);
    if (!result.valid) {
      // Focus the name field (and surface the error) — never disable the submit.
      setNameError(result.error);
      document
        .querySelector<HTMLInputElement>('[data-testid="client-name-input"]')
        ?.focus();
      return;
    }
    setNameError(null);
    setSubmitting(true);

    const url =
      mode.kind === 'edit'
        ? `/api/organizations/${orgId}/clients/${mode.clientId}`
        : `/api/organizations/${orgId}/clients`;

    try {
      const response = await fetch(url, {
        method: mode.kind === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name: result.value }),
      });

      if (response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { client: ClientSummary }
          | null;
        setSubmitting(false);
        onClose();
        showToast(
          isEdit ? 'toast-client-updated' : 'toast-client-created',
          isEdit ? CLIENT_MESSAGES.toastUpdated : CLIENT_MESSAGES.toastCreated,
        );
        if (body?.client) onSuccess?.(body.client);
        else onSuccess?.(undefined as unknown as ClientSummary);
        return;
      }

      const body = await response.json().catch(() => null);
      if (response.status === 409 && body?.error === 'client_name_taken') {
        setNameError(CLIENT_MESSAGES.nameDuplicate);
      } else if (response.status === 422 && body?.error === 'validation_error') {
        setNameError(body?.fields?.name ?? CLIENT_MESSAGES.nameRequired);
      } else {
        showToast('toast-server-error', CLIENT_MESSAGES.toastServerError, 'error');
      }
    } catch {
      showToast('toast-server-error', CLIENT_MESSAGES.toastServerError, 'error');
    }
    setSubmitting(false);
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Rename Client' : 'New Client'}
      onClose={handleClose}
      width={480}
      data-testid="client-modal"
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={handleClose}
            disabled={submitting}
            data-testid="client-cancel-btn"
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="client-form"
            variant="primary"
            size="lg"
            loading={submitting}
            data-testid="client-save-btn"
            style={{ flex: 1 }}
          >
            {isEdit
              ? submitting
                ? 'Saving'
                : 'Save'
              : submitting
                ? 'Creating'
                : 'Create client'}
          </Button>
        </>
      }
    >
      {/* Modal title needs its own testid, distinct from the modal container.
          The DS `Modal` renders its own header, so we tag the visible label with
          a hidden marker span for tests. */}
      <span
        data-testid="client-modal-title"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
      >
        {isEdit ? 'Rename Client' : 'New Client'}
      </span>
      <form
        id="client-form"
        onSubmit={submit}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}
      >
        <Input
          label="Client name"
          placeholder="e.g. Acme Corp"
          value={name}
          onChange={(event: { target: { value: string } }) => handleNameChange(event.target.value)}
          onBlur={blurName}
          readOnly={submitting}
          autoFocus
          data-testid="client-name-input"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? 'field-error-name' : undefined}
          error={nameError ? errorNode('name', nameError) : undefined}
          style={submitting ? { opacity: 0.55 } : undefined}
          wrapperStyle={{ gap: 0 }}
        />
      </form>
    </Modal>
  );
}
