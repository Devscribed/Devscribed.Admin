import { HTMLAttributes, ReactNode } from 'react';

/**
 * §62 — the dark bubble a blocked action gives its reason in. Shown on hover **and on focus**,
 * which is the whole point: a native `title` is not keyboard-reachable in any major browser,
 * so the one person who could not see why an action is blocked is the one without a pointer.
 */
export interface TooltipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'content' | 'children'> {
  /** The reason. Nothing is drawn without it, so a conditional tooltip is `content={cond ? … : null}`. */
  content?: ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Milliseconds before it appears, so a pointer crossing the trigger does not raise it. */
  delay?: number;
  maxWidth?: number;
  /** Explicit id for the bubble, when the trigger has to name it itself. */
  id?: string;
  /**
   * A node, and the wrapper carries `aria-describedby` for it — or a function, which receives
   * `{ 'aria-describedby' }` to spread onto the real trigger.
   */
  children?: ReactNode | ((props: { 'aria-describedby'?: string }) => ReactNode);
}

export function Tooltip(props: TooltipProps): JSX.Element;
