import React from 'react';

export interface ReportTableColumn<Row = any> {
  /** The column's heading. */
  label: React.ReactNode;
  /** The field a row is read by, and the column's identity across head, body and total. */
  key: string;
  /** `end` for a figure. Defaults to `start`; there is no centred column in a report. */
  align?: 'start' | 'end';
  /** A fixed width, for a numeric column that must not resize as its digits change. */
  width?: number;
  render?: (row: Row) => React.ReactNode;
  /** Reads the group's total record. A column with no total renders an empty cell. */
  renderTotal?: (total: Record<string, any>) => React.ReactNode;
}

export interface ReportTableHeadProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  columns?: ReportTableColumn<any>[];
}

export interface ReportGroupBodyProps<Row = any>
  extends Omit<React.HTMLAttributes<HTMLTableSectionElement>, 'title'> {
  /** The band above the group's rows: a project, a client, a month. */
  title?: React.ReactNode;
  columns?: ReportTableColumn<Row>[];
  rows?: Row[];
  /** The group's own total. Omit to draw no total row — a report with one group has its total
   *  in the footer instead, and drawing both says the same number twice. */
  total?: Record<string, any> | null;
  /** A row's own tint: a holiday, a vacation, a row that is not work. */
  rowStyle?: (row: Row, index: number) => React.CSSProperties | undefined;
  /** §83 — every row of the group is drawn here, so only this component can tag them. */
  bandTestId?: string;
  rowTestId?: (row: Row, index: number) => string | undefined;
  totalTestId?: string;
  /** The label in the total row's first cell. */
  totalLabel?: React.ReactNode;
}

/* A cell's horizontal inset. The first and last columns clear the table's edge; the ones
   between take the tighter gutter, so a run of figures does not drift apart. */
const cell = (column: ReportTableColumn, index: number, count: number): React.CSSProperties => {
  const first = index === 0;
  const last = index === count - 1;
  return {
    paddingLeft: first ? 'var(--space-7)' : 0,
    paddingRight: last ? 'var(--space-7)' : 'var(--space-5)',
    textAlign: column.align === 'end' ? 'right' : 'left',
    ...(column.width ? { width: column.width } : null),
    /* §83 — every cell carries tabular figures, not only the ones holding a number. A column
       that switches families or metrics between a value and a dash reflows on every filter. */
    fontVariantNumeric: 'tabular-nums',
  };
};

/**
 * ReportTableHead — the `<thead>` that goes with `ReportGroupBody`. The two are one component
 * in two parts: the head is what decides the columns' widths for every group below it, so a
 * screen that draws its own head and this body is drawing two tables that disagree.
 */
