'use client';

import { useState, type FormEvent } from 'react';
import { Button, FormActions, Modal, Select, TextInput } from '@devscribed/ds';
import { optionFor, valueOf } from '@/select';
import { focusByTestId } from '@/field-error';
import {
  REQUEST_MESSAGES,
  REQUEST_TOPIC_MESSAGES,
  validateTopicAudience,
  validateTopicName,
  validateTopicType,
} from '@devscribed/validation';
import type { RequestTopicRow } from './types';

/**
 * Add-vs-rename as a discriminated union rather than two booleans, so a stale row cannot
 * survive a mode flip — the `HolidayModal` / `ClientModal` pattern.
 */
export type RequestTopicModalMode =
  | { kind: 'add'; audience: 'staff' | 'client' }
  | { kind: 'rename'; topic: RequestTopicRow };

type Field = 'name' | 'audience' | 'type';

/** Reading order of the form — "the first invalid field" means the first of these. */
const FOCUS_ORDER: readonly Field[] = ['name', 'audience', 'type'];

const FIELD_INPUT_TESTID: Record<Field, string> = {
  name: 'request-topic-name',
  audience: 'request-topic-audience',
  type: 'request-topic-type',
};

/**
 * Module constants rather than array literals in the markup: `value` takes the *option* a
 * stored value stands for, and `optionFor` finds it by identity of value — a list rebuilt
 * on every render is a new set of objects each time.
 */
const AUDIENCE_OPTIONS = [
  { value: 'staff', label: 'Staff' },
  { value: 'client', label: 'Client' },
];

const TYPE_OPTIONS = [
  { value: 'access', label: 'Access' },
  { value: 'question', label: 'Question' },
];

/**
 * Add / rename a request topic (requests spec 02 §Screens).
 *
 * The audience and the kind are drawn when adding and neither when renaming: both are
 * immutable after creation (REQ-02-004), and a control that cannot act is not drawn.
 *
 * Every rule here is the shared one from `packages/validation` and the server re-runs all
 * of them. The submit control is disabled only while the call is in flight, never for
 * validation: an invalid submission renders every field error and moves focus to the
 * first invalid field. A duplicate name keeps the modal open with the message under the
 * field and the typed value intact.
 */
export function RequestTopicModal({
  open,
  mode,
  orgId,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: RequestTopicModalMode;
  orgId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isRename = mode.kind === 'rename';

  // Seeded once, at mount: the page mounts this component when the modal opens and
  // unmounts it when it closes, so "reset the form for a new target" is React's own
  // mount rather than an effect that has to guess when to re-seed.
  const [name, setName] = useState(() => (mode.kind === 'rename' ? mode.topic.name : ''));
  const [audience, setAudience] = useState<string>(() =>
    mode.kind === 'add' ? mode.audience : mode.topic.audience,
  );
  const [type, setType] = useState<string>(() =>
    mode.kind === 'rename' ? mode.topic.type : 'access',
  );
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleClose(): void {
    if (submitting) return;
    onClose();
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    const fields: Partial<Record<Field, string>> = {};
    const nameResult = validateTopicName(name);
    if (!nameResult.valid) fields.name = nameResult.error;
    // The audience and the kind are only *chosen* while adding; on a rename they are the
    // stored values and are not sent at all.
    if (!isRename) {
      const audienceResult = validateTopicAudience(audience);
      if (!audienceResult.valid) fields.audience = audienceResult.error;
      const typeResult = validateTopicType(type);
      if (!typeResult.valid) fields.type = typeResult.error;
    }

    if (Object.keys(fields).length > 0) {
      setErrors(fields);
      setFormError(null);
      const first = FOCUS_ORDER.find((field) => fields[field]);
      if (first) focusByTestId(FIELD_INPUT_TESTID[first]);
      return;
    }

    setErrors({});
    setFormError(null);
    setSubmitting(true);

    const url = isRename
      ? `/api/organizations/${orgId}/request-topics/${(mode as { topic: RequestTopicRow }).topic.id}`
      : `/api/organizations/${orgId}/request-topics`;
    const body = isRename
      ? { name: nameResult.valid ? nameResult.value : name }
      : { audience, type, name: nameResult.valid ? nameResult.value : name };

    try {
      const response = await fetch(url, {
        method: isRename ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setSubmitting(false);
        onClose();
        onSaved();
        return;
      }
      const failure = await response.json().catch(() => null);
      if (response.status === 409) {
        // The modal stays open, the message goes under the name field, and the typed
        // value is left exactly as it was.
        setErrors({ name: failure?.message ?? REQUEST_TOPIC_MESSAGES.nameDuplicate });
      } else if (failure?.fields && typeof failure.fields === 'object') {
        setErrors(failure.fields as Partial<Record<Field, string>>);
      } else {
        setFormError(failure?.message ?? REQUEST_MESSAGES.genericError);
      }
    } catch {
      setFormError(REQUEST_MESSAGES.genericError);
    }
    setSubmitting(false);
  }

  const title = isRename ? 'Rename topic' : 'Add topic';

  return (
    <Modal
      open={open}
      title={title}
      onClose={handleClose}
      data-testid="request-topic-modal"
    >
      <form
        id="request-topic-form"
        onSubmit={submit}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-7)' }}
      >
        {/* `errorId` keeps `request-topic-error-name` on the node the cases address —
            it is the field's own message slot now rather than a sibling this file draws. */}
        <TextInput
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          data-testid="request-topic-name"
          error={errors.name}
          errorId="request-topic-error-name"
        />

        {/* Neither control is drawn on a rename: both fields are immutable, and a
            control that cannot act is not drawn (REQ-02-004). */}
        {!isRename && (
          <>
            <Select
              label="Audience"
              value={optionFor(AUDIENCE_OPTIONS, audience)}
              options={AUDIENCE_OPTIONS}
              onChange={(option) => setAudience(valueOf(option))}
              error={errors.audience != null}
              errorMessage={errors.audience}
              data-testid="request-topic-audience"
            />
            <Select
              label="Kind"
              value={optionFor(TYPE_OPTIONS, type)}
              options={TYPE_OPTIONS}
              onChange={(option) => setType(valueOf(option))}
              error={errors.type != null}
              errorMessage={errors.type}
              data-testid="request-topic-type"
            />
          </>
        )}

        {formError && (
          <div
            style={{
              fontFamily: 'var(--font-family-base)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--status-error)',
            }}
          >
            {formError}
          </div>
        )}

        <FormActions>
          <Button type="button" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          {/* Disabled only for the duration of the call — never for validation. */}
          <Button
            type="submit"
            variant="primary"
            preloader={submitting}
            disabled={submitting}
            data-testid="request-topic-submit"
          >
            {isRename ? 'Save' : 'Add topic'}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}
