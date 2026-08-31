import { CSSProperties, HTMLAttributes } from 'react';

export interface ToggleButtonProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Rendered with the global `.input-label` treatment above the control. */
  label?: string;
  value1?: string;
  value2?: string;
  /** Whichever of `value1` / `value2` is currently selected. */
  selectedValue?: string;
  onValue1Click?: () => void;
  onValue2Click?: () => void;
  /** §31 — `data-testid` per segment; blue draws both and tags neither. */
  value1TestId?: string;
  value2TestId?: string;
  /** §31 — style for the root, which carries prod's `margin-bottom: 20px` and `max-width: 160px`. */
  style?: CSSProperties;
}

/**
 * ToggleButton — §31. A two-value segmented pill, and one control rather than two buttons:
 * `role="radiogroup"` over two `role="radio"` segments, a single tab stop, and arrow keys that
 * move and select. Prod's markup claims none of it, so a reader was told there were two actions
 * instead of one choice with two answers.
 *
 * Give it a name — `label` if it should be drawn, `aria-label` if it should only be announced.
 * @startingPoint section="Core" subtitle="Segmented control" viewport="240x120"
 */
export function ToggleButton(props: ToggleButtonProps): JSX.Element;