export function ReportTableHead({ columns = [], style, ...rest }: ReportTableHeadProps) {
  return (
    <thead {...rest} style={style}>
      <tr style={{ backgroundColor: 'var(--surface-sunken)' }}>
        {columns.map((column, index) => (
          <th
            key={column.key}
            scope="col"
            style={{
              ...cell(column, index, columns.length),
              /* 70px and the 160px floor are `Table`'s header (§18), so a report's head and a
                 list's head are the same object at the same height. */
              height: 70,
              minWidth: column.width || 160,
              fontFamily: 'var(--font-family-base)',
              fontSize: 'var(--font-size-s)',
              fontWeight: 'var(--font-weight-medium)',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
            }}
          >
            {column.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/**
 * ReportGroupBody — one group of a report: a band naming it, its rows, and its total.
 *
 * §83 — **a group is one `<tbody>`, and the report is one `<table>`.** Reports were three
 * screens of `role="table"` divs, one bordered card per group, each its own horizontal
 * scroller. That layout cannot hold a column: every card measures its own content, so `Amount`
 * lands in a different place in every group and the eye has nothing to run down. A real table
 * with one `<colgroup>`'s worth of widths is what makes a figure comparable to the figure two
 * groups below it, and it is also what makes the head sticky, the columns announceable, and
 * the whole thing one scroller instead of five.
 *
 * The band is a `role="rowheader"` spanning every column — it names the rows under it, which
 * is what a row header is; the default role for a `<th>` in that position would announce it as
 * a *column* header and claim the figures below belong to a column called "Website Redesign".
 *
 * There is no collapsed state and no expand arrow. Whether a group shows its detail rows is
 * decided by the request that fetched them, so the rows arrive already expanded and there is
 * nothing here to toggle — a caret that re-hides data the server was asked for is a second,
 * disagreeing copy of the same setting.
 */
export function ReportGroupBody<Row = any>({
  title, columns = [], rows = [], total, rowStyle,
  bandTestId, rowTestId, totalTestId, totalLabel = 'Total',
  style, ...rest
}: ReportGroupBodyProps<Row>) {
  const count = columns.length;
  const [hovered, setHovered] = React.useState(-1);

  return (
    <tbody {...rest} style={{ fontFamily: 'var(--font-family-base)', ...style }}>
      {title != null && (
        <tr style={{ backgroundColor: 'var(--surface-sunken)' }}>
          <th
            role="rowheader"
            colSpan={count || 1}
            data-testid={bandTestId}
            style={{
              /* 50px is the report row's height, and the band is one of them. */
              height: 50, textAlign: 'left', verticalAlign: 'middle',
              padding: '0 var(--space-7)',
              fontSize: 'var(--font-size-s)',
              fontWeight: 'var(--font-weight-button)',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </th>
        </tr>
      )}

      {rows.map((row, index) => {
        const own = rowStyle ? rowStyle(row, index) : undefined;
        /* A row that carries its own ground — a holiday, a vacation, a row that is not work —
           keeps it under the pointer. The hover tint is how a plain row says it is the one the
           cursor is on; painting it over a tinted row would trade a fact for a hint. */
        const tinted = !!(own && (own.background || own.backgroundColor));
        return (
          <tr
            key={index}
            data-testid={rowTestId ? rowTestId(row, index) : undefined}
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(-1)}
            style={{
              height: 50,
              borderBottom: 'var(--border-width-hairline) solid var(--color-gray-lighter)',
              ...own,
              ...(!tinted && hovered === index ? { backgroundColor: 'var(--color-row-hover)' } : null),
            }}
          >
            {columns.map((column, columnIndex) => (
              <td
                key={column.key}
                style={{
                  ...cell(column, columnIndex, count),
                  fontSize: 'var(--font-size-s)',
                  fontWeight: 'var(--font-weight-regular)',
                  color: 'var(--text-primary)',
                }}
              >
                {column.render ? column.render(row) : (row as any)[column.key]}
              </td>
            ))}
          </tr>
        );
      })}

      {total && (
        /* The total sits **below** the rows it sums, and is separated from them by the control
           border rather than the hairline the rows use — it is a different kind of row, and the
           two weights are the only thing that says so without a second colour. */
        <tr
          data-testid={totalTestId}
          style={{ height: 50, borderTop: 'var(--border-width-control) solid var(--border-default)' }}
        >
          {columns.map((column, columnIndex) => (
            <td
              key={column.key}
              style={{
                ...cell(column, columnIndex, count),
                fontSize: 'var(--font-size-base)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--text-primary)',
              }}
            >
              {columnIndex === 0
                ? totalLabel
                : column.renderTotal
                  ? column.renderTotal(total)
                  : null}
            </td>
          ))}
        </tr>
      )}

      {/* The breather between one group and the next. It is a row because a `<tbody>` cannot
          carry a margin, and `aria-hidden` because it is 50px of nothing — a reader walking the
          table by row should not be told there is an empty one between every group.

          Only a *group* gets one: a body with no band is not a group but the table's own total,
          and a gap under the last row of the table is a gap at the bottom of the page. */}
      {title != null && (
        <tr aria-hidden style={{ height: 50 }}>
          <td colSpan={count || 1} style={{ padding: 0 }} />
        </tr>
      )}
    </tbody>
  );
}
