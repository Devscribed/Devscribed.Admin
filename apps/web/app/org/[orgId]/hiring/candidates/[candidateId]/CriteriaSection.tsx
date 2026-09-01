'use client';

import { useEffect, useRef, useState } from 'react';
import {
  APPLICATION_LIMITS,
  HIRING_MESSAGES,
  MESSAGES,
  // The same rule the database row reads an assessment with, so `Yes` means the same
  // thing on both screens (validation `assessedValueLabel`).
  assessedValueLabel,
  type AssessmentInput,
} from '@devscribed/validation';
import { Button, Chip, Select, TextInput, type SelectOption } from '@/ds';
import { focusByTestId } from '@/field-error';
import { CriterionDialog } from '@/hiring/CriterionDialog';
import { valueOf } from '@/hiring/select';
import type { CardCriterion, Criterion } from '@/hiring/types';
import { SectionHeading } from './SectionHeading';

/**
 * The criteria assessed on one application (spec 04 §05).
 *
 * Type a name, pick it, set a value — no mouse required and no separate save, because
 * this is used while somebody is talking. Values write on change; a criterion that does
 * not exist yet is created through the same dialog the settings screen uses, and is then
 * assessed here in the next keystroke.
 *
 * A criterion chosen from the autocomplete becomes a chip **before** it has a value,
 * because there is no such thing as an assessment without one: the row is written by the
 * first value, not by the choosing. Removing a chip that never got a value is therefore a
 * purely local undo, with nothing to delete.
 *
 * `readOnly` is the assigned interviewer's view of the same section, and it is a
 * consequence of the permission matrix rather than a design choice: both libraries are
 * `admin`/`manager` only, `GET` included (06 §Actors), so a `user` interviewer cannot be
 * offered an autocomplete over a library they may not read, nor a scale whose other
 * values they were never sent. What they *can* be shown is what was recorded, which the
 * card's own response carries in full — so the chips render as text and nothing on them
 * is a control.
 */
