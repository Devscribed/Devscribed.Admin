import * as React from 'react';

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> {
  /** Micro-label above the field. Grotesk 11px uppercase, wider tracking. */
  label?: React.ReactNode;
  /**
   * Node pinned to the far end of the label row — a saved-at indicator, a character
   * count. The row keeps its height whether or not this has content, so text appearing
   * there never shifts the field below it.
   *
   * `Input`'s `trailing` sits *inside* the field, where a multi-line field has no
   * unambiguous place to put one.
   */
  trailing?: React.ReactNode;
  /** Renders red border + 3px error ring + message underneath. */
  error?: string;
  /** Helper text — muted, replaced by `error` when set. */
  hint?: string;
  /** Visible lines. Defaults to 4; the field is still user-resizable vertically. */
  rows?: number;
  wrapperStyle?: React.CSSProperties;
}

/**
 * Multi-line counterpart to `Input`, with the same label / hint / error contract.
 * `Input` extends `InputHTMLAttributes<HTMLInputElement>` and is single-line by
 * construction, which is why this is a separate component rather than a prop.
 *
 * The label is a real `<label for>`: an `id` is generated when none is passed, so the
 * micro-label names the field to a screen reader rather than merely sitting above it.
 */
export declare function Textarea(props: TextareaProps): JSX.Element;
