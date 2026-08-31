export interface EmptyStateProps {
  /** The message, as in source (`children: string`). */
  children?: string;
  /** Alias for `children`; every call site in the app uses children instead. */
  message?: string;
}

export function EmptyState(props: EmptyStateProps): JSX.Element;