export function CriteriaSection({
  orgId,
  applicationId,
  criteria,
  library,
  readOnly = false,
  onChange,
  onLibraryChange,
}: {
  orgId: string;
  applicationId: string;
  criteria: CardCriterion[];
  /** The whole library, archived entries included — an archived chip still renders. */
  library: Criterion[];
  /** The caller may not read the library, so there is nothing here to choose from. */
  readOnly?: boolean;
  onChange: (criteria: CardCriterion[]) => void;
  onLibraryChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  /** A criterion chosen but not yet valued, so it has no row on the server. */
  const [pending, setPending] = useState<Criterion | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const byId = new Map(library.map((criterion) => [criterion.id, criterion]));
  const assessed = new Set(criteria.map((assessment) => assessment.criterionId));

  async function save(criterion: Criterion, value: AssessmentInput): Promise<void> {
    setSaving(criterion.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/hiring/applications/${applicationId}/criteria/${criterion.id}`,
        {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? MESSAGES.generic);
        return;
      }

      const saved: CardCriterion = await response.json();
      // Appended rather than re-sorted: a chip that moved while somebody was reading it
      // is exactly what this page does not do.
      onChange(
        assessed.has(criterion.id)
          ? criteria.map((entry) => (entry.criterionId === criterion.id ? saved : entry))
          : [...criteria, saved],
      );
      setPending((current) => (current?.id === criterion.id ? null : current));
    } catch {
      setError(MESSAGES.generic);
    } finally {
      setSaving(null);
    }
  }

  async function remove(criterionId: string): Promise<void> {
    // A pending chip has no row behind it, so there is nothing to ask the server for.
    if (!assessed.has(criterionId)) {
      setPending(null);
      return;
    }

    setSaving(criterionId);
    setError(null);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/hiring/applications/${applicationId}/criteria/${criterionId}`,
        { method: 'DELETE', credentials: 'same-origin' },
      );
      if (!response.ok) {
        setError(MESSAGES.generic);
        return;
      }
      onChange(criteria.filter((entry) => entry.criterionId !== criterionId));
    } catch {
      setError(MESSAGES.generic);
    } finally {
      setSaving(null);
    }
  }

  function choose(criterionId: string): void {
    const criterion = byId.get(criterionId);
    if (!criterion) return;

    setNote(null);
    setAdding(false);

    // Already there: this edits the existing value rather than adding a second chip
    // (04 §05.24), so focus goes to the control that holds it and says so.
    if (assessed.has(criterionId)) {
      setNote(HIRING_MESSAGES.card.criterionPresent);
      focusByTestId(`card-criterion-value-${criterionId}`);
      return;
    }

    setPending(criterion);
    // Type-select-set with no mouse: the value control is where the next keystroke goes.
    requestAnimationFrame(() => focusByTestId(`card-criterion-value-${criterionId}`));
  }

  /** Assessed chips in their stored order, then the one being added. */
  const chips: Array<{ criterion: Criterion; assessment: CardCriterion | null }> = [
    ...criteria.map((assessment) => ({
      criterion: byId.get(assessment.criterionId) ?? fallbackCriterion(assessment),
      assessment,
    })),
    ...(pending ? [{ criterion: pending, assessment: null }] : []),
  ];

  /**
   * Every non-archived criterion, including the ones already on this application.
   *
   * Leaving the assessed ones out would be worse than redundant: typing a name that
   * exists would match nothing and the control would offer to **create** it, which the
   * library refuses as a duplicate. So they stay, and choosing one edits what is there.
   */
  const options: SelectOption[] = library
    .filter((criterion) => !criterion.isArchived)
    .map((criterion) => ({
      value: criterion.id,
      label: criterion.name,
      testId: `card-criteria-option-${criterion.id}`,
    }));

  if (readOnly) return <ReadOnlyCriteria criteria={criteria} />;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
        <SectionHeading>Criteria</SectionHeading>
        <Button
          onClick={() => setAdding(true)}
          data-testid="card-criteria-add"
          style={{ marginLeft: 'auto' }}
        >
          + Add criteria
        </Button>
      </div>

      {chips.length === 0 && !adding ? (
        <p
          data-testid="card-criteria-empty"
          style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}
        >
          {HIRING_MESSAGES.card.noCriteria}
        </p>
      ) : (
        <ul
          data-testid="card-criteria-list"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            listStyle: 'none',
            margin: 'var(--space-3) 0 0',
            padding: 0,
          }}
        >
          {chips.map(({ criterion, assessment }) => (
            <li key={criterion.id} className="card-criterion-chip">
              {/*
                `Chip`, not `Badge`. Blue's `Badge` is `ActivityBadge` — four status paints and
                no neutral — and a criterion is not a status, which is the split §32 made when
                it took the opposite view of an application's. `Chip` is what blue draws for a
                chosen thing, and the value control goes in its `trailing` slot (§37) rather
                than in the label, which ellipsises to one line and would clip the list this
                control drops.

                The pointer cursor `Chip` paints when it can be removed is turned off: on this
                chip only the cross and the value control are clickable, and the name between
                them promises nothing. That is §18's rule on `Table`'s rows, one level down.
              */}
              <Chip
                data-testid={`card-criterion-${criterion.id}`}
                onRemove={() => void remove(criterion.id)}
                removeLabel={`Remove ${criterion.name}`}
                removeTestId={`card-criterion-remove-${criterion.id}`}
                style={{ cursor: 'default', margin: 0, minWidth: 0 }}
                trailing={
                  <ValueControl
                    criterion={criterion}
                    assessment={assessment}
                    busy={saving === criterion.id}
                    onSave={(value) => void save(criterion, value)}
                  />
                }
              >
                {criterion.name}
                {criterion.isArchived && (
                  <span style={{ color: 'var(--text-secondary)' }}> (archived)</span>
                )}
              </Chip>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div style={{ marginTop: 'var(--space-5)', maxWidth: 320 }}>
          {/*
            `Select isSearchable allowCreate` — blue's own control with the capability prod
            never switches on (§21) and the create row §29 added, not a second combobox. The
            per-option test ids ride on the options themselves, which is the shape §21 gave
            a listbox blue draws for itself.
          */}
          <Select
            placeholder="Type to find or create…"
            autoFocus
            isSearchable
            options={options}
            allowCreate
            onChange={(option) => choose(valueOf(option))}
            // Nothing is written until the dialog is confirmed, so cancelling it leaves
            // no half-made criterion in a library the whole team shares.
            onCreate={(name) => {
              setAdding(false);
              setCreating(name);
            }}
            createTestId="card-criteria-create-option"
            aria-label="Find or create a criterion"
            data-testid="card-criteria-autocomplete"
          />
        </div>
      )}

      {/* Polite, because a failure here happens while somebody is mid-sentence. */}
      <span aria-live="polite">
        {note && (
          <span
            data-testid="card-criteria-note"
            style={{ display: 'block', marginTop: 'var(--space-3)', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}
          >
            {note}
          </span>
        )}
        {error && (
          <span
            data-testid="card-criteria-error"
            style={{ display: 'block', marginTop: 'var(--space-3)', fontSize: 'var(--font-size-xs)', color: 'var(--status-error)' }}
          >
            {error}
          </span>
        )}
      </span>

      <CriterionDialog
        orgId={orgId}
        open={creating !== null}
        initialName={creating ?? ''}
        onClose={() => setCreating(null)}
        onSaved={(criterion) => {
          setCreating(null);
          // The library is org-wide, so everything that reads it needs the new entry —
          // and this chip needs its scale before it can offer a value.
          onLibraryChange();
          setPending(criterion);
          requestAnimationFrame(() => focusByTestId(`card-criterion-value-${criterion.id}`));
        }}
      />
    </div>
  );
}

