'use client';

import { useEffect, useState } from 'react';
import {
  CRITERION_MESSAGES,
  operatorsFor,
  valueControlFor,
  type FilterOperator,
  type FilterOperatorOption,
} from '@devscribed/validation';
import { Combobox, IconButton, Input, Select } from '@/ds';
import type { Criterion } from '@/hiring/types';

/**
 * One `criterion / operator / value` row of the criteria filter.
 *
 * It is the only three-part control on the screen, and the reason the filter bar has to
 * work hard not to read as a query builder: everything else is a chip.
 */
export interface CriteriaFilterRowState {
  criterionId: string | null;
  /** The operator as the `Select` addresses it — see `operatorKey`. */
  operatorKey: string;
  value: string;
}

export const EMPTY_ROW: CriteriaFilterRowState = { criterionId: null, operatorKey: '', value: '' };

/**
 * `boolean` bakes its value into the operator — "is yes" and "is no" are the two
 * questions a two-valued criterion answers, and a separate value control beside them
 * would offer four spellings of them (03 §04.14). Every other type keeps the operator
 * alone, so the key is just the operator's name.
 */
export const operatorKey = (option: FilterOperatorOption): string =>
  option.value === undefined ? option.operator : `${option.operator}:${option.value}`;

/** The other direction: what the row actually sends. */
export function readOperatorKey(key: string): { operator: FilterOperator; value?: string } | null {
  if (!key) return null;
  const [operator, value] = key.split(':') as [FilterOperator, string | undefined];
  return { operator, ...(value === undefined ? {} : { value }) };
}

/**
 * The complete rows, as query parameters. An **incomplete** row is skipped rather than
 * sent: a row whose value is still empty is a row somebody is halfway through building,
 * and treating it as a filter would empty the list under them (03 design §Interactions).
 */
export function completeRows(
  rows: readonly CriteriaFilterRowState[],
): Array<{ criterionId: string; operator: FilterOperator; value: string }> {
  const complete: Array<{ criterionId: string; operator: FilterOperator; value: string }> = [];

  for (const row of rows) {
    const operator = readOperatorKey(row.operatorKey);
    if (!row.criterionId || !operator) continue;
    const value = operator.value ?? row.value.trim();
    if (value.length === 0) continue;
    complete.push({ criterionId: row.criterionId, operator: operator.operator, value });
  }

  return complete;
}

export function CriteriaFilterRow({
  index,
  row,
  criteria,
  onChange,
  onRemove,
}: {
  index: number;
  row: CriteriaFilterRowState;
  criteria: Criterion[];
  onChange: (next: CriteriaFilterRowState) => void;
  onRemove: () => void;
}) {
  const criterion = criteria.find((entry) => entry.id === row.criterionId) ?? null;
  const operators = criterion ? operatorsFor(criterion.type) : [];
  const control = criterion ? valueControlFor(criterion.type) : 'none';

  return (
    <div
      className="candidates-criteria-row"
      role="group"
      aria-label={`Criteria filter ${index + 1}`}
      data-testid={`criteria-filter-row-${index}`}
    >
      <Combobox
        multiple={false}
        value={row.criterionId ? [row.criterionId] : []}
        options={criteria.map((entry) => ({
          value: entry.id,
          /**
           * The archived marker is part of the label rather than a trailing `Badge`:
           * the combobox filters on its options' text, so a node here would make an
           * archived criterion unfindable by typing its name. Archived criteria stay
           * filterable — that is the whole difference from deleting one (03 §04.19) —
           * and the list already sorts them below the active ones.
           */
          label: entry.isArchived
            ? `${entry.name} · ${CRITERION_MESSAGES.archivedBadge}`
            : entry.name,
        }))}
        // Changing the criterion resets the operator and the value rather than carrying
        // a meaningless leftover across types (03 §UI Notes).
        onChange={(value) => onChange({ ...EMPTY_ROW, criterionId: value[0] ?? null })}
        placeholder="Criterion…"
        aria-label="Criterion"
        data-testid={`criteria-filter-criterion-${index}`}
        optionTestId={(value) => `criteria-filter-criterion-${index}-option-${value}`}
        wrapperStyle={{ flex: '2 1 200px', minWidth: 0 }}
      />

      <Select
        value={row.operatorKey}
        options={operators.map((option) => ({
          value: operatorKey(option),
          label: option.label,
          testId: `criteria-filter-op-${index}-option-${operatorKey(option)}`,
        }))}
        onChange={(operator) => onChange({ ...row, operatorKey: operator, value: '' })}
        placeholder="Operator"
        disabled={!criterion}
        aria-label="Operator"
        data-testid={`criteria-filter-op-${index}`}
        wrapperStyle={{ flex: '1 1 130px', minWidth: 0 }}
      />

      {/* A boolean's answer travelled with its operator, so there is nothing to ask. */}
      {control !== 'none' && (
        <ValueControl
          index={index}
          control={control}
          criterion={criterion}
          value={row.value}
          onChange={(value) => onChange({ ...row, value })}
        />
      )}

      <IconButton
        label={`Remove criteria filter ${index + 1}`}
        size={34}
        onClick={onRemove}
        data-testid={`criteria-filter-remove-${index}`}
      >
        <svg viewBox="0 0 10 10" width={10} height={10} aria-hidden>
          <path
            d="M1 1 L9 9 M9 1 L1 9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </IconButton>
    </div>
  );
}

