import * as React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode;
  /** Trailing element in the header (e.g. Edit link). */
  action?: React.ReactNode;
  /** Applies default 20/24 body padding. Set false for edge-to-edge tables. */
  padded?: boolean;
  /**
   * Clips content to the card's radius. Defaults to true, which is what rounds an
   * edge-to-edge `Table`'s corners — and what cuts off a `Select` or `Combobox` popover
   * opened inside the card. Set `false` on any card that hosts one.
   */
  clip?: boolean;
  children?: React.ReactNode;
}

/** Meridian card — 14px radius, paper-white body, warm brown-cast shadow. */
export declare function Card(props: CardProps): JSX.Element;
