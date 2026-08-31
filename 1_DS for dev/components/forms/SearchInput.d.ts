export interface SearchInputProps {
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Called by the clear cross, which only renders while the field has a value. */
  onClear?: () => void;
  /** Bordered field. Defaults to `false` (borderless), as in source — every real call site in
   *  the app passes `outlined`. */
  outlined?: boolean;
}

export function SearchInput(props: SearchInputProps): JSX.Element;
