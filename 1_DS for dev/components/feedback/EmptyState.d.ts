import { HTMLAttributes, ReactNode } from 'react';

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * The message. Blue types this `string`, because prod's empty states are one sentence and
   * nothing else — but §65 is that an empty state whose only content is a sentence is a dead
   * end, and the way out of it belongs *in* the state rather than under it. A node, so a
   * message can be followed by the action that fills the list.
   */
  children?: ReactNode;
  /** Alias for `children`; every call site in the app uses children instead. */
  message?: ReactNode;
  /** §28 — every other attribute reaches the wrapper; `style` merges over the painted one. */
}

export function EmptyState(props: EmptyStateProps): JSX.Element;
