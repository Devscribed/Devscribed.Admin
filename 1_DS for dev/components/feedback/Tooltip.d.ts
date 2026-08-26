import * as React from 'react';

export interface TooltipProps {
  /** The reason. Nothing renders when it is absent, so a guard can be conditional. */
  content?: React.ReactNode;
  /** Fixed id for the bubble, when the caller wires `aria-describedby` itself. */
  id?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** `data-testid` on the bubble. */
  testId?: string;
  style?: React.CSSProperties;
  /** The anchor, or a function handed the bubble's id to build one. */
  children?: React.ReactNode | ((tooltipId: string) => React.ReactNode);
}

/**
 * Reason bubble shown on hover and on focus. It stays in the accessibility tree at all
 * times so `aria-describedby` always resolves — only its visibility changes.
 */
export declare function Tooltip(props: TooltipProps): JSX.Element;
