import * as React from 'react';

export interface PaginationProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'onChange'> {
  /** 1-based. */
  page?: number;
  pageCount?: number;
  onChange?: (page: number) => void;
  /** Accessible name of the `<nav>`. Defaults to `Pagination`. */
  label?: string;
  /** `data-testid` per page button — the numbers are otherwise addressable only by text. */
  pageTestId?: (page: number) => string | undefined;
}

/**
 * Numbered pagination with previous/next and disabled bounds. Long ranges window
 * around the current page with an ellipsis, keeping the first and last reachable.
 */
export declare function Pagination(props: PaginationProps): JSX.Element;
