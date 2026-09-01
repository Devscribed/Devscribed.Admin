import { HTMLAttributes } from 'react';

/**
 * §53 — page controls. Nothing in blue paginates, because prod's list screens all load the
 * next page inline, so every value is taken from blue's small controls rather than measured
 * off a control that does not exist.
 */
export interface PaginationProps extends HTMLAttributes<HTMLElement> {
  /** 1-based. A page beyond `pageCount` still renders, so the strip never lies about where it is. */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  /** The `<nav>`'s accessible name. Defaults to `Pagination`. */
  label?: string;
  previousLabel?: string;
  nextLabel?: string;
  /** The component draws the buttons, so only it can tag them. */
  pageTestId?: (page: number) => string | undefined;
}

/** Renders nothing at all when there is one page: a control with one choice is not a choice. */
export function Pagination(props: PaginationProps): JSX.Element | null;
