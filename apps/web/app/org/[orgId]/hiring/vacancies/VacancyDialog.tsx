'use client';

import { useEffect, useState } from 'react';
import {
  HIRING_MESSAGES,
  MESSAGES,
  VACANCY_DURATIONS,
  scheduledKeepMessage,
  validateVacancy,
  type VacancyField,
} from '@devscribed/validation';
import {
  Button,
  FieldLabel,
  FormActions,
  InfoBanner,
  Modal,
  Select,
  TextArea,
  TextInput,
  type SelectOption,
} from '@/ds';
import { focusByTestId } from '@/field-error';
import type { Category, InterviewerOption, Vacancy } from '@/hiring/types';

type Values = { title: string; interviewerAccountId: string; durationMinutes: string; description: string };
type Errors = Partial<Record<VacancyField, string>>;

const EMPTY: Values = { title: '', interviewerAccountId: '', durationMinutes: '', description: '' };

/**
 * A category the member typed that the library does not hold yet. It carries a prefixed
 * value so one selection list can hold both, and it is resolved into a real id by the
 * same submit that saves the vacancy (06 §04.22) — creating it up front would leave an
 * entry behind every time somebody changed their mind and cancelled.
 */
const PENDING = 'new:';

const pendingName = (value: string): string | null =>
  value.startsWith(PENDING) ? value.slice(PENDING.length) : null;

const TEST_IDS: Record<VacancyField, string> = {
  title: 'vacancy-title-input',
  interviewerAccountId: 'vacancy-interviewer-select',
  durationMinutes: 'vacancy-duration-60',
  description: 'vacancy-description-input',
};

const valuesOf = (vacancy: Vacancy): Values => ({
  title: vacancy.title,
  interviewerAccountId: vacancy.interviewer.accountId,
  durationMinutes: String(vacancy.durationMinutes),
  description: vacancy.description ?? '',
});

/** Blue's `Select` deals in options, not in the values behind them. */
const asOption = (option: SelectOption | string | (SelectOption | string)[]): SelectOption =>
  option as SelectOption;
const asOptions = (option: SelectOption | string | (SelectOption | string)[]): SelectOption[] =>
  option as SelectOption[];

/**
 * Create and edit a vacancy.
 *
 * The interviewer picker lists **every** member who may be assigned, with the
 * ineligible ones disabled and carrying the reason. A hidden name is indistinguishable
 * from a bug, which is exactly the failure the reason is there to prevent.
 *
 * Editing sends only the fields that actually changed. That is what keeps a rename
 * working on a vacancy whose interviewer's mailbox has since disappeared — the title is
 * editable at any time with no restriction (01 §04.12), and re-asserting an untouched
 * assignment would drag that rule into it.
 */
