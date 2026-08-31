import { HTMLAttributes, ReactNode } from 'react';

export interface ChipProps extends HTMLAttributes<HTMLDivElement> {
  /** The chip's text. `children` wins when both are given. */
  label?: ReactNode;
  /** Draws the removal cross. Omit for a read-only chip — which also drops the pointer cursor. */
  onRemove?: () => void;
  /** Accessible name for the cross. Defaults to `Remove {label}`. */
  removeLabel?: string;
  children?: ReactNode;
}

export function Chip(props: ChipProps): JSX.Element;
