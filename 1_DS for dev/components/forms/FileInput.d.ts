import { CSSProperties, InputHTMLAttributes, ReactNode, Ref } from 'react';

export interface FileInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> {
  label?: string;
  /** Comma-separated extension or MIME list, straight onto the `<input>`. */
  accept?: string;
  /** The chosen file's name, owned by the caller. `null` draws `emptyLabel`. */
  fileName?: string | null;
  /** §47 — test id for that node, drawn only when there is a name to tag. */
  fileNameTestId?: string;
  /** Leading affordance's text. Default `Choose file`. */
  chooseLabel?: string;
  /** What the value slot reads before anything is chosen. Default `No file chosen`. */
  emptyLabel?: string;
  /** Message under the field, `*`-prefixed and painted with the error treatment. */
  error?: ReactNode;
  /** §4's shape — id (and test id) for the error node, so it can be described by. */
  errorId?: string;
  /** Persistent help text. Shares the error's slot; the error wins when both are given. */
  hint?: ReactNode;
  /** §4's shape — id for the hint node. */
  hintId?: string;
  /** The `File` the browser handed over, or `null`. A caller's own `onChange` still runs. */
  onSelect?: (file: File | null) => void;
  /** §35's split — `style` and `...rest` address the `<input>`, this the box around it. */
  wrapperStyle?: CSSProperties;
  ref?: Ref<HTMLInputElement>;
}

export function FileInput(props: FileInputProps): JSX.Element;
