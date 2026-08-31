import { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Header line, at the headline-6 step. Drawn only when `title` or `action` is given. */
  title?: ReactNode;
  /** Trailing element in the header row (an Edit link, a count, a button). */
  action?: ReactNode;
  /** 16px body padding. Set false for an edge-to-edge `Table`. Default true. */
  padded?: boolean;
  /**
   * Clips content to the card's radius. Default true, which is what rounds an edge-to-edge
   * `Table`'s corners — and what cuts off a `Select` popover opened inside the card. Set
   * `false` on any card that hosts one.
   */
  clip?: boolean;
  children?: ReactNode;
}

export function Card(props: CardProps): JSX.Element;
