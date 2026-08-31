export interface DateRangePickerProps {
  start?: Date | null;
  end?: Date | null;
  /** `maxDate` in source — always `new Date()`; later days render disabled. */
  maxDate?: Date;
  /** react-datepicker's `selectsRange` onChange: `[start, end]`, end null mid-selection. */
  onChange?: (dates: [Date | null, Date | null]) => void;
}

export function DateRangePicker(props: DateRangePickerProps): JSX.Element;
