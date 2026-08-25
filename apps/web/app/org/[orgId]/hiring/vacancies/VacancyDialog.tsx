'use client';

import { useEffect, useState } from 'react';
import {
  HIRING_MESSAGES,
  VACANCY_DURATIONS,
  validateVacancy,
  type VacancyField,
} from '@devscribed/validation';
import { Button, Input, Modal, Select, Textarea } from '@/ds';
import { errorNode, focusByTestId } from '@/field-error';
import type { InterviewerOption, Vacancy } from '@/hiring/types';

type Values = { title: string; interviewerAccountId: string; durationMinutes: string; description: string };
type Errors = Partial<Record<VacancyField, string>>;

const EMPTY: Values = { title: '', interviewerAccountId: '', durationMinutes: '', description: '' };

const TEST_IDS: Record<VacancyField, string> = {
  title: 'vacancy-title-input',
  interviewerAccountId: 'vacancy-interviewer-select',
  durationMinutes: 'vacancy-duration-60',
  description: 'vacancy-description-input',
};

/**
 * Create a vacancy. Categories belong to the library spec and arrive with it; every
 * other field of the dialog is here.
 *
 * The interviewer picker lists **every** member who may be assigned, with the
 * ineligible ones disabled and carrying the reason. A hidden name is indistinguishable
 * from a bug, which is exactly the failure the reason is there to prevent.
 */
export function VacancyDialog({
  orgId,
  open,
  onClose,
  onCreated,
}: {
  orgId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (vacancy: Vacancy) => void;
}) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [interviewers, setInterviewers] = useState<InterviewerOption[]>([]);

  useEffect(() => {
    if (!open) return;
    setValues(EMPTY);
    setErrors({});
    setBanner(null);

    let cancelled = false;
    async function load(): Promise<void> {
      const response = await fetch(`/api/organizations/${orgId}/hiring/interviewers`, {
        credentials: 'same-origin',
      });
      if (cancelled || !response.ok) return;
      const body = await response.json();
      setInterviewers(body.interviewers);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, orgId]);

  const set = (field: keyof Values) => (value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setBanner(null);
  };

  // Reached from the form's own submit and from the footer button, which the dialog
  // renders outside the form — hence the structural type rather than a FormEvent.
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
    setSubmitting(true);

    try {
      const response = await fetch(`/api/organizations/${orgId}/hiring/vacancies`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: validation.value.title,
          description: validation.value.description,
          interviewerAccountId: validation.value.interviewerAccountId,
          durationMinutes: validation.value.durationMinutes,
        }),
      });

      if (response.status === 201) {
        onCreated(await response.json());
        return;
      }

      const body = await response.json().catch(() => ({}));
      if (body.error === 'validation' && body.fields) setErrors(body.fields);
      else if (body.error === 'interviewer_ineligible') {
        setErrors({ interviewerAccountId: HIRING_MESSAGES.vacancy.interviewer.ineligible });
      } else setBanner(body.message ?? 'Something went wrong. Please try again.');
    } catch {
      setBanner('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const options = interviewers.map((option) => ({
    value: option.accountId,
    label: option.fullName,
    disabled: !option.eligible,
    // The reason is part of the option's accessible name, so it is announced rather
    // than merely seen.
    hint: option.eligible ? undefined : HIRING_MESSAGES.vacancy.interviewer.ineligibleOption,
    testId: `vacancy-interviewer-option-${option.accountId}`,
  }));

  return (
    <Modal
      open={open}
      title="New vacancy"
      onClose={onClose}
      width={520}
      data-testid="vacancy-dialog"
      actions={
        <>
          <Button variant="secondary" onClick={onClose} data-testid="vacancy-cancel-button">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={submitting}
            data-testid="vacancy-submit-button"
          >
            Create vacancy
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 'var(--sp-10)' }}>
        {banner && (
          <div role="alert" style={{ fontSize: 'var(--fs-13)', color: 'var(--error-500)' }}>
            {banner}
          </div>
        )}

        <Input
          label="Title"
          placeholder="Senior React Engineer"
          value={values.title}
          onChange={(event) => set('title')(event.target.value)}
          error={errors.title ? errorNode('title', errors.title) : undefined}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? 'field-error-title' : undefined}
          data-testid="vacancy-title-input"
        />

        <Select
          label="Interviewer"
          placeholder="Choose an interviewer"
          value={values.interviewerAccountId}
          options={options}
          onChange={set('interviewerAccountId')}
          error={
            errors.interviewerAccountId
              ? errorNode('interviewerAccountId', errors.interviewerAccountId)
              : undefined
          }
          data-testid="vacancy-interviewer-select"
        />
        <div
          id="vacancy-interviewer-hint"
          style={{ marginTop: 'calc(-1 * var(--sp-6))', fontSize: 'var(--fs-12)', color: 'var(--text-muted)' }}
        >
          Availability is read from their Microsoft 365 calendar.
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--fs-11)',
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: errors.durationMinutes ? 'var(--error-500)' : 'var(--text-muted)',
              marginBottom: 6,
            }}
          >
            Interview length
          </label>
          <div style={{ display: 'flex', gap: 'var(--sp-8)' }}>
            {VACANCY_DURATIONS.map((minutes) => (
              <label
                key={minutes}
                data-testid={`vacancy-duration-${minutes}`}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="durationMinutes"
                  value={minutes}
                  checked={values.durationMinutes === String(minutes)}
                  onChange={() => set('durationMinutes')(String(minutes))}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span style={{ fontSize: 'var(--fs-14)' }}>{minutes} min</span>
              </label>
            ))}
          </div>
          {errors.durationMinutes && (
            <div
              id="field-error-durationMinutes"
              data-testid="field-error-durationMinutes"
              style={{ marginTop: 5, fontSize: 'var(--fs-12)', color: 'var(--error-500)' }}
            >
              {errors.durationMinutes}
            </div>
          )}
        </div>

        <Textarea
          label="Description"
          placeholder="What the role involves, who it suits."
          rows={5}
          value={values.description}
          onChange={(event) => set('description')(event.target.value)}
          error={errors.description ? errorNode('description', errors.description) : undefined}
          data-testid="vacancy-description-input"
        />
      </form>
    </Modal>
  );
}
