import React from 'react';
import { BREAKPOINTS } from '../../breakpoints';
import { useBreakpoint } from '../../useViewport';
import { Card } from '../core/Card';
import { RecordCard, type RecordFact } from './RecordCard';
import { Table, rowKeyOf, rowValue, type TableColumn, type TableProps } from './Table';

/** Which slot of a `RecordCard` a column fills. Unmarked is a fact. */
export type RecordRole = 'title' | 'subtitle' | 'badges' | 'status' | 'actions';

export interface RecordColumn<Row = any> extends TableColumn<Row> {
  /**
   * §98 — the card slot this column fills. Unmarked ⇒ a fact, drawn under its own `label`.
   * `Table` never reads it.
   */
  role?: RecordRole;
  /**
   * §98 — slot-shaped content, where the column's own `render` is cell-shaped. A cell may hold
   * several things a card puts in different places; this is how the card gets its half without
   * the table losing its own.
   *
   * Falls back to `render`, and then to `key`, so a column whose cell is already slot-shaped
   * says nothing.
   */
  renderCard?: (row: Row) => React.ReactNode;
  /**
   * §98 — a column the **card** draws and the table does not, because the table folds its value
   * into another cell: the vacancies list's category chips, which live on a second line inside
   * the title cell and have no column of their own. `RecordList` removes it before `Table` is
   * ever handed the columns.
   */
  cardOnly?: boolean;
}

export interface RecordListProps<Row = any> extends Omit<TableProps<Row>, 'columns'> {
  columns?: RecordColumn<Row>[];
  /**
   * `clip` for the `Card` the table form is drawn in. Default true, which is what rounds the
   * table's first and last rows; the card form draws no surface of its own, so it ignores this.
   */
  clip?: boolean;
}

/** The rung below which a row is a card. Derived, so it cannot drift from the ladder. */
const CARD_BELOW = BREAKPOINTS.md;

/**
 * RecordList — §98. The only object that knows a list has two forms.
 *
 * ```
 * RecordList ──▶ Table          Table never imports RecordCard
 *           └──▶ RecordCard     RecordCard never imports Table
 * ```
 *
 * Above `md` it draws §18's `Table` inside a `Card padded={false}`; below `md`, a column of
 * `RecordCard`s (§97). **It is a JavaScript branch and not a CSS one**, because a row's
 * `data-testid` has to sit on exactly one node at every width and drawing both forms behind a
 * `display: none` would put it on two.
 *
 * That branch is safe against hydration for two reasons together, and it needs both: it reads
 * the pre-paint stamp (`01-responsive` §02), and every list that uses it renders a `Preloader`
 * until its own client fetch resolves, so the server never emits either form. The viewport
 * decides and never a container (§01.1) — there is no `ResizeObserver` here and no width but the
 * window's.
 *
 * **Opt-in is by import, not by a prop.** The lists that want cards call this; the six lists
 * outside hiring keep calling `Table` and receive nothing new at render time.
 */
export function RecordList<Row = any>({
  columns = [], rows = [], rowKey, rowTestId, rowHref, onRowClick, disabledRowIds = [],
  busy, hideHeader, footer, clip, style, className, ...rest
}: RecordListProps<Row>) {
  const cards = BREAKPOINTS[useBreakpoint()] < CARD_BELOW;

  if (!cards) {
    /* The card form draws no surface, so the table's own one is drawn here rather than by the
       screen — a caller that wrapped this in a `Card` would be a caller that knows there are two
       forms, which is the one thing this component exists to prevent. */
    return (
      <Card padded={false} clip={clip} style={style} className={className} {...rest}>
        <Table<Row>
          columns={columns.filter((col) => !col.cardOnly).map(forTable)}
          rows={rows}
          rowKey={rowKey}
          rowTestId={rowTestId}
          rowHref={rowHref}
          onRowClick={onRowClick}
          disabledRowIds={disabledRowIds}
          busy={busy}
          hideHeader={hideHeader}
          footer={footer}
        />
      </Card>
    );
  }

  return (
    <div
      {...rest}
      className={['ds-record-list', className].filter(Boolean).join(' ')}
      /* §34 — where `Table` puts it, one form over. The cards dim individually; the list is what
         is busy. */
      aria-busy={busy || undefined}
      style={style}
    >
      {(rows as any[]).map((row, ri) => {
        const disabled = disabledRowIds.includes(ri);
        const href = disabled ? undefined : rowValue(rowHref, row);
        return (
          <RecordCard
            key={rowKeyOf(rowKey, row, ri)}
            data-testid={rowValue(rowTestId, row)}
            href={href || undefined}
            disabled={disabled}
            busy={busy}
            onClick={onRowClick && !disabled ? (e: React.MouseEvent) => onRowClick(row, e) : undefined}
            status={slot(columns, 'status', row)}
            actions={slot(columns, 'actions', row)}
            title={slot(columns, 'title', row)}
            subtitle={slot(columns, 'subtitle', row)}
            badges={slot(columns, 'badges', row)}
            facts={facts(columns, row)}
          />
        );
      })}
      {footer && (
        /* In the row position the next page will occupy, exactly as the table draws it — which
           is what makes its arrival replace it rather than push it. */
        <div className="ds-record-list-footer">{footer}</div>
      )}
    </div>
  );
}

/**
 * The column as `Table` should see it: the three card words removed, and `hideBelow` dropped
 * from the status column.
 *
 * §96 enforces two thirds of the floor — the first column and the last — and cannot enforce the
 * third, because a status is a card role and `Table` has never been able to see one. This is
 * where that gap closes.
 */
function forTable<Row>(col: RecordColumn<Row>): TableColumn<Row> {
  const { role, renderCard, cardOnly, ...rest } = col;
  if (role !== 'status') return rest;
  const { hideBelow, ...withoutHideBelow } = rest;
  return withoutHideBelow;
}

/** A column's content, slot-shaped: `renderCard`, then `render`, then the field. */
function read<Row>(col: RecordColumn<Row>, row: Row): React.ReactNode {
  if (col.renderCard) return col.renderCard(row);
  if (col.render) return col.render(row);
  return col.key == null ? null : ((row as any)[col.key] as React.ReactNode);
}

function slot<Row>(columns: RecordColumn<Row>[], role: RecordRole, row: Row): React.ReactNode {
  const col = columns.find((entry) => entry.role === role);
  return col ? read(col, row) : undefined;
}

/**
 * Every unmarked column, in the order it was declared, under the heading it had in the table.
 *
 * A fact whose value is `null` or `undefined` is dropped rather than drawn as a label over
 * nothing — but `0` is a value, and a candidate count of zero is exactly the fact somebody is
 * reading the card for.
 */
function facts<Row>(columns: RecordColumn<Row>[], row: Row): RecordFact[] {
  return columns
    .filter((col) => !col.role)
    .map((col) => ({ label: col.label, value: read(col, row) }))
    .filter((fact) => fact.value != null);
}
