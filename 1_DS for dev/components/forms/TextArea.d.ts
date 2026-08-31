import { ReactNode, Ref, TextareaHTMLAttributes } from 'react';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  /** §25 — the message under the field, `*`-prefixed and painted with the error treatment.
   *  A node, not a boolean: this is `TextInput`'s §3 collapse of `error` + `errorMessage`. */
  error?: ReactNode;
  /** §25 — id (and test id) for the error node, so it can be an `aria-describedby` target. */
  errorId?: string;
  /** §33 — a node at the trailing end of the **label row**: a character count, an autosave
   *  indicator. Not inside the field, which is `TextInput`'s answer (§5) — a multi-line field has
   *  no unambiguous right edge. The label row's height does not depend on the value, so an
   *  indicator can appear, change and leave without moving the field beneath it. */
  trailing?: ReactNode;
  /** §25 — every other attribute reaches the `<textarea>`; `style` merges over the painted one,
   *  and `id` also wires the label's `htmlFor`. Falls back to a generated id. */
  ref?: Ref<HTMLTextAreaElement>;
}

export function TextArea(props: TextAreaProps): JSX.Element;
