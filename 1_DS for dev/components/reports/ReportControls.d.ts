export interface ReportRange { start?: Date; end?: Date; }

export interface ReportControlsProps {
  tabs?: string[];
  tab?: string;
  onTab?: (tab: string) => void;
  range?: ReportRange;
  onRange?: (range: ReportRange) => void;
  onApply?: () => void;
  onFilters?: () => void;
  maxDate?: Date;
}

export function ReportControls(props: ReportControlsProps): JSX.Element;
