export interface TimeFieldProps {
  label?: string;
  /** Minutes since midnight, or a pre-formatted string. */
  value?: number | string;
  onChange?: (minutes: number) => void;
  /** Hide times after `now`. */
  isToday?: boolean;
  /** Minutes since midnight treated as now; defaults to the real clock. */
  now?: number;
  error?: boolean;
  errorMessage?: string;
  /** Shows the "Next day" tooltip above the field. */
  nextDay?: boolean;
  width?: number | string;
  inputWidth?: number | string;
}

export function TimeField(props: TimeFieldProps): JSX.Element;
