'use client';

import { useEffect, useState } from 'react';
import {
  CANDIDATE_MESSAGES,
  operatorsFor,
  valueControlFor,
  type CriterionFilter,
  type FilterOperator,
  type FilterOperatorOption,
} from '@devscribed/validation';
import { Badge, CloseIcon, IconButton, Select, TextInput, type SelectOption } from '@devscribed/ds';
import { valueOf } from '@/select';
import type { Criterion } from '@/hiring/types';

/**
 * One criteria filter, as the drawer draws it: a **sunken row** carrying the criterion's
 * name, the operator and the value, reading as the sentence *English · at least · B1*
 * (03 §09.49).
 *
 * It is deliberately the same object the candidate card draws for an assessment — the
 * `--surface-sunken` ground, the criterion as plain text, its controls inline, a × to drop
 * it — because it is the same thing said in the other direction: the card records *this
 * candidate's English is B1*, and this asks *whose English is at least B1*. The filter
 * needs one control the card does not, and the operator sits between the name and the
 * value, where it reads as part of that sentence.
 *
 * It is **not** the system's `Chip`. That is the token react-select draws for a value chosen
 * *inside a field* — white, with the 7px blue edge that marks it as a selection — and this
 * is not inside a field and is not a selection: it is a small form, holding two controls
 * of its own. Drawn as a `Chip` it read as a chosen value that happened to contain
 * dropdowns, and the blue edge put emphasis on the one thing in the drawer that is
 * already the most emphatic.
 *
 * The three-`Select` row it replaces was a query builder in the middle of a list screen.
 * The criterion is no longer chosen here at all: it is chosen once, in the autocomplete
 * above the chips, and picking it is what creates the chip — which is why nothing here
 * has to answer for a half-built row with no criterion in it.
 */
export interface CriteriaFilterRowState {
  criterionId: string;
  /** The operator as the `Select` addresses it — see `operatorKey`. */
  operatorKey: string;
  value: string;
}

/**
 * `boolean` bakes its value into the operator — "is yes" and "is no" are the two
 * questions a two-valued criterion answers, and a separate value control beside them
 * would offer four spellings of them (03 §04.14). Every other type keeps the operator
 * alone, so the key is just the operator's name.
 */
export const operatorKey = (option: FilterOperatorOption): string =>
  option.value === undefined ? option.operator : `${option.operator}:${option.value}`;

/**
 * A chip for a criterion just chosen, with its type's first operator already set.
 *
 * The operator is never blank: a chip that read *English · … · B1* would be asking the
 * member to fill in a control whose only sensible default is sitting right there. For a
 * `boolean` that also makes the chip a complete filter the moment it appears, which is
 * correct — `is yes` is a whole question.
 */
export const newCriteriaRow = (criterion: Criterion): CriteriaFilterRowState => ({
  criterionId: criterion.id,
  operatorKey: operatorKey(operatorsFor(criterion.type)[0]),
  value: '',
});

/**
 * Chips rebuilt from the address bar (03 §09.53).
 *
 * Called twice, and the two calls are the point. **Without the library** it is the state
 * this screen opens on, and every row it makes sends exactly the parameter it was built
 * from — `completeRows` reads a bare operator's value off the row, and a baked-in one off
 * the operator, and both spell the same query. **With the library** it fixes up the one
 * type that cannot be told from the parameter alone: a `boolean` keeps its value *inside*
 * the operator ("is yes"), because a two-valued criterion has two questions and no value
 * control, and a row that kept them apart would draw an operator no option matches.
 */
export function restoreCriteriaRows(
  filters: readonly CriterionFilter[],
  library?: readonly Criterion[],
): CriteriaFilterRowState[] {
  const byId = new Map((library ?? []).map((criterion) => [criterion.id, criterion]));
  return filters.map((filter) =>
    byId.get(filter.criterionId)?.type === 'boolean'
      ? {
          criterionId: filter.criterionId,
          operatorKey: `${filter.operator}:${filter.value}`,
          value: '',
        }
      : { criterionId: filter.criterionId, operatorKey: filter.operator, value: filter.value },
  );
}

/** The other direction: what the row actually sends. */
export function readOperatorKey(key: string): { operator: FilterOperator; value?: string } | null {
  if (!key) return null;
  const [operator, value] = key.split(':') as [FilterOperator, string | undefined];
  return { operator, ...(value === undefined ? {} : { value }) };
}

