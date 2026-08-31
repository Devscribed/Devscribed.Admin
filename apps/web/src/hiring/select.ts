import type { SelectOption } from '@/ds';

/**
 * Blue's `Select` deals in **options**, not in the values behind them: `onChange` hands back
 * the option object it was given (or the array of them when `isMulti`), because the control
 * owns both halves of the pair. Every screen that stores a value rather than an option has to
 * cross that boundary, and these are the two ways of doing it.
 *
 * They live here rather than beside each caller because there are five of them across three
 * phases now, and a cast repeated five times is a cast nobody re-reads.
 */
type Handed = SelectOption | string | (SelectOption | string)[];

/** The single option `onChange` handed back. */
export const asOption = (option: Handed): SelectOption => option as SelectOption;

/** The options `onChange` handed back from an `isMulti` control. */
export const asOptions = (option: Handed): SelectOption[] => option as SelectOption[];

/** Just the value, for a single-select whose caller stores a string. */
export const valueOf = (option: Handed): string =>
  typeof option === 'string' ? option : Array.isArray(option) ? '' : option.value;

/** The values, for an `isMulti` control whose caller stores an array of ids. */
export const valuesOf = (option: Handed): string[] =>
  asOptions(option).map((entry) => (typeof entry === 'string' ? entry : entry.value));
