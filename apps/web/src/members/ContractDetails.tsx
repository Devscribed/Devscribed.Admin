'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  COUNTRY_OPTIONS,
  PROFILE_LIMITS,
  PROFILE_MESSAGES,
  SENSITIVE_PROFILE_FIELDS,
  canEditProfile,
  canReadProfilePii,
  countryName,
  isMaskedValue,
  validateProfileField,
} from '@devscribed/validation';
import { Button, Card, FormActions, InfoBanner, TextArea, TextInput, Select, Preloader } from '@devscribed/ds';
import { focusByTestId } from '@/field-error';
import { optionFor, valueOf } from '@/select';
import { apiRequest, failureMessage } from '@/documents/api';
import { useToast } from '@/toast';
import {
  PROFILE_FIELDS,
  PROFILE_LABELS,
  formatBirthDate,
  formatUpdatedDay,
  isProfileEmpty,
  memberProfileUrl,
  type MemberProfileDto,
  type MemberProfilePatch,
  type ProfileField,
} from './api';
import { LockIcon } from './icons';

/**
 * The **Contract details** tab of the member detail screen (spec 03, requirement 15).
 *
 * Two things about this component are load-bearing rather than incidental:
 *
 * 1. The **server** decides what may be read and written. `maskedFields` says which
 *    values in this response are masks, and `canEdit` says whether a write is allowed.
 *    The client capability helpers are applied on top as a second gate, so a stale or
 *    over-permissive response can never put a control on screen that the role does not
 *    have — but they are never used to *widen* what the server sent.
 * 2. A masked field is never rendered as an editable input (requirements 20 and 22). It
 *    is absent from the form entirely rather than disabled with a mask inside, because a
 *    disabled input still round-trips its value on submit in most form implementations,
 *    and `***4567` must never be written back.
 */
