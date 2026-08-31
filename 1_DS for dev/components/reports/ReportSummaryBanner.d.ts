export interface ReportSummaryItem { label: string; value: string; }

export interface ReportSummaryBannerProps {
  summary?: ReportSummaryItem[];
}

export function ReportSummaryBanner(props: ReportSummaryBannerProps): JSX.Element;
