import * as React from 'react';

export interface FileInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onSelect' | 'value'> {
  /** Micro-label above the field. Grotesk 11px uppercase, wider tracking. */
  label?: React.ReactNode;
  /** Renders red border + 3px error ring + message underneath. */
  error?: string;
  /** Helper text — muted, replaced by `error` when set. State the constraints here. */
  hint?: string;
  /** Filename shown beside the chooser. The caller owns the selected file. */
  fileName?: string | null;
  /** `data-testid` on the filename, applied only while a file is chosen. */
  fileNameTestId?: string;
  /** Called with the chosen `File`, or `null` when the selection is cleared. */
  onSelect?: (file: File | null) => void;
  chooseLabel?: string;
  clearLabel?: string;
  emptyLabel?: string;
  wrapperStyle?: React.CSSProperties;
}

/**
 * File chooser with `Input`'s field geometry and error treatment. Nothing in the
 * bundle accepted a file before this; the native control is visually replaced but
 * kept in the accessibility tree, so the label and keyboard behaviour are the real
 * ones.
 */
export declare function FileInput(props: FileInputProps): JSX.Element;
