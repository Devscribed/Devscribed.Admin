'use client';

import { useState, type FormEvent } from 'react';
import {
  TEMPLATE_FIELD_TYPES,
  TEMPLATE_MESSAGES,
  clampMaxLength,
  defaultMaxLength,
  validateFieldKey,
  validateFieldLabel,
  validateSelectOptions,
  type TemplateFieldType,
} from '@devscribed/validation';
import { Button, Checkbox, Input, Modal, Select } from '@/ds';
import { errorNode, focusByTestId } from '@/field-error';
import type { SignerRoleDto, TemplateFieldDto } from './api';

const TYPE_LABELS: Record<TemplateFieldType, string> = {
  text: 'Text',
  multiline: 'Multiline',
  number: 'Number',
  date: 'Date',
  email: 'Email',
  select: 'Select',
  checkbox: 'Checkbox',
};

/** Authors type options as a comma- or newline-separated list; the wire shape is an array. */
function parseOptions(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
}

export function FieldModal({
  initial,
  prefillKey,
  signerRoles,
  usedKeys,
  onCancel,
  onSave,
}: {
  /** `null` for "Add field"; an existing row for "Edit field". */
  initial: TemplateFieldDto | null;
  /** Seeded from the validation banner when the author clicks an unknown placeholder. */
  prefillKey?: string;
  signerRoles: SignerRoleDto[];
  /** Keys already taken by *other* fields — the duplicate rule the API also enforces. */
  usedKeys: string[];
  onCancel: () => void;
  onSave: (field: TemplateFieldDto) => void;
}) {
  const [key, setKey] = useState(initial?.key ?? prefillKey ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [type, setType] = useState<TemplateFieldType>(initial?.type ?? 'text');
  const [filledBy, setFilledBy] = useState(initial?.filledBy ?? 'sender');
  const [autofill, setAutofill] = useState(initial?.autofillSource ?? '');
  const [required, setRequired] = useState(initial?.required ?? false);
  const [maxLength, setMaxLength] = useState(
    initial?.maxLength != null ? String(initial.maxLength) : String(defaultMaxLength('text') ?? ''),
  );
  const [options, setOptions] = useState((initial?.options ?? []).join('\n'));
  const [errors, setErrors] = useState<{ key?: string; label?: string; options?: string }>({});
  const [copied, setCopied] = useState(false);

  function changeType(next: string): void {
    const nextType = next as TemplateFieldType;
    setType(nextType);
    // The default is per type (FR-28), so switching type re-seeds the field rather than
    // carrying a limit that belongs to the previous type.
    const fallback = defaultMaxLength(nextType);
    setMaxLength(fallback != null ? String(fallback) : '');
  }

  function submit(event: FormEvent): void {
    event.preventDefault();

    const keyResult = validateFieldKey(key);
    const duplicate = keyResult.valid && usedKeys.includes(keyResult.value);
    const labelResult = validateFieldLabel(label);
    const optionsResult =
      type === 'select' ? validateSelectOptions(parseOptions(options)) : ({ valid: true } as const);

    if (!keyResult.valid || duplicate || !labelResult.valid || !optionsResult.valid) {
      setErrors({
        key: duplicate
          ? TEMPLATE_MESSAGES.fieldKey.duplicate
          : keyResult.valid
            ? undefined
            : keyResult.error,
        label: labelResult.valid ? undefined : labelResult.error,
        options: optionsResult.valid ? undefined : optionsResult.error,
      });
      focusByTestId(
        !keyResult.valid || duplicate
          ? 'template-field-key-input'
          : !labelResult.valid
            ? 'template-field-label-input'
            : 'template-field-options-input',
      );
      return;
    }

    const requested = maxLength.trim().length > 0 ? Number(maxLength) : null;
    onSave({
      id: initial?.id,
      key: keyResult.value,
      label: labelResult.value,
      type,
      required,
      options: type === 'select' ? parseOptions(options) : null,
      maxLength: clampMaxLength(type, Number.isFinite(requested) ? requested : null),
      filledBy,
      autofillSource: autofill.length > 0 ? autofill : null,
      order: initial?.order ?? 0,
    });
  }

  const filledByOptions = [
    { value: 'sender', label: 'Sender' },
    ...signerRoles
      .filter((role) => role.key.length > 0)
      .map((role) => ({ value: `signer:${role.key}`, label: role.label || role.key })),
  ];

  return (
    <Modal open title={initial ? 'Edit field' : 'Add field'} width={520} onClose={onCancel}>
      <form onSubmit={submit} noValidate data-testid="template-field-modal">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
          <Input
            label="Key"
            value={key}
            placeholder="contractor_tax_id"
            data-testid="template-field-key-input"
            onChange={(event) => setKey(event.target.value)}
            aria-invalid={errors.key ? true : undefined}
            aria-describedby={errors.key ? 'field-error-key' : undefined}
            error={errors.key ? errorNode('key', errors.key) : undefined}
            wrapperStyle={{ gap: 0 }}
          />
          <Input
            label="Label"
            value={label}
            placeholder="Full name"
            data-testid="template-field-label-input"
            onChange={(event) => setLabel(event.target.value)}
            aria-invalid={errors.label ? true : undefined}
            aria-describedby={errors.label ? 'field-error-label' : undefined}
            error={errors.label ? errorNode('label', errors.label) : undefined}
            wrapperStyle={{ gap: 0 }}
          />

          <Select
            label="Type"
            value={type}
            data-testid="template-field-type-select"
            options={TEMPLATE_FIELD_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] }))}
            onChange={changeType}
          />
          <Select
            label="Filled by"
            value={filledBy}
            data-testid="template-field-filledby-select"
            options={filledByOptions}
            onChange={setFilledBy}
          />
          {/* Spec 03 owns the autofill catalogue; until it lands the only honest option
              is "no autofill", and the control exists so the shape does not change later. */}
          <Select
            label="Autofill from"
            value={autofill}
            data-testid="template-field-autofill-select"
            options={[{ value: '', label: '— none —' }]}
            onChange={setAutofill}
          />

          <Checkbox
            checked={required}
            onChange={setRequired}
            label="Required"
            data-testid="template-field-required-checkbox"
          />

          <Input
            label="Max length"
            value={maxLength}
            inputMode="numeric"
            data-testid="template-field-maxlength-input"
            onChange={(event) => setMaxLength(event.target.value)}
            wrapperStyle={{ gap: 0 }}
          />

          {type === 'select' && (
            <div>
              <label
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-11)',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: errors.options ? 'var(--error-500)' : 'var(--text-muted)',
                  marginBottom: 6,
                }}
                htmlFor="template-field-options"
              >
                Options
              </label>
              <textarea
                id="template-field-options"
                value={options}
                data-testid="template-field-options-input"
                onChange={(event) => setOptions(event.target.value)}
                placeholder="One per line, or comma separated"
                rows={3}
                aria-invalid={errors.options ? true : undefined}
                aria-describedby={errors.options ? 'field-error-options' : undefined}
                style={{
                  width: '100%',
                  border: `1.5px solid ${errors.options ? 'var(--error-500)' : 'var(--border-strong)'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--sp-5) var(--sp-6)',
                  fontFamily: 'var(--font-text)',
                  fontSize: 'var(--fs-14)',
                  background: 'var(--bg-field)',
                  color: 'var(--text)',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
              {errors.options && (
                <div style={{ marginTop: 'var(--sp-2)', fontSize: 'var(--fs-13)', color: 'var(--error-500)' }}>
                  {errorNode('options', errors.options)}
                </div>
              )}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-5)',
              padding: 'var(--sp-5) var(--sp-6)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-sunken)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--fs-13)',
              color: 'var(--text-sub)',
            }}
          >
            <span style={{ flex: 1 }}>Insert as: {`{{${key || 'field_key'}}}`}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(`{{${key}}}`);
                setCopied(true);
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-5)', marginTop: 'var(--sp-10)' }}>
          <Button
            type="button"
            variant="secondary"
            data-testid="template-field-cancel-btn"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" data-testid="template-field-save-btn">
            Save field
          </Button>
        </div>
      </form>
    </Modal>
  );
}
