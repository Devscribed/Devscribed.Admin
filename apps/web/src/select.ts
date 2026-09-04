import type { SelectOption, SelectOptionLike } from '@devscribed/ds';

/**
 * The system's `Select` deals in **options**, not in the values behind them: `onChange` hands back
 * the option object it was given (or the array of them when `isMulti`), because the control
 * owns both halves of the pair. Every screen that stores a value rather than an option has to
 * cross that boundary, and these are the two ways of doing it.
 *
 * They live here rather than beside each caller because there are five of them across three
 * phases now, and a cast repeated five times is a cast nobody re-reads.
 *
 * They sat under `hiring/` while hiring was the only area on the system. Documents is the
 * second, and nothing about crossing this boundary is hiring's — so they moved up rather
 * than being imported across areas or copied into a second file.
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

/**
 * The option a stored value stands for — what a single-select's `value` needs.
 *
 * `value` takes an *option*, and a bare string is a legal option whose label is itself. So
 * handing it the stored value renders the value: a select bound to a member id draws the
 * UUID, and one bound to `'multiline'` draws `multiline` instead of `Multiline`. That is
 * only invisible where a list's values happen to equal its labels, which is why it has to
 * be crossed deliberately rather than noticed.
 *
 * Returns `undefined` when nothing matches, which is what shows the placeholder — the right
 * answer for a value the list no longer offers.
 *
 * **The empty string is a value like any other.** It used to be short-circuited to `undefined`
 * on the assumption that empty means unset, and that is wrong wherever a list offers an option
 * *for* it — `— none —`, `Unassigned`, `— No project —`. Those screens drew the placeholder
 * after the reader had chosen the option that says "none", so the one answer the list exists
 * to offer was the one it could not show as chosen. A value with no matching option still
 * falls out of `find` as `undefined`, which is the case the placeholder was for.
 */
export const optionFor = (
  options: SelectOptionLike[],
  value: string | null | undefined,
): SelectOptionLike | undefined =>
  value == null
    ? undefined
    : options.find((option) => (typeof option === 'string' ? option : option.value) === value);