/**
 * The complete rows, as query parameters. An **incomplete** row is skipped rather than
 * sent: a chip whose value is still empty is one somebody is halfway through building,
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
  criterion,
  onChange,
  onRemove,
}: {
  index: number;
  row: CriteriaFilterRowState;
  /** The criterion this chip is about. The chip does not exist without one. */
  criterion: Criterion;
  onChange: (next: CriteriaFilterRowState) => void;
  onRemove: () => void;
}) {
  const control = valueControlFor(criterion.type);

  const operatorOptions: SelectOption[] = operatorsFor(criterion.type).map((option) => ({
    value: operatorKey(option),
    label: option.label,
    testId: `criteria-filter-op-${index}-option-${operatorKey(option)}`,
  }));

  return (
    <li
      className="candidates-criteria-chip"
      role="group"
      aria-label={`Criteria filter ${index + 1}`}
      data-testid={`criteria-filter-row-${index}`}
    >
      <span data-testid={`criteria-filter-criterion-${index}`} className="candidates-criteria-name">
        {criterion.name}
      </span>

      {/*
        Beside the name, not after the controls. An archived criterion is still filterable —
        that is the whole difference from deleting one (03 §04.19) — and what the badge
        qualifies is which criterion this is, so it reads with the name.
      */}
      {criterion.isArchived && (
        <Badge
          status="inactive"
          outlined
          size="s"
          data-testid={`criteria-filter-archived-${index}`}
        >
          {CANDIDATE_MESSAGES.archived}
        </Badge>
      )}

      <Select
        value={operatorOptions.find((option) => option.value === row.operatorKey)}
        options={operatorOptions}
        onChange={(option) => onChange({ ...row, operatorKey: valueOf(option), value: '' })}
        placeholder="Operator"
        aria-label={`Operator for ${criterion.name}`}
        data-testid={`criteria-filter-op-${index}`}
        wrapperStyle={{ flex: '1 1 128px', minWidth: 128 }}
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

      {/*
        A 24px target, which is the one the candidate card's own copy control takes. It
        sits last because it removes the whole row, and a control that undoes everything
        beside it belongs at the end of what it undoes.
      */}
      <IconButton
        label={`Remove ${criterion.name}`}
        size={24}
        onClick={onRemove}
        data-testid={`criteria-filter-remove-${index}`}
        style={{ flexShrink: 0, color: 'var(--text-secondary)' }}
      >
        <CloseIcon width="10" height="10" />
      </IconButton>
    </li>
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
  criterion: Criterion;
  value: string;
  onChange: (value: string) => void;
}) {
  const testId = `criteria-filter-value-${index}`;
  const wrapperStyle = { flex: '1 1 112px', minWidth: 112 };

  if (control === 'scale') {
    // Worst to best, the order the scale itself is stored in — and the order every
    // `at least` reads against.
    const options: SelectOption[] = [...criterion.values]
      .sort((left, right) => left.position - right.position)
      .map((entry) => ({
        value: entry.id,
        label: entry.label,
        testId: `${testId}-option-${entry.id}`,
      }));

    return (
      <Select
        value={options.find((option) => option.value === value)}
        options={options}
        onChange={(option) => onChange(valueOf(option))}
        placeholder="Value"
        aria-label={`Value for ${criterion.name}`}
        data-testid={testId}
        wrapperStyle={wrapperStyle}
      />
    );
  }

  return (
    <TypedValue
      control={control}
      value={value}
      onChange={onChange}
      testId={testId}
      label={`Value for ${criterion.name}`}
      wrapperStyle={wrapperStyle}
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
  label,
  wrapperStyle,
}: {
  control: 'number' | 'text';
  value: string;
  onChange: (value: string) => void;
  testId: string;
  label: string;
  wrapperStyle: React.CSSProperties;
}) {
  const [draft, setDraft] = useState(value);

  // The applied value is the source of truth: clearing the filters resets the chip, and
  // the field has to follow rather than keep what was typed against a question that is gone.
  useEffect(() => setDraft(value), [value]);

  const commit = (): void => {
    if (draft.trim() !== value) onChange(draft.trim());
  };

  return (
    <TextInput
      type={control === 'number' ? 'number' : 'text'}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        // The chip is not a form, so Enter has nothing else to mean here.
        event.preventDefault();
        commit();
      }}
      placeholder="Value"
      aria-label={label}
      data-testid={testId}
      wrapperStyle={wrapperStyle}
    />
  );
}