export function ContractDetails({
  orgId,
  memberId,
  role,
  isSelf,
}: {
  orgId: string;
  memberId: string;
  /** The viewer's normalized role, from the shell session. */
  role: string;
  /** True when the viewer is the member — the matrix's "user (own)" column. */
  isSelf: boolean;
}) {
  const { showToast } = useToast();

  const [profile, setProfile] = useState<MemberProfileDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<ProfileField, string>>(blankDraft());
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [saving, setSaving] = useState(false);

  const url = memberProfileUrl(orgId, memberId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiRequest<MemberProfileDto>(url);
      if (cancelled) return;
      if (result.ok) {
        setProfile(result.data);
        setLoadError(null);
        return;
      }
      // 403 is a documented outcome for a member looking at someone else's details, not
      // a fault: it renders as a forbidden panel, and `member-contract-details` stays
      // absent so no profile shell is visible at all.
      setLoadError(
        result.failure.status === 403
          ? PROFILE_MESSAGES.permission.view
          : failureMessage(result.failure),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loadError !== null) {
    return (
      <InfoBanner variant="error" data-testid="member-contract-details-forbidden">
        {loadError}
      </InfoBanner>
    );
  }

  if (profile === null) {
    return (
      <div
        data-testid="profile-loading"
        style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', color: 'var(--action-primary)' }}
      >
        <Preloader size={22} />
        <span style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}>
          Loading contract details…
        </span>
      </div>
    );
  }

  const masked = new Set(profile.maskedFields ?? []);
  const seesPii = canReadProfilePii(role, isSelf);
  /**
   * Both gates must agree. The server's `canEdit` is the authority; the client mirror
   * keeps the Edit affordance off screen for a role that the matrix says cannot edit,
   * and the masked check honours the States table's "Masked → Edit is absent" — a
   * caller reading masks has nothing complete enough to save.
   */
  const mayEdit = profile.canEdit && canEditProfile(role, isSelf) && masked.size === 0;

  /** Requirement 20/22 — a field whose value here is a mask is not offered for editing. */
  const editable = (field: ProfileField): boolean =>
    !masked.has(field) && (seesPii || !SENSITIVE_PROFILE_FIELDS.includes(field));

  const editableFields = PROFILE_FIELDS.filter(editable);

  function startEditing(): void {
    setDraft(
      Object.fromEntries(
        PROFILE_FIELDS.map((field) => [field, editable(field) ? (profile?.[field] ?? '') : '']),
      ) as Record<ProfileField, string>,
    );
    setErrors({});
    setEditing(true);
  }

  function validateAll(): Partial<Record<ProfileField, string>> {
    const found: Partial<Record<ProfileField, string>> = {};
    for (const field of editableFields) {
      const result = validateProfileField(field, draft[field]);
      if (!result.valid) found[field] = result.error;
    }
    return found;
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (saving) return;

    const found = validateAll();
    setErrors(found);
    const firstInvalid = editableFields.find((field) => found[field]);
    if (firstInvalid) {
      focusByTestId(`profile-input-${firstInvalid}`);
      return;
    }

    const patch: MemberProfilePatch = {};
    for (const field of editableFields) {
      const value = draft[field].trim();
      // Belt and braces for requirement 22: even though a masked field never reaches an
      // input, a value that *looks* like a mask is dropped from the payload rather than
      // sent — the server would reject it, and the round trip would be a lie either way.
      if (value.length > 0 && isMaskedValue(field, value)) continue;
      patch[field] = value.length > 0 ? value : null;
    }

    setSaving(true);
    const result = await apiRequest<MemberProfileDto>(url, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    setSaving(false);

    if (result.ok) {
      setProfile(result.data);
      setEditing(false);
      showToast('toast-profile-saved', PROFILE_MESSAGES.toast.saved);
      return;
    }

    if (result.failure.errors) {
      const mapped = result.failure.errors as Partial<Record<ProfileField, string>>;
      setErrors(mapped);
      const target = editableFields.find((field) => mapped[field]);
      if (target) focusByTestId(`profile-input-${target}`);
      return;
    }

    showToast(
      'toast-profile-error',
      result.failure.status === 403 ? PROFILE_MESSAGES.permission.edit : failureMessage(result.failure),
      'error',
    );
  }

  const updatedDay = formatUpdatedDay(profile.updatedAt);
  const empty = isProfileEmpty(profile);

  return (
    <div data-testid="member-contract-details">
      <Card
        title="Contract details"
        action={
          mayEdit && !editing ? (
            <Button
              type="button"
              data-testid="profile-edit-btn"
              onClick={startEditing}
            >
              {empty ? 'Add contract details' : 'Edit'}
            </Button>
          ) : undefined
        }
      >
        <p
          style={{
            margin: '0 0 var(--space-7)',
            fontSize: 'var(--font-size-s)',
            color: 'var(--text-secondary)',
          }}
        >
          Used to fill contracts automatically. All fields optional.
        </p>

        {editing ? (
          <form onSubmit={submit} noValidate data-testid="profile-form">
            <div style={{ display: 'grid', gap: 'var(--space-7)', maxWidth: 520 }}>
              {editableFields.map((field) => (
                <ProfileFieldInput
                  key={field}
                  field={field}
                  value={draft[field]}
                  error={errors[field]}
                  disabled={saving}
                  onChange={(next) => setDraft((prev) => ({ ...prev, [field]: next }))}
                  onBlur={() => {
                    const result = validateProfileField(field, draft[field]);
                    setErrors((prev) => ({
                      ...prev,
                      [field]: result.valid ? undefined : result.error,
                    }));
                  }}
                />
              ))}
            </div>

            {/* Never disabled for validation — clicking with a bad value is how the
                member finds out which one it is (repository rule + Validation Rules). */}
            <div style={{ marginTop: 'var(--space-9)' }}>
              <FormActions>
                <Button
                  type="button"
                  disabled={saving}
                  data-testid="profile-cancel-btn"
                  onClick={() => {
                    setEditing(false);
                    setErrors({});
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  preloader={saving}
                  data-testid="profile-save-btn"
                >
                  Save
                </Button>
              </FormActions>
            </div>
          </form>
        ) : empty ? (
          <p
            data-testid="profile-empty"
            style={{ margin: 0, fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}
          >
            {PROFILE_MESSAGES.generic.emptyState}
          </p>
        ) : (
          <div>
            {PROFILE_FIELDS.map((field) => (
              <ProfileRow
                key={field}
                field={field}
                value={displayValue(field, profile[field])}
                sensitive={SENSITIVE_PROFILE_FIELDS.includes(field)}
                masked={masked.has(field)}
              />
            ))}
          </div>
        )}

        {masked.size > 0 && (
          <div style={{ marginTop: 'var(--space-7)' }}>
            <InfoBanner variant="info" data-testid="profile-masked-hint">
              {PROFILE_MESSAGES.masked.hint}
            </InfoBanner>
          </div>
        )}

        {/* Requirement 14 — a profile that has never been saved has no editor to name,
            so the line is absent rather than printed with an em dash. */}
        {updatedDay !== null && !editing && (
          <p
            data-testid="profile-updated-meta"
            style={{
              margin: 'var(--space-7) 0 0',
              fontSize: 'var(--font-size-s)',
              color: 'var(--text-secondary)',
            }}
          >
            Last updated {updatedDay}
            {profile.updatedBy?.name ? ` by ${profile.updatedBy.name}` : ''}
          </p>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Rows and inputs
 * ------------------------------------------------------------------ */

/**
 * Read-mode presentation. The country is stored as a code and shown as a name
 * (requirement 17); the date of birth is shown long-form — unless it is masked, in
 * which case the mask *is* the value and reformatting it would be nonsense.
 */
function displayValue(field: ProfileField, raw: string | null): string | null {
  if (raw === null || raw.trim().length === 0) return null;
  if (field === 'country') return countryName(raw);
  if (field === 'dateOfBirth') return /^\d{4}-\d{2}-\d{2}/.test(raw.trim()) ? formatBirthDate(raw) : raw;
  return raw;
}

function ProfileRow({
  field,
  value,
  sensitive,
  masked,
}: {
  field: ProfileField;
  value: string | null;
  sensitive: boolean;
  masked: boolean;
}) {
  return (
    <div
      data-testid={`profile-row-${field}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-5)',
        padding: '11px 0',
        borderTop: 'var(--border-width-hairline) solid var(--border-subtle)',
      }}
    >
      <span
        style={{
          flex: '0 0 150px',
          fontSize: 'var(--font-size-s)',
          color: 'var(--text-secondary)',
        }}
      >
        {PROFILE_LABELS[field]}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 'var(--font-size-base)',
          color: value === null ? 'var(--text-secondary)' : 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {/* An empty field is a gap, not an error (requirement 7) — it reads as a dash. */}
        {value ?? '—'}
      </span>
      {sensitive && (
        <span
          data-testid={`profile-sensitive-${field}`}
          title={
            masked
              ? PROFILE_MESSAGES.masked.hint
              : 'Sensitive — visible only to an admin and to this member'
          }
          style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', paddingTop: 2 }}
        >
          <LockIcon />
        </span>
      )}
    </div>
  );
}

/** Country needs a `Select`, the date a date input, bank details a textarea. */
function ProfileFieldInput({
  field,
  value,
  error,
  disabled,
  onChange,
  onBlur,
}: {
  field: ProfileField;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (next: string) => void;
  onBlur: () => void;
}) {
  const testId = `profile-input-${field}`;
  const label = PROFILE_LABELS[field];

  if (field === 'country') {
    // Requirement 17 — codes are stored, names are shown, and the list is the package's
    // so client and server agree on exactly which codes are valid.
    const choices = [
      { value: '', label: '— none —' },
      ...COUNTRY_OPTIONS.map((country) => ({ value: country.code, label: country.name })),
    ];
    return (
      <div>
        <Select
          label={label}
          value={optionFor(choices, value)}
          isDisabled={disabled}
          placeholder="— none —"
          data-testid={testId}
          options={choices}
          onChange={(option) => onChange(valueOf(option))}
          error={Boolean(error)}
          errorMessage={error}
          errorId={`field-error-${field}`}
        />
      </div>
    );
  }

  if (field === 'bankDetails') {
    // Free-form and up to 500 characters — an IBAN, a SWIFT code and an account name are
    // three lines, not one.
    return (
      <TextArea
        label={label}
        id={testId}
        data-testid={testId}
        value={value}
        rows={3}
        disabled={disabled}
        readOnly={disabled}
        maxLength={PROFILE_LIMITS.bankDetailsMax}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `field-error-${field}` : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        error={error}
        errorId={`field-error-${field}`}
      />
    );
  }

  return (
    <TextInput
      label={label}
      type={field === 'dateOfBirth' ? 'date' : 'text'}
      value={value}
      disabled={disabled}
      readOnly={disabled}
      maxLength={MAX_LENGTHS[field]}
      data-testid={testId}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `field-error-${field}` : undefined}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      error={error}
      errorId={`field-error-${field}`}
      wrapperStyle={{ gap: 0 }}
    />
  );
}

/**
 * The browser's own `maxLength` stops the paste before the validator has to complain.
 * The numbers are the package's, never re-declared here.
 */
const MAX_LENGTHS: Partial<Record<ProfileField, number>> = {
  addressLine: PROFILE_LIMITS.addressLineMax,
  city: PROFILE_LIMITS.cityMax,
  postalCode: PROFILE_LIMITS.postalCodeMax,
  taxId: PROFILE_LIMITS.taxIdMax,
  idDocumentNumber: PROFILE_LIMITS.idDocumentNumberMax,
};

function blankDraft(): Record<ProfileField, string> {
  return Object.fromEntries(PROFILE_FIELDS.map((field) => [field, ''])) as Record<
    ProfileField,
    string
  >;
}
