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
import { Button, Checkbox, FormActions, TextArea, TextInput, Modal, Select } from '@devscribed/ds';
import type { SelectOptionLike } from '@devscribed/ds';
import { focusByTestId } from '@/field-error';
import { optionFor, valueOf } from '@/select';
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

  const typeOptions = TEMPLATE_FIELD_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] }));

  /* "— none —" is the default and means manual entry. */
  const autofillOptions = [
    { value: '', label: '— none —' },
    ...(bindingBroken && boundSource ? [sourceOption(boundSource)] : []),
    ...compatible.map(sourceOption),
  ];

  const filledByOptions = [
    { value: 'sender', label: 'Sender' },
    ...signerRoles
      .filter((role) => role.key.length > 0)
      .map((role) => ({ value: `signer:${role.key}`, label: role.label || role.key })),
  ];

  return (
    <Modal open title={initial ? 'Edit field' : 'Add field'} onClose={onCancel} style={{ width: 520 }}>
      <form onSubmit={submit} noValidate data-testid="template-field-modal">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <TextInput
            label="Key"
            value={key}
            placeholder="contractor_tax_id"
            data-testid="template-field-key-input"
            onChange={(event) => setKey(event.target.value)}
            aria-invalid={errors.key ? true : undefined}
            aria-describedby={errors.key ? 'field-error-key' : undefined}
            error={errors.key}
            errorId="field-error-key"
            wrapperStyle={{ gap: 0 }}
          />
          <TextInput
            label="Label"
            value={label}
            placeholder="Full name"
            data-testid="template-field-label-input"
            onChange={(event) => setLabel(event.target.value)}
            aria-invalid={errors.label ? true : undefined}
            aria-describedby={errors.label ? 'field-error-label' : undefined}
            error={errors.label}
            errorId="field-error-label"
            wrapperStyle={{ gap: 0 }}
          />

          <Select
            label="Type"
            value={optionFor(typeOptions, type)}
            data-testid="template-field-type-select"
            options={typeOptions}
            onChange={(option) => changeType(valueOf(option))}
          />
          <Select
            label="Filled by"
            value={optionFor(filledByOptions, filledBy)}
            data-testid="template-field-filledby-select"
            options={filledByOptions}
            onChange={(option) => setFilledBy(valueOf(option))}
          />
          <div>
            <Select
              label="Autofill from"
              value={optionFor(autofillOptions, autofill)}
              data-testid="template-field-autofill-select"
              options={autofillOptions}
              formatOptionLabel={sourceRow(allSources)}
              isDisabled={catalogue.status === 'loading'}
              placeholder={catalogue.status === 'loading' ? 'Loading sources…' : '— none —'}
              error={Boolean(errors.autofill)}
              errorMessage={errors.autofill}
              errorId="field-error-autofill"
              onChange={(option) => {
                setAutofill(valueOf(option));
                setErrors((prev) => ({ ...prev, autofill: undefined }));
              }}
            />
            <p
              data-testid="template-field-autofill-hint"
              style={{
                margin: '6px 0 0',
                fontSize: 'var(--font-size-s)',
                color: errors.autofill || bindingBroken ? 'var(--status-error)' : 'var(--text-secondary)',
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
            onChange={(event) => setRequired(event.target.checked)}
            label="Required"
            data-testid="template-field-required-checkbox"
          />

          <TextInput
            label="Max length"
            value={maxLength}
            inputMode="numeric"
            data-testid="template-field-maxlength-input"
            onChange={(event) => setMaxLength(event.target.value)}
            wrapperStyle={{ gap: 0 }}
          />

          {type === 'select' && (
            <TextArea
              label="Options"
              id="template-field-options"
              value={options}
              data-testid="template-field-options-input"
              onChange={(event) => setOptions(event.target.value)}
              placeholder="One per line, or comma separated"
              rows={3}
              aria-invalid={errors.options ? true : undefined}
              aria-describedby={errors.options ? 'field-error-options' : undefined}
              error={errors.options}
              errorId="field-error-options"
            />
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-4)',
              padding: 'var(--space-4) var(--space-5)',
              borderRadius: 'var(--radius-l)',
              background: 'var(--surface-sunken)',
              fontFamily: 'var(--font-family-mono)',
              fontSize: 'var(--font-size-s)',
              color: 'var(--text-tertiary)',
            }}
          >
            <span style={{ flex: 1 }}>Insert as: {`{{${key || 'field_key'}}}`}</span>
            <Button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(`{{${key}}}`);
                setCopied(true);
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        <div style={{ marginTop: 'var(--space-9)' }}>
          <FormActions>
            <Button type="button" data-testid="template-field-cancel-btn" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" data-testid="template-field-save-btn">
              Save field
            </Button>
          </FormActions>
        </div>
      </form>
    </Modal>
  );
}

/**
 * `Member · Tax ID`, as the spec's mockup draws it. `Select` has no `optgroup`, so the
 * group travels in the row — which keeps the options in one flat, scannable list and still
 * reads as grouped, because the server returns the catalogue already ordered by group.
 *
 * The option carries **text**, and the row is drawn by `formatOptionLabel` (§21). An option's
 * `label` is what the control announces and what it filters on when searchable, so a node in
 * that slot is a row a screen reader cannot read and a search cannot match; the picture goes
 * where the pictures go.
 */
function sourceOption(source: AutofillSourceDto) {
  return { value: source.key, label: `${source.group} · ${source.label}` };
}

/** The rich row for a catalogue option, looked up by the key the option carries. */
function sourceRow(sources: AutofillSourceDto[]) {
  return (option: SelectOptionLike) => {
    const key = typeof option === 'string' ? option : option.value;
    const source = sources.find((entry) => entry.key === key);
    if (!source) return typeof option === 'string' ? option : option.label;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{source.group} ·</span>
        <span>{source.label}</span>
        {source.sensitive && (
          <span
            title="Sensitive — visible only to an admin and to the member"
            style={{ display: 'inline-flex', color: 'var(--text-secondary)' }}
          >
            <LockIcon size={11} />
          </span>
        )}
      </span>
    );
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