export function VacancyDialog({
  orgId,
  open,
  vacancy,
  onClose,
  onSaved,
}: {
  orgId: string;
  open: boolean;
  /** Absent creates; present edits. */
  vacancy?: Vacancy;
  onClose: () => void;
  onSaved: (vacancy: Vacancy) => void;
}) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [interviewers, setInterviewers] = useState<InterviewerOption[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [library, setLibrary] = useState<Category[]>([]);
  /** Existing ids and `new:` names in one list, in the order the member added them. */
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setValues(vacancy ? valuesOf(vacancy) : EMPTY);
    setCategories(vacancy ? vacancy.categories.map((category) => category.id) : []);
    setErrors({});
    setBanner(null);
    setConfirming(null);

    let cancelled = false;
    async function load(): Promise<void> {
      const [people, categoryList] = await Promise.all([
        fetch(`/api/organizations/${orgId}/hiring/interviewers`, { credentials: 'same-origin' }),
        fetch(`/api/organizations/${orgId}/hiring/categories`, { credentials: 'same-origin' }),
      ]);
      if (cancelled) return;
      if (people.ok) setInterviewers((await people.json()).interviewers);
      if (categoryList.ok) setLibrary((await categoryList.json()).categories);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, orgId, vacancy]);

  const set = (field: keyof Values) => (value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setBanner(null);
  };

  // Reached from the form's own submit and from the footer button, which the reassign
  // confirmation renders outside the form — hence the structural type rather than a FormEvent.
  async function submit(event: { preventDefault: () => void }): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    const validation = validateVacancy({
      title: values.title,
      interviewerAccountId: values.interviewerAccountId,
      // The radio group's value is a string; the rule rejects strings on purpose, so
      // the conversion happens here rather than inside the validator.
      durationMinutes: values.durationMinutes ? Number(values.durationMinutes) : undefined,
      description: values.description,
    });
    if (!validation.valid) {
      setErrors(validation.errors);
      focusByTestId(TEST_IDS[validation.firstInvalidField!]);
      return;
    }
    setErrors({});

    // Changing the interviewer or the length affects future bookings only, and the
    // member is told what it leaves alone *before* the request goes out (01 §04.14).
    const affects =
      vacancy &&
      vacancy.scheduledCount > 0 &&
      (validation.value.interviewerAccountId !== vacancy.interviewer.accountId ||
        validation.value.durationMinutes !== vacancy.durationMinutes);

    if (affects && confirming === null) {
      setConfirming(scheduledKeepMessage(vacancy.scheduledCount));
      return;
    }

    setConfirming(null);
    setSubmitting(true);

    // Ids for what the library already holds, names for what it does not — the API
    // resolves a name that turns out to exist to the existing entry rather than
    // erroring, which is the same rule the picker applies while typing.
    const categoryIds = categories.filter((value) => pendingName(value) === null);
    const newCategoryNames = categories
      .map(pendingName)
      .filter((name): name is string => name !== null);

    try {
      const response = vacancy
        ? await fetch(`/api/organizations/${orgId}/hiring/vacancies/${vacancy.id}`, {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...changedFields(vacancy, validation.value),
              // Always sent on an edit, unlike the fields above: an unchanged set
              // rewrites no assignment row, because `assign` removes only what left the
              // set and re-inserts nothing that is already there.
              categoryIds,
              newCategoryNames,
            }),
          })
        : await fetch(`/api/organizations/${orgId}/hiring/vacancies`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: validation.value.title,
              description: validation.value.description,
              interviewerAccountId: validation.value.interviewerAccountId,
              durationMinutes: validation.value.durationMinutes,
              categoryIds,
              newCategoryNames,
            }),
          });

      if (response.status === (vacancy ? 200 : 201)) {
        onSaved(await response.json());
        return;
      }

      const body = await response.json().catch(() => ({}));
      if (body.error === 'validation' && body.fields) setErrors(body.fields);
      else if (body.error === 'interviewer_ineligible') {
        setErrors({ interviewerAccountId: HIRING_MESSAGES.vacancy.interviewer.ineligible });
      } else setBanner(body.message ?? MESSAGES.generic);
    } catch {
      setBanner(MESSAGES.generic);
    } finally {
      setSubmitting(false);
    }
  }

  const interviewerOptions: SelectOption[] = interviewers.map((option) => ({
    value: option.accountId,
    label: option.fullName,
    disabled: !option.eligible,
    // Drawn inside the option, so the reason is part of its accessible name and is
    // announced rather than merely seen.
    hint: option.eligible ? undefined : HIRING_MESSAGES.vacancy.interviewer.ineligibleOption,
    testId: `vacancy-interviewer-option-${option.accountId}`,
  }));

  // The library, plus whatever the member has typed but not yet saved. Both are options
  // so the control has one list to filter, and both render as the same chip.
  const categoryOptions: SelectOption[] = [
    ...library.map((category) => ({
      value: category.id,
      label: category.name,
      testId: `vacancy-category-option-${category.id}`,
    })),
    ...categories
      .map((value) => ({ value, name: pendingName(value) }))
      .filter((entry): entry is { value: string; name: string } => entry.name !== null)
      .map((entry) => ({
        value: entry.value,
        label: entry.name,
        testId: `vacancy-category-option-${entry.value}`,
      })),
  ];
  const selectedCategories = categories
    .map((value) => categoryOptions.find((option) => option.value === value))
    .filter((option): option is SelectOption => option !== undefined);

  return (
    <>
      <Modal
        open={open && confirming === null}
        title={vacancy ? 'Edit vacancy' : 'New vacancy'}
        onClose={onClose}
        data-testid="vacancy-dialog"
        style={{ width: 520 }}
      >
        {/* 20px is blue's form rhythm and the room every field's message slot needs — the
            error and the hint are pinned 16px under the control rather than pushing it. */}
        <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 'var(--space-7)' }}>
          {banner && (
            <InfoBanner variant="error" role="alert" aria-live="polite" data-testid="vacancy-dialog-error">
              {banner}
            </InfoBanner>
          )}

          <TextInput
            label="Title"
            id="vacancy-title-input"
            name="title"
            placeholder="Senior React Engineer"
            value={values.title}
            onChange={(event) => set('title')(event.target.value)}
            error={errors.title}
            errorId="field-error-title"
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? 'field-error-title' : undefined}
            data-testid="vacancy-title-input"
          />

          <Select
            label="Interviewer"
            id="vacancy-interviewer-select"
            placeholder="Choose an interviewer"
            value={interviewerOptions.find((option) => option.value === values.interviewerAccountId)}
            options={interviewerOptions}
            onChange={(option) => set('interviewerAccountId')(asOption(option).value)}
            error={errors.interviewerAccountId ? true : undefined}
            errorMessage={errors.interviewerAccountId}
            errorId="field-error-interviewerAccountId"
            // The hint shares the error's slot, so only one of the two ever exists to be
            // described by — which is what keeps this `aria-describedby` single-valued.
            hint="Availability is read from their Microsoft 365 calendar."
            hintId="vacancy-interviewer-hint"
            aria-describedby={
              errors.interviewerAccountId ? 'field-error-interviewerAccountId' : 'vacancy-interviewer-hint'
            }
            data-testid="vacancy-interviewer-select"
          />

          {/* The one control the design system has no component for: three mutually exclusive
              values, drawn on one row. `FieldLabel` is blue's own label, so it matches the
              fields above it exactly. */}
          <div role="radiogroup" aria-labelledby="vacancy-duration-label">
            <FieldLabel>
              <span
                id="vacancy-duration-label"
                style={{ color: errors.durationMinutes ? 'var(--status-error)' : undefined }}
              >
                Interview length
              </span>
            </FieldLabel>
            <div style={{ display: 'flex', gap: 'var(--space-6)' }}>
              {VACANCY_DURATIONS.map((minutes) => (
                <label
                  key={minutes}
                  data-testid={`vacancy-duration-${minutes}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}
                >
                  <input
                    type="radio"
                    name="durationMinutes"
                    value={minutes}
                    checked={values.durationMinutes === String(minutes)}
                    onChange={() => set('durationMinutes')(String(minutes))}
                    style={{ accentColor: 'var(--action-primary)' }}
                  />
                  <span style={{ fontSize: 'var(--font-size-s)' }}>{minutes} min</span>
                </label>
              ))}
            </div>
            {errors.durationMinutes && (
              <div
                id="field-error-durationMinutes"
                data-testid="field-error-durationMinutes"
                style={{
                  marginTop: 5,
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--status-error)',
                }}
              >
                {errors.durationMinutes}
              </div>
            )}
          </div>

          <Select
            label="Categories"
            id="vacancy-categories-input"
            placeholder="Type to add…"
            isMulti
            isSearchable
            allowCreate
            variant="formik"
            value={selectedCategories}
            options={categoryOptions}
            // Nothing is written here: the name joins the selection as a pending entry
            // and the submit creates it, so cancelling the dialog leaves no orphan.
            onCreate={(name) => setCategories((prev) => [...prev, `${PENDING}${name}`])}
            onChange={(option) => setCategories(asOptions(option).map((entry) => entry.value))}
            createTestId="vacancy-category-create-option"
            // Not `vacancy-category-chip-{id}` — that one names the read-only chips on
            // the list, and the dialog opens on top of them.
            chipTestId={(option) => `vacancy-category-selected-${asOption(option).value}`}
            data-testid="vacancy-categories-input"
          />

          <TextArea
            label="Description"
            id="vacancy-description-input"
            name="description"
            placeholder="What the role involves, who it suits."
            value={values.description}
            onChange={(event) => set('description')(event.target.value)}
            error={errors.description}
            errorId="field-error-description"
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? 'field-error-description' : undefined}
            data-testid="vacancy-description-input"
          />

          <FormActions align="full">
            <Button onClick={onClose} data-testid="vacancy-cancel-button">
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              preloader={submitting}
              data-testid="vacancy-submit-button"
            >
              {vacancy ? 'Save changes' : 'Create vacancy'}
            </Button>
          </FormActions>
        </form>
      </Modal>

      <Modal
        open={open && confirming !== null}
        title="Change interview details?"
        onClose={() => setConfirming(null)}
        data-testid="vacancy-reassign-confirm"
        style={{ width: 520 }}
      >
        <div style={{ display: 'grid', gap: 'var(--space-7)' }}>
          <p style={{ margin: 0, fontSize: 'var(--font-size-s)', color: 'var(--text-tertiary)' }}>
            {confirming}
          </p>
          <FormActions align="full">
            <Button onClick={() => setConfirming(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={submit}
              preloader={submitting}
              data-testid="vacancy-reassign-confirm-button"
            >
              Save changes
            </Button>
          </FormActions>
        </div>
      </Modal>
    </>
  );
}

/** Only what moved. A PATCH is a subset, and an unchanged field is not part of it. */
function changedFields(
  vacancy: Vacancy,
  next: { title: string; description: string; interviewerAccountId: string; durationMinutes: number | null },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (next.title !== vacancy.title) patch.title = next.title;
  if (next.description !== (vacancy.description ?? '')) patch.description = next.description;
  if (next.interviewerAccountId !== vacancy.interviewer.accountId) {
    patch.interviewerAccountId = next.interviewerAccountId;
  }
  if (next.durationMinutes !== vacancy.durationMinutes) patch.durationMinutes = next.durationMinutes;
  return patch;
}