/**
 * The one control a criterion's type calls for, saving on change.
 *
 * A `Select` writes the moment it is chosen. The two typed fields cannot: saving per
 * keystroke would write `7`, `70`, `700` on the way to `700`, so they commit on blur and
 * on Enter — which is what "on change" means for a field somebody is still typing into.
 *
 * All four are blue's controls at blue's own height. Meridian shrank them to 26px to fit
 * inside a `Badge`; blue's form controls are 44px, the chip grows to hold one, and the
 * criteria *filter* row on the candidates screen already reads at that size — the two are
 * the same three-control shape and must not disagree about it (D1).
 */
function ValueControl({
  criterion,
  assessment,
  busy,
  onSave,
}: {
  criterion: Criterion;
  assessment: CardCriterion | null;
  busy: boolean;
  onSave: (value: AssessmentInput) => void;
}) {
  const testId = `card-criterion-value-${criterion.id}`;
  // The accessible name is the criterion, so a screen reader says "English, B2" rather
  // than reading an unlabelled select.
  const shared = { 'aria-label': criterion.name, 'aria-busy': busy || undefined };

  if (criterion.type === 'scale') {
    const options: SelectOption[] = criterion.values.map((value) => ({
      value: value.id,
      label: value.label,
      testId: `card-criterion-option-${value.id}`,
    }));
    return (
      <Select
        {...shared}
        value={options.find((option) => option.value === assessment?.valueId)}
        placeholder="Value"
        options={options}
        onChange={(option) => onSave({ valueId: valueOf(option) })}
        data-testid={testId}
        wrapperStyle={{ width: 116 }}
      />
    );
  }

  if (criterion.type === 'boolean') {
    const options: SelectOption[] = [
      { value: 'yes', label: 'Yes', testId: `card-criterion-option-${criterion.id}-yes` },
      { value: 'no', label: 'No', testId: `card-criterion-option-${criterion.id}-no` },
    ];
    const chosen =
      assessment === null || assessment.valueBool === null
        ? undefined
        : options[assessment.valueBool ? 0 : 1];
    return (
      <Select
        {...shared}
        value={chosen}
        placeholder="Value"
        options={options}
        onChange={(option) => onSave({ valueBool: valueOf(option) === 'yes' })}
        data-testid={testId}
        wrapperStyle={{ width: 104 }}
      />
    );
  }

  const stored =
    criterion.type === 'number'
      ? assessment?.valueNumber === null || assessment === null
        ? ''
        : String(assessment.valueNumber)
      : (assessment?.valueText ?? '');

  return (
    <TypedValue
      {...shared}
      testId={testId}
      type={criterion.type}
      stored={stored}
      onCommit={(text) =>
        criterion.type === 'number'
          ? onSave({ valueNumber: Number(text) })
          : onSave({ valueText: text })
      }
    />
  );
}

