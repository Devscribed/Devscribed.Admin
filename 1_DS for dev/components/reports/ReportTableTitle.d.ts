export interface ReportTableTitleProps {
  title?: string;
  timeZone?: string;
  onExport?: () => void;
  exportLabel?: string;
}

export function ReportTableTitle(props: ReportTableTitleProps): JSX.Element;
