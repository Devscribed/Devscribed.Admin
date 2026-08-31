import { CSSProperties, InputHTMLAttributes } from 'react';

export interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Called by the clear cross, which only renders while the field has a value. */
  onClear?: () => void;
  /** Bordered field. Defaults to `false` (borderless), as in source — every real call site in
   *  the app passes `outlined`. */
  outlined?: boolean;
  /** §26 — style for the 44px positioning root; `...rest` and `style` address the `<input>`. */
  wrapperStyle?: CSSProperties;
  /** §26 — accessible name for the clear cross. Defaults to `Clear search`. */
  clearLabel?: string;
}

export function SearchInput(props: SearchInputProps): JSX.Element;
