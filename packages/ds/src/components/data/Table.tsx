import React from 'react';

export interface TableColumn<Row = any> {
  label: React.ReactNode;
  /** Field to read when no `render` is given and rows are records. */
  key?: keyof Row;
  render?: (row: Row) => React.ReactNode;
  /** Flex ratio. Defaults to an equal share, as in source. */
  flex?: number;
  /** Defaults to prod's positional rule: first left, last right, everything between centred. */
  align?: 'flex-start' | 'center' | 'flex-end';
  /** Defaults to 96 on the last column — prod's actions column, §60 — and none elsewhere. */
  maxWidth?: number | 'none';
}

export interface TableProps<Row = any> extends Omit<React.HTMLAttributes<HTMLDivElement>, 'rows'> {
  /** Strings are prod's own shape; objects carry alignment and a renderer. */
  columns?: (string | TableColumn<Row>)[];
  /** Arrays of cells (prod's shape), or the records themselves when columns say how to read them. */
  rows?: Row[] | React.ReactNode[][];
  /** A string names the field to read; a function reads the row. Falls back to the index. */
  rowKey?: string | ((row: Row) => string | number);
  /** `data-testid` per row — a function so it can carry the row's own id. */
  rowTestId?: string | ((row: Row) => string | undefined);
  /** Turns each row into a real anchor. A string applies to every row. */
  rowHref?: string | ((row: Row) => string | null | undefined);
  onRowClick?: (row: Row, event: React.MouseEvent) => void;
  /** Row indices to render grayscale/disabled (matches the source's inactive-member styling). */
  disabledRowIds?: number[];
  /** §34 — dims the rows and sets `aria-busy` together, for a list being refiltered in place.
   *  The rows stay and stay clickable; only the header is left alone, because it did not change. */
  busy?: boolean;
  /** §34 — drops the header row, for a short grouped list already named by the surface it sits in. */
  hideHeader?: boolean;
  /** §34 — a node in the row position after the last row, centred. The infinite-scroll load-more
   *  indicator, which prod renders inside the table rather than as a control beneath it. */
  footer?: React.ReactNode;
}

/* Blue's positional rule: the first column reads left, the last reads right and is capped for
   the actions it holds in prod, everything between is centred. A column that says otherwise
   says so itself.

   §60 — the cap is 96, where blue measured 80. Prod's actions column holds a 32px kebab under a
   header that is never read, so 80px was measured off the *content* and the label was free to
   clip behind it. Ours is a real column heading in blue's own 16px semibold, and `Actions` is
   62px of it: at 80px, minus the 12px of padding on each side, every list screen in the app
   drew `Actio…`. 96 is the first step that fits the word blue itself put there, and it is the
   only column in the table whose width nothing else depends on — the flex share of every other
   column is unchanged, because this one was already at its cap and still is. */
const ACTIONS_MAX_WIDTH = 96;

function geometry(col: TableColumn, i: number, count: number): React.CSSProperties {
  const last = i === count - 1;
  return {
    flex: col.flex != null ? `${col.flex} 1 0` : '1 1',
    display: 'flex', alignItems: 'center', paddingLeft: 12, minWidth: 0,
    justifyContent: col.align || (i === 0 ? 'flex-start' : last ? 'flex-end' : 'center'),
    maxWidth: col.maxWidth != null ? col.maxWidth : (last ? ACTIONS_MAX_WIDTH : 'none'),
    paddingRight: last ? 12 : 0,
  };
}

/**
 * Table — row/column table recreated from components/shared/tables (infiniteScrollTable
 * styling): sticky light-gray header, 70px rows, hover tint, optional disabled/grayscale rows.
 *
 * §18 — prod builds these from a typed column list; the `string[]` / `ReactNode[][]` pair blue
 * measured is what a hand-written kit screen passes, not an API a screen with real records can
 * use. Both shapes work: a column may be a string or an object carrying `label`, alignment and
 * a `render`, and a row may be an array of cells or the record itself.
 *
 * `rowHref` and `onRowClick` are the other half of that. Prod's rows all navigate, so the
 * pointer cursor measured as unconditional; a list that goes nowhere must not claim otherwise.
 * A linked row is a real anchor, so middle-click and copy-address work.
 */
