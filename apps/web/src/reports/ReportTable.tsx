'use client';

import type { CSSProperties } from 'react';
import { ReportGroupBody, ReportTableHead, type ReportTableColumn } from '@devscribed/ds';

export interface ReportTableGroup<Row> {
  id: string;
  title: string;
  rows: Row[];
  total: Record<string, any>;
}

/**
 * The grouped report table, composed once for all three reports out of the system's
 * `ReportTableHead` and `ReportGroupBody` (§83).
 *
 * It is one `<table>`, not a card per group. Every group therefore shares one set of column
 * widths, which is the only way a figure in the third group is comparable to the figure in the
 * first — and it is one horizontal scroller instead of one per group, so a narrow viewport
 * scrolls the report rather than each card independently.
 *
 * The grand total is a `ReportGroupBody` with no band and no rows: it is the group that is
 * every group, and rendering it through the same component is what keeps its cells on the same
 * insets as the totals above it.
 */
export function ReportTable<Row>({
  ariaLabel,
  columns,
  groups,
  rowStyle,
  grandTotal,
  grandTotalLabel,
}: {
  ariaLabel: string;
  columns: ReportTableColumn<Row>[];
  groups: ReportTableGroup<Row>[];
  rowStyle?: (row: Row) => CSSProperties | undefined;
  /** Omit to draw no footer. */
  grandTotal?: Record<string, any> | null;
  grandTotalLabel?: string;
}) {
  /* A single group's total and the grand total are the same number twice, so the per-group
     row is dropped when there is only one group — as it was before the repaint. */
  const showGroupTotals = groups.length > 1;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        data-testid="reports-table"
        aria-label={ariaLabel}
        style={{ width: '100%', borderCollapse: 'collapse' }}
      >
        <ReportTableHead columns={columns} />
        {groups.map((group) => (
          <ReportGroupBody<Row>
            key={group.id}
            data-testid={`reports-group-${group.id}`}
            title={group.title}
            bandTestId={`reports-group-${group.id}-band`}
            columns={columns}
            rows={group.rows}
            rowStyle={rowStyle}
            rowTestId={(_row, index) => `reports-group-${group.id}-row-${index}`}
            total={showGroupTotals ? group.total : null}
            totalTestId={`reports-group-${group.id}-total`}
          />
        ))}
        {grandTotal && (
          <ReportGroupBody<Row>
            data-testid="reports-table-footer"
            columns={columns}
            rows={[]}
            total={grandTotal}
            totalLabel={grandTotalLabel}
          />
        )}
      </table>
    </div>
  );
}
