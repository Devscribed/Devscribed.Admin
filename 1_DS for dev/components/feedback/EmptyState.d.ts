import { HTMLAttributes } from 'react';

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  /** The message, as in source (`children: string`). */
  children?: string;
  /** Alias for `children`; every call site in the app uses children instead. */
  message?: string;
  /** §28 — every other attribute reaches the wrapper; `style` merges over the painted one. */
}

export function EmptyState(props: EmptyStateProps): JSX.Element;
