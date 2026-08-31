'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input, Modal } from '@/ds';
import { errorNode } from '@/field-error';
import { useToast } from '@/toast';
import {
  KANBAN_MESSAGES,
  PROJECT_MESSAGES,
  suggestProjectKey,
  validateProjectKey,
  validateProjectName,
} from '@devscribed/validation';
import type { ProjectSummary } from './types';

type Mode =
  | { kind: 'create' }
  | { kind: 'edit'; projectId: string; currentName: string };

/**
 * The Create/Edit Project modal (spec 11 §Create/Edit Project modal + spec 13 delta).
 * One name field with an inline error, plus a spec-13 Project Key field that
 * auto-suggests from the name (while the user has not typed a key themselves) and
 * validates on blur/submit via `validateProjectKey`. Create POSTs `{ name, key? }`;
 * Edit PUTs `{ name }` only — the key is added later on the detail page via the
 * "Add Key" affordance since it is immutable once set.
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
  const [projectKey, setProjectKey] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyTouched, setKeyTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = mode.kind === 'edit';

  // Reset when the modal opens (or the edited project changes): create starts empty,
  // edit pre-fills the current name.
  useEffect(() => {
    if (!open) return;
    setName(mode.kind === 'edit' ? mode.currentName : '');
    setNameError(null);
    setProjectKey('');
    setKeyError(null);
    setKeyTouched(false);
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

  function blurKey() {
    if (isEdit) return;
    if (projectKey.trim().length === 0) {
      setKeyError(null);
      return;
    }
    const result = validateProjectKey(projectKey);
    setKeyError(result.valid ? null : result.error);
  }

  function handleNameChange(value: string) {
    setName(value);
    if (nameError) setNameError(null);
    // Auto-suggest a key while the user has not typed one themselves — never
    // overwrite an intentional edit. Only for create mode; key is immutable in edit.
    if (!isEdit && !keyTouched) {
      setProjectKey(suggestProjectKey(value));
    }
  }

  function handleKeyChange(value: string) {
    setKeyTouched(true);
    setProjectKey(value.toUpperCase());
    if (keyError) setKeyError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const nameResult = validateProjectName(name);
    if (!nameResult.valid) {
      setNameError(nameResult.error);
      return;
    }
    setNameError(null);

    // Key is optional at creation (spec 13 FR-1/FR-2). The user's intent is signaled
    // by `keyTouched`: an untouched key is just an auto-suggestion the user never
    // confirmed, so a rejection there must not block submit — silently omit it and
    // let the project be created keyless (which the user can fix later on the detail
    // page). Only when `keyTouched` do we treat the value as a submission and surface
    // errors inline.
    let keyValue: string | null = null;
    if (!isEdit && projectKey.trim().length > 0) {
      const keyResult = validateProjectKey(projectKey);
      if (keyResult.valid) {
        keyValue = keyResult.value;
      } else if (keyTouched) {
        setKeyError(keyResult.error);
        return;
      }
    }
    setKeyError(null);
    setSubmitting(true);

    const url =
      mode.kind === 'edit'
        ? `/api/organizations/${orgId}/projects/${mode.projectId}`
        : `/api/organizations/${orgId}/projects`;

    const body: { name: string; key?: string } = { name: nameResult.value };
    if (!isEdit && keyValue) body.key = keyValue;

    try {
      const response = await fetch(url, {
        method: mode.kind === 'edit' ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const responseBody = (await response.json().catch(() => null)) as ProjectSummary | null;
        setSubmitting(false);
        onClose();
        if (isEdit) {
          showToast('toast-project-updated', PROJECT_MESSAGES.toastUpdated);
          onSaved?.();
        } else {
          showToast('toast-project-created', PROJECT_MESSAGES.toastCreated);
          if (responseBody) onCreated?.(responseBody);
        }
        return;
      }

      // 409 keeps the modal open with the offending field in error; 400 renders the
      // API's own `errors.*`; anything else is a generic toast.
      const responseBody = await response.json().catch(() => null);
      if (response.status === 409) {
        // Server-side 409 may be either the project-name duplicate (spec 11) or the
        // project-key duplicate (spec 13). The API's `error` slug disambiguates.
        if (responseBody?.error === 'key_duplicate') {
          setKeyError(KANBAN_MESSAGES.projectKeyDuplicate);
        } else {
          setNameError(PROJECT_MESSAGES.nameDuplicate);
        }
      } else if (responseBody?.errors?.name) {
        setNameError(responseBody.errors.name);
      } else if (responseBody?.errors?.key) {
        setKeyError(responseBody.errors.key);
      } else {
        showToast(
          isEdit ? 'toast-project-updated' : 'toast-project-created',
          responseBody?.message ?? PROJECT_MESSAGES.genericError,
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
      <form
        id="project-form"
        onSubmit={submit}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}
      >
        <Input
          label="Project name"
          placeholder="e.g. Client Website Redesign"
          value={name}
          onChange={(event: { target: { value: string } }) => handleNameChange(event.target.value)}
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

        {!isEdit && (
          <Input
            label="Project Key"
            placeholder="e.g. MOB"
            value={projectKey}
            onChange={(event: { target: { value: string } }) => handleKeyChange(event.target.value)}
            onBlur={blurKey}
            readOnly={submitting}
            data-testid="project-key-input"
            aria-invalid={keyError ? true : undefined}
            aria-describedby={keyError ? 'field-error-projectKey' : 'project-key-hint'}
            error={keyError ? errorNode('projectKey', keyError) : undefined}
            hint={
              keyError
                ? undefined
                : ((
                    <span id="project-key-hint">
                      2–10 uppercase letters. Enables the board once set.
                    </span>
                  ) as unknown as string)
            }
            style={submitting ? { opacity: 0.55 } : undefined}
            wrapperStyle={{ gap: 0 }}
          />
        )}
      </form>
    </Modal>
  );
}
