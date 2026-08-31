export interface CircleSelectOption {
  label: string;
  value: string;
}

export interface CircleSelectProps {
  /** Rendered as the placeholder, `${count}+` — the control never shows a value. */
  count?: number;
  options?: CircleSelectOption[];
  /** Map of option value → checked. */
  checked?: Record<string, boolean>;
  onOptionChange?: (option: CircleSelectOption) => void;
}

export function CircleSelect(props: CircleSelectProps): JSX.Element;
