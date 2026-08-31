import { HTMLAttributes, CSSProperties, ReactNode } from 'react';

export interface SelectOption {
  label: string;
  value: string;
  /** §21 — shown but not selectable: `aria-disabled`, no hover, `--text-secondary` ink. The
   *  arrow keys still land on it, which is the point — a hidden option reads as a bug. */
  disabled?: boolean;
  /** §21 — trailing note on the row, e.g. why it is disabled. Drawn inside the option, so it
   *  is part of the option's accessible name rather than something only seen. */
  hint?: ReactNode;
  /** §21 — `data-testid` for the row; blue draws the listbox itself and tags nothing. */
  testId?: string;
}

export interface SelectProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange' | 'value' | 'defaultValue'> {
  label?: string;
  /** Defaults to react-select's own `Select...`. */
  placeholder?: string;
  /** A single option, or an array when `isMulti`. */
  value?: SelectOption | string | (SelectOption | string)[];
  options?: (SelectOption | string)[];
  onChange?: (option: SelectOption | string | (SelectOption | string)[]) => void;
  /** §21 — now implemented: renders react-select's own text input inside the control and
   *  filters the list case-insensitively. Accepted-and-ignored before. */
  isSearchable?: boolean;
  /** Greys the value and indicators (neutral40 / neutral10) and blocks pointer events. */
  isDisabled?: boolean;
  /** Renders the selection as removable `Chip`s (white, 7px blue left border, 8px radius). */
  isMulti?: boolean;
  /** §36 — react-select's own prop and default: the menu closes when an option is chosen, for
   *  `isMulti` as much as for single. Blue kept a multi-select's menu open, which react-select
   *  does only when this is explicitly `false`. Pass `false` for that behaviour. */
  closeMenuOnSelect?: boolean;
  /** Red border + red glow (`.errorInput` treatment). */
  error?: boolean;
  /** Message under the control: 10px / -20px in `dropdown`, 8px / -16px in `formik`. */
  errorMessage?: ReactNode;
  /** §21 — id (and test id) for that message, so it can be an `aria-describedby` target. */
  errorId?: string;
  /** §21 — persistent help text. Shares the error's slot; the error wins when both are given. */
  hint?: ReactNode;
  /** §21 — id for the hint node, so it can be an `aria-describedby` target. */
  hintId?: string;
  /** Mirrors DropdownSelect's `withDescription`: suppresses the blue selected-row highlight
   *  (used by filters whose options render a two-line description + value). */
  withDescription?: boolean;
  /** Mirrors react-select's `formatOptionLabel(option, { context })`. */
  formatOptionLabel?: (option: SelectOption | string, meta: { context: 'menu' | 'value' }) => JSX.Element | string;
  /** `dropdown` = DropdownSelect (4px control, menu +10px, 150px min width; default).
   *  `formik` = CustomFormikSelect / AutocompleteSelect (8px control, menu +8px). */
  variant?: 'dropdown' | 'formik';
  /** §21 — `data-testid` per chip, which is a different node from the option that made it. */
  chipTestId?: (option: SelectOption | string) => string | undefined;
  /** §29 — offers a `Create "…"` row when the query matches no option. **Designed, not
   *  measured**: prod uses react-select, never react-select/creatable. */
  allowCreate?: boolean;
  onCreate?: (label: string) => void;
  /** §29 — `data-testid` for that create row. */
  createTestId?: string;
  /** §21 — id of the combobox node, which the `<label>`'s `htmlFor` also points at.
   *  Falls back to a generated id. */
  id?: string;
  /** §21 — style for the positioning wrapper; `...rest` and `style` address the combobox. */
  wrapperStyle?: CSSProperties;
}

export function Select(props: SelectProps): JSX.Element;