/** A number or a free-text value: typed here, written on blur or on Enter. */
function TypedValue({
  testId,
  type,
  stored,
  onCommit,
  ...rest
}: {
  testId: string;
  type: 'number' | 'text';
  stored: string;
  onCommit: (value: string) => void;
} & Record<string, unknown>) {
  const [draft, setDraft] = useState(stored);
  const committed = useRef(stored);

  // The stored value is the source of truth, but only when it actually moved: resetting
  // on every render would take the text out from under someone mid-word.
  useEffect(() => {
    if (stored === committed.current) return;
    committed.current = stored;
    setDraft(stored);
  }, [stored]);

  function commit(): void {
    const value = draft.trim();
    if (value === committed.current.trim() || value.length === 0) return;
    if (type === 'number' && !Number.isFinite(Number(value))) return;
    committed.current = value;
    onCommit(value);
  }

  return (
    <TextInput
      {...rest}
      type={type}
      value={draft}
      placeholder="Value"
      maxLength={type === 'text' ? APPLICATION_LIMITS.criterionTextMax : undefined}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        commit();
      }}
      data-testid={testId}
      // §35's slot: `style` addresses the `<input>`, and it is the box around it that has
      // to be told how wide to be inside a chip.
      wrapperStyle={{ width: type === 'number' ? 104 : 180 }}
    />
  );
}

/**
 * What was recorded, as text.
 *
 * Everything it renders came with the card, so it needs no library and asks for none —
 * which is the point: the interviewer sees the assessment on their own candidate without
 * the org-wide library being opened to them to make one autocomplete work.
 */
function ReadOnlyCriteria({ criteria }: { criteria: CardCriterion[] }) {
  return (
    <div>
      <SectionHeading>Criteria</SectionHeading>
      {criteria.length === 0 ? (
        <p
          data-testid="card-criteria-empty"
          style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}
        >
          {HIRING_MESSAGES.card.noCriteria}
        </p>
      ) : (
        <ul
          data-testid="card-criteria-list"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            listStyle: 'none',
            margin: 'var(--space-3) 0 0',
            padding: 0,
          }}
        >
          {criteria.map((assessment) => (
            <li key={assessment.criterionId}>
              {/*
                The same chip without a cross — which is also what drops the pointer cursor
                (§20). The value keeps the `trailing` slot it has in the editable form, so
                the two states read as one thing with and without its controls, and the test
                id lands on the same node either way.
              */}
              <Chip
                data-testid={`card-criterion-${assessment.criterionId}`}
                style={{ margin: 0, minWidth: 0 }}
                trailing={
                  <span
                    data-testid={`card-criterion-value-${assessment.criterionId}`}
                    style={{ marginLeft: 'var(--space-2)', marginRight: 3, fontSize: 14 }}
                  >
                    {assessedValueLabel(assessment)}
                  </span>
                }
              >
                {assessment.name}
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A criterion assessed here but absent from the library the page fetched.
 *
 * It cannot normally happen — the card asks for archived entries too — but a criterion
 * deleted by somebody else between the two requests would otherwise take the chip's name
 * with it, and the assessment is the more important of the two things to keep on screen.
 */
const fallbackCriterion = (assessment: CardCriterion): Criterion => ({
  id: assessment.criterionId,
  name: assessment.name,
  type: assessment.type,
  isArchived: assessment.isArchived,
  assessmentCount: 1,
  values: assessment.valueId
    ? [{ id: assessment.valueId, label: assessment.valueLabel ?? '', position: 0, assessmentCount: 1 }]
    : [],
});
