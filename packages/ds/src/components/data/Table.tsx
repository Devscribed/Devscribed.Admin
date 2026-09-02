import React from 'react';

export interface TableColumn<Row = any> {
  label: React.ReactNode;
  /** Field to read when no `render` is given and rows are records. */
  key?: keyof Row;
  render?: (row: Row) => React.ReactNode;
  /** Flex ratio. Defaults to an equal share, as in source. */
  flex?: number;
  /** Defaults to the positional rule: first left, last right, everything between centred. */
  align?: 'flex-start' | 'center' | 'flex-end';
  /** Defaults to 96 on the last column — the actions column, §60 — and none elsewhere. */
  maxWidth?: number | 'none';
}

export interface TableProps<Row = any> extends Omit<React.HTMLAttributes<HTMLDivElement>, 'rows'> {
  /** A string is just a heading; an object carries alignment, width and a renderer. */
  columns?: (string | TableColumn<Row>)[];
  /** Arrays of cells, or the records themselves when the columns say how to read them. */
  rows?: Row[] | React.ReactNode[][];
  /** A string names the field to read; a function reads the row. Falls back to the index. */
  rowKey?: string | ((row: Row) => string | number);
  /** `data-testid` per row — a function so it can carry the row's own id. */
  rowTestId?: string | ((row: Row) => string | undefined);
  /** Turns each row into a real anchor. A string applies to every row. */
  rowHref?: string | ((row: Row) => string | null | undefined);
  onRowClick?: (row: Row, event: React.MouseEvent) => void;
  /** Row indices to render grayscale and unclickable — a removed member, an archived record. */
  disabledRowIds?: number[];
  /** §34 — dims the rows and sets `aria-busy` together, for a list being refiltered in place.
   *  The rows stay and stay clickable; only the header is left alone, because it did not change. */
  busy?: boolean;
  /** §34 — drops the header row, for a short grouped list already named by the surface it sits in. */
  hideHeader?: boolean;
  /** §34 — a node in the row position after the last row, centred: the load-more indicator,
   *  which belongs inside the table rather than as a control beneath it. */
  footer?: React.ReactNode;
}

/* The positional rule: the first column reads left, the last reads right and is capped for the
   actions it holds, everything between is centred. A column that wants otherwise says so itself.

   §60 — the cap is 96. A column holding a 32px kebab needs only 80, but the heading over it is
   a real 16px semibold word, and `Actions` is 62px of it: at 80px, minus 12px of padding on each
   side, every list screen drew `Actio…`. 96 is the first step that fits the word. It is also
   the one column whose width nothing else depends on — every other column's flex share is
   unchanged, because this one was already at its cap and still is. */
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
 * Table — a sticky recessed header over 70px rows, with a hover tint and optional
 * grayscale rows.
 *
 * §18 — it takes records, not cells. A `string[]` of headings over a `ReactNode[][]` of cells
 * is what a hand-written demo passes; a screen with real rows needs to say how a column is
 * read, which row a `data-testid` belongs to and where a row goes. Both shapes work — a column
 * may be a string or an object carrying `label`, alignment and a `render`, and a row may be an
 * array of cells or the record itself.
 *
 * `rowHref` and `onRowClick` are the other half. A linked row is a real anchor, so middle-click
 * and copy-address work, and the pointer cursor is conditional: a list that goes nowhere must
 * not claim otherwise.
 */
export function Table<Row = any>({
  columns = [], rows = [], rowKey, rowTestId, rowHref, onRowClick, disabledRowIds = [],
  /* §34 — three states a list has that a static table does not.

     `busy` dims the rows and sets `aria-busy` **together**, so a filterable list gets one
     treatment instead of each screen dimming its own body and forgetting the announcement. The
     rows stay: a table that collapsed and re-expanded on every keystroke would reflow the page
     under the reader for no information at all. The header does not dim — it did not change.

     `hideHeader` is for a short grouped list whose columns are self-evident and whose name is
     already above it. A table that is the only list on its page keeps its header.

     `footer` is the load-more row, drawn *inside* the table rather than as a control beneath
     it — see the note where it renders. */
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
              {/* §48 — the heading truncates, as every body cell already does. The cell is a
                  flex box, so `text-overflow` has to sit on the child rather than on the cell:
                  an anonymous flex item is not a line box and never ellipsises. Without this a
                  heading narrower than its own word paints straight over its neighbour. */}
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
              /* §48 — `minHeight`, not a flat height. A cell may hold two lines — a title over
                 its category chips, a name over an email — and a fixed height does not contain
                 that content, it lets it paint over the row beneath. The row grows instead, and
                 a one-line row is still exactly 70px. */
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
              /* A disabled row is not hoverable either: the tint would promise a click. */
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
        /* Inside the table, not beneath it: the indicator sits in the row position the next
           page will occupy, which is what makes its arrival replace it rather than push it. */
        <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)' }}>
          {footer}
        </div>
      )}
    </div>
  );
}
