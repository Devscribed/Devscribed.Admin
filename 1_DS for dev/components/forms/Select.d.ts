export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps {
  label?: string;
  /** Defaults to react-select's own `Select...`. */
  placeholder?: string;
  /** A single option, or an array when `isMulti`. */
  value?: SelectOption | string | (SelectOption | string)[];
  options?: (SelectOption | string)[];
  onChange?: (option: SelectOption | string | (SelectOption | string)[]) => void;
  /** Accepted for parity with react-select; every call site in the app passes false. */
  isSearchable?: boolean;
  /** Greys the value and indicators (neutral40 / neutral10) and blocks pointer events. */
  isDisabled?: boolean;
  /** Renders the selection as removable chips (white, 7px blue left border, 8px radius). */
  isMulti?: boolean;
  /** Red border + red glow (`.errorInput` treatment). */
  error?: boolean;
  /** Message under the control: 10px / -20px in `dropdown`, 8px / -16px in `formik`. */
  errorMessage?: string;
  /** Mirrors DropdownSelect's `withDescription`: suppresses the blue selected-row highlight
   *  (used by filters whose options render a two-line description + value). */
  withDescription?: boolean;
  /** Mirrors react-select's `formatOptionLabel(option, { context })`. */
  formatOptionLabel?: (option: SelectOption | string, meta: { context: 'menu' | 'value' }) => JSX.Element | string;
  /** `dropdown` = DropdownSelect (4px control, menu +10px, 150px min width; default).
   *  `formik` = CustomFormikSelect / AutocompleteSelect (8px control, menu +8px). */
  variant?: 'dropdown' | 'formik';
}

export function Select(props: SelectProps): JSX.Element;