export function Table<Row = any>({
  columns = [], rows = [], rowKey, rowTestId, rowHref, onRowClick, disabledRowIds = [],
  /* §34 — three forms prod has and blue never exposed.

     `busy` dims the rows and sets `aria-busy` **together**, so a filterable list gets one
     treatment instead of each screen dimming its own body and forgetting the announcement. The
     rows stay: a table that collapsed and re-expanded on every keystroke would reflow the page
     under the reader for no information at all. The header does not dim — it did not change.

     `hideHeader` is for a short grouped list whose columns are self-evident and whose name is
     already above it. Prod's own tables all carry headers, because prod's own tables are all one
     list of one thing.

     `footer` is the infinite-scroll load-more row, which prod renders *inside* the table
     (`.loadNextTableIndicator`, centred) rather than as a control beneath it. */
  busy, hideHeader, footer,
  style, ...rest
}: TableProps<Row>) {
  const cols = columns.map((col) => (typeof col === 'string' ? { label: col } : col));
  /* A string `rowHref` or `rowTestId` applies to every row; a function reads the row. `rowKey`
     is the exception — a string there names the field to read, because "the same key on every
     row" is the one thing a key can never mean. */
  const value = (key: any, row: any) => (typeof key === 'function' ? key(row) : key);
  const keyOf = (row: any, ri: number) => {
    if (typeof rowKey === 'function') return rowKey(row);
    if (rowKey && !Array.isArray(row) && row[rowKey] != null) return row[rowKey];
    return ri;
  };
  return (
    <div {...rest} aria-busy={busy || undefined} style={{ width: '100%', color: 'var(--text-primary)', fontFamily: 'var(--font-family-base)', ...style }}>
      {!hideHeader && (
        <div style={{ display: 'flex', width: '100%', height: 70, padding: '0 16px', backgroundColor: 'var(--surface-sunken)', borderBottom: '1px solid var(--color-gray-lighter)', position: 'sticky', top: 0, zIndex: 1 }}>
          {cols.map((col, i) => (
            <div key={i} style={{ ...geometry(col, i, cols.length), fontWeight: 'var(--font-weight-semibold)', fontSize: 16, lineHeight: '24px' }}>
              {/* §48 — the label truncates, as every body cell already did. The cell is a flex
                  box, so `text-overflow` has to sit on the child rather than on the cell: an
                  anonymous flex item is not a line box and never ellipsises. Without this a
                  header narrower than its own word paints straight over its neighbour, which
                  is the one place blue's table had no clipping at all. */}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {col.label}
              </span>
            </div>
          ))}
        </div>
      )}
      {(rows as any[]).map((row, ri) => {
        const disabled = disabledRowIds.includes(ri);
        const href = disabled ? undefined : value(rowHref, row);
        const clickable = !disabled && (href || onRowClick);
        const Row: React.ElementType = href ? 'a' : 'div';
        const cells = Array.isArray(row) ? row : cols.map((col) => (col.render ? col.render(row) : row[col.key as string]));
        return (
          <Row
            key={keyOf(row, ri)}
            href={href || undefined}
            data-testid={value(rowTestId, row)}
            onClick={onRowClick && !disabled ? (e: React.MouseEvent) => onRowClick(row, e) : undefined}
            style={{
              /* §48 — `minHeight`, where prod measured a flat `height: 70`. Every row prod has
                 holds one line per cell, so the two are identical there and blue's 70px is
                 untouched. A cell of ours can hold two — a title over its category chips, a
                 name over an email — and a fixed height does not contain that content, it lets
                 it paint over the row beneath. The row grows instead. */
              /* The 8px is only ever visible on a row that has grown: `box-sizing: border-box`
                 means a one-line row is still exactly 70px, padding included. Without it a
                 wrapped cell sits flush against both borders. */
              display: 'flex', width: '100%', minHeight: 70, padding: '8px 16px', alignItems: 'center',
              borderBottom: '1px solid var(--color-gray-lighter)', backgroundColor: disabled ? 'var(--surface-disabled)' : '#fff',
              filter: disabled ? 'grayscale(1)' : 'none',
              /* §34 — a busy row is still a row: dimmed, still readable, still clickable. Only
                 `disabled` takes the heavier grayscale, because that one is not coming back. */
              opacity: disabled ? 0.6 : busy ? 0.55 : 1,
              transition: 'opacity var(--duration-fast) var(--ease-standard)',
              cursor: disabled ? 'default' : clickable ? 'pointer' : 'default',
              color: 'var(--text-primary)', textDecoration: 'none',
              /* .disabledRow also blocks interaction, hover included */
              pointerEvents: disabled ? 'none' : undefined,
            }}
            onMouseEnter={(e: React.MouseEvent<HTMLElement>) => { if (!disabled) e.currentTarget.style.backgroundColor = 'var(--color-row-hover)'; }}
            onMouseLeave={(e: React.MouseEvent<HTMLElement>) => { if (!disabled) e.currentTarget.style.backgroundColor = '#fff'; }}
          >
            {cells.map((cell: React.ReactNode, ci: number) => (
              <div key={ci} style={{ ...geometry(cols[ci] || {}, ci, cols.length), fontSize: 14, overflow: ci === cols.length - 1 ? 'visible' : 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {cell}
              </div>
            ))}
          </Row>
        );
      })}
      {footer && (
        /* Inside the table, not beneath it: prod's infinite-scroll tables put the next-page
           indicator in the row position the next page will occupy, which is what makes its
           arrival replace it rather than push it. */
        <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)' }}>
          {footer}
        </div>
      )}
    </div>
  );
}
