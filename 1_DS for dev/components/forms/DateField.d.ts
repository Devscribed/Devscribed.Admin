export interface DateFieldProps {
  label?: string;
  /** Displayed date, e.g. "Mar 18, 2026". */
  value?: string;
  /** 140 in the shared module; the Formik variant renders 200. */
  width?: number | string;
  /** Disable days after `today` (the add/edit-time call site). */
  maxToday?: boolean;
  /** Day of month treated as today; defaults to the real date. */
  today?: number;
}

export function DateField(props: DateFieldProps): JSX.Element;
