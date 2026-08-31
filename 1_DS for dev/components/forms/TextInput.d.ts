import { InputHTMLAttributes, ReactNode, Ref } from 'react';

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  /** Grey suffix box fused to the right of the field (splits the row into a 40/60 grid). */
  description?: string;
  /** Message under the field, `*`-prefixed and painted with the error treatment. */
  error?: ReactNode;
  /** §4 — id (and test id) for the error node, so it can be an `aria-describedby` target. */
  errorId?: string;
  /** §4 — persistent help text. Shares the error's slot; the error wins when both are given. */
  hint?: ReactNode;
  /** §4 — id for the hint node, so it can be an `aria-describedby` target. */
  hintId?: string;
  /** §5 — control drawn inside the field's right edge, e.g. a password reveal toggle. */
  trailing?: ReactNode;
  type?: string;
  /** §3 — every other attribute reaches the `<input>`; `style` merges over the painted one, and
   *  `id` also wires the label's `htmlFor`. Falls back to a generated id. */
  ref?: Ref<HTMLInputElement>;
}

export function TextInput(props: TextInputProps): JSX.Element;
