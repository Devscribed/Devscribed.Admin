'use client';

import type { ReactNode } from 'react';
import { ENVELOPE_MESSAGES, validateSignerEmail } from '@devscribed/validation';
import { Checkbox, FieldLabel, TextArea, TextInput, Select } from '@devscribed/ds';
import { optionFor, valueOf } from '@/select';
import type { EnvelopeFieldDto, SigningField } from './envelopes';

/**
 * One template field, rendered as the control its type calls for.
 *
 * Shared by the sender's fill form and the signer's form on the public signing page so
 * that a field looks and validates the same on both sides of the envelope — the two
 * surfaces are the same seven types (spec 01) filled by different people, and having
 * two renderers would be two chances for them to disagree.
 */

export type AnyField = Pick<SigningField, 'key' | 'label' | 'type' | 'required'> & {
  maxLength?: number | null;
  options?: string[] | null;
};

/**
 * Validation rule 5 composed from the package's messages. The rules themselves live in
 * the spec's table (required, max length, and a per-type parse); the *sentences* are
 * `ENVELOPE_MESSAGES.field` and the email pattern is the package's own — nothing here
 * re-declares either.
 */
export function validateFieldValue(field: AnyField, raw: string): string | null {
  const value = field.type === 'checkbox' ? raw : raw.trim();

  if (field.required && value.length === 0) {
    return ENVELOPE_MESSAGES.field.required(field.label);
  }
  if (value.length === 0) return null;

  if (field.maxLength && value.length > field.maxLength) {
    return ENVELOPE_MESSAGES.field.tooLong(field.label, field.maxLength);
  }

  switch (field.type) {
    case 'number':
      return Number.isFinite(Number(value)) ? null : ENVELOPE_MESSAGES.field.invalidNumber;
    case 'date':
      return Number.isNaN(new Date(value).getTime()) ? ENVELOPE_MESSAGES.field.invalidDate : null;
    case 'email':
      // Same pattern and same sentence as every other address in the product.
      return validateSignerEmail(value).valid ? null : ENVELOPE_MESSAGES.field.invalidEmail;
    default:
      return null;
  }
}

/** Runs `validateFieldValue` over a whole set, returning `{ key: message }`. */
export function validateFieldValues(
  fields: readonly AnyField[],
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const message = validateFieldValue(field, values[field.key] ?? '');
    if (message) errors[field.key] = message;
  }
  return errors;
}

/**
 * The message under a control that draws its own label but not its own message slot — the
 * checkbox. `field-error-{key}` is the handle the spec names, and it is an
 * `aria-describedby` target, so the id and the test id are the same string, exactly as
 * `TextInput` (§4) and `Select` (§21) do it for the fields that own theirs.
 */
function FieldError({ fieldKey, message }: { fieldKey: string; message: string }) {
  return (
    <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-s)', color: 'var(--status-error)' }}>
      <span id={`field-error-${fieldKey}`} data-testid={`field-error-${fieldKey}`}>
        {message}
      </span>
    </div>
  );
}

export function FieldInput({
  field,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  testId,
  trailing,
}: {
  field: AnyField;
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
  /** The spec's `envelope-field-{key}` / `signing-field-{key}`. */
  testId: string;
  /** The "from profile" affordance the fill form pins beside an autofilled input. */
  trailing?: ReactNode;
}) {
  const label = field.required ? `${field.label} *` : field.label;
  const described = error ? `field-error-${field.key}` : undefined;

  const control = (() => {
    if (field.type === 'checkbox') {
      return (
        <div>
          <FieldLabel>{label}</FieldLabel>
          <Checkbox
            checked={value === 'true'}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked ? 'true' : '')}
            label={field.label}
            data-testid={testId}
            aria-invalid={error ? true : undefined}
            aria-describedby={described}
          />
          {error && <FieldError fieldKey={field.key} message={error} />}
        </div>
      );
    }

    if (field.type === 'select') {
      const choices = (field.options ?? []).map((option) => ({ value: option, label: option }));
      return (
        <Select
          label={label}
          value={optionFor(choices, value)}
          options={choices}
          isDisabled={disabled}
          onChange={(option) => onChange(valueOf(option))}
          error={Boolean(error)}
          errorMessage={error}
          errorId={`field-error-${field.key}`}
          data-testid={testId}
          aria-describedby={described}
        />
      );
    }

    if (field.type === 'multiline') {
      return (
        <TextArea
          label={label}
          value={value}
          disabled={disabled}
          readOnly={disabled}
          data-testid={testId}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          rows={4}
          error={error}
          errorId={`field-error-${field.key}`}
        />
      );
    }

    const inputType =
      field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text';

    return (
      <TextInput
        label={label}
        type={inputType}
        value={value}
        disabled={disabled}
        readOnly={disabled}
        maxLength={field.maxLength ?? undefined}
        data-testid={testId}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        trailing={trailing}
        error={error}
        errorId={`field-error-${field.key}`}
        wrapperStyle={{ gap: 0 }}
      />
    );
  })();

  return <div>{control}</div>;
}

/** The read-only line the fill form shows for a field the signer will fill. */
export function SignerFieldPreview({
  field,
  ownerName,
}: {
  field: EnvelopeFieldDto;
  ownerName: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 'var(--space-5)',
        padding: '10px 0',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: 'var(--font-size-s)',
      }}
    >
      <span style={{ color: 'var(--text-primary)' }}>
        {field.label}
        {field.required ? ' *' : ''}
      </span>
      <span style={{ color: 'var(--text-secondary)' }}>filled by {ownerName}</span>
    </div>
  );
}
