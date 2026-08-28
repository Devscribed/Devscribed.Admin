'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input, Modal } from '@/ds';
import { errorNode } from '@/field-error';
import { useToast } from '@/toast';
import { PROJECT_MESSAGES, validateProjectName } from '@devscribed/validation';
import type { ProjectSummary } from './types';

type Mode =
  | { kind: 'create' }
  | { kind: 'edit'; projectId: string; currentName: string };

/**
 * The Create/Edit Project modal (spec 11 §Create/Edit Project modal). One name field,
 * inline error node (`field-error-projectName`) fed by the API's `errors.name`, the 409
 * duplicate message, or a client `validateProjectName` result. Create POSTs then hands
 * the new project up (`onCreated`) for the caller to navigate; Edit PUTs then refetches
 * (`onSaved`). The modal owns its own toast on success.
 */
export function ProjectModal({
  open,
  mode,
  orgId,
  onClose,
  onCreated,
  onSaved,
}: {
  open: boolean;
  mode: Mode;
  orgId: string;
  onClose: () => void;
  onCreated?: (project: ProjectSummary) => void;
  onSaved?: () => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = mode.kind === 'edit';

  // Reset when the modal opens (or the edited project changes): create starts empty,
  // edit pre-fills the current name.
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
    const result = validateProjectName(name);
    setNameError(result.valid ? null : result.error);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const result = validateProjectName(name);
    if (!result.valid) {
      setNameError(result.error);
      return;
    }
    setNameError(null);
    setSubmitting(true);

    const url =
      mode.kind === 'edit'
        ? `/api/organizations/${orgId}/projects/${mode.projectId}`
        : `/api/organizations/${orgId}/projects`;

    try {
      const response = await fetch(url, {
        method: mode.kind === 'edit' ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name: result.value }),
      });

      if (response.ok) {
        const body = (await response.json().catch(() => null)) as ProjectSummary | null;
        setSubmitting(false);
        onClose();
        if (isEdit) {
          showToast('toast-project-updated', PROJECT_MESSAGES.toastUpdated);
          onSaved?.();
        } else {
          showToast('toast-project-created', PROJECT_MESSAGES.toastCreated);
          if (body) onCreated?.(body);
        }
        return;
      }

      // 409 duplicate keeps the modal open with the field in error; 400 renders the
      // API's own `errors.name`; anything else is a generic toast.
      const body = await response.json().catch(() => null);
      if (response.status === 409) {
        setNameError(PROJECT_MESSAGES.nameDuplicate);
      } else if (body?.errors?.name) {
        setNameError(body.errors.name);
      } else {
        showToast(
          isEdit ? 'toast-project-updated' : 'toast-project-created',
          body?.message ?? PROJECT_MESSAGES.genericError,
          'error',
        );
      }
    } catch {
      showToast(
        isEdit ? 'toast-project-updated' : 'toast-project-created',
        PROJECT_MESSAGES.genericError,
        'error',
      );
    }
    setSubmitting(false);
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit Project' : 'New Project'}
      onClose={handleClose}
      width={480}
      data-testid="projects-modal"
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={handleClose}
            disabled={submitting}
            data-testid="projects-cancel-btn"
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="project-form"
            variant="primary"
            size="lg"
            loading={submitting}
            data-testid={isEdit ? 'projects-save-btn' : 'projects-create-btn'}
            style={{ flex: 1 }}
          >
            {isEdit
              ? submitting
                ? 'Saving'
                : 'Save changes'
              : submitting
                ? 'Creating'
                : 'Create project'}
          </Button>
        </>
      }
    >
      <form id="project-form" onSubmit={submit} noValidate>
        <Input
          label="Project name"
          placeholder="e.g. Client Website Redesign"
          value={name}
          onChange={(event: { target: { value: string } }) => {
            setName(event.target.value);
            if (nameError) setNameError(null);
          }}
          onBlur={blurName}
          readOnly={submitting}
          autoFocus
          data-testid="projects-name-input"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? 'field-error-projectName' : undefined}
          error={nameError ? errorNode('projectName', nameError) : undefined}
          style={submitting ? { opacity: 0.55 } : undefined}
          wrapperStyle={{ gap: 0 }}
        />
      </form>
    </Modal>
  );
}
