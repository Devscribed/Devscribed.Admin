'use client';

import { Button, Select, ToggleButton, type SelectOption } from '@devscribed/ds';
import { optionFor, valueOf, valuesOf } from '@/select';
import type { FilterOption, OwnerScope } from './types';

/**
 * The filter controls the three report screens share, each one the system's control bound to
 * the shape the report endpoints speak.
 *
 * All four were hand-built once per screen — a segmented control, a multi-select, a
 * single-select dropdown and a chip toggle, six files between them, every one carrying its own
 * outside-click listener and its own caret. They are the system's `ToggleButton` (§31),
 * `Select` (§21, §29, §36) and `Button pressed` (§71); what is left here is only the binding
 * between a report's ids and the options a `Select` deals in.
 *
 * 200px is the width a filter takes in the bar. It is wide enough for two chips or a member's
 * name and narrow enough that five of them fit a line before the row wraps.
 */
const FILTER_WIDTH = { width: 200 };

/** The All / My scope switch. Spec §UI · Routes — it changes in-page state, not the URL. */
export function ScopeToggle({
  owner,
  onChange,
}: {
  owner: OwnerScope;
  onChange: (next: OwnerScope) => void;
}) {
  return (
    <ToggleButton
      data-testid="reports-owner-toggle"
      label="Scope"
      value1="All"
      value2="My"
      selectedValue={owner === 'all' ? 'All' : 'My'}
      onValue1Click={() => onChange('all')}
      onValue2Click={() => onChange('my')}
      value1TestId="reports-owner-toggle-all"
      value2TestId="reports-owner-toggle-my"
      /* The row owns the spacing between its controls; the control does not add its own. */
      style={{ marginBottom: 0 }}
    />
  );
}

/**
 * Members / Projects / Clients — a set of ids drawn from a catalogue.
 *
 * `closeMenuOnSelect={false}` is §36's documented opt-out, and this is the case it is written
 * for: picking three members is one act, and a menu that shuts after each of them makes it
 * three. Nothing sits under the panel but the table it is filtering.
 *
 * PATCH-020 — and `summariseSelection`, which is the same argument about the same act: the
 * control says `Marketing +2` on one line and the ticks live in the menu, so picking a fourth
 * thing does not push the page down and unpicking one does not require finding its chip.
 */
export function MultiFilter({
  label,
  testId,
  options,
  selected,
  onChange,
  disabled,
  /**
   * PATCH-019 — a wider box, for a filter that is not in the reports bar. 200 is the width
   * five filters in a row are budgeted at; a filter standing alone on a screen has room for
   * more, and chips that fit on one line are the whole point of the number.
   */
  width,
}: {
  label: string;
  testId: string;
  options: readonly FilterOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  width?: number;
}) {
  const rows: SelectOption[] = options.map((option) => ({
    label: option.label,
    value: option.id,
    testId: `${testId}-item-${option.id}`,
  }));

  return (
    <Select
      data-testid={testId}
      label={label}
      placeholder="All"
      isMulti
      /* PATCH-020 — a filter states its selection on one line and ticks it in the menu. The
         chip list was as tall as the number of ticks, so every third team pushed the whole
         page down a line, and once everything was ticked the menu had nothing left in it to
         untick. */
      summariseSelection
      closeMenuOnSelect={false}
      isDisabled={disabled}
      options={rows}
      /* An id whose catalogue row has gone (an archived client) drops out rather than
         rendering as a bare id — `optionFor` returns nothing for it. */
      value={selected.map((id) => optionFor(rows, id)).filter((row) => row !== undefined)}
      onChange={(next) => onChange(valuesOf(next))}
      wrapperStyle={width === undefined ? FILTER_WIDTH : { width }}
    />
  );
}

/** Type / Status / Billable — one of a fixed, named set. */
export function SingleFilter<Value extends string>({
  label,
  testId,
  value,
  options,
  labelFor,
  onChange,
}: {
  label: string;
  testId: string;
  value: Value;
  options: readonly Value[];
  labelFor: (option: Value) => string;
  onChange: (next: Value) => void;
}) {
  const rows: SelectOption[] = options.map((option) => ({
    label: labelFor(option),
    value: option,
    testId: `${testId}-item-${option}`,
  }));

  return (
    <Select
      data-testid={testId}
      label={label}
      options={rows}
      /* §21's own trap, and why `optionFor` exists: `value` takes an option, and handing it the
         stored string would draw `non-billable` where the list says `Non-billable only`. */
      value={optionFor(rows, value)}
      onChange={(next) => onChange(valueOf(next) as Value)}
      wrapperStyle={FILTER_WIDTH}
    />
  );
}

/**
 * "Sum date ranges" and "Detailed" — the two switches that change how rows are gathered rather
 * than which rows there are.
 *
 * §71's `pressed`, not a chip: this is a control that stays down, and `Chip` is a token that is
 * read and removed. `pressed` also sets `aria-pressed`, which is the only thing that tells a
 * reader the switch is on — the tint is a picture of a state, not the state.
 */
export function AggregationToggle({
  label,
  testId,
  active,
  onChange,
}: {
  label: string;
  testId: string;
  active: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Button data-testid={testId} pressed={active} onClick={() => onChange(!active)}>
      {label}
    </Button>
  );
}
