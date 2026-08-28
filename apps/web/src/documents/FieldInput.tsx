'use client';

import type { ReactNode } from 'react';
import { ENVELOPE_MESSAGES, validateSignerEmail } from '@devscribed/validation';
import { Checkbox, Input, Select } from '@/ds';
import { errorNode } from '@/field-error';
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

const LABEL_STYLE = {
  display: 'block',
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--fs-11)',
  letterSpacing: 1,
  textTransform: 'uppercase' as const,
  color: 'var(--text-muted)',
  marginBottom: 6,
};

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
          <span style={LABEL_STYLE}>{label}</span>
          <Checkbox
            checked={value === 'true'}
            disabled={disabled}
            onChange={(checked: boolean) => onChange(checked ? 'true' : '')}
            label={field.label}
            data-testid={testId}
          />
          {error && (
            <div style={{ marginTop: 6, fontSize: 'var(--fs-13)', color: 'var(--error-500)' }}>
              {errorNode(field.key, error)}
            </div>
          )}
        </div>
      );
    }

    if (field.type === 'select') {
      // `Select` takes `error` for its border but renders no message node, so the
      // spec's `field-error-{key}` handle is drawn here rather than inside the DS.
      return (
        <div>
          <Select
            label={label}
            value={value}
            options={(field.options ?? []).map((option) => ({ value: option, label: option }))}
            disabled={disabled}
            onChange={onChange}
            error={error}
            data-testid={testId}
          />
          {error && (
            <div style={{ marginTop: 6, fontSize: 'var(--fs-13)', color: 'var(--error-500)' }}>
              {errorNode(field.key, error)}
            </div>
          )}
        </div>
      );
    }

    if (field.type === 'multiline') {
      // Meridian ships no textarea; `BodyEditor` set the precedent of a plain element
      // carrying the DS field tokens so the two are indistinguishable on screen.
      return (
        <div>
          <span style={LABEL_STYLE}>{label}</span>
          <textarea
            value={value}
            disabled={disabled}
            readOnly={disabled}
            data-testid={testId}
            aria-invalid={error ? true : undefined}
            aria-describedby={described}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            rows={4}
            style={{
              width: '100%',
              resize: 'vertical',
              padding: '10px 12px',
              border: `1.5px solid ${error ? 'var(--error-500)' : 'var(--border-strong)'}`,
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-field)',
              color: 'var(--text)',
              fontFamily: 'var(--font-text)',
              fontSize: 'var(--fs-15)',
              opacity: disabled ? 0.7 : 1,
            }}
          />
          {error && (
            <div style={{ marginTop: 6, fontSize: 'var(--fs-13)', color: 'var(--error-500)' }}>
              {errorNode(field.key, error)}
            </div>
          )}
        </div>
      );
    }

    const inputType =
      field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text';

    return (
      <Input
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
        error={error ? errorNode(field.key, error) : undefined}
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
        gap: 'var(--sp-6)',
        padding: '10px 0',
        borderTop: '1px solid var(--divider)',
        fontSize: 'var(--fs-14)',
      }}
    >
      <span style={{ color: 'var(--text)' }}>
        {field.label}
        {field.required ? ' *' : ''}
      </span>
      <span style={{ color: 'var(--text-muted)' }}>filled by {ownerName}</span>
    </div>
  );
}
