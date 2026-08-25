import * as React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** How many placeholder rows to draw. */
  rows?: number;
  /** Row height in px. */
  height?: number;
  /** Gap between rows — a spacing token. */
  gap?: string;
}

/**
 * Placeholder rows for a list or table that is still loading. Meridian never shows a
 * bare spinner inside a table: the shape of what is coming is itself information.
 */
export declare function Skeleton(props: SkeletonProps): JSX.Element;
