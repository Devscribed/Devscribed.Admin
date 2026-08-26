import * as React from 'react';

export interface ComboboxOption {
  value: string;
  /** Shown in the list and on the chip, and what typing filters against. */
  label: string;
}

export interface ComboboxProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'size' | 'type'
  > {
  label?: React.ReactNode;
  /** The selected option values, in the order they were added. */
  value?: string[];
  options?: ComboboxOption[];
  onChange?: (value: string[]) => void;
  /** Offered as `Create "…"` when the typed name matches no option, case-insensitively. */
  allowCreate?: boolean;
  onCreate?: (name: string) => void;
  /** `false` keeps at most one selection; the value is still a list. */
  multiple?: boolean;
  placeholder?: string;
  /** Renders a red border, ring and message, matching `Input`. */
  error?: string;
  disabled?: boolean;
  /** Verb on the create row. Defaults to `Create`. */
  createLabel?: string;
  /** Shown when nothing matches and creating is not offered. */
  emptyLabel?: string;
  createTestId?: string;
  chipTestId?: (value: string) => string | undefined;
  optionTestId?: (value: string) => string | undefined;
  wrapperStyle?: React.CSSProperties;
}

/**
 * Multi-select text picker with an optional create row — `Select` with typing,
 * filtering, chips, and a way to add what is missing.
 */
export declare function Combobox(props: ComboboxProps): JSX.Element;
