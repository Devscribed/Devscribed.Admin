'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import {
  TEMPLATE_FIELD_TYPES,
  TEMPLATE_MESSAGES,
  clampMaxLength,
  defaultMaxLength,
  isTypeCompatible,
  validateAutofillSource,
  validateFieldKey,
  validateFieldLabel,
  validateSelectOptions,
  type AutofillValueType,
  type TemplateFieldType,
} from '@devscribed/validation';
import { Button, Checkbox, Input, Modal, Select } from '@/ds';
import { errorNode, focusByTestId } from '@/field-error';
import { LockIcon } from '@/members/icons';
import type { SignerRoleDto, TemplateFieldDto } from './api';
import {
  joinWords,
  useAutofillSources,
  valueTypeLabel,
  type AutofillSourceDto,
} from './autofill-sources';

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
  const [errors, setErrors] = useState<{
    key?: string;
    label?: string;
    options?: string;
    autofill?: string;
  }>({});
  const [copied, setCopied] = useState(false);

  /**
   * The modal is only ever opened from the template editor route, so the organization is
   * already in the URL. Reading it here rather than threading a prop through the editor
   * keeps this change inside the field modal, which is what spec 03 extends.
   */
  const { orgId } = useParams<{ orgId: string }>();
  const catalogue = useAutofillSources(orgId);

  /**
   * Requirement 4 — the options are the *server's* catalogue, filtered by the package's
   * compatibility rule against the type currently selected in this modal. Both halves
   * matter: a hardcoded option list would break requirement 3, and a locally invented
   * filter would be a second copy of a rule the API also enforces at save time.
   */
  const allSources: AutofillSourceDto[] = catalogue.status === 'ready' ? catalogue.sources : [];
  const compatible = useMemo(
    () => allSources.filter((source) => isTypeCompatible(type, source.valueType)),
    [allSources, type],
  );

  /**
   * The binding the author already had, when the type they just picked cannot carry it.
   * Requirement: say so rather than silently dropping it — so the option stays in the
   * list (removing it would render the control blank, which *looks* like a silent drop),
   * the hint turns into the validator's own sentence, and saving is blocked until the
   * author resolves it one way or the other.
   */
  const boundSource = allSources.find((source) => source.key === autofill);
  const bindingBroken =
    autofill.length > 0 &&
    boundSource !== undefined &&
    !isTypeCompatible(type, boundSource.valueType);

  /** Which value types this field type rules out — the mockup's "(date — hidden)" note. */
  const hiddenTypes = useMemo(() => {
    const shown = new Set(compatible.map((source) => source.valueType));
    return [...new Set(allSources.map((source) => source.valueType))].filter(
      (valueType) => !shown.has(valueType),
    );
  }, [allSources, compatible]);

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
    // Validation rule 9, run through the package's own validator so the sentence the
    // author reads here is exactly the one the API would send back.
    const autofillResult = validateAutofillSource(autofill, type);

    if (
      !keyResult.valid ||
      duplicate ||
      !labelResult.valid ||
      !optionsResult.valid ||
      !autofillResult.valid
    ) {
      setErrors({
        key: duplicate
          ? TEMPLATE_MESSAGES.fieldKey.duplicate
          : keyResult.valid
            ? undefined
            : keyResult.error,
        label: labelResult.valid ? undefined : labelResult.error,
        options: optionsResult.valid ? undefined : optionsResult.error,
        autofill: autofillResult.valid ? undefined : autofillResult.error,
      });
      focusByTestId(
        !keyResult.valid || duplicate
          ? 'template-field-key-input'
          : !labelResult.valid
            ? 'template-field-label-input'
            : !optionsResult.valid
              ? 'template-field-options-input'
              : 'template-field-autofill-select',
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
          <div>
            <Select
              label="Autofill from"
              value={autofill}
              data-testid="template-field-autofill-select"
              /* "— none —" is the default and means manual entry. */
              options={[
                { value: '', label: '— none —' },
                ...(bindingBroken && boundSource ? [sourceOption(boundSource)] : []),
                ...compatible.map(sourceOption),
              ]}
              disabled={catalogue.status === 'loading'}
              placeholder={catalogue.status === 'loading' ? 'Loading sources…' : '— none —'}
              error={errors.autofill}
              onChange={(next) => {
                setAutofill(next);
                setErrors((prev) => ({ ...prev, autofill: undefined }));
              }}
            />
            <p
              data-testid="template-field-autofill-hint"
              style={{
                margin: '6px 0 0',
                fontSize: 'var(--fs-13)',
                color: errors.autofill || bindingBroken ? 'var(--error-500)' : 'var(--text-muted)',
              }}
            >
              {autofillHint({
                catalogue: catalogue.status,
                type,
                hiddenTypes,
                compatibleCount: compatible.length,
                brokenSourceLabel: bindingBroken && boundSource ? boundSource.label : null,
                error: errors.autofill,
              })}
            </p>
          </div>

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

/**
 * `Member · Tax ID`, as the spec's mockup draws it. Meridian's `Select` has no
 * `optgroup`, so the group travels in the label — which keeps the options in one flat,
 * scannable list and still reads as grouped, because the server returns the catalogue
 * already ordered by group.
 */
function sourceOption(source: AutofillSourceDto) {
  return {
    value: source.key,
    label: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--text-muted)' }}>{source.group} ·</span>
        <span>{source.label}</span>
        {source.sensitive && (
          <span
            title="Sensitive — visible only to an admin and to the member"
            style={{ display: 'inline-flex', color: 'var(--text-faint)' }}
          >
            <LockIcon size={11} />
          </span>
        )}
      </span>
    ),
  };
}

/**
 * One line under the control, carrying whichever of these is true. The order is
 * severity: a save-blocking error or a broken binding first, then the mockup's "why is
 * this list short" explanation, then the ordinary encouragement.
 */
function autofillHint({
  catalogue,
  type,
  hiddenTypes,
  compatibleCount,
  brokenSourceLabel,
  error,
}: {
  catalogue: 'loading' | 'ready' | 'failed';
  type: TemplateFieldType;
  hiddenTypes: AutofillValueType[];
  compatibleCount: number;
  brokenSourceLabel: string | null;
  error?: string;
}): string {
  if (catalogue === 'loading') return 'Loading the autofill catalogue…';
  if (catalogue === 'failed') {
    return 'The autofill catalogue could not be loaded, so no source can be picked right now.';
  }
  if (error) return error;
  if (brokenSourceLabel) {
    return `“${brokenSourceLabel}” cannot fill a ${type} field. Pick another source, or choose “— none —”.`;
  }
  if (compatibleCount === 0) {
    return `No autofill source can fill a ${type} field — this one is filled by hand.`;
  }
  if (hiddenTypes.length > 0) {
    return `${joinWords(hiddenTypes.map(valueTypeLabel))} sources are hidden because this is a ${type} field.`;
  }
  return 'Leave as “— none —” for manual entry.';
}
