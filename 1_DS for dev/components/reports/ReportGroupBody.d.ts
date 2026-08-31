export const REPORT_COLUMNS: string[];

export interface ReportGroupMember {
  member: string;
  currentRate?: string;
  totalHours?: string;
  amount?: string;
  details?: Array<{ activity?: string; totalHours?: string; notes?: string }>;
}

export interface ReportGroup {
  title: string;
  members: ReportGroupMember[];
  total: { totalHours?: string; amount?: string };
}

export interface ReportGroupBodyProps {
  group: ReportGroup;
  columns?: string[];
  /** Render each member's detail rows. */
  detailed?: boolean;
}

export function ReportGroupBody(props: ReportGroupBodyProps): JSX.Element;

export interface ReportTableHeadProps { columns?: string[]; }
export function ReportTableHead(props: ReportTableHeadProps): JSX.Element;
