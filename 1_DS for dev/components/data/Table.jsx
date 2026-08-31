import React from 'react';

/* Blue's positional rule: the first column reads left, the last reads right and is capped at
   80px for the actions it holds in prod, everything between is centred. A column that says
   otherwise says so itself. */
function geometry(col, i, count) {
  const last = i === count - 1;
  return {
    flex: col.flex != null ? `${col.flex} 1 0` : '1 1',
    display: 'flex', alignItems: 'center', paddingLeft: 12, minWidth: 0,
    justifyContent: col.align || (i === 0 ? 'flex-start' : last ? 'flex-end' : 'center'),
    maxWidth: col.maxWidth != null ? col.maxWidth : (last ? 80 : 'none'),
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
export function Table({
  columns = [], rows = [], rowKey, rowTestId, rowHref, onRowClick, disabledRowIds = [], style, ...rest
}) {
  const cols = columns.map((col) => (typeof col === 'string' ? { label: col } : col));
  /* A string `rowHref` or `rowTestId` applies to every row; a function reads the row. `rowKey`
     is the exception — a string there names the field to read, because "the same key on every
     row" is the one thing a key can never mean. */
  const value = (key, row) => (typeof key === 'function' ? key(row) : key);
  const keyOf = (row, ri) => {
    if (typeof rowKey === 'function') return rowKey(row);
    if (rowKey && !Array.isArray(row) && row[rowKey] != null) return row[rowKey];
    return ri;
  };
  return (
    <div {...rest} style={{ width: '100%', color: 'var(--text-primary)', fontFamily: 'var(--font-family-base)', ...style }}>
      <div style={{ display: 'flex', width: '100%', height: 70, padding: '0 16px', backgroundColor: 'var(--surface-sunken)', borderBottom: '1px solid var(--color-gray-lighter)', position: 'sticky', top: 0, zIndex: 1 }}>
        {cols.map((col, i) => (
          <div key={i} style={{ ...geometry(col, i, cols.length), fontWeight: 'var(--font-weight-semibold)', fontSize: 16, lineHeight: '24px' }}>
            {col.label}
          </div>
        ))}
      </div>
      {rows.map((row, ri) => {
        const disabled = disabledRowIds.includes(ri);
        const href = disabled ? undefined : value(rowHref, row);
        const clickable = !disabled && (href || onRowClick);
        const Row = href ? 'a' : 'div';
        const cells = Array.isArray(row) ? row : cols.map((col) => (col.render ? col.render(row) : row[col.key]));
        return (
          <Row
            key={keyOf(row, ri)}
            href={href || undefined}
            data-testid={value(rowTestId, row)}
            onClick={onRowClick && !disabled ? (e) => onRowClick(row, e) : undefined}
            style={{
              display: 'flex', width: '100%', height: 70, padding: '0 16px', alignItems: 'center',
              borderBottom: '1px solid var(--color-gray-lighter)', backgroundColor: disabled ? 'var(--surface-disabled)' : '#fff',
              filter: disabled ? 'grayscale(1)' : 'none', opacity: disabled ? 0.6 : 1,
              cursor: disabled ? 'default' : clickable ? 'pointer' : 'default',
              color: 'var(--text-primary)', textDecoration: 'none',
              /* .disabledRow also blocks interaction, hover included */
              pointerEvents: disabled ? 'none' : undefined,
            }}
            onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = 'var(--color-row-hover)'; }}
            onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = '#fff'; }}
          >
            {cells.map((cell, ci) => (
              <div key={ci} style={{ ...geometry(cols[ci] || {}, ci, cols.length), fontSize: 14, overflow: ci === cols.length - 1 ? 'visible' : 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {cell}
              </div>
            ))}
          </Row>
        );
      })}
    </div>
  );
}
