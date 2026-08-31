export interface ToggleButtonProps {
  /** Rendered with the global `.input-label` treatment above the control. */
  label?: string;
  value1?: string;
  value2?: string;
  /** Whichever of `value1` / `value2` is currently selected. */
  selectedValue?: string;
  onValue1Click?: () => void;
  onValue2Click?: () => void;
}

export function ToggleButton(props: ToggleButtonProps): JSX.Element;
