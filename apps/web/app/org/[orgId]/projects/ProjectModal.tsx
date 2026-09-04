'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, FormActions, Modal, Select, TextInput, type SelectOption } from '@devscribed/ds';
import { optionFor, valueOf } from '@/select';
import { useToast } from '@/toast';
import {
  CLIENT_MESSAGES,
  KANBAN_MESSAGES,
  PROJECT_MESSAGES,
  suggestProjectKey,
  validateProjectKey,
  validateProjectName,
} from '@devscribed/validation';
import type { ProjectSummary } from './types';

/**
 * Row shape returned by `GET /api/organizations/{orgId}/clients?status=active` —
 * duplicated here rather than imported from the clients types file to keep the
 * ProjectModal a self-contained sibling of the clients feature.
 */
interface ActiveClientOption {
  id: string;
  name: string;
  status: 'active' | 'archived';
}

type Mode =
  | { kind: 'create' }
  | {
      kind: 'edit';
      projectId: string;
      currentName: string;
      /**
       * Current client link so the picker defaults to it. `null` (or omitted) →
       * "no client" selected. On save a cleared picker sends `clientId: null`
       * to persist the removal.
       */
      currentClientId?: string | null;
    };

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

  // Client picker (spec organization/01 §Screens). "" == no client selected.
  const [clientId, setClientId] = useState<string>('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [clientOptions, setClientOptions] = useState<ActiveClientOption[]>([]);

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
    setClientId(mode.kind === 'edit' ? (mode.currentClientId ?? '') : '');
    setClientError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fetch active clients whenever the modal opens. Archived clients are excluded
  // by the server (spec 01 §Archiving & Restoring #8), so this shows what a
  // caller may actually select.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(
          `/api/organizations/${orgId}/clients?status=active`,
          { credentials: 'same-origin', signal: controller.signal },
        );
        if (!response.ok) {
          // A 404 here means the caller lacks `manage-clients` — the picker is
          // simply hidden by leaving `clientOptions` empty; the project can
          // still be saved without a client.
          setClientOptions([]);
          return;
        }
        const data = (await response.json()) as { clients: ActiveClientOption[] };
        setClientOptions(data.clients);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setClientOptions([]);
      }
    })();
    return () => controller.abort();
  }, [open, orgId]);

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

    const body: { name: string; key?: string; clientId?: string | null } = {
      name: nameResult.value,
    };
    if (!isEdit && keyValue) body.key = keyValue;
    // Client link (spec organization/01). On create only send a non-empty value
    // (backend treats `undefined` as "no link"); on edit send `null` to clear
    // and the id to set — undefined would preserve the current link, but the
    // picker's controlled state always has a definite value here.
    if (isEdit) {
      body.clientId = clientId === '' ? null : clientId;
    } else if (clientId !== '') {
      body.clientId = clientId;
    }

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
      } else if (responseBody?.error === 'client_archived') {
        // Spec organization/01 Alt Flow D — an archived client id somehow reached
        // the server (stale picker option, direct API call). Show inline on the
        // client field rather than falling through to the toast.
        setClientError(CLIENT_MESSAGES.clientArchived);
      } else if (responseBody?.error === 'client_not_found') {
        setClientError(CLIENT_MESSAGES.clientNotFound);
      } else if (responseBody?.errors?.name) {
        setNameError(responseBody.errors.name);
      } else if (responseBody?.errors?.key) {
        setKeyError(responseBody.errors.key);
      } else if (responseBody?.errors?.clientId) {
        setClientError(responseBody.errors.clientId);
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

  const clientSelectOptions: SelectOption[] = [
    { value: '', label: '— No client —' },
    ...clientOptions.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit Project' : 'New Project'}
      onClose={handleClose}
      data-testid="projects-modal"
    >
      <form
        onSubmit={submit}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-7)' }}
      >
        <TextInput
          label="Project name"
          placeholder="e.g. Client Website Redesign"
          value={name}
          onChange={(event) => handleNameChange(event.target.value)}
          onBlur={blurName}
          readOnly={submitting}
          autoFocus
          data-testid="projects-name-input"
          error={nameError ?? undefined}
          errorId="field-error-projectName"
        />

        {/* Client picker (spec organization/01 §Screens). Optional; the first
            option clears any link. Alphabetical by name (backend returns them
            sorted, spec 01 §List & search). Hidden when the caller has no
            clients yet — the empty options list has just "— No client —". */}
        <Select
          label="Client (optional)"
          /* `value` is an option: bound to the raw id this would draw the client's UUID.
             `optionFor` also keeps `— No client —` *selected* rather than falling back to the
             placeholder, which is the case its own note calls out — the empty string is a
             value like any other when the list offers an option for it. */
          value={optionFor(clientSelectOptions, clientId)}
          onChange={(option) => {
            setClientId(valueOf(option));
            if (clientError) setClientError(null);
          }}
          options={clientSelectOptions}
          isDisabled={submitting}
          variant="formik"
          error={clientError !== null}
          errorMessage={clientError ?? undefined}
          errorId="field-error-client"
          data-testid="project-client-select"
        />

        {!isEdit && (
          <TextInput
            label="Project Key"
            placeholder="e.g. MOB"
            value={projectKey}
            onChange={(event) => handleKeyChange(event.target.value)}
            onBlur={blurKey}
            readOnly={submitting}
            data-testid="project-key-input"
            error={keyError ?? undefined}
            errorId="field-error-projectKey"
            hint="2–10 uppercase letters. Enables the board once set."
            hintId="project-key-hint"
          />
        )}

        <FormActions>
          <Button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            data-testid="projects-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            preloader={submitting}
            data-testid={isEdit ? 'projects-save-btn' : 'projects-create-btn'}
          >
            {isEdit
              ? submitting
                ? 'Saving'
                : 'Save changes'
              : submitting
                ? 'Creating'
                : 'Create project'}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}
