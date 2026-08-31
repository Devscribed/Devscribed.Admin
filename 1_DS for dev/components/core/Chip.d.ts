import { HTMLAttributes, ReactNode } from 'react';

export interface ChipProps extends HTMLAttributes<HTMLDivElement> {
  /** The chip's text. `children` wins when both are given. */
  label?: ReactNode;
  /** Draws the removal cross. Omit for a read-only chip — which also drops the pointer cursor. */
  onRemove?: () => void;
  /** Accessible name for the cross. Defaults to `Remove {label}`. */
  removeLabel?: string;
  /** §39 — a node before the label: a drag handle, a leading glyph. `trailing`'s mirror. */
  leading?: ReactNode;
  /** §39 — blocks the cross without removing it: `aria-disabled`, still focusable. */
  removeDisabled?: boolean;
  /** §39 — id of the node saying why it is blocked, wired as the cross's `aria-describedby`. */
  removeDescribedBy?: string;
  /** §37 — `data-testid` for the cross, which the component draws itself. */
  removeTestId?: string;
  /** §37 — a node between the label and the cross: a value control, a count. Not inside the
   *  label, which ellipsises to one line and clips anything that opens out of it. */
  trailing?: ReactNode;
  children?: ReactNode;
}

export function Chip(props: ChipProps): JSX.Element;
