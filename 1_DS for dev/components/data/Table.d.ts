import { ReactNode } from 'react';
export interface TableProps {
  columns?: string[];
  rows?: ReactNode[][];
  /** Row indices to render grayscale/disabled (matches the source's inactive-member styling). */
  disabledRowIds?: number[];
}

export function Table(props: TableProps): JSX.Element;