/** The component the value is chosen with, decided by the criterion's type. */
function ValueControl({
  index,
  control,
  criterion,
  value,
  onChange,
}: {
  index: number;
  control: 'scale' | 'number' | 'text';
  criterion: Criterion | null;
  value: string;
  onChange: (value: string) => void;
}) {
  const testId = `criteria-filter-value-${index}`;
  const style = { flex: '1 1 140px', minWidth: 0 };

  if (control === 'scale') {
    return (
      <Select
        value={value}
        // Worst to best, the order the scale itself is stored in — and the order every
        // `at least` reads against.
        options={[...(criterion?.values ?? [])]
          .sort((left, right) => left.position - right.position)
          .map((entry) => ({
            value: entry.id,
            label: entry.label,
            testId: `${testId}-option-${entry.id}`,
          }))}
        onChange={onChange}
        placeholder="Value"
        disabled={!criterion}
        aria-label="Value"
        data-testid={testId}
        wrapperStyle={style}
      />
    );
  }

  // Keyed by the criterion, so switching to another one of the same type starts the
  // field empty rather than holding what was typed against a different question.
  return (
    <TypedValue
      key={criterion?.id ?? 'none'}
      control={control}
      value={value}
      onChange={onChange}
      testId={testId}
      style={style}
    />
  );
}

/**
 * A number or a free-text value, committed on blur and on Enter rather than on every
 * keystroke.
 *
 * Every other filter refetches the moment it changes, because clicking an option is a
 * finished thought. Typing is not: filtering per keystroke would ask for `4`, `45` and
 * `450` on the way to `450`, and the answer to the first two is a list nobody wanted to
 * see. It is the same rule the candidate card applies to the same two types.
 */
function TypedValue({
  control,
  value,
  onChange,
  testId,
  style,
}: {
  control: 'number' | 'text';
  value: string;
  onChange: (value: string) => void;
  testId: string;
  style: React.CSSProperties;
}) {
  const [draft, setDraft] = useState(value);

  // The applied value is the source of truth: changing the criterion resets the row, and
  // the field has to follow rather than keep what was typed against a different question.
  useEffect(() => setDraft(value), [value]);

  const commit = (): void => {
    if (draft.trim() !== value) onChange(draft.trim());
  };

  return (
    <Input
      type={control === 'number' ? 'number' : 'text'}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        // The row is not a form, so Enter has nothing else to mean here.
        event.preventDefault();
        commit();
      }}
      placeholder="Value"
      aria-label="Value"
      data-testid={testId}
      wrapperStyle={style}
    />
  );
}
