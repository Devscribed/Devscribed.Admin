'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, FormActions, Modal, TextInput } from '@devscribed/ds';
import { focusByTestId } from '@/field-error';
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
      focusByTestId('client-name-input');
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
      data-testid="client-modal"
    >
      {/* The hidden `client-modal-title` copy is gone: §8's `Modal` names the dialog with its
          own heading through `aria-labelledby`, and the span existed only because the previous
          shell could not tag one. The spec's roster records the removal. */}
      <form
        onSubmit={submit}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-7)' }}
      >
        <TextInput
          label="Client name"
          placeholder="e.g. Acme Corp"
          value={name}
          onChange={(event) => handleNameChange(event.target.value)}
          onBlur={blurName}
          readOnly={submitting}
          autoFocus
          data-testid="client-name-input"
          error={nameError ?? undefined}
          errorId="field-error-name"
        />

        <FormActions>
          <Button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            data-testid="client-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            preloader={submitting}
            data-testid="client-save-btn"
          >
            {isEdit
              ? submitting
                ? 'Saving'
                : 'Save'
              : submitting
                ? 'Creating'
                : 'Create client'}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}
